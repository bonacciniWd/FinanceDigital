/**
 * Edge Function: webhook-whatsapp
 *
 * Recebe webhooks da Evolution API (mensagens recebidas, status updates, etc.)
 * e processa:
 *   1. Salva mensagens de entrada na tabela whatsapp_mensagens_log
 *   2. Atualiza status de mensagens enviadas (delivered, read)
 *   3. Dispara fluxos de chatbot se houver match de palavra-chave
 *
 * Endpoint público (sem JWT) — validado via apikey header da Evolution.
 * Configure na Evolution API:
 *   webhook_url = https://<project>.supabase.co/functions/v1/webhook-whatsapp
 *
 * Deploy: supabase functions deploy webhook-whatsapp --no-verify-jwt
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// ── EFI mTLS helpers (para criar cobrança PIX direto no chatbot) ──
interface EfiCreds {
  clientId: string; clientSecret: string; pixKey: string;
  certPem: string; keyPem: string; sandbox: boolean; baseUrl: string;
  multaPerc: number; jurosPerc: number;
}
let _efiToken: { token: string; expiresAt: number } | null = null;
let _efiHttpClient: Deno.HttpClient | null = null;
function getEfiHttpClient(creds: EfiCreds): Deno.HttpClient {
  if (_efiHttpClient) return _efiHttpClient;
  _efiHttpClient = Deno.createHttpClient({ cert: creds.certPem, key: creds.keyPem });
  return _efiHttpClient;
}
async function getEfiToken(creds: EfiCreds): Promise<string> {
  if (_efiToken && Date.now() < _efiToken.expiresAt) return _efiToken.token;
  const credentials = btoa(`${creds.clientId}:${creds.clientSecret}`);
  const client = getEfiHttpClient(creds);
  const resp = await fetch(`${creds.baseUrl}/oauth/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials" }),
    // @ts-ignore — Deno mTLS
    client,
  });
  if (!resp.ok) throw new Error(`EFI Auth error: ${await resp.text()}`);
  const data = await resp.json();
  _efiToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return _efiToken.token;
}
async function efiRequest(creds: EfiCreds, method: string, path: string, body?: Record<string, unknown>) {
  const token = await getEfiToken(creds);
  const client = getEfiHttpClient(creds);
  const resp = await fetch(`${creds.baseUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    // @ts-ignore — Deno mTLS
    client,
  });
  const text = await resp.text();
  const data = text ? JSON.parse(text) : {};
  if (!resp.ok) throw new Error(data?.mensagem || data?.message || `EFI error ${resp.status}`);
  return data;
}
async function loadEfiCreds(adminClient: ReturnType<typeof createClient>): Promise<EfiCreds | null> {
  try {
    const { data: gw } = await adminClient.from("gateways_pagamento").select("config").eq("nome", "efi").eq("ativo", true).single();
    if (!gw?.config) return null;
    const cfg = gw.config as Record<string, unknown>;
    const sandbox = cfg.sandbox === true;
    const creds: EfiCreds = {
      clientId: (cfg.client_id as string) || "", clientSecret: (cfg.client_secret as string) || "",
      pixKey: (cfg.pix_key as string) || "", certPem: (cfg.cert_pem as string) || "",
      keyPem: (cfg.key_pem as string) || "", sandbox,
      baseUrl: sandbox ? "https://pix-h.api.efipay.com.br" : "https://pix.api.efipay.com.br",
      multaPerc: Number(cfg.multa_perc) || 2.00, jurosPerc: Number(cfg.juros_perc) || 1.00,
    };
    if (!creds.clientId || !creds.certPem) return null;
    return creds;
  } catch { return null; }
}
async function criarCobrancaPix(
  adminClient: ReturnType<typeof createClient>, creds: EfiCreds,
  parcela: Record<string, unknown>, clienteNome: string, clienteCpf: string | null, valorOverride?: number,
): Promise<{ txid: string; brCode: string | null; qrCodeImage: string | null } | null> {
  try {
    const txid = crypto.randomUUID().replace(/-/g, "").substring(0, 35);
    const valor = valorOverride || Number(parcela.valor);
    const payload: Record<string, unknown> = {
      calendario: { expiracao: 86400 },
      valor: { original: valor.toFixed(2) },
      chave: creds.pixKey,
      solicitacaoPagador: `Parcela ${parcela.numero} - FinanceDigital`.substring(0, 140),
    };
    if (clienteCpf) {
      const cpfLimpo = String(clienteCpf).replace(/\D/g, "");
      if (cpfLimpo.length === 11) payload.devedor = { cpf: cpfLimpo, nome: clienteNome };
      else if (cpfLimpo.length === 14) payload.devedor = { cnpj: cpfLimpo, nome: clienteNome };
    }
    const cobResp = await efiRequest(creds, "PUT", `/v2/cob/${txid}`, payload);
    let qrCodeImage: string | null = null;
    let brCode: string | null = null;
    try {
      if (cobResp.loc?.id) {
        const qr = await efiRequest(creds, "GET", `/v2/loc/${cobResp.loc.id}/qrcode`);
        qrCodeImage = qr.imagemQrcode || null;
        brCode = qr.qrcode || null;
      }
    } catch (qrErr) {
      console.warn(`[chatbot] QR code falhou txid=${txid}:`, qrErr instanceof Error ? qrErr.message : qrErr);
    }
    const { error: insertErr } = await adminClient.from("woovi_charges").insert({
      parcela_id: parcela.id || null, emprestimo_id: parcela.emprestimo_id || null,
      cliente_id: parcela.cliente_id || null, woovi_charge_id: txid, woovi_txid: txid,
      valor, status: "ACTIVE", br_code: brCode, qr_code_image: qrCodeImage,
      payment_link: cobResp.location || null,
      expiration_date: new Date(Date.now() + 86400000).toISOString(),
      gateway: "efi",
    });
    if (insertErr) {
      console.error(`[chatbot] ERRO ao salvar cobrança no banco: ${insertErr.message}`, JSON.stringify(insertErr));
      // Tenta novamente sem parcela_id/emprestimo_id caso FK falhe
      const { error: retryErr } = await adminClient.from("woovi_charges").insert({
        parcela_id: null, emprestimo_id: null,
        cliente_id: parcela.cliente_id || null, woovi_charge_id: txid, woovi_txid: txid,
        valor, status: "ACTIVE", br_code: brCode, qr_code_image: qrCodeImage,
        payment_link: cobResp.location || null,
        expiration_date: new Date(Date.now() + 86400000).toISOString(),
        gateway: "efi",
      });
      if (retryErr) {
        console.error(`[chatbot] ERRO retry salvar cobrança: ${retryErr.message}`, JSON.stringify(retryErr));
      } else {
        console.log(`[chatbot] Cobrança salva no retry (sem FK parcela/emprestimo): txid=${txid}`);
      }
    }
    if (parcela.id && !insertErr) {
      const { error: updErr } = await adminClient.from("parcelas").update({ woovi_charge_id: txid }).eq("id", parcela.id);
      if (updErr) console.warn(`[chatbot] Erro ao atualizar parcela com charge_id: ${updErr.message}`);
    }
    console.log(`[chatbot] Cobrança PIX criada: txid=${txid}, brCode=${brCode ? "SIM" : "NÃO"}, qr=${qrCodeImage ? "SIM" : "NÃO"}, dbOk=${!insertErr}`);
    return { txid, brCode, qrCodeImage };
  } catch (err) {
    console.error(`[chatbot] Erro ao criar cobrança PIX:`, err instanceof Error ? err.message : err);
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Este endpoint é público (recebe webhooks da Evolution API)
  // Validação é feita pelo secret configurado na instância
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const payload = await req.json();
    const event = payload.event;

    console.log(`[webhook-whatsapp] Evento recebido: ${event}`);

    // ── Mensagem recebida ─────────────────────────────────
    if (event === "messages.upsert") {
      const message = payload.data;
      if (!message) {
        return new Response(JSON.stringify({ ok: true, skipped: "no data" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const instanceName = payload.instance || payload.sender || "";
      const remoteJid = message.key?.remoteJid || "";
      const fromMe = message.key?.fromMe || false;
      const messageId = message.key?.id || "";

      // Detectar LID por addressingMode (v2) OU pelo sufixo @lid no remoteJid (v1.8.x)
      const isLid = message.key?.addressingMode === "lid" || remoteJid.endsWith("@lid");
      const remoteJidAlt = message.key?.remoteJidAlt || "";

      // JID para envio: preferir remoteJidAlt > participant > lookup no lid_map > fallback @lid
      let jidParaEnvio = remoteJid;
      let isLidOnly = false;

      if (isLid) {
        if (remoteJidAlt && !remoteJidAlt.endsWith("@lid")) {
          // v2: remoteJidAlt tem o número real
          jidParaEnvio = remoteJidAlt;
        } else if (message.key?.participant && !message.key.participant.endsWith("@lid")) {
          // Algumas versões enviam o real JID em participant
          jidParaEnvio = message.key.participant;
        } else {
          // Consultar whatsapp_lid_map (populado com histórico ou manualmente)
          const { data: lidEntry } = await adminClient
            .from("whatsapp_lid_map")
            .select("real_jid, real_phone")
            .eq("lid_jid", remoteJid)
            .maybeSingle();

          if (lidEntry?.real_jid) {
            jidParaEnvio = lidEntry.real_jid;
          } else {
            isLidOnly = true;
          }
        }
      }

      // Extrair número de telefone do JID real (não do @lid)
      let telefone = jidParaEnvio.replace(/@.*$/, "");

      // Ignorar mensagens de grupo e status
      if (remoteJid.includes("@g.us") || remoteJid === "status@broadcast") {
        return new Response(JSON.stringify({ ok: true, skipped: "group_or_status" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Ignorar mensagens enviadas por nós (já logadas no send-whatsapp)
      if (fromMe) {
        // Atualizar status para 'enviada' se temos o messageId
        if (messageId) {
          await adminClient
            .from("whatsapp_mensagens_log")
            .update({ status: "enviada" })
            .eq("message_id_wpp", messageId);
        }
        return new Response(JSON.stringify({ ok: true, skipped: "from_me" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Extrair conteúdo conforme tipo
      let conteudo = "";
      let tipo = "text";
      let mediaUrl: string | null = null;
      let mediaMimetype: string | null = null;

      // Media URL/base64 fornecido pela Evolution API no payload do webhook
      const rawMediaUrl = message.mediaUrl || message.base64 || null;

      if (message.message?.conversation) {
        conteudo = message.message.conversation;
        tipo = "text";
      } else if (message.message?.extendedTextMessage?.text) {
        conteudo = message.message.extendedTextMessage.text;
        tipo = "text";
      } else if (message.message?.imageMessage) {
        conteudo = message.message.imageMessage.caption || "";
        tipo = "image";
        mediaMimetype = message.message.imageMessage.mimetype || "image/jpeg";
        mediaUrl = rawMediaUrl || null;
        // Thumbnail como fallback se não tiver URL/base64 completa
        if (!mediaUrl && message.message.imageMessage.jpegThumbnail) {
          mediaUrl = `data:image/jpeg;base64,${message.message.imageMessage.jpegThumbnail}`;
        }
      } else if (message.message?.documentMessage) {
        conteudo = message.message.documentMessage.fileName || "[Documento]";
        tipo = "document";
        mediaMimetype = message.message.documentMessage.mimetype || "application/octet-stream";
        mediaUrl = rawMediaUrl || null;
      } else if (message.message?.audioMessage) {
        conteudo = "";
        tipo = "audio";
        mediaMimetype = message.message.audioMessage.mimetype || "audio/ogg";
        mediaUrl = rawMediaUrl || null;
      } else if (message.message?.videoMessage) {
        conteudo = message.message.videoMessage.caption || "";
        tipo = "video";
        mediaMimetype = message.message.videoMessage.mimetype || "video/mp4";
        mediaUrl = rawMediaUrl || null;
      } else if (message.message?.stickerMessage) {
        conteudo = "";
        tipo = "sticker";
        mediaMimetype = message.message.stickerMessage.mimetype || "image/webp";
        mediaUrl = rawMediaUrl || null;
      } else {
        conteudo = "[Mensagem não suportada]";
        tipo = "other";
      }

      // Buscar instância pelo instance_name (com campos extras para resolver LID)
      const { data: instancia } = await adminClient
        .from("whatsapp_instancias")
        .select("id, evolution_url, instance_name, instance_token")
        .eq("instance_name", instanceName)
        .single();

      // ── Se LID-only, tentar resolver o número real via Evolution API ──
      if (isLidOnly && instancia?.evolution_url && instancia.instance_token) {
        const evoUrl = (Deno.env.get("EVOLUTION_API_URL") || instancia.evolution_url).replace(/\/$/, "");
        try {
          const contactResp = await fetch(
            `${evoUrl}/chat/findContacts/${instancia.instance_name}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: instancia.instance_token },
              body: JSON.stringify({ where: { id: remoteJid } }),
            }
          );
          if (contactResp.ok) {
            const contacts = await contactResp.json();
            const contact = Array.isArray(contacts) ? contacts[0] : contacts;
            const realId = contact?.id || contact?.jid || "";
            if (realId && realId.includes("@s.whatsapp.net")) {
              jidParaEnvio = realId;
              telefone = realId.replace(/@.*$/, "");
              isLidOnly = false;
              // Salvar no lid_map para resolução futura sem precisar chamar a API
              await adminClient.from("whatsapp_lid_map").upsert(
                { lid_jid: remoteJid, real_phone: telefone, real_jid: realId, push_name: message.pushName || null, source: "webhook_findcontacts" },
                { onConflict: "lid_jid" }
              );
            }
          }
        } catch (contactErr) {
          console.error("[webhook-whatsapp] Erro ao resolver LID:", contactErr);
        }

        // Fallback: buscar pelo pushName
        if (isLidOnly && message.pushName) {
          try {
            const allContactsResp = await fetch(
              `${evoUrl}/chat/findContacts/${instancia.instance_name}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json", apikey: instancia.instance_token },
                body: JSON.stringify({ where: { pushName: message.pushName } }),
              }
            );
            if (allContactsResp.ok) {
              const results = await allContactsResp.json();
              const found = (Array.isArray(results) ? results : [results]).find(
                (c: Record<string, unknown>) =>
                  typeof c?.id === "string" && (c.id as string).includes("@s.whatsapp.net")
              );
              if (found) {
                jidParaEnvio = found.id as string;
                telefone = (found.id as string).replace(/@.*$/, "");
                isLidOnly = false;
                await adminClient.from("whatsapp_lid_map").upsert(
                  { lid_jid: remoteJid, real_phone: telefone, real_jid: found.id, push_name: message.pushName || null, source: "webhook_pushname" },
                  { onConflict: "lid_jid" }
                );
              }
            }
          } catch { /* ignora */ }
        }
      }

      // Buscar cliente pelo telefone
      const { data: cliente } = await adminClient
        .from("clientes")
        .select("id")
        .eq("telefone", telefone)
        .maybeSingle();

      // ── Download full-quality media via Evolution API ────────
      // The webhook payload usually only contains jpegThumbnail (~100px).
      // We call getBase64FromMediaMessage to get the full image, then upload to Storage.
      const mediaTypes = ["image", "audio", "video", "document", "sticker"];
      if (mediaTypes.includes(tipo) && instancia?.evolution_url && instancia.instance_token) {
        const evoUrl = (Deno.env.get("EVOLUTION_API_URL") || instancia.evolution_url).replace(/\/$/, "");
        try {
          const mediaResp = await fetch(
            `${evoUrl}/chat/getBase64FromMediaMessage/${instancia.instance_name}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: instancia.instance_token },
              body: JSON.stringify({ message: { key: message.key, message: message.message } }),
            }
          );
          if (mediaResp.ok) {
            const mediaData = await mediaResp.json();
            const b64 = mediaData.base64 || mediaData.data || null;
            const fetchedMimetype = mediaData.mimetype || mediaMimetype || "application/octet-stream";
            if (b64 && typeof b64 === "string") {
              // Upload to Supabase Storage whatsapp-media bucket
              const extMap: Record<string, string> = {
                "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
                "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a",
                "video/mp4": "mp4", "image/gif": "gif",
              };
              const ext = extMap[fetchedMimetype] || fetchedMimetype.split("/")[1]?.split(";")[0] || "bin";
              const storagePath = `incoming/${telefone}/${Date.now()}-${messageId || "msg"}.${ext}`;

              // Decode base64 to Uint8Array
              const raw = atob(b64.includes(",") ? b64.split(",")[1] : b64);
              const bytes = new Uint8Array(raw.length);
              for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);

              const { error: upErr } = await adminClient.storage
                .from("whatsapp-media")
                .upload(storagePath, bytes, { contentType: fetchedMimetype, upsert: false });

              if (!upErr) {
                const { data: urlData } = adminClient.storage.from("whatsapp-media").getPublicUrl(storagePath);
                mediaUrl = urlData.publicUrl;
                mediaMimetype = fetchedMimetype;
                console.log(`[webhook-whatsapp] Media uploaded to Storage: ${storagePath}`);
              } else {
                console.error("[webhook-whatsapp] Storage upload error:", upErr.message);
              }
            }
          } else {
            console.warn(`[webhook-whatsapp] getBase64FromMediaMessage failed: ${mediaResp.status}`);
          }
        } catch (mediaErr) {
          console.error("[webhook-whatsapp] Error fetching full media:", mediaErr);
        }
      }

      // Salvar mensagem de entrada
      const { error: insertErr } = await adminClient.from("whatsapp_mensagens_log").insert({
        instancia_id: instancia?.id || null,
        cliente_id: cliente?.id || null,
        direcao: "entrada",
        telefone,
        conteudo,
        tipo,
        status: "recebida",
        message_id_wpp: messageId,
        metadata: {
          jid: jidParaEnvio,        // JID para respostas: @s.whatsapp.net (real) ou @lid se sem alternativa
          lid_jid: isLid ? remoteJid : null,  // JID original @lid, para referência
          is_lid_only: isLidOnly,   // true = não conseguimos resolver o número real
          raw_key: message.key,
          push_name: message.pushName || null,
          instance_name: instanceName,
          media_url: mediaUrl,
          media_mimetype: mediaMimetype,
        },
      });

      if (insertErr) {
        console.error("[webhook-whatsapp] Erro ao inserir mensagem:", JSON.stringify(insertErr));
        return new Response(
          JSON.stringify({ ok: false, error: "insert_failed", details: insertErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ── Auto-criar ticket de atendimento ──────────────────
      // Se o cliente existe e não tem ticket aberto, cria um automaticamente.
      if (cliente?.id) {
        const { data: ticketAberto } = await adminClient
          .from("tickets_atendimento")
          .select("id")
          .eq("cliente_id", cliente.id)
          .in("status", ["aberto", "em_atendimento", "aguardando_cliente"])
          .limit(1)
          .maybeSingle();

        if (!ticketAberto) {
          const pushName = message.pushName || telefone;
          const { error: ticketErr } = await adminClient.from("tickets_atendimento").insert({
            cliente_id: cliente.id,
            assunto: `Atendimento WhatsApp — ${pushName}`,
            descricao: `Ticket criado automaticamente a partir de mensagem recebida via WhatsApp.`,
            canal: "whatsapp",
            status: "aberto",
            prioridade: "media",
          });
          if (ticketErr) {
            console.error("[webhook-whatsapp] Erro ao criar ticket automático:", JSON.stringify(ticketErr));
          } else {
            console.log(`[webhook-whatsapp] Ticket automático criado para cliente ${cliente.id}`);
          }
        }
      }

      // ── Formatar número para envio via Evolution API ─────
      // Remover sufixo @s.whatsapp.net/@lid e manter só dígitos (igual ao send-whatsapp)
      let formattedNumber = jidParaEnvio.replace(/@.*$/, "").replace(/\D/g, "");
      if (formattedNumber.length >= 10 && formattedNumber.length <= 11 && !formattedNumber.startsWith("55")) {
        formattedNumber = "55" + formattedNumber;
      }

      // ── Auto-resposta: Score / Status ─────────────────────
      // Se o cliente enviar "score" ou "status", responder com os dados do cadastro
      if (tipo === "text" && conteudo) {
        const conteudoLower = conteudo.toLowerCase().trim();
        const isScoreQuery = conteudoLower === "score" || conteudoLower === "meu score";
        const isStatusQuery = conteudoLower === "status" || conteudoLower === "meu status";

        if ((isScoreQuery || isStatusQuery) && instancia) {
          // Buscar cliente completo pelo telefone
          const { data: clienteData } = await adminClient
            .from("clientes")
            .select("nome, status, score_interno, limite_credito, credito_utilizado, bonus_acumulado, dias_atraso")
            .eq("telefone", telefone)
            .maybeSingle();

          const evoUrl = (Deno.env.get("EVOLUTION_API_URL") || instancia.evolution_url || "").replace(/\/$/, "");

          if (clienteData && evoUrl && instancia.instance_token) {
            let resposta = "";

            if (isScoreQuery) {
              const score = clienteData.score_interno ?? 0;
              const maxScore = 1000;
              const pct = ((score / maxScore) * 100).toFixed(0);
              const faixa = score >= 800 ? "Excelente ✅" : score >= 600 ? "Bom 👍" : score >= 400 ? "Regular ⚠️" : "Baixo ❌";
              const limite = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(clienteData.limite_credito || 0);
              const disponivel = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((clienteData.limite_credito || 0) - (clienteData.credito_utilizado || 0));

              resposta = `📊 *Score de ${clienteData.nome}*\n\n` +
                `🔢 Score: *${score}/${maxScore}* (${pct}%)\n` +
                `📈 Faixa: *${faixa}*\n` +
                `💰 Limite: ${limite}\n` +
                `✅ Disponível: ${disponivel}\n` +
                `🎁 Bônus acumulado: ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(clienteData.bonus_acumulado || 0)}\n\n` +
                `_Atualizado em ${new Date().toLocaleDateString("pt-BR")}_`;
            } else {
              const statusMap: Record<string, string> = {
                ativo: "✅ Ativo",
                bloqueado: "🚫 Bloqueado",
                inadimplente: "❌ Inadimplente",
                inativo: "⏸️ Inativo",
                pendente: "⏳ Pendente",
              };
              const statusLabel = statusMap[clienteData.status] || clienteData.status;
              const limite = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(clienteData.limite_credito || 0);
              const utilizado = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(clienteData.credito_utilizado || 0);

              resposta = `📋 *Status de ${clienteData.nome}*\n\n` +
                `📌 Status: *${statusLabel}*\n` +
                `🔢 Score: *${clienteData.score_interno ?? 0}/1000*\n` +
                `💰 Limite: ${limite}\n` +
                `💳 Utilizado: ${utilizado}\n` +
                (clienteData.dias_atraso && clienteData.dias_atraso > 0 ? `⚠️ Dias em atraso: *${clienteData.dias_atraso}*\n` : "") +
                `\n_Atualizado em ${new Date().toLocaleDateString("pt-BR")}_`;
            }

            // Enviar resposta
            try {
              await fetch(
                `${evoUrl}/message/sendText/${instancia.instance_name}`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json", apikey: instancia.instance_token },
                  body: JSON.stringify({ number: formattedNumber, textMessage: { text: resposta }, text: resposta }),
                }
              );

              // Logar resposta automática
              await adminClient.from("whatsapp_mensagens_log").insert({
                instancia_id: instancia.id,
                cliente_id: cliente?.id || null,
                direcao: "saida",
                telefone,
                conteudo: resposta,
                tipo: "text",
                status: "enviada",
                metadata: { auto_reply: true, query_type: isScoreQuery ? "score" : "status" },
              });
            } catch (sendErr) {
              console.error("[webhook-whatsapp] Erro ao enviar auto-reply score/status:", sendErr);
            }

            // Retornar — não processar chatbot keywords
            return new Response(
              JSON.stringify({ ok: true, event: "auto_reply_score_status" }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          } else if (!clienteData && evoUrl && instancia.instance_token) {
            // Cliente não encontrado pelo telefone
            const resposta = `❌ Não encontramos um cadastro vinculado a este número.\n\nPor favor, entre em contato com nosso atendimento para verificar seu cadastro.`;
            try {
              await fetch(
                `${evoUrl}/message/sendText/${instancia.instance_name}`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json", apikey: instancia.instance_token },
                  body: JSON.stringify({ number: formattedNumber, textMessage: { text: resposta }, text: resposta }),
                }
              );
              await adminClient.from("whatsapp_mensagens_log").insert({
                instancia_id: instancia.id,
                cliente_id: null,
                direcao: "saida",
                telefone,
                conteudo: resposta,
                tipo: "text",
                status: "enviada",
                metadata: { auto_reply: true, query_type: isScoreQuery ? "score" : "status", not_found: true },
              });
            } catch { /* ignore */ }
          }
        }
      }

      // ── Motor de Fluxo do Chatbot ────────────────────────
      // 1. Verificar se há sessão ativa (resposta a etapa anterior)
      // 2. Se não, verificar match de palavra-chave (novo fluxo)
      // 3. Executar etapas: mensagem → condição → ação → espera → finalizar

      console.log(`[chatbot] Processando: tipo=${tipo} conteudo="${(conteudo || "").slice(0, 50)}" telefone=${telefone} instancia=${instancia?.id || "null"}`);

      // Helpers do motor de fluxo
      const evoUrl = (Deno.env.get("EVOLUTION_API_URL") || instancia?.evolution_url || "").replace(/\/$/, "");

      // Resolver nome do cliente para templates
      const resolveNome = async () => {
        if (cliente?.id) {
          const { data: c } = await adminClient.from("clientes").select("nome").eq("id", cliente.id).maybeSingle();
          if (c?.nome) return c.nome;
        }
        return message.pushName || "cliente";
      };

      // Substituir variáveis de template
      const substituirTemplates = async (texto: string, contexto: Record<string, unknown> = {}) => {
        const nome = await resolveNome();
        return texto
          .replace(/\{nome\}/gi, String(contexto.cliente_nome || nome))
          .replace(/\{cliente_nome\}/gi, String(contexto.cliente_nome || nome))
          .replace(/\{telefone\}/gi, telefone)
          .replace(/\{resposta\}/gi, String(contexto.resposta || ""))
          .replace(/\\n/g, "\n");
      };

      // Enviar texto direto (sem etapa) — para mensagens dinâmicas de ações
      const enviarTexto = async (texto: string): Promise<boolean> => {
        if (!instancia || !evoUrl || !instancia.instance_token) return false;
        try {
          const sendResp = await fetch(`${evoUrl}/message/sendText/${instancia.instance_name}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: instancia.instance_token },
            body: JSON.stringify({
              number: formattedNumber,
              textMessage: { text: texto },
              text: texto,
              delay: 1500,
            }),
          });
          const ok = sendResp.ok;
          console.log(`[chatbot] enviarTexto ${ok ? "OK" : "FAIL"} → ${formattedNumber}`);
          await adminClient.from("whatsapp_mensagens_log").insert({
            instancia_id: instancia.id,
            cliente_id: cliente?.id || null,
            direcao: "saida",
            telefone,
            conteudo: texto,
            tipo: "text",
            status: ok ? "enviada" : "erro",
            metadata: { auto_reply: true, action_message: true },
          });
          return ok;
        } catch (err) {
          console.error(`[chatbot] enviarTexto ERRO:`, err);
          return false;
        }
      };

      // Enviar imagem direto (base64 ou URL) — para QR codes etc
      const enviarImagem = async (mediaBase64OrUrl: string, caption: string): Promise<boolean> => {
        if (!instancia || !evoUrl || !instancia.instance_token) return false;
        try {
          const isBase64 = mediaBase64OrUrl.length > 500 || mediaBase64OrUrl.startsWith("data:");
          const payload: Record<string, unknown> = { number: formattedNumber };
          if (isBase64) {
            const rawBase64 = mediaBase64OrUrl.replace(/^data:[^;]+;base64,/, "");
            payload.mediaMessage = { mediatype: "image", media: rawBase64, caption, fileName: "qrcode-pix.png", encoding: true };
          } else {
            payload.mediaMessage = { mediatype: "image", media: mediaBase64OrUrl, caption, fileName: "qrcode-pix.png" };
          }
          const sendResp = await fetch(`${evoUrl}/message/sendMedia/${instancia.instance_name}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: instancia.instance_token },
            body: JSON.stringify(payload),
          });
          const ok = sendResp.ok;
          if (!ok) {
            const errText = await sendResp.text();
            console.warn(`[chatbot] enviarImagem FAIL ${sendResp.status}: ${errText.substring(0, 200)}`);
          } else {
            console.log(`[chatbot] enviarImagem OK → ${formattedNumber}`);
          }
          await adminClient.from("whatsapp_mensagens_log").insert({
            instancia_id: instancia.id,
            cliente_id: cliente?.id || null,
            direcao: "saida",
            telefone,
            conteudo: caption,
            tipo: "image",
            status: ok ? "enviada" : "erro",
            metadata: { auto_reply: true, action_message: true },
          });
          return ok;
        } catch (err) {
          console.error(`[chatbot] enviarImagem ERRO:`, err);
          return false;
        }
      };

      // Enviar uma etapa (mensagem com ou sem botões)
      const enviarEtapa = async (etapa: Record<string, unknown>, contexto: Record<string, unknown> = {}): Promise<boolean> => {
        if (!instancia || !evoUrl || !instancia.instance_token) return false;
        if (!etapa.conteudo && etapa.tipo !== "acao" && etapa.tipo !== "espera") return false;

        const etapaConfig = (etapa.config || {}) as Record<string, unknown>;
        const etapaButtons = Array.isArray(etapaConfig.buttons)
          ? (etapaConfig.buttons as Array<{ label?: string; value?: string }>).filter((b) => b.label)
          : [];
        const hasButtons = etapaButtons.length > 0;
        const delayMs = (etapaConfig.delay_ms as number) || 0;
        const textoFinal = await substituirTemplates(String(etapa.conteudo || ""), contexto);

        if (!textoFinal && !hasButtons) return false;

        let sendOk = false;
        try {
          let sendResp: Response;

          if (hasButtons) {
            // Tentar botões nativos
            const evoButtons = etapaButtons.map((b, idx) => ({
              type: "reply" as const,
              displayText: b.label!,
              id: b.value || `btn_${idx}`,
            }));

            sendResp = await fetch(`${evoUrl}/message/sendButtons/${instancia.instance_name}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: instancia.instance_token },
              body: JSON.stringify({
                number: formattedNumber,
                title: textoFinal,
                buttons: evoButtons,
                ...(delayMs > 0 && { delay: delayMs }),
              }),
            });

            if (sendResp.ok) {
              sendOk = true;
              console.log(`[chatbot] sendButtons OK → ${formattedNumber}`);
            } else {
              console.warn(`[chatbot] sendButtons falhou HTTP ${sendResp.status}, fallback texto`);
            }
          }

          // Fallback: texto com opções numeradas
          if (!sendOk) {
            let textoComOpcoes = textoFinal;
            if (hasButtons) {
              const opcoes = etapaButtons.map((b, i) => `*${i + 1}.* ${b.label}`).join("\n");
              textoComOpcoes = `${textoFinal}\n\n${opcoes}\n\n_Responda com o número da opção desejada._`;
            }

            sendResp = await fetch(`${evoUrl}/message/sendText/${instancia.instance_name}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: instancia.instance_token },
              body: JSON.stringify({
                number: formattedNumber,
                textMessage: { text: textoComOpcoes },
                text: textoComOpcoes,
                ...(delayMs > 0 && { delay: delayMs }),
              }),
            });

            const result = await sendResp.text();
            sendOk = sendResp.ok;
            console.log(`[chatbot] sendText ${sendOk ? "OK" : "FAIL"} → ${formattedNumber}: ${result.slice(0, 150)}`);
          }

          // Log no banco
          await adminClient.from("whatsapp_mensagens_log").insert({
            instancia_id: instancia.id,
            cliente_id: cliente?.id || null,
            fluxo_id: etapa.fluxo_id || null,
            direcao: "saida",
            telefone,
            conteudo: textoFinal,
            tipo: "text",
            status: sendOk ? "enviada" : "erro",
            metadata: { auto_reply: true, etapa_id: etapa.id, had_buttons: hasButtons },
          });
        } catch (err) {
          console.error(`[chatbot] enviarEtapa ERRO:`, err);
        }

        return sendOk;
      };

      // Avaliar condição
      const avaliarCondicao = (config: Record<string, unknown>, contexto: Record<string, unknown>): boolean => {
        const variable = String(config.variable || "");
        const operator = String(config.operator || "");
        const expected = String(config.value || "").toLowerCase();

        let actual = "";
        if (variable === "horario") {
          // Verificar se estamos dentro do horário comercial
          const now = new Date();
          // Ajustar para UTC-3 (Brasilia)
          const brHour = (now.getUTCHours() - 3 + 24) % 24;
          const brDay = now.getUTCDay(); // 0=domingo
          const [startH, endH] = expected.split("-").map((t) => parseInt(t.split(":")[0]) || 0);
          actual = (brDay >= 1 && brDay <= 5 && brHour >= startH && brHour < endH) ? expected : "fora_do_horario";
        } else if (variable === "resposta") {
          actual = String(contexto.resposta || "").toLowerCase();
        } else if (variable === "dia_semana") {
          const dias = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
          actual = dias[new Date().getDay()];
        } else {
          actual = String(contexto[variable] || "").toLowerCase();
        }

        switch (operator) {
          case "equals": return actual === expected;
          case "not_equals": return actual !== expected;
          case "contains": return actual.includes(expected);
          case "not_contains": return !actual.includes(expected);
          case "greater_than": return parseFloat(actual) > parseFloat(expected);
          case "less_than": return parseFloat(actual) < parseFloat(expected);
          case "in_list": return expected.split(",").map((s) => s.trim()).includes(actual);
          default: return actual === expected;
        }
      };

      // ── Cálculo de juros (replicado do src/app/lib/juros.ts) ──
      const JUROS_FIXO_DIA = 100;
      const JUROS_PERC_DIA = 0.10;
      const JUROS_LIMIAR = 1_000;
      const calcularJurosAtraso = (valorOriginal: number, diasAtraso: number): number => {
        if (diasAtraso <= 0 || valorOriginal <= 0) return 0;
        if (valorOriginal < JUROS_LIMIAR) return JUROS_FIXO_DIA * diasAtraso;
        return Math.round(valorOriginal * JUROS_PERC_DIA * diasAtraso * 100) / 100;
      };
      const diasDeAtraso = (dataVencimento: string): number => {
        const venc = new Date(dataVencimento + "T00:00:00");
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        venc.setHours(0, 0, 0, 0);
        return Math.max(0, Math.floor((today.getTime() - venc.getTime()) / 86400000));
      };
      const valorCorrigido = (valorOriginal: number, dataVencimento: string, jurosDb = 0, multa = 0, desconto = 0) => {
        const dias = diasDeAtraso(dataVencimento);
        const juros = jurosDb > 0 ? jurosDb : calcularJurosAtraso(valorOriginal, dias);
        const total = Math.max(valorOriginal + juros + multa - desconto, 0);
        return { total, juros, dias };
      };

      // ── Handler de ações do chatbot — consultas reais ao banco de dados ──
      const executarAcaoHandler = async (
        actionType: string,
        actionParam: string,
        contexto: Record<string, unknown>,
      ): Promise<{ success: boolean; message?: string; skipConteudo?: boolean }> => {
        const fmt = (v: number) =>
          new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
        const fmtDate = (d: string) => {
          try { return new Date(d).toLocaleDateString("pt-BR"); } catch { return d; }
        };

        try {
          switch (actionType) {

            // ── Identificar cliente por CPF ──
            case "identificar_cpf": {
              const cpfRaw = String(contexto.resposta_raw || contexto.resposta || "").replace(/\D/g, "");
              if (!cpfRaw || cpfRaw.length < 11) {
                contexto.cpf_encontrado = "false";
                return { success: false, message: "⚠️ CPF inválido. Informe os 11 dígitos sem pontos ou traços." };
              }
              const { data: c } = await adminClient.from("clientes")
                .select("id, nome, status, score_interno, limite_credito, credito_utilizado, bonus_acumulado, dias_atraso")
                .eq("cpf", cpfRaw)
                .maybeSingle();
              if (c) {
                contexto.cliente_id = c.id;
                contexto.cliente_nome = c.nome;
                contexto.cliente_encontrado = "true";
                contexto.cpf_encontrado = "true";
                return { success: true, message: `✅ Identificamos! Olá, *${c.nome}*! Vou consultar suas informações...` };
              }
              contexto.cpf_encontrado = "false";
              return { success: false };
            }

            // ── Consultar parcelas (com cálculo de juros corrigido) ──
            case "consultar_parcelas": {
              const clienteId = String(contexto.cliente_id || "");
              if (!clienteId) return { success: false, message: "❌ Cliente não identificado." };
              // Buscar pendentes e vencidas; filtro real via status derivado
              const { data: parcelas } = await adminClient.from("parcelas")
                .select("id, numero, valor, valor_original, data_vencimento, status, juros, multa, desconto")
                .eq("cliente_id", clienteId)
                .in("status", ["pendente", "vencida"])
                .order("data_vencimento");

              if (!parcelas || parcelas.length === 0) {
                const label = actionParam === "vencidas" ? "vencidas" : "em aberto";
                return { success: true, message: `✅ Não há parcelas ${label} no momento. Você está em dia! 🎉`, skipConteudo: true };
              }

              // Recalcular status real e valores corrigidos
              const parcelasCorrigidas = parcelas.map((p: Record<string, unknown>) => {
                const vencStr = p.data_vencimento as string;
                let statusReal = p.status as string;
                // Derivar: pendente com vencimento passado → vencida
                if (statusReal === "pendente") {
                  const venc = new Date(vencStr + "T00:00:00");
                  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
                  if (venc < hoje) statusReal = "vencida";
                }
                const corr = valorCorrigido(
                  (p.valor_original as number) || (p.valor as number) || 0,
                  vencStr,
                  (p.juros as number) || 0,
                  (p.multa as number) || 0,
                  (p.desconto as number) || 0,
                );
                return { ...p, statusReal, valorCorrigido: corr.total, jurosCalc: corr.juros, diasAtraso: corr.dias };
              });

              // Filtrar se pediu só vencidas
              const filtered = actionParam === "vencidas"
                ? parcelasCorrigidas.filter((p) => p.statusReal === "vencida")
                : parcelasCorrigidas;

              if (filtered.length === 0) {
                return { success: true, message: `✅ Não há parcelas vencidas no momento. Você está em dia! 🎉`, skipConteudo: true };
              }

              const vencidas = filtered.filter((p) => p.statusReal === "vencida");
              const pendentes = filtered.filter((p) => p.statusReal === "pendente");
              const totalCorrigido = filtered.reduce((s, p) => s + p.valorCorrigido, 0);

              let msg = actionParam === "vencidas"
                ? `⚠️ *Parcelas Vencidas*\n\n`
                : `📋 *Resumo de Cobranças*\n\n`;
              if (actionParam !== "vencidas" && vencidas.length > 0) {
                msg += `🔴 *${vencidas.length} vencida(s)*\n`;
              }
              if (pendentes.length > 0) {
                msg += `🟡 *${pendentes.length} pendente(s)*\n`;
              }
              msg += `💰 Total corrigido: *${fmt(totalCorrigido)}*\n\n`;

              for (const p of filtered.slice(0, 6)) {
                const icon = p.statusReal === "vencida" ? "🔴" : "🟡";
                const valorOrig = (p.valor_original as number) || (p.valor as number) || 0;
                const jurosInfo = p.jurosCalc > 0 ? `\n   📈 Juros: +${fmt(p.jurosCalc)}` : "";
                const atrasoInfo = p.diasAtraso > 0 ? ` (${p.diasAtraso}d atraso)` : "";
                msg += `${icon} *Parcela ${p.numero}*${atrasoInfo}\n   Original: ${fmt(valorOrig)} → *${fmt(p.valorCorrigido)}*${jurosInfo}\n   Venc: ${fmtDate(p.data_vencimento as string)}\n\n`;
              }
              if (filtered.length > 6) {
                msg += `_...e mais ${filtered.length - 6} parcela(s)_`;
              }

              contexto.total_parcelas = filtered.length;
              contexto.total_vencidas = vencidas.length;
              contexto.total_valor = totalCorrigido;
              return { success: true, message: msg, skipConteudo: true };
            }

            // ── Consultar saldo / score ──
            case "consultar_saldo": {
              const clienteId = String(contexto.cliente_id || "");
              let clienteData: Record<string, unknown> | null = null;
              if (clienteId) {
                const { data } = await adminClient.from("clientes")
                  .select("id, nome, status, score_interno, limite_credito, credito_utilizado, bonus_acumulado, dias_atraso")
                  .eq("id", clienteId)
                  .maybeSingle();
                clienteData = data;
              }
              if (!clienteData) {
                const { data } = await adminClient.from("clientes")
                  .select("id, nome, status, score_interno, limite_credito, credito_utilizado, bonus_acumulado, dias_atraso")
                  .eq("telefone", telefone)
                  .maybeSingle();
                clienteData = data;
                if (data?.id) {
                  contexto.cliente_id = data.id as string;
                  contexto.cliente_nome = data.nome as string;
                  contexto.cliente_encontrado = "true";
                }
              }
              if (!clienteData) {
                return { success: false, message: "❌ Não encontramos seu cadastro. Fale com um atendente para regularizar." };
              }

              const score = (clienteData.score_interno as number) ?? 0;
              const faixa = score >= 800 ? "Excelente ✅" : score >= 600 ? "Bom 👍" : score >= 400 ? "Regular ⚠️" : "Baixo ❌";
              const disponivel = ((clienteData.limite_credito as number) || 0) - ((clienteData.credito_utilizado as number) || 0);

              const statusLabel = clienteData.status === "em_dia" ? "Em dia ✅" : clienteData.status === "a_vencer" ? "A vencer ⚠️" : "Vencido 🔴";
              let msg = `📊 *Seu Painel Financeiro*\n\n` +
                `👤 ${clienteData.nome}\n` +
                `📌 Status: *${statusLabel}*\n\n` +
                `🔢 Score: *${score}/1000* — ${faixa}\n` +
                `💰 Limite: ${fmt((clienteData.limite_credito as number) || 0)}\n` +
                `💳 Utilizado: ${fmt((clienteData.credito_utilizado as number) || 0)}\n` +
                `✅ Disponível: *${fmt(disponivel)}*\n` +
                `🎁 Bônus: ${fmt((clienteData.bonus_acumulado as number) || 0)}\n`;
              if (((clienteData.dias_atraso as number) || 0) > 0) {
                msg += `\n⚠️ *${clienteData.dias_atraso} dia(s) em atraso*`;
              }
              msg += `\n\n_Atualizado em ${new Date().toLocaleDateString("pt-BR")}_`;
              return { success: true, message: msg, skipConteudo: true };
            }

            // ── Criar ticket de atendimento ──
            case "criar_ticket": {
              let cId = String(contexto.cliente_id || "");
              if (!cId) {
                const { data: c } = await adminClient.from("clientes").select("id").eq("telefone", telefone).maybeSingle();
                if (c) { cId = c.id; contexto.cliente_id = c.id; }
              }
              if (!cId) {
                return { success: false, message: "⚠️ Não conseguimos identificar seu cadastro. Um atendente será notificado." };
              }
              const { data: existingTicket } = await adminClient.from("tickets_atendimento")
                .select("id")
                .eq("cliente_id", cId)
                .in("status", ["aberto", "em_atendimento", "aguardando_cliente"])
                .limit(1)
                .maybeSingle();
              if (existingTicket) {
                return { success: true, message: "📋 Você já tem um atendimento em andamento. Um atendente responderá em breve!" };
              }

              const assunto = actionParam || "Solicitação via Chatbot WhatsApp";
              const { error: ticketErr } = await adminClient.from("tickets_atendimento").insert({
                cliente_id: cId,
                assunto,
                descricao: `Ticket criado pelo chatbot WhatsApp.\nTelefone: ${telefone}`,
                canal: "whatsapp",
                status: "aberto",
                prioridade: "media",
              });
              if (ticketErr) {
                console.error("[chatbot] Erro ao criar ticket:", JSON.stringify(ticketErr));
                return { success: false, message: "❌ Erro ao criar ticket. Tente novamente." };
              }
              return { success: true, message: "🎫 *Ticket criado com sucesso!*\nUm atendente entrará em contato em breve." };
            }

            // ── Propor acordo / renegociação para parcelas vencidas ──
            case "propor_acordo": {
              const clienteId = String(contexto.cliente_id || "");
              if (!clienteId) return { success: false, message: "❌ Cliente não identificado." };

              const respostaAcordo = String(contexto.resposta || "").trim().toLowerCase();

              // ── PASSO 2: cliente escolheu data de pagamento → gerar PIX da entrada ──
              if (contexto.acordo_aguardando_data && respostaAcordo) {
                // Opções: 1=dia 5, 2=dia 10, 3=dia 15, 4=dia 20, 5=dia 25
                const diaOpcoes: Record<string, number> = { "1": 5, "2": 10, "3": 15, "4": 20, "5": 25 };
                const diaPagamento = diaOpcoes[respostaAcordo] || parseInt(respostaAcordo);
                if (!diaPagamento || diaPagamento < 1 || diaPagamento > 28) {
                  return { success: true, message: `❌ Opção inválida. Escolha um dia (1-5) ou informe o dia do mês (ex: *10*).`, skipConteudo: true, waitForInput: true };
                }

                const valorEntrada = Number(contexto.acordo_valor_entrada || 0);
                const totalDivida = Number(contexto.acordo_total_divida || 0);
                const restante = Math.round((totalDivida - valorEntrada) * 100) / 100;
                const parcelasIds = (contexto.acordo_parcelas_ids as string[]) || [];
                const empIds = (contexto.acordo_emprestimo_ids as string[]) || [];
                const cfgMax = Number(contexto.acordo_max_parcelas || 12);
                const numParcelasRenego = Math.max(1, Math.min(parcelasIds.length, cfgMax));
                const valorParcelaRenego = Math.round((restante / numParcelasRenego) * 100) / 100;

                // Gerar PIX da entrada
                const efiCreds = await loadEfiCreds(adminClient);
                const clienteData = await adminClient.from("clientes").select("nome, cpf").eq("id", clienteId).maybeSingle();

                if (efiCreds && valorEntrada > 0) {
                  const chargeData = await criarCobrancaPix(
                    adminClient, efiCreds,
                    { id: null, emprestimo_id: null, cliente_id: clienteId, numero: "ENTRADA", valor: valorEntrada },
                    clienteData?.data?.nome || "Cliente",
                    clienteData?.data?.cpf || null,
                    valorEntrada,
                  );

                  // Calcular datas de vencimento das parcelas restantes
                  const datasRenego: string[] = [];
                  const hoje = new Date();
                  let mesInicio = hoje.getMonth() + 1; // próximo mês
                  let anoInicio = hoje.getFullYear();
                  if (mesInicio > 11) { mesInicio = 0; anoInicio++; }
                  for (let i = 0; i < numParcelasRenego; i++) {
                    let mes = mesInicio + i;
                    let ano = anoInicio;
                    if (mes > 11) { mes -= 12; ano++; }
                    const data = new Date(ano, mes, diaPagamento);
                    datasRenego.push(data.toISOString().split("T")[0]);
                  }

                  let msg = `✅ *Acordo Confirmado!*\n\n` +
                    `💰 Entrada: *${fmt(valorEntrada)}* (pague agora via PIX)\n` +
                    `📊 Restante: *${fmt(restante)}* em *${numParcelasRenego}x* de *${fmt(valorParcelaRenego)}*\n` +
                    `📅 Dia de pagamento: todo dia *${diaPagamento}*\n\n` +
                    `📋 *Cronograma:*\n`;
                  datasRenego.forEach((d, i) => {
                    msg += `  ${i + 1}. ${d.split("-").reverse().join("/")} — ${fmt(valorParcelaRenego)}\n`;
                  });
                  msg += `\n⚠️ _Se não cumprir os pagamentos, o empréstimo será movido para cobrança judicial (N3)._\n\n`;

                  if (chargeData?.brCode) {
                    msg += `💳 *PIX da Entrada:*\n\nCopie o código abaixo:\n\n${chargeData.brCode}\n\n📱 Cole no app do banco → *Pix Copia e Cola*`;
                    await enviarTexto(msg);
                    if (chargeData.qrCodeImage) {
                      await new Promise((r) => setTimeout(r, 2000));
                      await enviarImagem(chargeData.qrCodeImage, `QR Code - Entrada Acordo - ${fmt(valorEntrada)}`);
                    }
                  } else {
                    msg += `⚠️ Não foi possível gerar o PIX automaticamente.\nUm atendente enviará o código.`;
                    await enviarTexto(msg);
                  }

                  // ── Criar registro formal do acordo ──
                  const entradaPctVal = Number(contexto.acordo_entrada_pct || 0.30);
                  const totalJuros = Number(contexto.acordo_total_juros || 0);

                  // Atualizar/criar kanban card
                  const { data: existingKanban } = await adminClient.from("kanban_cobranca")
                    .select("id").eq("cliente_id", clienteId)
                    .in("etapa", ["a_vencer", "vencido", "contatado", "negociacao"])
                    .limit(1).maybeSingle();
                  const obsTexto = `Acordo via chatbot. Entrada: ${fmt(valorEntrada)}. Restante: ${numParcelasRenego}x ${fmt(valorParcelaRenego)} todo dia ${diaPagamento}. Total: ${fmt(totalDivida)}`;
                  let kanbanCardId: string | null = null;
                  if (existingKanban) {
                    kanbanCardId = existingKanban.id;
                    await adminClient.from("kanban_cobranca").update({
                      etapa: "acordo", valor_divida: totalDivida,
                      ultimo_contato: new Date().toISOString(),
                      observacao: obsTexto,
                    }).eq("id", existingKanban.id);
                  } else {
                    const { data: newKanban } = await adminClient.from("kanban_cobranca").insert({
                      cliente_id: clienteId, etapa: "acordo", valor_divida: totalDivida,
                      tentativas_contato: 1, ultimo_contato: new Date().toISOString(),
                      observacao: obsTexto,
                    }).select("id").single();
                    kanbanCardId = newKanban?.id || null;
                  }

                  // Inserir acordo na tabela
                  const { data: novoAcordo, error: errAcordo } = await adminClient.from("acordos").insert({
                    cliente_id: clienteId,
                    kanban_card_id: kanbanCardId,
                    origem: "bot",
                    valor_divida_original: totalDivida,
                    valor_entrada: valorEntrada,
                    entrada_percentual: Math.round(entradaPctVal * 100),
                    valor_restante: restante,
                    num_parcelas: numParcelasRenego,
                    valor_parcela: valorParcelaRenego,
                    dia_pagamento: diaPagamento,
                    data_primeira_parcela: datasRenego[0] || null,
                    entrada_charge_id: chargeData?.txid ? null : null, // será linkado depois se necessário
                    parcelas_originais_ids: parcelasIds,
                    status: "ativo",
                    observacao: obsTexto,
                  }).select("id").single();

                  if (errAcordo) {
                    console.error("[chatbot] Erro ao criar acordo:", errAcordo.message);
                  }

                  const acordoId = novoAcordo?.id || null;

                  // Congelar parcelas originais (param juros e notificações)
                  if (parcelasIds.length > 0) {
                    const { error: errFreeze } = await adminClient.from("parcelas")
                      .update({ congelada: true })
                      .in("id", parcelasIds);
                    if (errFreeze) console.error("[chatbot] Erro ao congelar parcelas:", errFreeze.message);
                  }

                  // Criar parcelas do acordo no banco
                  if (acordoId && datasRenego.length > 0 && empIds.length > 0) {
                    const parcelasAcordoRows = datasRenego.map((d: string, i: number) => ({
                      emprestimo_id: empIds[0],
                      cliente_id: clienteId,
                      numero: i + 1,
                      valor: valorParcelaRenego,
                      valor_original: valorParcelaRenego,
                      data_vencimento: d,
                      status: "pendente",
                      acordo_id: acordoId,
                    }));
                    const { error: errParc } = await adminClient.from("parcelas").insert(parcelasAcordoRows);
                    if (errParc) console.error("[chatbot] Erro ao criar parcelas do acordo:", errParc.message);
                  }

                  // Limpar contexto
                  contexto.acordo_concluido = true;
                  contexto.acordo_id = acordoId;
                  delete contexto.acordo_aguardando_data;
                  delete contexto.acordo_aguardando_confirmacao;
                  return { success: true, message: "", skipConteudo: true };
                } else {
                  return { success: true, message: `⚠️ Não foi possível gerar o pagamento. Um atendente entrará em contato.`, skipConteudo: true };
                }
              }

              // ── PASSO 1: cliente respondeu "sim" à proposta → perguntar data ──
              if (contexto.acordo_aguardando_confirmacao && respostaAcordo) {
                if (respostaAcordo === "sim" || respostaAcordo === "1" || respostaAcordo === "aceito") {
                  const totalDivida = Number(contexto.acordo_total_divida || 0);
                  const valorEntrada = Number(contexto.acordo_valor_entrada || 0);
                  const restante = Math.round((totalDivida - valorEntrada) * 100) / 100;

                  let msg = `✅ Ótimo! Vamos definir as condições.\n\n` +
                    `💰 Entrada: *${fmt(valorEntrada)}* (será gerado PIX)\n` +
                    `📊 Restante: *${fmt(restante)}*\n\n` +
                    `📅 *Em qual dia do mês deseja pagar as parcelas restantes?*\n\n` +
                    `*1.* Dia 5\n` +
                    `*2.* Dia 10\n` +
                    `*3.* Dia 15\n` +
                    `*4.* Dia 20\n` +
                    `*5.* Dia 25\n\n` +
                    `_Responda com o número da opção._`;

                  delete contexto.acordo_aguardando_confirmacao;
                  contexto.acordo_aguardando_data = true;
                  return { success: true, message: msg, skipConteudo: true, waitForInput: true };
                } else {
                  // Cliente recusou
                  delete contexto.acordo_aguardando_confirmacao;
                  return { success: true, message: `❌ Acordo cancelado. As dívidas permanecem e continuam acumulando juros diariamente.\n\n_Quando quiser renegociar, é só voltar aqui._`, skipConteudo: true };
                }
              }

              // ── PASSO 0: montar proposta inicial ──
              // Ler config de entrada mínima
              const { data: cfgEntrada } = await adminClient.from("configuracoes_sistema").select("valor").eq("chave", "acordo_entrada_percentual").maybeSingle();
              const entradaPct = Number(cfgEntrada?.valor ?? 30) / 100; // 0.30 default

              const { data: cfgMaxParc } = await adminClient.from("configuracoes_sistema").select("valor").eq("chave", "acordo_max_parcelas").maybeSingle();
              const maxParcelas = Number(cfgMaxParc?.valor ?? 12);

              const { data: vencidas } = await adminClient.from("parcelas")
                .select("id, numero, valor, valor_original, data_vencimento, juros, multa, desconto, emprestimo_id, status")
                .eq("cliente_id", clienteId)
                .in("status", ["pendente", "vencida"])
                .eq("congelada", false)
                .order("data_vencimento");

              const vencidasReais = (vencidas || []).filter((p: Record<string, unknown>) => {
                if (p.status === "vencida") return true;
                const venc = new Date((p.data_vencimento as string) + "T00:00:00");
                const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
                return venc < hoje;
              });
              if (vencidasReais.length === 0) {
                return { success: true, message: "✅ Você não tem parcelas vencidas! Não é necessário acordo. 🎉", skipConteudo: true };
              }

              let totalDivida = 0;
              let totalJuros = 0;
              for (const p of vencidasReais) {
                const corr = valorCorrigido(
                  (p.valor_original as number) || (p.valor as number) || 0,
                  p.data_vencimento as string,
                  (p.juros as number) || 0, (p.multa as number) || 0, (p.desconto as number) || 0,
                );
                totalDivida += corr.total;
                totalJuros += corr.juros;
              }

              // Entrada mínima: config (padrão 30%)
              const valorEntrada = Math.round(totalDivida * entradaPct * 100) / 100;
              const entradaPctDisplay = Math.round(entradaPct * 100);

              // Listar parcelas na mensagem
              let msg = `🤝 *Proposta de Renegociação*\n\n` +
                `📊 Você tem *${vencidasReais.length} parcela(s) vencida(s)*:\n\n`;
              for (const p of vencidasReais.slice(0, 8)) {
                const corr = valorCorrigido((p.valor_original as number) || (p.valor as number) || 0, p.data_vencimento as string, (p.juros as number) || 0, (p.multa as number) || 0, (p.desconto as number) || 0);
                msg += `🔴 Parcela ${p.numero} — *${fmt(corr.total)}*`;
                if (corr.juros > 0) msg += ` (+${fmt(corr.juros)} juros)`;
                msg += `\n`;
              }
              msg += `\n💰 *Dívida total: ${fmt(totalDivida)}*\n`;
              if (totalJuros > 0) msg += `📈 Juros acumulados: ${fmt(totalJuros)}\n`;
              msg += `\n🔑 *Condições de renegociação:*\n` +
                `• Entrada mínima: *${fmt(valorEntrada)}* (${entradaPctDisplay}%)\n` +
                `• Restante pode ser parcelado\n` +
                `• Se não cumprir, a dívida volta ao valor original + juros\n\n` +
                `Deseja aceitar? Responda *Sim* ou *Não*`;

              // Salvar contexto para próxima rodada
              contexto.acordo_aguardando_confirmacao = true;
              contexto.acordo_total_divida = totalDivida;
              contexto.acordo_total_juros = totalJuros;
              contexto.acordo_valor_entrada = valorEntrada;
              contexto.acordo_entrada_pct = entradaPct;
              contexto.acordo_max_parcelas = maxParcelas;
              contexto.acordo_parcelas_ids = vencidasReais.map((p: Record<string, unknown>) => p.id);
              contexto.acordo_emprestimo_ids = [...new Set(vencidasReais.map((p: Record<string, unknown>) => p.emprestimo_id).filter(Boolean))];

              return { success: true, message: msg, skipConteudo: true, waitForInput: true };
            }

            // ── Buscar PIX para pagamento (multi-parcela) ──
            case "buscar_pix": {
              const clienteId = String(contexto.cliente_id || "");
              if (!clienteId) return { success: false, message: "❌ Cliente não identificado." };

              const { data: parcelas } = await adminClient.from("parcelas")
                .select("id, numero, valor, valor_original, data_vencimento, status, juros, multa, desconto, woovi_charge_id, emprestimo_id, cliente_id")
                .eq("cliente_id", clienteId)
                .in("status", ["pendente", "vencida"])
                .order("data_vencimento");

              if (!parcelas || parcelas.length === 0) {
                return { success: true, message: "✅ Você não tem parcelas em aberto para pagar! 🎉", skipConteudo: true };
              }

              // Recalcular e derivar status real
              const parcelasCorr = parcelas.map((p: Record<string, unknown>) => {
                const vencStr = p.data_vencimento as string;
                let statusReal = p.status as string;
                if (statusReal === "pendente") {
                  const venc = new Date(vencStr + "T00:00:00");
                  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
                  if (venc < hoje) statusReal = "vencida";
                }
                const corr = valorCorrigido((p.valor_original as number) || (p.valor as number) || 0, vencStr, (p.juros as number) || 0, (p.multa as number) || 0, (p.desconto as number) || 0);
                return { ...p, statusReal, valorCorr: corr.total, jurosCalc: corr.juros, diasAtr: corr.dias };
              });

              // Helper: buscar ou criar cobrança PIX com valor correto
              const obterPixParcela = async (
                parc: typeof parcelasCorr[0],
                efiCr: EfiCreds | null,
                nomeCliente: string,
                cpfCliente: string | null,
              ): Promise<{ brCode: string | null; qrCodeImage: string | null }> => {
                let brCode: string | null = null;
                let qrCodeImage: string | null = null;
                const valorEsperado = Math.round(parc.valorCorr * 100);

                // Buscar cobrança existente
                let chargeExistente: Record<string, unknown> | null = null;
                if (parc.woovi_charge_id) {
                  const { data } = await adminClient.from("woovi_charges")
                    .select("woovi_charge_id, br_code, qr_code_image, status, valor")
                    .eq("woovi_charge_id", parc.woovi_charge_id).eq("status", "ACTIVE").maybeSingle();
                  if (data?.br_code) chargeExistente = data;
                }
                if (!chargeExistente) {
                  const { data } = await adminClient.from("woovi_charges")
                    .select("woovi_charge_id, br_code, qr_code_image, status, valor")
                    .eq("parcela_id", parc.id).eq("status", "ACTIVE")
                    .order("created_at", { ascending: false }).limit(1).maybeSingle();
                  if (data?.br_code) chargeExistente = data;
                }

                // Verificar se o valor da cobrança bate com o valor corrigido (tolerância R$0.05)
                if (chargeExistente) {
                  const valorCharge = Math.round(Number(chargeExistente.valor || 0) * 100);
                  if (Math.abs(valorCharge - valorEsperado) <= 5) {
                    // Valor correto — usar cobrança existente
                    brCode = chargeExistente.br_code as string;
                    qrCodeImage = (chargeExistente.qr_code_image as string) || null;
                  } else {
                    // Valor defasado (juros mudaram) — expirar e criar nova
                    console.log(`[chatbot] Cobrança ${chargeExistente.woovi_charge_id} valor=${valorCharge/100} != esperado=${valorEsperado/100}, expirando`);
                    await adminClient.from("woovi_charges")
                      .update({ status: "EXPIRED" })
                      .eq("woovi_charge_id", chargeExistente.woovi_charge_id);
                    chargeExistente = null;
                  }
                }

                // Criar nova cobrança com valor corrigido
                if (!brCode && efiCr) {
                  const chargeData = await criarCobrancaPix(adminClient, efiCr, parc, nomeCliente, cpfCliente, parc.valorCorr);
                  if (chargeData) {
                    brCode = chargeData.brCode;
                    qrCodeImage = chargeData.qrCodeImage;
                  }
                }
                return { brCode, qrCodeImage };
              };

              // Helper: enviar mensagem + QR de uma parcela
              const enviarPixMensagem = async (parc: typeof parcelasCorr[0], brCode: string | null, qrCodeImage: string | null) => {
                const icon = parc.statusReal === "vencida" ? "🔴" : "🟡";
                let msg = `💳 *Pagamento via Pix*\n\n` +
                  `${icon} Parcela ${parc.numero} — *${fmt(parc.valorCorr)}*\n` +
                  (parc.jurosCalc > 0 ? `📈 Juros: +${fmt(parc.jurosCalc)} (${parc.diasAtr}d atraso)\n` : "") +
                  `📅 Vencimento: ${fmtDate(parc.data_vencimento as string)}\n\n`;
                if (brCode) {
                  msg += `Copie o código Pix abaixo:\n\n${brCode}\n\n📱 Cole no app do banco → *Pix Copia e Cola*`;
                } else {
                  msg += `⚠️ Não foi possível gerar o código Pix.\nSolicite a um atendente.`;
                }
                await enviarTexto(msg);
                if (qrCodeImage) {
                  await new Promise((r) => setTimeout(r, 2000));
                  await enviarImagem(qrCodeImage, `QR Code PIX - Parcela ${parc.numero} - ${fmt(parc.valorCorr)}`);
                }
              };

              // Se o cliente já fez uma escolha (resposta a wait_for_input)
              const respostaPix = String(contexto.resposta || "").trim();
              if (contexto.pix_aguardando_escolha && respostaPix) {
                const escolha = respostaPix.toLowerCase();
                let selecionadas: typeof parcelasCorr = [];

                if (escolha === "todas" || escolha === "tudo" || escolha === String(parcelasCorr.length + 1)) {
                  selecionadas = parcelasCorr;
                } else {
                  const nums = respostaPix.replace(/[eE,\s]+/g, ",").split(",").map(n => parseInt(n.trim())).filter(n => !isNaN(n));
                  for (const num of nums) {
                    if (num >= 1 && num <= parcelasCorr.length) selecionadas.push(parcelasCorr[num - 1]);
                  }
                }

                if (selecionadas.length === 0) {
                  return { success: true, message: `❌ Opção inválida. Responda com o número da parcela (ex: *1* ou *1,2* ou *Todas*).`, skipConteudo: true, waitForInput: true };
                }

                delete contexto.pix_aguardando_escolha;

                const efiCreds = await loadEfiCreds(adminClient);
                const clienteData = await adminClient.from("clientes").select("nome, cpf").eq("id", clienteId).maybeSingle();

                for (let i = 0; i < selecionadas.length; i++) {
                  const parc = selecionadas[i];
                  const { brCode, qrCodeImage } = await obterPixParcela(parc, efiCreds, clienteData?.data?.nome || "Cliente", clienteData?.data?.cpf || null);
                  await enviarPixMensagem(parc, brCode, qrCodeImage);
                  if (i < selecionadas.length - 1) await new Promise((r) => setTimeout(r, 3000));
                }

                return { success: true, message: "", skipConteudo: true };
              }

              // ── PASSO 0: Listar parcelas para o cliente escolher ──
              if (parcelasCorr.length === 1) {
                // Só uma parcela — pula direto pro pagamento
                const parc = parcelasCorr[0];
                const efiCreds = await loadEfiCreds(adminClient);
                const clienteData = await adminClient.from("clientes").select("nome, cpf").eq("id", clienteId).maybeSingle();
                const { brCode, qrCodeImage } = await obterPixParcela(parc, efiCreds, clienteData?.data?.nome || "Cliente", clienteData?.data?.cpf || null);
                await enviarPixMensagem(parc, brCode, qrCodeImage);
                return { success: true, message: "", skipConteudo: true };
              }

              // Múltiplas parcelas — mostrar lista para escolher
              const totalGeral = parcelasCorr.reduce((s, p) => s + p.valorCorr, 0);
              let msg = `💳 *Pagamento via Pix*\n\n` +
                `Você tem *${parcelasCorr.length}* parcelas em aberto:\n\n`;
              parcelasCorr.forEach((p, i) => {
                const icon = p.statusReal === "vencida" ? "🔴" : "🟡";
                msg += `*${i + 1}.* ${icon} Parcela ${p.numero} — *${fmt(p.valorCorr)}*`;
                if (p.jurosCalc > 0) msg += ` (+${fmt(p.jurosCalc)} juros)`;
                msg += ` — Venc: ${fmtDate(p.data_vencimento as string)}\n`;
              });
              msg += `\n*${parcelasCorr.length + 1}.* 💰 Pagar *TODAS* — ${fmt(totalGeral)}\n\n` +
                `_Responda com o número da parcela que deseja pagar (ex: *1* ou *1,2* ou *Todas*)_`;

              contexto.pix_aguardando_escolha = true;
              return { success: true, message: msg, skipConteudo: true, waitForInput: true };
            }

            default:
              console.warn(`[chatbot] Ação desconhecida: ${actionType}`);
              return { success: true };
          }
        } catch (err) {
          console.error(`[chatbot] Erro ao executar ação ${actionType}:`, err);
          return { success: false, message: "❌ Ocorreu um erro. Tente novamente ou fale com um atendente." };
        }
      };

      // Executar cadeia de etapas a partir de uma etapa (não-mensagem são executadas automaticamente)
      const executarCadeia = async (
        etapaInicial: Record<string, unknown>,
        todasEtapas: Record<string, unknown>[],
        sessaoId: string,
        contexto: Record<string, unknown>,
        fluxoId: string,
      ) => {
        let etapaAtual: Record<string, unknown> | null = etapaInicial;
        let iteracoes = 0;
        const MAX_ITER = 20; // proteção contra loops infinitos

        while (etapaAtual && iteracoes < MAX_ITER) {
          iteracoes++;
          const tipoEtapa = String(etapaAtual.tipo || "");
          const etapaConfig = (etapaAtual.config || {}) as Record<string, unknown>;
          const etapaId = String(etapaAtual.id);

          console.log(`[chatbot] Executando etapa ${etapaId} tipo=${tipoEtapa} iter=${iteracoes}`);

          if (tipoEtapa === "mensagem") {
            await enviarEtapa(etapaAtual, contexto);

            // Se tem botões, pausar e aguardar resposta
            const btns = Array.isArray(etapaConfig.buttons) ? (etapaConfig.buttons as Array<{ label?: string }>).filter((b) => b.label) : [];
            const waitForInput = etapaConfig.wait_for_input === true;
            if (btns.length > 0 || waitForInput) {
              await adminClient.from("chatbot_sessoes").update({
                etapa_atual_id: etapaId,
                status: "aguardando_resposta",
                contexto,
              }).eq("id", sessaoId);
              return; // Pausa — espera resposta do usuário
            }

            // Sem botões: pequena pausa antes da próxima etapa
            await new Promise((r) => setTimeout(r, 1000));
            const nextId = etapaAtual.proximo_sim || ((etapaConfig.connections as Array<{ targetId: string }>) || [])[0]?.targetId;
            etapaAtual = nextId ? todasEtapas.find((e) => String(e.id) === String(nextId)) || null : null;
            continue;
          }

          if (tipoEtapa === "condicao") {
            const resultado = avaliarCondicao(etapaConfig, contexto);
            console.log(`[chatbot] Condição: ${etapaConfig.variable} ${etapaConfig.operator} ${etapaConfig.value} → ${resultado}`);
            const nextId = resultado ? etapaAtual.proximo_sim : etapaAtual.proximo_nao;
            etapaAtual = nextId ? todasEtapas.find((e) => String(e.id) === String(nextId)) || null : null;
            continue;
          }

          if (tipoEtapa === "acao") {
            const actionType = String(etapaConfig.action_type || "");
            const actionParam = String(etapaConfig.action_param || "");
            console.log(`[chatbot] Ação: ${actionType} param=${actionParam}`);

            const result = await executarAcaoHandler(actionType, actionParam, contexto);

            // Enviar mensagem dinâmica do resultado da ação
            if (result.message) {
              await enviarTexto(result.message);
            }
            // Enviar conteúdo estático se presente (e ação não pulou)
            if (etapaAtual.conteudo && !result.skipConteudo) {
              await enviarEtapa(etapaAtual, contexto);
            }

            // Pausa para não atropelar a próxima mensagem
            if (result.message || etapaAtual.conteudo) {
              await new Promise((r) => setTimeout(r, 3000));
            }

            // Atualizar contexto da sessão
            await adminClient.from("chatbot_sessoes").update({ contexto }).eq("id", sessaoId);

            // Se a ação pediu para aguardar input do cliente (ex: escolher parcela, confirmar acordo)
            if (result.waitForInput) {
              await adminClient.from("chatbot_sessoes").update({
                etapa_atual_id: etapaId,
                status: "aguardando_resposta",
                contexto,
              }).eq("id", sessaoId);
              return; // Pausa — espera resposta do usuário, ação será re-executada
            }

            // Avançar: proximo_sim para sucesso, proximo_nao para falha
            const connections = (etapaConfig.connections as Array<{ targetId: string }>) || [];
            const nextId = result.success
              ? (etapaAtual.proximo_sim || connections[0]?.targetId)
              : (etapaAtual.proximo_nao || etapaAtual.proximo_sim || connections[0]?.targetId);
            etapaAtual = nextId ? todasEtapas.find((e) => String(e.id) === String(nextId)) || null : null;
            continue;
          }

          if (tipoEtapa === "espera") {
            const durationMs = (etapaConfig.duration_ms as number) || 5000;
            const esperaAte = new Date(Date.now() + durationMs);

            // Guardar próxima etapa e pausar
            const nextId = etapaAtual.proximo_sim || ((etapaConfig.connections as Array<{ targetId: string }>) || [])[0]?.targetId;

            await adminClient.from("chatbot_sessoes").update({
              etapa_atual_id: nextId ? String(nextId) : null,
              status: "espera",
              espera_ate: esperaAte.toISOString(),
              contexto,
            }).eq("id", sessaoId);

            console.log(`[chatbot] Espera ${durationMs}ms, retomar em ${esperaAte.toISOString()}`);
            return; // Pausa — será retomado por cron ou próxima mensagem
          }

          if (tipoEtapa === "finalizar") {
            // Enviar mensagem de encerramento
            if (etapaAtual.conteudo) {
              await enviarEtapa(etapaAtual, contexto);
            }

            // Finalizar sessão
            await adminClient.from("chatbot_sessoes").update({
              status: "finalizado",
              etapa_atual_id: etapaId,
              contexto,
            }).eq("id", sessaoId);

            // Incrementar conversões
            try {
              await adminClient.from("fluxos_chatbot")
                .update({ conversoes: (contexto._disparos as number || 0) + 1 })
                .eq("id", fluxoId);
            } catch { /* ignore */ }

            console.log(`[chatbot] Fluxo finalizado: ${etapaConfig.close_reason || "sem_razao"}`);
            return;
          }

          // Tipo desconhecido — avançar
          const nextId = etapaAtual.proximo_sim || ((etapaConfig.connections as Array<{ targetId: string }>) || [])[0]?.targetId;
          etapaAtual = nextId ? todasEtapas.find((e) => String(e.id) === String(nextId)) || null : null;
        }

        // Se saiu do loop sem finalizar, finalizar a sessão
        if (iteracoes >= MAX_ITER) {
          console.warn(`[chatbot] MAX_ITER atingido, finalizando sessão ${sessaoId}`);
        }
        await adminClient.from("chatbot_sessoes").update({ status: "finalizado", contexto }).eq("id", sessaoId);
      };

      // ── Verificar sessão ativa existente ──────────────
      if (tipo === "text" && conteudo && instancia) {
        let sessaoAtiva: Record<string, unknown> | null = null;
        try {
          const { data: sessaoData, error: sessaoErr } = await adminClient
            .from("chatbot_sessoes")
            .select("id, fluxo_id, etapa_atual_id, status, contexto, espera_ate")
            .eq("instancia_id", instancia.id)
            .eq("telefone", telefone)
            .in("status", ["aguardando_resposta", "espera"])
            .maybeSingle();

          if (sessaoErr) {
            console.error(`[chatbot] Erro ao buscar sessão:`, JSON.stringify(sessaoErr));
          } else {
            sessaoAtiva = sessaoData;
          }
        } catch (sessErr) {
          console.error(`[chatbot] Exceção ao buscar sessão:`, sessErr);
        }

        if (sessaoAtiva) {
          console.log(`[chatbot] Sessão ativa encontrada: ${sessaoAtiva.id} status=${sessaoAtiva.status}`);

          // Buscar fluxo e etapas separadamente (evitar join complexo)
          const { data: fluxo } = await adminClient
            .from("fluxos_chatbot")
            .select("*")
            .eq("id", sessaoAtiva.fluxo_id)
            .single();

          const { data: etapasData } = await adminClient
            .from("fluxos_chatbot_etapas")
            .select("*")
            .eq("fluxo_id", sessaoAtiva.fluxo_id);

          if (!fluxo || !etapasData) {
            console.error(`[chatbot] Fluxo ou etapas não encontrados para sessão ${sessaoAtiva.id}`);
            await adminClient.from("chatbot_sessoes").update({ status: "finalizado" }).eq("id", sessaoAtiva.id);
          } else {
            const todasEtapas = etapasData as Record<string, unknown>[];
            const contexto = (sessaoAtiva.contexto || {}) as Record<string, unknown>;
            const etapaAtual = todasEtapas.find((e) => String(e.id) === String(sessaoAtiva!.etapa_atual_id));

          if (sessaoAtiva.status === "espera") {
            // Se espera expirou, continuar de onde parou
            const now = new Date();
            const esperaAte = sessaoAtiva.espera_ate ? new Date(sessaoAtiva.espera_ate) : now;
            if (now >= esperaAte && etapaAtual) {
              await executarCadeia(etapaAtual, todasEtapas, sessaoAtiva.id, contexto, fluxo.id);
            } else {
              // Ainda em espera — ignorar mensagem do usuário ou informar
              console.log(`[chatbot] Sessão em espera até ${esperaAte.toISOString()}, ignorando`);
            }
          } else if (sessaoAtiva.status === "aguardando_resposta" && etapaAtual) {
            // Processar resposta do usuário
            const conteudoLower = conteudo.toLowerCase().trim();
            const etapaConfig = (etapaAtual.config || {}) as Record<string, unknown>;
            const btns = Array.isArray(etapaConfig.buttons)
              ? (etapaConfig.buttons as Array<{ label?: string; value?: string }>).filter((b) => b.label)
              : [];

            // Resolver resposta: por número (1, 2, 3) ou por valor do botão
            let respostaValor = conteudoLower;
            const numResp = parseInt(conteudoLower);
            if (!isNaN(numResp) && numResp >= 1 && numResp <= btns.length) {
              respostaValor = btns[numResp - 1].value || btns[numResp - 1].label || conteudoLower;
              respostaValor = respostaValor.toLowerCase();
            } else {
              // Tentar match por value ou label do botão
              const matchedBtn = btns.find(
                (b) => b.value?.toLowerCase() === conteudoLower || b.label?.toLowerCase() === conteudoLower
              );
              if (matchedBtn) {
                respostaValor = (matchedBtn.value || matchedBtn.label || "").toLowerCase();
              }
            }

            contexto.resposta = respostaValor;
            contexto.resposta_raw = conteudo;
            console.log(`[chatbot] Resposta processada: "${conteudo}" → value="${respostaValor}"`);

            // Incrementar respostas
            try {
              await adminClient.from("fluxos_chatbot")
                .update({ respostas: (fluxo.respostas || 0) + 1 })
                .eq("id", fluxo.id);
            } catch { /* ignore */ }

            // Se a etapa atual é uma ação (wait_for_input da ação), re-executar a mesma etapa
            const tipoEtapaAtual = String(etapaAtual.tipo || "");
            if (tipoEtapaAtual === "acao") {
              console.log(`[chatbot] Re-executando ação com resposta do usuário`);
              await executarCadeia(etapaAtual as Record<string, unknown>, todasEtapas, sessaoAtiva.id, contexto, fluxo.id);
            } else {
              // Avançar para próxima etapa (comportamento padrão para mensagens com botões)
              const nextId = etapaAtual.proximo_sim || ((etapaConfig.connections as Array<{ targetId: string }>) || [])[0]?.targetId;
              const proximaEtapa = nextId ? todasEtapas.find((e) => String(e.id) === String(nextId)) : null;

              if (proximaEtapa) {
                await executarCadeia(proximaEtapa as Record<string, unknown>, todasEtapas, sessaoAtiva.id, contexto, fluxo.id);
              } else {
                // Sem próxima etapa — finalizar
                await adminClient.from("chatbot_sessoes").update({ status: "finalizado", contexto }).eq("id", sessaoAtiva.id);
                console.log(`[chatbot] Sem próxima etapa, sessão finalizada`);
              }
            }
          }
          } // fecha else (fluxo && etapasData) + fecha if(aguardando/espera)

          // Já processou sessão ativa — retornar
          return new Response(
            JSON.stringify({ ok: true, event: "chatbot_session_continued" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } // fecha if(sessaoAtiva)
      } // fecha if(tipo==text && sessão)

      // ── Chatbot: verificar match de palavra-chave (novo fluxo) ───────
      if (tipo === "text" && conteudo && instancia) {
        const conteudoLower = conteudo.toLowerCase().trim();

        try {
        const { data: fluxos, error: fluxosErr } = await adminClient
          .from("fluxos_chatbot")
          .select("*, fluxos_chatbot_etapas(*)")
          .eq("status", "ativo")
          .eq("gatilho", "palavra_chave")
          .not("palavra_chave", "is", null);

        if (fluxosErr) {
          console.error(`[chatbot] Erro ao buscar fluxos:`, JSON.stringify(fluxosErr));
        }

        if (fluxos && fluxos.length > 0) {
          for (const fluxo of fluxos) {
            const keywords = (fluxo.palavra_chave || "")
              .toLowerCase()
              .split(",")
              .map((k: string) => k.trim());

            const matched = keywords.some(
              (kw: string) => kw && conteudoLower.includes(kw)
            );

            if (matched) {
              console.log(`[chatbot] Fluxo "${fluxo.nome}" matched keyword`);

              const todasEtapas = ((fluxo.fluxos_chatbot_etapas || []) as Record<string, unknown>[]).sort(
                (a, b) => (a.ordem as number) - (b.ordem as number)
              );

              if (todasEtapas.length > 0) {
                const primeiraEtapa = todasEtapas[0];

                // Finalizar sessões antigas deste telefone nesta instância
                await adminClient.from("chatbot_sessoes")
                  .update({ status: "finalizado" })
                  .eq("instancia_id", instancia.id)
                  .eq("telefone", telefone)
                  .in("status", ["ativo", "aguardando_resposta", "espera"]);

                // Criar nova sessão
                const { data: novaSessao, error: sessaoInsertErr } = await adminClient.from("chatbot_sessoes").insert({
                  instancia_id: instancia.id,
                  fluxo_id: fluxo.id,
                  etapa_atual_id: primeiraEtapa.id,
                  telefone,
                  status: "ativo",
                  contexto: { resposta: "", push_name: message.pushName || "", cliente_id: cliente?.id || "", cliente_encontrado: cliente?.id ? "true" : "false" },
                }).select("id").single();

                if (sessaoInsertErr) {
                  console.error(`[chatbot] Erro ao criar sessão:`, JSON.stringify(sessaoInsertErr));
                }

                if (novaSessao) {
                  console.log(`[chatbot] Sessão criada: ${novaSessao.id} para fluxo "${fluxo.nome}"`);
                  // Incrementar disparos
                  try {
                    const { error: rpcErr } = await adminClient.rpc("increment_fluxo_contador", {
                      p_fluxo_id: fluxo.id,
                      p_campo: "disparos",
                    });
                    if (rpcErr) {
                      await adminClient.from("fluxos_chatbot")
                        .update({ disparos: (fluxo.disparos || 0) + 1 })
                        .eq("id", fluxo.id);
                    }
                  } catch {
                    await adminClient.from("fluxos_chatbot")
                      .update({ disparos: (fluxo.disparos || 0) + 1 })
                      .eq("id", fluxo.id);
                  }

                  // Executar cadeia de etapas a partir da primeira
                  await executarCadeia(
                    primeiraEtapa,
                    todasEtapas,
                    novaSessao.id,
                    { resposta: "", push_name: message.pushName || "", cliente_id: cliente?.id || "", cliente_encontrado: cliente?.id ? "true" : "false" },
                    fluxo.id,
                  );
                }
              }

              // Apenas o primeiro fluxo que faz match é executado
              break;
            }
          }
        }
        } catch (flowErr) {
          console.error(`[chatbot] Exceção no motor de fluxo:`, flowErr);
        }
      }

      return new Response(
        JSON.stringify({ ok: true, event: "message_saved" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Status de mensagem (delivered, read) ──────────────
    if (event === "messages.update") {
      const updates = Array.isArray(payload.data) ? payload.data : [payload.data];

      for (const update of updates) {
        const messageId = update?.key?.id;
        const status = update?.update?.status;

        if (!messageId) continue;

        let newStatus: string | null = null;
        if (status === 3 || status === "DELIVERY_ACK") newStatus = "entregue";
        if (status === 4 || status === "READ") newStatus = "lida";
        if (status === 5 || status === "PLAYED") newStatus = "lida";

        if (newStatus) {
          await adminClient
            .from("whatsapp_mensagens_log")
            .update({ status: newStatus })
            .eq("message_id_wpp", messageId);
        }
      }

      return new Response(
        JSON.stringify({ ok: true, event: "status_updated" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Conexão / QR Code ─────────────────────────────────
    if (event === "qrcode.updated") {
      const instanceName = payload.instance || "";
      const qrcode = payload.data?.qrcode?.base64 || payload.data?.qrcode || "";

      if (instanceName && qrcode) {
        // Só atualizar QR se a instância NÃO estiver conectada
        // (Evolution pode enviar qrcode.updated tardio após conexão)
        const { data: inst } = await adminClient
          .from("whatsapp_instancias")
          .select("status")
          .eq("instance_name", instanceName)
          .single();

        if (inst && inst.status !== "conectado") {
          await adminClient
            .from("whatsapp_instancias")
            .update({ qr_code: qrcode, status: "qr_pendente" })
            .eq("instance_name", instanceName);
          console.log(`[webhook-whatsapp] qrcode.updated: QR atualizado para ${instanceName}`);
        } else {
          console.log(`[webhook-whatsapp] qrcode.updated: IGNORADO (instância ${instanceName} já conectada)`);
        }
      }

      return new Response(
        JSON.stringify({ ok: true, event: "qrcode_updated" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (event === "connection.update") {
      const instanceName = payload.instance || "";
      const state = payload.data?.state;

      console.log(`[webhook-whatsapp] connection.update: instance=${instanceName}, state=${state}`);

      if (instanceName) {
        // Buscar instância completa para ter evolution_url e instance_token
        const { data: inst } = await adminClient
          .from("whatsapp_instancias")
          .select("id, status, evolution_url, instance_token, webhook_url")
          .eq("instance_name", instanceName)
          .single();

        const currentStatus = inst?.status || "desconectado";

        let newStatus: string | null = null;
        if (state === "open") {
          newStatus = "conectado";
        } else if (state === "close") {
          newStatus = "desconectado";
        } else if (state === "connecting") {
          if (currentStatus !== "conectado") {
            newStatus = "qr_pendente";
          } else {
            console.log(`[webhook-whatsapp] connection.update: IGNORANDO state=connecting (já conectado)`);
          }
        }

        if (newStatus && newStatus !== currentStatus) {
          console.log(`[webhook-whatsapp] connection.update: ${currentStatus} → ${newStatus}`);
          await adminClient
            .from("whatsapp_instancias")
            .update({
              status: newStatus,
              qr_code: newStatus === "conectado" ? null : undefined,
            })
            .eq("instance_name", instanceName);
        }

        // ── Auto-configurar webhook assim que o telefone conectar ──
        // Garante que o webhook esteja sempre apontando para a URL correta,
        // mesmo após restart do Fly.io ou reconexão sem QR novo.
        if (state === "open" && inst) {
          const evoBaseUrl = (
            Deno.env.get("EVOLUTION_API_URL") || inst.evolution_url || ""
          ).replace(/\/$/, "");
          const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
          const webhookUrl = `${supabaseUrl}/functions/v1/webhook-whatsapp`;

          if (evoBaseUrl && inst.instance_token) {
            try {
              // Tentar formato v1 (Evolution API v1.x) — flat body, webhook_base64, uppercase events
              const v1Body = {
                enabled: true,
                url: webhookUrl,
                webhook_base64: true,
                events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
                webhook_by_events: false,
              };

              const wbResp = await fetch(`${evoBaseUrl}/webhook/set/${instanceName}`, {
                method: "POST",
                headers: { "Content-Type": "application/json", apikey: inst.instance_token },
                body: JSON.stringify(v1Body),
              });

              if (!wbResp.ok) {
                // Fallback: formato v2 (Evolution API v2.x)
                const v2Resp = await fetch(`${evoBaseUrl}/webhook/set/${instanceName}`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", apikey: inst.instance_token },
                  body: JSON.stringify({
                    webhook: {
                      enabled: true,
                      url: webhookUrl,
                      webhookBase64: true,
                      events: ["messages.upsert", "messages.update", "connection.update", "qrcode.updated"],
                      webhook_by_events: false,
                    },
                  }),
                });
                console.log(`[webhook-whatsapp] auto webhook/set ${instanceName}: v2 fallback HTTP ${v2Resp.status}`);
              } else {
                console.log(`[webhook-whatsapp] auto webhook/set ${instanceName}: v1 HTTP ${wbResp.status}`);
              }

              // Atualizar webhook_url e evolution_url no banco com os valores atuais
              await adminClient
                .from("whatsapp_instancias")
                .update({
                  webhook_url: webhookUrl,
                  evolution_url: evoBaseUrl,
                })
                .eq("instance_name", instanceName);
            } catch (wbErr) {
              console.error(`[webhook-whatsapp] auto webhook/set ${instanceName} falhou:`, wbErr);
            }
          }
        }
      }

      return new Response(
        JSON.stringify({ ok: true, event: "connection_updated" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Evento não processado (mas OK)
    console.log(`[webhook-whatsapp] Evento não tratado: ${event}`);
    return new Response(
      JSON.stringify({ ok: true, event: "unhandled", type: event }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[webhook-whatsapp] Erro:", err);
    return new Response(
      JSON.stringify({ error: "Erro interno", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
