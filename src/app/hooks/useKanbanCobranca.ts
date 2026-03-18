/**
 * @module useKanbanCobranca
 * @description React Query hooks para o pipeline de cobrança (Kanban).
 *
 * Hooks: useCardsCobranca, useCardsByEtapa, useCardCobranca,
 * useCreateCardCobranca, useUpdateCardCobranca, useMoverCardCobranca,
 * useRegistrarContato, useDeleteCardCobranca, useKanbanStats
 *
 * @example
 * ```tsx
 * const { data: cards } = useCardsCobranca();
 * const mover = useMoverCardCobranca();
 * mover.mutate({ id: 'abc', etapa: 'negociacao' });
 * ```
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as kanbanService from '../services/kanbanCobrancaService';
import { dbKanbanCobrancaToView } from '../lib/adapters';
import type { KanbanCobrancaInsert, KanbanCobrancaUpdate, KanbanCobrancaEtapa } from '../lib/database.types';

const QUERY_KEY = 'kanban-cobranca';
const STATS_KEY = 'kanban-stats';

/** Buscar todos os cards (opcionalmente filtrados por etapa) — retorna camelCase */
export function useCardsCobranca(etapa?: KanbanCobrancaEtapa) {
  return useQuery({
    queryKey: [QUERY_KEY, { etapa }],
    queryFn: () => kanbanService.getCardsCobranca(etapa),
    select: (data) => data.map(dbKanbanCobrancaToView),
  });
}

/** Buscar cards por etapa (para coluna do Kanban) */
export function useCardsByEtapa(etapa: KanbanCobrancaEtapa) {
  return useQuery({
    queryKey: [QUERY_KEY, 'etapa', etapa],
    queryFn: () => kanbanService.getCardsByEtapa(etapa),
    select: (data) => data.map(dbKanbanCobrancaToView),
  });
}

/** Buscar card por ID */
export function useCardCobranca(id: string | undefined) {
  return useQuery({
    queryKey: [QUERY_KEY, id],
    queryFn: () => kanbanService.getCardById(id!),
    enabled: !!id,
    select: (data) => (data ? dbKanbanCobrancaToView(data) : null),
  });
}

/** Buscar cards de um cliente */
export function useCardsByCliente(clienteId: string | undefined) {
  return useQuery({
    queryKey: [QUERY_KEY, 'cliente', clienteId],
    queryFn: () => kanbanService.getCardsByCliente(clienteId!),
    enabled: !!clienteId,
    select: (data) => data.map(dbKanbanCobrancaToView),
  });
}

/** Buscar cards de um responsável */
export function useCardsByResponsavel(responsavelId: string | undefined) {
  return useQuery({
    queryKey: [QUERY_KEY, 'responsavel', responsavelId],
    queryFn: () => kanbanService.getCardsByResponsavel(responsavelId!),
    enabled: !!responsavelId,
    select: (data) => data.map(dbKanbanCobrancaToView),
  });
}

/** Criar novo card de cobrança */
export function useCreateCardCobranca() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: KanbanCobrancaInsert) => kanbanService.createCardCobranca(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [STATS_KEY] });
    },
  });
}

/** Atualizar card de cobrança */
export function useUpdateCardCobranca() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: KanbanCobrancaUpdate }) =>
      kanbanService.updateCardCobranca(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [STATS_KEY] });
    },
  });
}

/** Mover card para outra etapa (drag-and-drop) */
export function useMoverCardCobranca() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, etapa }: { id: string; etapa: KanbanCobrancaEtapa }) =>
      kanbanService.moverCardCobranca(id, etapa),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [STATS_KEY] });
    },
  });
}

/** Registrar tentativa de contato */
export function useRegistrarContato() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, observacao }: { id: string; observacao?: string }) =>
      kanbanService.registrarContato(id, observacao),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [STATS_KEY] });
    },
  });
}

/** Deletar card de cobrança */
export function useDeleteCardCobranca() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => kanbanService.deleteCardCobranca(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [STATS_KEY] });
    },
  });
}

/** Estatísticas consolidadas do Kanban (usado no Gerencial) */
export function useKanbanStats() {
  return useQuery({
    queryKey: [STATS_KEY],
    queryFn: () => kanbanService.getKanbanStats(),
  });
}

/** Sincronizar kanban com empréstimos/parcelas */
export function useSyncCobrancas() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => kanbanService.syncCobrancas(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [STATS_KEY] });
    },
  });
}
