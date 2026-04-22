-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Migration 048 — Valores por parcela e skip de verificação               ║
-- ║                                                                          ║
-- ║  1. analises_credito.valores_parcelas (jsonb)                            ║
-- ║     Array de números, um por parcela. Permite cobrar valores diferentes  ║
-- ║     em cada parcela (ex: [300, 250, 450] para 3 parcelas). Se NULL,      ║
-- ║     o approve-credit usa valor_parcela ou divisão uniforme.              ║
-- ║                                                                          ║
-- ║  2. analises_credito.skip_verification (bool)                            ║
-- ║     Quando TRUE, o criador optou por NÃO enviar o link de verificação    ║
-- ║     e a análise é auto-aprovada imediatamente. Usado por exceção em      ║
-- ║     clientes de confiança — deixa registro para o admin monitorar.       ║
-- ║                                                                          ║
-- ║  3. emprestimos.skip_verification (bool)                                 ║
-- ║     Herda da análise para permitir filtros rápidos no painel admin.     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

ALTER TABLE public.analises_credito
  ADD COLUMN IF NOT EXISTS valores_parcelas jsonb,
  ADD COLUMN IF NOT EXISTS skip_verification boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS skip_verification_reason text;

ALTER TABLE public.emprestimos
  ADD COLUMN IF NOT EXISTS skip_verification boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.analises_credito.valores_parcelas IS
  'Array JSON de números (uma posição por parcela). Se preenchido, sobrepõe valor_parcela e divisão uniforme.';

COMMENT ON COLUMN public.analises_credito.skip_verification IS
  'Criador optou por pular o link de verificação; a análise é auto-aprovada. Requer auditoria do admin.';

COMMENT ON COLUMN public.emprestimos.skip_verification IS
  'TRUE quando o empréstimo foi aprovado sem verificação de identidade (herdado de analises_credito.skip_verification).';

-- Índice parcial para o admin listar rapidamente empréstimos que pularam verificação
CREATE INDEX IF NOT EXISTS idx_emprestimos_skip_verification
  ON public.emprestimos (aprovado_em DESC)
  WHERE skip_verification = true;

-- Permitir log de auditoria sem verification_id (quando a verificação foi pulada)
ALTER TABLE public.verification_logs
  ALTER COLUMN verification_id DROP NOT NULL;
