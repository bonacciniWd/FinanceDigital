-- Migration 055: Submission review workflow for cadastro_links
-- Adds submission_status, reviewer fields.

ALTER TABLE cadastro_links
  ADD COLUMN IF NOT EXISTS submission_status TEXT NOT NULL DEFAULT 'sem_envio',
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_notes TEXT;

-- Constraint for valid statuses (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cadastro_links_submission_status_check'
  ) THEN
    ALTER TABLE cadastro_links
      ADD CONSTRAINT cadastro_links_submission_status_check
      CHECK (submission_status IN ('sem_envio', 'pendente_revisao', 'aprovado', 'rejeitado'));
  END IF;
END $$;

-- Index for fast pending queries
CREATE INDEX IF NOT EXISTS idx_cadastro_links_pending
  ON cadastro_links(submission_status, used_at)
  WHERE submission_status = 'pendente_revisao';

COMMENT ON COLUMN cadastro_links.submission_status IS
  'sem_envio=link não usado | pendente_revisao=cliente preencheu, aguarda aprovação | aprovado | rejeitado';
COMMENT ON COLUMN cadastro_links.reviewed_by IS 'UUID do operador que aprovou/rejeitou';
COMMENT ON COLUMN cadastro_links.review_notes IS 'Motivo de rejeição ou observações do revisor';
