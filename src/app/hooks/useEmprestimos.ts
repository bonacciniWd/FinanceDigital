/**
 * @module useEmprestimos
 * @description React Query hooks para operações com empréstimos.
 *
 * @example
 * ```tsx
 * const { data: emprestimos, isLoading } = useEmprestimos();
 * const { data: byCliente } = useEmprestimosByCliente(clienteId);
 * ```
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as emprestimosService from '../services/emprestimosService';
import { dbEmprestimoToView } from '../lib/adapters';
import type { EmprestimoInsert, EmprestimoUpdate } from '../lib/database.types';

/** Quitar empréstimo (empréstimo + parcelas + kanban) */
export function useQuitarEmprestimo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, totalParcelas }: { id: string; totalParcelas: number }) =>
      emprestimosService.quitarEmprestimo(id, totalParcelas),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: ['parcelas'] });
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      queryClient.invalidateQueries({ queryKey: ['kanban-cobranca'] });
      queryClient.invalidateQueries({ queryKey: ['kanban-stats'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
    },
  });
}

const QUERY_KEY = 'emprestimos';

/** Buscar todos os empréstimos (com nome do cliente) — retorna camelCase */
export function useEmprestimos(status?: string) {
  return useQuery({
    queryKey: [QUERY_KEY, { status }],
    queryFn: () => emprestimosService.getEmprestimos(status),
    select: (data) => data.map(dbEmprestimoToView),
    // Lista grande (joinada com clientes); mutações invalidam.
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });
}

/** Buscar empréstimos de um cliente — retorna camelCase */
export function useEmprestimosByCliente(clienteId: string | undefined) {
  return useQuery({
    queryKey: [QUERY_KEY, 'by-cliente', clienteId],
    queryFn: () => emprestimosService.getEmprestimosByCliente(clienteId!),
    enabled: !!clienteId,
    select: (data) => data.map(dbEmprestimoToView),
  });
}

/** Buscar empréstimo por ID — retorna camelCase */
export function useEmprestimo(id: string | undefined) {
  return useQuery({
    queryKey: [QUERY_KEY, id],
    queryFn: () => emprestimosService.getEmprestimoById(id!),
    enabled: !!id,
    select: (data) => (data ? dbEmprestimoToView(data as any) : null),
  });
}

/** Criar empréstimo */
export function useCreateEmprestimo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: EmprestimoInsert) => emprestimosService.createEmprestimo(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      queryClient.invalidateQueries({ queryKey: ['parcelas'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
    },
  });
}

/** Atualizar empréstimo */
export function useUpdateEmprestimo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: EmprestimoUpdate }) =>
      emprestimosService.updateEmprestimo(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: ['parcelas'] });
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
      queryClient.invalidateQueries({ queryKey: ['kanban-cobranca'] });
      queryClient.invalidateQueries({ queryKey: ['kanban-stats'] });
    },
  });
}

/** Excluir empréstimo */
export function useDeleteEmprestimo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => emprestimosService.deleteEmprestimo(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: ['parcelas'] });
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
    },
  });
}
