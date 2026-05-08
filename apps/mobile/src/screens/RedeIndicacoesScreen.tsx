/**
 * RedeIndicacoesScreen — mapa hierárquico das indicações.
 *
 * Em mobile mostramos a rede como lista achatada por nível
 * (sem ReactFlow). KPIs: redes, membros, em dia / a vencer / vencidos.
 * Filtro por rede (chip) e por status do cliente.
 *
 * Fonte: tabelas `clientes` (com `indicado_por`), `emprestimos` e `parcelas`.
 * Replica a lógica de buildRedeFromClientes do web service.
 */
import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { StatCard } from '../components/ui/StatCard';
import { ScreenLoading, EmptyState } from '../components/ui/State';
import { colors, fontSizes, radii, spacing } from '../theme/tokens';
import { formatCurrency, formatNumber } from '../lib/format';
import { hojeIso } from '../lib/loanFilters';

type ClienteStatus = 'em_dia' | 'a_vencer' | 'vencido';

interface ClienteRow {
  id: string;
  nome: string;
  indicado_por: string | null;
  bonus_acumulado: number | null;
  score_interno: number | null;
}

interface EmprestimoRow {
  cliente_id: string;
  valor: number;
  status: string;
}

interface ParcelaRow {
  cliente_id: string;
  valor_original: number;
  data_vencimento: string;
  status: string;
}

interface MembroRede {
  clienteId: string;
  nome: string;
  redeId: string;
  rootNome: string;
  nivel: number;
  indicadoPorNome: string | null;
  status: ClienteStatus;
  valor: number;
  bonus: number;
  scoreInterno: number;
  filhos: number;
}

interface RedeData {
  membros: MembroRede[];
  redes: Array<{ id: string; rootNome: string; total: number }>;
}

async function fetchRedeData(): Promise<RedeData> {
  const [cRes, eRes, pRes] = await Promise.all([
    supabase.from('clientes').select('id, nome, indicado_por, bonus_acumulado, score_interno').order('nome'),
    supabase.from('emprestimos').select('cliente_id, valor, status'),
    supabase.from('parcelas').select('cliente_id, valor_original, data_vencimento, status'),
  ]);
  if (cRes.error) throw new Error(cRes.error.message);
  if (eRes.error) throw new Error(eRes.error.message);
  if (pRes.error) throw new Error(pRes.error.message);

  const clientes = (cRes.data ?? []) as unknown as ClienteRow[];
  const emprestimos = (eRes.data ?? []) as unknown as EmprestimoRow[];
  const parcelas = (pRes.data ?? []) as unknown as ParcelaRow[];

  // Loan totals (ativos+inadimplentes)
  const loanTotals = new Map<string, number>();
  for (const e of emprestimos) {
    if (e.status === 'ativo' || e.status === 'inadimplente') {
      loanTotals.set(e.cliente_id, (loanTotals.get(e.cliente_id) ?? 0) + Number(e.valor || 0));
    }
  }

  // Status do cliente derivado das parcelas pendentes
  const today = hojeIso();
  const nearDate = new Date();
  nearDate.setHours(0, 0, 0, 0);
  nearDate.setDate(nearDate.getDate() + 5);
  const nearIso = nearDate.toISOString().slice(0, 10);

  const statusMap = new Map<string, ClienteStatus>();
  for (const p of parcelas) {
    if (p.status !== 'pendente') continue;
    const cur = statusMap.get(p.cliente_id) ?? 'em_dia';
    if (p.data_vencimento < today) {
      statusMap.set(p.cliente_id, 'vencido');
    } else if (p.data_vencimento <= nearIso && cur !== 'vencido') {
      statusMap.set(p.cliente_id, 'a_vencer');
    }
  }

  const clienteMap = new Map<string, ClienteRow>(clientes.map((c) => [c.id, c]));

  // Filhos de cada cliente
  const childrenMap = new Map<string, string[]>();
  for (const c of clientes) {
    if (c.indicado_por && clienteMap.has(c.indicado_por)) {
      const arr = childrenMap.get(c.indicado_por) ?? [];
      arr.push(c.id);
      childrenMap.set(c.indicado_por, arr);
    }
  }

  // Marcar quem participa da rede
  const inNetwork = new Set<string>();
  for (const c of clientes) {
    if (c.indicado_por && clienteMap.has(c.indicado_por)) {
      inNetwork.add(c.id);
      let cur: string | null = c.indicado_por;
      while (cur && clienteMap.has(cur) && !inNetwork.has(cur)) {
        inNetwork.add(cur);
        cur = clienteMap.get(cur)!.indicado_por;
      }
    }
  }

  // Raízes
  const roots: string[] = [];
  for (const id of inNetwork) {
    const c = clienteMap.get(id)!;
    if (!c.indicado_por || !inNetwork.has(c.indicado_por)) {
      roots.push(id);
    }
  }

  const membros: MembroRede[] = [];
  const redesIndex = new Map<string, { rootNome: string; total: number }>();

  for (const rootId of roots) {
    const rootCli = clienteMap.get(rootId)!;
    const redeId = `rede-${rootId.substring(0, 8)}`;
    const queue: Array<{ id: string; nivel: number; indicadoPor: string | null }> = [
      { id: rootId, nivel: 1, indicadoPor: null },
    ];
    const visited = new Set<string>();
    let total = 0;

    while (queue.length > 0) {
      const { id, nivel, indicadoPor } = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const c = clienteMap.get(id);
      if (!c) continue;

      membros.push({
        clienteId: c.id,
        nome: c.nome,
        redeId,
        rootNome: rootCli.nome,
        nivel,
        indicadoPorNome: indicadoPor ? clienteMap.get(indicadoPor)?.nome ?? null : null,
        status: statusMap.get(c.id) ?? 'em_dia',
        valor: loanTotals.get(c.id) ?? 0,
        bonus: Number(c.bonus_acumulado ?? 0),
        scoreInterno: Number(c.score_interno ?? 0),
        filhos: (childrenMap.get(c.id) ?? []).length,
      });
      total += 1;

      for (const childId of childrenMap.get(id) ?? []) {
        if (!visited.has(childId)) queue.push({ id: childId, nivel: nivel + 1, indicadoPor: id });
      }
    }
    redesIndex.set(redeId, { rootNome: rootCli.nome, total });
  }

  const redes = [...redesIndex.entries()]
    .map(([id, r]) => ({ id, rootNome: r.rootNome, total: r.total }))
    .sort((a, b) => b.total - a.total);

  return { membros, redes };
}

