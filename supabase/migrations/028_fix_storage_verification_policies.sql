-- ============================================================
-- Migration 028: Defensive fix for ALL identity verification policies
-- ============================================================
-- Problema: "new row violates security policy" ao fazer upload de vídeo
-- no link público de verificação. A policy restrict a INSERT para
-- authenticated, mas o cliente acessa sem sessão (anon).
--
-- Esta migration dropa e recria TODAS as policies relevantes de forma
-- idempotente para garantir que estejam 100% corretas.
-- ============================================================

-- ═══════════════════════════════════════════════════════════
-- 1. STORAGE POLICIES — bucket identity-verification
-- ═══════════════════════════════════════════════════════════

-- Dropar TODAS as policies antigas do bucket (evitar conflitos)
DROP POLICY IF EXISTS "identity_verif_upload" ON storage.objects;
DROP POLICY IF EXISTS "identity_verif_anon_upload" ON storage.objects;
DROP POLICY IF EXISTS "identity_verif_select" ON storage.objects;
DROP POLICY IF EXISTS "identity_verif_anon_select" ON storage.objects;
DROP POLICY IF EXISTS "identity_verif_anon_update" ON storage.objects;
DROP POLICY IF EXISTS "identity_verif_anon_delete" ON storage.objects;

-- Recriar: qualquer role (anon + authenticated) pode INSERT
CREATE POLICY "identity_verif_upload" ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'identity-verification');

-- Recriar: qualquer role pode SELECT
CREATE POLICY "identity_verif_select" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'identity-verification');

-- Recriar: qualquer role pode UPDATE (upsert requer UPDATE)
CREATE POLICY "identity_verif_update" ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'identity-verification')
  WITH CHECK (bucket_id = 'identity-verification');

-- Recriar: qualquer role pode DELETE (regravar vídeo faz remove+upload)
CREATE POLICY "identity_verif_delete" ON storage.objects
  FOR DELETE
  USING (bucket_id = 'identity-verification');

-- ═══════════════════════════════════════════════════════════
-- 2. IDENTITY_VERIFICATIONS TABLE POLICIES
-- ═══════════════════════════════════════════════════════════

-- Dropar as policies anon anteriores
DROP POLICY IF EXISTS "verif_anon_select" ON identity_verifications;
DROP POLICY IF EXISTS "verif_anon_update" ON identity_verifications;

-- Recriar: anon SELECT — permite status pending E retry_needed
CREATE POLICY "verif_anon_select" ON identity_verifications
  FOR SELECT
  TO anon
  USING (status IN ('pending', 'retry_needed'));

-- Recriar: anon UPDATE — permite status pending E retry_needed
-- (fix: antes só permitia 'pending', bloqueava retentativas)
CREATE POLICY "verif_anon_update" ON identity_verifications
  FOR UPDATE
  TO anon
  USING (status IN ('pending', 'retry_needed'))
  WITH CHECK (status IN ('pending', 'retry_needed'));

-- ═══════════════════════════════════════════════════════════
-- 3. VERIFICATION_LOGS — anon INSERT
-- ═══════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "verif_logs_anon_insert" ON verification_logs;
CREATE POLICY "verif_logs_anon_insert" ON verification_logs
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════
-- 4. Garantir que o bucket existe e está configurado
-- ═══════════════════════════════════════════════════════════
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'identity-verification',
  'identity-verification',
  false,
  31457280,
  ARRAY['video/webm', 'video/mp4', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
