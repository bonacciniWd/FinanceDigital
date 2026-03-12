/**
 * Edge Function: manage-instance
 *
 * Gerencia instâncias WhatsApp via Evolution API:
 *   - action: "create"      → Cria instância na Evolution + salva no banco
 *   - action: "connect"     → Gera QR Code para conexão
 *   - action: "disconnect"  → Desconecta a instância
 *   - action: "status"      → Verifica status da conexão
 *   - action: "delete"      → Remove instância da Evolution + banco
 *   - action: "restart"     → Reinicia a instância
 *   - action: "set_webhook" → Configura webhook na Evolution
 *   - action: "sync_all"    → Importa todas as instâncias do Fly.io, upserta no banco
 *                             e configura webhook automaticamente em cada uma.
 *                             Ideal após troca de URL (ngrok → Fly.io) ou restart.
 *
 * Body:
 * {
 *   action: string,
 *   instancia_id?: string,           // UUID (para ações em instância existente)
 *   instance_name?: string,          // nome (para create)
 *   evolution_url?: string,          // URL base da Evolution API
 *   evolution_global_apikey?: string, // API key global da Evolution
 *   departamento?: string,           // departamento (para create)
 *   phone_number?: string,           // telefone (para create)
 * }
 *
 * ⚠️  IMPORTANTE: Deploy SEMPRE com --no-verify-jwt!
 *     O Supabase Auth gera JWTs com algoritmo ES256 (assimétrico), mas o gateway
 *     das Edge Functions valida com HS256 (simétrico, via JWT_SECRET). Isso causa
 *     erro 401 "Invalid JWT" no gateway ANTES de chegar na função.
 *     A autenticação é feita internamente via adminClient.auth.getUser(jwt).
 *
 * Deploy: supabase functions deploy manage-instance --no-verify-jwt
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

/**
 * Configura webhook na Evolution API com compatibilidade v1 e v2.
 * Tenta formato v1 (flat body, webhook_base64, eventos UPPERCASE) primeiro,
 * depois v2 (nested webhook, webhookBase64, eventos lowercase) como fallback.
 */
