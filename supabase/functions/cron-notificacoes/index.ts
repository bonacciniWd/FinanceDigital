/**
 * Edge Function: cron-notificacoes
 *
 * Execução diária — verifica parcelas, cria cobranças PIX (cobv) e envia alertas via WhatsApp:
 *   1. Parcela vencendo em 3 dias → cria cobrança PIX com vencimento (cobv) + envia QR code
 *   2. Parcela vencendo amanhã → reenvia lembrete com QR code da cobrança existente
 *   3. Parcela que venceu ontem (não paga) → cobrança com aviso de multa/juros
 *   4. Parcelas em atraso (3, 7, 15, 30 dias) → cobranças por tier
 *
 * Integração automática com EFI Bank (Gerencianet):
 *   - Cria cobranças com vencimento (/v2/cobv) com multa e juros configurados
 *   - Gera QR Code e PIX copia-e-cola para cada parcela
 *   - Envia QR Code como imagem no WhatsApp
 *   - Webhook-efi processa pagamento e atualiza parcela automaticamente
 *
 * Invocação:
 *   - Via pg_cron: SELECT net.http_post(url, ...) diariamente
 *   - Via cURL/fetch manual: POST com header Authorization
 *   - Via Supabase Dashboard > Cron
 *
 * Deploy: supabase functions deploy cron-notificacoes --no-verify-jwt
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// ── EFI mTLS helper ─────────────────────────────────────────
interface EfiCreds {
  clientId: string;
  clientSecret: string;
  pixKey: string;
  certPem: string;
  keyPem: string;
  sandbox: boolean;
  baseUrl: string;
  multaPerc: number;   // ex: 2.00 (2%)
  jurosPerc: number;   // ex: 1.00 (1% ao mês)
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

async function efiRequest(creds: EfiCreds, method: string, path: string, body?: Record<string, unknown>) {
  const token = await getEfiToken(creds);
  const client = getEfiHttpClient(creds);
  const resp = await fetch(`${creds.baseUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    // @ts-ignore — Deno mTLS
    client,
  });
  const text = await resp.text();
  const data = text ? JSON.parse(text) : {};
  if (!resp.ok) throw new Error(data?.mensagem || data?.message || `EFI error ${resp.status}`);
  return data;
}

/**
 * Criar cobrança com vencimento (cobv) na EFI + salvar no banco + gerar QR code.
 * Retorna { txid, brCode, qrCodeImage, locId } ou null em caso de erro.
 */
