/**
 * Edge Function: update-user-role
 *
 * Permite que um admin altere o role de um usuário existente.
 *
 * ⚠️  IMPORTANTE: Deploy SEMPRE com --no-verify-jwt!
 *     Supabase Auth usa ES256, gateway valida HS256 → 401 "Invalid JWT".
 *     Auth é feita internamente via adminClient.auth.getUser(jwt).
 *
 * Deploy: supabase functions deploy update-user-role --no-verify-jwt
 *
 * Body: { userId: string, role: string }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Token ausente" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verificar chamador
    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user: caller } } = await adminClient.auth.getUser(jwt);
    if (!caller) {
      return new Response(
        JSON.stringify({ error: "Não autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: profile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", caller.id)
      .single();

    if (!profile || profile.role !== "admin") {
      return new Response(
        JSON.stringify({ error: "Apenas administradores" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { userId, role } = await req.json();

    if (!userId || !role) {
      return new Response(
        JSON.stringify({ error: "Campos obrigatórios: userId, role" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Impedir que admin remova o próprio role de admin
    if (userId === caller.id && role !== "admin") {
      return new Response(
        JSON.stringify({ error: "Você não pode remover seu próprio papel de administrador" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validRoles = ["admin", "gerencia", "cobranca", "comercial"];
    if (!validRoles.includes(role)) {
      return new Response(
        JSON.stringify({ error: `Role inválido. Use: ${validRoles.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Atualizar role na tabela profiles
    const { error: updateError } = await adminClient
      .from("profiles")
      .update({ role, updated_at: new Date().toISOString() })
      .eq("id", userId);

    if (updateError) {
      return new Response(
        JSON.stringify({ error: updateError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Também atualizar user_metadata no auth
    await adminClient.auth.admin.updateUserById(userId, {
      user_metadata: { role },
    });

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch {
    return new Response(
      JSON.stringify({ error: "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
