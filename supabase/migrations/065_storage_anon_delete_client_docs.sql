-- ============================================================
-- Migration 065: Storage DELETE policy para anon em client-documents
-- O upsert do storage faz DELETE + INSERT internamente.
-- Sem política de DELETE o anon recebe RLS violation no reenvio.
-- ============================================================

DROP POLICY IF EXISTS "client_docs_anon_delete" ON storage.objects;
CREATE POLICY "client_docs_anon_delete"
  ON storage.objects FOR DELETE TO anon
  USING (bucket_id = 'client-documents');
