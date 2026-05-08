/**
 * KanbanCobrancaScreen — pipeline de cobrança em formato segmentado.
 *
 * Em mobile, em vez de board horizontal com drag, mostramos seletor de
 * etapa (chips) e lista vertical dos cards daquela etapa. Admins podem
 * mover cards para outra etapa via menu contextual.
 *
 * Fonte: tabela `kanban_cobranca` JOIN `clientes` (Supabase).
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
  Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { ScreenLoading, EmptyState } from '../components/ui/State';
import { colors, fontSizes, radii, spacing } from '../theme/tokens';
import { formatCurrency, formatDateBR, formatNumber } from '../lib/format';

type Etapa =
  | 'a_vencer'
  | 'vencido'
  | 'contatado'
  | 'negociacao'
  | 'acordo'
  | 'pago'
  | 'arquivado';

interface CardRow {
  id: string;
  cliente_id: string;
  parcela_id: string | null;
  responsavel_id: string | null;
  etapa: Etapa;
  valor_divida: number;
  dias_atraso: number;
  tentativas_contato: number;
  ultimo_contato: string | null;
  observacao: string | null;
  created_at: string;
  clientes?: { nome: string; telefone: string | null; status: string } | null;
}

const ETAPAS: Array<{ id: Etapa; label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { id: 'a_vencer',   label: 'A Vencer',    color: '#facc15', icon: 'time-outline' },
  { id: 'vencido',    label: 'Vencido',     color: '#ef4444', icon: 'alert-circle-outline' },
  { id: 'contatado',  label: 'Contatado',   color: '#3b82f6', icon: 'chatbubble-outline' },
  { id: 'negociacao', label: 'Negociação',  color: '#f97316', icon: 'people-outline' },
  { id: 'acordo',     label: 'Acordo',      color: '#22c55e', icon: 'handshake-outline' as never },
  { id: 'pago',       label: 'Pago',        color: '#10b981', icon: 'checkmark-circle-outline' },
  { id: 'arquivado',  label: 'Arquivado',   color: '#64748b', icon: 'archive-outline' },
];

async function fetchCards(): Promise<CardRow[]> {
  const PAGE = 1000;
  const all: CardRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('kanban_cobranca')
      .select(
        'id, cliente_id, parcela_id, responsavel_id, etapa, valor_divida, dias_atraso, tentativas_contato, ultimo_contato, observacao, created_at, clientes:cliente_id ( nome, telefone, status )'
      )
      .order('dias_atraso', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...(data as unknown as CardRow[]));
    if (data.length < PAGE) break;
  }
  return all;
}

export function KanbanCobrancaScreen() {
  const [etapa, setEtapa] = useState<Etapa>('vencido');
  const [refreshing, setRefreshing] = useState(false);
  const [busca, setBusca] = useState('');
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isManager = user?.role === 'admin' || user?.role === 'gerencia';

  const { data: cards = [], isLoading, refetch } = useQuery({
    queryKey: ['kanban-cobranca-mobile'],
    queryFn: fetchCards,
  });

  const moverCard = useMutation({
    mutationFn: async ({ id, novaEtapa }: { id: string; novaEtapa: Etapa }) => {
      const { error } = await supabase
        .from('kanban_cobranca')
        .update({ etapa: novaEtapa })
        .eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kanban-cobranca-mobile'] });
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refetch(); } finally { setRefreshing(false); }
  }, [refetch]);

  const counts = useMemo(() => {
    const map: Record<Etapa, number> = {
      a_vencer: 0, vencido: 0, contatado: 0, negociacao: 0, acordo: 0, pago: 0, arquivado: 0,
    };
    for (const c of cards) {
      // Vencidos com >365d de atraso são tratados como arquivados (regra de congelamento)
      if (c.etapa === 'vencido' && (c.dias_atraso ?? 0) > 365) {
        map.arquivado += 1;
      } else {
        map[c.etapa] = (map[c.etapa] ?? 0) + 1;
      }
    }
    return map;
  }, [cards]);

  const filtrados = useMemo(() => {
    let list: CardRow[];
    if (etapa === 'vencido') {
      // Exclui cards congelados (>365d) — estes aparecem em 'arquivado'
      list = cards.filter((c) => c.etapa === 'vencido' && (c.dias_atraso ?? 0) <= 365);
    } else if (etapa === 'arquivado') {
      // Inclui DB arquivado + vencidos congelados (>365d)
      list = cards.filter(
        (c) => c.etapa === 'arquivado' || (c.etapa === 'vencido' && (c.dias_atraso ?? 0) > 365)
      );
    } else {
      list = cards.filter((c) => c.etapa === etapa);
    }
    if (busca.trim()) {
      const q = busca.toLowerCase();
      list = list.filter((c) => (c.clientes?.nome ?? '').toLowerCase().includes(q));
    }
    return list;
  }, [cards, etapa, busca]);

  const totalDivida = useMemo(
    () => filtrados.reduce((s, c) => s + Number(c.valor_divida || 0), 0),
    [filtrados]
  );

  const handleMover = (item: CardRow) => {
    if (!isManager) return;
    const opcoes = ETAPAS.filter((e) => e.id !== item.etapa);
    Alert.alert(
      'Mover card',
      `${item.clientes?.nome ?? 'Cliente'} → escolha a nova etapa:`,
      [
        ...opcoes.map((e) => ({
          text: e.label,
          onPress: () => moverCard.mutate({ id: item.id, novaEtapa: e.id }),
        })),
        { text: 'Cancelar', style: 'cancel' as const },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.h1}>Kanban Cobrança</Text>
        <Text style={styles.subtitle}>
          {filtrados.length} card(s) · {formatCurrency(totalDivida)}
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chipsRow}
      >
        {ETAPAS.map((e) => {
          const active = etapa === e.id;
          const count = counts[e.id] ?? 0;
          return (
            <Pressable
              key={e.id}
              onPress={() => setEtapa(e.id)}
              style={[styles.chip, active && { backgroundColor: e.color, borderColor: e.color }]}
            >
              <View style={[styles.chipDot, { backgroundColor: e.color }]} />
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {e.label}
              </Text>
              <Text style={[styles.chipCount, active && styles.chipTextActive]}>
                {formatNumber(count)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {isLoading ? (
        <ScreenLoading />
      ) : (
        <FlatList
          data={filtrados}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <KanbanCard item={item} canMove={isManager} onMove={handleMover} />
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <EmptyState
              title="Sem cards"
              hint={`Nenhum cliente em "${ETAPAS.find((e) => e.id === etapa)?.label}".`}
            />
          }
        />
      )}
    </View>
  );
}

function KanbanCard({
  item,
  canMove,
  onMove,
}: {
  item: CardRow;
  canMove: boolean;
  onMove: (c: CardRow) => void;
}) {
  const dias = item.dias_atraso ?? 0;
  let tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral' = 'neutral';
  let diasLabel = '—';
  if (item.etapa === 'pago') { tone = 'success'; diasLabel = 'Quitado'; }
  else if (item.etapa === 'arquivado') { tone = 'neutral'; diasLabel = 'Arquivado'; }
  else if (dias > 45) { tone = 'danger'; diasLabel = `${dias}d atraso`; }
  else if (dias > 15) { tone = 'danger'; diasLabel = `${dias}d atraso`; }
  else if (dias > 0) { tone = 'warning'; diasLabel = `${dias}d atraso`; }
  else if (dias === 0) { tone = 'warning'; diasLabel = 'Vence hoje'; }
  else { tone = 'info'; diasLabel = `Em ${Math.abs(dias)}d`; }

  return (
    <Card style={styles.card}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.cardNome} numberOfLines={1}>
            {item.clientes?.nome ?? 'Cliente'}
          </Text>
          {item.clientes?.telefone ? (
            <Text style={styles.cardMeta} numberOfLines={1}>
              <Ionicons name="call-outline" size={11} color={colors.textMuted} /> {item.clientes.telefone}
            </Text>
          ) : null}
        </View>
        <Badge label={diasLabel} tone={tone} />
      </View>

      <View style={styles.cardRow}>
        <View>
          <Text style={styles.cardLabel}>Dívida</Text>
          <Text style={styles.cardValor}>{formatCurrency(item.valor_divida)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.cardLabel}>Tentativas</Text>
          <Text style={styles.cardValorSmall}>
            {formatNumber(item.tentativas_contato || 0)}
            {item.ultimo_contato ? ` · ${formatDateBR(item.ultimo_contato)}` : ''}
          </Text>
        </View>
      </View>

      {item.observacao ? (
        <Text style={styles.cardObs} numberOfLines={2}>
          <Ionicons name="document-text-outline" size={12} color={colors.textMuted} /> {item.observacao}
        </Text>
      ) : null}

      {canMove && (
        <Pressable onPress={() => onMove(item)} style={styles.moveBtn}>
          <Ionicons name="swap-horizontal-outline" size={14} color={colors.primary} />
          <Text style={styles.moveText}>Mover etapa</Text>
        </Pressable>
      )}
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

  chipsScroll: { flexGrow: 0, flexShrink: 0, height: 52 },
  chipsRow: { alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.xs,
  },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { color: colors.textMuted, fontSize: fontSizes.xs, fontWeight: '600' },
  chipCount: { color: colors.textDim, fontSize: fontSizes.xs, fontWeight: '700' },
  chipTextActive: { color: colors.primaryFg },

  list: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl },

  card: { gap: spacing.sm, padding: spacing.md },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardNome: { color: colors.text, fontSize: fontSizes.md, fontWeight: '600' },
  cardMeta: { color: colors.textMuted, fontSize: fontSizes.xs },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  cardLabel: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardValor: { color: colors.text, fontSize: fontSizes.lg, fontWeight: '700' },
  cardValorSmall: { color: colors.textMuted, fontSize: fontSizes.xs },
  cardObs: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    fontStyle: 'italic',
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  moveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  moveText: { color: colors.primary, fontSize: fontSizes.xs, fontWeight: '700' },
});
