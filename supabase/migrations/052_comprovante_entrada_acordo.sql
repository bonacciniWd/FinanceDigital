-- Migration: 052_comprovante_entrada_acordo
-- Adiciona suporte a comprovante de entrada paga manualmente em acordos.

-- ── Coluna de URL do comprovante de entrada ───────────────
ALTER TABLE acordos
  ADD COLUMN IF NOT EXISTS entrada_comprovante_url TEXT,
  ADD COLUMN IF NOT EXISTS entrada_paga_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS entrada_paga_por UUID REFERENCES auth.users(id);

COMMENT ON COLUMN acordos.entrada_comprovante_url IS 'Path no storage do comprovante anexado quando a entrada é confirmada manualmente';
COMMENT ON COLUMN acordos.entrada_paga_em IS 'Timestamp da confirmação da entrada (manual ou via webhook EFI)';
COMMENT ON COLUMN acordos.entrada_paga_por IS 'Usuário que confirmou manualmente a entrada (NULL se via webhook)';

-- ── Bucket privado para comprovantes de entrada de acordo ──
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'comprovantes-acordo',
  'comprovantes-acordo',
  false,
  10485760, -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- ── RLS: admin/gerencia/cobranca podem fazer upload e leitura ──
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND schemaname = 'storage'
    AND policyname = 'comprovantes_acordo_insert'
  ) THEN
    CREATE POLICY "comprovantes_acordo_insert" ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'comprovantes-acordo'
        AND auth_role() IN ('admin', 'gerencia', 'cobranca')
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND schemaname = 'storage'
    AND policyname = 'comprovantes_acordo_select'
  ) THEN
    CREATE POLICY "comprovantes_acordo_select" ON storage.objects
      FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'comprovantes-acordo'
        AND auth.uid() IS NOT NULL
      );
  END IF;
END $$;
