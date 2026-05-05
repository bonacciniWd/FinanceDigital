-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  059 — Separa políticas INSERT de clientes: authenticated vs anon        ║
-- ║                                                                          ║
-- ║  Problema: a policy "clientes_insert" original usava FOR INSERT (sem     ║
-- ║  role = apenas authenticated implicitamente via USING), mas o PostgreSQL  ║
-- ║  avalia TODAS as policies com match. Para anon, auth_role() retorna NULL  ║
-- ║  e a condição IN ('admin','gerencia','comercial') falha → RLS block.     ║
-- ║                                                                          ║
-- ║  Solução: recriar "clientes_insert" explicitamente para role             ║
-- ║  'authenticated', mantendo "clientes_anon_insert_via_token" para 'anon'. ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

DROP POLICY IF EXISTS "clientes_insert" ON clientes;
CREATE POLICY "clientes_insert"
  ON clientes FOR INSERT TO authenticated
  WITH CHECK (auth_role() IN ('admin', 'gerencia', 'comercial'));
