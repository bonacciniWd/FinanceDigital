-- Migration 064: políticas anon em cadastro_links completamente permissivas
-- O token já é validado na aplicação; o formulário não expõe lista de links.
DROP POLICY IF EXISTS "cadastro_links_anon_select" ON cadastro_links;
CREATE POLICY "cadastro_links_anon_select"
  ON cadastro_links FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS "cadastro_links_anon_update" ON cadastro_links;
CREATE POLICY "cadastro_links_anon_update"
  ON cadastro_links FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

-- Garante GRANT (idempotente)
GRANT SELECT, UPDATE ON cadastro_links TO anon;
