-- ============================================================
-- 010: Permitir todos autenticados verem profiles (necessário para chat interno)
-- ============================================================

-- Remove a policy restritiva (own + admin/gerencia)
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;

-- Nova policy: qualquer usuário autenticado pode ver todos os profiles
-- Necessário para o chat interno funcionar (listar contatos da equipe)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'profiles_select_authenticated' AND tablename = 'profiles') THEN
    CREATE POLICY "profiles_select_authenticated" ON profiles
      FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
END $$;
