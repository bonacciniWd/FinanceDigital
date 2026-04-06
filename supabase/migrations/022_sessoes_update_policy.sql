-- Migration 022: Add missing UPDATE policy for sessoes_atividade
-- The iniciarSessao function needs to UPDATE orphan sessions (close them)
-- and atualizarSessao needs to UPDATE the current session with acoes/paginas.

CREATE POLICY "sessoes_update" ON sessoes_atividade
  FOR UPDATE TO authenticated
  USING (
    funcionario_id IN (SELECT id FROM funcionarios WHERE user_id = auth.uid())
  )
  WITH CHECK (
    funcionario_id IN (SELECT id FROM funcionarios WHERE user_id = auth.uid())
  );
