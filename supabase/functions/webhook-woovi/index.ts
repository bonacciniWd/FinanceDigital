/**
 * Edge Function: webhook-woovi
 *
 * Recebe webhooks da Woovi (OpenPix) para atualizar o banco de dados
 * em tempo real quando cobranças são pagas, transações confirmadas, etc.
 *
 * Eventos tratados:
 *   - OPENPIX:CHARGE_CREATED    → Cobrança criada (confirma criação externa)
 *   - OPENPIX:CHARGE_COMPLETED  → Cobrança paga
 *   - OPENPIX:CHARGE_COMPLETED_NOT_SAME_CUSTOMER_PAYER → Paga por terceiro (alerta fraude)
 *   - OPENPIX:CHARGE_EXPIRED    → Cobrança expirada
 *   - OPENPIX:TRANSACTION_RECEIVED → Transação Pix recebida
 *   - OPENPIX:TRANSACTION_REFUND_RECEIVED → Estorno recebido
 *   - PIX_TRANSACTION_REFUND_RECEIVED_CONFIRMED → Estorno recebido confirmado
 *   - PIX_TRANSACTION_REFUND_SENT_CONFIRMED → Reembolso enviado confirmado
 *   - PIX_TRANSACTION_REFUND_RECEIVED_REJECTED → Estorno recebido rejeitado
 *   - PIX_TRANSACTION_REFUND_SENT_REJECTED → Reembolso enviado rejeitado
 *
 * ⚠️  SEM JWT — recebe webhooks públicos.
 *     Validação via assinatura x-webhook-secret.
 *
 * Deploy: supabase functions deploy webhook-woovi --no-verify-jwt
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Valida a assinatura do webhook da Woovi.
 * A Woovi envia o header x-webhook-secret com o valor configurado.
 */
