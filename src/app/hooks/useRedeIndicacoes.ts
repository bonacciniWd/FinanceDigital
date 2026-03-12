/**
 * @module useRedeIndicacoes
 * @description React Query hooks para a Rede de Indicações.
 *
 * A rede é derivada diretamente de `clientes.indicado_por`.
 * Hooks de query para membros e bloqueios, mutations para
 * bloquear/desbloquear redes e criar indicações (novos clientes).
 *
 * @key 'rede-indicacoes' — membros da rede
 * @key 'bloqueios-rede' — bloqueios
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getMembrosRede,
  getMembrosByRede,
  getBloqueiosRede,
  getBloqueiosAtivos,
  getRedesUnicas,
  createIndicacao,
  vincularIndicacao,
  desbloquearRede,
  bloquearRede,
} from '../services/redeIndicacoesService';
import type { CriarIndicacaoPayload } from '../services/redeIndicacoesService';
import { dbRedeIndicacaoToView, dbBloqueioRedeToView } from '../lib/adapters';

// ── Queries ────────────────────────────────────────────────

/** Todos os membros de todas as redes (ou filtrado por redeId) */
export function useMembrosRede(redeId?: string) {
  return useQuery({
    queryKey: ['rede-indicacoes', redeId ?? 'all'],
    queryFn: async () => {
      const data = await getMembrosRede(redeId);
      return data.map(dbRedeIndicacaoToView);
    },
  });
}

/** Membros de uma rede específica */
export function useMembrosByRede(redeId: string) {
  return useQuery({
    queryKey: ['rede-indicacoes', redeId],
    queryFn: async () => {
      const data = await getMembrosByRede(redeId);
      return data.map(dbRedeIndicacaoToView);
    },
    enabled: !!redeId,
  });
}

/** IDs únicos das redes */
export function useRedesUnicas() {
  return useQuery({
    queryKey: ['rede-indicacoes', 'redes-unicas'],
    queryFn: getRedesUnicas,
  });
}

/** Todos os bloqueios (opcionalmente por rede) */
export function useBloqueiosRede(redeId?: string) {
  return useQuery({
    queryKey: ['bloqueios-rede', redeId ?? 'all'],
    queryFn: async () => {
      const data = await getBloqueiosRede(redeId);
      return data.map(dbBloqueioRedeToView);
    },
  });
}

/** Bloqueios ativos */
export function useBloqueiosAtivos() {
  return useQuery({
    queryKey: ['bloqueios-rede', 'ativos'],
    queryFn: async () => {
      const data = await getBloqueiosAtivos();
      return data.map(dbBloqueioRedeToView);
    },
  });
}

// ── Mutations ──────────────────────────────────────────────

/** Criar novo cliente vinculado a um indicador (cria a relação de indicação) */
export function useCreateIndicacao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CriarIndicacaoPayload) => createIndicacao(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rede-indicacoes'] });
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
    },
  });
}

/** Vincular um cliente existente a um indicador */
export function useVincularIndicacao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ clienteId, indicadoPor }: { clienteId: string; indicadoPor: string }) =>
      vincularIndicacao(clienteId, indicadoPor),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rede-indicacoes'] });
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
    },
  });
}

/** Desbloquear uma rede */
export function useDesbloquearRede() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ bloqueioId, redeId }: { bloqueioId: string; redeId: string }) =>
      desbloquearRede(bloqueioId, redeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rede-indicacoes'] });
      queryClient.invalidateQueries({ queryKey: ['bloqueios-rede'] });
    },
  });
}

/** Bloquear toda uma rede */
export function useBloquearRede() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ redeId, causadoPor, motivo }: { redeId: string; causadoPor: string; motivo: string }) =>
      bloquearRede(redeId, causadoPor, motivo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rede-indicacoes'] });
      queryClient.invalidateQueries({ queryKey: ['bloqueios-rede'] });
    },
  });
}
