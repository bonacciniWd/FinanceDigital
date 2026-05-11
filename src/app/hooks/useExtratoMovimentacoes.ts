import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as service from '../services/extratoMovimentacoesService';

const QUERY_KEY = 'extrato_movimentacoes';

export function useExtratoMovimentacoes(
  inicio: string,
  fim: string,
  opts: { incluirSaldoDiario?: boolean; enabled?: boolean } = {}
) {
  return useQuery({
    queryKey: [QUERY_KEY, { inicio, fim, incluirSaldoDiario: !!opts.incluirSaldoDiario }],
    queryFn: () =>
      service.getExtratoMovimentacoes(inicio, fim, {
        incluirSaldoDiario: !!opts.incluirSaldoDiario,
      }),
    enabled: opts.enabled !== false && !!inicio && !!fim,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 30,
  });
}

export function useImportExtratoJson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (raw: any[]) => service.importExtratoJson(raw),
    onSuccess: () => qc.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}
