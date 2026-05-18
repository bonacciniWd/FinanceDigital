/**
 * @module useTimelineInteracoes
 * @description Hook que retorna a timeline de um cliente com sync Realtime
 * (zero polling — atualizações chegam via Postgres changes filtrado por cliente_id).
 */
import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as svc from '../services/timelineInteracoesService';

const KEY = 'timeline-interacoes';

export function useTimelineInteracoes(clienteId: string | undefined) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: [KEY, clienteId],
    queryFn: () => svc.listTimelineByCliente(clienteId!),
    enabled: !!clienteId,
  });

  useEffect(() => {
    if (!clienteId) return;
    return svc.subscribeTimelineByCliente(clienteId, () => {
      qc.invalidateQueries({ queryKey: [KEY, clienteId] });
    });
  }, [clienteId, qc]);

  return query;
}

export function useRegistrarInteracao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof svc.registrarInteracaoManual>[0]) =>
      svc.registrarInteracaoManual(input),
    onSuccess: (item) => qc.invalidateQueries({ queryKey: [KEY, item.cliente_id] }),
  });
}

export function useDeletarInteracao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => svc.deletarInteracao(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
