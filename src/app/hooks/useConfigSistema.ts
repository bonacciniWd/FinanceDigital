/**
 * @module useConfigSistema
 * @description React Query hooks para configurações globais do sistema.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

const QUERY_KEY = 'config-sistema';

export interface ConfigSistema {
  mensagens_automaticas_ativas: boolean;
  cobv_auto_ativa: boolean;
  multa_percentual: number;
  juros_percentual: number;
  [key: string]: unknown;
}

async function getConfig(): Promise<ConfigSistema> {
  const { data, error } = await supabase
    .from('configuracoes_sistema')
    .select('chave, valor');

  if (error) throw new Error(error.message);

  const config: Record<string, unknown> = {};
  for (const row of data ?? []) {
    config[row.chave] = row.valor;
  }

  return {
    mensagens_automaticas_ativas: config.mensagens_automaticas_ativas === true,
    cobv_auto_ativa: config.cobv_auto_ativa === true,
    multa_percentual: typeof config.multa_percentual === 'number' ? config.multa_percentual : 2,
    juros_percentual: typeof config.juros_percentual === 'number' ? config.juros_percentual : 1,
    ...config,
  };
}

async function updateConfig(chave: string, valor: unknown): Promise<void> {
  const { error } = await supabase
    .from('configuracoes_sistema')
    .upsert({ chave, valor: valor as any, updated_at: new Date().toISOString() }, { onConflict: 'chave' });

  if (error) throw new Error(error.message);
}

/** Buscar todas as configurações */
export function useConfigSistema() {
  return useQuery({
    queryKey: [QUERY_KEY],
    queryFn: getConfig,
    staleTime: 60000,
  });
}

/** Atualizar uma configuração */
export function useUpdateConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chave, valor }: { chave: string; valor: unknown }) =>
      updateConfig(chave, valor),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}
