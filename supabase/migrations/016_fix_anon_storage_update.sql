-- Migration 016: Fix anon storage UPDATE policy + robustez na verificação
-- Problema: upsert:true no storage requer UPDATE em storage.objects, mas
-- só existia INSERT para anon. Isso causa "erro ao enviar arquivos" no retry.

-- ── Storage: anon UPDATE para bucket identity-verification ──
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects'
    AND schemaname = 'storage'
    AND policyname = 'identity_verif_anon_update'
  ) THEN
    CREATE POLICY "identity_verif_anon_update" ON storage.objects
      FOR UPDATE
      TO anon
      USING (bucket_id = 'identity-verification')
      WITH CHECK (bucket_id = 'identity-verification');
  END IF;
END $$;