function statusInfo(s: ClienteStatus): { tone: 'success' | 'warning' | 'danger'; label: string } {
  switch (s) {
    case 'vencido': return { tone: 'danger', label: 'Vencido' };
    case 'a_vencer': return { tone: 'warning', label: 'A Vencer' };
    case 'em_dia':
    default: return { tone: 'success', label: 'Em Dia' };
  }
}

export function RedeIndicacoesScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [redeFilter, setRedeFilter] = useState<string>('todas');
  const [statusFilter, setStatusFilter] = useState<'todos' | ClienteStatus>('todos');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['rede-indicacoes-mobile'],
    queryFn: fetchRedeData,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refetch(); } finally { setRefreshing(false); }
  }, [refetch]);

  const membros = data?.membros ?? [];
  const redes = data?.redes ?? [];

  const stats = useMemo(() => {
    const total = membros.length;
    const emDia = membros.filter((m) => m.status === 'em_dia').length;
    const aVencer = membros.filter((m) => m.status === 'a_vencer').length;
    const vencidos = membros.filter((m) => m.status === 'vencido').length;
    const bonusTotal = membros.reduce((s, m) => s + m.bonus, 0);
    return { total, emDia, aVencer, vencidos, bonusTotal };
  }, [membros]);

  const filtrados = useMemo(() => {
    let list = membros;
    if (redeFilter !== 'todas') list = list.filter((m) => m.redeId === redeFilter);
    if (statusFilter !== 'todos') list = list.filter((m) => m.status === statusFilter);
    return list.sort((a, b) =>
      a.redeId === b.redeId ? a.nivel - b.nivel || a.nome.localeCompare(b.nome) : a.redeId.localeCompare(b.redeId)
    );
  }, [membros, redeFilter, statusFilter]);

  if (isLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center' }]}>
        <ScreenLoading label="Construindo rede…" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.h1}>Rede de Indicações</Text>
        <Text style={styles.subtitle}>
          {filtrados.length} de {stats.total} membro(s) · {redes.length} rede(s)
        </Text>
      </View>

      <FlatList
        data={filtrados}
        keyExtractor={(m) => m.clienteId}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={{ gap: spacing.sm, marginBottom: spacing.sm }}>
            <View style={styles.kpis}>
              <StatCard label="Membros" value={formatNumber(stats.total)} hint={`${redes.length} rede(s)`} />
              <StatCard label="Em Dia" value={formatNumber(stats.emDia)} tone="success" />
            </View>
            <View style={styles.kpis}>
              <StatCard label="A Vencer" value={formatNumber(stats.aVencer)} tone="warning" />
              <StatCard label="Vencidos" value={formatNumber(stats.vencidos)} tone="danger" />
            </View>
            <StatCard label="Bônus acumulado" value={formatCurrency(stats.bonusTotal)} />

            {redes.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                <Chip active={redeFilter === 'todas'} onPress={() => setRedeFilter('todas')} label={`Todas (${stats.total})`} />
                {redes.map((r) => (
                  <Chip
                    key={r.id}
                    active={redeFilter === r.id}
                    onPress={() => setRedeFilter(r.id)}
                    label={`${r.rootNome.split(' ')[0]} (${r.total})`}
                  />
                ))}
              </ScrollView>
            )}

            <View style={styles.chipsRowFlat}>
              {(['todos', 'em_dia', 'a_vencer', 'vencido'] as const).map((s) => (
                <Chip
                  key={s}
                  active={statusFilter === s}
                  onPress={() => setStatusFilter(s)}
                  label={s === 'todos' ? 'Todos' : s === 'em_dia' ? 'Em Dia' : s === 'a_vencer' ? 'A Vencer' : 'Vencidos'}
                />
              ))}
            </View>
          </View>
        }
        renderItem={({ item, index }) => {
          const prev = filtrados[index - 1];
          const showRedeHeader = !prev || prev.redeId !== item.redeId;
          return (
            <View style={{ gap: spacing.sm }}>
              {showRedeHeader && (
                <View style={styles.redeHeader}>
                  <Ionicons name="git-network-outline" size={14} color={colors.primary} />
                  <Text style={styles.redeHeaderText}>Rede de {item.rootNome}</Text>
                </View>
              )}
              <MembroItem item={item} />
            </View>
          );
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <EmptyState title="Sem membros" hint="Nenhum cliente na rede com este filtro." />
        }
      />
    </View>
  );
}

