/**
 * Edge Function: approve-credit
 *
 * Aprova uma análise de crédito verificada e libera o empréstimo via Woovi Pix.
 * Fluxo:
 * 1. Valida que a verificação de identidade está aprovada
 * 2. Valida que o analista não é o próprio solicitante
 * 3. Cria empréstimo na tabela emprestimos
 * 4. Dispara pagamento Pix via Woovi
 * 5. Atualiza status da análise para 'aprovado'
 * 6. Registra log de auditoria
 *
 * Body esperado:
 * {
 *   analise_id: string,        // UUID da análise de crédito
 *   pix_key: string,           // chave Pix do cliente
 *   pix_key_type: "cpf" | "cnpj" | "email" | "phone" | "random",
 * }
 *
 * Deploy: supabase functions deploy approve-credit --no-verify-jwt
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const WOOVI_API_BASE = Deno.env.get("WOOVI_API_URL") || "https://api.woovi-sandbox.com/api/v1";

async function wooviPayment(body: Record<string, unknown>) {
  const appId = Deno.env.get("WOOVI_APP_ID");
  if (!appId) {
    throw new Error("WOOVI_APP_ID não configurado");
  }

  const response = await fetch(`${WOOVI_API_BASE}/payment`, {
    method: "POST",
    headers: {
      Authorization: appId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || `Woovi API error: ${response.status}`);
  }
  return data;
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

    // ── Autenticar chamador ─────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authErr } = await adminClient.auth.getUser(jwt);
    if (authErr || !caller) {
      return new Response(
        JSON.stringify({ error: "Token inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verificar role (admin ou gerencia)
    const { data: profile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", caller.id)
      .single();

    if (!profile || !["admin", "gerencia"].includes(profile.role)) {
      return new Response(
        JSON.stringify({ error: "Permissão insuficiente" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Body ──────────────────────────────────────────────
    const { analise_id, pix_key, pix_key_type } = await req.json();

    if (!analise_id || !pix_key || !pix_key_type) {
      return new Response(
        JSON.stringify({ error: "Campos obrigatórios: analise_id, pix_key, pix_key_type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Buscar análise ──────────────────────────────────
    const { data: analise, error: analiseErr } = await adminClient
      .from("analises_credito")
      .select("*, identity_verifications:verification_id(*)")
      .eq("id", analise_id)
      .single();

    if (analiseErr || !analise) {
      return new Response(
        JSON.stringify({ error: "Análise não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (analise.status !== "em_analise" && analise.status !== "pendente") {
      return new Response(
        JSON.stringify({ error: `Análise em status inválido: ${analise.status}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Verificar identidade aprovada ───────────────────
    const verification = analise.identity_verifications;
    if (analise.verification_required && (!verification || verification.status !== "approved")) {
      return new Response(
        JSON.stringify({ error: "Verificação de identidade não aprovada" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Regra: analista não pode aprovar própria análise ─
    if (verification?.user_id === caller.id) {
      return new Response(
        JSON.stringify({ error: "Analista não pode aprovar a própria solicitação" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Criar empréstimo ────────────────────────────────
    const { data: emprestimo, error: empErr } = await adminClient
      .from("emprestimos")
      .insert({
        cliente_id: analise.cliente_id,
        valor: analise.valor_solicitado,
        taxa_juros: 0.025, // 2.5% default
        status: "ativo",
        data_contratacao: new Date().toISOString().split("T")[0],
        analise_id: analise.id,
      })
      .select("id")
      .single();

    if (empErr) throw empErr;

    // ── Liberar via Woovi Pix ───────────────────────────
    let paymentResult = null;
    try {
      const correlationID = `credit-${analise.id}-${Date.now()}`;
      paymentResult = await wooviPayment({
        value: Math.round(analise.valor_solicitado * 100), // centavos
        destinationAlias: pix_key,
        destinationAliasType: pix_key_type.toUpperCase(),
        correlationID,
        comment: `Liberação de crédito - ${analise.cliente_nome}`,
      });

      // Registrar transação
      await adminClient.from("woovi_transactions").insert({
        emprestimo_id: emprestimo!.id,
        cliente_id: analise.cliente_id,
        woovi_transaction_id: paymentResult?.payment?.transactionID ?? correlationID,
        tipo: "payment",
        valor: analise.valor_solicitado,
        status: "pending",
        pix_key: pix_key,
        pix_key_type: pix_key_type,
        destinatario_nome: analise.cliente_nome,
        descricao: `Liberação de crédito aprovado - Análise ${analise.id}`,
      });
    } catch (pixErr) {
      // Even if Pix fails, the credit is approved — payment can be retried
      console.error("Woovi payment error:", pixErr);
    }

    // ── Atualizar análise para aprovado ─────────────────
    await adminClient
      .from("analises_credito")
      .update({
        status: "aprovado",
        analista_id: caller.id,
        data_resultado: new Date().toISOString(),
      })
      .eq("id", analise_id);

    // ── Log de auditoria ────────────────────────────────
    if (verification) {
      await adminClient.from("verification_logs").insert({
        verification_id: verification.id,
        analise_id,
        action: "credit_approved_and_released",
        performed_by: caller.id,
        details: {
          emprestimo_id: emprestimo!.id,
          valor: analise.valor_solicitado,
          pix_key,
          pix_payment_success: !!paymentResult,
        },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        emprestimo_id: emprestimo!.id,
        payment_status: paymentResult ? "initiated" : "failed_will_retry",
        message: "Crédito aprovado e empréstimo criado com sucesso",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("approve-credit error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
