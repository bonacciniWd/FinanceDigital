/**
 * Edge Function: generate-image-gemini
 *
 * Gera imagem via Google Gemini (gemini-2.5-flash-image-preview, aka "Nano
 * Banana"), faz upload server-side ao Cloudinary e registra em `midia_assets`.
 *
 * Pode ser chamada de duas formas:
 *
 *  1. POST manual (admin/gerencia, com Authorization Bearer JWT):
 *       { prompt, titulo, tipo?, caption?, save?: true }
 *     → cria asset novo na biblioteca.
 *
 *  2. Internamente pelo cron-post-status (com SERVICE_ROLE):
 *       { prompt, scheduleId, replaceAssetId?, save: true }
 *     → cria asset vinculado ao schedule (parent_schedule_id) ou substitui um existente.
 *
 * Env:
 *   - GEMINI_API_KEY
 *   - CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
 *
 * Deploy: supabase functions deploy generate-image-gemini
 *
 * Docs Gemini image gen:
 *   https://ai.google.dev/gemini-api/docs/image-generation
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// Permite override por secret GEMINI_MODEL caso o Google renomeie novamente.
// Default: gemini-2.5-flash-image (versão estável da geração nativa de imagens).
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash-image";

interface GenInput {
  prompt: string;
  titulo?: string;
  tipo?: "promocional" | "status_template" | "lembrete_cobranca";
  caption?: string;
  save?: boolean;
  scheduleId?: string;
  replaceAssetId?: string;
}

async function callGemini(prompt: string, apiKey: string): Promise<{ b64: string; mime: string }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini ${res.status}: ${err.slice(0, 500)}`);
  }
  const json = await res.json();
  const parts = json?.candidates?.[0]?.content?.parts ?? [];
  for (const p of parts) {
    if (p?.inlineData?.data) {
      return { b64: p.inlineData.data, mime: p.inlineData.mimeType ?? "image/png" };
    }
  }
  throw new Error("Resposta Gemini sem inlineData");
}

function b64ToUint8Array(b64: string): Uint8Array {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

async function sha1Hex(message: string): Promise<string> {
  const data = new TextEncoder().encode(message);
  const hash = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function uploadToCloudinary(
  bytes: Uint8Array,
  mime: string,
  publicIdHint: string
): Promise<{
  public_id: string;
  secure_url: string;
  width: number;
  height: number;
  bytes: number;
  format: string;
}> {
  const cloudName = Deno.env.get("CLOUDINARY_CLOUD_NAME")!;
  const apiKey = Deno.env.get("CLOUDINARY_API_KEY")!;
  const apiSecret = Deno.env.get("CLOUDINARY_API_SECRET")!;
  const timestamp = Math.round(Date.now() / 1000);
  const folder = "marketing-assets/gemini";
  const publicId = publicIdHint;

  // Cloudinary signature (sorted params, key=value joined)
  const toSign = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}`;
  const signature = await sha1Hex(toSign + apiSecret);

  const form = new FormData();
  // Convert to base64 data URI (mais simples que streams para imagens pequenas)
  const b64 = btoa(String.fromCharCode(...bytes));
  form.append("file", `data:${mime};base64,${b64}`);
  form.append("api_key", apiKey);
  form.append("timestamp", String(timestamp));
  form.append("signature", signature);
  form.append("folder", folder);
  form.append("public_id", publicId);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: form,
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Cloudinary upload: ${json?.error?.message ?? res.status}`);
  }
  return json;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");
    const CLOUD = Deno.env.get("CLOUDINARY_CLOUD_NAME");

    if (!GEMINI_KEY) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY não configurada" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!CLOUD) {
      return new Response(JSON.stringify({ error: "Cloudinary não configurado" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auth: aceita service-role (cron interno) OU usuário admin/gerencia
    const authHeader = req.headers.get("Authorization") ?? "";
    const isServiceRole = authHeader.includes(SERVICE_ROLE);
    let userId: string | null = null;
    if (!isServiceRole) {
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Não autenticado" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const supabase = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return new Response(JSON.stringify({ error: "Sessão inválida" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: profile } = await supabase
        .from("profiles").select("role").eq("id", user.id).single();
      if (!profile || !["admin", "gerencia"].includes(profile.role)) {
        return new Response(JSON.stringify({ error: "Permissão negada" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = user.id;
    }

    const input = (await req.json()) as GenInput;
    if (!input.prompt || input.prompt.trim().length < 4) {
      return new Response(JSON.stringify({ error: "Prompt obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Gera imagem via Gemini
    const { b64, mime } = await callGemini(input.prompt.trim(), GEMINI_KEY);
    const bytes = b64ToUint8Array(b64);

    // 2. Upload no Cloudinary
    const publicIdHint = `gemini-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const upload = await uploadToCloudinary(bytes, mime, publicIdHint);

    if (!input.save) {
      // Modo "preview" — retorna URL sem salvar (raro)
      return new Response(JSON.stringify({ secure_url: upload.secure_url, public_id: upload.public_id }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Registra em midia_assets (via service-role, sempre — RLS já validada acima)
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE);

    if (input.replaceAssetId) {
      // Atualiza asset existente (usado pelo cron quando regenerar_a_cada_post)
      const { data, error } = await adminClient
        .from("midia_assets")
        .update({
          public_id: upload.public_id,
          secure_url: upload.secure_url,
          thumb_url: upload.secure_url,
          width: upload.width,
          height: upload.height,
          bytes: upload.bytes,
          status_ia: "pronto",
          prompt_ia: input.prompt,
          gerado_por: "gemini",
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.replaceAssetId)
        .select("*")
        .single();
      if (error) throw error;
      return new Response(JSON.stringify({ asset: data }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data, error } = await adminClient
      .from("midia_assets")
      .insert({
        tipo: input.tipo ?? "promocional",
        formato: "image",
        public_id: upload.public_id,
        secure_url: upload.secure_url,
        thumb_url: upload.secure_url,
        width: upload.width,
        height: upload.height,
        bytes: upload.bytes,
        titulo: input.titulo ?? `Gemini ${new Date().toLocaleString("pt-BR")}`,
        caption: input.caption ?? null,
        prompt_ia: input.prompt,
        status_ia: "pronto",
        gerado_por: "gemini",
        parent_schedule_id: input.scheduleId ?? null,
        created_by: userId,
      })
      .select("*")
      .single();
    if (error) throw error;

    return new Response(JSON.stringify({ asset: data }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[generate-image-gemini] erro:", err);
    return new Response(
      JSON.stringify({ error: String((err as Error)?.message ?? err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
