/**
 * Edge Function: cron-relatorio-semanal-whatsapp
 *
 * Envia um RESUMO TEXTUAL semanal (entradas, saídas, comissões por funcionário)
 * pelo WhatsApp para os destinatários cadastrados em
 * `relatorio_semanal_destinatarios`.
 *
 * Substitui temporariamente o envio do CNAB (EFI ainda não liberou a feature).
 *
 * Trigger:
 *   - Manual: chamada autenticada via UI (Financeiro → Envios automáticos).
 *   - Cron: pode ser agendada via pg_cron semanalmente.
 *
 * Body (POST):
 *   {
 *     periodo_inicio: "2024-01-12",
 *     periodo_fim:    "2024-01-18",
 *     mensagem: "...",                         // texto pronto a enviar
 *     total_entradas?: number,
 *     total_saidas?: number,
 *     total_comissoes?: number,
 *     destinatario_ids?: string[],             // se omitido, todos ativos
 *     origem?: "manual" | "cron"
 *   }
 *
 * Deploy: supabase functions deploy cron-relatorio-semanal-whatsapp --no-verify-jwt
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

interface InvokeBody {
  periodo_inicio?: string;
  periodo_fim?: string;
  mensagem?: string;
  total_entradas?: number;
  total_saidas?: number;
  total_comissoes?: number;
  destinatario_ids?: string[];
  origem?: "manual" | "cron";
  /** URL pública do PDF (Storage). Quando presente, é enviado como documento após o texto. */
  pdf_url?: string;
  pdf_filename?: string;
  /**
   * Modo automatizado (cron). Quando true, a função se vira sozinha:
   *  - calcula período = últimos 7 dias (domingo passado a sábado passado, BRT)
   *  - busca gastos_internos (saídas) e regras de comissão do banco
   *  - monta mensagem de texto (sem PDF — jsPDF não roda em Deno)
   */
  auto?: boolean;
}

