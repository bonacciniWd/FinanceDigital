/**
 * Edge Function: efi-extratos
 *
 * Proxy autenticado para a API Extratos da EFI Bank (CNAB 240).
 * A lógica reusável fica em ../_shared/efi-extratos-client.ts.
 *
 * Auth: admin/gerência apenas.
 *
 * Body: { action, ...params }
 *   - list_files       (data_inicio?, data_fim?)
 *   - download_file    (nome_arquivo)        → retorna base64
 *   - list_schedules
 *   - create_schedule  (...corpo agendamento)
 *   - update_schedule  (identificador, ...campos)
 *
 * Deploy: supabase functions deploy efi-extratos
 */
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { callEfiExtratos } from "../_shared/efi-extratos-client.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ success: false, error: message }, status);
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return errorResponse("Método inválido", 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const adminClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("Não autenticado", 401);
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return errorResponse("Sessão inválida", 401);
    const { data: profile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();
    if (!profile || !["admin", "gerencia"].includes(profile.role)) {
      return errorResponse("Permissão negada — admin/gerência", 403);
    }

    const body = await req.json();
    const { action, ...params } = body ?? {};
    if (!action) return errorResponse("Campo 'action' é obrigatório");

    const result = await callEfiExtratos(adminClient, action, params);

    if (result.bytes) {
      const b64 = bytesToBase64(result.bytes);
      return jsonResponse({
        success: true,
        content_base64: b64,
        content_type: result.contentType || "application/octet-stream",
        size: result.bytes.byteLength,
      });
    }
    return jsonResponse({ success: true, data: result.data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[efi-extratos] erro:", msg);
    return errorResponse(msg, 500);
  }
});
