/**
 * DashboardFinanceiroScreen — alinhado com web (DashboardFinanceiroPage).
 *
 * KPIs (parcelas pagas — histórico):
 *  - Receita Bruta = Σ valor.
 *  - Descontos = Σ desconto.
 *  - Receita Líquida = bruta - descontos.
 *  - Margem = (líquida / bruta) * 100.
 *
 * À Receber (filtro 7/15/30 dias / Mês / Personalizado):
 *  - Itera EMPRÉSTIMOS ativos|inadimplentes cujo `proximo_vencimento` está
 *    no período. Soma `valor_parcela` (uma parcela por empréstimo).
 */
import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  Pressable,
  TextInput,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Card } from '../components/ui/Card';
import { StatCard } from '../components/ui/StatCard';
import { ScreenLoading } from '../components/ui/State';
import { colors, fontSizes, radii, spacing } from '../theme/tokens';
import { formatCurrency, formatNumber, formatDateBR } from '../lib/format';

type ReceberFiltro = '7dias' | '15dias' | '30dias' | 'mesAtual' | 'personalizado';

function isoLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function addDays(d: Date, n: number) {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + n);
  return nd;
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function getRange(
  filtro: ReceberFiltro,
  inicioCustom: string,
  fimCustom: string,
): { inicioIso: string; fimIso: string; label: string } {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  if (filtro === 'personalizado') {
    const i = inicioCustom ? new Date(`${inicioCustom}T00:00:00`) : hoje;
    let f = fimCustom ? new Date(`${fimCustom}T00:00:00`) : i;
    if (f < i) f = i;
    return { inicioIso: isoLocal(i), fimIso: isoLocal(f), label: 'Período personalizado' };
  }
  if (filtro === 'mesAtual') {
    return {
      inicioIso: isoLocal(hoje),
      fimIso: isoLocal(endOfMonth(hoje)),
      label: 'Até o fim do mês',
    };
  }
  const days: Record<Exclude<ReceberFiltro, 'mesAtual' | 'personalizado'>, number> = {
    '7dias': 7,
    '15dias': 15,
    '30dias': 30,
  };
  const n = days[filtro];
  return {
    inicioIso: isoLocal(hoje),
    fimIso: isoLocal(addDays(hoje, n - 1)),
    label: `Próximos ${n} dias`,
  };
}

interface FinKpis {
  receitaBruta: number;
  totalDescontos: number;
  receitaLiquida: number;
  margemPct: number;
  qtdParcelasPagas: number;
  qtdEmprestimosAtivos: number;
}

