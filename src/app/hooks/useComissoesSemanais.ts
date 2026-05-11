import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as service from '../services/comissoesSemanaisService';

const KEYS = {
  configs: 'comissoes_semanais_configs',
  destinatarios: 'relatorio_semanal_destinatarios',
  envios: 'relatorio_semanal_envios',
};

// ── Configurações de comissões semanais ──
export function useComissoesSemanaisConfigs() {
  return useQuery({
    queryKey: [KEYS.configs],
    queryFn: () => service.listComissoesConfigs(),
    staleTime: 60_000,
  });
}

export function useUpsertComissaoConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: service.UpsertComissaoConfigInput) => service.upsertComissaoConfig(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEYS.configs] }),
  });
}

export function useDeleteComissaoConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => service.deleteComissaoConfig(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEYS.configs] }),
  });
}

// ── Destinatários do relatório semanal ──
export function useRelatorioDestinatarios() {
  return useQuery({
    queryKey: [KEYS.destinatarios],
    queryFn: () => service.listRelatorioDestinatarios(),
    staleTime: 60_000,
  });
}

export function useUpsertRelatorioDestinatario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof service.upsertRelatorioDestinatario>[0]) =>
      service.upsertRelatorioDestinatario(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEYS.destinatarios] }),
  });
}

export function useDeleteRelatorioDestinatario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => service.deleteRelatorioDestinatario(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEYS.destinatarios] }),
  });
}

// ── Disparo manual ──
export function useEnviarRelatorioSemanal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: service.EnviarRelatorioSemanalInput) =>
      service.enviarRelatorioSemanalAgora(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEYS.envios] }),
  });
}

export function useRelatorioEnvios(limit = 20) {
  return useQuery({
    queryKey: [KEYS.envios, { limit }],
    queryFn: () => service.listRelatorioEnvios(limit),
    staleTime: 30_000,
  });
}
