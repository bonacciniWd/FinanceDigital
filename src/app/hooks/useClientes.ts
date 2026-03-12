/**
 * @module useClientes
 * @description React Query hooks para operações com clientes.
 *
 * Hooks: useClientes, useCliente, useClienteComIndicados,
 * useCreateCliente, useUpdateCliente, useDeleteCliente, useClienteStats
 *
 * @example
 * ```tsx
 * const { data: clientes, isLoading } = useClientes();
 * const mutation = useCreateCliente();
 * mutation.mutate({ nome: 'Novo', email: 'novo@email.com', ... });
 * ```
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as clientesService from '../services/clientesService';
import { dbClienteToView, dbClienteComIndicadosToView } from '../lib/adapters';
import type { ClienteInsert, ClienteUpdate } from '../lib/database.types';

const QUERY_KEY = 'clientes';

/** Buscar todos os clientes (opcionalmente filtrados por status) — retorna camelCase */
export function useClientes(status?: string) {
  return useQuery({
    queryKey: [QUERY_KEY, { status }],
    queryFn: () => clientesService.getClientes(status),
    select: (data) => data.map((c) => dbClienteToView(c)),
  });
}

/** Buscar um cliente por ID — retorna camelCase */
export function useCliente(id: string | undefined) {
  return useQuery({
    queryKey: [QUERY_KEY, id],
    queryFn: () => clientesService.getClienteById(id!),
    enabled: !!id,
    select: (data) => (data ? dbClienteToView(data) : null),
  });
}

/** Buscar cliente com indicados — retorna camelCase */
export function useClienteComIndicados(id: string | undefined) {
  return useQuery({
    queryKey: [QUERY_KEY, id, 'indicados'],
    queryFn: () => clientesService.getClienteComIndicados(id!),
    enabled: !!id,
    select: (data) => (data ? dbClienteComIndicadosToView(data) : null),
  });
}

/** Buscar indicados de um cliente */
export function useIndicados(clienteId: string | undefined) {
  return useQuery({
    queryKey: [QUERY_KEY, clienteId, 'indicados-list'],
    queryFn: () => clientesService.getIndicados(clienteId!),
    enabled: !!clienteId,
  });
}

/** Estatísticas p/ dashboard */
export function useClienteStats() {
  return useQuery({
    queryKey: [QUERY_KEY, 'stats'],
    queryFn: () => clientesService.getClienteStats(),
  });
}

/** Criar cliente */
export function useCreateCliente() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ClienteInsert) => clientesService.createCliente(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['rede-indicacoes'] });
    },
  });
}

/** Atualizar cliente */
export function useUpdateCliente() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ClienteUpdate }) =>
      clientesService.updateCliente(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['kanban-cobranca'] });
      queryClient.invalidateQueries({ queryKey: ['kanban-stats'] });
      queryClient.invalidateQueries({ queryKey: ['rede-indicacoes'] });
    },
  });
}

/** Excluir cliente */
export function useDeleteCliente() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => clientesService.deleteCliente(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['emprestimos'] });
      queryClient.invalidateQueries({ queryKey: ['parcelas'] });
      queryClient.invalidateQueries({ queryKey: ['rede-indicacoes'] });
    },
  });
}
