-- 080_emprestimos_criado_por_profiles_sigla.sql
-- Objetivo:
--   1. Adicionar coluna `sigla` em `profiles` (ex.: "AD", "RJ", "TR") para uso
--      em relatórios de comissão / PDFs onde queremos identificar usuários
--      por uma abreviação curta.
--   2. Adicionar coluna `criado_por` em `emprestimos` para rastrear qual
--      usuário cadastrou cada empréstimo. Necessário para a nova regra de
--      comissões de N3/N4 (cobradores recebem sobre empréstimos que eles
--      próprios criaram e que foram pagos em dia).
--      Faz backfill a partir de `desembolsado_por` (best-effort) onde
--      disponível.

BEGIN;

-- ── 1. profiles.sigla ─────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS sigla TEXT;

COMMENT ON COLUMN profiles.sigla IS
  'Abreviação curta (2-4 chars) usada em relatórios e PDFs de comissão.';

-- Garantia de unicidade case-insensitive (permitindo NULL).
CREATE UNIQUE INDEX IF NOT EXISTS profiles_sigla_unique_idx
  ON profiles (LOWER(sigla))
  WHERE sigla IS NOT NULL;

-- ── 2. emprestimos.criado_por ────────────────────────────────
ALTER TABLE emprestimos
  ADD COLUMN IF NOT EXISTS criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN emprestimos.criado_por IS
  'Usuário que cadastrou o empréstimo no sistema. Usado para comissão de N3/N4 e auditoria.';

CREATE INDEX IF NOT EXISTS emprestimos_criado_por_idx
  ON emprestimos (criado_por);

-- Backfill a partir de desembolsado_por (única referência histórica disponível).
UPDATE emprestimos
   SET criado_por = desembolsado_por
 WHERE criado_por IS NULL
   AND desembolsado_por IS NOT NULL;

COMMIT;
