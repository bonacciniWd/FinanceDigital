/**
 * Edge Function: cron-extrato-semanal
 *
 * Orquestra o ciclo semanal de download e distribuição do extrato CNAB 240:
 *
 *   1. Lista arquivos disponíveis na API Extratos EFI dos últimos 8 dias.
 *   2. Seleciona o mais recente cujo período ainda não foi processado.
 *   3. Baixa o arquivo CNAB e armazena em storage `extratos-bancarios/cnab/`.
 *   4. Parseia o CNAB → upsert em `extrato_movimentacoes`.
 *   5. Gera PDF resumo → armazena em `extratos-bancarios/pdf/`.
 *   6. Envia CNAB + PDF via WhatsApp para cada destinatário ativo.
 *   7. Atualiza histórico em `extratos_semanais`.
 *
 * Trigger:
 *   - Automático: pg_cron toda segunda 13:00 UTC (10:00 BRT).
 *   - Manual: chamada autenticada (admin/gerência) via UI.
 *
 * Deploy: supabase functions deploy cron-extrato-semanal --no-verify-jwt
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { callEfiExtratos } from "../_shared/efi-extratos-client.ts";
import { parseCnab240, classifyHistorico } from "../_shared/cnab240-parser.ts";
import { gerarExtratoPdf } from "../_shared/pdf-extrato.ts";

interface InvokeBody {
  source?: string;
  trigger_type?: "cron" | "manual";
  /** Forçar re-processamento mesmo se período já existe. */
  forcar?: boolean;
  /** ISO date — se informado, processa esse intervalo específico (uso manual). */
  data_inicio?: string;
  data_fim?: string;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

interface EfiArquivo {
  id?: string;
  identificador?: string;
  nome?: string;
  nome_arquivo?: string;
  data?: string;
  data_geracao?: string;
  periodo_inicio?: string;
  periodo_fim?: string;
}

function pickArquivoNome(a: EfiArquivo): string | null {
  return a.nome_arquivo || a.nome || null;
}

function pickPeriodo(a: EfiArquivo): { inicio: string; fim: string } {
  // EFI pode mandar periodo_inicio/fim explícitos ou só data_geracao.
  // Para semanal: assumimos 7 dias antes da data_geracao até a data_geracao.
  const fim = a.periodo_fim || a.data_geracao || a.data || isoToday();
  let inicio = a.periodo_inicio;
  if (!inicio) {
    const d = new Date(fim);
    d.setUTCDate(d.getUTCDate() - 6);
    inicio = d.toISOString().slice(0, 10);
  }
  return { inicio: inicio.slice(0, 10), fim: fim.slice(0, 10) };
}

async function uploadToStorage(
  adminClient: ReturnType<typeof createClient>,
  path: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  const { error } = await adminClient.storage
    .from("extratos-bancarios")
    .upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Error(`Upload storage falhou (${path}): ${error.message}`);
}

