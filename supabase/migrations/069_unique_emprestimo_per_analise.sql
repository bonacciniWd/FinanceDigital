-- 069_unique_emprestimo_per_analise.sql
--
-- Impede que uma mesma análise de crédito gere mais de um empréstimo
-- (causa raiz: dois cliques rápidos em "Aprovar" disparavam approve-credit
-- em paralelo, criando empréstimos duplicados antes do status virar 'aprovado').
--
-- Estratégia: índice único parcial em emprestimos.analise_id (ignora NULL,
-- pois empréstimos legados/manuais podem não ter analise_id).
--
-- Antes de aplicar a constraint, removemos duplicatas existentes mantendo
-- o empréstimo mais antigo (created_at ASC) por analise_id. Os duplicados
-- e suas parcelas/transações são apagados em cascata pelas FKs existentes.

BEGIN;

-- 1) Identifica duplicatas (analise_id repetido) — mantém o mais antigo
WITH dups AS (
  SELECT id
  FROM (
    SELECT
      id,
      analise_id,
      ROW_NUMBER() OVER (PARTITION BY analise_id ORDER BY created_at ASC, id ASC) AS rn
    FROM emprestimos
    WHERE analise_id IS NOT NULL
  ) t
  WHERE rn > 1
)
DELETE FROM emprestimos WHERE id IN (SELECT id FROM dups);

-- 2) Cria índice único parcial garantindo 1 empréstimo por análise
CREATE UNIQUE INDEX IF NOT EXISTS emprestimos_analise_id_uniq
  ON emprestimos (analise_id)
  WHERE analise_id IS NOT NULL;

COMMIT;
