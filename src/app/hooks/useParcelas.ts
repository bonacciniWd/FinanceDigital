/**
 * @module useParcelas
 * @description React Query hooks para operações com parcelas.
 *
 * @example
 * ```tsx
 * const { data: parcelas } = useParcelas();
 * const pagamento = useRegistrarPagamento();
 * pagamento.mutate({ id: 'p1', dataPagamento: '2026-02-24' });
 * ```
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as parcelasService from '../services/parcelasService';
import { dbParcelaToView } from '../lib/adapters';
import type { ParcelaInsert, ParcelaUpdate } from '../lib/database.types';

const QUERY_KEY = 'parcelas';

/** Buscar todas as parcelas (com nome do cliente) — retorna camelCase */
export function useParcelas(status?: string) {
  return useQuery({
    queryKey: [QUERY_KEY, { status }],
    queryFn: () => parcelasService.getParcelas(status),
    select: (data) => data.map(dbParcelaToView),
  });
}

/** Buscar parcelas de um empréstimo — retorna camelCase */
export function useParcelasByEmprestimo(emprestimoId: string | undefined) {
  return useQuery({
    queryKey: [QUERY_KEY, 'by-emprestimo', emprestimoId],
    queryFn: () => parcelasService.getParcelasByEmprestimo(emprestimoId!),
    enabled: !!emprestimoId,
    select: (data) => data.map(dbParcelaToView),
  });
}

/** Buscar parcelas de um cliente — retorna camelCase */
export function useParcelasByCliente(clienteId: string | undefined) {
  return useQuery({
    queryKey: [QUERY_KEY, 'by-cliente', clienteId],
    queryFn: () => parcelasService.getParcelasByCliente(clienteId!),
    enabled: !!clienteId,
    select: (data) => data.map(dbParcelaToView),
  });
}

/** Buscar parcelas vencidas — retorna camelCase */
export function useParcelasVencidas() {
  return useQuery({
    queryKey: [QUERY_KEY, 'vencidas'],
    queryFn: () => parcelasService.getParcelasVencidas(),
    select: (data) => data.map(dbParcelaToView),
  });
}

/** Criar parcela */
export function useCreateParcela() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ParcelaInsert) => parcelasService.createParcela(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}

/** Atualizar parcela */
export function useUpdateParcela() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ParcelaUpdate }) =>
      parcelasService.updateParcela(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: ['emprestimos'] });
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
      queryClient.invalidateQueries({ queryKey: ['kanban-cobranca'] });
      queryClient.invalidateQueries({ queryKey: ['kanban-stats'] });
    },
  });
}

/** Registrar pagamento de parcela */
export function useRegistrarPagamento() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      dataPagamento,
      desconto,
    }: {
      id: string;
      dataPagamento: string;
      desconto?: number;
    }) => parcelasService.registrarPagamento(id, dataPagamento, desconto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: ['emprestimos'] });
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
      queryClient.invalidateQueries({ queryKey: ['kanban-cobranca'] });
      queryClient.invalidateQueries({ queryKey: ['kanban-stats'] });
    },
  });
}

/** Recalcular status de um empréstimo a partir das parcelas */
export function useSyncEmprestimoStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (emprestimoId: string) => parcelasService.syncEmprestimoStatus(emprestimoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emprestimos'] });
      queryClient.invalidateQueries({ queryKey: ['kanban-cobranca'] });
      queryClient.invalidateQueries({ queryKey: ['kanban-stats'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
  });
}
