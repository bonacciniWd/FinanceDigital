/**
 * Edge Function: cron-efi-poll-pix
 *
 * Reconcilia o status real dos PIX enviados via EFI que ainda estão pendentes.
 *
 * A EFI processa o envio de PIX assincronamente:
 *   - O endpoint PUT /v3/gn/pix/:idEnvio retorna 201 com status=EM_PROCESSAMENTO
 *   - Pode evoluir para REALIZADO (sucesso) ou NAO_REALIZADO/DEVOLVIDO (falha)
 *   - A EFI NÃO envia webhook para PIX enviados (apenas para recebidos)
 *
 * Este cron consulta GET /v2/gn/pix/enviados/id-envio/:idEnvio para cada
 * woovi_transactions onde gateway='efi', tipo='payment', status='pending' e
 * atualiza:
 *   - woovi_transactions.status = 'completed' | 'failed'
 *   - emprestimos.desembolsado = true (se REALIZADO) ou false (se rejeitado)
 *
 * Agendamento sugerido (pg_cron): a cada 1 minuto.
 *
 * Deploy: supabase functions deploy cron-efi-poll-pix --no-verify-jwt
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

interface EfiConfig {
  sandbox?: boolean;
  client_id?: string;
  client_secret?: string;
  cert_pem?: string;
  key_pem?: string;
}

async function getEfiConfig(
  adminClient: ReturnType<typeof createClient>
): Promise<EfiConfig | null> {
  const { data } = await adminClient
    .from("gateways_pagamento")
    .select("config")
    .eq("nome", "efi")
    .eq("ativo", true)
    .maybeSingle();
  if (!data) return null;
  return (data.config ?? {}) as EfiConfig;
}

async function getEfiToken(cfg: EfiConfig): Promise<{ token: string; baseUrl: string; httpClient: unknown }> {
  const sandbox = cfg.sandbox === true;
  const baseUrl = sandbox ? "https://pix-h.api.efipay.com.br" : "https://pix.api.efipay.com.br";
  if (!cfg.client_id || !cfg.client_secret || !cfg.cert_pem || !cfg.key_pem) {
    throw new Error("Credenciais EFI incompletas");
  }
  const credentials = btoa(`${cfg.client_id}:${cfg.client_secret}`);
  // @ts-ignore — Deno mTLS
  const httpClient = Deno.createHttpClient({ cert: cfg.cert_pem, key: cfg.key_pem });
  const tokenResp = await fetch(`${baseUrl}/oauth/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials" }),
    // @ts-ignore — Deno mTLS
    client: httpClient,
  });
  if (!tokenResp.ok) {
    const errBody = await tokenResp.text();
    throw new Error(`EFI Auth error: ${errBody}`);
  }
  const tokenData = await tokenResp.json();
  return { token: tokenData.access_token, baseUrl, httpClient };
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

  const result = {
    checked: 0,
    realizado: 0,
    rejeitado: 0,
    ainda_processando: 0,
    erros: 0,
    detalhes: [] as Array<Record<string, unknown>>,
  };

  try {
    // Limite de 100 transações por execução para evitar timeout
    const { data: pendentes, error: pendErr } = await adminClient
      .from("woovi_transactions")
      .select("id, woovi_transaction_id, emprestimo_id, cliente_id, valor, autorizado_em, autorizado_por")
      .eq("gateway", "efi")
      .eq("tipo", "PAYMENT")
      .eq("status", "PENDING")
      .order("autorizado_em", { ascending: true })
      .limit(100);

    if (pendErr) throw pendErr;
    if (!pendentes || pendentes.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: "Sem pendentes", result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[cron-efi-poll-pix] ${pendentes.length} transações pendentes para reconciliar`);

    const cfg = await getEfiConfig(adminClient);
    if (!cfg) {
      return new Response(
        JSON.stringify({ ok: false, error: "Gateway EFI não configurado/ativo" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { token, baseUrl, httpClient } = await getEfiToken(cfg);

    for (const tx of pendentes) {
      result.checked++;
      const idEnvio = tx.woovi_transaction_id;
      if (!idEnvio) {
        result.erros++;
        result.detalhes.push({ tx_id: tx.id, erro: "sem idEnvio" });
        continue;
      }

      try {
        const resp = await fetch(`${baseUrl}/v2/gn/pix/enviados/id-envio/${idEnvio}`, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          // @ts-ignore — Deno mTLS
          client: httpClient,
        });
        const text = await resp.text();
        if (!resp.ok) {
          result.erros++;
          result.detalhes.push({ tx_id: tx.id, idEnvio, http: resp.status, body: text.slice(0, 200) });
          continue;
        }
        const data = text ? JSON.parse(text) : {};
        const statusEfi = data?.status || "DESCONHECIDO";
        const e2eId = data?.endToEndId || data?.e2eId || null;

        if (statusEfi === "REALIZADO") {
          await adminClient
            .from("woovi_transactions")
            .update({
              status: "CONFIRMED",
              end_to_end_id: e2eId,
              confirmed_at: new Date().toISOString(),
            })
            .eq("id", tx.id);

          // Garantir empréstimo marcado como desembolsado
          if (tx.emprestimo_id) {
            await adminClient
              .from("emprestimos")
              .update({
                desembolsado: true,
                desembolsado_em: tx.autorizado_em || new Date().toISOString(),
                desembolsado_por: tx.autorizado_por,
              })
              .eq("id", tx.emprestimo_id)
              .neq("desembolsado", true);
          }

          result.realizado++;
          result.detalhes.push({ tx_id: tx.id, idEnvio, status: "REALIZADO" });
          console.log(`[cron-efi-poll-pix] ✅ ${idEnvio} REALIZADO`);
        } else if (statusEfi === "NAO_REALIZADO" || statusEfi === "DEVOLVIDO") {
          const motivo = data?.devolucoes?.[0]?.motivo || data?.motivo || "rejeitado";
          await adminClient
            .from("woovi_transactions")
            .update({
              status: "FAILED",
              end_to_end_id: e2eId,
              descricao: `EFI ${statusEfi}: ${motivo}`.slice(0, 500),
            })
            .eq("id", tx.id);

          // Reverter desembolso do empréstimo
          if (tx.emprestimo_id) {
            await adminClient
              .from("emprestimos")
              .update({
                desembolsado: false,
                desembolsado_em: null,
                desembolsado_por: null,
              })
              .eq("id", tx.emprestimo_id);
          }

          result.rejeitado++;
          result.detalhes.push({ tx_id: tx.id, idEnvio, status: statusEfi, motivo });
          console.error(`[cron-efi-poll-pix] ❌ ${idEnvio} ${statusEfi}: ${motivo}`);
        } else {
          // Ainda EM_PROCESSAMENTO ou outro estado transitório
          result.ainda_processando++;
          result.detalhes.push({ tx_id: tx.id, idEnvio, status: statusEfi });
        }
      } catch (err) {
        result.erros++;
        const msg = err instanceof Error ? err.message : String(err);
        result.detalhes.push({ tx_id: tx.id, idEnvio, erro: msg });
        console.error(`[cron-efi-poll-pix] erro tx ${tx.id}:`, msg);
      }
    }

    console.log(`[cron-efi-poll-pix] Resumo: ${JSON.stringify({
      checked: result.checked,
      realizado: result.realizado,
      rejeitado: result.rejeitado,
      processando: result.ainda_processando,
      erros: result.erros,
    })}`);

    return new Response(
      JSON.stringify({ ok: true, result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[cron-efi-poll-pix] erro fatal:", err);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : "Erro interno", result }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
