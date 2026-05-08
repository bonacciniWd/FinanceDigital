/**
 * RelatoriosScreen — visão consolidada com KPIs dos principais relatórios.
 *
 * Cada cartão exibe o resumo de um relatório em tempo real:
 *   • Fluxo de caixa (entradas/saídas do mês)
 *   • Inadimplência (parcelas vencidas)
 *   • Performance da rede (clientes ativos com indicações)
 *   • Comissões a pagar (bônus pendente acumulado)
 *   • Clientes inativos (sem empréstimos abertos há 30+ dias)
 *   • Análise de crédito (aprovações/rejeições)
 *
 * Para análise detalhada e exportação (CSV), use o app web.
 */
import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { Card } from '../components/ui/Card';
import { ScreenLoading, EmptyState } from '../components/ui/State';
import { colors, fontSizes, spacing } from '../theme/tokens';
import { formatCurrency, formatNumber } from '../lib/format';
import { hojeIso, inicioMesIso } from '../lib/loanFilters';

interface RelatorioKPI {
  label: string;
  value: string;
  tone?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
}
interface RelatorioPreview {
  id: string;
  titulo: string;
  descricao: string;
  icon: keyof typeof Ionicons.glyphMap;
  kpis: RelatorioKPI[];
}

interface SnapshotData {
  // Fluxo
  recebidoMes: number;
  recebimentosCount: number;
  // Inadimplência
  parcelasVencidas: number;
  valorVencido: number;
  // Rede
  clientesAtivos: number;
  comIndicacoes: number;
  bonusPendente: number;
  // Inativos
  clientesInativos30d: number;
  // Análise
  analisesPend: number;
  analisesAprov: number;
  analisesRej: number;
}

async function fetchSnapshot(): Promise<SnapshotData> {
  const inicio = inicioMesIso();
  const hoje = hojeIso();

  const [
    { data: parcelasMes, error: ePm },
    { data: parcelasVenc, error: ePv },
    { data: clientes, error: eCl },
    { data: clientesAtivos, error: eCa },
    { data: analises, error: eAn },
  ] = await Promise.all([
    supabase
      .from('parcelas')
      .select('valor_pago, data_pagamento')
      .gte('data_pagamento', inicio)
      .eq('status', 'pago'),
    supabase
      .from('parcelas')
      .select('valor_original, data_vencimento, status')
      .lt('data_vencimento', hoje)
      .neq('status', 'pago'),
    supabase
      .from('clientes')
      .select('id, status, indicado_por, bonus_acumulado, ultimo_emprestimo_em'),
    supabase
      .from('clientes')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'ativo'),
    supabase.from('analises_credito').select('status'),
  ]);

  if (ePm) throw new Error(ePm.message);
  if (ePv) throw new Error(ePv.message);
  if (eCl) throw new Error(eCl.message);

  const recebidoMes = (parcelasMes ?? []).reduce(
    (s: number, p: any) => s + Number(p.valor_pago || 0),
    0
  );
  const valorVencido = (parcelasVenc ?? []).reduce(
    (s: number, p: any) => s + Number(p.valor_original || 0),
    0
  );

  const clientesArr = (clientes ?? []) as any[];
  const indicaSet = new Set<string>();
  let bonusPend = 0;
  for (const c of clientesArr) {
    if (c.indicado_por) indicaSet.add(c.indicado_por);
    bonusPend += Number(c.bonus_acumulado || 0);
  }

  const trintaDias = new Date();
  trintaDias.setDate(trintaDias.getDate() - 30);
  const cut = trintaDias.toISOString().slice(0, 10);
  const inativos = clientesArr.filter(
    (c) => !c.ultimo_emprestimo_em || (c.ultimo_emprestimo_em as string).slice(0, 10) < cut
  ).length;

  const analisesArr = eAn ? [] : ((analises ?? []) as { status: string }[]);
  let aPend = 0, aAp = 0, aRj = 0;
  for (const a of analisesArr) {
    if (a.status === 'pendente') aPend++;
    else if (a.status === 'aprovado') aAp++;
    else if (a.status === 'rejeitado') aRj++;
  }

  return {
    recebidoMes,
    recebimentosCount: (parcelasMes ?? []).length,
    parcelasVencidas: (parcelasVenc ?? []).length,
    valorVencido,
    clientesAtivos: (clientesAtivos as any)?.count ?? clientesArr.filter((c) => c.status === 'ativo').length,
    comIndicacoes: indicaSet.size,
    bonusPendente: bonusPend,
    clientesInativos30d: inativos,
    analisesPend: aPend,
    analisesAprov: aAp,
    analisesRej: aRj,
  };
}

