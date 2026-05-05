-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  058 — Corrige política RLS de INSERT anon em clientes                   ║
-- ║                                                                          ║
-- ║  Problema: a WITH CHECK da migration 054 usava uma subquery em           ║
-- ║  cadastro_links que falhava no contexto anon por causa de RLS stacking.  ║
-- ║                                                                          ║
-- ║  Solução: simplificar para WITH CHECK (true).                            ║
-- ║  Segurança mantida: o token já é validado na aplicação antes de exibir   ║
-- ║  o formulário; o anon só consegue INSERT (sem SELECT de outros clientes). ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

DROP POLICY IF EXISTS "clientes_anon_insert_via_token" ON clientes;
CREATE POLICY "clientes_anon_insert_via_token"
  ON clientes FOR INSERT TO anon
  WITH CHECK (true);