async function processarArquivo(
  adminClient: ReturnType<typeof createClient>,
  arquivoNome: string,
  periodoInicio: string,
  periodoFim: string,
  triggerType: "cron" | "manual",
  triggeredBy: string | null,
): Promise<{
  registroId: string;
  cnabPath: string;
  pdfPath: string;
  movimentacoes: number;
  totalEntradas: number;
  totalSaidas: number;
}> {
  // 1. Cria/recupera registro em extratos_semanais
  const { data: registro, error: regErr } = await adminClient
    .from("extratos_semanais")
    .insert({
      periodo_inicio: periodoInicio,
      periodo_fim: periodoFim,
      efi_arquivo_nome: arquivoNome,
      status: "pendente",
      trigger_type: triggerType,
      triggered_by: triggeredBy,
    })
    .select("id")
    .single();
  if (regErr || !registro) {
    throw new Error(`Falha ao criar registro extratos_semanais: ${regErr?.message}`);
  }
  const registroId = registro.id as string;

  try {
    // 2. Baixa o arquivo CNAB
    const downloadResult = await callEfiExtratos(adminClient, "download_file", {
      nome_arquivo: arquivoNome,
    });
    if (!downloadResult.bytes) {
      throw new Error("Resposta de download sem bytes.");
    }
    const cnabBytes = downloadResult.bytes;

    // 3. Sobe CNAB para storage
    const cnabPath = `cnab/${periodoInicio}_${periodoFim}_${arquivoNome}.txt`;
    await uploadToStorage(adminClient, cnabPath, cnabBytes, "text/plain");

    await adminClient
      .from("extratos_semanais")
      .update({ status: "baixado", cnab_path: cnabPath })
      .eq("id", registroId);

    // 4. Parseia CNAB
    const cnabText = new TextDecoder("latin1").decode(cnabBytes);
    const parsed = parseCnab240(cnabText);

    // 5. Insere movimentações em extrato_movimentacoes (best-effort)
    let inseridas = 0;
    if (parsed.movimentacoes.length > 0) {
      const rows = parsed.movimentacoes.map((m) => {
        const cls = classifyHistorico(m.historico, m.direction);
        return {
          protocolo: null as number | null,
          categoria: cls.categoria,
          direction: m.direction,
          descricao_completa: m.historico,
          contraparte_nome: null,
          data: m.data,
          valor: m.valor,
          saldo_apos: null,
          eh_saldo_diario: cls.ehSaldoDiario,
          source: "cnab_import",
          raw: { documento: m.documento, raw_line: m.raw_line },
        };
      });

      // Insert chunked sem onConflict (CNAB não tem protocolo único)
      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK);
        const { error: insErr, count } = await adminClient
          .from("extrato_movimentacoes")
          .insert(slice, { count: "exact" });
        if (insErr) {
          // Tolerância: log e continua
          console.warn(`[cron-extrato-semanal] insert chunk ${i}: ${insErr.message}`);
        } else {
          inseridas += count ?? slice.length;
        }
      }
    }

    // 6. Totais para PDF
    const totalEntradas = parsed.movimentacoes
      .filter((m) => m.direction === "entrada")
      .reduce((s, m) => s + m.valor, 0);
    const totalSaidas = parsed.movimentacoes
      .filter((m) => m.direction === "saida")
      .reduce((s, m) => s + m.valor, 0);

    // 7. Gera PDF resumo
    const pdfBytes = gerarExtratoPdf({
      empresa_nome: parsed.header?.empresa_nome,
      conta: parsed.header?.conta,
      periodo_inicio: periodoInicio,
      periodo_fim: periodoFim,
      movimentacoes: parsed.movimentacoes.map((m) => ({
        data: m.data,
        direction: m.direction,
        historico: m.historico,
        valor: m.valor,
      })),
      total_entradas: totalEntradas,
      total_saidas: totalSaidas,
    });

    // 8. Sobe PDF
    const pdfPath = `pdf/${periodoInicio}_${periodoFim}_extrato.pdf`;
    await uploadToStorage(adminClient, pdfPath, pdfBytes, "application/pdf");

    // 9. Atualiza registro como processado
    await adminClient
      .from("extratos_semanais")
      .update({
        status: "processado",
        pdf_path: pdfPath,
        movimentacoes_importadas: inseridas,
        raw_meta: {
          total_lines: parsed.total_lines,
          total_segmento_e: parsed.total_segmento_e,
          warnings: parsed.warnings,
        },
      })
      .eq("id", registroId);

    return {
      registroId,
      cnabPath,
      pdfPath,
      movimentacoes: inseridas,
      totalEntradas,
      totalSaidas,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await adminClient
      .from("extratos_semanais")
      .update({ status: "falhou", erro_msg: msg })
      .eq("id", registroId);
    throw err;
  }
}

