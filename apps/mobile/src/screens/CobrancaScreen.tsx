/**
 * CobrancaScreen — lista de parcelas vencidas/a vencer.
 *
 * Tabs: Hoje | Vencidas (1-365d) | Próximas 30d.
 * Exclui parcelas congeladas (>365d ou flag congelada=true).
 */
import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { ScreenLoading, EmptyState } from '../components/ui/State';
import { colors, fontSizes, radii, spacing } from '../theme/tokens';
import { formatCurrency, formatDateBR, diasAteVencimento } from '../lib/format';
import { hojeIso, futuroIso, limiteCongeladoIso } from '../lib/loanFilters';

type Filtro = 'hoje' | 'vencidas' | 'proximas';

interface ParcelaRow {
  id: string;
  numero: number;
  valor: number;
  data_vencimento: string;
  status: 'pendente' | 'paga' | 'vencida' | 'cancelada';
  cliente_id: string;
  emprestimo_id: string;
  congelada: boolean | null;
  clientes?: { nome: string; telefone: string | null } | null;
}

async function fetchParcelas(filtro: Filtro): Promise<ParcelaRow[]> {
  const hoje = hojeIso();
  let query = supabase
    .from('parcelas')
    .select('id, numero, valor, data_vencimento, status, cliente_id, emprestimo_id, congelada, clientes(nome, telefone)')
    .eq('congelada', false)
    .order('data_vencimento', { ascending: true })
    .limit(200);

  if (filtro === 'hoje') {
    query = query
      .eq('data_vencimento', hoje)
      .in('status', ['pendente', 'vencida']);
  } else if (filtro === 'vencidas') {
    query = query
      .eq('status', 'vencida')
      .gte('data_vencimento', limiteCongeladoIso());
  } else {
    query = query
      .gte('data_vencimento', hoje)
      .lte('data_vencimento', futuroIso(30))
      .eq('status', 'pendente');
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ParcelaRow[];
}

export function CobrancaScreen() {
  const [filtro, setFiltro] = useState<Filtro>('vencidas');
  const [refreshing, setRefreshing] = useState(false);

  const { data: parcelas = [], isLoading, refetch } = useQuery({
    queryKey: ['cobranca-mobile', filtro],
    queryFn: () => fetchParcelas(filtro),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refetch(); } finally { setRefreshing(false); }
  }, [refetch]);

  const total = useMemo(
    () => parcelas.reduce((s, p) => s + Number(p.valor || 0), 0),
    [parcelas]
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.h1}>Cobrança</Text>
        <Text style={styles.subtitle}>
          {parcelas.length} parcela(s) · {formatCurrency(total)}
        </Text>
      </View>

      <View style={styles.tabs}>
        {(['hoje', 'vencidas', 'proximas'] as const).map((opt) => (
          <Pressable
            key={opt}
            onPress={() => setFiltro(opt)}
            style={[styles.tab, filtro === opt && styles.tabActive]}
          >
            <Text style={[styles.tabText, filtro === opt && styles.tabTextActive]}>
              {opt === 'hoje' ? 'Hoje' : opt === 'vencidas' ? 'Vencidas' : 'Próx. 30d'}
            </Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <ScreenLoading />
      ) : parcelas.length === 0 ? (
        <EmptyState title="Nada por aqui" hint="Sem parcelas neste filtro." />
      ) : (
        <FlatList
          data={parcelas}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <ParcelaItem item={item} />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        />
      )}
    </View>
  );
}

function ParcelaItem({ item }: { item: ParcelaRow }) {
  const dias = diasAteVencimento(item.data_vencimento);
  const isVencida = item.status === 'vencida' || dias < 0;
  const isHoje = dias === 0 && item.status !== 'paga';

  let tone: 'success' | 'warning' | 'danger' | 'neutral' | 'info' = 'neutral';
  let label = 'Pendente';
  if (item.status === 'paga') { tone = 'success'; label = 'Paga'; }
  else if (isVencida) { tone = 'danger'; label = `${Math.abs(dias)}d em atraso`; }
  else if (isHoje) { tone = 'warning'; label = 'Vence hoje'; }
  else if (item.status === 'pendente') { tone = 'info'; label = `Em ${dias}d`; }

  return (
    <Card style={styles.item}>
      <View style={styles.itemHeader}>
        <Text style={styles.itemNome} numberOfLines={1}>
          {item.clientes?.nome || 'Cliente'}
        </Text>
        <Badge label={label} tone={tone} />
      </View>
      <View style={styles.itemRow}>
        <Text style={styles.itemMeta}>
          Parcela #{item.numero} · {formatDateBR(item.data_vencimento)}
        </Text>
        <Text style={styles.itemValor}>{formatCurrency(item.valor)}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    gap: 4,
  },
  h1: { color: colors.text, fontSize: fontSizes.xxl, fontWeight: '700' },
  subtitle: { color: colors.textMuted, fontSize: fontSizes.sm },

  tabs: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { color: colors.textMuted, fontSize: fontSizes.sm, fontWeight: '600' },
  tabTextActive: { color: colors.primaryFg },

  list: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl },
  item: { gap: spacing.sm, padding: spacing.md },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  itemNome: { color: colors.text, fontSize: fontSizes.md, fontWeight: '600', flex: 1 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemMeta: { color: colors.textMuted, fontSize: fontSizes.sm },
  itemValor: { color: colors.text, fontSize: fontSizes.md, fontWeight: '700' },
});
