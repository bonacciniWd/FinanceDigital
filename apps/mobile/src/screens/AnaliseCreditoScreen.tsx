/**
 * AnaliseCreditoScreen — solicitações de crédito.
 *
 * KPIs: Total, Pendente, Aprovadas, Recusadas, Taxa Aprovação.
 * Lista filtrada por status (chips). Admin pode aprovar/recusar.
 *
 * Fonte: tabela `analises_credito` (Supabase).
 */
import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { StatCard } from '../components/ui/StatCard';
import { ScreenLoading, EmptyState } from '../components/ui/State';
import { colors, fontSizes, radii, spacing } from '../theme/tokens';
import { formatCurrency, formatDateBR, formatNumber } from '../lib/format';

type Status = 'pendente' | 'em_analise' | 'aprovado' | 'recusado';

interface AnaliseRow {
  id: string;
  cliente_id: string | null;
  cliente_nome: string;
  cpf: string;
  valor_solicitado: number;
  numero_parcelas: number | null;
  valor_parcela: number | null;
  renda_mensal: number;
  score_serasa: number;
  score_interno: number;
  status: Status;
  data_solicitacao: string;
  motivo: string | null;
}

const FILTROS: Array<{ id: 'todos' | Status; label: string }> = [
  { id: 'todos', label: 'Todas' },
  { id: 'pendente', label: 'Pendentes' },
  { id: 'em_analise', label: 'Em análise' },
  { id: 'aprovado', label: 'Aprovadas' },
  { id: 'recusado', label: 'Recusadas' },
];

async function fetchAnalises(): Promise<AnaliseRow[]> {
  const PAGE = 1000;
  const all: AnaliseRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('analises_credito')
      .select(
        'id, cliente_id, cliente_nome, cpf, valor_solicitado, numero_parcelas, valor_parcela, renda_mensal, score_serasa, score_interno, status, data_solicitacao, motivo'
      )
      .order('data_solicitacao', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...(data as unknown as AnaliseRow[]));
    if (data.length < PAGE) break;
  }
  return all;
}

