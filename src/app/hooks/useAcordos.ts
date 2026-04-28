/**
 * @module useAcordos
 * @description React Query hooks para acordos/renegociações.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as acordoService from '../services/acordoService';
import type { AcordoInsert, AcordoUpdate } from '../lib/database.types';

const QUERY_KEY = 'acordos';

/** Lista todos os acordos. */
export function useAcordos() {
  return useQuery({
    queryKey: [QUERY_KEY],
    queryFn: () => acordoService.listAcordos(),
  });
}

/** Lista acordos de um cliente. */
export function useAcordosByCliente(clienteId: string | undefined) {
  return useQuery({
    queryKey: [QUERY_KEY, 'cliente', clienteId],
    queryFn: () => acordoService.listAcordosByCliente(clienteId!),
    enabled: !!clienteId,
  });
}

/** Busca acordo ativo de um cliente. */
export function useAcordoAtivo(clienteId: string | undefined) {
  return useQuery({
    queryKey: [QUERY_KEY, 'ativo', clienteId],
    queryFn: () => acordoService.getAcordoAtivo(clienteId!),
    enabled: !!clienteId,
  });
}

/** Cria um acordo completo (acordo + congela parcelas + cria parcelas acordo). */
export function useCriarAcordo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      acordo: AcordoInsert;
      parcelasAcordo: {
        emprestimo_id: string;
        cliente_id: string;
        numero: number;
        valor: number;
        valor_original: number;
        data_vencimento: string;
      }[];
    }) => acordoService.criarAcordo(params.acordo, params.parcelasAcordo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: ['kanban-cobranca'] });
      queryClient.invalidateQueries({ queryKey: ['parcelas'] });
      queryClient.invalidateQueries({ queryKey: ['emprestimos'] });
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
    },
  });
}

/** Atualiza um acordo. */
export function useUpdateAcordo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { id: string; updates: AcordoUpdate }) =>
      acordoService.updateAcordo(params.id, params.updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}

/** Cancela um acordo + descongela parcelas. */
export function useCancelarAcordo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => acordoService.cancelarAcordo(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: ['kanban-cobranca'] });
      queryClient.invalidateQueries({ queryKey: ['parcelas'] });
    },
  });
}

/** Marca acordo como quebrado. */
export function useQuebrarAcordo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => acordoService.quebrarAcordo(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: ['kanban-cobranca'] });
      queryClient.invalidateQueries({ queryKey: ['parcelas'] });
    },
  });
}
