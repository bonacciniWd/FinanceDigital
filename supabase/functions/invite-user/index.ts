/**
 * Edge Function: invite-user
 *
 * Permite que um admin crie novos usuários no Supabase Auth.
 * Usa a service_role key (server-side) — nunca exposta ao cliente.
 *
 * ⚠️  IMPORTANTE: Deploy SEMPRE com --no-verify-jwt!
 *     Supabase Auth usa ES256, gateway valida HS256 → 401 "Invalid JWT".
 *     Auth é feita internamente via adminClient.auth.getUser(jwt).
 *
 * Deploy: supabase functions deploy invite-user --no-verify-jwt
 *
 * Fluxo:
 * 1. Admin logado chama esta function via supabase.functions.invoke()
 * 2. Function valida que o chamador é admin (via JWT)
 * 3. Cria o usuário via supabase.auth.admin.createUser()
 * 4. O trigger handle_new_user() cria o profile automaticamente
 *
 * Body esperado:
 * { email: string, password: string, name: string, role: string }
 *
 * Deploy:
 *   supabase functions deploy invite-user
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Verificar JWT do chamador
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Token de autenticação ausente" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: callerError } = await adminClient.auth.getUser(jwt);
    if (callerError || !caller) {
      return new Response(
        JSON.stringify({ error: "Usuário não autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Verificar se é admin
    const { data: profile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", caller.id)
      .single();

    if (!profile || profile.role !== "admin") {
      return new Response(
        JSON.stringify({ error: "Apenas administradores podem criar usuários" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Validar body
    const { email, password, name, role } = await req.json();

    if (!email || !password || !name || !role) {
      return new Response(
        JSON.stringify({ error: "Campos obrigatórios: email, password, name, role" }),
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

    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: "Senha deve ter no mínimo 6 caracteres" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Criar usuário com service_role key (permissão admin do Supabase)
    // Primeiro tenta com email_confirm (trigger handle_new_user cria o profile).
    // Se o trigger não existir ou falhar, cria o profile manualmente.
    let newUser;
    let createError;

    ({ data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, role },
    }));

    // Se deu "Database error" o trigger handle_new_user() falhou.
    // Tenta criar sem trigger e inserir o profile manualmente.
    if (createError && createError.message.includes("Database error")) {
      // Tenta criar sem o trigger (pode ser que o trigger não exista)
      ({ data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, role },
        // Nota: se o trigger existir mas estiver com bug, o mesmo erro irá se repetir.
        // Neste caso inserimos o profile manualmente abaixo.
      }));

      // Se ainda falha com Database error, o user em auth.users pode ter sido criado
      // mas o profile não. Tenta buscar o user.
      if (createError && createError.message.includes("Database error")) {
        // O user pode ter sido criado em auth.users antes do trigger falhar.
        // Busca o user pelo email para pegar o id.
        const { data: listData } = await adminClient.auth.admin.listUsers();
        const existingUser = listData?.users?.find((u) => u.email === email);

        if (existingUser) {
          // Cria o profile manualmente
          const { error: profileError } = await adminClient
            .from("profiles")
            .upsert({
              id: existingUser.id,
              name,
              email,
              role,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }, { onConflict: "id" });

          if (profileError) {
            return new Response(
              JSON.stringify({ error: `Erro ao criar profile: ${profileError.message}` }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          return new Response(
            JSON.stringify({
              success: true,
              user: { id: existingUser.id, email, name, role },
            }),
            { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    if (createError) {
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Se o user foi criado com sucesso, garante que o profile existe
    // (caso o trigger não exista ou tenha falhado silenciosamente)
    const { data: existingProfile } = await adminClient
      .from("profiles")
      .select("id")
      .eq("id", newUser.user.id)
      .single();

    if (!existingProfile) {
      await adminClient
        .from("profiles")
        .upsert({
          id: newUser.user.id,
          name,
          email,
          role,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: "id" });
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: newUser.user.id,
          email: newUser.user.email,
          name,
          role,
        },
      }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