function maskCpf(cpf: string): string {
  const d = (cpf || '').replace(/\D/g, '');
  if (d.length !== 11) return cpf || '—';
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function statusInfo(s: Status): { tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral'; label: string } {
  switch (s) {
    case 'aprovado': return { tone: 'success', label: 'Aprovado' };
    case 'recusado': return { tone: 'danger', label: 'Recusado' };
    case 'em_analise': return { tone: 'info', label: 'Em análise' };
    case 'pendente':
    default: return { tone: 'warning', label: 'Pendente' };
  }
}

function scoreColor(score: number): 'success' | 'warning' | 'danger' {
  if (score >= 700) return 'success';
  if (score >= 500) return 'warning';
  return 'danger';
}

export function AnaliseCreditoScreen() {
  const [filtro, setFiltro] = useState<'todos' | Status>('todos');
  const [refreshing, setRefreshing] = useState(false);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'admin';

  const { data: analises = [], isLoading, refetch } = useQuery({
    queryKey: ['analises-credito-mobile'],
    queryFn: fetchAnalises,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status, motivo }: { id: string; status: Status; motivo?: string }) => {
      const updates: Record<string, unknown> = { status };
      if (motivo !== undefined) updates.motivo = motivo;
      if (user?.id) updates.analista_id = user.id;
      const { error } = await supabase.from('analises_credito').update(updates).eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analises-credito-mobile'] });
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refetch(); } finally { setRefreshing(false); }
  }, [refetch]);

  const stats = useMemo(() => {
    const total = analises.length;
    const pendente = analises.filter((a) => a.status === 'pendente').length;
    const emAnalise = analises.filter((a) => a.status === 'em_analise').length;
    const aprovado = analises.filter((a) => a.status === 'aprovado').length;
    const recusado = analises.filter((a) => a.status === 'recusado').length;
    const decididos = aprovado + recusado;
    const taxa = decididos > 0 ? Math.round((aprovado / decididos) * 100) : 0;
    return { total, pendente, emAnalise, aprovado, recusado, taxa };
  }, [analises]);

  const filtradas = useMemo(() => {
    if (filtro === 'todos') return analises;
    return analises.filter((a) => a.status === filtro);
  }, [analises, filtro]);

  const handleAprovar = (item: AnaliseRow) => {
    Alert.alert(
      'Aprovar análise',
      `Confirmar aprovação de ${item.cliente_nome}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Aprovar',
          style: 'default',
          onPress: () => updateStatus.mutate({ id: item.id, status: 'aprovado' }),
        },
      ]
    );
  };

  const handleRecusar = (item: AnaliseRow) => {
    Alert.prompt(
      'Recusar análise',
      `Motivo da recusa para ${item.cliente_nome}:`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Recusar',
          style: 'destructive',
          onPress: (motivo) =>
            updateStatus.mutate({ id: item.id, status: 'recusado', motivo: motivo || 'Sem motivo informado' }),
        },
      ],
      'plain-text'
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.h1}>Análise de Crédito</Text>
        <Text style={styles.subtitle}>
          {filtradas.length} solicitação(ões) {filtro !== 'todos' ? `· ${FILTROS.find(f => f.id === filtro)?.label}` : ''}
        </Text>
      </View>

      <FlatList
        data={filtradas}
        keyExtractor={(a) => a.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={{ gap: spacing.sm, marginBottom: spacing.sm }}>
            <View style={styles.kpis}>
              <StatCard label="Total" value={formatNumber(stats.total)} />
              <StatCard label="Pendentes" value={formatNumber(stats.pendente + stats.emAnalise)} tone="warning" />
            </View>
            <View style={styles.kpis}>
              <StatCard label="Aprovadas" value={formatNumber(stats.aprovado)} tone="success" />
              <StatCard label="Taxa Aprov." value={`${stats.taxa}%`} hint={`${stats.recusado} recusada(s)`} />
            </View>

            <View style={styles.chipsRow}>
              {FILTROS.map((f) => {
                const active = filtro === f.id;
                return (
                  <Pressable
                    key={f.id}
                    onPress={() => setFiltro(f.id)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <AnaliseItem item={item} isAdmin={isAdmin} onAprovar={handleAprovar} onRecusar={handleRecusar} />
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          isLoading ? <ScreenLoading /> : <EmptyState title="Sem solicitações" hint="Nenhuma análise neste filtro." />
        }
      />
    </View>
  );
}

function AnaliseItem({
  item,
  isAdmin,
  onAprovar,
  onRecusar,
}: {
  item: AnaliseRow;
  isAdmin: boolean;
  onAprovar: (a: AnaliseRow) => void;
  onRecusar: (a: AnaliseRow) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const s = statusInfo(item.status);
  const scoreTone = scoreColor(item.score_serasa);
  const podeDecidir = isAdmin && (item.status === 'pendente' || item.status === 'em_analise');

  return (
    <Card style={styles.item}>
      <Pressable onPress={() => setExpanded((v) => !v)} style={styles.itemTop}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.itemNome} numberOfLines={1}>{item.cliente_nome}</Text>
          <Text style={styles.itemMeta}>
            {maskCpf(item.cpf)} · {formatDateBR(item.data_solicitacao)}
          </Text>
        </View>
        <Badge label={s.label} tone={s.tone} />
      </Pressable>

      <View style={styles.itemRow}>
        <View>
          <Text style={styles.itemLabel}>Valor solicitado</Text>
          <Text style={styles.itemValor}>{formatCurrency(item.valor_solicitado)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.itemLabel}>Score</Text>
          <Text
            style={[
              styles.itemValor,
              { color: scoreTone === 'success' ? colors.success : scoreTone === 'warning' ? colors.warning : colors.danger },
            ]}
          >
            {formatNumber(item.score_serasa)}
          </Text>
        </View>
      </View>

      {expanded && (
        <View style={styles.expand}>
          {item.numero_parcelas != null && (
            <Row label="Parcelas" value={`${item.numero_parcelas}x ${item.valor_parcela ? `de ${formatCurrency(item.valor_parcela)}` : ''}`} />
          )}
          <Row label="Renda mensal" value={formatCurrency(item.renda_mensal)} />
          <Row label="Score interno" value={formatNumber(item.score_interno)} />
          {item.motivo ? <Row label="Motivo" value={item.motivo} /> : null}

          {podeDecidir && (
            <View style={styles.actions}>
              <Pressable onPress={() => onRecusar(item)} style={[styles.actionBtn, styles.actionDanger]}>
                <Ionicons name="close-circle-outline" size={16} color={colors.danger} />
                <Text style={[styles.actionText, { color: colors.danger }]}>Recusar</Text>
              </Pressable>
              <Pressable onPress={() => onAprovar(item)} style={[styles.actionBtn, styles.actionSuccess]}>
                <Ionicons name="checkmark-circle-outline" size={16} color={colors.success} />
                <Text style={[styles.actionText, { color: colors.success }]}>Aprovar</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.expandRow}>
      <Text style={styles.itemLabel}>{label}</Text>
      <Text style={styles.expandValue} numberOfLines={2}>{value}</Text>
    </View>
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
  itemNome: { color: colors.text, fontSize: fontSizes.md, fontWeight: '600' },
  itemMeta: { color: colors.textMuted, fontSize: fontSizes.xs },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  itemLabel: { color: colors.textMuted, fontSize: fontSizes.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  itemValor: { color: colors.text, fontSize: fontSizes.lg, fontWeight: '700' },

  expand: {
    gap: spacing.xs,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  expandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  expandValue: { color: colors.text, fontSize: fontSizes.sm, flex: 1, textAlign: 'right' },

  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  actionDanger: { backgroundColor: colors.dangerBg, borderColor: colors.danger },
  actionSuccess: { backgroundColor: colors.successBg, borderColor: colors.success },
  actionText: { fontSize: fontSizes.sm, fontWeight: '700' },
});
