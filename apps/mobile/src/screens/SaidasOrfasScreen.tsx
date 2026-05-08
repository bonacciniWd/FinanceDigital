/**
 * SaidasOrfasScreen — Pix saídos do extrato sem vínculo (empréstimo/gasto).
 *
 * KPIs: Pendentes (qtd e valor), Vinculadas, Ignoradas.
 * Filtros por status + busca por nome/chave/CPF.
 * Admin pode marcar como "ignorada" (RPC `ignorar_saida_orfa`).
 *
 * Fonte: tabela `saidas_orfas` (Supabase).
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
  TextInput,
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

type StatusOrfa = 'pendente' | 'vinculada_emprestimo' | 'vinculada_gasto' | 'ignorada';

interface SaidaOrfaRow {
  id: string;
  e2e_id: string | null;
  id_envio: string | null;
  valor: number;
  horario: string;
  chave_favorecido: string | null;
  nome_favorecido: string | null;
  cpf_cnpj_favorecido: string | null;
  gateway: string;
  status: StatusOrfa;
  emprestimo_id_match: string | null;
  gasto_id_match: string | null;
  observacao: string | null;
}

const FILTROS: Array<{ id: 'todas' | StatusOrfa; label: string }> = [
  { id: 'pendente',              label: 'Pendentes' },
  { id: 'vinculada_emprestimo',  label: 'Empréstimo' },
  { id: 'vinculada_gasto',       label: 'Gasto' },
  { id: 'ignorada',              label: 'Ignoradas' },
  { id: 'todas',                 label: 'Todas' },
];

async function fetchOrfas(filtro: 'todas' | StatusOrfa): Promise<SaidaOrfaRow[]> {
  let q = supabase
    .from('saidas_orfas')
    .select('*')
    .order('horario', { ascending: false })
    .limit(500);
  if (filtro !== 'todas') q = q.eq('status', filtro);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as SaidaOrfaRow[];
}

function statusInfo(s: StatusOrfa): { tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral'; label: string } {
  switch (s) {
    case 'pendente':              return { tone: 'warning', label: 'Pendente' };
    case 'vinculada_emprestimo':  return { tone: 'success', label: 'Empréstimo' };
    case 'vinculada_gasto':       return { tone: 'info',    label: 'Gasto' };
    case 'ignorada':              return { tone: 'neutral', label: 'Ignorada' };
    default:                      return { tone: 'neutral', label: String(s) };
  }
}

export function SaidasOrfasScreen() {
  const [filtro, setFiltro] = useState<'todas' | StatusOrfa>('pendente');
  const [busca, setBusca] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'admin' || user?.role === 'gerencia';

  const { data: orfas = [], isLoading, refetch } = useQuery({
    queryKey: ['saidas-orfas-mobile', filtro],
    queryFn: () => fetchOrfas(filtro),
  });

  const ignorar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('ignorar_saida_orfa', { p_orfa_id: id, p_observacao: null });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saidas-orfas-mobile'] });
    },
    onError: (err: Error) => Alert.alert('Erro', err.message),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refetch(); } finally { setRefreshing(false); }
  }, [refetch]);

  const stats = useMemo(() => {
    const pendentes = orfas.filter((o) => o.status === 'pendente');
    return {
      qtdPendentes: pendentes.length,
      valorPendentes: pendentes.reduce((s, o) => s + Number(o.valor || 0), 0),
      total: orfas.length,
    };
  }, [orfas]);

  const filtradas = useMemo(() => {
    if (!busca.trim()) return orfas;
    const t = busca.toLowerCase();
    return orfas.filter((o) =>
      [o.nome_favorecido, o.chave_favorecido, o.cpf_cnpj_favorecido, o.e2e_id]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(t))
    );
  }, [orfas, busca]);

  const handleIgnorar = (item: SaidaOrfaRow) => {
    Alert.alert(
      'Ignorar saída',
      `Marcar como ignorada o Pix de ${formatCurrency(item.valor)}${item.nome_favorecido ? ` para ${item.nome_favorecido}` : ''}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Ignorar', style: 'destructive', onPress: () => ignorar.mutate(item.id) },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.h1}>Saídas Órfãs</Text>
        <Text style={styles.subtitle}>
          Pix enviados sem vínculo · {filtradas.length} item(ns)
        </Text>
      </View>

      <FlatList
        data={filtradas}
        keyExtractor={(o) => o.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={{ gap: spacing.sm, marginBottom: spacing.sm }}>
            <View style={styles.kpis}>
              <StatCard
                label="Pendentes"
                value={formatNumber(stats.qtdPendentes)}
                hint={formatCurrency(stats.valorPendentes)}
                tone="warning"
              />
              <StatCard label="Total" value={formatNumber(stats.total)} />
            </View>

            <View style={styles.searchWrap}>
              <Ionicons name="search-outline" size={16} color={colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar por nome, chave, CPF ou E2E..."
                placeholderTextColor={colors.textDim}
                value={busca}
                onChangeText={setBusca}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {busca ? (
                <Pressable onPress={() => setBusca('')}>
                  <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                </Pressable>
              ) : null}
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
          <OrfaItem item={item} canIgnorar={isAdmin && item.status === 'pendente'} onIgnorar={handleIgnorar} />
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          isLoading ? <ScreenLoading /> : <EmptyState title="Nenhum item" hint="Sem saídas para este filtro." />
        }
      />
    </View>
  );
}

function OrfaItem({
  item,
  canIgnorar,
  onIgnorar,
}: {
  item: SaidaOrfaRow;
  canIgnorar: boolean;
  onIgnorar: (o: SaidaOrfaRow) => void;
}) {
  const s = statusInfo(item.status);
  const horarioBR = item.horario ? formatDateBR(item.horario.slice(0, 10)) : '—';
  const horaBR = item.horario ? item.horario.slice(11, 16) : '';

  return (
    <Card style={styles.item}>
      <View style={styles.itemTop}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.itemNome} numberOfLines={1}>
            {item.nome_favorecido || 'Favorecido desconhecido'}
          </Text>
          <Text style={styles.itemMeta} numberOfLines={1}>
            {horarioBR}{horaBR ? ` · ${horaBR}` : ''} · {(item.gateway || 'pix').toUpperCase()}
          </Text>
        </View>
        <Badge label={s.label} tone={s.tone} />
      </View>

      <View style={styles.itemRow}>
        <Text style={styles.itemValor}>{formatCurrency(item.valor)}</Text>
      </View>

      {item.chave_favorecido ? (
        <Text style={styles.itemDetail} numberOfLines={1}>
          <Ionicons name="key-outline" size={11} color={colors.textMuted} /> {item.chave_favorecido}
        </Text>
      ) : null}
      {item.cpf_cnpj_favorecido ? (
        <Text style={styles.itemDetail} numberOfLines={1}>
          <Ionicons name="card-outline" size={11} color={colors.textMuted} /> {item.cpf_cnpj_favorecido}
        </Text>
      ) : null}
      {item.e2e_id ? (
        <Text style={styles.itemDetail} numberOfLines={1}>
          <Ionicons name="finger-print-outline" size={11} color={colors.textMuted} /> {item.e2e_id}
        </Text>
      ) : null}
      {item.observacao ? (
        <Text style={styles.itemObs} numberOfLines={2}>{item.observacao}</Text>
      ) : null}

      {canIgnorar ? (
        <Pressable onPress={() => onIgnorar(item)} style={styles.ignorarBtn}>
          <Ionicons name="eye-off-outline" size={14} color={colors.textMuted} />
          <Text style={styles.ignorarText}>Ignorar</Text>
        </Pressable>
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

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.bgElevated,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: fontSizes.sm,
    paddingVertical: spacing.sm,
  },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
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

  item: { gap: spacing.xs, padding: spacing.md },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  itemNome: { color: colors.text, fontSize: fontSizes.md, fontWeight: '600' },
  itemMeta: { color: colors.textMuted, fontSize: fontSizes.xs },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemValor: { color: colors.text, fontSize: fontSizes.lg, fontWeight: '700' },
  itemDetail: { color: colors.textMuted, fontSize: fontSizes.xs },
  itemObs: { color: colors.textMuted, fontSize: fontSizes.xs, fontStyle: 'italic' },

  ignorarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    marginTop: spacing.xs,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  ignorarText: { color: colors.textMuted, fontSize: fontSizes.xs, fontWeight: '700' },
});
