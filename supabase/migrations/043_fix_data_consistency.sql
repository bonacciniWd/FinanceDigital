-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Migration 043 — Fix data consistency after PlataPlumo migration       ║
-- ║                                                                        ║
-- ║  1. Parcelas pendentes vencidas → status 'vencida'                     ║
-- ║  2. Empréstimos com parcelas vencidas → status 'inadimplente'          ║
-- ║  3. Empréstimos totalmente pagos → status 'quitado'                    ║
-- ║  4. Atualizar parcelas_pagas nos empréstimos                           ║
-- ║  5. Atualizar status dos clientes                                      ║
-- ║  6. Limpar kanban_cobranca duplicados e re-popular                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ══════════════════════════════════════════════════════════════
-- 1. Parcelas 'pendente' cuja data_vencimento já passou → 'vencida'
-- ══════════════════════════════════════════════════════════════

UPDATE parcelas
SET status = 'vencida', updated_at = now()
WHERE status = 'pendente'
  AND data_vencimento < CURRENT_DATE;

-- ══════════════════════════════════════════════════════════════
-- 2. Atualizar parcelas_pagas em empréstimos (contagem real)
-- ══════════════════════════════════════════════════════════════

UPDATE emprestimos e
SET parcelas_pagas = sub.pagas, updated_at = now()
FROM (
  SELECT emprestimo_id, COUNT(*) FILTER (WHERE status = 'paga') AS pagas
  FROM parcelas
  GROUP BY emprestimo_id
) sub
WHERE sub.emprestimo_id = e.id
  AND e.parcelas_pagas IS DISTINCT FROM sub.pagas;

-- ══════════════════════════════════════════════════════════════
-- 3. Empréstimos 'ativo' que têm parcelas 'vencida' → 'inadimplente'
-- ══════════════════════════════════════════════════════════════

UPDATE emprestimos
SET status = 'inadimplente', updated_at = now()
WHERE status = 'ativo'
  AND id IN (
    SELECT DISTINCT emprestimo_id FROM parcelas WHERE status = 'vencida'
  );

-- ══════════════════════════════════════════════════════════════
-- 4. Empréstimos onde TODAS as parcelas são 'paga' → 'quitado'
-- ══════════════════════════════════════════════════════════════

UPDATE emprestimos e
SET status = 'quitado', updated_at = now()
WHERE e.status IN ('ativo', 'inadimplente')
  AND NOT EXISTS (
    SELECT 1 FROM parcelas p
    WHERE p.emprestimo_id = e.id AND p.status NOT IN ('paga', 'cancelada')
  )
  AND EXISTS (
    SELECT 1 FROM parcelas p WHERE p.emprestimo_id = e.id AND p.status = 'paga'
  );

-- ══════════════════════════════════════════════════════════════
-- 5. Atualizar proximo_vencimento dos empréstimos ativos/inadimplentes
--    = data_vencimento da parcela 'pendente' ou 'vencida' mais próxima
-- ══════════════════════════════════════════════════════════════

UPDATE emprestimos e
SET proximo_vencimento = sub.prox, updated_at = now()
FROM (
  SELECT emprestimo_id, MIN(data_vencimento) AS prox
  FROM parcelas
  WHERE status IN ('pendente', 'vencida')
  GROUP BY emprestimo_id
) sub
WHERE sub.emprestimo_id = e.id
  AND e.status IN ('ativo', 'inadimplente')
  AND e.proximo_vencimento IS DISTINCT FROM sub.prox;

-- ══════════════════════════════════════════════════════════════
-- 6. Atualizar status dos clientes baseado nos empréstimos
-- ══════════════════════════════════════════════════════════════

-- Clientes com algum empréstimo inadimplente → 'vencido'
UPDATE clientes c
SET status = 'vencido', updated_at = now()
WHERE EXISTS (
  SELECT 1 FROM emprestimos e
  WHERE e.cliente_id = c.id AND e.status = 'inadimplente'
)
AND c.status != 'vencido';

-- Clientes com empréstimos ativos (sem inadimplente) → verificar
-- Se tem parcela pendente com vencimento nos próximos 7 dias → 'a_vencer'
UPDATE clientes c
SET status = 'a_vencer', updated_at = now()
WHERE NOT EXISTS (
  SELECT 1 FROM emprestimos e WHERE e.cliente_id = c.id AND e.status = 'inadimplente'
)
AND EXISTS (
  SELECT 1 FROM emprestimos e WHERE e.cliente_id = c.id AND e.status = 'ativo'
)
AND EXISTS (
  SELECT 1 FROM parcelas p
  WHERE p.cliente_id = c.id AND p.status = 'pendente'
    AND p.data_vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
)
AND c.status NOT IN ('a_vencer');

