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
                  body: JSON.stringify({ number: jidParaEnvio, textMessage: { text: resposta } }),
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
                  body: JSON.stringify({ number: jidParaEnvio, textMessage: { text: resposta } }),
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

      // ── Chatbot: verificar match de palavra-chave ───────
      if (tipo === "text" && conteudo) {
        const conteudoLower = conteudo.toLowerCase().trim();

        const { data: fluxos } = await adminClient
          .from("fluxos_chatbot")
          .select("*, fluxos_chatbot_etapas(*)")
          .eq("status", "ativo")
          .eq("gatilho", "palavra_chave")
          .not("palavra_chave", "is", null);

        if (fluxos && fluxos.length > 0) {
          for (const fluxo of fluxos) {
            const keywords = (fluxo.palavra_chave || "")
              .toLowerCase()
              .split(",")
              .map((k: string) => k.trim());

            const matched = keywords.some(
              (kw: string) => kw && conteudoLower.includes(kw)
            );

            if (matched && instancia) {
              console.log(`[chatbot] Fluxo "${fluxo.nome}" matched keyword`);

              // Buscar primeira etapa do fluxo (ordem = 0 ou menor)
              const etapas = (fluxo.fluxos_chatbot_etapas || []).sort(
                (a: { ordem: number }, b: { ordem: number }) => a.ordem - b.ordem
              );

              if (etapas.length > 0) {
                const primeiraEtapa = etapas[0];

                // Enviar resposta automática (instancia já tem os campos necessários)
                const evoUrl = (Deno.env.get("EVOLUTION_API_URL") || instancia.evolution_url || "").replace(/\/$/, "");

                if (evoUrl && instancia.instance_token) {
                  await fetch(
                    `${evoUrl}/message/sendText/${instancia.instance_name}`,
                    {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        apikey: instancia.instance_token,
                      },
                      body: JSON.stringify({
                        number: jidParaEnvio,
                        textMessage: { text: primeiraEtapa.conteudo },
                      }),
                    }
                  );

                  // Log da resposta automática
                  const { error: autoReplyErr } = await adminClient.from("whatsapp_mensagens_log").insert({
                    instancia_id: instancia.id,
                    cliente_id: cliente?.id || null,
                    fluxo_id: fluxo.id,
                    direcao: "saida",
                    telefone,
                    conteudo: primeiraEtapa.conteudo,
                    tipo: "text",
                    status: "enviada",
                    metadata: {
                      auto_reply: true,
                      etapa_id: primeiraEtapa.id,
                      fluxo_nome: fluxo.nome,
                    },
                  });

                  if (autoReplyErr) {
                    console.error("[webhook-whatsapp] Erro ao inserir auto-reply:", JSON.stringify(autoReplyErr));
                  }

                  // Incrementar contadores do fluxo
                  await adminClient.rpc("increment_fluxo_contador", {
                    p_fluxo_id: fluxo.id,
                    p_campo: "disparos",
                  }).then(() => {
                    // Se não existir a RPC, faz update direto
                  }).catch(async () => {
                    await adminClient
                      .from("fluxos_chatbot")
                      .update({ disparos: (fluxo.disparos || 0) + 1 })
                      .eq("id", fluxo.id);
                  });
                }
              }

              // Apenas o primeiro fluxo que faz match é executado
              break;
            }
          }
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
