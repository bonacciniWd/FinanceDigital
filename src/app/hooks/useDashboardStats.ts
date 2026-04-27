/**
 * @module useDashboardStats
 * @description Hooks de dashboards que consomem RPCs e dados reais do Supabase.
 *
 * - useDashboardStats: KPIs consolidados via RPC `get_dashboard_stats()`
 * - useFinancialSummary: Evolução mensal receita × inadimplência via RPC `get_financial_summary()`
 *
 * Sem dados mock — tudo vem do banco.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// ── Types ────────────────────────────────────────────────

export interface DashboardStats {
  total_clientes: number;
  clientes_em_dia: number;
  clientes_vencidos: number;
  clientes_a_vencer: number;
  total_carteira: number;
  total_inadimplencia: number;
  taxa_inadimplencia: number;
  total_emprestimos_ativos: number;
}

export interface FinancialMonth {
  mes: string;
  receita: number;
  inadimplencia: number;
}

// ── Hooks ────────────────────────────────────────────────

/** KPIs consolidados via RPC get_dashboard_stats() */
export function useDashboardStats() {
  return useQuery<DashboardStats>({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_dashboard_stats');
      if (error) throw error;
      return data as DashboardStats;
    },
    // KPIs são exibidos em várias rotas; mutações invalidam essa key.
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });
}

/** Evolução mensal receita × inadimplência via RPC get_financial_summary() */
export function useFinancialSummary(meses = 6) {
  return useQuery<FinancialMonth[]>({
    queryKey: ['financial-summary', meses],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_financial_summary', {
        periodo_meses: meses,
      });
      if (error) throw error;
      return (data as FinancialMonth[]) ?? [];
    },
    // Histórico mensal varia pouco no curto prazo.
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 60,
  });
}
