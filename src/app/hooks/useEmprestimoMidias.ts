/**
 * @module useEmprestimoMidias
 * @description React Query hooks + Realtime subscription para mídias/links/observações compartilhadas.
 */
import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as svc from '../services/emprestimoMidiaService';
import type { EmprestimoMidia, MidiaTipo } from '../services/emprestimoMidiaService';

const KEY = 'emprestimo-midias';

export function useEmprestimoMidias(filtros?: {
  emprestimoId?: string;
  clienteId?: string;
  tipo?: MidiaTipo;
  tag?: string;
}) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: [KEY, filtros ?? null],
    queryFn: () => svc.listMidias(filtros),
  });
  useEffect(() => {
    return svc.subscribeMidias(() => {
      qc.invalidateQueries({ queryKey: [KEY] });
    });
  }, [qc]);
  return query;
}

export function useCriarMidia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof svc.criarMidia>[0]) => svc.criarMidia(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateMidia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<EmprestimoMidia> }) => svc.updateMidia(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeletarMidia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => svc.deletarMidia(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