function Chip({ active, onPress, label }: { active: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function MembroItem({ item }: { item: MembroRede }) {
  const s = statusInfo(item.status);
  return (
    <Card style={[styles.item, { marginLeft: Math.min(item.nivel - 1, 4) * 12 }]}>
      <View style={styles.itemTop}>
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Text style={styles.avatarText}>{item.nome.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.itemNome} numberOfLines={1}>{item.nome}</Text>
          <Text style={styles.itemMeta} numberOfLines={1}>
            Nível {item.nivel}
            {item.indicadoPorNome ? ` · indicado por ${item.indicadoPorNome}` : ' · raiz'}
          </Text>
        </View>
        <Badge label={s.label} tone={s.tone} />
      </View>
      <View style={styles.itemRow}>
        <View>
          <Text style={styles.itemLabel}>Empréstimos ativos</Text>
          <Text style={styles.itemValor}>{formatCurrency(item.valor)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.itemLabel}>Bônus · Filhos</Text>
          <Text style={styles.itemValorSmall}>
            {formatCurrency(item.bonus)} · {formatNumber(item.filhos)}
          </Text>
        </View>
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

  kpis: { flexDirection: 'row', gap: spacing.sm },

  chipsRow: { gap: spacing.xs, paddingVertical: spacing.xs },
  chipsRowFlat: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.xs,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textMuted, fontSize: fontSizes.xs, fontWeight: '600' },
  chipTextActive: { color: colors.primaryFg },

  list: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl },

  redeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.sm,
    paddingBottom: 2,
  },
  redeHeaderText: {
    color: colors.text,
    fontSize: fontSizes.sm,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  item: { gap: spacing.sm, padding: spacing.md },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: colors.primaryFg, fontWeight: '700', fontSize: fontSizes.md },
  itemNome: { color: colors.text, fontSize: fontSizes.md, fontWeight: '600' },
  itemMeta: { color: colors.textMuted, fontSize: fontSizes.xs },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  itemLabel: { color: colors.textMuted, fontSize: fontSizes.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  itemValor: { color: colors.text, fontSize: fontSizes.md, fontWeight: '700' },
  itemValorSmall: { color: colors.textMuted, fontSize: fontSizes.xs, fontWeight: '600' },
});
