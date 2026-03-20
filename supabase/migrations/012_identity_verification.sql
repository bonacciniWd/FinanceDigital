-- Migration 012: Identity Verification for Credit Analysis
-- Adds video verification, document upload, and audit logging
-- for the credit approval flow.

-- ── Enum para status de verificação ────────────────────────
DO $$ BEGIN
  CREATE TYPE verification_status AS ENUM ('pending', 'approved', 'rejected', 'retry_needed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Tabela principal: verificações de identidade ──────────
CREATE TABLE IF NOT EXISTS identity_verifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  analise_id UUID NOT NULL REFERENCES analises_credito(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  video_url TEXT,
  document_front_url TEXT,
  document_back_url TEXT,
  verification_phrase TEXT NOT NULL,
  status verification_status NOT NULL DEFAULT 'pending',
  analyzed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  analyzed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  requires_retry BOOLEAN NOT NULL DEFAULT false,
  retry_count INTEGER NOT NULL DEFAULT 0,
  retry_phrase TEXT,
  magic_link_sent_at TIMESTAMPTZ,
  magic_link_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_identity_verif_analise ON identity_verifications(analise_id);
CREATE INDEX IF NOT EXISTS idx_identity_verif_status ON identity_verifications(status);
CREATE INDEX IF NOT EXISTS idx_identity_verif_user ON identity_verifications(user_id);

-- Trigger para updated_at
CREATE OR REPLACE TRIGGER set_identity_verif_updated_at
  BEFORE UPDATE ON identity_verifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Tabela de logs de ações (auditoria) ───────────────────
CREATE TABLE IF NOT EXISTS verification_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  verification_id UUID NOT NULL REFERENCES identity_verifications(id) ON DELETE CASCADE,
  analise_id UUID NOT NULL REFERENCES analises_credito(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- 'magic_link_sent', 'video_uploaded', 'docs_uploaded', 'approved', 'rejected', 'retry_requested', 'credit_released'
  performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verif_logs_verification ON verification_logs(verification_id);
CREATE INDEX IF NOT EXISTS idx_verif_logs_analise ON verification_logs(analise_id);

-- ── Storage bucket para vídeos e documentos ───────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'identity-verification',
  'identity-verification',
  false,
  31457280, -- 30MB
  ARRAY['video/webm', 'video/mp4', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ── RLS para identity_verifications ───────────────────────
ALTER TABLE identity_verifications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'verif_select' AND tablename = 'identity_verifications') THEN
    CREATE POLICY "verif_select" ON identity_verifications
      FOR SELECT USING (
        auth.uid() = user_id
        OR auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'gerencia'))
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'verif_insert' AND tablename = 'identity_verifications') THEN
    CREATE POLICY "verif_insert" ON identity_verifications
      FOR INSERT WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'verif_update' AND tablename = 'identity_verifications') THEN
    CREATE POLICY "verif_update" ON identity_verifications
      FOR UPDATE USING (
        auth.uid() = user_id
        OR auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'gerencia'))
      );
  END IF;
END $$;

-- ── RLS para verification_logs ────────────────────────────
ALTER TABLE verification_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'verif_logs_select' AND tablename = 'verification_logs') THEN
    CREATE POLICY "verif_logs_select" ON verification_logs
      FOR SELECT USING (
        auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin', 'gerencia'))
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'verif_logs_insert' AND tablename = 'verification_logs') THEN
    CREATE POLICY "verif_logs_insert" ON verification_logs
      FOR INSERT WITH CHECK (true);
  END IF;
END $$;

-- ── Storage policies ──────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'identity_verif_upload' AND tablename = 'objects') THEN
    CREATE POLICY "identity_verif_upload" ON storage.objects
      FOR INSERT WITH CHECK (
        bucket_id = 'identity-verification'
        AND auth.role() = 'authenticated'
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'identity_verif_select' AND tablename = 'objects') THEN
    CREATE POLICY "identity_verif_select" ON storage.objects
      FOR SELECT USING (
        bucket_id = 'identity-verification'
        AND auth.role() = 'authenticated'
      );
  END IF;
END $$;

-- ── Atualizar analises_credito para o novo fluxo ──────────
-- Adiciona coluna para rastrear se a verificação foi solicitada
ALTER TABLE analises_credito
  ADD COLUMN IF NOT EXISTS verification_required BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE analises_credito
  ADD COLUMN IF NOT EXISTS verification_id UUID REFERENCES identity_verifications(id) ON DELETE SET NULL;
