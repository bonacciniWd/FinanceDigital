/**
 * @module useConfigSistema
 * @description React Query hooks para configurações globais do sistema.
 */
import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import {
  setJurosConfig,
  JUROS_FIXO_DIA_DEFAULT,
  JUROS_PERC_DIA_DEFAULT,
  JUROS_LIMIAR_DEFAULT,
  JUROS_DIAS_MAX_DEFAULT,
} from '../lib/juros';

const QUERY_KEY = 'config-sistema';

export interface ConfigSistema {
  mensagens_automaticas_ativas: boolean;
  cobv_auto_ativa: boolean;
  notificacoes_aprovacao_ativas: boolean;
  controle_desembolso_ativo: boolean;
  desembolso_automatico_ativo: boolean;
  multa_percentual: number;
  juros_percentual: number;
  juros_fixo_dia: number;
  juros_perc_dia: number;
  juros_limiar: number;
  juros_dias_max: number;
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
    notificacoes_aprovacao_ativas: config.notificacoes_aprovacao_ativas !== false,
    controle_desembolso_ativo: config.controle_desembolso_ativo !== false,
    desembolso_automatico_ativo: config.desembolso_automatico_ativo === true,
    multa_percentual: typeof config.multa_percentual === 'number' ? config.multa_percentual : 2,
    juros_percentual: typeof config.juros_percentual === 'number' ? config.juros_percentual : 1,
    juros_fixo_dia: typeof config.juros_fixo_dia === 'number' ? config.juros_fixo_dia : JUROS_FIXO_DIA_DEFAULT,
    juros_perc_dia: typeof config.juros_perc_dia === 'number' ? config.juros_perc_dia : JUROS_PERC_DIA_DEFAULT,
    juros_limiar: typeof config.juros_limiar === 'number' ? config.juros_limiar : JUROS_LIMIAR_DEFAULT,
    juros_dias_max: typeof config.juros_dias_max === 'number' ? config.juros_dias_max : JUROS_DIAS_MAX_DEFAULT,
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

/**
 * Sincroniza parâmetros de juros do banco com o runtime de `lib/juros.ts`.
 * Deve ser montado uma única vez perto da raiz (após QueryClientProvider).
 */
export function useSyncJurosConfig(): void {
  const { data } = useConfigSistema();
  useEffect(() => {
    if (!data) return;
    setJurosConfig({
      fixoDia: data.juros_fixo_dia,
      percDia: data.juros_perc_dia,
      limiar: data.juros_limiar,
      diasMax: data.juros_dias_max,
    });
  }, [data?.juros_fixo_dia, data?.juros_perc_dia, data?.juros_limiar, data?.juros_dias_max]);
}
