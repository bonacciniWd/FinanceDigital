/**
 * Edge Function: send-registration-link
 *
 * Gera um link público tokenizado para o cliente preencher/atualizar o próprio
 * cadastro. Pode opcionalmente enviar via WhatsApp (Evolution API) ou apenas
 * retornar o link para o atendente copiar e enviar manualmente.
 *
 * Body:
 * {
 *   cliente_id?: string,        // se omitido => link para CADASTRO NOVO
 *   instancia_id?: string,
 *   send_whatsapp?: boolean,    // default false (apenas gera o link)
 *   telefone_destino?: string,  // override (caso link genérico c/ telefone manual)
 *   nome_destino?: string,      // saudação personalizada (link genérico)
 * }
 *
 * Deploy: supabase functions deploy send-registration-link --no-verify-jwt
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const TOKEN_TTL_DAYS = 7;

function makeToken(): string {
  // 32 chars url-safe
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const siteUrl = (Deno.env.get("SITE_URL") ?? "https://verificador-digital.vercel.app").replace(/\/$/, "");

    const admin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── Auth caller ─────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ success: false, error: "Não autorizado" });
    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authErr } = await admin.auth.getUser(jwt);
    if (authErr || !caller) return json({ success: false, error: "Token inválido" });

    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", caller.id)
      .single();
    if (!profile || !["admin", "gerencia", "atendente"].includes(profile.role)) {
      return json({ success: false, error: "Permissão insuficiente" });
    }

    const body = await req.json().catch(() => ({}));
    const {
      cliente_id,
      instancia_id,
      send_whatsapp = false,
      telefone_destino,
      nome_destino,
    } = body as {
      cliente_id?: string;
      instancia_id?: string;
      send_whatsapp?: boolean;
      telefone_destino?: string;
      nome_destino?: string;
    };

    // ── Resolver cliente / telefone / nome ───────────────────
    let cliente: { id: string; nome: string; telefone: string | null } | null = null;
    if (cliente_id) {
      const { data, error } = await admin
        .from("clientes")
        .select("id, nome, telefone")
        .eq("id", cliente_id)
        .single();
      if (error || !data) return json({ success: false, error: "Cliente não encontrado" });
      cliente = data;
    }

    const telefone = (cliente?.telefone ?? telefone_destino ?? "").replace(/\D/g, "");
    const nomeExibicao = cliente?.nome ?? nome_destino ?? "Cliente";

    // ── Criar token ───────────────────────────────────────────
    const token = makeToken();
    const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 86400 * 1000).toISOString();

    const { data: linkRow, error: linkErr } = await admin
      .from("cadastro_links")
      .insert({
        token,
        cliente_id: cliente?.id ?? null,
        criado_por: caller.id,
        expires_at: expiresAt,
      })
      .select("id, token, expires_at")
      .single();
    if (linkErr || !linkRow) return json({ success: false, error: `Erro ao criar link: ${linkErr?.message}` });

    const url = `${siteUrl}/cadastro/${token}`;
    const isUpdate = !!cliente?.id;

    // ── Sem envio: retorna link para copiar ──────────────────
    if (!send_whatsapp) {
      return json({ success: true, link: url, token, expires_at: expiresAt, sent: false, is_update: isUpdate });
    }

    // ── Envio via WhatsApp ──────────────────────────────────
    if (!telefone) {
      return json({
        success: true,
        link: url,
        token,
        expires_at: expiresAt,
        sent: false,
        is_update: isUpdate,
        warning: "Telefone não informado — link gerado, mas não enviado.",
      });
    }

    // Buscar instância
    let instancia: any = null;
    if (instancia_id) {
      const { data } = await admin.from("whatsapp_instancias").select("*").eq("id", instancia_id).single();
      instancia = data;
    } else {
      const { data: all } = await admin.from("whatsapp_instancias").select("*");
      const CONNECTED = ["conectado", "conectada", "open", "connected"];
      instancia = (all ?? []).find((i: any) => i.is_system && CONNECTED.includes((i.status ?? "").toLowerCase()))
        ?? (all ?? []).find((i: any) => CONNECTED.includes((i.status ?? "").toLowerCase()));
    }

    if (!instancia) {
      return json({
        success: true,
        link: url,
        token,
        expires_at: expiresAt,
        sent: false,
        is_update: isUpdate,
        warning: "Nenhuma instância WhatsApp conectada — link gerado, envie manualmente.",
      });
    }

    const baseUrl = (Deno.env.get("EVOLUTION_API_URL") || instancia.evolution_url || "").replace(/\/$/, "");
    if (!baseUrl || !instancia.instance_token) {
      return json({
        success: true,
        link: url,
        token,
        sent: false,
        is_update: isUpdate,
        warning: "Instância sem URL/token — link gerado, envie manualmente.",
      });
    }

    let formatted = telefone;
    if (formatted.length >= 10 && formatted.length <= 11 && !formatted.startsWith("55")) {
      formatted = "55" + formatted;
    }

    const mensagem = isUpdate
      ? `📋 *Atualização de Cadastro*\n\nOlá, *${nomeExibicao}*!\n\nPrecisamos atualizar seus dados cadastrais. É rápido e simples — leva menos de 3 minutos.\n\n📝 *Você vai conferir/atualizar:*\n• Dados pessoais (nome, CPF, telefone)\n• Endereço completo\n• Profissão e renda\n• Documentos (RG/CNH e comprovante de endereço)\n• Contatos de referência\n• Chave Pix\n\n⏰ *Link válido por 7 dias.*\n\n👉 Clique para começar:\n${url}\n\n_Se você não solicitou isso, ignore esta mensagem._`
      : `📋 *Cadastro de Cliente*\n\nOlá, *${nomeExibicao}*!\n\nPara prosseguirmos com sua solicitação, preencha o cadastro online. É simples e leva menos de 3 minutos.\n\n📝 *Você vai informar:*\n• Dados pessoais e endereço\n• Profissão e renda\n• Documentos (RG/CNH frente e verso + comprovante de endereço)\n• Contatos de referência\n• Chave Pix\n\n⏰ *Link válido por 7 dias.*\n\n👉 Clique para começar:\n${url}\n\n_Em caso de dúvida, responda esta mensagem._`;

    const endpoint = `${baseUrl}/message/sendText/${encodeURIComponent(instancia.instance_name)}`;
    const evoBody = { number: formatted, textMessage: { text: mensagem }, text: mensagem };
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20_000);

    let evoOk = false;
    let evoErr: string | null = null;
    try {
      const evoRes = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: instancia.instance_token },
        body: JSON.stringify(evoBody),
        signal: controller.signal,
      });
      const evoText = await evoRes.text();
      evoOk = evoRes.ok && !evoText.trim().startsWith("<");
      if (!evoOk) evoErr = `Evolution ${evoRes.status}: ${evoText.slice(0, 200)}`;
    } catch (e) {
      evoErr = (e as Error).name === "AbortError" ? "Timeout (>20s)" : String(e);
    } finally {
      clearTimeout(timeoutId);
    }

    if (evoOk) {
      await admin.from("cadastro_links").update({ whatsapp_enviado: true }).eq("id", linkRow.id);
    }

    await admin.from("whatsapp_mensagens_log").insert({
      instancia_id: instancia.id,
      telefone: formatted,
      conteudo: mensagem,
      tipo: "text",
      direcao: "enviada",
      status: evoOk ? "sent" : "failed",
      metadata: { context: "cadastro_link", token, cliente_id: cliente?.id ?? null, error: evoErr },
    });

    return json({
      success: true,
      link: url,
      token,
      expires_at: expiresAt,
      sent: evoOk,
      is_update: isUpdate,
      warning: evoOk ? null : `Link gerado, mas falha ao enviar WhatsApp: ${evoErr}`,
    });
  } catch (err) {
    console.error("[send-registration-link] error:", err);
    return json({ success: false, error: String(err) });
  }
});
