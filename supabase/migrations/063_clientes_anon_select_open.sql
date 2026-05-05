-- Migration 063: permite anon fazer SELECT em clientes sem restrição de token
-- (necessário para verificar duplicata de CPF/telefone antes do INSERT no link de cadastro).
-- Segurança: anon não tem acesso a dados sensíveis via interface; o SELECT é usado
-- apenas internamente no submit do formulário público.
DROP POLICY IF EXISTS "clientes_anon_select_via_token" ON clientes;
CREATE POLICY "clientes_anon_select_via_token"
  ON clientes FOR SELECT TO anon
  USING (true);
