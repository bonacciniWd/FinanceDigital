-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  057 — Expiração automática de acordos sem pagamento (15 dias)           ║
-- ║                                                                          ║
-- ║  Regra:                                                                  ║
-- ║   • Acordos com status='ativo'                                           ║
-- ║   • Sem entrada paga (entrada_paga = false)                              ║
-- ║   • Sem nenhuma parcela do acordo paga                                   ║
-- ║   • Criados há mais de 15 dias                                           ║
-- ║                                                                          ║
-- ║  Ação:                                                                   ║
-- ║   • Acordo → status='quebrado'                                           ║
-- ║   • Parcelas originais → congelada=false (voltam a acumular juros)       ║
-- ║   • Parcelas pendentes do próprio acordo → status='cancelada'            ║
-- ║   • Card kanban do cliente → etapa='vencido', dias_atraso=46             ║
-- ║     (cai automaticamente na coluna virtual N3 · 46+ dias)                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION expire_overdue_acordos()
RETURNS TABLE(acordo_id UUID, cliente_id UUID) AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT a.id, a.cliente_id, a.parcelas_originais_ids, a.kanban_card_id
      FROM acordos a
     WHERE a.status = 'ativo'
       AND a.entrada_paga = false
       AND a.created_at < (now() - INTERVAL '15 days')
       AND NOT EXISTS (
             SELECT 1 FROM parcelas p
              WHERE p.acordo_id = a.id
                AND p.status = 'paga'
           )
  LOOP
    -- 1. Marca acordo como quebrado
    UPDATE acordos
       SET status = 'quebrado',
           observacao = COALESCE(observacao || E'\n', '') ||
                        '[Auto] Expirado por inatividade (>15 dias sem pagamento) em ' ||
                        to_char(now(), 'DD/MM/YYYY HH24:MI'),
           updated_at = now()
     WHERE id = r.id;

    -- 2. Descongela parcelas originais (voltam a acumular juros)
    IF array_length(r.parcelas_originais_ids, 1) > 0 THEN
      UPDATE parcelas
         SET congelada = false,
             updated_at = now()
       WHERE id = ANY(r.parcelas_originais_ids);
    END IF;

    -- 3. Cancela parcelas pendentes do próprio acordo
    UPDATE parcelas
       SET status = 'cancelada',
           updated_at = now()
     WHERE acordo_id = r.id
       AND status <> 'paga';

    -- 4. Joga o card do kanban para N3 (etapa 'vencido' + dias_atraso=46).
    --    Se o acordo tinha um kanban_card_id vinculado, atualiza-o.
    --    Caso contrário, busca o card mais recente do cliente.
    DECLARE
      v_card_id UUID := r.kanban_card_id;
    BEGIN
      IF v_card_id IS NULL THEN
        SELECT id INTO v_card_id
          FROM kanban_cobranca
         WHERE cliente_id = r.cliente_id
         ORDER BY updated_at DESC
         LIMIT 1;
      END IF;

      IF v_card_id IS NOT NULL THEN
        UPDATE kanban_cobranca
           SET etapa = 'vencido',
               dias_atraso = GREATEST(dias_atraso, 46),
               updated_at = now()
         WHERE id = v_card_id;
      ELSE
        -- Cliente sem card: cria um direto em N3 com a dívida agregada
        INSERT INTO kanban_cobranca (cliente_id, etapa, dias_atraso, valor_divida)
        SELECT r.cliente_id, 'vencido', 46,
               COALESCE((SELECT SUM(valor_original) FROM parcelas
                          WHERE id = ANY(r.parcelas_originais_ids)), 0);
      END IF;
    END;

    -- 5. Re-sincroniza status dos empréstimos afetados
    PERFORM sync_emprestimo_status_from_parcelas(p.emprestimo_id)
       FROM (SELECT DISTINCT emprestimo_id FROM parcelas
              WHERE id = ANY(r.parcelas_originais_ids)
                AND emprestimo_id IS NOT NULL) p;

    -- 6. Re-sincroniza status do cliente
    PERFORM sync_cliente_status_from_emprestimos(r.cliente_id);

    acordo_id := r.id;
    cliente_id := r.cliente_id;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION expire_overdue_acordos() TO authenticated, service_role;

-- ══════════════════════════════════════════════════════════════════════════
-- Agendamento diário via pg_cron (03:00 UTC = 00:00 BRT).
-- Se a extensão pg_cron não estiver disponível neste projeto, o agendamento
-- silenciosamente é ignorado e a função continua disponível para chamada
-- manual via RPC pelo front.
-- ══════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('expire-overdue-acordos')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-overdue-acordos');
    PERFORM cron.schedule(
      'expire-overdue-acordos',
      '0 3 * * *',
      $cron$ SELECT expire_overdue_acordos(); $cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron indisponível: agendamento ignorado (%).', SQLERRM;
END;
$$;