export function RelatoriosScreen() {
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['relatorios-mobile'],
    queryFn: fetchSnapshot,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refetch(); } finally { setRefreshing(false); }
  }, [refetch]);

  const relatorios: RelatorioPreview[] = data
    ? [
        {
          id: 'fluxo-caixa',
          titulo: 'Fluxo de Caixa Mensal',
          descricao: 'Recebimentos confirmados no mês',
          icon: 'cash-outline',
          kpis: [
            { label: 'Recebido', value: formatCurrency(data.recebidoMes), tone: 'success' },
            { label: 'Pagamentos', value: formatNumber(data.recebimentosCount) },
          ],
        },
        {
          id: 'inadimplencia',
          titulo: 'Inadimplência',
          descricao: 'Parcelas vencidas em aberto',
          icon: 'warning-outline',
          kpis: [
            { label: 'Vencidas', value: formatNumber(data.parcelasVencidas), tone: 'danger' },
            { label: 'Valor', value: formatCurrency(data.valorVencido), tone: 'danger' },
          ],
        },
        {
          id: 'performance-rede',
          titulo: 'Performance da Rede',
          descricao: 'Clientes ativos e indicadores',
          icon: 'git-network-outline',
          kpis: [
            { label: 'Ativos', value: formatNumber(data.clientesAtivos), tone: 'success' },
            { label: 'Indicadores', value: formatNumber(data.comIndicacoes), tone: 'info' },
          ],
        },
        {
          id: 'comissoes',
          titulo: 'Comissões a Pagar',
          descricao: 'Bônus acumulado em aberto',
          icon: 'gift-outline',
          kpis: [
            { label: 'Bônus pendente', value: formatCurrency(data.bonusPendente), tone: 'warning' },
          ],
        },
        {
          id: 'clientes-inativos',
          titulo: 'Clientes Inativos',
          descricao: 'Sem novos empréstimos há 30+ dias',
          icon: 'people-outline',
          kpis: [
            { label: 'Inativos', value: formatNumber(data.clientesInativos30d), tone: 'neutral' },
          ],
        },
        {
          id: 'analise-credito',
          titulo: 'Análise de Crédito',
          descricao: 'Aprovações, rejeições e pendências',
          icon: 'document-text-outline',
          kpis: [
            { label: 'Aprovadas', value: formatNumber(data.analisesAprov), tone: 'success' },
            { label: 'Rejeitadas', value: formatNumber(data.analisesRej), tone: 'danger' },
            { label: 'Pendentes',  value: formatNumber(data.analisesPend), tone: 'warning' },
          ],
        },
      ]
    : [];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.h1}>Relatórios</Text>
        <Text style={styles.subtitle}>Resumo executivo · use o web para CSV</Text>
      </View>

      <FlatList
        data={relatorios}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <RelatorioCard rel={item} />}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          isLoading ? <ScreenLoading /> : <EmptyState title="Sem dados" hint="Não foi possível carregar os relatórios." />
        }
      />
    </View>
  );
}

function toneColor(tone?: RelatorioKPI['tone']): string {
  switch (tone) {
    case 'success': return colors.success;
    case 'warning': return colors.warning;
    case 'danger':  return colors.danger;
    case 'info':    return colors.info;
    default:        return colors.text;
  }
}

function RelatorioCard({ rel }: { rel: RelatorioPreview }) {
  return (
    <Card style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.iconWrap}>
          <Ionicons name={rel.icon} size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{rel.titulo}</Text>
          <Text style={styles.cardDesc}>{rel.descricao}</Text>
        </View>
      </View>
      <View style={styles.kpisRow}>
        {rel.kpis.map((k) => (
          <View key={k.label} style={styles.kpi}>
            <Text style={styles.kpiLabel}>{k.label}</Text>
            <Text style={[styles.kpiValue, { color: toneColor(k.tone) }]} numberOfLines={1}>
              {k.value}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm, gap: 4 },
  h1: { color: colors.text, fontSize: fontSizes.xxl, fontWeight: '700' },
  subtitle: { color: colors.textMuted, fontSize: fontSizes.sm },

  list: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl },

  card: { gap: spacing.sm, padding: spacing.md },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.bgElevated,
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { color: colors.text, fontSize: fontSizes.md, fontWeight: '700' },
  cardDesc: { color: colors.textMuted, fontSize: fontSizes.xs },

  kpisRow: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' },
  kpi: { flex: 1, minWidth: 100, gap: 2 },
  kpiLabel: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  kpiValue: { fontSize: fontSizes.lg, fontWeight: '700' },
});