-- Clientes sem empréstimos ativos/inadimplentes (todos quitados) → 'em_dia'
UPDATE clientes c
SET status = 'em_dia', updated_at = now()
WHERE NOT EXISTS (
  SELECT 1 FROM emprestimos e
  WHERE e.cliente_id = c.id AND e.status IN ('ativo', 'inadimplente')
)
AND c.status != 'em_dia';

-- ══════════════════════════════════════════════════════════════
-- 7. Atualizar valor e dias_atraso nos clientes
-- ══════════════════════════════════════════════════════════════

-- Valor = soma das parcelas abertas (pendente+vencida) dos empréstimos ativos/inadimplentes
UPDATE clientes c
SET valor = COALESCE(sub.total_aberto, 0),
    dias_atraso = COALESCE(sub.max_dias, 0),
    vencimento = COALESCE(sub.prox_venc, c.vencimento),
    updated_at = now()
FROM (
  SELECT
    p.cliente_id,
    SUM(p.valor_original) AS total_aberto,
    MAX(GREATEST(0, CURRENT_DATE - p.data_vencimento)) AS max_dias,
    MIN(p.data_vencimento) FILTER (WHERE p.status IN ('pendente', 'vencida')) AS prox_venc
  FROM parcelas p
  JOIN emprestimos e ON e.id = p.emprestimo_id
  WHERE e.status IN ('ativo', 'inadimplente')
    AND p.status IN ('pendente', 'vencida')
  GROUP BY p.cliente_id
) sub
WHERE sub.cliente_id = c.id;

-- ══════════════════════════════════════════════════════════════
-- 8. Remover kanban_cobranca cards que foram inseridos na migration 042
--    (a sync do app vai recriar corretamente)
-- ══════════════════════════════════════════════════════════════

DELETE FROM kanban_cobranca
WHERE cliente_id IN (SELECT id FROM clientes WHERE grupo = 'plataplumo_migrado')
  AND etapa IN ('vencido', 'a_vencer');

-- ══════════════════════════════════════════════════════════════
-- 9. Re-popular kanban para clientes inadimplentes
-- ══════════════════════════════════════════════════════════════

INSERT INTO kanban_cobranca (cliente_id, etapa, valor_divida, dias_atraso, parcela_id)
SELECT
  c.id,
  'vencido'::kanban_cobranca_etapa,
  c.valor,
  c.dias_atraso,
  (SELECT p.id FROM parcelas p
   WHERE p.cliente_id = c.id AND p.status = 'vencida'
   ORDER BY p.data_vencimento LIMIT 1)
FROM clientes c
WHERE c.status = 'vencido'
  AND NOT EXISTS (SELECT 1 FROM kanban_cobranca k WHERE k.cliente_id = c.id)
ON CONFLICT DO NOTHING;

-- Também criar cards 'a_vencer' para clientes com empréstimos ativos
INSERT INTO kanban_cobranca (cliente_id, etapa, valor_divida, dias_atraso, parcela_id)
SELECT
  c.id,
  'a_vencer'::kanban_cobranca_etapa,
  c.valor,
  0,
  (SELECT p.id FROM parcelas p
   WHERE p.cliente_id = c.id AND p.status = 'pendente'
   ORDER BY p.data_vencimento LIMIT 1)
FROM clientes c
WHERE c.status = 'a_vencer'
  AND NOT EXISTS (SELECT 1 FROM kanban_cobranca k WHERE k.cliente_id = c.id)
ON CONFLICT DO NOTHING;

-- ══════════════════════════════════════════════════════════════
-- 10. Estatísticas finais
-- ══════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_parc_atualizadas  INTEGER;
  v_emp_inadimplentes INTEGER;
  v_emp_quitados      INTEGER;
  v_cli_vencidos      INTEGER;
  v_kanban_cards      INTEGER;
BEGIN
  SELECT count(*) INTO v_parc_atualizadas FROM parcelas WHERE status = 'vencida';
  SELECT count(*) INTO v_emp_inadimplentes FROM emprestimos WHERE status = 'inadimplente';
  SELECT count(*) INTO v_emp_quitados FROM emprestimos WHERE status = 'quitado';
  SELECT count(*) INTO v_cli_vencidos FROM clientes WHERE status = 'vencido';
  SELECT count(*) INTO v_kanban_cards FROM kanban_cobranca;

  RAISE NOTICE '════════════════════════════════════════════';
  RAISE NOTICE '  Fix 043 — Consistência de dados';
  RAISE NOTICE '  Parcelas vencidas:       %', v_parc_atualizadas;
  RAISE NOTICE '  Empréstimos inadimplentes: %', v_emp_inadimplentes;
  RAISE NOTICE '  Empréstimos quitados:     %', v_emp_quitados;
  RAISE NOTICE '  Clientes vencidos:        %', v_cli_vencidos;
  RAISE NOTICE '  Cards kanban:             %', v_kanban_cards;
  RAISE NOTICE '════════════════════════════════════════════';
END $$;

COMMIT;
