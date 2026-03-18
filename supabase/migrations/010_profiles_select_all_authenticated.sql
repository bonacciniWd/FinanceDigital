-- ============================================================
-- 010: Permitir todos autenticados verem profiles (necessário para chat interno)
-- ============================================================

-- Remove a policy restritiva (own + admin/gerencia)
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;

-- Nova policy: qualquer usuário autenticado pode ver todos os profiles
-- Necessário para o chat interno funcionar (listar contatos da equipe)
CREATE POLICY "profiles_select_authenticated" ON profiles
  FOR SELECT USING (auth.uid() IS NOT NULL);
