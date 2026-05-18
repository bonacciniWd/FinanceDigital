/**
 * @module useMonitoramentoRealtime
 * @description Realtime push opcional para Monitoramento de Atividade.
 *
 * Complementa `useFuncionarios` / `useAllSessoesHoje` (que usam refetchInterval).
 * Quando um INSERT/UPDATE chega em `funcionarios`, `sessoes_atividade` ou
 * `logs_atividade`, invalidamos as queries de monitoramento para refresh
 * imediato — sem esperar o intervalo de 30s.
 */
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

const QK = 'funcionarios';

export function useMonitoramentoRealtime(enabled = true) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    const channel = supabase
      .channel('monitoramento-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'funcionarios' },
        () => {
          qc.invalidateQueries({ queryKey: [QK] });
          qc.invalidateQueries({ queryKey: [QK, 'stats'] });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sessoes_atividade' },
        () => {
          qc.invalidateQueries({ queryKey: [QK, 'sessoes-hoje'] });
          qc.invalidateQueries({ queryKey: [QK] });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'logs_atividade' },
        () => {
          qc.invalidateQueries({ queryKey: ['logs-atividade', 'hoje'] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, qc]);
}
