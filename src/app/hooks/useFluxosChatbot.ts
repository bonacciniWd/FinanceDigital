/**
 * @module useFluxosChatbot
 * @description React Query hooks para fluxos de chatbot WhatsApp.
 *
 * @example
 * ```tsx
 * const { data: fluxos } = useFluxos();
 * const criar = useCriarFluxo();
 * criar.mutate({ nome: 'Boas-vindas', gatilho: 'palavra_chave', palavra_chave: 'oi,olá' });
 * ```
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as fluxosChatbotService from '../services/fluxosChatbotService';
import type {
  FluxoChatbotInsert,
  FluxoChatbotUpdate,
  FluxoChatbotEtapaInsert,
  FluxoChatbotEtapaUpdate,
} from '../lib/database.types';

const FLUXOS_KEY = 'fluxos-chatbot';
const ETAPAS_KEY = 'fluxos-etapas';

// ══════════════════════════════════════════════════════════
// ── Fluxos ────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════

/** Listar todos os fluxos */
export function useFluxos() {
  return useQuery({
    queryKey: [FLUXOS_KEY],
    queryFn: fluxosChatbotService.getFluxos,
  });
}

/** Listar fluxos com etapas (JOIN) */
export function useFluxosComEtapas() {
  return useQuery({
    queryKey: [FLUXOS_KEY, 'com-etapas'],
    queryFn: fluxosChatbotService.getFluxosComEtapas,
  });
}

/** Buscar fluxo por ID com etapas */
export function useFluxo(id: string | undefined) {
  return useQuery({
    queryKey: [FLUXOS_KEY, id],
    queryFn: () => fluxosChatbotService.getFluxoById(id!),
    enabled: !!id,
  });
}

/** Buscar fluxos por departamento */
export function useFluxosByDepartamento(departamento: string | undefined) {
  return useQuery({
    queryKey: [FLUXOS_KEY, 'departamento', departamento],
    queryFn: () => fluxosChatbotService.getFluxosByDepartamento(departamento!),
    enabled: !!departamento,
  });
}

/** Buscar fluxos ativos */
export function useFluxosAtivos() {
  return useQuery({
    queryKey: [FLUXOS_KEY, 'ativos'],
    queryFn: fluxosChatbotService.getFluxosAtivos,
  });
}

/** Criar novo fluxo */
export function useCriarFluxo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (fluxo: FluxoChatbotInsert) =>
      fluxosChatbotService.criarFluxo(fluxo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [FLUXOS_KEY] });
    },
  });
}

/** Atualizar fluxo */
export function useAtualizarFluxo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: FluxoChatbotUpdate }) =>
      fluxosChatbotService.atualizarFluxo(id, updates),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [FLUXOS_KEY] });
      queryClient.invalidateQueries({ queryKey: [FLUXOS_KEY, variables.id] });
    },
  });
}

/** Deletar fluxo */
export function useDeletarFluxo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => fluxosChatbotService.deletarFluxo(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [FLUXOS_KEY] });
    },
  });
}

/** Alternar status ativo/inativo */
export function useToggleFluxoStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, statusAtual }: { id: string; statusAtual: string }) =>
      fluxosChatbotService.toggleFluxoStatus(id, statusAtual),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [FLUXOS_KEY] });
    },
  });
}

/** Duplicar fluxo com etapas */
export function useDuplicarFluxo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => fluxosChatbotService.duplicarFluxo(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [FLUXOS_KEY] });
    },
  });
}

// ══════════════════════════════════════════════════════════
// ── Etapas ────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════

/** Buscar etapas de um fluxo */
export function useEtapas(fluxoId: string | undefined) {
  return useQuery({
    queryKey: [ETAPAS_KEY, fluxoId],
    queryFn: () => fluxosChatbotService.getEtapasByFluxo(fluxoId!),
    enabled: !!fluxoId,
  });
}

/** Criar etapa */
export function useCriarEtapa() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (etapa: FluxoChatbotEtapaInsert) =>
      fluxosChatbotService.criarEtapa(etapa),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [ETAPAS_KEY, variables.fluxo_id],
      });
      queryClient.invalidateQueries({ queryKey: [FLUXOS_KEY] });
    },
  });
}

/** Atualizar etapa */
export function useAtualizarEtapa() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates, fluxoId }: {
      id: string;
      updates: FluxoChatbotEtapaUpdate;
      fluxoId: string;
    }) => fluxosChatbotService.atualizarEtapa(id, updates),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [ETAPAS_KEY, variables.fluxoId],
      });
    },
  });
}

/** Deletar etapa */
export function useDeletarEtapa() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, fluxoId }: { id: string; fluxoId: string }) =>
      fluxosChatbotService.deletarEtapa(id),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [ETAPAS_KEY, variables.fluxoId],
      });
    },
  });
}

/** Reordenar etapas */
export function useReordenarEtapas() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      etapas,
      fluxoId,
    }: {
      etapas: { id: string; ordem: number }[];
      fluxoId: string;
    }) => fluxosChatbotService.reordenarEtapas(etapas),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [ETAPAS_KEY, variables.fluxoId],
      });
    },
  });
}