async function enviarWhatsapp(
  adminClient: ReturnType<typeof createClient>,
  registroId: string,
  cnabPath: string,
  pdfPath: string,
  resumo: { entradas: number; saidas: number; saldo: number; periodoInicio: string; periodoFim: string; movimentacoes: number },
  authHeader: string,
): Promise<{ enviados: number; falharam: number }> {
  // Carrega instância configurada
  const { data: cfgRows } = await adminClient
    .from("configuracoes_sistema")
    .select("chave, valor")
    .in("chave", ["extrato_semanal_instancia_whatsapp_id"]);
  const cfg: Record<string, unknown> = {};
  for (const r of cfgRows ?? []) cfg[r.chave] = r.valor;
  const instanciaId = cfg.extrato_semanal_instancia_whatsapp_id as string | null;
  if (!instanciaId) {
    throw new Error(
      "Instância WhatsApp para envio do extrato não configurada (configuracoes_sistema.extrato_semanal_instancia_whatsapp_id).",
    );
  }

  // Lista destinatários ativos
  const { data: destinatarios } = await adminClient
    .from("extrato_whatsapp_destinatarios")
    .select("id, nome, telefone")
    .eq("ativo", true);

  if (!destinatarios || destinatarios.length === 0) {
    return { enviados: 0, falharam: 0 };
  }

  // Gera URLs assinadas (validade 7 dias)
  const { data: cnabSigned } = await adminClient.storage
    .from("extratos-bancarios")
    .createSignedUrl(cnabPath, 60 * 60 * 24 * 7);
  const { data: pdfSigned } = await adminClient.storage
    .from("extratos-bancarios")
    .createSignedUrl(pdfPath, 60 * 60 * 24 * 7);

  // Baixa o PDF como base64 (envio direto via Evolution)
  const { data: pdfBlob } = await adminClient.storage
    .from("extratos-bancarios")
    .download(pdfPath);
  let pdfBase64 = "";
  if (pdfBlob) {
    const buf = await pdfBlob.arrayBuffer();
    pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
  }

  const fmtBR = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtData = (iso: string) => {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  };
  const texto =
    `*Extrato Bancário Semanal*\n` +
    `Período: ${fmtData(resumo.periodoInicio)} a ${fmtData(resumo.periodoFim)}\n\n` +
    `Entradas: ${fmtBR(resumo.entradas)}\n` +
    `Saídas: ${fmtBR(resumo.saidas)}\n` +
    `Saldo: ${resumo.saldo >= 0 ? "+" : ""}${fmtBR(resumo.saldo)}\n\n` +
    `${resumo.movimentacoes} lançamento(s) processado(s).` +
    (cnabSigned?.signedUrl ? `\n\nArquivo CNAB: ${cnabSigned.signedUrl}` : "") +
    (pdfSigned?.signedUrl ? `\nPDF resumo: ${pdfSigned.signedUrl}` : "");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const sendUrl = `${supabaseUrl}/functions/v1/send-whatsapp`;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  let enviados = 0;
  let falharam = 0;

  for (const dest of destinatarios) {
    try {
      // 1. Mensagem de texto + PDF anexado
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
          conteudo: texto,
          tipo: "document",
          media_base64: pdfBase64,
        }),
      });
      if (!respPdf.ok) {
        const errText = await respPdf.text();
        throw new Error(`send-whatsapp PDF: ${respPdf.status} ${errText.slice(0, 200)}`);
      }
      enviados++;
    } catch (err) {
      console.error(`[cron-extrato-semanal] envio para ${dest.telefone}:`, err);
      falharam++;
    }
  }

  await adminClient
    .from("extratos_semanais")
    .update({
      status: "enviado",
      destinatarios_enviados: enviados,
      destinatarios_falharam: falharam,
    })
    .eq("id", registroId);

  return { enviados, falharam };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Método inválido" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const adminClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization") || "";
    const body: InvokeBody = await req.json().catch(() => ({}));
    const triggerType = body.trigger_type === "manual" ? "manual" : "cron";

    let triggeredBy: string | null = null;
    if (triggerType === "manual") {
      // Verifica usuário admin/gerência
      const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData } = await userClient.auth.getUser();
      if (!userData?.user) {
        return jsonResponse({ success: false, error: "Sessão inválida" }, 401);
      }
      const { data: profile } = await adminClient
        .from("profiles")
        .select("role")
        .eq("id", userData.user.id)
        .single();
      if (!profile || !["admin", "gerencia"].includes(profile.role)) {
        return jsonResponse({ success: false, error: "Permissão negada" }, 403);
      }
      triggeredBy = userData.user.id;
    }

    // 1. Verifica se feature está ativa (para cron); manual sempre roda
    if (triggerType === "cron") {
      const { data: ativaCfg } = await adminClient
        .from("configuracoes_sistema")
        .select("valor")
        .eq("chave", "extrato_semanal_ativo")
        .single();
      if (ativaCfg?.valor !== true) {
        return jsonResponse({
          success: true,
          skipped: true,
          reason: "extrato_semanal_ativo=false",
        });
      }
    }

    // 2. Lista arquivos da última semana
    const dataInicio = body.data_inicio ?? isoDaysAgo(8);
    const dataFim = body.data_fim ?? isoToday();
    const listResult = await callEfiExtratos(adminClient, "list_files", {
      data_inicio: dataInicio,
      data_fim: dataFim,
    });
    const arquivos = (Array.isArray((listResult.data as any)?.arquivos)
      ? (listResult.data as any).arquivos
      : Array.isArray(listResult.data)
        ? listResult.data
        : []) as EfiArquivo[];

    if (arquivos.length === 0) {
      return jsonResponse({
        success: true,
        skipped: true,
        reason: "Nenhum arquivo CNAB disponível no período.",
        listado: { data_inicio: dataInicio, data_fim: dataFim },
      });
    }

    // 3. Pega o mais recente
    const sorted = arquivos.slice().sort((a, b) => {
      const da = (a.data_geracao || a.data || "").localeCompare(b.data_geracao || b.data || "");
      return -da;
    });
    const alvo = sorted[0];
    const nomeArquivo = pickArquivoNome(alvo);
    if (!nomeArquivo) {
      return jsonResponse({ success: false, error: "Arquivo retornado pela EFI sem nome." }, 500);
    }
    const { inicio: pi, fim: pf } = pickPeriodo(alvo);

    // 4. Verifica idempotência
    if (!body.forcar) {
      const { data: existente } = await adminClient
        .from("extratos_semanais")
        .select("id, status")
        .eq("periodo_inicio", pi)
        .eq("periodo_fim", pf)
        .in("status", ["processado", "enviado"])
        .maybeSingle();
      if (existente) {
        return jsonResponse({
          success: true,
          skipped: true,
          reason: `Período ${pi}..${pf} já foi processado (status=${existente.status}).`,
        });
      }
    }

    // 5. Processa arquivo
    const result = await processarArquivo(
      adminClient,
      nomeArquivo,
      pi,
      pf,
      triggerType,
      triggeredBy,
    );

    // 6. Envia WhatsApp
    const envio = await enviarWhatsapp(
      adminClient,
      result.registroId,
      result.cnabPath,
      result.pdfPath,
      {
        entradas: result.totalEntradas,
        saidas: result.totalSaidas,
        saldo: result.totalEntradas - result.totalSaidas,
        periodoInicio: pi,
        periodoFim: pf,
        movimentacoes: result.movimentacoes,
      },
      authHeader,
    );

    return jsonResponse({
      success: true,
      registro_id: result.registroId,
      arquivo: nomeArquivo,
      periodo: { inicio: pi, fim: pf },
      movimentacoes_importadas: result.movimentacoes,
      total_entradas: result.totalEntradas,
      total_saidas: result.totalSaidas,
      enviados: envio.enviados,
      falharam: envio.falharam,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cron-extrato-semanal] erro fatal:", msg);
    return jsonResponse({ success: false, error: msg }, 500);
  }
});