function validateWebhookSignature(req: Request): boolean {
  const webhookSecret = Deno.env.get("WOOVI_WEBHOOK_SECRET");
  if (!webhookSecret) {
    // Se não configurado, aceitar (dev/teste)
    console.warn("WOOVI_WEBHOOK_SECRET não configurado — aceitando webhook sem validação");
    return true;
  }

  const receivedSecret = req.headers.get("x-webhook-secret");
  if (!receivedSecret) return false;

  // Comparação em tempo constante
  if (receivedSecret.length !== webhookSecret.length) return false;

  let result = 0;
  for (let i = 0; i < webhookSecret.length; i++) {
    result |= webhookSecret.charCodeAt(i) ^ receivedSecret.charCodeAt(i);
  }
  return result === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // ── Validação do endpoint (GET) — Woovi envia GET para verificar se está ativo
  if (req.method === "GET") {
    return jsonResponse({ active: true, service: "webhook-woovi" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let payload: Record<string, unknown>;

  try {
    payload = await req.json();
  } catch {
    // Corpo vazio ou inválido — pode ser teste de validação da Woovi
    return jsonResponse({ success: true, message: "webhook-woovi active" });
  }

  const event = (payload.event as string) || (payload.type as string) || "UNKNOWN";

  // ── Evento de teste/validação da Woovi — responder OK sem validar assinatura
  if (event === "UNKNOWN" || event === "teste" || event === "test" || !event) {
    return jsonResponse({ success: true, event: "validation" });
  }

  // ── Validar assinatura ──────────────────────────────────
  if (!validateWebhookSignature(req)) {
    // Logar tentativa inválida
    await adminClient.from("woovi_webhooks_log").insert({
      event_type: "INVALID_SIGNATURE",
      payload,
      processed: false,
      error_message: "Assinatura do webhook inválida",
    });
    return jsonResponse({ error: "Assinatura inválida" }, 401);
  }

  // ── Logar webhook recebido ──────────────────────────────
  const { data: logEntry } = await adminClient
    .from("woovi_webhooks_log")
    .insert({
      event_type: event,
      payload,
      processed: false,
    })
    .select("id")
    .single();

  const logId = logEntry?.id;

  try {
    switch (event) {
      // ══════════════════════════════════════════════════════
      // COBRANÇA PAGA
      // ══════════════════════════════════════════════════════
      case "OPENPIX:CHARGE_COMPLETED":
      case "OPENPIX:CHARGE_COMPLETED_NOT_SAME_CUSTOMER_PAYER": {
        const charge = (payload.charge || payload) as Record<string, unknown>;
        const correlationID = charge.correlationID as string;
        const isDifferentPayer = event === "OPENPIX:CHARGE_COMPLETED_NOT_SAME_CUSTOMER_PAYER";

        if (!correlationID) {
          throw new Error("correlationID não encontrado no payload");
        }

        // Atualizar cobrança no banco
        const { data: dbCharge } = await adminClient
          .from("woovi_charges")
          .update({
            status: "COMPLETED",
            paid_at: new Date().toISOString(),
            woovi_txid: (charge.transactionID as string) || null,
          })
          .eq("woovi_charge_id", correlationID)
          .select("*, parcela_id, emprestimo_id, cliente_id, split_indicador_id, split_valor")
          .single();

        if (dbCharge) {
          // ── Atualizar parcela como paga ──────────────────
          if (dbCharge.parcela_id) {
            const hoje = new Date().toISOString().split("T")[0];
            await adminClient
              .from("parcelas")
              .update({
                status: "paga",
                data_pagamento: hoje,
              })
              .eq("id", dbCharge.parcela_id);

            // ── Ajustar score do cliente ─────────────────────
            try {
              const { data: parcelaInfo } = await adminClient
                .from("parcelas")
                .select("cliente_id, data_vencimento")
                .eq("id", dbCharge.parcela_id)
                .single();

              if (parcelaInfo?.cliente_id) {
                const venc = new Date(parcelaInfo.data_vencimento + "T00:00:00");
                const pagamento = new Date(hoje + "T00:00:00");
                const diffDias = Math.floor((pagamento.getTime() - venc.getTime()) / (1000 * 60 * 60 * 24));

                let delta = 0;
                if (diffDias < 0) delta = 25;       // antecipado
                else if (diffDias === 0) delta = 15; // no dia
                else delta = -Math.min(diffDias * 5, 100); // atrasado: -5/dia, máx -100

                await adminClient.rpc("ajustar_score_cliente", {
                  p_cliente_id: parcelaInfo.cliente_id,
                  p_delta: delta,
                  p_motivo: `pagamento_parcela:${diffDias < 0 ? "antecipado" : diffDias === 0 ? "no_dia" : "atrasado_" + diffDias + "d"}`,
                });
                console.log(`[webhook-woovi] Score ajustado: cliente=${parcelaInfo.cliente_id} delta=${delta}`);
              }
            } catch (scoreErr) {
              console.error("[webhook-woovi] Erro ao ajustar score:", scoreErr);
            }

            // Incrementar parcelas_pagas no empréstimo
            if (dbCharge.emprestimo_id) {
              const { data: emp } = await adminClient
                .from("emprestimos")
                .select("parcelas, parcelas_pagas")
                .eq("id", dbCharge.emprestimo_id)
                .single();

              if (emp) {
                const novasPagas = (emp.parcelas_pagas || 0) + 1;
                const updates: Record<string, unknown> = {
                  parcelas_pagas: novasPagas,
                };

                // Se todas as parcelas foram pagas, quitar empréstimo
                if (novasPagas >= emp.parcelas) {
                  updates.status = "quitado";
                }

                // Buscar próximo vencimento
                const { data: proximaParcela } = await adminClient
                  .from("parcelas")
                  .select("data_vencimento")
                  .eq("emprestimo_id", dbCharge.emprestimo_id)
                  .eq("status", "pendente")
                  .order("data_vencimento", { ascending: true })
                  .limit(1)
                  .single();

                if (proximaParcela) {
                  updates.proximo_vencimento = proximaParcela.data_vencimento;
                }

                await adminClient
                  .from("emprestimos")
                  .update(updates)
                  .eq("id", dbCharge.emprestimo_id);
              }
            }
          }

          // ── Registrar transação de recebimento ──────────
          await adminClient.from("woovi_transactions").insert({
            emprestimo_id: dbCharge.emprestimo_id,
            cliente_id: dbCharge.cliente_id,
            charge_id: dbCharge.id,
            woovi_transaction_id: (charge.transactionID as string) || correlationID,
            tipo: "CHARGE",
            valor: dbCharge.valor,
            status: "CONFIRMED",
            confirmed_at: new Date().toISOString(),
            descricao: isDifferentPayer
              ? `⚠️ Pagamento por TERCEIRO - Cobrança ${correlationID}`
              : `Pagamento recebido - Cobrança ${correlationID}`,
          });

          // ── Split: registrar repasse para indicador ─────
          if (dbCharge.split_indicador_id && dbCharge.split_valor) {
            await adminClient.from("woovi_transactions").insert({
              cliente_id: dbCharge.split_indicador_id,
              charge_id: dbCharge.id,
              woovi_transaction_id: `split-${correlationID}`,
              tipo: "SPLIT",
              valor: dbCharge.split_valor,
              status: "CONFIRMED",
              confirmed_at: new Date().toISOString(),
              descricao: `Comissão por indicação - Cobrança ${correlationID}`,
            });

            // Atualizar saldo da subconta do indicador
            const { data: subaccount } = await adminClient
              .from("woovi_subaccounts")
              .select("saldo, total_recebido")
              .eq("cliente_id", dbCharge.split_indicador_id)
              .single();

            if (subaccount) {
              await adminClient
                .from("woovi_subaccounts")
                .update({
                  saldo: subaccount.saldo + dbCharge.split_valor,
                  total_recebido: subaccount.total_recebido + dbCharge.split_valor,
                })
                .eq("cliente_id", dbCharge.split_indicador_id);
            }

            // Atualizar bônus acumulado do cliente indicador
            const { data: indicador } = await adminClient
              .from("clientes")
              .select("bonus_acumulado")
              .eq("id", dbCharge.split_indicador_id)
              .single();

            if (indicador) {
              await adminClient
                .from("clientes")
                .update({
                  bonus_acumulado: indicador.bonus_acumulado + dbCharge.split_valor,
                })
                .eq("id", dbCharge.split_indicador_id);
            }
          }
        }

        break;
      }

      // ══════════════════════════════════════════════════════
      // COBRANÇA EXPIRADA
      // ══════════════════════════════════════════════════════
      case "OPENPIX:CHARGE_EXPIRED": {
        const expCharge = (payload.charge || payload) as Record<string, unknown>;
        const expCorrelationID = expCharge.correlationID as string;

        if (expCorrelationID) {
          await adminClient
            .from("woovi_charges")
            .update({ status: "EXPIRED" })
            .eq("woovi_charge_id", expCorrelationID);
        }

        break;
      }

      // ══════════════════════════════════════════════════════
      // TRANSAÇÃO RECEBIDA (Pix In genérico)
      // ══════════════════════════════════════════════════════
      case "OPENPIX:TRANSACTION_RECEIVED": {
        const tx = (payload.transaction || payload) as Record<string, unknown>;

        await adminClient.from("woovi_transactions").insert({
          woovi_transaction_id: (tx.transactionID as string) || crypto.randomUUID(),
          tipo: "CHARGE",
          valor: ((tx.value as number) || 0) / 100,
          status: "CONFIRMED",
          confirmed_at: new Date().toISOString(),
          end_to_end_id: (tx.endToEndId as string) || null,
          descricao: `Pix recebido - ${tx.endToEndId || ""}`,
        });

        break;
      }

      // ══════════════════════════════════════════════════════
      // ESTORNO
      // ══════════════════════════════════════════════════════
      case "OPENPIX:TRANSACTION_REFUND_RECEIVED": {
        const refundTx = (payload.transaction || payload) as Record<string, unknown>;

        await adminClient.from("woovi_transactions").insert({
          woovi_transaction_id: (refundTx.transactionID as string) || crypto.randomUUID(),
          tipo: "CHARGE",
          valor: ((refundTx.value as number) || 0) / 100,
          status: "REFUNDED",
          confirmed_at: new Date().toISOString(),
          descricao: `Estorno recebido`,
        });

        break;
      }

      // ══════════════════════════════════════════════════════
      // COBRANÇA CRIADA (confirmação de criação externa)
      // ══════════════════════════════════════════════════════
      case "OPENPIX:CHARGE_CREATED": {
        const newCharge = (payload.charge || payload) as Record<string, unknown>;
        const newCorrelationID = newCharge.correlationID as string;

        if (newCorrelationID) {
          // Verificar se já existe no banco (criada via API)
          const { data: existing } = await adminClient
            .from("woovi_charges")
            .select("id")
            .eq("woovi_charge_id", newCorrelationID)
            .single();

          if (existing) {
            // Já existe — atualizar com dados da Woovi (QR Code, etc.)
            await adminClient
              .from("woovi_charges")
              .update({
                status: "ACTIVE",
                br_code: (newCharge.brCode as string) || null,
                qr_code_image: (newCharge.qrCodeImage as string) || null,
                payment_link: (newCharge.paymentLinkUrl as string) || null,
                woovi_txid: (newCharge.transactionID as string) || null,
              })
              .eq("woovi_charge_id", newCorrelationID);
          }
          // Se não existe, foi criada diretamente no painel Woovi — apenas logar
        }

        break;
      }

      // ══════════════════════════════════════════════════════
      // ESTORNO RECEBIDO CONFIRMADO
      // ══════════════════════════════════════════════════════
      case "PIX_TRANSACTION_REFUND_RECEIVED_CONFIRMED": {
        const refundConfirmed = (payload.transaction || payload) as Record<string, unknown>;
        const refundEndToEnd = (refundConfirmed.endToEndId as string) || null;

        await adminClient.from("woovi_transactions").insert({
          woovi_transaction_id: (refundConfirmed.transactionID as string) || crypto.randomUUID(),
          tipo: "CHARGE",
          valor: ((refundConfirmed.value as number) || 0) / 100,
          status: "REFUNDED",
          confirmed_at: new Date().toISOString(),
          end_to_end_id: refundEndToEnd,
          descricao: `✅ Estorno recebido confirmado`,
        });

        break;
      }

      // ══════════════════════════════════════════════════════
      // REEMBOLSO ENVIADO CONFIRMADO
      // ══════════════════════════════════════════════════════
      case "PIX_TRANSACTION_REFUND_SENT_CONFIRMED": {
        const refundSent = (payload.transaction || payload) as Record<string, unknown>;

        await adminClient.from("woovi_transactions").insert({
          woovi_transaction_id: (refundSent.transactionID as string) || crypto.randomUUID(),
          tipo: "PAYMENT",
          valor: ((refundSent.value as number) || 0) / 100,
          status: "REFUNDED",
          confirmed_at: new Date().toISOString(),
          end_to_end_id: (refundSent.endToEndId as string) || null,
          descricao: `✅ Reembolso enviado confirmado`,
        });

        break;
      }

      // ══════════════════════════════════════════════════════
      // ESTORNO RECEBIDO REJEITADO
      // ══════════════════════════════════════════════════════
      case "PIX_TRANSACTION_REFUND_RECEIVED_REJECTED": {
        const refundRejected = (payload.transaction || payload) as Record<string, unknown>;

        await adminClient.from("woovi_transactions").insert({
          woovi_transaction_id: (refundRejected.transactionID as string) || crypto.randomUUID(),
          tipo: "CHARGE",
          valor: ((refundRejected.value as number) || 0) / 100,
          status: "FAILED",
          confirmed_at: new Date().toISOString(),
          descricao: `❌ Estorno recebido REJEITADO`,
        });

        break;
      }

      // ══════════════════════════════════════════════════════
      // REEMBOLSO ENVIADO REJEITADO
      // ══════════════════════════════════════════════════════
      case "PIX_TRANSACTION_REFUND_SENT_REJECTED": {
        const refundSentRejected = (payload.transaction || payload) as Record<string, unknown>;

        await adminClient.from("woovi_transactions").insert({
          woovi_transaction_id: (refundSentRejected.transactionID as string) || crypto.randomUUID(),
          tipo: "PAYMENT",
          valor: ((refundSentRejected.value as number) || 0) / 100,
          status: "FAILED",
          confirmed_at: new Date().toISOString(),
          descricao: `❌ Reembolso enviado REJEITADO`,
        });

        break;
      }

      default:
        console.log(`Evento Woovi não tratado: ${event}`);
    }

    // Marcar webhook como processado
    if (logId) {
      await adminClient
        .from("woovi_webhooks_log")
        .update({ processed: true })
        .eq("id", logId);
    }

    return jsonResponse({ success: true, event });
  } catch (err) {
    console.error("Erro ao processar webhook Woovi:", err);

    // Marcar erro no log
    if (logId) {
      await adminClient
        .from("woovi_webhooks_log")
        .update({
          processed: false,
          error_message: err instanceof Error ? err.message : "Erro desconhecido",
        })
        .eq("id", logId);
    }

    // Retornar 200 para evitar retentativas da Woovi
    return jsonResponse({
      success: false,
      error: err instanceof Error ? err.message : "Erro interno",
    });
  }
});
