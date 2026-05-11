/**
 * Edge Function: notify-verification-submitted
 *
 * Notifica o cliente via WhatsApp após o envio bem-sucedido dos dados de
 * verificação de identidade (vídeos + chave PIX).
 *
 * Body esperado:
 * { analise_id: string }
 *
 * Endpoint público (sem JWT) — chamado pela página /verify-identity após submit.
 * A autenticação é feita pelo analise_id (UUID privado, enviado por WhatsApp).
 *
 * Deploy: supabase functions deploy notify-verification-submitted --no-verify-jwt
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const CONFIRMATION_MESSAGE =
  "✅ *Recebemos seus dados!*\n\n" +
  "Recebemos seus dados enviados, se estiver tudo certo, seu empréstimo será aprovado.\n\n" +
  "Lembre-se que a chave PIX foi verificada por você no ato do envio, pois será para ela que o envio dos valores irão.\n\n" +
  "_Casa da moeda agradece a sua preferência!_ 🪙";

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

    const { analise_id } = await req.json();
    if (!analise_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Campo obrigatório: analise_id" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Buscar análise + cliente ──
    const { data: analise, error: analiseErr } = await adminClient
      .from("analises_credito")
      .select("id, cliente_nome, cliente_id, cpf")
      .eq("id", analise_id)
      .single();

    if (analiseErr || !analise) {
      return new Response(
        JSON.stringify({ success: false, error: "Análise não encontrada" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar telefone (via cliente_id, fallback CPF)
    let telefone: string | null = null;
    if (analise.cliente_id) {
      const { data: cliente } = await adminClient
        .from("clientes")
        .select("telefone")
        .eq("id", analise.cliente_id)
        .single();
      telefone = cliente?.telefone ?? null;
    }
    if (!telefone && analise.cpf) {
      const { data: clienteByCpf } = await adminClient
        .from("clientes")
        .select("telefone")
        .eq("cpf", analise.cpf)
        .limit(1)
        .single();
      telefone = clienteByCpf?.telefone ?? null;
    }

    if (!telefone) {
      return new Response(
        JSON.stringify({ success: false, error: "Cliente sem telefone cadastrado" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Buscar instância WhatsApp conectada ──
    const { data: allInstancias } = await adminClient
      .from("whatsapp_instancias")
      .select("*");

    const CONNECTED = ["conectado", "conectada", "open", "connected"];
    const instancia =
      allInstancias?.find(
        (i: any) => i.is_system && CONNECTED.includes((i.status ?? "").toLowerCase())
      ) ??
      allInstancias?.find((i: any) =>
        CONNECTED.includes((i.status ?? "").toLowerCase())
      );

    if (!instancia) {
      return new Response(
        JSON.stringify({ success: false, error: "Nenhuma instância WhatsApp conectada" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const envUrl = Deno.env.get("EVOLUTION_API_URL");
    const baseUrl = (envUrl || instancia.evolution_url || "").replace(/\/$/, "");
    if (!baseUrl || !instancia.instance_token) {
      return new Response(
        JSON.stringify({ success: false, error: "Instância sem URL/token" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Normalizar telefone (DDI 55) ──
    let formattedNumber = telefone.replace(/\D/g, "");
    if (
      formattedNumber.length >= 10 &&
      formattedNumber.length <= 11 &&
      !formattedNumber.startsWith("55")
    ) {
      formattedNumber = "55" + formattedNumber;
    }

    // ── Enviar via Evolution ──
    const evolutionEndpoint = `${baseUrl}/message/sendText/${encodeURIComponent(instancia.instance_name)}`;
    const evolutionBody = {
      number: formattedNumber,
      textMessage: { text: CONFIRMATION_MESSAGE },
      text: CONFIRMATION_MESSAGE,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20_000);

    let evoRes: Response;
    try {
      evoRes = await fetch(evolutionEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: instancia.instance_token,
        },
        body: JSON.stringify(evolutionBody),
        signal: controller.signal,
      });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      const isTimeout = (fetchErr as Error)?.name === "AbortError";
      const errMsg = isTimeout
        ? "Timeout ao conectar na Evolution API (>20s)"
        : `Erro de conexão: ${String(fetchErr)}`;

      await adminClient.from("whatsapp_mensagens_log").insert({
        instancia_id: instancia.id,
        telefone: formattedNumber,
        conteudo: CONFIRMATION_MESSAGE,
        tipo: "text",
        direcao: "enviada",
        status: "failed",
        metadata: { context: "verification_submitted", analise_id, error: errMsg },
      });

      return new Response(
        JSON.stringify({ success: false, error: errMsg }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    clearTimeout(timeoutId);

    const evoData = await evoRes.text();
    let evoSuccess = evoRes.ok;
    if (evoData.trim().startsWith("<!") || evoData.trim().startsWith("<html")) {
      evoSuccess = false;
    }

    await adminClient.from("whatsapp_mensagens_log").insert({
      instancia_id: instancia.id,
      cliente_id: analise.cliente_id,
      telefone: formattedNumber,
      conteudo: CONFIRMATION_MESSAGE,
      tipo: "text",
      direcao: "enviada",
      status: evoSuccess ? "sent" : "failed",
      metadata: {
        context: "verification_submitted",
        analise_id,
        evolution_status: evoRes.status,
        evolution_response: evoData.slice(0, 500),
      },
    });

    return new Response(
      JSON.stringify({
        success: evoSuccess,
        message: evoSuccess
          ? `Mensagem de confirmação enviada para ${formattedNumber}`
          : "Falha ao enviar mensagem de confirmação",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("notify-verification-submitted error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : "Erro interno",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
