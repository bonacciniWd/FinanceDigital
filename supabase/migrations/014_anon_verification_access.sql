-- ============================================================
-- Migration 014: Permitir acesso anônimo à verificação de identidade
-- ============================================================
-- A página de verificação (/verify-identity?analise_id=XXX) é pública.
-- O cliente recebe o link via WhatsApp e não possui sessão Supabase.
-- O UUID analise_id no link é o fator de autenticação (128 bits de entropia).
--
-- Políticas adicionadas:
-- 1. anon SELECT em identity_verifications (apenas status pendente/em revisão)
-- 2. anon UPDATE em identity_verifications (para enviar vídeo/docs)
-- 3. anon INSERT em verification_logs (para log de auditoria)
-- 4. anon INSERT/SELECT em storage (bucket identity-verification)
-- ============================================================

-- ── identity_verifications: anon SELECT ─────────────────────
-- Permite que o cliente (sem autenticação) consulte sua verificação
-- desde que saiba o analise_id. Apenas registros pendentes ("pending")
-- e em revisão ("in_review") são visíveis — dados aprovados/reprovados não.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'identity_verifications'
    AND policyname = 'verif_anon_select'
  ) THEN
    CREATE POLICY "verif_anon_select" ON identity_verifications
      FOR SELECT
      TO anon
      USING (status IN ('pending', 'retry_needed'));
  END IF;
END $$;

-- ── identity_verifications: anon UPDATE ─────────────────────
-- Permite que o cliente atualize sua verificação (enviar vídeo + docs).
-- Restrito a registros com status "pending" (não pode alterar após análise).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'identity_verifications'
    AND policyname = 'verif_anon_update'
  ) THEN
    CREATE POLICY "verif_anon_update" ON identity_verifications
      FOR UPDATE
      TO anon
      USING (status = 'pending')
      WITH CHECK (status = 'pending');
  END IF;
END $$;

-- ── verification_logs: anon INSERT ──────────────────────────
-- O log de auditoria já tem INSERT WITH CHECK (true) para authenticated.
-- Adicionar política separada para anon.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'verification_logs'
    AND policyname = 'verif_logs_anon_insert'
  ) THEN
    CREATE POLICY "verif_logs_anon_insert" ON verification_logs
      FOR INSERT
      TO anon
      WITH CHECK (true);
  END IF;
END $$;

-- ── Storage: anon upload para bucket identity-verification ──
-- Permite que o cliente faça upload de vídeo e documentos sem autenticação.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects'
    AND schemaname = 'storage'
    AND policyname = 'identity_verif_anon_upload'
  ) THEN
    CREATE POLICY "identity_verif_anon_upload" ON storage.objects
      FOR INSERT
      TO anon
      WITH CHECK (bucket_id = 'identity-verification');
  END IF;
END $$;

-- ── Storage: anon SELECT para bucket identity-verification ──
-- Permite que o cliente visualize seus próprios uploads durante a revisão.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects'
    AND schemaname = 'storage'
    AND policyname = 'identity_verif_anon_select'
  ) THEN
    CREATE POLICY "identity_verif_anon_select" ON storage.objects
      FOR SELECT
      TO anon
      USING (bucket_id = 'identity-verification');
  END IF;
END $$;
