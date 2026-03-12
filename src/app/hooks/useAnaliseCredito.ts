/**
 * @module useAnaliseCredito
 * @description React Query hooks para operações com análises de crédito.
 *
 * Hooks: useAnalises, useAnalise, useCreateAnalise,
 * useUpdateAnalise, useDeleteAnalise
 *
 * @example
 * ```tsx
 * const { data: analises, isLoading } = useAnalises();
 * const aprovar = useUpdateAnalise();
 * aprovar.mutate({ id: 'abc', updates: { status: 'aprovado' } });
 * ```
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as analiseCreditoService from '../services/analiseCreditoService';
import { dbAnaliseCreditoToView } from '../lib/adapters';
import type { AnaliseCreditoInsert, AnaliseCreditoUpdate } from '../lib/database.types';

const QUERY_KEY = 'analises-credito';

/** Buscar todas as análises (opcionalmente filtradas por status) — retorna camelCase */
export function useAnalises(status?: string) {
  return useQuery({
    queryKey: [QUERY_KEY, { status }],
    queryFn: () => analiseCreditoService.getAnalises(status),
    select: (data) => data.map((a) => dbAnaliseCreditoToView(a)),
  });
}

/** Buscar uma análise por ID — retorna camelCase */
export function useAnalise(id: string | undefined) {
  return useQuery({
    queryKey: [QUERY_KEY, id],
    queryFn: () => analiseCreditoService.getAnaliseById(id!),
    enabled: !!id,
    select: (data) => (data ? dbAnaliseCreditoToView(data) : null),
  });
}

/** Criar nova análise */
export function useCreateAnalise() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: AnaliseCreditoInsert) =>
      analiseCreditoService.createAnalise(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}

/** Atualizar análise (aprovar, recusar, etc.) */
export function useUpdateAnalise() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: AnaliseCreditoUpdate }) =>
      analiseCreditoService.updateAnalise(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
    },
  });
}

/** Deletar análise */
export function useDeleteAnalise() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => analiseCreditoService.deleteAnalise(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}
