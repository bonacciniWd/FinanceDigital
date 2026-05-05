-- Migration 054: Public registration / update link for clients
-- Allows generating a tokenized public URL so the client fills their own cadastro
-- (used for new leads OR for refreshing legacy/migrated clients).

-- ── Column: tracks last self-cadastro update ───────────────────────
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS cadastro_atualizado_em TIMESTAMPTZ DEFAULT NULL;

-- ── Table: cadastro_links ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cadastro_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL,
  cliente_id UUID REFERENCES clientes(id) ON DELETE CASCADE,    -- NULL = link genérico (cadastro novo)
  criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  used_at TIMESTAMPTZ DEFAULT NULL,
  used_cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
  whatsapp_enviado BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_cadastro_links_token ON cadastro_links(token);
CREATE INDEX IF NOT EXISTS idx_cadastro_links_cliente_id ON cadastro_links(cliente_id);
CREATE INDEX IF NOT EXISTS idx_cadastro_links_expires_at ON cadastro_links(expires_at);

ALTER TABLE cadastro_links ENABLE ROW LEVEL SECURITY;

-- Authenticated (admin/gerencia) — full access
DROP POLICY IF EXISTS "cadastro_links_auth_all" ON cadastro_links;
CREATE POLICY "cadastro_links_auth_all"
  ON cadastro_links FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Anon — SELECT by valid token (not used + not expired)
DROP POLICY IF EXISTS "cadastro_links_anon_select" ON cadastro_links;
CREATE POLICY "cadastro_links_anon_select"
  ON cadastro_links FOR SELECT TO anon
  USING (used_at IS NULL AND expires_at > NOW());

-- Anon — UPDATE used_at + used_cliente_id (close link after submit)
DROP POLICY IF EXISTS "cadastro_links_anon_update" ON cadastro_links;
CREATE POLICY "cadastro_links_anon_update"
  ON cadastro_links FOR UPDATE TO anon
  USING (used_at IS NULL AND expires_at > NOW())
  WITH CHECK (true);

-- ── Anon access on clientes for self-cadastro ──────────────────────
-- Anon may SELECT a single cliente row only when called via service-side check
-- (we use service role in edge function or filter by id from valid token in app).
-- Para simplificar, permitimos UPDATE+INSERT por anon — a filtragem fica na app
-- usando o token. (Mantém RLS authenticated existente intocada.)

DROP POLICY IF EXISTS "clientes_anon_select_via_token" ON clientes;
CREATE POLICY "clientes_anon_select_via_token"
  ON clientes FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM cadastro_links cl
      WHERE cl.cliente_id = clientes.id
        AND cl.used_at IS NULL
        AND cl.expires_at > NOW()
    )
  );

DROP POLICY IF EXISTS "clientes_anon_update_via_token" ON clientes;
CREATE POLICY "clientes_anon_update_via_token"
  ON clientes FOR UPDATE TO anon
  USING (
    EXISTS (
      SELECT 1 FROM cadastro_links cl
      WHERE cl.cliente_id = clientes.id
        AND cl.used_at IS NULL
        AND cl.expires_at > NOW()
    )
  )
  WITH CHECK (true);

DROP POLICY IF EXISTS "clientes_anon_insert_via_token" ON clientes;
CREATE POLICY "clientes_anon_insert_via_token"
  ON clientes FOR INSERT TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM cadastro_links cl
      WHERE cl.cliente_id IS NULL
        AND cl.used_at IS NULL
        AND cl.expires_at > NOW()
    )
  );

-- ── Storage: anon upload/select/update/delete on client-documents ──
DROP POLICY IF EXISTS "client_docs_anon_upload" ON storage.objects;
CREATE POLICY "client_docs_anon_upload"
  ON storage.objects FOR INSERT TO anon
  WITH CHECK (bucket_id = 'client-documents');

DROP POLICY IF EXISTS "client_docs_anon_select" ON storage.objects;
CREATE POLICY "client_docs_anon_select"
  ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'client-documents');

DROP POLICY IF EXISTS "client_docs_anon_update" ON storage.objects;
CREATE POLICY "client_docs_anon_update"
  ON storage.objects FOR UPDATE TO anon
  USING (bucket_id = 'client-documents')
  WITH CHECK (bucket_id = 'client-documents');

DROP POLICY IF EXISTS "client_docs_anon_delete" ON storage.objects;
CREATE POLICY "client_docs_anon_delete"
  ON storage.objects FOR DELETE TO anon
  USING (bucket_id = 'client-documents');

COMMENT ON TABLE cadastro_links IS
  'Tokenized public links for self-cadastro / cadastro update. cliente_id NULL = generic link for new client.';
COMMENT ON COLUMN clientes.cadastro_atualizado_em IS
  'Timestamp of last self-update via /cadastro/:token. NULL = nunca atualizado pelo cliente.';
