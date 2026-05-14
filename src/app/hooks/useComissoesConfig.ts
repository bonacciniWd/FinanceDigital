/**
 * Hooks para a nova arquitetura de comissões (`comissoes_config`).
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as service from '../services/comissoesConfigService';
import type { ComissaoConfigInput } from '../lib/comissoes-config';

const KEY = 'comissoes_config';

export function useComissoesConfigs() {
  return useQuery({
    queryKey: [KEY],
    queryFn: () => service.listComissoesConfigs(),
    staleTime: 60_000,
  });
}

export function useUpsertComissaoConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ComissaoConfigInput & { id?: string }) => service.upsertComissaoConfig(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteComissaoConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => service.deleteComissaoConfig(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
