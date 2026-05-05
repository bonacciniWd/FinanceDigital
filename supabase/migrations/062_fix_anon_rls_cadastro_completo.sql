-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  062 — Fix abrangente das políticas RLS para cadastro público (anon)     ║
-- ║                                                                          ║
-- ║  Problemas identificados:                                                ║
-- ║  1. cadastro_links UPDATE falha: WITH CHECK avaliado com USING stacking  ║
-- ║  2. clientes UPDATE falha para novo cliente via link genérico:           ║
-- ║     cl.cliente_id = clientes.id falha quando cl.cliente_id IS NULL       ║
-- ║  3. clientes_update (migration 001, sem TO clause) bloqueia anon via     ║
-- ║     auth_role() IN (...) → NULL → false — precisa de TO authenticated.   ║
-- ║  4. Storage upload de documentos: garantir policies corretas             ║
-- ║                                                                          ║
-- ║  Estratégia de segurança:                                                ║
-- ║  - Token validado na aplicação antes de exibir o formulário              ║
-- ║  - anon só opera em tabelas específicas (clientes, cadastro_links)       ║
-- ║  - Políticas permissivas para anon com escopo limitado                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── 1. clientes_update → explicitamente só para authenticated ─────────────
DROP POLICY IF EXISTS "clientes_update" ON clientes;
CREATE POLICY "clientes_update"
  ON clientes FOR UPDATE TO authenticated
  USING (auth_role() IN ('admin', 'gerencia', 'cobranca', 'comercial'));

-- ── 2. clientes_delete → explicitamente só para authenticated ────────────
DROP POLICY IF EXISTS "clientes_delete" ON clientes;
CREATE POLICY "clientes_delete"
  ON clientes FOR DELETE TO authenticated
  USING (auth_role() = 'admin');

-- ── 3. clientes_select → explicitamente só para authenticated ────────────
DROP POLICY IF EXISTS "clientes_select" ON clientes;
CREATE POLICY "clientes_select"
  ON clientes FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

-- ── 4. clientes anon UPDATE: suporta link genérico E link vinculado ───────
--   Link genérico: cl.cliente_id IS NULL (novo cadastro)
--   Link vinculado: cl.cliente_id = clientes.id (atualização de existente)
DROP POLICY IF EXISTS "clientes_anon_update_via_token" ON clientes;
CREATE POLICY "clientes_anon_update_via_token"
  ON clientes FOR UPDATE TO anon
  USING (
    EXISTS (
      SELECT 1 FROM cadastro_links cl
      WHERE cl.used_at IS NULL
        AND cl.expires_at > NOW()
        AND (cl.cliente_id = clientes.id OR cl.cliente_id IS NULL)
    )
  )
  WITH CHECK (true);

-- ── 5. clientes anon SELECT: idem para leitura ───────────────────────────
DROP POLICY IF EXISTS "clientes_anon_select_via_token" ON clientes;
CREATE POLICY "clientes_anon_select_via_token"
  ON clientes FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM cadastro_links cl
      WHERE cl.used_at IS NULL
        AND cl.expires_at > NOW()
        AND (cl.cliente_id = clientes.id OR cl.cliente_id IS NULL)
    )
  );

-- ── 6. cadastro_links anon UPDATE: simplificado (token já validado no app) 
DROP POLICY IF EXISTS "cadastro_links_anon_update" ON cadastro_links;
CREATE POLICY "cadastro_links_anon_update"
  ON cadastro_links FOR UPDATE TO anon
  USING (expires_at > NOW())
  WITH CHECK (true);

-- ── 7. Garante GRANT de SELECT em clientes para anon (necessário para USING)
GRANT SELECT ON clientes TO anon;

-- ── 8. Storage: garante políticas para client-documents ──────────────────
-- Upsert de policy para não falhar se já existir
DROP POLICY IF EXISTS "client_docs_anon_upload" ON storage.objects;
CREATE POLICY "client_docs_anon_upload"
  ON storage.objects FOR INSERT TO anon
  WITH CHECK (bucket_id = 'client-documents');

DROP POLICY IF EXISTS "client_docs_anon_upsert" ON storage.objects;
CREATE POLICY "client_docs_anon_upsert"
  ON storage.objects FOR UPDATE TO anon
  USING (bucket_id = 'client-documents')
  WITH CHECK (bucket_id = 'client-documents');

DROP POLICY IF EXISTS "client_docs_anon_select" ON storage.objects;
CREATE POLICY "client_docs_anon_select"
  ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'client-documents');