async function configureWebhook(
  baseUrl: string,
  instanceName: string,
  webhookUrl: string,
  apikey: string
): Promise<{ ok: boolean; status: number; format: string }> {
  const v1Events = ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE", "QRCODE_UPDATED"];
  const v2Events = ["messages.upsert", "messages.update", "connection.update", "qrcode.updated"];

  // Tentar formato v1 primeiro (Evolution API v1.x)
  try {
    const v1Resp = await fetch(`${baseUrl}/webhook/set/${instanceName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey },
      body: JSON.stringify({
        enabled: true,
        url: webhookUrl,
        webhook_base64: true,
        events: v1Events,
        webhook_by_events: false,
      }),
    });
    console.log(`[configureWebhook] v1 format ${instanceName}: HTTP ${v1Resp.status}`);
    if (v1Resp.ok) return { ok: true, status: v1Resp.status, format: "v1" };
  } catch (e) {
    console.error(`[configureWebhook] v1 format ${instanceName} error:`, e);
  }

  // Fallback: formato v2 (Evolution API v2.x)
  try {
    const v2Resp = await fetch(`${baseUrl}/webhook/set/${instanceName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey },
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: webhookUrl,
          webhookBase64: true,
          events: v2Events,
          webhook_by_events: false,
        },
      }),
    });
    console.log(`[configureWebhook] v2 format ${instanceName}: HTTP ${v2Resp.status}`);
    return { ok: v2Resp.ok, status: v2Resp.status, format: "v2" };
  } catch (e) {
    console.error(`[configureWebhook] v2 format ${instanceName} error:`, e);
    return { ok: false, status: 0, format: "error" };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    // O SDK Supabase envia `Authorization: Bearer <jwt>` automaticamente.
    // Verificamos apenas que o usuário está autenticado — as operações internas
    // já usam o adminClient (service role) para contornar RLS.
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Não autenticado. Faça login para continuar." }),
        { status: 401, headers: jsonHeaders }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const jwt = authHeader.replace("Bearer ", "");

    // Permitir service_role key como autenticação (para chamadas de manutenção/CLI)
    // Verificar pelo payload do JWT se é service_role
    let isServiceRole = false;
    try {
      const payloadB64 = jwt.split(".")[1] || "";
      const payload = JSON.parse(atob(payloadB64));
      isServiceRole = payload?.role === "service_role";
    } catch { /* não é JWT válido */ }

    if (!isServiceRole) {
      const { data: { user: caller }, error: authError } = await adminClient.auth.getUser(jwt);
      if (authError || !caller) {
        return new Response(
          JSON.stringify({ error: "Sessão expirada. Faça login novamente." }),
          { status: 401, headers: jsonHeaders }
        );
      }
    }

    const body = await req.json();
    const { action } = body;

    // ── CREATE ────────────────────────────────────────────
    if (action === "create") {
      const {
        instance_name,
        evolution_url,
        evolution_global_apikey,
        departamento = "geral",
        phone_number,
      } = body;

      // URL e API key: body > env secrets
      const resolvedUrl = (evolution_url || Deno.env.get("EVOLUTION_API_URL") || "").replace(/\/$/, "");
      const resolvedApikey = evolution_global_apikey || Deno.env.get("EVOLUTION_API_KEY") || "";

      if (!instance_name) {
        return new Response(
          JSON.stringify({ error: "instance_name é obrigatório" }),
          { status: 400, headers: jsonHeaders }
        );
      }

      if (!resolvedUrl || !resolvedApikey) {
        return new Response(
          JSON.stringify({ error: "Evolution API não configurada. Defina EVOLUTION_API_URL e EVOLUTION_API_KEY nos secrets do Supabase, ou envie evolution_url e evolution_global_apikey no body." }),
          { status: 400, headers: jsonHeaders }
        );
      }

      const baseUrl = resolvedUrl;

      // Criar instância na Evolution API (timeout de 20s)
      const webhookUrl = `${supabaseUrl}/functions/v1/webhook-whatsapp`;
      const createController = new AbortController();
      const createTimeout = setTimeout(() => createController.abort(), 20_000);

      let evoRespRaw: Response;
      try {
        evoRespRaw = await fetch(`${baseUrl}/instance/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: resolvedApikey },
          body: JSON.stringify({ instanceName: instance_name, qrcode: true, reject_call: false }),
          signal: createController.signal,
        });
      } catch (fetchErr) {
        clearTimeout(createTimeout);
        const isTimeout = (fetchErr as Error)?.name === "AbortError";
        return new Response(
          JSON.stringify({ error: isTimeout
            ? "Timeout ao conectar na Evolution API (>20s). Verifique se a URL está correta e o servidor está acessível."
            : `Erro de conexão com a Evolution API: ${String(fetchErr)}. Verifique a URL informada.`
          }),
          { status: 502, headers: jsonHeaders }
        );
      }
      clearTimeout(createTimeout);

      const evoResp = evoRespRaw;
      let evoData: Record<string, unknown> = {};
      const evoText = await evoResp.text();

      // Detectar resposta HTML (ngrok offline, proxy, URL errada, etc.)
      const isHtml = evoText.trimStart().startsWith("<!") || evoText.trimStart().startsWith("<html");
      if (isHtml) {
        return new Response(
          JSON.stringify({
            error: `A URL da Evolution API retornou uma página HTML em vez de JSON (HTTP ${evoResp.status}). ` +
              `Verifique se a URL está correta. Se estiver usando ngrok, o túnel pode ter mudado — abra o terminal do ngrok e copie a URL atual.`,
          }),
          { status: 502, headers: jsonHeaders }
        );
      }

      try {
        evoData = JSON.parse(evoText);
      } catch {
        console.error("[manage-instance] Evolution API response (não-JSON):", evoText.slice(0, 500));
      }

      console.log(`[manage-instance] create: status=${evoResp.status}`, JSON.stringify(evoData).slice(0, 500));

      if (!evoResp.ok) {
        // ── Se a instância já existe na Evolution, importar em vez de falhar ──
        const evoMessages = ((evoData as Record<string, unknown>)?.response as Record<string, unknown>)?.message;
        const alreadyExists = Array.isArray(evoMessages) && evoMessages.some(
          (m: unknown) => typeof m === 'string' && (m.includes('already exists') || m.includes('Token already'))
        );

        if (alreadyExists) {
          console.log(`[manage-instance] Instância "${instance_name}" já existe na Evolution. Importando...`);

          // Buscar dados da instância existente
          let existingToken = resolvedApikey;
          let existingStatus = "desconectado";
          try {
            const fetchResp = await fetch(`${baseUrl}/instance/fetchInstances`, {
              method: "GET",
              headers: { apikey: resolvedApikey },
            });
            if (fetchResp.ok) {
              const allInstances = await fetchResp.json();
              const found = (Array.isArray(allInstances) ? allInstances : []).find(
                (i: Record<string, unknown>) =>
                  (i.instance as Record<string, unknown>)?.instanceName === instance_name
              );
              if (found) {
                existingToken = (found.instance as Record<string, unknown>)?.token as string
                  || (found.hash as Record<string, unknown>)?.apikey as string
                  || resolvedApikey;
                const state = (found.instance as Record<string, unknown>)?.status as string
                  || (found.instance as Record<string, unknown>)?.state as string
                  || "unknown";
                existingStatus = state === "open" ? "conectado" : "desconectado";
              }
            }
          } catch (e) {
            console.error("[manage-instance] Erro ao buscar instância existente:", e);
          }

          // Configurar webhook
          try {
            const wbResult = await configureWebhook(baseUrl, instance_name, webhookUrl, existingToken);
            console.log(`[manage-instance] create (existing) webhook: ${wbResult.format} ok=${wbResult.ok}`);
          } catch (wbErr) {
            console.error("[manage-instance] Erro ao configurar webhook (existing):", wbErr);
          }

          // Upsert no banco (pode já existir no DB também)
          const { data: upserted, error: upsertErr } = await adminClient
            .from("whatsapp_instancias")
            .upsert(
              {
                instance_name,
                evolution_url: baseUrl,
                instance_token: existingToken,
                departamento,
                phone_number: phone_number || null,
                status: existingStatus,
                webhook_url: webhookUrl,
                qr_code: null,
              },
              { onConflict: "instance_name", ignoreDuplicates: false }
            )
            .select()
            .single();

          if (upsertErr) {
            return new Response(
              JSON.stringify({ error: "Instância existe na Evolution mas falhou ao salvar no banco", details: upsertErr.message }),
              { status: 500, headers: jsonHeaders }
            );
          }

          return new Response(
            JSON.stringify({ success: true, instancia: upserted, imported: true, status: existingStatus }),
            { status: 200, headers: jsonHeaders }
          );
        }

        // Outro erro qualquer — retornar normalmente
        const evoError = (evoData as Record<string, unknown>)?.message
          || (evoData as Record<string, unknown>)?.error
          || evoText.slice(0, 300)
          || `HTTP ${evoResp.status}`;
        return new Response(
          JSON.stringify({
            error: `Falha ao criar instância na Evolution: ${evoError}`,
            details: evoData,
            evolution_status: evoResp.status,
          }),
          { status: 502, headers: jsonHeaders }
        );
      }

      // Token da instância retornado pela Evolution (v2: hash é string)
      const instanceToken = typeof evoData?.hash === 'string'
        ? evoData.hash
        : ((evoData?.hash as Record<string, unknown>)?.apikey || evoData?.token || resolvedApikey);
      const qrCode = (evoData?.qrcode as Record<string, unknown>)?.base64 
        || (evoData as Record<string, unknown>)?.base64
        || null;

      // ── Configurar Webhook separadamente (compatível v1 e v2) ──
      try {
        const wbResult = await configureWebhook(baseUrl, instance_name, webhookUrl, instanceToken || resolvedApikey);
        console.log(`[manage-instance] create webhook: ${wbResult.format} ok=${wbResult.ok}`);
      } catch (wbErr) {
        console.error("[manage-instance] Erro ao configurar webhook:", wbErr);
        // Não falha a criação — webhook pode ser configurado depois
      }

      // Salvar no banco (upsert para evitar conflito se já existir)
      const { data: newInstance, error: insertErr } = await adminClient
        .from("whatsapp_instancias")
        .upsert(
          {
            instance_name,
            evolution_url: baseUrl,
            instance_token: instanceToken,
            departamento,
            phone_number: phone_number || null,
            status: qrCode ? "qr_pendente" : "desconectado",
            qr_code: qrCode,
            webhook_url: webhookUrl,
          },
          { onConflict: "instance_name", ignoreDuplicates: false }
        )
        .select()
        .single();

      if (insertErr) {
        return new Response(
          JSON.stringify({ error: "Instância criada na Evolution mas falhou ao salvar no banco", details: insertErr.message }),
          { status: 500, headers: jsonHeaders }
        );
      }

      return new Response(
        JSON.stringify({ success: true, instancia: newInstance, qr_code: qrCode }),
        { status: 201, headers: jsonHeaders }
      );
    }

    // ── CONNECT (gerar QR Code) ───────────────────────────
    if (action === "connect") {
      const { instancia_id } = body;
      if (!instancia_id) {
        return new Response(
          JSON.stringify({ error: "instancia_id é obrigatório" }),
          { status: 400, headers: jsonHeaders }
        );
      }

      const { data: inst, error: instErr } = await adminClient
        .from("whatsapp_instancias")
        .select("*")
        .eq("id", instancia_id)
        .single();

      if (instErr || !inst) {
        return new Response(
          JSON.stringify({ error: "Instância não encontrada" }),
          { status: 404, headers: jsonHeaders }
        );
      }

      const baseUrl = (Deno.env.get("EVOLUTION_API_URL") || inst.evolution_url || "").replace(/\/$/, "");

      // Verificar se já está conectada antes de gerar novo QR
      // (chamar connect em instância já conectada pode desconectá-la)
      try {
        const stateResp = await fetch(
          `${baseUrl}/instance/connectionState/${inst.instance_name}`,
          { method: "GET", headers: { apikey: inst.instance_token || "" } }
        );
        const stateData = await stateResp.json();
        const currentState = stateData?.instance?.state || stateData?.state || "unknown";

        if (currentState === "open") {
          // Já conectada — sincronizar DB e retornar sem gerar novo QR
          await adminClient
            .from("whatsapp_instancias")
            .update({ status: "conectado", qr_code: null })
            .eq("id", instancia_id);

          return new Response(
            JSON.stringify({ success: true, qr_code: null, status: "conectado", already_connected: true }),
            { headers: jsonHeaders }
          );
        }
      } catch {
        // Se falhar ao checar status, continua e tenta gerar QR mesmo assim
      }

      const evoResp = await fetch(
        `${baseUrl}/instance/connect/${inst.instance_name}`,
        {
          method: "GET",
          headers: { apikey: inst.instance_token || "" },
        }
      );

      const evoData = await evoResp.json();
      const qrCode = evoData?.base64 || evoData?.qrcode?.base64 || null;

      // ── Garantir webhook configurado (pode não ter sido set na criação) ──
      const webhookUrl = `${supabaseUrl}/functions/v1/webhook-whatsapp`;
      try {
        const wbResult = await configureWebhook(baseUrl, inst.instance_name, webhookUrl, inst.instance_token || "");
        console.log(`[manage-instance] connect webhook ${inst.instance_name}: ${wbResult.format} ok=${wbResult.ok}`);
      } catch (wbErr) {
        console.error("[manage-instance] connect: erro ao configurar webhook:", wbErr);
      }

      // Atualizar status e QR code
      await adminClient
        .from("whatsapp_instancias")
        .update({
          status: qrCode ? "qr_pendente" : "conectado",
          qr_code: qrCode,
          webhook_url: webhookUrl,
        })
        .eq("id", instancia_id);

      return new Response(
        JSON.stringify({ success: true, qr_code: qrCode, status: qrCode ? "qr_pendente" : "conectado" }),
        { headers: jsonHeaders }
      );
    }

    // ── DISCONNECT ────────────────────────────────────────
    if (action === "disconnect") {
      const { instancia_id } = body;
      if (!instancia_id) {
        return new Response(
          JSON.stringify({ error: "instancia_id é obrigatório" }),
          { status: 400, headers: jsonHeaders }
        );
      }

      const { data: inst } = await adminClient
        .from("whatsapp_instancias")
        .select("*")
        .eq("id", instancia_id)
        .single();

      if (!inst) {
        return new Response(
          JSON.stringify({ error: "Instância não encontrada" }),
          { status: 404, headers: jsonHeaders }
        );
      }

      const baseUrl = (Deno.env.get("EVOLUTION_API_URL") || inst.evolution_url || "").replace(/\/$/, "");
      await fetch(`${baseUrl}/instance/logout/${inst.instance_name}`, {
        method: "DELETE",
        headers: { apikey: inst.instance_token || "" },
      });

      await adminClient
        .from("whatsapp_instancias")
        .update({ status: "desconectado", qr_code: null })
        .eq("id", instancia_id);

      return new Response(
        JSON.stringify({ success: true, status: "desconectado" }),
        { headers: jsonHeaders }
      );
    }

    // ── STATUS ────────────────────────────────────────────
    if (action === "status") {
      const { instancia_id } = body;
      if (!instancia_id) {
        return new Response(
          JSON.stringify({ error: "instancia_id é obrigatório" }),
          { status: 400, headers: jsonHeaders }
        );
      }

      const { data: inst } = await adminClient
        .from("whatsapp_instancias")
        .select("*")
        .eq("id", instancia_id)
        .single();

      if (!inst) {
        return new Response(
          JSON.stringify({ error: "Instância não encontrada" }),
          { status: 404, headers: jsonHeaders }
        );
      }

      const baseUrl = (Deno.env.get("EVOLUTION_API_URL") || inst.evolution_url || "").replace(/\/$/, "");
      let connectionStatus = "unknown";

      try {
        const evoResp = await fetch(
          `${baseUrl}/instance/connectionState/${inst.instance_name}`,
          {
            method: "GET",
            headers: { apikey: inst.instance_token || "" },
          }
        );
        const evoData = await evoResp.json();
        connectionStatus = evoData?.instance?.state || evoData?.state || "unknown";
      } catch {
        connectionStatus = "error";
      }

      // Sincronizar status no banco
      let dbStatus = inst.status;
      if (connectionStatus === "open" && inst.status !== "conectado") {
        dbStatus = "conectado";
        await adminClient
          .from("whatsapp_instancias")
          .update({ status: "conectado", qr_code: null })
          .eq("id", instancia_id);
      } else if (connectionStatus === "close" && inst.status !== "desconectado") {
        dbStatus = "desconectado";
        await adminClient
          .from("whatsapp_instancias")
          .update({ status: "desconectado" })
          .eq("id", instancia_id);
      }

      return new Response(
        JSON.stringify({
          success: true,
          instancia_id: inst.id,
          instance_name: inst.instance_name,
          status: dbStatus,
          evolution_state: connectionStatus,
          phone_number: inst.phone_number,
        }),
        { headers: jsonHeaders }
      );
    }

    // ── DELETE ─────────────────────────────────────────────
    if (action === "delete") {
      const { instancia_id } = body;
      if (!instancia_id) {
        return new Response(
          JSON.stringify({ error: "instancia_id é obrigatório" }),
          { status: 400, headers: jsonHeaders }
        );
      }

      const { data: inst } = await adminClient
        .from("whatsapp_instancias")
        .select("*")
        .eq("id", instancia_id)
        .single();

      if (!inst) {
        return new Response(
          JSON.stringify({ error: "Instância não encontrada" }),
          { status: 404, headers: jsonHeaders }
        );
      }

      // Remover da Evolution API
      const baseUrl = (Deno.env.get("EVOLUTION_API_URL") || inst.evolution_url || "").replace(/\/$/, "");
      try {
        await fetch(`${baseUrl}/instance/delete/${inst.instance_name}`, {
          method: "DELETE",
          headers: { apikey: inst.instance_token || "" },
        });
      } catch (e) {
        console.warn("Erro ao remover instância da Evolution:", e);
      }

      // Remover do banco (mensagens ficam para histórico)
      await adminClient
        .from("whatsapp_instancias")
        .delete()
        .eq("id", instancia_id);

      return new Response(
        JSON.stringify({ success: true, deleted: instancia_id }),
        { headers: jsonHeaders }
      );
    }

    // ── RESTART ───────────────────────────────────────────
    if (action === "restart") {
      const { instancia_id } = body;
      if (!instancia_id) {
        return new Response(
          JSON.stringify({ error: "instancia_id é obrigatório" }),
          { status: 400, headers: jsonHeaders }
        );
      }

      const { data: inst } = await adminClient
        .from("whatsapp_instancias")
        .select("*")
        .eq("id", instancia_id)
        .single();

      if (!inst) {
        return new Response(
          JSON.stringify({ error: "Instância não encontrada" }),
          { status: 404, headers: jsonHeaders }
        );
      }

      const baseUrl = (Deno.env.get("EVOLUTION_API_URL") || inst.evolution_url || "").replace(/\/$/, "");
      await fetch(`${baseUrl}/instance/restart/${inst.instance_name}`, {
        method: "PUT",
        headers: { apikey: inst.instance_token || "" },
      });

      return new Response(
        JSON.stringify({ success: true, action: "restart" }),
        { headers: jsonHeaders }
      );
    }

    // ── SET_WEBHOOK ───────────────────────────────────────
    if (action === "set_webhook") {
      const { instancia_id } = body;
      if (!instancia_id) {
        return new Response(
          JSON.stringify({ error: "instancia_id é obrigatório" }),
          { status: 400, headers: jsonHeaders }
        );
      }

      const { data: inst } = await adminClient
        .from("whatsapp_instancias")
        .select("*")
        .eq("id", instancia_id)
        .single();

      if (!inst) {
        return new Response(
          JSON.stringify({ error: "Instância não encontrada" }),
          { status: 404, headers: jsonHeaders }
        );
      }

      const baseUrl = (Deno.env.get("EVOLUTION_API_URL") || inst.evolution_url || "").replace(/\/$/, "");
      const webhookUrl = `${supabaseUrl}/functions/v1/webhook-whatsapp`;

      const wbResult = await configureWebhook(baseUrl, inst.instance_name, webhookUrl, inst.instance_token || "");
      console.log(`[manage-instance] set_webhook ${inst.instance_name}: ${wbResult.format} ok=${wbResult.ok}`);

      await adminClient
        .from("whatsapp_instancias")
        .update({ webhook_url: webhookUrl })
        .eq("id", instancia_id);

      return new Response(
        JSON.stringify({ success: true, webhook_url: webhookUrl, webhook_format: wbResult.format, webhook_ok: wbResult.ok }),
        { headers: jsonHeaders }
      );
    }

    // ── SYNC_ALL ──────────────────────────────────────────
    // Importa TODAS as instâncias existentes na Evolution API (Fly.io),
    // upserta no banco e configura webhook automaticamente em cada uma.
    // Útil após reinício do servidor ou troca de URL (ngrok → Fly.io).
    if (action === "sync_all") {
      const baseUrl = (Deno.env.get("EVOLUTION_API_URL") || "").replace(/\/$/, "");
      const globalApikey = Deno.env.get("EVOLUTION_API_KEY") || "";
      const webhookUrl = `${supabaseUrl}/functions/v1/webhook-whatsapp`;

      if (!baseUrl || !globalApikey) {
        return new Response(
          JSON.stringify({ error: "EVOLUTION_API_URL e EVOLUTION_API_KEY devem estar configurados nos secrets do Supabase." }),
          { status: 400, headers: jsonHeaders }
        );
      }

      // Buscar todas as instâncias registradas na Evolution API
      let evoInstances: Array<Record<string, unknown>> = [];
      try {
        const fetchResp = await fetch(`${baseUrl}/instance/fetchInstances`, {
          method: "GET",
          headers: { apikey: globalApikey },
        });
        if (!fetchResp.ok) {
          const txt = await fetchResp.text();
          return new Response(
            JSON.stringify({ error: `Evolution API retornou HTTP ${fetchResp.status}`, details: txt.slice(0, 300) }),
            { status: 502, headers: jsonHeaders }
          );
        }
        const raw = await fetchResp.json();
        evoInstances = Array.isArray(raw) ? raw : (raw?.instances || []);
      } catch (fetchErr) {
        return new Response(
          JSON.stringify({ error: `Erro ao conectar na Evolution API: ${String(fetchErr)}` }),
          { status: 502, headers: jsonHeaders }
        );
      }

      const results: Array<Record<string, unknown>> = [];

      for (const evo of evoInstances) {
        const instanceName = (evo.instance as Record<string, unknown>)?.instanceName as string
          || evo.instanceName as string
          || "";
        if (!instanceName) continue;

        // Token da instância (apikey individual)
        const instanceToken = (evo.instance as Record<string, unknown>)?.token as string
          || (evo.hash as Record<string, unknown>)?.apikey as string
          || evo.token as string
          || globalApikey;

        // Estado de conexão atual (v1: instance.status, v2: instance.state)
        const connectionState = (evo.instance as Record<string, unknown>)?.status as string
          || (evo.instance as Record<string, unknown>)?.state as string
          || evo.connectionStatus as string
          || "unknown";
        const dbStatus = connectionState === "open" ? "conectado"
          : connectionState === "close" || connectionState === "closed" ? "desconectado"
          : "desconectado";

        // Upsert na tabela whatsapp_instancias
        const { data: upserted, error: upsertErr } = await adminClient
          .from("whatsapp_instancias")
          .upsert(
            {
              instance_name: instanceName,
              evolution_url: baseUrl,
              instance_token: instanceToken,
              status: dbStatus,
              webhook_url: webhookUrl,
              qr_code: null,
            },
            { onConflict: "instance_name", ignoreDuplicates: false }
          )
          .select()
          .single();

        if (upsertErr) {
          results.push({ instance_name: instanceName, success: false, error: upsertErr.message });
          continue;
        }

        // Configurar webhook automaticamente (v1 + v2 fallback)
        let webhookOk = false;
        try {
          const wbResult = await configureWebhook(baseUrl, instanceName, webhookUrl, instanceToken);
          webhookOk = wbResult.ok;
          console.log(`[sync_all] webhook ${instanceName}: ${wbResult.format} ok=${wbResult.ok}`);
        } catch (wbErr) {
          console.error(`[sync_all] webhook/set ${instanceName} falhou:`, wbErr);
        }

        results.push({
          instance_name: instanceName,
          success: true,
          status: dbStatus,
          webhook_configured: webhookOk,
          instancia_id: upserted?.id,
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          total: evoInstances.length,
          synced: results.filter((r) => r.success).length,
          results,
          webhook_url: webhookUrl,
          evolution_url: baseUrl,
        }),
        { headers: jsonHeaders }
      );
    }

    return new Response(
      JSON.stringify({ error: `Ação desconhecida: ${action}` }),
      { status: 400, headers: jsonHeaders }
    );
  } catch (err) {
    console.error("[manage-instance] Erro:", err);
    return new Response(
      JSON.stringify({ error: "Erro interno", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
