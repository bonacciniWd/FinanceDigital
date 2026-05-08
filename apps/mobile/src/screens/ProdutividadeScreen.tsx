/**
 * ProdutividadeScreen — atividades por funcionário no dia/semana/mês.
 *
 * KPIs: total de atividades hoje, meta agregada, top performer.
 * Lista funcionários com contagem por atividade (analise/cobranca/atendimento)
 * conforme role.
 *
 * Fontes: `funcionarios`, `analises_credito`, `kanban_cobranca`, `tickets_atendimento`.
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
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { StatCard } from '../components/ui/StatCard';
import { ScreenLoading, EmptyState } from '../components/ui/State';
import { colors, fontSizes, radii, spacing } from '../theme/tokens';
import { formatNumber } from '../lib/format';

type Periodo = 'hoje' | 'semana' | 'mes';

interface FuncionarioRow {
  id: string;
  user_id: string;
  nome: string;
  email: string;
  role: string;
  status: string;
  atividades_hoje: number;
  meta_diaria: number;
  ultima_atividade: string | null;
}

interface AnaliseRow {
  analista_id: string | null;
  status: string;
  data_analise: string | null;
}
interface KanbanRow {
  ultima_acao_por: string | null;
  ultima_acao_em: string | null;
}
interface TicketRow {
  atendente_id: string | null;
  created_at: string;
}

interface FuncMetrics extends FuncionarioRow {
  count: number;
  metaPct: number;
  detalhe: string;
}

function periodoStartIso(p: Periodo): string {
  const d = new Date();
  if (p === 'hoje') {
    d.setHours(0, 0, 0, 0);
  } else if (p === 'semana') {
    d.setDate(d.getDate() - 7);
    d.setHours(0, 0, 0, 0);
  } else {
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
  }
  return d.toISOString();
}

async function fetchProdutividade(periodo: Periodo): Promise<FuncMetrics[]> {
  const since = periodoStartIso(periodo);

  const [{ data: funcsData, error: e1 }, { data: anaData, error: e2 }, { data: kanData, error: e3 }, { data: tkData, error: e4 }] =
    await Promise.all([
      supabase
        .from('funcionarios')
        .select('id, user_id, nome, email, role, status, atividades_hoje, meta_diaria, ultima_atividade')
        .order('atividades_hoje', { ascending: false }),
      supabase
        .from('analises_credito')
        .select('analista_id, status, data_analise')
        .gte('data_analise', since.slice(0, 10)),
      supabase
        .from('kanban_cobranca')
        .select('ultima_acao_por, ultima_acao_em')
        .gte('ultima_acao_em', since),
      supabase
        .from('tickets_atendimento')
        .select('atendente_id, created_at')
        .gte('created_at', since),
    ]);
  if (e1) throw new Error(e1.message);
  if (e2) throw new Error(e2.message);
  if (e3) throw new Error(e3.message);
  // tickets pode falhar caso tabela inexistente; trate como vazio
  const tickets: TicketRow[] = e4 ? [] : ((tkData ?? []) as unknown as TicketRow[]);

  const funcs = (funcsData ?? []) as unknown as FuncionarioRow[];
  const analises = (anaData ?? []) as unknown as AnaliseRow[];
  const kanban = (kanData ?? []) as unknown as KanbanRow[];

  const countByUser = new Map<string, { count: number; detalhe: string }>();

  for (const f of funcs) {
    let count = 0;
    let detalhe = '';
    if (f.role === 'admin' || f.role === 'gerencia') {
      const a = analises.filter((x) => x.analista_id === f.user_id).length;
      const k = kanban.filter((x) => x.ultima_acao_por === f.user_id).length;
      const t = tickets.filter((x) => x.atendente_id === f.user_id).length;
      count = a + k + t;
      detalhe = `${a} análises · ${k} ações Kanban · ${t} atendimentos`;
    } else if (f.role === 'cobranca') {
      const k = kanban.filter((x) => x.ultima_acao_por === f.user_id).length;
      count = k;
      detalhe = `${k} ações de cobrança`;
    } else if (f.role === 'comercial') {
      const a = analises.filter((x) => x.analista_id === f.user_id).length;
      count = a;
      detalhe = `${a} análises de crédito`;
    } else {
      const t = tickets.filter((x) => x.atendente_id === f.user_id).length;
      count = t;
      detalhe = `${t} atendimentos`;
    }
    countByUser.set(f.user_id, { count, detalhe });
  }

  return funcs
    .map<FuncMetrics>((f) => {
      const c = countByUser.get(f.user_id) ?? { count: 0, detalhe: '' };
      // se for "hoje", também considera atividades_hoje da própria tabela como base
      const total = periodo === 'hoje' ? Math.max(c.count, f.atividades_hoje ?? 0) : c.count;
      const meta = f.meta_diaria > 0 ? f.meta_diaria : 1;
      const metaPct = periodo === 'hoje' ? Math.min(100, Math.round((total / meta) * 100)) : 0;
      return { ...f, count: total, metaPct, detalhe: c.detalhe };
    })
    .sort((a, b) => b.count - a.count);
}

export function ProdutividadeScreen() {
  const [periodo, setPeriodo] = useState<Periodo>('hoje');
  const [refreshing, setRefreshing] = useState(false);

  const { data: funcs = [], isLoading, refetch } = useQuery({
    queryKey: ['produtividade-mobile', periodo],
    queryFn: () => fetchProdutividade(periodo),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refetch(); } finally { setRefreshing(false); }
  }, [refetch]);

  const stats = useMemo(() => {
    const ativos = funcs.filter((f) => f.status === 'online' || f.status === 'ativo' || f.status === 'ausente');
    const totalAtividades = funcs.reduce((s, f) => s + f.count, 0);
    const top = funcs[0];
    let metaPct = 0;
    if (periodo === 'hoje') {
      const totalMeta = funcs.reduce((s, f) => s + (f.meta_diaria || 0), 0);
      metaPct = totalMeta > 0 ? Math.min(100, Math.round((totalAtividades / totalMeta) * 100)) : 0;
    }
    return { totalAtividades, top, ativos: ativos.length, metaPct };
  }, [funcs, periodo]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.h1}>Produtividade</Text>
        <Text style={styles.subtitle}>{funcs.length} funcionário(s) · {stats.ativos} ativo(s)</Text>
      </View>

      <FlatList
        data={funcs}
        keyExtractor={(f) => f.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={{ gap: spacing.sm, marginBottom: spacing.sm }}>
            <View style={styles.kpis}>
              <StatCard
                label="Atividades"
                value={formatNumber(stats.totalAtividades)}
                hint={periodo === 'hoje' ? `Meta: ${stats.metaPct}%` : undefined}
                tone="info"
              />
              <StatCard
                label="Top performer"
                value={stats.top?.nome ?? '—'}
                hint={stats.top ? `${stats.top.count} atividades` : undefined}
                tone="success"
              />
            </View>

            <View style={styles.chipsRow}>
              {(['hoje', 'semana', 'mes'] as Periodo[]).map((p) => {
                const active = periodo === p;
                const label = p === 'hoje' ? 'Hoje' : p === 'semana' ? 'Semana' : 'Mês';
                return (
                  <Pressable
                    key={p}
                    onPress={() => setPeriodo(p)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        }
        renderItem={({ item }) => <FuncItem item={item} periodo={periodo} />}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          isLoading ? <ScreenLoading /> : <EmptyState title="Sem funcionários" hint="Cadastre funcionários no sistema." />
        }
      />
    </View>
  );
}

function FuncItem({ item, periodo }: { item: FuncMetrics; periodo: Periodo }) {
  const statusTone =
    item.status === 'online' ? 'success' : item.status === 'ausente' ? 'warning' : item.status === 'offline' ? 'neutral' : 'info';
  const initials = item.nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <Card style={styles.item}>
      <View style={styles.itemTop}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials || '?'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.itemNome} numberOfLines={1}>{item.nome}</Text>
          <Text style={styles.itemMeta} numberOfLines={1}>{item.role.toUpperCase()} · {item.email}</Text>
        </View>
        <Badge label={item.status} tone={statusTone as any} />
      </View>

      <View style={styles.itemRow}>
        <View>
          <Text style={styles.itemLabel}>Atividades</Text>
          <Text style={styles.itemValor}>{formatNumber(item.count)}</Text>
        </View>
        {periodo === 'hoje' ? (
          <View style={{ alignItems: 'flex-end', flex: 1, marginLeft: spacing.md }}>
            <View style={styles.metaTrackHeader}>
              <Text style={styles.itemLabel}>Meta diária</Text>
              <Text style={styles.metaPct}>{item.metaPct}%</Text>
            </View>
            <View style={styles.metaTrack}>
              <View style={[styles.metaFill, { width: `${item.metaPct}%` }]} />
            </View>
            <Text style={styles.metaSmall}>
              {item.count} / {item.meta_diaria || '—'}
            </Text>
          </View>
        ) : null}
      </View>

      {item.detalhe ? (
        <Text style={styles.itemDetail} numberOfLines={2}>
          <Ionicons name="pulse-outline" size={11} color={colors.textMuted} /> {item.detalhe}
        </Text>
      ) : null}
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
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: colors.primaryFg, fontSize: fontSizes.sm, fontWeight: '700' },
  itemNome: { color: colors.text, fontSize: fontSizes.md, fontWeight: '600' },
  itemMeta: { color: colors.textMuted, fontSize: fontSizes.xs },

  itemRow: { flexDirection: 'row', alignItems: 'flex-end' },
  itemLabel: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  itemValor: { color: colors.text, fontSize: fontSizes.lg, fontWeight: '700' },
  itemDetail: { color: colors.textMuted, fontSize: fontSizes.xs },

  metaTrackHeader: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 4 },
  metaPct: { color: colors.text, fontSize: fontSizes.xs, fontWeight: '700' },
  metaTrack: { width: '100%', height: 6, borderRadius: 3, backgroundColor: colors.bgElevated, overflow: 'hidden' },
  metaFill: { height: '100%', backgroundColor: colors.primary },
  metaSmall: { color: colors.textMuted, fontSize: 10, marginTop: 2, alignSelf: 'flex-end' },
});