async function criarCobrancaEfi(
  adminClient: ReturnType<typeof createClient>,
  creds: EfiCreds,
  parcela: any,
  clienteNome: string,
  clienteCpf: string | null,
) {
  try {
    const txid = crypto.randomUUID().replace(/-/g, "").substring(0, 35);
    const valor = Number(parcela.valor);

    const payload: Record<string, unknown> = {
      calendario: {
        dataDeVencimento: parcela.data_vencimento,
        validadeAposVencimento: 30, // pode pagar até 30 dias após vencimento
      },
      valor: {
        original: valor.toFixed(2),
        multa: { modalidade: 2, valorPerc: String(creds.multaPerc.toFixed(2)) },
        juros: { modalidade: 2, valorPerc: String(creds.jurosPerc.toFixed(2)) },
      },
      chave: creds.pixKey,
      solicitacaoPagador: `Parcela ${parcela.numero} - Casa da Moeda`.substring(0, 140),
    };

    // Devedor (CPF obrigatório para cobv)
    if (clienteCpf) {
      const cpfLimpo = clienteCpf.replace(/\D/g, "");
      if (cpfLimpo.length === 11) {
        payload.devedor = { cpf: cpfLimpo, nome: clienteNome };
      } else if (cpfLimpo.length === 14) {
        payload.devedor = { cnpj: cpfLimpo, nome: clienteNome };
      }
    }

    console.log(`[cron-cobr] Criando cobv txid=${txid}, parcela=${parcela.id}, valor=${valor.toFixed(2)}, venc=${parcela.data_vencimento}`);
    const cobvResp = await efiRequest(creds, "PUT", `/v2/cobv/${txid}`, payload);

    // Gerar QR Code
    let qrCodeImage: string | null = null;
    let brCode: string | null = null;
    try {
      if (cobvResp.loc?.id) {
        const qr = await efiRequest(creds, "GET", `/v2/loc/${cobvResp.loc.id}/qrcode`);
        qrCodeImage = qr.imagemQrcode || null;  // base64 data URI
        brCode = qr.qrcode || null;              // pix copia-e-cola string
      }
    } catch (qrErr) {
      console.warn(`[cron-cobr] QR code falhou para txid=${txid}:`, qrErr instanceof Error ? qrErr.message : qrErr);
    }

    // Salvar cobrança no banco
    const { error: saveErr } = await adminClient
      .from("woovi_charges")
      .insert({
        parcela_id: parcela.id,
        emprestimo_id: parcela.emprestimo_id,
        cliente_id: parcela.cliente_id,
        woovi_charge_id: txid,
        woovi_txid: txid,
        valor,
        status: "ACTIVE",
        br_code: brCode,
        qr_code_image: qrCodeImage,
        payment_link: cobvResp.location || null,
        expiration_date: parcela.data_vencimento,
        gateway: "efi",
      });

    if (saveErr) {
      console.error(`[cron-cobr] Erro ao salvar cobrança: ${saveErr.message}`);
      return null;
    }

    // Vincular na parcela
    await adminClient.from("parcelas").update({ woovi_charge_id: txid }).eq("id", parcela.id);

    console.log(`[cron-cobr] Cobrança criada: txid=${txid}, brCode=${brCode ? "SIM" : "NÃO"}, qr=${qrCodeImage ? "SIM" : "NÃO"}`);
    return { txid, brCode, qrCodeImage };
  } catch (err) {
    console.error(`[cron-cobr] Erro ao criar cobrança para parcela ${parcela.id}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Buscar cobrança existente para uma parcela (da tabela woovi_charges).
 */
async function buscarCobrancaExistente(
  adminClient: ReturnType<typeof createClient>,
  parcelaId: string,
) {
  const { data } = await adminClient
    .from("woovi_charges")
    .select("woovi_txid, br_code, qr_code_image, status")
    .eq("parcela_id", parcelaId)
    .eq("gateway", "efi")
    .neq("status", "EXPIRED")
    .neq("status", "ERROR")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Mantém os status sincronizados usando o mesmo cron já existente.
  try {
    const { data, error } = await adminClient.rpc("mark_parcelas_vencidas");
    if (error) throw error;
    console.log(`[cron] mark_parcelas_vencidas executado: ${data ?? 0} parcela(s) atualizada(s)`);
  } catch (syncErr) {
    console.warn("[cron] Não foi possível executar mark_parcelas_vencidas:", syncErr instanceof Error ? syncErr.message : syncErr);
  }

  // ── Carregar configurações do sistema ──────────────────
  let mensagensAtivas = true;
  let cobvAutoAtiva = true;
  try {
    const { data: cfgRows } = await adminClient
      .from("configuracoes_sistema")
      .select("chave, valor")
      .in("chave", ["mensagens_automaticas_ativas", "cobv_auto_ativa", "multa_percentual", "juros_percentual"]);

    const cfgMap: Record<string, unknown> = {};
    for (const r of cfgRows ?? []) cfgMap[r.chave] = r.valor;
    mensagensAtivas = cfgMap.mensagens_automaticas_ativas !== false;
    cobvAutoAtiva = cfgMap.cobv_auto_ativa !== false;
    console.log(`[cron] Config: mensagens=${mensagensAtivas}, cobv_auto=${cobvAutoAtiva}`);
  } catch { /* tabela pode não existir ainda */ }

  if (!mensagensAtivas) {
    console.log("[cron] Mensagens automáticas desativadas nas configurações do sistema.");
    return new Response(
      JSON.stringify({ success: true, message: "Mensagens automáticas desativadas", enviados: 0 }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ── Carregar credenciais EFI (se disponíveis) ─────────
  let efiCreds: EfiCreds | null = null;
  try {
    const { data: gw } = await adminClient
      .from("gateways_pagamento")
      .select("config")
      .eq("nome", "efi")
      .eq("ativo", true)
      .single();

    if (gw?.config) {
      const cfg = gw.config as Record<string, unknown>;
      const sandbox = cfg.sandbox === true;
      efiCreds = {
        clientId: (cfg.client_id as string) || "",
        clientSecret: (cfg.client_secret as string) || "",
        pixKey: (cfg.pix_key as string) || "",
        certPem: (cfg.cert_pem as string) || "",
        keyPem: (cfg.key_pem as string) || "",
        sandbox,
        baseUrl: sandbox ? "https://pix-h.api.efipay.com.br" : "https://pix.api.efipay.com.br",
        multaPerc: Number(cfg.multa_perc) || 2.00,
        jurosPerc: Number(cfg.juros_perc) || 1.00,
      };
      if (!efiCreds.clientId || !efiCreds.certPem) {
        console.warn("[cron] EFI configurada mas sem credenciais completas — cobranças desativadas");
        efiCreds = null;
      } else {
        console.log(`[cron] EFI carregada: ${sandbox ? "SANDBOX" : "PRODUÇÃO"}, chave=${efiCreds.pixKey}`);
      }
    }
  } catch (e) {
    console.warn("[cron] Gateway EFI não encontrado — cobranças automáticas desativadas");
  }

  // Se cobranças automáticas desativadas, limpar credenciais EFI
  if (!cobvAutoAtiva) {
    console.log("[cron] Cobranças PIX automáticas desativadas nas configurações.");
    efiCreds = null;
  }

  // ── Buscar instância sistema (ou primeira conectada) ──
  // Usa mesma lógica do approve-credit que funciona corretamente
  let instancia: any = null;
  {
    const { data: allInstancias, error: instErr } = await adminClient
      .from("whatsapp_instancias")
      .select("*");

    if (instErr || !allInstancias || allInstancias.length === 0) {
      console.error("[cron] Nenhuma instância cadastrada:", instErr?.message);
    } else {
      // Log all instances for debugging
      const statuses = allInstancias.map((i: any) => `${i.instance_name}: status=${i.status}, is_system=${i.is_system}`).join("; ");
      console.log(`[cron] Instâncias encontradas (${allInstancias.length}): ${statuses}`);

      // Tentar sistema primeiro, depois qualquer conectada
      instancia = allInstancias.find(
        (i: any) => i.is_system && ["conectado", "conectada", "open", "connected"].includes(i.status?.toLowerCase?.() || i.status)
      );
      if (!instancia) {
        console.warn("[cron] Instância sistema não conectada, tentando qualquer conectada...");
        instancia = allInstancias.find(
          (i: any) => ["conectado", "conectada", "open", "connected"].includes(i.status?.toLowerCase?.() || i.status)
        );
      }
    }
  }

  if (!instancia) {
    console.error("[cron] Nenhuma instância WhatsApp conectada encontrada");
    return new Response(
      JSON.stringify({ success: false, error: "Nenhuma instância WhatsApp conectada" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  console.log(`[cron] Usando instância: ${instancia.instance_name} (status: ${instancia.status})`);

  const envUrl = Deno.env.get("EVOLUTION_API_URL");
  const baseUrl = (envUrl || instancia.evolution_url || "").replace(/\/$/, "");
  if (!baseUrl || !instancia.instance_token) {
    console.error(`[cron] Instância sem config: baseUrl=${baseUrl ? "OK" : "VAZIO"}, token=${instancia.instance_token ? "OK" : "VAZIO"}`);
    return new Response(
      JSON.stringify({ success: false, error: "Instância sem URL ou token configurados" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ── Função auxiliar: enviar WhatsApp texto + log ────────────
  async function enviarMsg(
    telefone: string,
    mensagem: string,
    clienteId: string | null,
    tipo: string,
    parcelaId: string | null,
    emprestimoId: string | null,
  ) {
    let phone = telefone.replace(/@s\.whatsapp\.net/g, "").replace(/\D/g, "");
    if (phone.length <= 11) phone = "55" + phone;

    let ok = false;
    let erroDetalhe: string | null = null;

    try {
      const res = await fetch(`${baseUrl}/message/sendText/${instancia.instance_name}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: instancia.instance_token,
        },
        body: JSON.stringify({
          number: phone,
          textMessage: { text: mensagem },
          text: mensagem,
        }),
      });
      ok = res.ok;
      if (!ok) {
        const body = await res.text();
        erroDetalhe = body.slice(0, 500);
      }
    } catch (e: any) {
      erroDetalhe = e.message?.slice(0, 500) ?? "unknown error";
    }

    await adminClient.from("notificacoes_log").insert({
      parcela_id: parcelaId,
      emprestimo_id: emprestimoId,
      cliente_id: clienteId,
      tipo,
      telefone: phone,
      mensagem,
      status: ok ? "enviado" : "erro",
      erro_detalhe: erroDetalhe,
    });

    return ok;
  }

  // ── Função auxiliar: enviar imagem QR code via WhatsApp ────
  async function enviarQrCode(
    telefone: string,
    qrCodeBase64: string,
    caption: string,
  ) {
    let phone = telefone.replace(/@s\.whatsapp\.net/g, "").replace(/\D/g, "");
    if (phone.length <= 11) phone = "55" + phone;

    try {
      // Extrair base64 puro (sem prefixo data:...) + encoding: true
      // A Evolution API rejeita data URIs — aceita apenas base64 puro com encoding: true
      const rawBase64 = qrCodeBase64.replace(/^data:[^;]+;base64,/, "");

      const res = await fetch(`${baseUrl}/message/sendMedia/${instancia.instance_name}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: instancia.instance_token,
        },
        body: JSON.stringify({
          number: phone,
          mediaMessage: {
            mediatype: "image",
            media: rawBase64,
            caption,
            fileName: "qrcode-pix.png",
            encoding: true,
          },
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        console.warn(`[cron][QR] Falha ao enviar QR code: ${res.status} ${errText.substring(0, 200)}`);
      }
      return res.ok;
    } catch (e: any) {
      console.warn(`[cron][QR] Erro ao enviar QR code:`, e.message);
      return false;
    }
  }

  // ── Juros automáticos (mesma lógica de src/app/lib/juros.ts) ──
  const JUROS_FIXO_DIA = 100;
  const JUROS_PERC_DIA = 0.10;
  const JUROS_LIMIAR = 1000;

  function calcularJurosAtraso(valorOriginal: number, diasAtraso: number): number {
    if (diasAtraso <= 0 || valorOriginal <= 0) return 0;
    if (valorOriginal < JUROS_LIMIAR) return JUROS_FIXO_DIA * diasAtraso;
    return Math.round(valorOriginal * JUROS_PERC_DIA * diasAtraso * 100) / 100;
  }

  function valorCorrigidoParcela(parcela: any): number {
    const valorOriginal = Number(parcela.valor_original ?? parcela.valor ?? 0);
    const jurosManual = Number(parcela.juros ?? 0);
    const multa = Number(parcela.multa ?? 0);
    const desconto = Number(parcela.desconto ?? 0);

    const venc = new Date(parcela.data_vencimento);
    const hj = new Date();
    hj.setHours(0, 0, 0, 0);
    venc.setHours(0, 0, 0, 0);
    const diasAtraso = Math.max(0, Math.floor((hj.getTime() - venc.getTime()) / (1000 * 60 * 60 * 24)));

    const juros = jurosManual > 0 ? jurosManual : calcularJurosAtraso(valorOriginal, diasAtraso);
    return Math.max(valorOriginal + juros + multa - desconto, 0);
  }

  // ── Calcular datas ────────────────────────────────────
  const hoje = new Date();
  const fmtDate = (d: Date) => d.toISOString().split("T")[0];

  const amanha = new Date(hoje);
  amanha.setDate(amanha.getDate() + 1);

  const em3dias = new Date(hoje);
  em3dias.setDate(em3dias.getDate() + 3);

  const ontem = new Date(hoje);
  ontem.setDate(ontem.getDate() - 1);

  const hojeStr = fmtDate(hoje);
  const amanhaStr = fmtDate(amanha);
  const em3diasStr = fmtDate(em3dias);
  const ontemStr = fmtDate(ontem);

  // ── Rate Limiting: limite diário de mensagens ──────────
  const MAX_MENSAGENS_DIA = 40; // WhatsApp bloqueia a partir de ~200 msgs/dia em número novo
  const DELAY_ENTRE_MSGS = 3000; // 3 segundos entre mensagens (evita detecção de spam)

  // Contar mensagens já enviadas hoje
  const { count: msgsHoje } = await adminClient
    .from("notificacoes_log")
    .select("*", { count: "exact", head: true })
    .gte("created_at", hojeStr + "T00:00:00Z")
    .eq("status", "enviado");

  let mensagensRestantes = Math.max(0, MAX_MENSAGENS_DIA - (msgsHoje ?? 0));
  console.log(`[cron] Rate limit: ${msgsHoje ?? 0} enviadas hoje, ${mensagensRestantes} restantes (máx ${MAX_MENSAGENS_DIA})`);

  if (mensagensRestantes <= 0) {
    console.log("[cron] Limite diário atingido. Abortando.");
    return new Response(
      JSON.stringify({ success: true, message: "Limite diário de mensagens atingido", enviados: 0, limite: MAX_MENSAGENS_DIA }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ── Guard: ignorar clientes migrados sem interação ─────
  // Dados migrados do PlataPlumo não devem receber notificação automática
  // até que o operador interaja manualmente com o cliente no sistema.
  const { data: clientesMigrados } = await adminClient
    .from("clientes")
    .select("id")
    .eq("grupo", "plataplumo_migrado");
  const idsMigrados = new Set((clientesMigrados ?? []).map((c: any) => c.id));
  console.log(`[cron] Clientes migrados excluídos do cron: ${idsMigrados.size}`);

  // ── Buscar parcelas relevantes com dados do cliente ───
  const { data: parcelasAlvo, error: parcErr } = await adminClient
    .from("parcelas")
    .select("id, emprestimo_id, cliente_id, numero, valor, valor_original, juros, multa, desconto, data_vencimento, status, woovi_charge_id, clientes(nome, telefone, sexo, cpf)")
    .in("data_vencimento", [em3diasStr, amanhaStr, ontemStr])
    .neq("status", "paga")
    .neq("status", "cancelada")
    .eq("congelada", false);

  if (parcErr) {
    console.error("Erro ao buscar parcelas:", parcErr);
    return new Response(
      JSON.stringify({ success: false, error: "Erro ao buscar parcelas" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!parcelasAlvo || parcelasAlvo.length === 0) {
    return new Response(
      JSON.stringify({ success: true, message: "Nenhuma parcela para notificar hoje", enviados: 0 }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ── Verificar notificações já enviadas hoje ───────────
  const { data: jaEnviadas } = await adminClient
    .from("notificacoes_log")
    .select("parcela_id, tipo")
    .gte("created_at", hojeStr + "T00:00:00Z")
    .eq("status", "enviado");

  const enviados = new Set(
    (jaEnviadas ?? []).map((n: any) => `${n.parcela_id}:${n.tipo}`)
  );

  // ── Buscar templates ativos do banco ─────────────────
  const tiposUsados = [
    "lembrete_3dias", "lembrete_vespera", "vencida_ontem",
    "vencida_3dias", "vencida_7dias", "vencida_15dias", "vencida_30dias",
  ];
  const { data: templatesDB } = await adminClient
    .from("templates_whatsapp")
    .select("*")
    .in("tipo_notificacao", tiposUsados)
    .eq("ativo", true);

  const templateMap: Record<string, any> = {};
  for (const t of templatesDB ?? []) {
    templateMap[t.tipo_notificacao] = t;
  }

  // Buscar dados dos empréstimos para variáveis extras
  const empIdsBase = [...new Set((parcelasAlvo ?? []).map((p: any) => p.emprestimo_id).filter(Boolean))];
  const empBaseMap = new Map<string, any>();
  if (empIdsBase.length > 0) {
    const { data: empsBase } = await adminClient
      .from("emprestimos")
      .select("id, parcelas, parcelas_pagas")
      .in("id", empIdsBase);
    for (const e of empsBase ?? []) empBaseMap.set(e.id, e);
  }

  // Interpolador de variáveis: substitui {var} por valores reais
  function interpolar(msg: string, vars: Record<string, string>): string {
    return msg.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
  }

  let totalEnviados = 0;
  let totalErros = 0;
  let totalCobrancas = 0;

  for (const parcela of parcelasAlvo) {
    const cli = parcela.clientes as any;
    const telefone = cli?.telefone;
    const nomeCliente = cli?.nome || "Cliente";
    const sexo: string = cli?.sexo || "masculino";
    const clienteCpf: string | null = cli?.cpf || null;

    if (!telefone) continue;

    // Pular clientes migrados (PlataPlumo) — evitar spam em massa
    if (idsMigrados.has(parcela.cliente_id)) continue;

    // Rate limit check
    if (mensagensRestantes <= 0) {
      console.log("[cron] Limite diário atingido no meio da execução.");
      break;
    }

    // Valor corrigido com juros automáticos
    const valorReal = valorCorrigidoParcela(parcela);
    const valorFmt = valorReal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    // Valor sem "R$" para templates que já incluem "R$ {valor}"
    const valorNum = valorReal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const dataFmt = parcela.data_vencimento.split("-").reverse().join("/");

    let tipo = "";
    if (parcela.data_vencimento === em3diasStr) tipo = "lembrete_3dias";
    else if (parcela.data_vencimento === amanhaStr) tipo = "lembrete_vespera";
    else if (parcela.data_vencimento === ontemStr) tipo = "vencida_ontem";

    if (!tipo) continue;

    // Evitar envio duplicado
    const chave = `${parcela.id}:${tipo}`;
    if (enviados.has(chave)) continue;

    // ── Criar/buscar cobrança PIX EFI ──────────────────
    let chargeData: { txid: string; brCode: string | null; qrCodeImage: string | null } | null = null;

    if (efiCreds) {
      // Verificar se já existe cobrança para esta parcela
      const existing = await buscarCobrancaExistente(adminClient, parcela.id);

      if (existing?.br_code) {
        // Já tem cobrança ativa — reusar
        chargeData = {
          txid: existing.woovi_txid,
          brCode: existing.br_code,
          qrCodeImage: existing.qr_code_image,
        };
        console.log(`[cron-cobr] Cobrança existente reutilizada: txid=${existing.woovi_txid}`);
      } else if (tipo === "lembrete_3dias") {
        // Criar cobrança apenas no lembrete de 3 dias (primeira notificação)
        chargeData = await criarCobrancaEfi(adminClient, efiCreds, parcela, nomeCliente, clienteCpf);
        if (chargeData) totalCobrancas++;
      }
    }

    // Variáveis disponíveis para interpolação
    const empBase = empBaseMap.get(parcela.emprestimo_id);
    const vars: Record<string, string> = {
      nome: nomeCliente,
      valor: valorNum,
      data: dataFmt,
      numeroParcela: String(parcela.numero),
      diasAtraso: tipo === "vencida_ontem" ? "1" : "0",
      totalParcelas: String(empBase?.parcelas ?? ""),
      parcelasPagas: String(empBase?.parcelas_pagas ?? ""),
      pixCopiaCola: chargeData?.brCode || "",
    };

    let mensagem = "";

    // Usar template do banco se disponível
    const tpl = templateMap[tipo];
    if (tpl) {
      const msgBase = sexo === "feminino" ? tpl.mensagem_feminino : tpl.mensagem_masculino;
      mensagem = interpolar(msgBase, vars);
    } else {
      // Fallback: mensagens hardcoded
      if (tipo === "lembrete_3dias") {
        const lines = [
          `📅 *Lembrete de Pagamento*`,
          ``,
          `Olá ${nomeCliente}!`,
          ``,
          `Sua parcela nº ${parcela.numero} no valor de *${valorFmt}* vence em *3 dias* (${dataFmt}).`,
        ];
        if (chargeData?.brCode) {
          lines.push(
            ``,
            `💰 *Pague via PIX:*`,
            `Copie o código abaixo e cole no seu app do banco:`,
            ``,
            `\`\`\`${chargeData.brCode}\`\`\``,
          );
        }
        lines.push(
          ``,
          `Organize-se para efetuar o pagamento dentro do prazo e evitar juros.`,
          ``,
          `_Casa da Moeda_`,
        );
        mensagem = lines.join("\n");
      } else if (tipo === "lembrete_vespera") {
        const lines = [
          `⚠️ *Vencimento Amanhã!*`,
          ``,
          `Olá ${nomeCliente}!`,
          ``,
          `Sua parcela nº ${parcela.numero} no valor de *${valorFmt}* vence *amanhã* (${dataFmt}).`,
        ];
        if (chargeData?.brCode) {
          lines.push(
            ``,
            `💰 *Pague agora via PIX:*`,
            `\`\`\`${chargeData.brCode}\`\`\``,
          );
        }
        lines.push(
          ``,
          `Não se esqueça de efetuar o pagamento para manter seu crédito em dia!`,
          ``,
          `_Casa da Moeda_`,
        );
        mensagem = lines.join("\n");
      } else if (tipo === "vencida_ontem") {
        const lines = [
          `🔴 *Parcela Vencida*`,
          ``,
          `Olá ${nomeCliente}!`,
          ``,
          `Sua parcela nº ${parcela.numero} no valor de *${valorFmt}* venceu ontem (${dataFmt}) e ainda não identificamos o pagamento.`,
        ];
        if (chargeData?.brCode) {
          lines.push(
            ``,
            `💰 *Pague agora via PIX (multa e juros podem se aplicar):*`,
            `\`\`\`${chargeData.brCode}\`\`\``,
          );
        }
        lines.push(
          ``,
          `Por favor, regularize o quanto antes para evitar juros e multa adicionais.`,
          ``,
          `Em caso de dúvidas ou para negociar, entre em contato conosco.`,
          ``,
          `_Casa da Moeda_`,
        );
        mensagem = lines.join("\n");
      }
    }

    // Se temos template e PIX mas o template não incluiu {pixCopiaCola}, adicionar ao final
    if (tpl && chargeData?.brCode && !mensagem.includes(chargeData.brCode)) {
      mensagem += `\n\n💰 *PIX Copia e Cola:*\n\`\`\`${chargeData.brCode}\`\`\``;
    }

    if (!mensagem) continue;

    const ok = await enviarMsg(
      telefone,
      mensagem,
      parcela.cliente_id,
      tipo,
      parcela.id,
      parcela.emprestimo_id,
    );

    // Enviar QR code como imagem separada (se disponível)
    if (ok && chargeData?.qrCodeImage) {
      await enviarQrCode(telefone, chargeData.qrCodeImage, `QR Code PIX - Parcela ${parcela.numero} - ${valorFmt}`);
    }

    if (ok) {
      totalEnviados++;
      mensagensRestantes--;
    } else totalErros++;

    // Delay entre mensagens (3s — previne bloqueio por spam)
    await new Promise((r) => setTimeout(r, DELAY_ENTRE_MSGS));
  }

  // ── Notificações por tempo de atraso (3, 7, 15, 30 dias) ──
  const tiersAtraso: Array<{ dias: number; tipo: string }> = [
    { dias: 3, tipo: "vencida_3dias" },
    { dias: 7, tipo: "vencida_7dias" },
    { dias: 15, tipo: "vencida_15dias" },
    { dias: 30, tipo: "vencida_30dias" },
  ];

  const datasAtraso = tiersAtraso.map((t) => {
    const d = new Date(hoje);
    d.setDate(d.getDate() - t.dias);
    return { data: fmtDate(d), tipo: t.tipo, dias: t.dias };
  });

  // Buscar parcelas vencidas nos dias-alvo
  const { data: parcelasAtraso } = await adminClient
    .from("parcelas")
    .select(
      "id, emprestimo_id, cliente_id, numero, valor, valor_original, juros, multa, desconto, data_vencimento, status, woovi_charge_id, clientes(nome, telefone, sexo, cpf)",
    )
    .in(
      "data_vencimento",
      datasAtraso.map((d) => d.data),
    )
    .neq("status", "paga")
    .neq("status", "cancelada")
    .eq("congelada", false);

  if (parcelasAtraso && parcelasAtraso.length > 0) {
    // Empréstimo data para variáveis extras
    const empIdsAtraso = [
      ...new Set(parcelasAtraso.map((p: any) => p.emprestimo_id).filter(Boolean)),
    ];
    const empAtrasoMap = new Map<string, any>();
    if (empIdsAtraso.length > 0) {
      const { data: empsAtraso } = await adminClient
        .from("emprestimos")
        .select("id, parcelas, parcelas_pagas")
        .in("id", empIdsAtraso);
      for (const e of empsAtraso ?? []) empAtrasoMap.set(e.id, e);
    }

    const dataTierMap = new Map(datasAtraso.map((d) => [d.data, d]));

    for (const parcela of parcelasAtraso) {
      const cli = parcela.clientes as any;
      const telefone = cli?.telefone;
      const nomeCliente = cli?.nome || "Cliente";
      const sexo: string = cli?.sexo || "masculino";
      const clienteCpf: string | null = cli?.cpf || null;

      if (!telefone) continue;

      // Pular clientes migrados (PlataPlumo)
      if (idsMigrados.has(parcela.cliente_id)) continue;

      // Rate limit check
      if (mensagensRestantes <= 0) {
        console.log("[cron] Limite diário atingido nos tiers de atraso.");
        break;
      }

      const tier = dataTierMap.get(parcela.data_vencimento);
      if (!tier) continue;

      const chave = `${parcela.id}:${tier.tipo}`;
      if (enviados.has(chave)) continue;

      // ── Reduzir score do cliente por atraso ────────────
      try {
        const delta = -Math.min(tier.dias * 3, 90); // -9, -21, -45, -90
        await adminClient.rpc("ajustar_score_cliente", {
          p_cliente_id: parcela.cliente_id,
          p_delta: delta,
          p_motivo: `atraso_${tier.dias}d`,
        });
      } catch { /* não bloqueia notificação */ }

      // Buscar/criar cobrança PIX para parcelas em atraso
      let chargeData: { txid: string; brCode: string | null; qrCodeImage: string | null } | null = null;
      if (efiCreds) {
        const existing = await buscarCobrancaExistente(adminClient, parcela.id);
        if (existing?.br_code) {
          chargeData = { txid: existing.woovi_txid, brCode: existing.br_code, qrCodeImage: existing.qr_code_image };
        } else {
          // Criar cobrança para parcela em atraso (se ainda não tem)
          chargeData = await criarCobrancaEfi(adminClient, efiCreds, parcela, nomeCliente, clienteCpf);
          if (chargeData) totalCobrancas++;
        }
      }

      const tpl = templateMap[tier.tipo];
      if (!tpl && !chargeData) continue; // Sem template e sem cobrança → pular

      const emp = empAtrasoMap.get(parcela.emprestimo_id);
      const valorReal = valorCorrigidoParcela(parcela);
      const valorFmt = valorReal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const valorNum = valorReal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const dataFmt = parcela.data_vencimento.split("-").reverse().join("/");

      const vars: Record<string, string> = {
        nome: nomeCliente,
        valor: valorNum,
        data: dataFmt,
        numeroParcela: String(parcela.numero),
        diasAtraso: String(tier.dias),
        totalParcelas: String(emp?.parcelas ?? ""),
        parcelasPagas: String(emp?.parcelas_pagas ?? ""),
        pixCopiaCola: chargeData?.brCode || "",
      };

      let mensagem = "";
      if (tpl) {
        const msgBase =
          sexo === "feminino" ? tpl.mensagem_feminino : tpl.mensagem_masculino;
        mensagem = interpolar(msgBase, vars);
      } else {
        // Fallback para parcelas em atraso sem template
        mensagem = [
          `🔴 *Parcela em Atraso — ${tier.dias} dias*`,
          ``,
          `Olá ${nomeCliente}!`,
          ``,
          `Sua parcela nº ${parcela.numero} de *${valorFmt}* venceu em ${dataFmt} e está com *${tier.dias} dias de atraso*.`,
          ``,
          `Entre em contato para regularizar sua situação.`,
          ``,
          `_Casa da Moeda_`,
        ].join("\n");
      }

      // Adicionar PIX copia-e-cola se não incluído pelo template
      if (chargeData?.brCode && !mensagem.includes(chargeData.brCode)) {
        mensagem += `\n\n💰 *PIX Copia e Cola:*\n\`\`\`${chargeData.brCode}\`\`\``;
      }

      const ok = await enviarMsg(
        telefone,
        mensagem,
        parcela.cliente_id,
        tier.tipo,
        parcela.id,
        parcela.emprestimo_id,
      );

      // Enviar QR code como imagem
      if (ok && chargeData?.qrCodeImage) {
        await enviarQrCode(telefone, chargeData.qrCodeImage, `QR Code PIX - Parcela ${parcela.numero} - ${valorFmt}`);
      }

      if (ok) {
        totalEnviados++;
        mensagensRestantes--;
      } else totalErros++;

      await new Promise((r) => setTimeout(r, DELAY_ENTRE_MSGS));
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      message: `Notificações: ${totalEnviados} enviadas, ${totalErros} erros, ${totalCobrancas} cobranças PIX criadas`,
      enviados: totalEnviados,
      erros: totalErros,
      cobrancas_criadas: totalCobrancas,
      parcelas_verificadas: (parcelasAlvo?.length ?? 0) + (parcelasAtraso?.length ?? 0),
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
