/**
 * DashboardScreen — KPIs principais (visão geral admin).
 *
 * Exclui empréstimos/parcelas congelados (>365d ou flag congelada=true).
 */
import { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Card } from '../components/ui/Card';
import { StatCard } from '../components/ui/StatCard';
import { ScreenLoading } from '../components/ui/State';
import { colors, fontSizes, spacing } from '../theme/tokens';
import { formatCurrency, formatNumber } from '../lib/format';
import { inicioMesIso, limiteCongeladoIso } from '../lib/loanFilters';

interface DashStats {
  totalClientes: number;
  emprestimosAtivos: number;
  valorCarteira: number;
  parcelasVencidas: number;
  valorRecebidoMes: number;
  inadimplentes: number;
}

async function fetchStats(): Promise<DashStats> {
  const inicioMes = inicioMesIso();
  const limite365 = limiteCongeladoIso();

  const [
    clientesRes,
    ativosRes,
    inadimpRes,
    vencidasRes,
    recebidasMesRes,
  ] = await Promise.all([
    supabase.from('clientes').select('id', { count: 'exact', head: true }),
    supabase
      .from('emprestimos')
      .select('id, valor', { count: 'exact' })
      .eq('status', 'ativo'),
    supabase
      .from('emprestimos')
      .select('id, valor', { count: 'exact' })
      .eq('status', 'inadimplente'),
    supabase
      .from('parcelas')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'vencida')
      .eq('congelada', false)
      .gte('data_vencimento', limite365),
    supabase
      .from('parcelas')
      .select('valor')
      .eq('status', 'paga')
      .gte('data_pagamento', inicioMes),
  ]);

  const valorCarteira =
    (ativosRes.data ?? []).reduce((s, e: any) => s + Number(e.valor || 0), 0) +
    (inadimpRes.data ?? []).reduce((s, e: any) => s + Number(e.valor || 0), 0);

  const valorRecebidoMes = (recebidasMesRes.data ?? []).reduce(
    (s, p: any) => s + Number(p.valor || 0),
    0,
  );

  return {
    totalClientes: clientesRes.count ?? 0,
    emprestimosAtivos: ativosRes.count ?? 0,
    valorCarteira,
    parcelasVencidas: vencidasRes.count ?? 0,
    valorRecebidoMes,
    inadimplentes: inadimpRes.count ?? 0,
  };
}

export function DashboardScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['dashboard-mobile'],
    queryFn: fetchStats,
    staleTime: 60_000,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refetch(); } finally { setRefreshing(false); }
  }, [refetch]);

  if (isLoading && !data) return <ScreenLoading />;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      <Text style={styles.h1}>Visão Geral</Text>
      <Text style={styles.subtitle}>Empréstimos congelados (&gt;365d) excluídos.</Text>

      <View style={styles.row}>
        <StatCard label="Clientes" value={formatNumber(data?.totalClientes ?? 0)} />
        <StatCard label="Empr. Ativos" value={formatNumber(data?.emprestimosAtivos ?? 0)} />
      </View>

      <View style={styles.row}>
        <StatCard label="Carteira Total" value={formatCurrency(data?.valorCarteira ?? 0)} />
        <StatCard
          label="Recebido no Mês"
          value={formatCurrency(data?.valorRecebidoMes ?? 0)}
          tone="success"
        />
      </View>

      <View style={styles.row}>
        <StatCard
          label="Parcelas Vencidas"
          value={formatNumber(data?.parcelasVencidas ?? 0)}
          tone="danger"
        />
        <StatCard
          label="Inadimplentes"
          value={formatNumber(data?.inadimplentes ?? 0)}
          tone="warning"
        />
      </View>

      <Card style={styles.note}>
        <Text style={styles.noteTitle}>Atalhos</Text>
        <Text style={styles.noteText}>
          Use a aba <Text style={styles.bold}>Mais</Text> para acessar Dashboards
          Financeiro, Comercial e Cobrança, Análise de Crédito, Bônus e demais módulos.
        </Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  h1: { color: colors.text, fontSize: fontSizes.xxl, fontWeight: '700' },
  subtitle: { color: colors.textMuted, fontSize: fontSizes.xs, marginTop: -spacing.sm },
  row: { flexDirection: 'row', gap: spacing.md },
  note: { marginTop: spacing.md, gap: 4 },
  noteTitle: { color: colors.text, fontSize: fontSizes.md, fontWeight: '600' },
  noteText: { color: colors.textMuted, fontSize: fontSizes.sm, lineHeight: 20 },
  bold: { color: colors.text, fontWeight: '700' },
});
