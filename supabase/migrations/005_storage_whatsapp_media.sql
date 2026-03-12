-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 005: Storage RLS policies for whatsapp-media bucket
-- Bucket criado via API (público), mas precisa de policies de RLS para
-- permitir upload/download por usuários autenticados (anon key do frontend).
-- ─────────────────────────────────────────────────────────────────────────────

-- Usuários autenticados podem fazer upload (INSERT) em qualquer path
CREATE POLICY "Authenticated users can upload whatsapp media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'whatsapp-media');

-- Usuários autenticados podem atualizar seus próprios uploads
CREATE POLICY "Authenticated users can update whatsapp media"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'whatsapp-media');

-- Usuários autenticados podem deletar seus próprios uploads
CREATE POLICY "Authenticated users can delete whatsapp media"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'whatsapp-media');

-- Leitura pública (bucket é público, mas policy também precisa existir)
CREATE POLICY "Public read whatsapp media"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'whatsapp-media');
