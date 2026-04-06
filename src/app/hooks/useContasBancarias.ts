/**
 * @module useContasBancarias
 * @description React Query hook para contas bancárias configuráveis.
 *
 * Retorna contas ativas ordenadas por prioridade.
 * Inclui contas manuais (PRINCIPAL, CAIXA) e vinculadas a gateways (Woovi, EFI).
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { ContaBancaria } from '../lib/view-types';

export function useContasBancarias() {
  return useQuery({
    queryKey: ['contas-bancarias'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contas_bancarias')
        .select('id, nome, tipo, gateway_id, ativo, padrao, ordem')
        .eq('ativo', true)
        .order('ordem');
      if (error) throw error;
      return (data ?? []).map((r: any): ContaBancaria => ({
        id: r.id,
        nome: r.nome,
        tipo: r.tipo,
        gatewayId: r.gateway_id,
        ativo: r.ativo,
        padrao: r.padrao,
        ordem: r.ordem,
      }));
    },
    staleTime: 5 * 60 * 1000, // 5 min — raramente muda
  });
}
