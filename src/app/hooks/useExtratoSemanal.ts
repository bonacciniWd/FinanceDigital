import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as service from '../services/extratoSemanalService';

const KEYS = {
  historico: 'extratos_semanais_historico',
  destinatarios: 'extratos_semanais_destinatarios',
  config: 'extratos_semanais_config',
};

// ── Histórico ────────────────────────────────────────────────────────────
export function useExtratosSemanais(limit = 30) {
  return useQuery({
    queryKey: [KEYS.historico, { limit }],
    queryFn: () => service.listExtratosSemanais(limit),
    staleTime: 30_000,
  });
}

// ── Destinatários ────────────────────────────────────────────────────────
export function useDestinatariosExtrato() {
  return useQuery({
    queryKey: [KEYS.destinatarios],
    queryFn: () => service.listDestinatarios(),
    staleTime: 60_000,
  });
}

export function useUpsertDestinatario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: service.UpsertDestinatarioInput) => service.upsertDestinatario(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEYS.destinatarios] }),
  });
}

export function useDeleteDestinatario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => service.deleteDestinatario(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEYS.destinatarios] }),
  });
}

// ── Config ───────────────────────────────────────────────────────────────
export function useExtratoSemanalConfig() {
  return useQuery({
    queryKey: [KEYS.config],
    queryFn: () => service.getExtratoSemanalConfig(),
    staleTime: 60_000,
  });
}

export function useUpdateExtratoSemanalConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<service.ExtratoSemanalConfig>) =>
      service.updateExtratoSemanalConfig(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEYS.config] }),
  });
}

// ── Disparo manual ───────────────────────────────────────────────────────
export function useRunExtratoSemanal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (opts: { forcar?: boolean; dataInicio?: string; dataFim?: string } = {}) =>
      service.runExtratoSemanalAgora(opts),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEYS.historico] });
      qc.invalidateQueries({ queryKey: ['extrato_movimentacoes'] });
    },
  });
}
