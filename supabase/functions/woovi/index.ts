/**
 * Edge Function: woovi
 *
 * Centraliza todas as chamadas à API da Woovi (OpenPix).
 * Ações suportadas:
 *   - create_charge      → Criar cobrança Pix (para receber parcela)
 *   - get_charge          → Consultar status de uma cobrança
 *   - create_payment      → Criar pagamento Pix (para liberar empréstimo)
 *   - get_balance         → Consultar saldo da conta principal
 *   - create_subaccount   → Criar subconta para indicador
 *   - get_subaccount      → Consultar subconta
 *   - withdraw_subaccount → Solicitar saque de subconta
 *   - get_transactions    → Listar transações
 *
 * Body esperado:
 * {
 *   action: string,
 *   ...params (variam por ação)
 * }
 *
 * ⚠️  Deploy SEMPRE com --no-verify-jwt!
 *     Auth é feita internamente via perfil do usuário.
 *
 * Deploy: supabase functions deploy woovi --no-verify-jwt
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// Sandbox: api.woovi-sandbox.com | Produção: api.openpix.com.br
const WOOVI_API_BASE = Deno.env.get("WOOVI_API_URL") || "https://api.woovi-sandbox.com/api/v1";

interface WooviRequestInit {
  method: string;
  path: string;
  body?: Record<string, unknown>;
}

async function wooviRequest({ method, path, body }: WooviRequestInit) {
  const appId = Deno.env.get("WOOVI_APP_ID");
  if (!appId) {
    throw new Error("WOOVI_APP_ID não configurado nos secrets do Supabase");
  }

  const url = `${WOOVI_API_BASE}${path}`;
  const headers: Record<string, string> = {
    Authorization: appId,
    "Content-Type": "application/json",
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const data = await response.json();

    if (!response.ok) {
      const errMsg = data?.error || data?.message || data?.errors?.[0]?.message || '';
      throw new Error(
        errMsg
          ? `Woovi API (${response.status}): ${errMsg}`
          : `Woovi API error: ${response.status} — verifique se WOOVI_APP_ID está correto e a conta está ativa`
      );
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── Auth: verificar JWT e role ────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return errorResponse("Token não fornecido", 401);
    }

    const jwt = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await adminClient.auth.getUser(jwt);

    if (authError || !user) {
      return errorResponse("Token inválido", 401);
    }

    const { data: profile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !["admin", "gerencia"].includes(profile.role)) {
      return errorResponse("Permissão negada — requer admin ou gerência", 403);
    }

    // ── Parse body ────────────────────────────────────────
    const body = await req.json();
    const { action } = body;

    if (!action) {
      return errorResponse("Campo 'action' é obrigatório");
    }

    // ── Actions ───────────────────────────────────────────

    switch (action) {
      // ══════════════════════════════════════════════════════
      // CRIAR COBRANÇA — Receber pagamento de parcela
      // ══════════════════════════════════════════════════════
      case "create_charge": {
        const {
          parcela_id,
          emprestimo_id,
          cliente_id,
          valor,
          descricao,
          cliente_nome,
          cliente_cpf,
          expiration_minutes = 1440, // 24h default
          // Split (opcional)
          split_indicador_id,
          split_valor,
          split_woovi_account_id,
        } = body;

        if (!valor || !cliente_id) {
          return errorResponse("Campos obrigatórios: valor, cliente_id");
        }

        // Valor em centavos para a Woovi
        const valorCentavos = Math.round(valor * 100);
        const correlationID = crypto.randomUUID();

        const chargePayload: Record<string, unknown> = {
          correlationID,
          value: valorCentavos,
          comment: descricao || `Parcela - ${cliente_nome || "Cliente"}`,
          expiresIn: expiration_minutes * 60, // segundos
        };

        // Customer (opcional mas recomendado)
        if (cliente_nome) {
          chargePayload.customer = {
            name: cliente_nome,
            ...(cliente_cpf ? { taxID: cliente_cpf.replace(/\D/g, "") } : {}),
          };
        }

        // Split de pagamento (comissão para indicador)
        if (split_woovi_account_id && split_valor) {
          const splitCentavos = Math.round(split_valor * 100);
          chargePayload.splits = [
            {
              pixKey: split_woovi_account_id,
              value: splitCentavos,
            },
          ];
        }

        const wooviResponse = await wooviRequest({
          method: "POST",
          path: "/charge",
          body: chargePayload,
        });

        const charge = wooviResponse.charge;

        // Salvar no banco
        const { data: savedCharge, error: saveError } = await adminClient
          .from("woovi_charges")
          .insert({
            parcela_id: parcela_id || null,
            emprestimo_id: emprestimo_id || null,
            cliente_id,
            woovi_charge_id: correlationID,
            woovi_txid: charge?.transactionID || null,
            valor,
            status: "ACTIVE",
            br_code: charge?.brCode || null,
            qr_code_image: charge?.qrCodeImage || null,
            payment_link: charge?.paymentLinkUrl || null,
            expiration_date: charge?.expiresDate || null,
            split_indicador_id: split_indicador_id || null,
            split_valor: split_valor || null,
          })
          .select()
          .single();

        if (saveError) {
          console.error("Erro ao salvar cobrança:", saveError);
        }

        // Atualizar parcela com o charge ID
        if (parcela_id) {
          await adminClient
            .from("parcelas")
            .update({ woovi_charge_id: correlationID })
            .eq("id", parcela_id);
        }

        return jsonResponse({
          success: true,
          charge: savedCharge,
          woovi: {
            correlationID,
            brCode: charge?.brCode,
            qrCodeImage: charge?.qrCodeImage,
            paymentLinkUrl: charge?.paymentLinkUrl,
            expiresDate: charge?.expiresDate,
          },
        });
      }

      // ══════════════════════════════════════════════════════
      // CONSULTAR COBRANÇA
      // ══════════════════════════════════════════════════════
      case "get_charge": {
        const { charge_id } = body;
        if (!charge_id) {
          return errorResponse("Campo obrigatório: charge_id");
        }

        const wooviResponse = await wooviRequest({
          method: "GET",
          path: `/charge/${charge_id}`,
        });

        return jsonResponse({ success: true, charge: wooviResponse.charge });
      }

      // ══════════════════════════════════════════════════════
      // CRIAR PAGAMENTO PIX — Liberar empréstimo para cliente
      // ══════════════════════════════════════════════════════
      case "create_payment": {
        const {
          emprestimo_id: payEmprestimoId,
          cliente_id: payClienteId,
          valor: payValor,
          pix_key,
          pix_key_type,
          destinatario_nome,
          descricao: payDescricao,
        } = body;

        if (!payValor || !pix_key || !payClienteId) {
          return errorResponse(
            "Campos obrigatórios: valor, pix_key, cliente_id"
          );
        }

        const payValorCentavos = Math.round(payValor * 100);
        const payCorrelationID = crypto.randomUUID();

        const paymentPayload: Record<string, unknown> = {
          correlationID: payCorrelationID,
          value: payValorCentavos,
          destinationAlias: pix_key,
          comment:
            payDescricao ||
            `Liberação de empréstimo - ${destinatario_nome || ""}`,
        };

        const payResponse = await wooviRequest({
          method: "POST",
          path: "/subaccount/withdraw",
          body: paymentPayload,
        });

        // Registrar transação no banco
        const { data: savedTx, error: txError } = await adminClient
          .from("woovi_transactions")
          .insert({
            emprestimo_id: payEmprestimoId || null,
            cliente_id: payClienteId,
            woovi_transaction_id: payCorrelationID,
            tipo: "PAYMENT",
            valor: payValor,
            status: "PENDING",
            pix_key,
            pix_key_type: pix_key_type || null,
            destinatario_nome: destinatario_nome || null,
            descricao:
              payDescricao ||
              `Liberação de empréstimo - ${destinatario_nome || ""}`,
            end_to_end_id: payResponse?.transaction?.endToEndId || null,
          })
          .select()
          .single();

        if (txError) {
          console.error("Erro ao salvar transação:", txError);
        }

        return jsonResponse({
          success: true,
          transaction: savedTx,
          woovi: payResponse,
        });
      }

      // ══════════════════════════════════════════════════════
      // CONSULTAR SALDO DA CONTA PRINCIPAL
      // ══════════════════════════════════════════════════════
      case "get_balance": {
        const balanceResponse = await wooviRequest({
          method: "GET",
          path: "/balance",
        });

        return jsonResponse({
          success: true,
          balance: balanceResponse.balance,
        });
      }

      // ══════════════════════════════════════════════════════
      // CRIAR SUBCONTA (para indicador)
      // ══════════════════════════════════════════════════════
      case "create_subaccount": {
        const {
          cliente_id: subClienteId,
          user_id: subUserId,
          nome: subNome,
          documento: subDocumento,
          pix_key: subPixKey,
        } = body;

        if (!subClienteId || !subNome) {
          return errorResponse("Campos obrigatórios: cliente_id, nome");
        }

        const subPayload: Record<string, unknown> = {
          name: subNome,
          ...(subDocumento
            ? { taxID: subDocumento.replace(/\D/g, "") }
            : {}),
          ...(subPixKey ? { pixKey: subPixKey } : {}),
        };

        const subResponse = await wooviRequest({
          method: "POST",
          path: "/subaccount",
          body: subPayload,
        });

        const subAccount = subResponse.account;

        // Salvar no banco
        const { data: savedSub, error: subError } = await adminClient
          .from("woovi_subaccounts")
          .insert({
            cliente_id: subClienteId,
            user_id: subUserId || null,
            woovi_account_id: subAccount?.accountId || subAccount?.id || "",
            woovi_pix_key: subAccount?.pixKey || subPixKey || null,
            nome: subNome,
            documento: subDocumento || null,
          })
          .select()
          .single();

        if (subError) {
          console.error("Erro ao salvar subconta:", subError);
          return errorResponse(`Erro ao salvar subconta: ${subError.message}`);
        }

        return jsonResponse({
          success: true,
          subaccount: savedSub,
          woovi: subResponse,
        });
      }

      // ══════════════════════════════════════════════════════
      // CONSULTAR SUBCONTA
      // ══════════════════════════════════════════════════════
      case "get_subaccount": {
        const { woovi_account_id } = body;
        if (!woovi_account_id) {
          return errorResponse("Campo obrigatório: woovi_account_id");
        }

        const subBalanceResponse = await wooviRequest({
          method: "GET",
          path: `/subaccount/${woovi_account_id}`,
        });

        // Atualizar saldo cacheado no banco
        if (subBalanceResponse.account) {
          const balanceReais =
            (subBalanceResponse.account.balance || 0) / 100;
          await adminClient
            .from("woovi_subaccounts")
            .update({ saldo: balanceReais })
            .eq("woovi_account_id", woovi_account_id);
        }

        return jsonResponse({
          success: true,
          subaccount: subBalanceResponse.account,
        });
      }

      // ══════════════════════════════════════════════════════
      // SAQUE DE SUBCONTA
      // ══════════════════════════════════════════════════════
      case "withdraw_subaccount": {
        const {
          woovi_account_id: withdrawAccountId,
          valor: withdrawValor,
          pix_key: withdrawPixKey,
        } = body;

        if (!withdrawAccountId || !withdrawValor) {
          return errorResponse(
            "Campos obrigatórios: woovi_account_id, valor"
          );
        }

        const withdrawCentavos = Math.round(withdrawValor * 100);

        const withdrawResponse = await wooviRequest({
          method: "POST",
          path: `/subaccount/${withdrawAccountId}/withdraw`,
          body: {
            value: withdrawCentavos,
            ...(withdrawPixKey
              ? { destinationAlias: withdrawPixKey }
              : {}),
          },
        });

        // Registrar transação
        const { data: subData } = await adminClient
          .from("woovi_subaccounts")
          .select("cliente_id")
          .eq("woovi_account_id", withdrawAccountId)
          .single();

        await adminClient.from("woovi_transactions").insert({
          cliente_id: subData?.cliente_id || null,
          woovi_transaction_id: crypto.randomUUID(),
          tipo: "WITHDRAWAL",
          valor: withdrawValor,
          status: "PENDING",
          pix_key: withdrawPixKey || null,
          descricao: `Saque de subconta ${withdrawAccountId}`,
        });

        return jsonResponse({
          success: true,
          withdrawal: withdrawResponse,
        });
      }

      // ══════════════════════════════════════════════════════
      // LISTAR TRANSAÇÕES
      // ══════════════════════════════════════════════════════
      case "get_transactions": {
        const { start, end, limit = 100 } = body;
        let path = `/transaction?limit=${limit}`;
        if (start) path += `&start=${start}`;
        if (end) path += `&end=${end}`;

        const txResponse = await wooviRequest({
          method: "GET",
          path,
        });

        return jsonResponse({
          success: true,
          transactions: txResponse.transactions,
        });
      }

      // ══════════════════════════════════════════════════════
      // LISTAR COBRANÇAS
      // ══════════════════════════════════════════════════════
      case "list_charges": {
        const { status: chargeStatus, limit: chargeLimit = 100 } = body;
        let chargePath = `/charge?limit=${chargeLimit}`;
        if (chargeStatus) chargePath += `&status=${chargeStatus}`;

        const chargesResponse = await wooviRequest({
          method: "GET",
          path: chargePath,
        });

        return jsonResponse({
          success: true,
          charges: chargesResponse.charges,
        });
      }

      // ══════════════════════════════════════════════════════
      // DELETAR COBRANÇA
      // ══════════════════════════════════════════════════════
      case "delete_charge": {
        const { charge_id: deleteChargeId } = body;
        if (!deleteChargeId) {
          return errorResponse("Campo obrigatório: charge_id");
        }

        await wooviRequest({
          method: "DELETE",
          path: `/charge/${deleteChargeId}`,
        });

        // Atualizar status no banco
        await adminClient
          .from("woovi_charges")
          .update({ status: "EXPIRED" })
          .eq("woovi_charge_id", deleteChargeId);

        return jsonResponse({ success: true });
      }

      // ══════════════════════════════════════════════════════
      // DASHBOARD STATS (banco + API)
      // ══════════════════════════════════════════════════════
      case "get_stats": {
        // Stats do banco
        const { data: dbStats } = await adminClient.rpc(
          "get_woovi_dashboard_stats"
        );

        // Saldo da conta via API
        let saldoConta = 0;
        try {
          const balResp = await wooviRequest({
            method: "GET",
            path: "/balance",
          });
          saldoConta = (balResp.balance || 0) / 100;
        } catch {
          // Se falhar a consulta de saldo, segue com 0
        }

        return jsonResponse({
          success: true,
          stats: {
            ...(dbStats || {}),
            saldo_conta: saldoConta,
          },
        });
      }

      default:
        return errorResponse(`Ação desconhecida: ${action}`);
    }
  } catch (err) {
    console.error("Erro na Edge Function woovi:", err);
    // Retornar 200 com success:false para que o Supabase client repasse o body
    // ao frontend (status 5xx faz o client descartar o body e mostrar erro genérico).
    return jsonResponse({
      error: err instanceof Error ? err.message : "Erro interno",
      success: false,
    });
  }
});
