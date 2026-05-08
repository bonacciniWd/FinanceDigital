/**
 * BonusComissoesScreen — bônus acumulados e indicações por indicador.
 *
 * KPIs: total acumulado, total de indicações, indicadores ativos.
 * Lista os clientes que indicaram alguém ou têm bônus.
 *
 * Fonte: tabela `clientes` (com `indicado_por` e `bonus_acumulado`).
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
import { StatCard } from '../components/ui/StatCard';
import { ScreenLoading, EmptyState } from '../components/ui/State';
import { colors, fontSizes, radii, spacing } from '../theme/tokens';
import { formatCurrency, formatNumber } from '../lib/format';

interface ClienteRow {
  id: string;
  nome: string;
  indicado_por: string | null;
  bonus_acumulado: number | null;
  score_interno: number | null;
  status: string | null;
}

interface IndicadorAgg {
  id: string;
  nome: string;
  bonus: number;
  score: number;
  indicacoes: number;
  status: string | null;
}

async function fetchClientesRede(): Promise<ClienteRow[]> {
  const PAGE = 1000;
  const all: ClienteRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('clientes')
      .select('id, nome, indicado_por, bonus_acumulado, score_interno, status')
      .order('nome')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...(data as unknown as ClienteRow[]));
    if (data.length < PAGE) break;
  }
  return all;
}

type SortBy = 'bonus' | 'indicacoes' | 'nome';

export function BonusComissoesScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>('bonus');

  const { data: clientes = [], isLoading, refetch } = useQuery({
    queryKey: ['bonus-comissoes-mobile'],
    queryFn: fetchClientesRede,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refetch(); } finally { setRefreshing(false); }
  }, [refetch]);

  const indicadores = useMemo<IndicadorAgg[]>(() => {
    const map = new Map<string, IndicadorAgg>();
    for (const c of clientes) {
      map.set(c.id, {
        id: c.id,
        nome: c.nome,
        bonus: Number(c.bonus_acumulado ?? 0),
        score: Number(c.score_interno ?? 0),
        indicacoes: 0,
        status: c.status,
      });
    }
    for (const c of clientes) {
      if (c.indicado_por && map.has(c.indicado_por)) {
        map.get(c.indicado_por)!.indicacoes += 1;
      }
    }
    return Array.from(map.values()).filter((i) => i.bonus > 0 || i.indicacoes > 0);
  }, [clientes]);

  const stats = useMemo(() => {
    const totalBonus = indicadores.reduce((s, i) => s + i.bonus, 0);
    const totalInd = indicadores.reduce((s, i) => s + i.indicacoes, 0);
    return {
      totalBonus,
      totalIndicacoes: totalInd,
      totalIndicadores: indicadores.length,
      avgPorIndicador: indicadores.length > 0 ? totalBonus / indicadores.length : 0,
    };
  }, [indicadores]);

  const ordenados = useMemo(() => {
    const arr = [...indicadores];
    if (sortBy === 'bonus') arr.sort((a, b) => b.bonus - a.bonus);
    else if (sortBy === 'indicacoes') arr.sort((a, b) => b.indicacoes - a.indicacoes);
    else arr.sort((a, b) => a.nome.localeCompare(b.nome));
    return arr;
  }, [indicadores, sortBy]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.h1}>Bônus & Comissões</Text>
        <Text style={styles.subtitle}>
          {stats.totalIndicadores} indicador(es) com bônus ou indicações
        </Text>
      </View>

      <FlatList
        data={ordenados}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={{ gap: spacing.sm, marginBottom: spacing.sm }}>
            <View style={styles.kpis}>
              <StatCard
                label="Bônus acumulado"
                value={formatCurrency(stats.totalBonus)}
                hint={`Média: ${formatCurrency(stats.avgPorIndicador)}`}
                tone="success"
              />
            </View>
            <View style={styles.kpis}>
              <StatCard label="Indicações" value={formatNumber(stats.totalIndicacoes)} tone="info" />
              <StatCard label="Indicadores" value={formatNumber(stats.totalIndicadores)} />
            </View>

            <View style={styles.chipsRow}>
              {(
                [
                  { id: 'bonus' as SortBy,       label: 'Maior bônus' },
                  { id: 'indicacoes' as SortBy,  label: 'Mais indicações' },
                  { id: 'nome' as SortBy,        label: 'Nome' },
                ]
              ).map((f) => {
                const active = sortBy === f.id;
                return (
                  <Pressable
                    key={f.id}
                    onPress={() => setSortBy(f.id)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        }
        renderItem={({ item, index }) => <IndicadorItem item={item} pos={index + 1} />}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          isLoading ? <ScreenLoading /> : <EmptyState title="Sem indicadores" hint="Ninguém possui bônus ou indicações ainda." />
        }
      />
    </View>
  );
}

function IndicadorItem({ item, pos }: { item: IndicadorAgg; pos: number }) {
  return (
    <Card style={styles.item}>
      <View style={styles.itemTop}>
        <View style={styles.posBadge}>
          <Text style={styles.posText}>{pos}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.itemNome} numberOfLines={1}>{item.nome}</Text>
          <Text style={styles.itemMeta}>
            Score {item.score} · {item.status ?? '—'}
          </Text>
        </View>
      </View>

      <View style={styles.itemRow}>
        <View>
          <Text style={styles.itemLabel}>Bônus</Text>
          <Text style={styles.itemValor}>{formatCurrency(item.bonus)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.itemLabel}>Indicações</Text>
          <Text style={styles.itemValor}>{formatNumber(item.indicacoes)}</Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm, gap: 4 },
  h1: { color: colors.text, fontSize: fontSizes.xxl, fontWeight: '700' },
  subtitle: { color: colors.textMuted, fontSize: fontSizes.sm },

  kpis: { flexDirection: 'row', gap: spacing.sm },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textMuted, fontSize: fontSizes.xs, fontWeight: '600' },
  chipTextActive: { color: colors.primaryFg },

  list: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl },

  item: { gap: spacing.sm, padding: spacing.md },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  posBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  posText: { color: colors.primaryFg, fontSize: fontSizes.xs, fontWeight: '700' },
  itemNome: { color: colors.text, fontSize: fontSizes.md, fontWeight: '600' },
  itemMeta: { color: colors.textMuted, fontSize: fontSizes.xs },

  itemRow: { flexDirection: 'row', justifyContent: 'space-between' },
  itemLabel: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  itemValor: { color: colors.text, fontSize: fontSizes.md, fontWeight: '700' },
});