// ── Helpers para modo auto ────────────────────────────────────────
function fmtBRL(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function fmtDateBR(iso: string): string {
  // ISO yyyy-mm-dd → dd/mm/yyyy (timezone BRT)
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** Período da semana passada (domingo a sábado), em BRT (UTC-3). */
function periodoUltimaSemanaBRT(): { inicio: string; fim: string } {
  // Now em BRT (UTC-3)
  const nowMs = Date.now() - 3 * 60 * 60 * 1000;
  const now = new Date(nowMs);
  const dow = now.getUTCDay(); // 0 = domingo
  // Sábado passado = ontem se hoje é domingo, senão (dow + 1) dias atrás
  const diasAteSabado = dow === 0 ? 1 : dow + 1;
  const fim = new Date(now);
  fim.setUTCDate(fim.getUTCDate() - diasAteSabado);
  const inicio = new Date(fim);
  inicio.setUTCDate(inicio.getUTCDate() - 6);
  const toIso = (d: Date) => d.toISOString().slice(0, 10);
  return { inicio: toIso(inicio), fim: toIso(fim) };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // Identifica usuário (manual) — opcional
    const authHeader = req.headers.get("Authorization") ?? "";
    let userId: string | null = null;
    if (authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const { data: userData } = await adminClient.auth.getUser(token);
      userId = userData.user?.id ?? null;
    }

    const body = (await req.json().catch(() => ({}))) as InvokeBody;

    // Modo auto (cron): a função se vira sozinha — calcula período, busca dados, monta texto.
    if (body.auto) {
      const { inicio, fim } = periodoUltimaSemanaBRT();
      body.periodo_inicio = inicio;
      body.periodo_fim = fim;
      body.origem = "cron";

      // Gastos internos (saídas) do período — fonte de dados confiável server-side
      const { data: gastosRows } = await adminClient
        .from("gastos_internos")
        .select("valor, categoria:categorias_gastos(nome)")
        .gte("horario", `${inicio}T00:00:00-03:00`)
        .lte("horario", `${fim}T23:59:59-03:00`);
      const totalSaidas = (gastosRows ?? []).reduce(
        (s: number, g: Record<string, unknown>) => s + Number(g.valor || 0),
        0,
      );
      const porCategoria = new Map<string, number>();
      for (const g of (gastosRows ?? []) as Array<Record<string, unknown>>) {
        const cat = ((g.categoria as Record<string, unknown> | null)?.nome as string) ?? "—";
        porCategoria.set(cat, (porCategoria.get(cat) ?? 0) + Number(g.valor || 0));
      }

      // Regras de comissão ativas (só conseguimos calcular `fixo` server-side, pois entradas
      // dependem da API EFI em tempo real — indisponível aqui)
      const { data: regras } = await adminClient
        .from("comissoes_semanais_config")
        .select("nome, tipo, valor_pct, valor_fixo, ordem")
        .eq("ativo", true)
        .order("ordem", { ascending: true });
      const linhasComissao: string[] = [];
      let totalComissoesFixo = 0;
      for (const r of (regras ?? []) as Array<Record<string, unknown>>) {
        const nome = r.nome as string;
        const tipo = r.tipo as string;
        const vFixo = Number(r.valor_fixo ?? 0);
        const vPct = Number(r.valor_pct ?? 0);
        if (tipo === "fixo") {
          linhasComissao.push(`• ${nome}: ${fmtBRL(vFixo)} (fixo)`);
          totalComissoesFixo += vFixo;
        } else if (tipo === "pct_entradas") {
          linhasComissao.push(`• ${nome}: ${vPct}% das entradas (calcular no app)`);
        } else if (tipo === "pct_saidas") {
          const v = (totalSaidas * vPct) / 100;
          linhasComissao.push(`• ${nome}: ${vPct}% das saídas → ${fmtBRL(v)}`);
          totalComissoesFixo += v;
        } else if (tipo === "fixo_pct_entradas") {
          linhasComissao.push(`• ${nome}: ${fmtBRL(vFixo)} + ${vPct}% das entradas (calcular no app)`);
        } else if (tipo === "fixo_pct_saidas") {
          const v = vFixo + (totalSaidas * vPct) / 100;
          linhasComissao.push(`• ${nome}: ${fmtBRL(vFixo)} + ${vPct}% das saídas → ${fmtBRL(v)}`);
          totalComissoesFixo += v;
        }
      }

      const partesCat = Array.from(porCategoria.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([cat, v]) => `  · ${cat}: ${fmtBRL(v)}`)
        .join("\n");

      body.total_saidas = totalSaidas;
      body.total_comissoes = totalComissoesFixo;
      body.mensagem =
        `*📊 Relatório Semanal — Fintech*\n` +
        `Período: _${fmtDateBR(inicio)} a ${fmtDateBR(fim)}_\n\n` +
        `*Saídas (gastos internos)*\n` +
        `Total: *${fmtBRL(totalSaidas)}*\n` +
        (partesCat ? `${partesCat}\n\n` : "\n") +
        `*Comissões / Salários da semana*\n` +
        (linhasComissao.length > 0 ? linhasComissao.join("\n") : "_Nenhuma regra ativa_") +
        `\n\n_Entradas via PIX e PDF executivo completo: acesse o app → Financeiro → Envios automáticos._`;
    }

    if (!body.periodo_inicio || !body.periodo_fim || !body.mensagem) {
      return jsonResponse(
        { error: "periodo_inicio, periodo_fim e mensagem são obrigatórios (ou use { auto: true })" },
        400,
      );
    }
    const origem = body.origem === "cron" ? "cron" : "manual";

    // 1. Resolve instância WhatsApp.
    //    Ordem de resolução:
    //      a) configuracoes_sistema.extrato_semanal_instancia_whatsapp_id (preferido)
    //      b) whatsapp_instancias.is_system = true (fallback — instância "Sistema" da UI)
    const { data: cfgRows } = await adminClient
      .from("configuracoes_sistema")
      .select("chave, valor")
      .in("chave", ["extrato_semanal_instancia_whatsapp_id"]);
    const cfg = Object.fromEntries((cfgRows ?? []).map((r) => [r.chave, r.valor]));
    // valor é JSONB — pode vir como string crua ou JSON-string. Normaliza.
    const rawCfgId = cfg.extrato_semanal_instancia_whatsapp_id;
    let instanciaId: string | null =
      typeof rawCfgId === "string" ? rawCfgId : rawCfgId ? String(rawCfgId) : null;

    // Valida que o ID configurado realmente existe; se não, cai para is_system
    if (instanciaId) {
      const { data: instTest } = await adminClient
        .from("whatsapp_instancias")
        .select("id")
        .eq("id", instanciaId)
        .maybeSingle();
      if (!instTest) {
        console.warn(
          `[cron-relatorio-semanal-whatsapp] instancia ${instanciaId} configurada não existe — caindo para is_system`,
        );
        instanciaId = null;
      }
    }

    if (!instanciaId) {
      const { data: sysInst } = await adminClient
        .from("whatsapp_instancias")
        .select("id, instance_name, status")
        .eq("is_system", true)
        .limit(1)
        .maybeSingle();
      if (sysInst?.id) {
        instanciaId = sysInst.id as string;
        console.log(
          `[cron-relatorio-semanal-whatsapp] usando instância is_system: ${sysInst.instance_name} (${instanciaId})`,
        );
      }
    }

    if (!instanciaId) {
      return jsonResponse(
        {
          error:
            "Nenhuma instância WhatsApp disponível. Marque uma instância como 'Sistema' em WhatsApp/Conexões, ou configure 'extrato_semanal_instancia_whatsapp_id' em configuracoes_sistema.",
        },
        400,
      );
    }

    // 2. Carrega destinatários
    let query = adminClient
      .from("relatorio_semanal_destinatarios")
      .select("id, nome, telefone, ativo")
      .eq("ativo", true);
    if (body.destinatario_ids && body.destinatario_ids.length > 0) {
      query = query.in("id", body.destinatario_ids);
    }
    const { data: destinatarios, error: destErr } = await query;
    if (destErr) throw new Error(`Falha ao carregar destinatários: ${destErr.message}`);
    if (!destinatarios || destinatarios.length === 0) {
      return jsonResponse({ enviados: 0, falhas: 0, detalhes: [], aviso: "Nenhum destinatário ativo." });
    }

    // 3. Envia para cada destinatário via send-whatsapp
    const sendUrl = `${supabaseUrl}/functions/v1/send-whatsapp`;
    let enviados = 0;
    let falhas = 0;
    const detalhes: Array<{ nome: string; telefone: string; status: "enviado" | "falhou"; erro?: string }> = [];

    // PDF: URL pública do bucket whatsapp-media. send-whatsapp aceita URL HTTP
    // diretamente para tipo=document (Evolution API baixa o arquivo).
    const pdfUrl = body.pdf_url && body.pdf_url.length > 0 ? body.pdf_url : null;
    const pdfFilename = (body.pdf_filename || "relatorio-semanal.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");

    for (const dest of destinatarios) {
      try {
        // 3a. Texto principal
        const respTexto = await fetch(sendUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
            apikey: serviceKey,
          },
          body: JSON.stringify({
            instancia_id: instanciaId,
            telefone: dest.telefone,
            conteudo: body.mensagem,
          }),
        });
        if (!respTexto.ok) {
          const errText = await respTexto.text();
          throw new Error(`send-whatsapp(texto): ${respTexto.status} ${errText.slice(0, 200)}`);
        }

        // 3b. PDF como documento (logo abaixo, mesma conversa)
        if (pdfUrl) {
          const respPdf = await fetch(sendUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceKey}`,
              apikey: serviceKey,
            },
            body: JSON.stringify({
              instancia_id: instanciaId,
              telefone: dest.telefone,
              tipo: "document",
              conteudo: pdfFilename,
              media_url: pdfUrl,
              file_name: pdfFilename,
              mime_type: "application/pdf",
            }),
          });
          if (!respPdf.ok) {
            const errText = await respPdf.text();
            throw new Error(`send-whatsapp(pdf): ${respPdf.status} ${errText.slice(0, 200)}`);
          }
        }

        enviados++;
        detalhes.push({ nome: dest.nome, telefone: dest.telefone, status: "enviado" });
      } catch (err) {
        falhas++;
        const erroMsg = err instanceof Error ? err.message : String(err);
        console.error(`[cron-relatorio-semanal-whatsapp] envio para ${dest.telefone}:`, erroMsg);
        detalhes.push({ nome: dest.nome, telefone: dest.telefone, status: "falhou", erro: erroMsg });
      }
    }

    // 4. Log de auditoria
    await adminClient.from("relatorio_semanal_envios").insert({
      periodo_inicio: body.periodo_inicio,
      periodo_fim: body.periodo_fim,
      destinatarios: detalhes,
      mensagem: body.mensagem,
      origem,
      total_entradas: body.total_entradas ?? null,
      total_saidas: body.total_saidas ?? null,
      total_comissoes: body.total_comissoes ?? null,
      enviado_por: userId,
    });

    return jsonResponse({ enviados, falhas, detalhes });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cron-relatorio-semanal-whatsapp] erro:", msg);
    return jsonResponse({ error: msg }, 500);
  }
});
