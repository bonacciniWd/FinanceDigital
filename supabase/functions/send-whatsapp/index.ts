/**
 * Edge Function: send-whatsapp
 *
 * Envia mensagens via Evolution API a partir de uma instância configurada.
 * Registra cada envio na tabela whatsapp_mensagens_log.
 *
 * Body esperado:
 * {
 *   instancia_id: string,        // UUID da instância em whatsapp_instancias
 *   telefone: string,            // número destino (ex: "5511999999999")
 *   conteudo: string,            // texto da mensagem
 *   tipo?: "text" | "image" | "document" | "audio",  // default "text"
 *   media_url?: string,          // URL da mídia (se tipo != "text")
 *   cliente_id?: string,         // UUID do cliente (opcional, para log)
 *   fluxo_id?: string,           // UUID do fluxo (opcional, para log)
 * }
 *
 * ⚠️  IMPORTANTE: Deploy SEMPRE com --no-verify-jwt!
 *     Supabase Auth usa ES256, gateway valida HS256 → 401 "Invalid JWT".
 *     Auth é feita internamente via instancia_id (UUID privado).
 *
 * Deploy: supabase functions deploy send-whatsapp --no-verify-jwt
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Usar service role — autenticação é garantida via instancia_id (UUID privado)
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── Body ──────────────────────────────────────────────
    const {
      instancia_id,
      telefone,
      conteudo,
      tipo = "text",
      media_url,
      media_base64,
      audio_seconds,
      cliente_id,
      fluxo_id,
    } = await req.json();

    if (!instancia_id || !telefone || !conteudo) {
      return new Response(
        JSON.stringify({ error: "Campos obrigatórios: instancia_id, telefone, conteudo" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Buscar instância ──────────────────────────────────
    const { data: instancia, error: instErr } = await adminClient
      .from("whatsapp_instancias")
      .select("*")
      .eq("id", instancia_id)
      .single();

    if (instErr || !instancia) {
      return new Response(
        JSON.stringify({ error: "Instância não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Aceitar tanto "conectado" (masculino, atual) quanto "conectada" (legado)
    if (instancia.status !== "conectado" && instancia.status !== "conectada") {
      return new Response(
        JSON.stringify({ error: `Instância não conectada. Status: ${instancia.status}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const envUrl = Deno.env.get("EVOLUTION_API_URL");
    if (!instancia.evolution_url && !envUrl || !instancia.instance_token) {
      return new Response(
        JSON.stringify({ error: "Instância sem URL ou token da Evolution API configurados. Configure EVOLUTION_API_URL nos secrets do Supabase." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Enviar via Evolution API ──────────────────────────
    // Prioridade: secret EVOLUTION_API_URL > evolution_url salva na instância.
    // Isso garante que ao atualizar o ngrok via `supabase secrets set`, o envio
    // funciona imediatamente sem precisar recriar as instâncias no banco.
    const baseUrl = (envUrl || instancia.evolution_url).replace(/\/$/, "");
    let evolutionEndpoint: string;
    let evolutionBody: Record<string, unknown>;

    // ── Normalizar media_url ──────────────────────────────
    // O browser envia data URIs (data:audio/webm;base64,XXXX) via FileReader.readAsDataURL.
    // A Evolution API rejeita data URIs — aceita apenas URL pública ou base64 puro.
    // Aqui extraímos apenas a parte base64 e adicionamos encoding: true para sinalizar.
    let normalizedMediaUrl = media_url as string | undefined;
    let isBase64Media = false;
    if (normalizedMediaUrl?.startsWith("data:")) {
      const commaIdx = normalizedMediaUrl.indexOf(",");
      if (commaIdx !== -1) {
        normalizedMediaUrl = normalizedMediaUrl.slice(commaIdx + 1);
        isBase64Media = true;
      }
    }

    // Fallback: quando o browser envia media_base64 sem media_url (ex: QR code PIX)
    if (!normalizedMediaUrl && media_base64) {
      normalizedMediaUrl = (media_base64 as string).replace(/^data:[^;]+;base64,/, "");
      isBase64Media = true;
    }

    // Extrair apenas dígitos e passar para a Evolution API sem o sufixo @s.whatsapp.net.
    // A Evolution API aplica as regras de formatação de número (ex: Brasil remove o 9º dígito
    // em DDDs < 31 ou quando o número começa com dígito < 7). Passar o JID completo impede
    // esse ajuste automático e causa erro "número não encontrado".
    let formattedNumber = telefone.replace(/@.*$/, "").replace(/\D/g, "");

    // Garantir DDI 55 (Brasil): números com 10-11 dígitos (DDD + telefone) sem prefixo 55
    // precisam receber o código do país para serem encontrados no WhatsApp.
    if (formattedNumber.length >= 10 && formattedNumber.length <= 11 && !formattedNumber.startsWith("55")) {
      formattedNumber = "55" + formattedNumber;
    }
    // @lid = ID interno do WhatsApp (multi-device). A Evolution API v1.x rejeita envio
    // direto para @lid (valida existência do número), mas permitimos a tentativa para que
    // o erro seja tratado de forma clara ao invés de silenciosamente bloqueado.
    const isLid = telefone.endsWith("@lid");
    const whatsappJid = isLid ? telefone : formattedNumber;

    if (tipo === "text") {
      evolutionEndpoint = `${baseUrl}/message/sendText/${instancia.instance_name}`;
      // Compatível com v1 e v2 da Evolution API:
      // v2 usa textMessage.text, v1 usa apenas text no root
      evolutionBody = {
        number: whatsappJid,
        textMessage: { text: conteudo },
        text: conteudo,
      };
    } else if (tipo === "image") {
      evolutionEndpoint = `${baseUrl}/message/sendMedia/${instancia.instance_name}`;
      evolutionBody = {
        number: whatsappJid,
        mediaMessage: {
          mediatype: "image",
          media: normalizedMediaUrl,
          caption: conteudo,
          ...(isBase64Media && { encoding: true }),
        },
      };
    } else if (tipo === "document") {
      evolutionEndpoint = `${baseUrl}/message/sendMedia/${instancia.instance_name}`;
      evolutionBody = {
        number: whatsappJid,
        mediaMessage: {
          mediatype: "document",
          media: normalizedMediaUrl,
          caption: conteudo,
          ...(isBase64Media && { encoding: true }),
        },
      };
    } else if (tipo === "audio") {
      // PIPELINE definitivo:
      // 1. Browser grava qualquer formato → audioToWav() → WAV 16kHz mono → Supabase Storage
      // 2. Edge function gera uma signed URL (120s) do Storage usando service role
      // 3. Evolution API baixa o WAV via HTTPS, ffmpeg converte WAV→OGG/Opus
      // 4. WhatsApp entrega como mensagem de voz com duração
      //
      // Por que signed URL e não base64?
      // Base64 grande (>100KB) causa "Aguardando mensagem" no Baileys (limite interno).
      // URL pública → Evolution API baixa normalmente, sem limite de payload.
      evolutionEndpoint = `${baseUrl}/message/sendMedia/${instancia.instance_name}`;

      let audioUrl = normalizedMediaUrl as string;

      // Gerar signed URL a partir do media_url público do Storage
      if (normalizedMediaUrl?.startsWith("http")) {
        try {
          // Extrair caminho relativo: remover prefixo até "/whatsapp-media/"
          const marker = "/object/public/whatsapp-media/";
          const markerIdx = (normalizedMediaUrl as string).indexOf(marker);
          if (markerIdx !== -1) {
            const storagePath = (normalizedMediaUrl as string).slice(markerIdx + marker.length);
            const { data: signedData, error: signedErr } = await adminClient.storage
              .from("whatsapp-media")
              .createSignedUrl(storagePath, 120); // 120 segundos — tempo suficiente para Evolution API baixar
            if (!signedErr && signedData?.signedUrl) {
              audioUrl = signedData.signedUrl;
              console.log("[audio] signed URL gerada:", storagePath);
            } else {
              console.warn("[audio] falha ao gerar signed URL, usando URL pública:", signedErr?.message);
            }
          }
        } catch (signErr) {
          console.error("[audio] erro ao gerar signed URL:", signErr);
        }
      }

      console.log("[audio] enviando para Evolution, url:", audioUrl.slice(0, 80), "seconds:", audio_seconds);
      evolutionBody = {
        number: whatsappJid,
        mediaMessage: {
          mediatype: "audio",
          media: audioUrl,
          mimetype: "audio/wav",
          ptt: true,
          seconds: audio_seconds ?? undefined,
          caption: "",
        },
      };
    } else {
      return new Response(
        JSON.stringify({ error: `Tipo de mensagem inválido: ${tipo}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Timeout de 20s para evitar que a função fique pendurada e cause 502 no gateway
    // (502 do gateway não envia CORS headers, causando erros de CORS no browser)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20_000);

    let evoResp: Response;
    try {
      evoResp = await fetch(evolutionEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: instancia.instance_token },
        body: JSON.stringify(evolutionBody),
        signal: controller.signal,
      });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      const isTimeout = (fetchErr as Error)?.name === "AbortError";
      const errMsg = isTimeout ? "Timeout ao conectar na Evolution API (>20s)" : `Erro de conexão: ${String(fetchErr)}`;
      return new Response(
        JSON.stringify({ success: false, error: errMsg, details: null }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    clearTimeout(timeoutId);
    const evoData = await evoResp.json();
    console.log("[evo] status:", evoResp.status, "response:", JSON.stringify(evoData).slice(0, 300));

    if (!evoResp.ok) {
      // Detectar erro "exists: false" para @lid (limitação do WhatsApp multi-device)
      const isLidNotFound =
        isLid &&
        evoResp.status === 400 &&
        Array.isArray(evoData?.response?.message) &&
        evoData.response.message.some((m: Record<string, unknown>) => m.exists === false);

      const errorMsg = isLidNotFound
        ? "Este contato usa ID interno do WhatsApp (@lid). " +
          "A Evolution API v1.x não consegue enviar para IDs internos. " +
          "Responda pelo celular diretamente."
        : "Falha ao enviar via Evolution API";

      // Registrar falha no log
      await adminClient.from("whatsapp_mensagens_log").insert({
        instancia_id,
        cliente_id: cliente_id || null,
        fluxo_id: fluxo_id || null,
        direcao: "saida",
        telefone: formattedNumber,
        conteudo,
        tipo,
        status: "falha",
        metadata: { error: evoData, jid: whatsappJid, is_lid: isLid },
      });

      // Retornar 200 com success:false para que o SDK não engula os detalhes do erro
      return new Response(
        JSON.stringify({ success: false, error: errorMsg, details: evoData, is_lid: isLid }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Registrar no log ──────────────────────────────────
    const messageIdWpp = evoData?.key?.id || evoData?.messageId || null;

    // Para mensagens de mídia (audio, image, document), salvar URL e mimetype no metadata
    // para que o remetente possa reproduzir/visualizar a mensagem enviada no chat.
    const outgoingMetadata: Record<string, unknown> = { evolution_response: evoData };
    if (media_url) {
      outgoingMetadata.media_url = media_url;
      // Derivar mimetype pelo tipo da mensagem + extensão da URL para o player do chat
      if (tipo === "audio") {
        const url = typeof media_url === "string" ? media_url : "";
        const audioExt = url.includes(".ogg") ? "ogg" : url.includes(".wav") ? "wav" : "webm";
        outgoingMetadata.media_mimetype = `audio/${audioExt}`;
      } else if (tipo === "image") {
        outgoingMetadata.media_mimetype = "image/jpeg";
      } else if (tipo === "document") {
        outgoingMetadata.media_mimetype = "application/octet-stream";
      }
    }

    const { data: logEntry, error: logErr } = await adminClient
      .from("whatsapp_mensagens_log")
      .insert({
        instancia_id,
        cliente_id: cliente_id || null,
        fluxo_id: fluxo_id || null,
        direcao: "saida",
        telefone: formattedNumber,
        conteudo,
        tipo,
        status: "enviada",
        message_id_wpp: messageIdWpp,
        metadata: outgoingMetadata,
      })
      .select()
      .single();

    if (logErr) {
      console.error("Erro ao registrar log:", logErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message_id: logEntry?.id || null,
        message_id_wpp: messageIdWpp,
        evolution_response: evoData,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-whatsapp error:", err);
    return new Response(
      JSON.stringify({ error: "Erro interno", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
