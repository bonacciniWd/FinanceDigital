/**
 * ClientesScreen — lista de clientes com busca e paginação infinita.
 */
import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  Pressable,
  RefreshControl,
} from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { ScreenLoading, EmptyState } from '../components/ui/State';
import { colors, fontSizes, radii, spacing } from '../theme/tokens';

const PAGE_SIZE = 30;

interface ClienteRow {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  cpf: string | null;
  status: 'em_dia' | 'a_vencer' | 'vencido' | null;
  bonus_acumulado: number | null;
  score_interno: number | null;
}

interface PageResult {
  rows: ClienteRow[];
  nextOffset: number | null;
}

async function fetchPage(offset: number, search: string): Promise<PageResult> {
  let query = supabase
    .from('clientes')
    .select('id, nome, email, telefone, cpf, status, bonus_acumulado, score_interno')
    .order('nome', { ascending: true })
    .range(offset, offset + PAGE_SIZE - 1);

  const term = search.trim();
  if (term) {
    // ilike em nome ou cpf (telefone às vezes tem formatação)
    query = query.or(`nome.ilike.%${term}%,cpf.ilike.%${term}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as ClienteRow[];
  return {
    rows,
    nextOffset: rows.length < PAGE_SIZE ? null : offset + PAGE_SIZE,
  };
}

export function ClientesScreen() {
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['clientes-mobile', search],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchPage(pageParam as number, search),
    getNextPageParam: (last) => last.nextOffset,
  });

  const rows = useMemo(
    () => (data?.pages ?? []).flatMap((p) => p.rows),
    [data]
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refetch(); } finally { setRefreshing(false); }
  }, [refetch]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.h1}>Clientes</Text>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por nome ou CPF…"
            placeholderTextColor={colors.textDim}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {!!search && (
            <Pressable onPress={() => setSearch('')} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      {isLoading && rows.length === 0 ? (
        <ScreenLoading />
      ) : rows.length === 0 ? (
        <EmptyState title="Nenhum cliente" hint={search ? 'Sem resultados para a busca.' : 'Cadastre clientes pela web.'} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <ClienteItem item={item} />}
          onEndReached={() => hasNextPage && fetchNextPage()}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            isFetchingNextPage ? (
              <Text style={styles.loadMore}>Carregando…</Text>
            ) : !hasNextPage && rows.length > 0 ? (
              <Text style={styles.loadMore}>— fim da lista —</Text>
            ) : null
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        />
      )}
    </View>
  );
}

function ClienteItem({ item }: { item: ClienteRow }) {
  const tone =
    item.status === 'em_dia' ? 'success' :
    item.status === 'a_vencer' ? 'warning' :
    item.status === 'vencido' ? 'danger' : 'neutral';
  const label =
    item.status === 'em_dia' ? 'Em dia' :
    item.status === 'a_vencer' ? 'À vencer' :
    item.status === 'vencido' ? 'Vencido' : 'Sem status';

  return (
    <Card style={styles.item}>
      <View style={styles.itemHeader}>
        <Text style={styles.nome} numberOfLines={1}>{item.nome}</Text>
        <Badge label={label} tone={tone} />
      </View>
      <Text style={styles.meta} numberOfLines={1}>
        {item.cpf ? `CPF: ${item.cpf}` : 'Sem CPF'}
        {item.telefone ? ` · ${item.telefone}` : ''}
      </Text>
      <View style={styles.itemFooter}>
        <Text style={styles.score}>Score: {item.score_interno ?? 0}</Text>
        {Number(item.bonus_acumulado) > 0 && (
          <Text style={styles.bonus}>Bônus: R$ {Number(item.bonus_acumulado).toFixed(2)}</Text>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm, gap: spacing.md },
  h1: { color: colors.text, fontSize: fontSizes.xxl, fontWeight: '700' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.bgElevated,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: fontSizes.md,
    paddingVertical: spacing.sm + 2,
  },

  list: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl },
  item: { gap: 4, padding: spacing.md },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  nome: { color: colors.text, fontSize: fontSizes.md, fontWeight: '600', flex: 1 },
  meta: { color: colors.textMuted, fontSize: fontSizes.sm },
  itemFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  score: { color: colors.textMuted, fontSize: fontSizes.xs, fontWeight: '600' },
  bonus: { color: colors.success, fontSize: fontSizes.xs, fontWeight: '600' },

  loadMore: {
    color: colors.textMuted,
    textAlign: 'center',
    fontSize: fontSizes.sm,
    paddingVertical: spacing.lg,
  },
});
