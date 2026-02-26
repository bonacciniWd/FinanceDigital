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

const QUERY_KEY = 'emprestimos';

/** Buscar todos os empréstimos (com nome do cliente) — retorna camelCase */
export function useEmprestimos(status?: string) {
  return useQuery({
    queryKey: [QUERY_KEY, { status }],
    queryFn: () => emprestimosService.getEmprestimos(status),
    select: (data) => data.map(dbEmprestimoToView),
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
    },
  });
}
