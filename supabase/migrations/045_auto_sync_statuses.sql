-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Migration 045 — Auto-sync statuses (parcelas, emprestimos, clientes)  ║
-- ║                                                                        ║
-- ║  Resolve inconsistência em que:                                         ║
-- ║   - parcelas.status nunca vira 'vencida' sozinho                        ║
-- ║   - emprestimos.status não acompanha as parcelas                        ║
-- ║   - clientes.status não acompanha os empréstimos                        ║
-- ║   - RPC get_dashboard_stats devolve valores incoerentes                 ║
-- ║                                                                        ║
-- ║  1. Função sync_emprestimo_status_from_parcelas(emprestimo_id)          ║
-- ║  2. Função sync_cliente_status_from_emprestimos(cliente_id)             ║
-- ║  3. Trigger em parcelas → propaga para emprestimos + clientes           ║
-- ║  4. Trigger em emprestimos → propaga para clientes                      ║
-- ║  5. Função mark_parcelas_vencidas() (rodar diariamente via cron)        ║
-- ║  6. RPC get_dashboard_stats() reescrita (fonte = emprestimos)           ║
-- ║  7. Reconciliação inicial (idempotente)                                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ══════════════════════════════════════════════════════════════
-- 1. Sincroniza status do empréstimo a partir das parcelas
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION sync_emprestimo_status_from_parcelas(p_emprestimo_id UUID)
RETURNS void AS $$
DECLARE
  v_total       INT;
  v_pagas       INT;
  v_vencidas    INT;
  v_abertas     INT;
  v_prox_venc   DATE;
  v_cur_status  TEXT;
BEGIN
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'paga'),
    COUNT(*) FILTER (WHERE status = 'vencida'
                      OR (status = 'pendente' AND data_vencimento < CURRENT_DATE)),
    COUNT(*) FILTER (WHERE status IN ('pendente', 'vencida')),
    MIN(data_vencimento) FILTER (WHERE status IN ('pendente', 'vencida'))
  INTO v_total, v_pagas, v_vencidas, v_abertas, v_prox_venc
  FROM parcelas
  WHERE emprestimo_id = p_emprestimo_id;

  IF v_total = 0 THEN
    RETURN;
  END IF;

  SELECT status INTO v_cur_status FROM emprestimos WHERE id = p_emprestimo_id;

  IF v_cur_status IS NULL THEN
    RETURN;
  END IF;

  -- Status correto
  IF v_abertas = 0 AND v_pagas > 0 THEN
    UPDATE emprestimos
       SET status = 'quitado',
           parcelas_pagas = v_pagas,
           proximo_vencimento = COALESCE(v_prox_venc, proximo_vencimento),
           updated_at = now()
     WHERE id = p_emprestimo_id
       AND status <> 'quitado';
  ELSIF v_vencidas > 0 AND v_cur_status = 'ativo' THEN
    UPDATE emprestimos
       SET status = 'inadimplente',
           parcelas_pagas = v_pagas,
           proximo_vencimento = v_prox_venc,
           updated_at = now()
     WHERE id = p_emprestimo_id;
  ELSIF v_vencidas = 0 AND v_cur_status = 'inadimplente' THEN
    UPDATE emprestimos
       SET status = 'ativo',
           parcelas_pagas = v_pagas,
           proximo_vencimento = v_prox_venc,
           updated_at = now()
     WHERE id = p_emprestimo_id;
  ELSE
    -- Mesmo sem mudança de status, mantém campos derivados em dia
    UPDATE emprestimos
       SET parcelas_pagas = v_pagas,
           proximo_vencimento = COALESCE(v_prox_venc, proximo_vencimento),
           updated_at = now()
     WHERE id = p_emprestimo_id
       AND (parcelas_pagas IS DISTINCT FROM v_pagas
            OR proximo_vencimento IS DISTINCT FROM COALESCE(v_prox_venc, proximo_vencimento));
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ══════════════════════════════════════════════════════════════
-- 2. Sincroniza status do cliente a partir dos empréstimos
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION sync_cliente_status_from_emprestimos(p_cliente_id UUID)
RETURNS void AS $$
DECLARE
  v_has_inadimplente BOOLEAN;
  v_has_ativo        BOOLEAN;
  v_has_any          BOOLEAN;
BEGIN
  SELECT
    EXISTS(SELECT 1 FROM emprestimos WHERE cliente_id = p_cliente_id AND status = 'inadimplente'),
    EXISTS(SELECT 1 FROM emprestimos WHERE cliente_id = p_cliente_id AND status = 'ativo'),
    EXISTS(SELECT 1 FROM emprestimos WHERE cliente_id = p_cliente_id)
  INTO v_has_inadimplente, v_has_ativo, v_has_any;

  IF NOT v_has_any THEN
    RETURN; -- cliente sem empréstimos: não mexe
  END IF;

  IF v_has_inadimplente THEN
    UPDATE clientes SET status = 'vencido', updated_at = now()
     WHERE id = p_cliente_id AND status <> 'vencido';
  ELSIF v_has_ativo THEN
    UPDATE clientes SET status = 'em_dia', updated_at = now()
     WHERE id = p_cliente_id AND status = 'vencido';
  ELSE
    -- Apenas empréstimos quitados: cliente fica em_dia
    UPDATE clientes SET status = 'em_dia', updated_at = now()
     WHERE id = p_cliente_id AND status = 'vencido';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ══════════════════════════════════════════════════════════════
