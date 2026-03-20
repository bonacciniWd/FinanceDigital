-- Migration 017: Add anon DELETE policy on storage.objects
-- Necessário para o upload progressivo que faz remove() + upload() ao regravar.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects'
    AND schemaname = 'storage'
    AND policyname = 'identity_verif_anon_delete'
  ) THEN
    CREATE POLICY "identity_verif_anon_delete" ON storage.objects
      FOR DELETE
      TO anon
      USING (bucket_id = 'identity-verification');
  END IF;
END $$;
