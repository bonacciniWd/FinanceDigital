/**
 * Edge Function: cloudinary-sign-upload
 *
 * Gera assinatura HMAC-SHA1 para upload direto do navegador ao Cloudinary,
 * sem expor `CLOUDINARY_API_SECRET` no front. O cliente envia os parâmetros
 * desejados (`timestamp`, `folder`, `public_id`, `tags`, ...) e recebe a
 * `signature` correspondente.
 *
 * Fluxo:
 *   1. Front pede signature → Edge Function (autenticado).
 *   2. Front faz POST multipart/form-data direto para
 *      https://api.cloudinary.com/v1_1/{cloud_name}/{auto|video|image}/upload
 *      incluindo signature, api_key, timestamp e o file.
 *   3. Após sucesso, front grava metadata em `midia_assets` (RLS exige role).
 *
 * Env:
 *   - CLOUDINARY_CLOUD_NAME
 *   - CLOUDINARY_API_KEY
 *   - CLOUDINARY_API_SECRET
 *
 * Deploy: supabase functions deploy cloudinary-sign-upload
 *
 * Docs: https://cloudinary.com/documentation/upload_images#generating_authentication_signatures
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const ALLOWED_PARAMS = new Set([
  "folder",
  "public_id",
  "tags",
  "context",
  "eager",
  "transformation",
  "upload_preset",
  "resource_type",
  "type",
  "overwrite",
  "invalidate",
]);

async function hmacSha1Hex(message: string, key: string): Promise<string> {
  // Cloudinary usa SHA-1 sobre `params_to_sign + api_secret` (NÃO HMAC).
  const data = new TextEncoder().encode(message + key);
  const hash = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const CLOUD_NAME = Deno.env.get("CLOUDINARY_CLOUD_NAME");
    const API_KEY = Deno.env.get("CLOUDINARY_API_KEY");
    const API_SECRET = Deno.env.get("CLOUDINARY_API_SECRET");

    if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
      return new Response(
        JSON.stringify({ error: "Cloudinary env vars não configuradas" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Autenticação — exige usuário logado com role admin/gerencia
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (!profile || !["admin", "gerencia"].includes(profile.role)) {
      return new Response(JSON.stringify({ error: "Permissão negada" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const params: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(body)) {
      if (ALLOWED_PARAMS.has(k) && v !== null && v !== undefined && v !== "") {
        params[k] = v as string | number;
      }
    }
    const timestamp = Math.round(Date.now() / 1000);
    params.timestamp = timestamp;
    // Default folder
    if (!params.folder) params.folder = "marketing-assets";

    // Cloudinary signature: ordena alfabeticamente, junta como key=value&key=value
    const toSign = Object.keys(params)
      .filter((k) => k !== "file" && k !== "api_key" && k !== "signature" && k !== "resource_type")
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join("&");
    const signature = await hmacSha1Hex(toSign, API_SECRET);

    return new Response(
      JSON.stringify({
        cloud_name: CLOUD_NAME,
        api_key: API_KEY,
        timestamp,
        signature,
        params,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err?.message ?? err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
