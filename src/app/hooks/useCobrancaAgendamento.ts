/**
 * @module useCobrancaAgendamento
 * @description Hooks para regras + fila de cobrança agendada, com Realtime.
 */
import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as svc from '../services/cobrancaAgendamentoService';
import type { CobrancaAgendamento, CobrancaFilaStatus } from '../services/cobrancaAgendamentoService';

const KEY_AG = 'cobranca-agendamentos';
const KEY_FILA = 'cobranca-fila';

export function useCobrancaAgendamentos() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: [KEY_AG], queryFn: () => svc.listAgendamentos() });
  useEffect(() => {
    return svc.subscribeCobrancaAgendamento(() => {
      qc.invalidateQueries({ queryKey: [KEY_AG] });
      qc.invalidateQueries({ queryKey: [KEY_FILA] });
    });
  }, [qc]);
  return q;
}

export function useCobrancaFila(filtros?: {
  status?: CobrancaFilaStatus[];
  clienteId?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: [KEY_FILA, filtros ?? null],
    queryFn: () => svc.listFila(filtros),
  });
}

export function useCriarAgendamento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof svc.criarAgendamento>[0]) => svc.criarAgendamento(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY_AG] }),
  });
}

export function useUpdateAgendamento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<CobrancaAgendamento> }) =>
      svc.updateAgendamento(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY_AG] }),
  });
}

export function useDeletarAgendamento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => svc.deletarAgendamento(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY_AG] }),
  });
}

export function useEnfileirarCobranca() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof svc.enfileirar>[0]) => svc.enfileirar(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY_FILA] }),
  });
}

export function useEnfileirarLote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof svc.enfileirarLote>[0]) => svc.enfileirarLote(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY_FILA] }),
  });
}

export function useCancelarItemFila() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => svc.cancelarItemFila(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY_FILA] }),
  });
}
