-- ============================================================
-- Migration 066: Storage — políticas abrangentes para client-documents
--
-- Problema: anon recebe "new row violates row-level security policy"
-- mesmo com políticas TO anon existentes.
-- Causa provável: policy RESTRICTIVE ou dashboard-managed policy bloqueando.
--
-- Solução: adicionar políticas SEM restrição de role (FOR ALL roles)
-- que cobrem INSERT/UPDATE/DELETE/SELECT no bucket client-documents.
-- Políticas permissivas são combinadas com OR — basta uma passar.
-- ============================================================

-- Remove todas as políticas anteriores para client-documents
DROP POLICY IF EXISTS "client_docs_anon_upload"    ON storage.objects;
DROP POLICY IF EXISTS "client_docs_anon_upsert"    ON storage.objects;
DROP POLICY IF EXISTS "client_docs_anon_select"    ON storage.objects;
DROP POLICY IF EXISTS "client_docs_anon_delete"    ON storage.objects;
DROP POLICY IF EXISTS "client_docs_all_insert"     ON storage.objects;
DROP POLICY IF EXISTS "client_docs_all_select"     ON storage.objects;
DROP POLICY IF EXISTS "client_docs_all_update"     ON storage.objects;
DROP POLICY IF EXISTS "client_docs_all_delete"     ON storage.objects;

-- Políticas sem restrição de role (público + autenticado + anon)
CREATE POLICY "client_docs_all_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'client-documents');

CREATE POLICY "client_docs_all_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'client-documents');

CREATE POLICY "client_docs_all_update"
  ON storage.objects FOR UPDATE
  USING     (bucket_id = 'client-documents')
  WITH CHECK (bucket_id = 'client-documents');

CREATE POLICY "client_docs_all_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'client-documents');