-- 3. Trigger em parcelas → propaga para emprestimos + clientes
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION trg_parcela_sync()
RETURNS trigger AS $$
DECLARE
  v_cliente_id UUID;
  v_emp_id     UUID;
BEGIN
  v_emp_id := COALESCE(NEW.emprestimo_id, OLD.emprestimo_id);
  IF v_emp_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  PERFORM sync_emprestimo_status_from_parcelas(v_emp_id);

  SELECT cliente_id INTO v_cliente_id FROM emprestimos WHERE id = v_emp_id;
  IF v_cliente_id IS NOT NULL THEN
    PERFORM sync_cliente_status_from_emprestimos(v_cliente_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS parcelas_sync_trigger ON parcelas;
CREATE TRIGGER parcelas_sync_trigger
AFTER INSERT OR DELETE OR UPDATE OF status, data_vencimento, valor, data_pagamento ON parcelas
FOR EACH ROW
EXECUTE FUNCTION trg_parcela_sync();

-- ══════════════════════════════════════════════════════════════
-- 4. Trigger em emprestimos.status → propaga para clientes
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION trg_emprestimo_sync_cliente()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM sync_cliente_status_from_emprestimos(OLD.cliente_id);
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status
     OR OLD.cliente_id IS DISTINCT FROM NEW.cliente_id THEN
    PERFORM sync_cliente_status_from_emprestimos(NEW.cliente_id);
    IF TG_OP = 'UPDATE' AND OLD.cliente_id IS DISTINCT FROM NEW.cliente_id THEN
      PERFORM sync_cliente_status_from_emprestimos(OLD.cliente_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS emprestimos_sync_cliente_trigger ON emprestimos;
CREATE TRIGGER emprestimos_sync_cliente_trigger
AFTER INSERT OR UPDATE OR DELETE ON emprestimos
FOR EACH ROW
EXECUTE FUNCTION trg_emprestimo_sync_cliente();

-- ══════════════════════════════════════════════════════════════
-- 5. Função para marcar parcelas vencidas (rodar diariamente)
--    Pode ser chamada via pg_cron, Edge Function agendada ou cliente.
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION mark_parcelas_vencidas()
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE parcelas
     SET status = 'vencida', updated_at = now()
   WHERE status = 'pendente'
     AND data_vencimento < CURRENT_DATE;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION mark_parcelas_vencidas() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION sync_emprestimo_status_from_parcelas(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION sync_cliente_status_from_emprestimos(UUID) TO authenticated, service_role;

-- ══════════════════════════════════════════════════════════════
-- 6. RPC get_dashboard_stats reescrita — fonte de verdade = emprestimos
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS JSON AS $$
DECLARE
  result JSON;
  v_total_clientes INT;
  v_clientes_vencidos INT;
BEGIN
  -- Clientes inadimplentes = clientes com algum empréstimo inadimplente
  SELECT COUNT(*) INTO v_total_clientes FROM clientes;
  SELECT COUNT(DISTINCT cliente_id) INTO v_clientes_vencidos
    FROM emprestimos WHERE status = 'inadimplente';

  SELECT json_build_object(
    'total_clientes', v_total_clientes,
    'clientes_em_dia', GREATEST(v_total_clientes - v_clientes_vencidos
                       - (SELECT COUNT(*) FROM clientes WHERE status = 'a_vencer'), 0),
    'clientes_vencidos', v_clientes_vencidos,
    'clientes_a_vencer', (SELECT COUNT(*) FROM clientes WHERE status = 'a_vencer'),
    'total_carteira', (
      SELECT COALESCE(SUM(valor), 0)
      FROM emprestimos
      WHERE status IN ('ativo', 'inadimplente')
    ),
    'total_inadimplencia', (
      SELECT COALESCE(SUM(valor), 0)
      FROM emprestimos
      WHERE status = 'inadimplente'
    ),
    'taxa_inadimplencia', CASE
      WHEN v_total_clientes = 0 THEN 0
      ELSE ROUND((v_clientes_vencidos::NUMERIC / v_total_clientes) * 100, 1)
    END,
    'total_emprestimos_ativos', (
      SELECT COUNT(*) FROM emprestimos WHERE status IN ('ativo', 'inadimplente')
    )
  ) INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ══════════════════════════════════════════════════════════════
-- 7. Reconciliação inicial (aplica lógica a todo o estado atual)
-- ══════════════════════════════════════════════════════════════

-- 7.1 Marca parcelas vencidas
SELECT mark_parcelas_vencidas();

-- 7.2 Sincroniza status de todos os empréstimos
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM emprestimos LOOP
    PERFORM sync_emprestimo_status_from_parcelas(r.id);
  END LOOP;
END $$;

-- 7.3 Sincroniza status de todos os clientes
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT DISTINCT cliente_id FROM emprestimos LOOP
    PERFORM sync_cliente_status_from_emprestimos(r.cliente_id);
  END LOOP;
END $$;

COMMIT;
