-- Migration 034: Add document columns to clientes table + client-documents bucket
-- Moves document storage from identity_verifications to the client record directly.

-- ── New columns on clientes ──
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS documento_frente_url TEXT DEFAULT NULL;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS documento_verso_url  TEXT DEFAULT NULL;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS comprovante_endereco_url TEXT DEFAULT NULL;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS contatos_referencia JSONB DEFAULT '[]'::jsonb;
-- contatos_referencia: [{name: string, phone: string, relationship: string}]

-- ── Storage bucket for client documents ──
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'client-documents',
  'client-documents',
  false,
  10485760,  -- 10 MB
  ARRAY['image/jpeg','image/png','image/webp','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Policies: authenticated users can upload and read
CREATE POLICY "Authenticated users can upload client-documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'client-documents');

CREATE POLICY "Authenticated users can read client-documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'client-documents');

CREATE POLICY "Admin can delete client-documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'client-documents'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','gerencia'))
  );
