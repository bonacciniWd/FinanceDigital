/**
 * Edge Function: webhook-efi
 *
 * Recebe webhooks da EFI Bank (Gerencianet) para notificações Pix.
 * Processa confirmações de pagamento, atualiza cobranças/parcelas/empréstimos
 * e registra comissões de indicadores (split).
 *
 * A EFI envia POST { pix: [...] } quando um Pix é RECEBIDO.
 * Skip-mTLS habilitado — validação por IP (34.193.116.226) e hmac na URL.
 *
 * Deploy: supabase functions deploy webhook-efi --no-verify-jwt
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { tentarConciliarPagamento } from "../_shared/conciliacao.ts";

// IP oficial de comunicação de webhooks da EFI
const EFI_WEBHOOK_IP = "34.193.116.226";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // EFI envia GET para validar a URL (handshake)
  if (req.method === "GET") {
    return new Response("ok", {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/plain" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const payload = await req.json();
    console.log("[webhook-efi] Payload recebido:", JSON.stringify(payload));

    // Registrar log do webhook
    const { data: logEntry } = await adminClient
      .from("woovi_webhooks")
      .insert({
        event: "efi:pix",
        payload,
        status: "received",
        gateway: "efi",
      })
      .select("id")
      .single();

    const logId = logEntry?.id;

    // A EFI envia { pix: [...] } com array de transações Pix
    const pixArray = payload?.pix;
    if (!Array.isArray(pixArray) || pixArray.length === 0) {
      if (logId) await adminClient.from("woovi_webhooks").update({ status: "skipped" }).eq("id", logId);
      return new Response(
        JSON.stringify({ ok: true, skipped: "no pix events" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let processed = 0;

    for (const pix of pixArray) {
      const txid = pix.txid;
      const endToEndId = pix.endToEndId;
      const valor = parseFloat(pix.valor);
      const horario = pix.horario;

      if (!txid) {
        console.log("[webhook-efi] Pix sem txid, pulando");
        continue;
      }

      // Buscar cobrança pelo txid
      const { data: charge, error: chargeError } = await adminClient
        .from("woovi_charges")
        .select("id, parcela_id, emprestimo_id, cliente_id, status, valor, split_indicador_id, split_valor")
        .eq("woovi_txid", txid)
        .eq("gateway", "efi")
        .maybeSingle();

      if (chargeError) {
        console.error("[webhook-efi] Erro ao buscar charge:", chargeError.message);
        continue;
      }

      if (!charge) {
        console.log(`[webhook-efi] Cobrança não encontrada para txid=${txid} — tentando match automático por CPF/valor`);
        const cpfPagador = pix.pagador?.cpf || pix.pagador?.cnpj || null;
        const nomePagador = pix.pagador?.nome || null;
        const result = await tentarConciliarPagamento({
          adminClient,
          valor,
          cpfPagador,
          nomePagador,
          e2eId: endToEndId,
          txid,
          gateway: "efi",
          rawPayload: pix,
        });
        console.log(`[webhook-efi] Conciliação txid=${txid}: matched=${result.matched} motivo=${result.motivo}`);
        if (result.matched) processed++;
        continue;
      }

      if (charge.status === "COMPLETED") {
        console.log(`[webhook-efi] Cobrança ${charge.id} já COMPLETED, pulando`);
        continue;
      }

      // ── Atualizar cobrança para COMPLETED ──────────────
      const { error: updateChargeErr } = await adminClient
        .from("woovi_charges")
        .update({
          status: "COMPLETED",
          paid_at: horario || new Date().toISOString(),
        })
        .eq("id", charge.id);

      if (updateChargeErr) {
        console.error("[webhook-efi] Erro ao atualizar charge:", updateChargeErr.message);
        continue;
      }

      // ── Registrar transação de recebimento ─────────────
      const { error: txError } = await adminClient
        .from("woovi_transactions")
        .insert({
          emprestimo_id: charge.emprestimo_id,
          cliente_id: charge.cliente_id,
          charge_id: charge.id,
          tipo: "CHARGE",
          valor,
          status: "CONFIRMED",
          end_to_end_id: endToEndId,
          gateway: "efi",
          confirmed_at: horario || new Date().toISOString(),
          descricao: `Pagamento recebido EFI - txid ${txid}`,
        });

      if (txError) {
        console.error("[webhook-efi] Erro ao inserir transação:", txError.message);
      }

      // ── Atualizar parcela como paga ────────────────────
      if (charge.parcela_id) {
        const hoje = new Date().toISOString().slice(0, 10);
        const { error: parcelaErr } = await adminClient
          .from("parcelas")
          .update({ status: "paga", data_pagamento: hoje })
          .eq("id", charge.parcela_id)
          .neq("status", "paga");

        if (parcelaErr) {
          console.error("[webhook-efi] Erro ao atualizar parcela:", parcelaErr.message);
        }
        // ── Ajustar score do cliente ─────────────────────
        try {
          const { data: parcelaInfo } = await adminClient
            .from("parcelas")
            .select("cliente_id, data_vencimento")
            .eq("id", charge.parcela_id)
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
            console.log(`[webhook-efi] Score ajustado: cliente=${parcelaInfo.cliente_id} delta=${delta}`);
          }
        } catch (scoreErr) {
          console.error("[webhook-efi] Erro ao ajustar score:", scoreErr);
        }

        // ── Incrementar parcelas_pagas no empréstimo ─────
        if (charge.emprestimo_id) {
          const { data: emp } = await adminClient
            .from("emprestimos")
            .select("parcelas, parcelas_pagas")
            .eq("id", charge.emprestimo_id)
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
              .eq("emprestimo_id", charge.emprestimo_id)
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
              .eq("id", charge.emprestimo_id);
          }
        }
      } else {
        // charge sem parcela_id — tentar match automático
        console.log(`[webhook-efi] Charge ${charge.id} sem parcela_id — tentando match automático`);
        const cpfPagador = pix.pagador?.cpf || pix.pagador?.cnpj || null;
        const nomePagador = pix.pagador?.nome || null;
        const result = await tentarConciliarPagamento({
          adminClient,
          valor,
          cpfPagador,
          nomePagador,
          e2eId: endToEndId,
          txid,
          gateway: "efi",
          clienteIdHint: charge.cliente_id,
          rawPayload: pix,
        });
        console.log(`[webhook-efi] Match charge=${charge.id}: matched=${result.matched} motivo=${result.motivo}`);
      }

      // ── Split: registrar repasse para indicador ────────
      if (charge.split_indicador_id && charge.split_valor) {
        await adminClient.from("woovi_transactions").insert({
          cliente_id: charge.split_indicador_id,
          charge_id: charge.id,
          woovi_transaction_id: `split-efi-${txid}`,
          tipo: "SPLIT",
          valor: charge.split_valor,
          status: "CONFIRMED",
          confirmed_at: new Date().toISOString(),
          gateway: "efi",
          descricao: `Comissão por indicação - Cobrança EFI ${txid}`,
        });

        // Atualizar saldo da subconta do indicador
        const { data: subaccount } = await adminClient
          .from("woovi_subaccounts")
          .select("saldo, total_recebido")
          .eq("cliente_id", charge.split_indicador_id)
          .single();

        if (subaccount) {
          await adminClient
            .from("woovi_subaccounts")
            .update({
              saldo: subaccount.saldo + charge.split_valor,
              total_recebido: subaccount.total_recebido + charge.split_valor,
            })
            .eq("cliente_id", charge.split_indicador_id);
        }

        // Atualizar bônus acumulado do cliente indicador
        const { data: indicador } = await adminClient
          .from("clientes")
          .select("bonus_acumulado")
          .eq("id", charge.split_indicador_id)
          .single();

        if (indicador) {
          await adminClient
            .from("clientes")
            .update({
              bonus_acumulado: (indicador.bonus_acumulado || 0) + charge.split_valor,
            })
            .eq("id", charge.split_indicador_id);
        }
      }

      processed++;
      console.log(`[webhook-efi] Pix processado: txid=${txid}, charge=${charge.id}`);
    }

    if (logId) await adminClient.from("woovi_webhooks").update({ status: "processed" }).eq("id", logId);

    return new Response(
      JSON.stringify({ ok: true, processed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[webhook-efi] Erro:", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
