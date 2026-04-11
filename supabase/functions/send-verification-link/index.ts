/**
 * Edge Function: send-verification-link
 *
 * Envia link de verificação de identidade via WhatsApp (Evolution API).
 * Cria registro em identity_verifications e envia mensagem com o link
 * para o cliente fazer a verificação (vídeo-selfie + documentos).
 *
 * Body esperado:
 * {
 *   analise_id: string,           // UUID da análise de crédito
 *   instancia_id?: string,        // UUID da instância WhatsApp (opcional, usa primeira conectada)
 * }
 *
 * Deploy: supabase functions deploy send-verification-link --no-verify-jwt
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
    const siteUrl = Deno.env.get("SITE_URL") ?? "https://fintechdigital.vercel.app";

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── Autenticar chamador ─────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Não autorizado" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authErr } = await adminClient.auth.getUser(jwt);
    if (authErr || !caller) {
      return new Response(
        JSON.stringify({ success: false, error: "Token inválido" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verificar role do chamador (admin ou gerencia)
    const { data: profile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", caller.id)
      .single();

    if (!profile || !["admin", "gerencia"].includes(profile.role)) {
      return new Response(
        JSON.stringify({ success: false, error: "Permissão insuficiente" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Body ──────────────────────────────────────────────
    const { analise_id, instancia_id } = await req.json();

    if (!analise_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Campo obrigatório: analise_id" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Buscar análise + dados do cliente ─────────────────
    const { data: analise, error: analiseErr } = await adminClient
      .from("analises_credito")
      .select("id, status, cliente_nome, cliente_id, cpf")
      .eq("id", analise_id)
      .single();

    if (analiseErr || !analise) {
      return new Response(
        JSON.stringify({ success: false, error: "Análise não encontrada" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!["pendente", "em_analise"].includes(analise.status)) {
      return new Response(
        JSON.stringify({ success: false, error: "Análise não está em status válido para verificação" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar telefone do cliente (via cliente_id ou fallback por CPF)
    let telefone: string | null = null;
    if (analise.cliente_id) {
      const { data: cliente } = await adminClient
        .from("clientes")
        .select("telefone")
        .eq("id", analise.cliente_id)
        .single();
      telefone = cliente?.telefone ?? null;
    }

    // Fallback: buscar por CPF se cliente_id estiver vazio
    if (!telefone && analise.cpf) {
      const { data: clienteByCpf } = await adminClient
        .from("clientes")
        .select("id, telefone")
        .eq("cpf", analise.cpf)
        .limit(1)
        .single();
      if (clienteByCpf?.telefone) {
        telefone = clienteByCpf.telefone;
        // Vincular o cliente_id para futuras consultas
        await adminClient
          .from("analises_credito")
          .update({ cliente_id: clienteByCpf.id })
          .eq("id", analise_id);
      }
    }

    if (!telefone) {
      return new Response(
        JSON.stringify({ success: false, error: "Cliente sem telefone cadastrado. Atualize o cadastro do cliente primeiro." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Buscar instância WhatsApp ─────────────────────────
    let instancia;
    if (instancia_id) {
      const { data, error } = await adminClient
        .from("whatsapp_instancias")
        .select("*")
        .eq("id", instancia_id)
        .single();
      if (error || !data) {
        return new Response(
          JSON.stringify({ success: false, error: "Instância WhatsApp não encontrada" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      instancia = data;
    } else {
      // Buscar todas instâncias e encontrar a primeira conectada
      const { data: allInstancias, error: instErr } = await adminClient
        .from("whatsapp_instancias")
        .select("*");

      if (instErr || !allInstancias || allInstancias.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: "Nenhuma instância WhatsApp cadastrada" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const conectada = allInstancias.find(
        (i: any) => i.status === "conectado" || i.status === "conectada"
      );

      if (!conectada) {
        const statuses = allInstancias.map((i: any) => `${i.instance_name}: ${i.status}`).join(", ");
        return new Response(
          JSON.stringify({
            success: false,
            error: `Nenhuma instância conectada. Status atual: [${statuses}]`,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      instancia = conectada;
    }

    const envUrl = Deno.env.get("EVOLUTION_API_URL");
    const baseUrl = (envUrl || instancia.evolution_url || "").replace(/\/$/, "");
    if (!baseUrl || !instancia.instance_token) {
      return new Response(
        JSON.stringify({ success: false, error: "Instância sem URL ou token da Evolution API" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Verificar retry count ────────────────────────────
    const { data: existing } = await adminClient
      .from("identity_verifications")
      .select("id, retry_count")
      .eq("analise_id", analise_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (existing && existing.retry_count >= 3) {
      return new Response(
        JSON.stringify({ success: false, error: "Limite de tentativas atingido (3/3)" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Gerar frase de verificação ───────────────────────
    const phrases = [
      `Eu, titular do CPF informado, confirmo minha identidade para análise de crédito.`,
      `Autorizo a verificação dos meus dados para liberação de crédito.`,
      `Declaro ser o titular desta solicitação de crédito junto à Fintech.`,
      `Confirmo que estou solicitando crédito de forma voluntária e consciente.`,
      `Eu autorizo a consulta dos meus dados cadastrais para fins de análise financeira.`,
      `Declaro que todas as informações fornecidas nesta solicitação são verdadeiras.`,
      `Confirmo ser o titular do CPF e dos documentos apresentados nesta verificação.`,
      `Autorizo a Fintech a realizar a análise do meu perfil de crédito.`,
      `Eu, por livre vontade, solicito a liberação de crédito e confirmo minha identidade.`,
      `Declaro que estou ciente dos termos desta solicitação de crédito.`,
      `Confirmo que sou o responsável por esta solicitação e autorizo o processamento.`,
      `Eu atesto que esta verificação está sendo feita por mim, titular dos documentos.`,
      `Autorizo o uso dos meus dados pessoais para análise e concessão de crédito.`,
      `Declaro ser o legítimo solicitante deste crédito junto à plataforma Fintech.`,
      `Confirmo minha identidade e autorizo a verificação para liberação do crédito solicitado.`,
      `Eu reconheço e aceito os termos da análise de crédito da Fintech.`,
      `Declaro que esta solicitação é feita por mim e assumo total responsabilidade.`,
      `Autorizo a consulta e verificação dos meus dados para aprovação de crédito.`,
      `Confirmo que estou realizando esta verificação de identidade pessoalmente.`,
      `Eu, titular desta conta, autorizo a análise financeira e verificação de identidade.`,
      `Declaro que os dados e documentos enviados pertencem exclusivamente a mim.`,
      `Confirmo a veracidade de todas as informações prestadas nesta solicitação de crédito.`,
      `Autorizo expressamente a Fintech a validar minha identidade e dados financeiros.`,
      `Eu declaro estar ciente de que esta verificação é obrigatória para liberação do crédito.`,
    ];
    const verificationPhrase = phrases[Math.floor(Math.random() * phrases.length)];
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

    // ── Criar ou atualizar verificação ───────────────────
    let verificationId: string;

    if (existing) {
      const { data: updated, error: updateErr } = await adminClient
        .from("identity_verifications")
        .update({
          verification_phrase: verificationPhrase,
          magic_link_sent_at: new Date().toISOString(),
          magic_link_expires_at: expiresAt,
          status: "pending",
          requires_retry: false,
          video_url: null,
          document_front_url: null,
          document_back_url: null,
          rejection_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select("id")
        .single();

      if (updateErr) throw updateErr;
      verificationId = updated!.id;
    } else {
      const { data: created, error: createErr } = await adminClient
        .from("identity_verifications")
        .insert({
          analise_id,
          verification_phrase: verificationPhrase,
          magic_link_sent_at: new Date().toISOString(),
          magic_link_expires_at: expiresAt,
        })
        .select("id")
        .single();

      if (createErr) throw createErr;
      verificationId = created!.id;

      await adminClient
        .from("analises_credito")
        .update({ verification_required: true, verification_id: verificationId, status: "em_analise" })
        .eq("id", analise_id);
    }

    // ── Montar link e mensagem ───────────────────────────
    const verifyUrl = `${siteUrl}/verify-identity?analise_id=${analise_id}`;

    const mensagem = `🔐 *Verificação de Identidade — Fintech*\n\nOlá, *${analise.cliente_nome}*!\n\nPara dar continuidade à sua análise de crédito, precisamos que você confirme sua identidade.\n\n📋 *O que você vai precisar:*\n• Gravar um vídeo-selfie lendo uma frase de verificação\n• Enviar foto do seu documento (frente e verso)\n\n⏰ *Prazo:* Este link expira em 48 horas.\n\n👉 Clique no link abaixo para iniciar:\n${verifyUrl}\n\n_Se você não solicitou esta verificação, ignore esta mensagem._`;

    // ── Enviar via Evolution API ─────────────────────────
    // Normalizar número: apenas dígitos + garantir DDI 55
    let formattedNumber = telefone.replace(/\D/g, "");
    if (formattedNumber.length >= 10 && formattedNumber.length <= 11 && !formattedNumber.startsWith("55")) {
      formattedNumber = "55" + formattedNumber;
    }

    const evolutionEndpoint = `${baseUrl}/message/sendText/${instancia.instance_name}`;

    // Compatível com v1 e v2 da Evolution API (mesmo formato do send-whatsapp)
    const evolutionBody = {
      number: formattedNumber,
      textMessage: { text: mensagem },
      text: mensagem,
    };

    console.log("[verification] Enviando para:", formattedNumber, "via", instancia.instance_name, "endpoint:", evolutionEndpoint);

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
        : `Erro de conexão com Evolution API: ${String(fetchErr)}`;

      // Log falha
      await adminClient.from("whatsapp_mensagens_log").insert({
        instancia_id: instancia.id,
        telefone: formattedNumber,
        conteudo: mensagem,
        tipo: "text",
        direcao: "enviada",
        status: "failed",
        metadata: { context: "verification_link", analise_id, verification_id: verificationId, error: errMsg },
      });

      await adminClient.from("verification_logs").insert({
        verification_id: verificationId,
        analise_id,
        action: "magic_link_sent",
        performed_by: caller.id,
        details: { telefone: formattedNumber, whatsapp_sent: false, error: errMsg },
      });

      return new Response(
        JSON.stringify({ success: false, verification_id: verificationId, error: errMsg, verify_url: `${siteUrl}/verify-identity?analise_id=${analise_id}` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    clearTimeout(timeoutId);

    const evoData = await evoRes.text();
    let evoSuccess = evoRes.ok;

    // Verificar se retornou HTML (ngrok/proxy mudou)
    if (evoData.trim().startsWith("<!") || evoData.trim().startsWith("<html")) {
      evoSuccess = false;
    }

    console.log("[verification] Evolution response:", evoRes.status, evoData.slice(0, 300));

    if (!evoSuccess) {
      console.error("[verification] Evolution API error:", evoRes.status, evoData);
    }

    // ── Log no whatsapp_mensagens_log ────────────────────
    await adminClient.from("whatsapp_mensagens_log").insert({
      instancia_id: instancia.id,
      telefone: formattedNumber,
      conteudo: mensagem,
      tipo: "text",
      direcao: "enviada",
      status: evoSuccess ? "sent" : "failed",
      metadata: {
        context: "verification_link",
        analise_id,
        verification_id: verificationId,
        evolution_status: evoRes.status,
        evolution_response: evoData.slice(0, 500),
      },
    });

    // ── Log de auditoria ────────────────────────────────
    await adminClient.from("verification_logs").insert({
      verification_id: verificationId,
      analise_id,
      action: "magic_link_sent",
      performed_by: caller.id,
      details: {
        telefone: formattedNumber,
        phrase: verificationPhrase,
        expires_at: expiresAt,
        verify_url: verifyUrl,
        whatsapp_sent: evoSuccess,
        instancia_id: instancia.id,
      },
    });

    if (!evoSuccess) {
      return new Response(
        JSON.stringify({
          success: false,
          verification_id: verificationId,
          error: `Verificação criada, mas falha ao enviar WhatsApp (${evoRes.status}). Resposta: ${evoData.slice(0, 200)}`,
          verify_url: verifyUrl,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        verification_id: verificationId,
        verify_url: verifyUrl,
        message: `Link de verificação enviado via WhatsApp para ${formattedNumber}`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-verification-link error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Erro interno" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
