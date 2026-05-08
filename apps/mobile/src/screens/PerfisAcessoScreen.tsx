/**
 * PerfisAcessoScreen — visualização (read-only) dos perfis RBAC.
 *
 * Mostra os 4 roles (admin/gerencia/comercial/cobranca) com:
 *   • contagem real de usuários da tabela `profiles`
 *   • permissões persistidas em `configuracoes_sistema` chave `role_permissions`
 *
 * Edição é feita apenas pelo admin no app web (modo incógnito).
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
import { Badge } from '../components/ui/Badge';
import { ScreenLoading, EmptyState } from '../components/ui/State';
import { colors, fontSizes, radii, spacing } from '../theme/tokens';
import { formatNumber } from '../lib/format';

type ModuleKey =
  | 'dashboard'
  | 'clientes'
  | 'emprestimos'
  | 'cobranca'
  | 'kanban'
  | 'relatorios'
  | 'configuracoes'
  | 'equipe';

type RolePermissions = Record<ModuleKey, boolean>;
type AllRolePermissions = Record<string, RolePermissions>;

interface PerfilConfig {
  role: string;
  nome: string;
  descricao: string;
  tone: 'danger' | 'info' | 'warning' | 'success';
}

const PERFIS_CONFIG: PerfilConfig[] = [
  { role: 'admin',     nome: 'Administrador', descricao: 'Acesso total ao sistema',     tone: 'danger'  },
  { role: 'gerencia',  nome: 'Gerente',       descricao: 'Gerencia operações e equipe', tone: 'info'    },
  { role: 'comercial', nome: 'Comercial',     descricao: 'Captação e indicações',       tone: 'warning' },
  { role: 'cobranca',  nome: 'Cobrador',      descricao: 'Ações de cobrança',           tone: 'success' },
];

const MODULOS: { key: ModuleKey; label: string }[] = [
  { key: 'dashboard',     label: 'Dashboard' },
  { key: 'clientes',      label: 'Clientes' },
  { key: 'emprestimos',   label: 'Empréstimos' },
  { key: 'cobranca',      label: 'Cobrança' },
  { key: 'kanban',        label: 'Kanban' },
  { key: 'relatorios',    label: 'Relatórios' },
  { key: 'configuracoes', label: 'Configurações' },
  { key: 'equipe',        label: 'Equipe' },
];

const DEFAULT_PERMS: AllRolePermissions = {
  admin:     { dashboard: true,  clientes: true,  emprestimos: true,  cobranca: true,  kanban: true,  relatorios: true,  configuracoes: true,  equipe: true  },
  gerencia:  { dashboard: true,  clientes: true,  emprestimos: true,  cobranca: true,  kanban: true,  relatorios: true,  configuracoes: false, equipe: true  },
  comercial: { dashboard: true,  clientes: false, emprestimos: false, cobranca: false, kanban: false, relatorios: false, configuracoes: false, equipe: false },
  cobranca:  { dashboard: true,  clientes: true,  emprestimos: false, cobranca: true,  kanban: true,  relatorios: false, configuracoes: false, equipe: false },
};

interface PerfilData {
  counts: Record<string, number>;
  perms: AllRolePermissions;
}

async function fetchPerfis(): Promise<PerfilData> {
  const [{ data: profiles, error: e1 }, { data: configRow }] = await Promise.all([
    (supabase as any).from('profiles').select('role'),
    (supabase as any)
      .from('configuracoes_sistema')
      .select('valor')
      .eq('chave', 'role_permissions')
      .maybeSingle(),
  ]);
  if (e1) throw new Error(e1.message);

  const counts: Record<string, number> = {};
  for (const row of (profiles ?? []) as { role: string }[]) {
    counts[row.role] = (counts[row.role] || 0) + 1;
  }

  let perms: AllRolePermissions = { ...DEFAULT_PERMS };
  if (configRow?.valor && typeof configRow.valor === 'object') {
    perms = { ...DEFAULT_PERMS, ...(configRow.valor as AllRolePermissions) };
  }

  return { counts, perms };
}

export function PerfisAcessoScreen() {
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['perfis-acesso-mobile'],
    queryFn: fetchPerfis,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refetch(); } finally { setRefreshing(false); }
  }, [refetch]);

  const counts = data?.counts ?? {};
  const perms = data?.perms ?? DEFAULT_PERMS;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.h1}>Perfis de Acesso</Text>
        <Text style={styles.subtitle}>Permissões por papel (RBAC) · somente leitura</Text>
      </View>

      <FlatList
        data={PERFIS_CONFIG}
        keyExtractor={(p) => p.role}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <PerfilCard perfil={item} count={counts[item.role] ?? 0} perms={perms[item.role] ?? DEFAULT_PERMS[item.role]} />
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListFooterComponent={
          <Card style={styles.footer}>
            <Ionicons name="information-circle-outline" size={18} color={colors.info} />
            <Text style={styles.footerText}>
              A edição de permissões é exclusiva do admin no app web (em janela anônima).
            </Text>
          </Card>
        }
        ListEmptyComponent={isLoading ? <ScreenLoading /> : <EmptyState title="Sem perfis" />}
      />
    </View>
  );
}

function PerfilCard({
  perfil,
  count,
  perms,
}: {
  perfil: PerfilConfig;
  count: number;
  perms: RolePermissions;
}) {
  const ativos = MODULOS.filter((m) => perms?.[m.key]);

  return (
    <Card style={styles.card}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardNome}>{perfil.nome}</Text>
          <Text style={styles.cardDesc}>{perfil.descricao}</Text>
        </View>
        <Badge label={`${formatNumber(count)} usuário(s)`} tone={perfil.tone} />
      </View>

      <Text style={styles.permsLabel}>
        Acesso a {ativos.length}/{MODULOS.length} módulos
      </Text>

      <View style={styles.modulosWrap}>
        {MODULOS.map((m) => {
          const ativo = !!perms?.[m.key];
          return (
            <View key={m.key} style={[styles.modChip, ativo ? styles.modChipOn : styles.modChipOff]}>
              <Ionicons
                name={ativo ? 'checkmark-circle' : 'close-circle'}
                size={12}
                color={ativo ? colors.success : colors.textDim}
              />
              <Text style={[styles.modText, { color: ativo ? colors.text : colors.textDim }]}>
                {m.label}
              </Text>
            </View>
          );
        })}
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
  cardNome: { color: colors.text, fontSize: fontSizes.md, fontWeight: '700' },
  cardDesc: { color: colors.textMuted, fontSize: fontSizes.xs },

  permsLabel: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  modulosWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  modChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  modChipOn: { backgroundColor: colors.bgElevated, borderColor: colors.success },
  modChipOff: { backgroundColor: colors.bgElevated, borderColor: colors.border, opacity: 0.7 },
  modText: { fontSize: 11, fontWeight: '600' },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  footerText: { flex: 1, color: colors.textMuted, fontSize: fontSizes.xs },
});
