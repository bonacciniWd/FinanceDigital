-- ============================================================
-- Migration 067: Adiciona image/heic e image/heif ao bucket client-documents
-- iPhone câmera nativa pode produzir arquivos HEIC que o bucket rejeita
-- por mime type não estar na lista de permitidos.
-- ============================================================

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf'
]
WHERE id = 'client-documents';
