/**
 * @module useFuncionarios
 * @description React Query hooks para funcionários e monitoramento.
 *
 * @example
 * ```tsx
 * const { data: funcionarios } = useFuncionarios();
 * const { data: stats } = useFuncionarioStats();
 * ```
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as funcionariosService from '../services/funcionariosService';
import { dbFuncionarioToView, dbSessaoToView } from '../lib/adapters';

const QUERY_KEY = 'funcionarios';

/** Buscar todos os funcionários — retorna camelCase */
export function useFuncionarios() {
  return useQuery({
    queryKey: [QUERY_KEY],
    queryFn: () => funcionariosService.getFuncionarios(),
    select: (data) => data.map((f) => dbFuncionarioToView(f)),
  });
}

/** Buscar funcionário por ID — retorna camelCase */
export function useFuncionario(id: string | undefined) {
  return useQuery({
    queryKey: [QUERY_KEY, id],
    queryFn: () => funcionariosService.getFuncionarioById(id!),
    enabled: !!id,
    select: (data) => (data ? dbFuncionarioToView(data) : null),
  });
}

/** Buscar funcionário pelo user_id — retorna camelCase */
export function useFuncionarioByUserId(userId: string | undefined) {
  return useQuery({
    queryKey: [QUERY_KEY, 'by-user', userId],
    queryFn: () => funcionariosService.getFuncionarioByUserId(userId!),
    enabled: !!userId,
    select: (data) => (data ? dbFuncionarioToView(data) : null),
  });
}

/** Buscar sessões de um funcionário — retorna camelCase */
export function useSessoesByFuncionario(funcionarioId: string | undefined) {
  return useQuery({
    queryKey: [QUERY_KEY, funcionarioId, 'sessoes'],
    queryFn: () => funcionariosService.getSessoesByFuncionario(funcionarioId!),
    enabled: !!funcionarioId,
    select: (data) => data.map(dbSessaoToView),
  });
}

/** Estatísticas dos funcionários (para dashboard de monitoramento) */
export function useFuncionarioStats() {
  return useQuery({
    queryKey: [QUERY_KEY, 'stats'],
    queryFn: () => funcionariosService.getFuncionarioStats(),
    refetchInterval: 30000, // Atualizar a cada 30s
  });
}

/** Atualizar status de um funcionário */
export function useUpdateFuncionarioStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'online' | 'offline' | 'ausente' }) =>
      funcionariosService.updateFuncionarioStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}
