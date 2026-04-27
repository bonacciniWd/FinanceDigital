/**
 * Edge Function: cron-saidas-orfas
 *
 * Execução diária — varre Pix Enviados (EFI) das últimas 48h e classifica:
 *   1. Match com empréstimo aprovado (chave PIX + valor) → marca desembolsado=true
 *   2. Match com termo de uma `categorias_gastos` → grava em `gastos_internos`
 *   3. Sem match → grava em `saidas_orfas` como pendente (UI faz vínculo manual)
 *
 * Deduplicação: e2e_id (UNIQUE em ambas as tabelas finais)
 *
 * Invocação:
 *   - pg_cron diário (recomendado a cada 6h ou 1x/dia)
 *   - POST manual com Authorization: Bearer <SERVICE_ROLE>
 *
 * Deploy: supabase functions deploy cron-saidas-orfas --no-verify-jwt
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

interface EfiCreds {
  clientId: string;
  clientSecret: string;
  certPem: string;
  keyPem: string;
  sandbox: boolean;
  baseUrl: string;
}

let _efiToken: { token: string; expiresAt: number } | null = null;
let _efiHttpClient: Deno.HttpClient | null = null;

function getEfiHttpClient(creds: EfiCreds): Deno.HttpClient {
  if (_efiHttpClient) return _efiHttpClient;
  _efiHttpClient = Deno.createHttpClient({ cert: creds.certPem, key: creds.keyPem });
  return _efiHttpClient;
}

async function getEfiToken(creds: EfiCreds): Promise<string> {
  if (_efiToken && Date.now() < _efiToken.expiresAt) return _efiToken.token;
  const credentials = btoa(`${creds.clientId}:${creds.clientSecret}`);
  const client = getEfiHttpClient(creds);
  const resp = await fetch(`${creds.baseUrl}/oauth/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials" }),
    // @ts-ignore — Deno mTLS
    client,
  });
  if (!resp.ok) throw new Error(`EFI Auth error: ${await resp.text()}`);
  const data = await resp.json();
  _efiToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return _efiToken.token;
}

async function efiGet(creds: EfiCreds, path: string) {
  const token = await getEfiToken(creds);
  const client = getEfiHttpClient(creds);
  const resp = await fetch(`${creds.baseUrl}${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    // @ts-ignore — Deno mTLS
    client,
  });
  const text = await resp.text();
  const data = text ? JSON.parse(text) : {};
  if (!resp.ok) throw new Error(data?.mensagem || data?.message || `EFI error ${resp.status}`);
  return data;
}

// Normaliza chave PIX para comparação robusta (espelha lógica do frontend)
function normalizePixKey(k: string | null | undefined): string {
  if (!k) return "";
  const trimmed = String(k).trim().toLowerCase();
  if (trimmed.includes("@")) return trimmed;
  return trimmed.replace(/[^a-z0-9]/g, "");
}

interface PixEnviado {
  endToEndId?: string;
  idEnvio?: string;
  valor?: string;
  horario?: { solicitacao?: string; liquidacao?: string } | string;
  status?: string;
  favorecido?: {
    chave?: string;
    nome?: string;
    identificacao?: { nome?: string; cpf?: string; cnpj?: string };
  };
}

function extractDate(h: PixEnviado["horario"]): string {
  if (!h) return "";
  if (typeof h === "string") return h;
  return h.solicitacao || h.liquidacao || "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Janela: últimas 48h por padrão (overlap p/ não perder nada). Aceita ?hours=N
  const url = new URL(req.url);
  const hours = Number(url.searchParams.get("hours") || "48");
  const fim = new Date();
  const inicio = new Date(fim.getTime() - hours * 3600 * 1000);

  const stats = {
    fetched: 0,
    desembolso_auto: 0,
    gasto_auto: 0,
    orfas_inseridas: 0,
    skipped_dedup: 0,
    errors: [] as string[],
  };

  // ── Carregar credenciais EFI ─────
  let efiCreds: EfiCreds;
  try {
    const { data: gw } = await adminClient
      .from("gateways_pagamento")
      .select("config")
      .eq("nome", "efi")
      .eq("ativo", true)
      .single();

    if (!gw?.config) throw new Error("Gateway EFI não configurado");
    const cfg = gw.config as Record<string, unknown>;
    const sandbox = cfg.sandbox === true;
    efiCreds = {
      clientId: (cfg.client_id as string) || "",
      clientSecret: (cfg.client_secret as string) || "",
      certPem: (cfg.cert_pem as string) || "",
      keyPem: (cfg.key_pem as string) || "",
      sandbox,
      baseUrl: sandbox ? "https://pix-h.api.efipay.com.br" : "https://pix.api.efipay.com.br",
    };
    if (!efiCreds.clientId || !efiCreds.certPem) {
      throw new Error("Credenciais EFI incompletas");
    }
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ── Buscar Pix Enviados ─────
  let pixList: PixEnviado[] = [];
  try {
    const inicioISO = inicio.toISOString().replace(/\.\d{3}Z$/, "Z");
    const fimISO = fim.toISOString().replace(/\.\d{3}Z$/, "Z");
    const path = `/v2/gn/pix/enviados?inicio=${encodeURIComponent(inicioISO)}&fim=${encodeURIComponent(fimISO)}`;
    const data = await efiGet(efiCreds, path);
    pixList = (data?.pix || []) as PixEnviado[];
    stats.fetched = pixList.length;
    console.log(`[cron-saidas-orfas] ${pixList.length} Pix enviados na janela ${hours}h`);
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: `EFI fetch: ${(e as Error).message}` }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ── Pré-carregar dados auxiliares ─────
  const [
    { data: emprestimosRaw },
    { data: clientes },
    { data: analises },
    { data: categorias },
  ] = await Promise.all([
    adminClient
      .from("emprestimos")
      .select("id, cliente_id, valor, desembolsado, analise_id, status")
      .in("status", ["ativo", "inadimplente", "aprovado", "aguardando_desembolso"]),
    adminClient.from("clientes").select("id, pix_key"),
    adminClient.from("analises").select("id, status"),
    adminClient.from("categorias_gastos").select("id, nome, termo").eq("ativo", true),
  ]);

  const clientePixById = new Map<string, string>();
  for (const c of clientes || []) {
    if (c.pix_key) clientePixById.set(c.id, normalizePixKey(c.pix_key));
  }
  const analiseAprovada = new Set(
    (analises || []).filter((a) => a.status === "aprovado").map((a) => a.id)
  );
  // Apenas empréstimos aprovados e ainda não desembolsados são candidatos a auto-vínculo
  const candidatosEmprestimo = (emprestimosRaw || [])
    .filter((e) => e.analise_id && analiseAprovada.has(e.analise_id) && e.desembolsado !== true)
    .map((e) => ({
      id: e.id,
      valor: Number(e.valor),
      pixKey: clientePixById.get(e.cliente_id) || "",
    }))
    .filter((e) => e.pixKey);

  // ── Processar cada saída ─────
  const usadosEmprestimo = new Set<string>();
  for (const p of pixList) {
    const e2e = p.endToEndId || p.idEnvio || "";
    if (!e2e) {
      stats.errors.push("Pix sem endToEndId, ignorado");
      continue;
    }

    // Dedup: se já existe em gastos_internos OU saidas_orfas, pula
    const [{ data: existingGasto }, { data: existingOrfa }] = await Promise.all([
      adminClient.from("gastos_internos").select("id").eq("e2e_id", e2e).maybeSingle(),
      adminClient.from("saidas_orfas").select("id, status").eq("e2e_id", e2e).maybeSingle(),
    ]);
    if (existingGasto || existingOrfa) {
      stats.skipped_dedup++;
      continue;
    }

    const valor = parseFloat(p.valor || "0");
    const horario = extractDate(p.horario) || new Date().toISOString();
    const chave = p.favorecido?.chave || "";
    const chaveNorm = normalizePixKey(chave);
    const nome = p.favorecido?.identificacao?.nome || p.favorecido?.nome || "";
    const cpfCnpj = p.favorecido?.identificacao?.cpf || p.favorecido?.identificacao?.cnpj || "";

    // 1) Tentar match com empréstimo (chave + valor com tolerância R$0,01)
    const matchEmp = candidatosEmprestimo.find(
      (c) =>
        !usadosEmprestimo.has(c.id) &&
        c.pixKey === chaveNorm &&
        Math.abs(c.valor - valor) < 0.01
    );
    if (matchEmp) {
      usadosEmprestimo.add(matchEmp.id);
      const { error: updErr } = await adminClient
        .from("emprestimos")
        .update({
          desembolsado: true,
          desembolsado_em: horario,
        })
        .eq("id", matchEmp.id)
        .neq("desembolsado", true);
      if (updErr) {
        stats.errors.push(`emprestimo ${matchEmp.id}: ${updErr.message}`);
      } else {
        stats.desembolso_auto++;
      }
      continue;
    }

    // 2) Tentar match com termo de categoria_gasto (ILIKE substring)
    const haystack = `${nome} ${chave}`.toLowerCase();
    const matchCat = (categorias || []).find((c) => {
      const termo = (c.termo || "").trim().toLowerCase();
      return termo && haystack.includes(termo);
    });
    if (matchCat) {
      const { error: insErr } = await adminClient.from("gastos_internos").insert({
        categoria_id: matchCat.id,
        e2e_id: e2e,
        valor,
        horario,
        chave_favorecido: chave,
        nome_favorecido: nome,
        descricao: matchCat.nome,
        gateway: "efi",
        raw_payload: p,
        match_origem: "auto",
      });
      if (insErr && !String(insErr.message).includes("duplicate")) {
        stats.errors.push(`gasto ${e2e}: ${insErr.message}`);
      } else {
        stats.gasto_auto++;
      }
      continue;
    }

    // 3) Sem match — calcular candidatos prováveis de empréstimo (mesma chave OU |Δvalor|≤R$10)
    const candidatosOrfa = candidatosEmprestimo
      .filter((c) => c.pixKey === chaveNorm || Math.abs(c.valor - valor) <= 10)
      .map((c) => ({ emprestimo_id: c.id, valor: c.valor, mesma_chave: c.pixKey === chaveNorm }))
      .slice(0, 10);

    const { error: orfaErr } = await adminClient.from("saidas_orfas").insert({
      e2e_id: e2e,
      id_envio: p.idEnvio || null,
      valor,
      horario,
      chave_favorecido: chave,
      nome_favorecido: nome,
      cpf_cnpj_favorecido: cpfCnpj,
      gateway: "efi",
      raw_payload: p,
      candidatas_emprestimo: candidatosOrfa.length > 0 ? candidatosOrfa : null,
      status: "pendente",
    });
    if (orfaErr && !String(orfaErr.message).includes("duplicate")) {
      stats.errors.push(`orfa ${e2e}: ${orfaErr.message}`);
    } else {
      stats.orfas_inseridas++;
    }
  }

  console.log("[cron-saidas-orfas] resultado:", stats);

  return new Response(
    JSON.stringify({ success: true, ...stats, janela_horas: hours }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
