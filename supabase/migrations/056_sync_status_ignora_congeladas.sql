-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  056 — sync_emprestimo_status_from_parcelas ignora parcelas congeladas   ║
-- ║                                                                          ║
-- ║  Quando um acordo é criado, as parcelas originais ficam com              ║
-- ║  congelada=true. Antes desta migration, a função de sync continuava      ║
-- ║  contando essas parcelas como "vencidas" (porque o status original       ║
-- ║  permanece pendente/vencida e a data_vencimento é passada), mantendo     ║
-- ║  o empréstimo como "inadimplente" e, por consequência, o cliente como    ║
-- ║  "vencido", mesmo após o cliente pagar a entrada do acordo.              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

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
  -- Conta apenas parcelas vivas (não canceladas e não congeladas por acordo).
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'paga'),
    COUNT(*) FILTER (WHERE status = 'vencida'
                      OR (status = 'pendente' AND data_vencimento < CURRENT_DATE)),
    COUNT(*) FILTER (WHERE status IN ('pendente', 'vencida')),
    MIN(data_vencimento) FILTER (WHERE status IN ('pendente', 'vencida'))
  INTO v_total, v_pagas, v_vencidas, v_abertas, v_prox_venc
  FROM parcelas
  WHERE emprestimo_id = p_emprestimo_id
    AND COALESCE(congelada, false) = false
    AND status <> 'cancelada';

  IF v_total = 0 THEN
    -- Empréstimo inteiramente migrado para acordo: marca como quitado para
    -- sair das listas de inadimplência. O acordo segue como dívida ativa.
    UPDATE emprestimos
       SET status = 'quitado',
           updated_at = now()
     WHERE id = p_emprestimo_id
       AND status <> 'quitado';
    RETURN;
  END IF;

  SELECT status INTO v_cur_status FROM emprestimos WHERE id = p_emprestimo_id;

  IF v_cur_status IS NULL THEN
    RETURN;
  END IF;

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

GRANT EXECUTE ON FUNCTION sync_emprestimo_status_from_parcelas(UUID) TO authenticated, service_role;

-- ══════════════════════════════════════════════════════════════════════════
-- Backfill: re-sincroniza todos os empréstimos que possuem parcelas
-- congeladas (i.e. foram afetados por algum acordo).
-- ══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT emprestimo_id
      FROM parcelas
     WHERE COALESCE(congelada, false) = true
       AND emprestimo_id IS NOT NULL
  LOOP
    PERFORM sync_emprestimo_status_from_parcelas(r.emprestimo_id);
  END LOOP;
END;
$$;

-- Recalcula status dos clientes afetados.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT e.cliente_id
      FROM emprestimos e
      JOIN parcelas p ON p.emprestimo_id = e.id
     WHERE COALESCE(p.congelada, false) = true
       AND e.cliente_id IS NOT NULL
  LOOP
    PERFORM sync_cliente_status_from_emprestimos(r.cliente_id);
  END LOOP;
END;
$$;