async function fetchAllPagas() {
  const all: any[] = [];
  let from = 0;
  const PAGE = 1000;
  for (let i = 0; i < 100; i++) {
    const { data, error } = await supabase
      .from('parcelas')
      .select('valor, desconto')
      .eq('status', 'paga')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

async function fetchKpis(): Promise<FinKpis> {
  const [pagas, ativosRes] = await Promise.all([
    fetchAllPagas(),
    supabase
      .from('emprestimos')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'ativo'),
  ]);

  const receitaBruta = pagas.reduce((s, p) => s + Number(p.valor || 0), 0);
  const totalDescontos = pagas.reduce((s, p) => s + Number(p.desconto || 0), 0);
  const receitaLiquida = receitaBruta - totalDescontos;
  const margemPct = receitaBruta > 0 ? (receitaLiquida / receitaBruta) * 100 : 0;

  return {
    receitaBruta,
    totalDescontos,
    receitaLiquida,
    margemPct,
    qtdParcelasPagas: pagas.length,
    qtdEmprestimosAtivos: ativosRes.count ?? 0,
  };
}

interface AReceber {
  qtdEmprestimos: number;
  valor: number;
}

async function fetchAReceber(range: {
  inicioIso: string;
  fimIso: string;
}): Promise<AReceber> {
  const { data, error } = await supabase
    .from('emprestimos')
    .select('id, valor_parcela, proximo_vencimento, status')
    .in('status', ['ativo', 'inadimplente'])
    .not('proximo_vencimento', 'is', null)
    .gte('proximo_vencimento', range.inicioIso)
    .lte('proximo_vencimento', range.fimIso);

  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const valor = rows.reduce((s, e: any) => s + Number(e.valor_parcela || 0), 0);
  return { qtdEmprestimos: rows.length, valor };
}

const FILTROS: { key: ReceberFiltro; label: string }[] = [
  { key: '7dias', label: '7 dias' },
  { key: '15dias', label: '15 dias' },
  { key: '30dias', label: '30 dias' },
  { key: 'mesAtual', label: 'Mês' },
  { key: 'personalizado', label: 'Custom' },
];

export function DashboardFinanceiroScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [filtro, setFiltro] = useState<ReceberFiltro>('7dias');
  const [inicioCustom, setInicioCustom] = useState(isoLocal(new Date()));
  const [fimCustom, setFimCustom] = useState(isoLocal(addDays(new Date(), 6)));

  const range = useMemo(
    () => getRange(filtro, inicioCustom, fimCustom),
    [filtro, inicioCustom, fimCustom],
  );

  const kpisQ = useQuery({
    queryKey: ['dash-fin-kpis-mobile'],
    queryFn: fetchKpis,
    staleTime: 60_000,
  });

  const receberQ = useQuery({
    queryKey: ['dash-fin-areceber-mobile', range.inicioIso, range.fimIso],
    queryFn: () => fetchAReceber(range),
    staleTime: 60_000,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([kpisQ.refetch(), receberQ.refetch()]);
    } finally {
      setRefreshing(false);
    }
  }, [kpisQ, receberQ]);

  if (kpisQ.isLoading && !kpisQ.data) return <ScreenLoading />;

  const kpis = kpisQ.data;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      <Text style={styles.h1}>Dashboard Financeiro</Text>
      <Text style={styles.subtitle}>Visão detalhada da saúde financeira da operação</Text>

      <View style={styles.row}>
        <StatCard
          label="Receita Bruta"
          value={formatCurrency(kpis?.receitaBruta ?? 0)}
          tone="success"
          hint={`${formatNumber(kpis?.qtdParcelasPagas ?? 0)} parcelas pagas`}
        />
        <StatCard
          label="Descontos"
          value={formatCurrency(kpis?.totalDescontos ?? 0)}
          tone="danger"
          hint="concedidos em pagamentos"
        />
      </View>

      <View style={styles.row}>
        <StatCard
          label="Receita Líquida"
          value={formatCurrency(kpis?.receitaLiquida ?? 0)}
          hint="receita − descontos"
        />
        <StatCard
          label="Margem"
          value={`${(kpis?.margemPct ?? 0).toFixed(1)}%`}
          hint={`${formatNumber(kpis?.qtdEmprestimosAtivos ?? 0)} empréstimos ativos`}
        />
      </View>

      <Text style={styles.section}>À Receber</Text>
      <Text style={styles.sectionHint}>
        Empréstimos com próxima parcela dentro do período selecionado.
      </Text>

      <View style={styles.chips}>
        {FILTROS.map((f) => (
          <Pressable
            key={f.key}
            onPress={() => setFiltro(f.key)}
            style={[styles.chip, filtro === f.key && styles.chipActive]}
          >
            <Text style={[styles.chipText, filtro === f.key && styles.chipTextActive]}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {filtro === 'personalizado' && (
        <Card style={styles.customCard}>
          <View style={styles.customRow}>
            <View style={styles.customField}>
              <Text style={styles.customLabel}>Início (YYYY-MM-DD)</Text>
              <TextInput
                value={inicioCustom}
                onChangeText={setInicioCustom}
                placeholder="2026-05-06"
                placeholderTextColor={colors.textDim}
                style={styles.customInput}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <View style={styles.customField}>
              <Text style={styles.customLabel}>Fim (YYYY-MM-DD)</Text>
              <TextInput
                value={fimCustom}
                onChangeText={setFimCustom}
                placeholder="2026-05-12"
                placeholderTextColor={colors.textDim}
                style={styles.customInput}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>
        </Card>
      )}

      <Card style={styles.bigCard}>
        <Text style={styles.bigLabel}>{range.label}</Text>
        <Text style={styles.periodoTexto}>
          {formatDateBR(range.inicioIso)} até {formatDateBR(range.fimIso)}
        </Text>
        {receberQ.isLoading && !receberQ.data ? (
          <Text style={styles.bigHint}>carregando…</Text>
        ) : (
          <View style={styles.receberGrid}>
            <View style={styles.receberCol}>
              <Text style={styles.receberColLabel}>EMPRÉSTIMOS</Text>
              <Text style={styles.receberColValue}>
                {formatNumber(receberQ.data?.qtdEmprestimos ?? 0)}
              </Text>
              <Text style={styles.bigHint}>com parcela prevista</Text>
            </View>
            <View style={styles.receberCol}>
              <Text style={styles.receberColLabel}>VALOR PREVISTO</Text>
              <Text style={[styles.receberColValue, { color: colors.success }]}>
                {formatCurrency(receberQ.data?.valor ?? 0)}
              </Text>
              <Text style={styles.bigHint}>
                {formatNumber(receberQ.data?.qtdEmprestimos ?? 0)} parcela(s)
              </Text>
            </View>
          </View>
        )}
      </Card>

      <Text style={styles.foot}>
        Cálculo idêntico ao web: empréstimos ativos/inadimplentes cuja
        proximo_vencimento cai no período. Soma de valor_parcela (uma parcela
        por empréstimo).
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  h1: { color: colors.text, fontSize: fontSizes.xxl, fontWeight: '700' },
  subtitle: { color: colors.textMuted, fontSize: fontSizes.sm, marginTop: -spacing.sm },
  section: { color: colors.text, fontSize: fontSizes.lg, fontWeight: '700', marginTop: spacing.sm },
  sectionHint: { color: colors.textMuted, fontSize: fontSizes.xs, marginTop: -spacing.sm },
  row: { flexDirection: 'row', gap: spacing.md },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textMuted, fontSize: fontSizes.sm, fontWeight: '600' },
  chipTextActive: { color: colors.primaryFg },

  customCard: { padding: spacing.md, gap: spacing.sm },
  customRow: { flexDirection: 'row', gap: spacing.md },
  customField: { flex: 1, gap: 4 },
  customLabel: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  customInput: {
    backgroundColor: colors.bg,
    color: colors.text,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSizes.md,
  },

  bigCard: { padding: spacing.lg, gap: 6 },
  bigLabel: { color: colors.textMuted, fontSize: fontSizes.xs, fontWeight: '600', textTransform: 'uppercase' },
  bigHint: { color: colors.textMuted, fontSize: fontSizes.xs, marginTop: 2 },
  periodoTexto: { color: colors.text, fontSize: fontSizes.md, fontWeight: '600' },

  receberGrid: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  receberCol: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  receberColLabel: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  receberColValue: { color: colors.text, fontSize: fontSizes.xxl, fontWeight: '800' },

  foot: {
    color: colors.textDim,
    fontSize: fontSizes.xs,
    lineHeight: 18,
    marginTop: spacing.md,
    fontStyle: 'italic',
  },
});
