/**
 * DashboardComercialScreen — KPIs de leads, conversões e rede.
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

interface ComStats {
  totalLeads: number;
  pendentes: number;
  emAnalise: number;
  aprovadas: number;
  recusadas: number;
  taxaConversao: number;
  creditoAprovado: number;
  indicacoesAtivas: number;
}

async function fetchComStats(): Promise<ComStats> {
  const [analisesRes, redeRes] = await Promise.all([
    supabase
      .from('analises_credito')
      .select('status, valor_solicitado'),
    supabase
      .from('membros_rede')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'ativo'),
  ]);

  const analises = analisesRes.data ?? [];
  const totalLeads = analises.length;
  const pendentes = analises.filter((a: any) => a.status === 'pendente').length;
  const emAnalise = analises.filter((a: any) => a.status === 'em_analise').length;
  const aprovadas = analises.filter((a: any) => a.status === 'aprovado').length;
  const recusadas = analises.filter((a: any) => a.status === 'recusado').length;
  const taxaConversao = totalLeads > 0 ? (aprovadas / totalLeads) * 100 : 0;
  const creditoAprovado = analises
    .filter((a: any) => a.status === 'aprovado')
    .reduce((s, a: any) => s + Number(a.valor_solicitado || 0), 0);

  return {
    totalLeads,
    pendentes,
    emAnalise,
    aprovadas,
    recusadas,
    taxaConversao,
    creditoAprovado,
    indicacoesAtivas: redeRes.count ?? 0,
  };
}

export function DashboardComercialScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['dash-com-mobile'],
    queryFn: fetchComStats,
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
      <Text style={styles.section}>Funil</Text>
      <View style={styles.row}>
        <StatCard label="Total Leads" value={formatNumber(data?.totalLeads ?? 0)} />
        <StatCard
          label="Conversão"
          value={`${(data?.taxaConversao ?? 0).toFixed(1)}%`}
          tone="success"
        />
      </View>
      <View style={styles.row}>
        <StatCard label="Pendentes" value={formatNumber(data?.pendentes ?? 0)} tone="info" />
        <StatCard label="Em Análise" value={formatNumber(data?.emAnalise ?? 0)} tone="warning" />
      </View>
      <View style={styles.row}>
        <StatCard label="Aprovadas" value={formatNumber(data?.aprovadas ?? 0)} tone="success" />
        <StatCard label="Recusadas" value={formatNumber(data?.recusadas ?? 0)} tone="danger" />
      </View>

      <Text style={styles.section}>Volume</Text>
      <Card style={styles.bigCard}>
        <Text style={styles.bigLabel}>Crédito Aprovado</Text>
        <Text style={[styles.bigValue, { color: colors.success }]}>
          {formatCurrency(data?.creditoAprovado ?? 0)}
        </Text>
        <Text style={styles.bigHint}>Soma do valor solicitado em análises aprovadas</Text>
      </Card>

      <Text style={styles.section}>Rede de Indicações</Text>
      <Card style={styles.bigCard}>
        <Text style={styles.bigLabel}>Indicadores Ativos</Text>
        <Text style={styles.bigValue}>{formatNumber(data?.indicacoesAtivas ?? 0)}</Text>
        <Text style={styles.bigHint}>Membros com status = ativo</Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  section: { color: colors.text, fontSize: fontSizes.lg, fontWeight: '700', marginTop: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.md },
  bigCard: { padding: spacing.lg, gap: 4 },
  bigLabel: { color: colors.textMuted, fontSize: fontSizes.xs, fontWeight: '600', textTransform: 'uppercase' },
  bigValue: { color: colors.text, fontSize: 28, fontWeight: '800' },
  bigHint: { color: colors.textMuted, fontSize: fontSizes.xs, marginTop: 4 },
});
