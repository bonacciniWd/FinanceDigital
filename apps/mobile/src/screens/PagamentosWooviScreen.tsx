/**
 * PagamentosWooviScreen — gestão completa de pagamentos Pix (Woovi/EFI).
 *
 * Tabs:
 *  • Cobranças    — woovi_charges (filtros status + busca + período)
 *  • Transações   — woovi_transactions (entradas/saídas com tipo)
 *  • Desembolsos  — empréstimos aprovados aguardando envio (admin marca como pago)
 *  • Extratos     — timeline unificada (cobranças pagas + transações)
 *
 * Filtros globais: período (7/30/90/365 dias), busca por nome/ID.
 * Export: CSV via Share API por aba.
 *
 * Fontes Supabase: `woovi_charges`, `woovi_transactions`, `emprestimos`,
 * `analises_credito`, `clientes`.
 */
import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  Linking,
  Alert,
  TextInput,
  Share,
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

/* ─────────────────────────── tipos ─────────────────────────── */

type ChargeStatus = 'ACTIVE' | 'COMPLETED' | 'EXPIRED' | 'ERROR';
type TxStatus = 'PENDING' | 'CONFIRMED' | 'FAILED' | 'REFUNDED';
type TxTipo = 'CHARGE' | 'PAYMENT' | 'SPLIT' | 'WITHDRAWAL';
type TabId = 'cobrancas' | 'transacoes' | 'desembolsos' | 'extratos';
type PeriodoId = '7d' | '30d' | '90d' | '365d';

interface ChargeRow {
  id: string;
  parcela_id: string | null;
  emprestimo_id: string | null;
  cliente_id: string | null;
  woovi_charge_id: string;
  woovi_txid: string | null;
  valor: number;
  status: ChargeStatus;
  br_code: string | null;
  payment_link: string | null;
  expiration_date: string | null;
  paid_at: string | null;
  gateway: string | null;
  created_at: string;
  clientes?: { nome: string; telefone: string | null } | null;
}

interface TxRow {
  id: string;
  emprestimo_id: string | null;
  cliente_id: string | null;
  charge_id: string | null;
  tipo: TxTipo;
  valor: number;
  status: TxStatus;
  pix_key: string | null;
  destinatario_nome: string | null;
  end_to_end_id: string | null;
  descricao: string | null;
  gateway: string | null;
  confirmed_at: string | null;
  created_at: string;
  clientes?: { nome: string; telefone: string | null } | null;
}

interface DesembolsoRow {
  id: string;
  cliente_id: string;
  cliente_nome: string;
  valor: number;
  desembolsado: boolean;
  desembolsado_em: string | null;
  pix_key: string | null;
  pix_key_type: string | null;
  cliente_telefone: string | null;
  cliente_cpf: string | null;
  created_at: string;
}

interface ExtratoItemT {
  id: string;
  direction: 'entrada' | 'saida';
  valor: number;
  horario: string;
  nome: string;
  descricao: string;
  status: string;
}

/* ─────────────────────────── helpers ─────────────────────────── */

const PERIODOS: Array<{ id: PeriodoId; label: string; dias: number }> = [
  { id: '7d',   label: '7 dias',   dias: 7 },
  { id: '30d',  label: '30 dias',  dias: 30 },
  { id: '90d',  label: '90 dias',  dias: 90 },
  { id: '365d', label: '1 ano',    dias: 365 },
];

function periodoStart(p: PeriodoId): number {
  const d = new Date();
  const dias = PERIODOS.find((x) => x.id === p)?.dias ?? 30;
  d.setDate(d.getDate() - dias);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function chargeStatusInfo(s: ChargeStatus): { tone: 'success' | 'warning' | 'danger' | 'neutral'; label: string } {
  switch (s) {
    case 'COMPLETED': return { tone: 'success', label: 'Paga' };
    case 'ACTIVE':    return { tone: 'warning', label: 'Ativa' };
    case 'EXPIRED':   return { tone: 'danger',  label: 'Expirada' };
    case 'ERROR':     return { tone: 'danger',  label: 'Erro' };
    default:          return { tone: 'neutral', label: String(s) };
  }
}

function txStatusInfo(s: TxStatus): { tone: 'success' | 'warning' | 'danger' | 'neutral'; label: string } {
  switch (s) {
    case 'CONFIRMED': return { tone: 'success', label: 'Confirmada' };
    case 'PENDING':   return { tone: 'warning', label: 'Pendente' };
    case 'FAILED':    return { tone: 'danger',  label: 'Falhou' };
    case 'REFUNDED':  return { tone: 'neutral', label: 'Estornada' };
    default:          return { tone: 'neutral', label: String(s) };
  }
}

const TX_TIPO_LABEL: Record<TxTipo, string> = {
  CHARGE:     'Recebimento',
  PAYMENT:    'Pagamento Pix',
  SPLIT:      'Split/Comissão',
  WITHDRAWAL: 'Saque',
};

function csvEscape(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

async function shareCsv(filename: string, headers: string[], rows: (string | number | null)[][]) {
  const csv = [headers, ...rows]
    .map((r) => r.map(csvEscape).join(','))
    .join('\n');
  try {
    await Share.share({ message: csv, title: filename });
  } catch (err: any) {
    Alert.alert('Erro ao compartilhar', err?.message ?? 'Falha desconhecida');
  }
}

/* ─────────────────────────── queries ─────────────────────────── */

async function fetchCharges(): Promise<ChargeRow[]> {
  const PAGE = 1000;
  const all: ChargeRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('woovi_charges')
      .select(
        'id, parcela_id, emprestimo_id, cliente_id, woovi_charge_id, woovi_txid, valor, status, br_code, payment_link, expiration_date, paid_at, gateway, created_at, clientes:cliente_id (nome, telefone)'
      )
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...(data as unknown as ChargeRow[]));
    if (data.length < PAGE) break;
  }
  return all;
}

async function fetchTransacoes(): Promise<TxRow[]> {
  const PAGE = 1000;
  const all: TxRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('woovi_transactions')
      .select(
        'id, emprestimo_id, cliente_id, charge_id, tipo, valor, status, pix_key, destinatario_nome, end_to_end_id, descricao, gateway, confirmed_at, created_at, clientes:cliente_id (nome, telefone)'
      )
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...(data as unknown as TxRow[]));
    if (data.length < PAGE) break;
  }
  return all;
}

async function fetchDesembolsos(): Promise<DesembolsoRow[]> {
  const { data: analises, error: e1 } = await supabase
    .from('analises_credito')
    .select('id, status')
    .eq('status', 'aprovado');
  if (e1) throw new Error(e1.message);
  const aprovIds = new Set((analises ?? []).map((a: any) => a.id as string));
  if (aprovIds.size === 0) return [];

  const { data: emps, error: e2 } = await supabase
    .from('emprestimos')
    .select(
      'id, cliente_id, valor, desembolsado, desembolsado_em, analise_id, created_at, clientes:cliente_id (nome, telefone, cpf, pix_key, pix_key_type)'
    )
    .order('created_at', { ascending: false });
  if (e2) throw new Error(e2.message);

  return (emps ?? [])
    .filter((e: any) => e.analise_id && aprovIds.has(e.analise_id))
    .map<DesembolsoRow>((e: any) => ({
      id: e.id,
      cliente_id: e.cliente_id,
      cliente_nome: e.clientes?.nome ?? 'Cliente',
      valor: Number(e.valor || 0),
      desembolsado: !!e.desembolsado,
      desembolsado_em: e.desembolsado_em,
      pix_key: e.clientes?.pix_key ?? null,
      pix_key_type: e.clientes?.pix_key_type ?? null,
      cliente_telefone: e.clientes?.telefone ?? null,
      cliente_cpf: e.clientes?.cpf ?? null,
      created_at: e.created_at,
    }));
}

/* ─────────────────────────── tela ─────────────────────────── */

export function PagamentosWooviScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'admin' || (user as any)?.role === 'gerencia';

  const [tab, setTab] = useState<TabId>('cobrancas');
  const [periodo, setPeriodo] = useState<PeriodoId>('30d');
  const [busca, setBusca] = useState('');
  const [chargeStatusFilter, setChargeStatusFilter] = useState<ChargeStatus | 'ALL'>('ALL');
  const [refreshing, setRefreshing] = useState(false);

  const { data: charges = [], isLoading: loadingCharges, refetch: refetchCh } = useQuery({
    queryKey: ['pagamentos-woovi-charges'],
    queryFn: fetchCharges,
  });
  const { data: txs = [], isLoading: loadingTx, refetch: refetchTx } = useQuery({
    queryKey: ['pagamentos-woovi-tx'],
    queryFn: fetchTransacoes,
  });
  const { data: desembolsos = [], isLoading: loadingDes, refetch: refetchDes } = useQuery({
    queryKey: ['pagamentos-woovi-desembolsos'],
    queryFn: fetchDesembolsos,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetchCh(), refetchTx(), refetchDes()]);
    } finally {
      setRefreshing(false);
    }
  }, [refetchCh, refetchTx, refetchDes]);

  const desembolsar = useMutation({
    mutationFn: async (emprestimoId: string) => {
      const { error } = await (supabase.from('emprestimos') as any)
        .update({
          desembolsado: true,
          desembolsado_em: new Date().toISOString(),
          desembolsado_por: user?.id ?? null,
        })
        .eq('id', emprestimoId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pagamentos-woovi-desembolsos'] });
    },
    onError: (err: Error) => Alert.alert('Erro', err.message),
  });

  const sincePeriodo = useMemo(() => periodoStart(periodo), [periodo]);
  const term = busca.trim().toLowerCase();

  const chargesPeriodo = useMemo(
    () => charges.filter((c) => new Date(c.created_at).getTime() >= sincePeriodo),
    [charges, sincePeriodo]
  );
  const txsPeriodo = useMemo(
    () => txs.filter((t) => new Date(t.created_at).getTime() >= sincePeriodo),
    [txs, sincePeriodo]
  );

  const filteredCharges = useMemo(() => {
    return chargesPeriodo.filter((c) => {
      if (chargeStatusFilter !== 'ALL' && c.status !== chargeStatusFilter) return false;
      if (!term) return true;
      const hay = `${c.clientes?.nome ?? ''} ${c.woovi_charge_id} ${c.woovi_txid ?? ''}`.toLowerCase();
      return hay.includes(term);
    });
  }, [chargesPeriodo, chargeStatusFilter, term]);

  const filteredTxs = useMemo(() => {
    if (!term) return txsPeriodo;
    return txsPeriodo.filter((t) =>
      `${t.clientes?.nome ?? ''} ${t.destinatario_nome ?? ''} ${t.descricao ?? ''} ${t.end_to_end_id ?? ''}`
        .toLowerCase()
        .includes(term)
    );
  }, [txsPeriodo, term]);

  const filteredDesembolsos = useMemo(() => {
    const list = desembolsos.filter((d) => !d.desembolsado);
    if (!term) return list;
    return list.filter((d) =>
      `${d.cliente_nome} ${d.cliente_cpf ?? ''} ${d.pix_key ?? ''}`.toLowerCase().includes(term)
    );
  }, [desembolsos, term]);

  const extrato = useMemo<ExtratoItemT[]>(() => {
    const items: ExtratoItemT[] = [];
    for (const c of chargesPeriodo) {
      if (c.status !== 'COMPLETED') continue;
      items.push({
        id: c.id,
        direction: 'entrada',
        valor: Number(c.valor || 0),
        horario: c.paid_at ?? c.created_at,
        nome: c.clientes?.nome ?? 'Cliente',
        descricao: `Cobrança Pix${c.woovi_txid ? ` · ${c.woovi_txid.slice(0, 12)}…` : ''}`,
        status: 'CONFIRMED',
      });
    }
    for (const t of txsPeriodo) {
      const isEntrada = t.tipo === 'CHARGE';
      items.push({
        id: t.id,
        direction: isEntrada ? 'entrada' : 'saida',
        valor: Number(t.valor || 0),
        horario: t.confirmed_at ?? t.created_at,
        nome: t.destinatario_nome ?? t.clientes?.nome ?? '—',
        descricao: `${TX_TIPO_LABEL[t.tipo] ?? t.tipo}${t.descricao ? ` · ${t.descricao}` : ''}`,
        status: t.status,
      });
    }
    items.sort((a, b) => new Date(b.horario).getTime() - new Date(a.horario).getTime());
    if (!term) return items;
    return items.filter((i) => `${i.nome} ${i.descricao}`.toLowerCase().includes(term));
  }, [chargesPeriodo, txsPeriodo, term]);

  const kpis = useMemo(() => {
    const ativas = chargesPeriodo.filter((c) => c.status === 'ACTIVE');
    const pagas = chargesPeriodo.filter((c) => c.status === 'COMPLETED');
    const expiradas = chargesPeriodo.filter((c) => c.status === 'EXPIRED');
    const valorAtivo = ativas.reduce((s, c) => s + Number(c.valor || 0), 0);
    const valorPago = pagas.reduce((s, c) => s + Number(c.valor || 0), 0);
    const txEntradas = txsPeriodo
      .filter((t) => t.tipo === 'CHARGE' && t.status === 'CONFIRMED')
      .reduce((s, t) => s + Number(t.valor || 0), 0);
    const txSaidas = txsPeriodo
      .filter((t) => t.tipo !== 'CHARGE' && t.status === 'CONFIRMED')
      .reduce((s, t) => s + Number(t.valor || 0), 0);
    const aguardando = desembolsos.filter((d) => !d.desembolsado);
    const valorAguardando = aguardando.reduce((s, d) => s + d.valor, 0);
    const extEntradas = extrato.filter((i) => i.direction === 'entrada').reduce((s, i) => s + i.valor, 0);
    const extSaidas = extrato.filter((i) => i.direction === 'saida').reduce((s, i) => s + i.valor, 0);
    return {
      ativas: ativas.length, valorAtivo,
      pagas: pagas.length, valorPago,
      expiradas: expiradas.length,
      txEntradas, txSaidas,
      aguardandoCount: aguardando.length, valorAguardando,
      extEntradas, extSaidas, saldoPeriodo: extEntradas - extSaidas,
    };
  }, [chargesPeriodo, txsPeriodo, desembolsos, extrato]);

  const handleExport = () => {
    if (tab === 'cobrancas') {
      shareCsv(
        `cobrancas-woovi-${periodo}.csv`,
        ['Data', 'Cliente', 'Valor', 'Status', 'Charge ID', 'TXID', 'Pago em'],
        filteredCharges.map((c) => [
          formatDateBR(c.created_at.slice(0, 10)),
          c.clientes?.nome ?? '',
          Number(c.valor || 0).toFixed(2),
          chargeStatusInfo(c.status).label,
          c.woovi_charge_id,
          c.woovi_txid ?? '',
          c.paid_at ? formatDateBR(c.paid_at.slice(0, 10)) : '',
        ])
      );
    } else if (tab === 'transacoes') {
      shareCsv(
        `transacoes-woovi-${periodo}.csv`,
        ['Data', 'Tipo', 'Destinatário', 'Valor', 'Status', 'Chave Pix', 'E2E', 'Descrição'],
        filteredTxs.map((t) => [
          formatDateBR(t.created_at.slice(0, 10)),
          TX_TIPO_LABEL[t.tipo] ?? t.tipo,
          t.destinatario_nome ?? t.clientes?.nome ?? '',
          Number(t.valor || 0).toFixed(2),
          txStatusInfo(t.status).label,
          t.pix_key ?? '',
          t.end_to_end_id ?? '',
          t.descricao ?? '',
        ])
      );
    } else if (tab === 'desembolsos') {
      shareCsv(
        `desembolsos-pendentes.csv`,
        ['Cliente', 'CPF', 'Valor', 'Chave Pix', 'Tipo', 'Telefone', 'Aprovado em'],
        filteredDesembolsos.map((d) => [
          d.cliente_nome,
          d.cliente_cpf ?? '',
          d.valor.toFixed(2),
          d.pix_key ?? '',
          d.pix_key_type ?? '',
          d.cliente_telefone ?? '',
          formatDateBR(d.created_at.slice(0, 10)),
        ])
      );
    } else {
      shareCsv(
        `extrato-pix-${periodo}.csv`,
        ['Data', 'Tipo', 'Nome', 'Descrição', 'Valor', 'Status'],
        extrato.map((i) => [
          formatDateBR(i.horario.slice(0, 10)),
          i.direction === 'entrada' ? 'Entrada' : 'Saída',
          i.nome,
          i.descricao,
          (i.direction === 'entrada' ? '+' : '-') + Number(i.valor || 0).toFixed(2),
          i.status,
        ])
      );
    }
  };

  const handleConfirmDesembolso = (item: DesembolsoRow) => {
    Alert.alert(
      'Confirmar desembolso',
      `Marcar empréstimo de ${item.cliente_nome} (${formatCurrency(item.valor)}) como desembolsado?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Confirmar', onPress: () => desembolsar.mutate(item.id) },
      ]
    );
  };

  const TABS: Array<{ id: TabId; label: string; icon: keyof typeof Ionicons.glyphMap; count?: number }> = [
    { id: 'cobrancas',   label: 'Cobranças',   icon: 'qr-code-outline',         count: filteredCharges.length },
    { id: 'transacoes',  label: 'Transações',  icon: 'swap-horizontal-outline', count: filteredTxs.length },
    ...(isAdmin
      ? ([{ id: 'desembolsos' as TabId, label: 'Desembolsos', icon: 'send-outline', count: filteredDesembolsos.length }])
      : []),
    { id: 'extratos',    label: 'Extratos',    icon: 'document-text-outline',   count: extrato.length },
  ];

  const isLoadingTab =
    (tab === 'cobrancas' && loadingCharges) ||
    (tab === 'transacoes' && loadingTx) ||
    (tab === 'desembolsos' && loadingDes) ||
    (tab === 'extratos' && (loadingCharges || loadingTx));

  const Header = (
    <View style={{ gap: spacing.sm, marginBottom: spacing.sm }}>
      <View style={styles.chipsRow}>
        {PERIODOS.map((p) => {
          const active = periodo === p.id;
          return (
            <Pressable key={p.id} onPress={() => setPeriodo(p.id)} style={[styles.chip, active && styles.chipActive]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{p.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {tab === 'cobrancas' && (
        <>
          <View style={styles.kpis}>
            <StatCard label="Pagas (período)" value={formatCurrency(kpis.valorPago)} hint={`${kpis.pagas} cobrança(s)`} tone="success" />
          </View>
          <View style={styles.kpis}>
            <StatCard label="Ativas" value={formatNumber(kpis.ativas)} hint={formatCurrency(kpis.valorAtivo)} tone="warning" />
            <StatCard label="Expiradas" value={formatNumber(kpis.expiradas)} tone="danger" />
          </View>
        </>
      )}
      {tab === 'transacoes' && (
        <View style={styles.kpis}>
          <StatCard label="Entradas" value={formatCurrency(kpis.txEntradas)} tone="success" />
          <StatCard label="Saídas" value={formatCurrency(kpis.txSaidas)} tone="danger" />
        </View>
      )}
      {tab === 'desembolsos' && (
        <View style={styles.kpis}>
          <StatCard
            label="Aguardando envio"
            value={formatNumber(kpis.aguardandoCount)}
            hint={formatCurrency(kpis.valorAguardando)}
            tone="warning"
          />
        </View>
      )}
      {tab === 'extratos' && (
        <>
          <View style={styles.infoBanner}>
            <Ionicons name="information-circle-outline" size={16} color={colors.info} />
            <Text style={styles.infoBannerText}>
              Extrato baseado nos registros do sistema. O extrato bancário em tempo real via API EFI está disponível apenas na versão web.
            </Text>
          </View>
          <View style={styles.kpis}>
            <StatCard label="Saldo período" value={formatCurrency(kpis.saldoPeriodo)} tone={kpis.saldoPeriodo >= 0 ? 'success' : 'danger'} />
          </View>
          <View style={styles.kpis}>
            <StatCard label="Entradas" value={formatCurrency(kpis.extEntradas)} tone="success" />
            <StatCard label="Saídas" value={formatCurrency(kpis.extSaidas)} tone="danger" />
          </View>
        </>
      )}

      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={16} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por nome, ID ou descrição..."
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

      {tab === 'cobrancas' && (
        <View style={styles.chipsRow}>
          {(['ALL', 'ACTIVE', 'COMPLETED', 'EXPIRED', 'ERROR'] as const).map((s) => {
            const active = chargeStatusFilter === s;
            const label = s === 'ALL' ? 'Todas' : chargeStatusInfo(s).label;
            return (
              <Pressable key={s} onPress={() => setChargeStatusFilter(s)} style={[styles.chip, active && styles.chipActive]}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.h1}>Pagamentos</Text>
            <Text style={styles.subtitle}>
              Pix Woovi/EFI · {PERIODOS.find((p) => p.id === periodo)?.label}
            </Text>
          </View>
          <Pressable onPress={handleExport} style={styles.exportBtn}>
            <Ionicons name="share-outline" size={16} color={colors.primary} />
            <Text style={styles.exportText}>CSV</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.tabsRow}>
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <Pressable key={t.id} onPress={() => setTab(t.id)} style={[styles.tab, active && styles.tabActive]}>
              <Ionicons name={t.icon} size={14} color={active ? colors.primary : colors.textMuted} />
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
              {typeof t.count === 'number' ? (
                <View style={[styles.tabBadge, active && styles.tabBadgeActive]}>
                  <Text style={[styles.tabBadgeText, active && styles.tabBadgeTextActive]}>{t.count}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {tab === 'cobrancas' && (
        <FlatList
          data={filteredCharges}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={Header}
          renderItem={({ item }) => <ChargeItem item={item} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={isLoadingTab ? <ScreenLoading /> : <EmptyState title="Sem cobranças" hint="Nenhuma cobrança neste filtro." />}
        />
      )}

      {tab === 'transacoes' && (
        <FlatList
          data={filteredTxs}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={Header}
          renderItem={({ item }) => <TxItem item={item} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={isLoadingTab ? <ScreenLoading /> : <EmptyState title="Sem transações" hint="Nenhuma transação no período." />}
        />
      )}

      {tab === 'desembolsos' && (
        <FlatList
          data={filteredDesembolsos}
          keyExtractor={(d) => d.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={Header}
          renderItem={({ item }) => (
            <DesembolsoItem
              item={item}
              loading={desembolsar.isPending}
              onConfirm={() => handleConfirmDesembolso(item)}
            />
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={isLoadingTab ? <ScreenLoading /> : <EmptyState title="Tudo em dia" hint="Sem empréstimos aguardando desembolso." />}
        />
      )}

      {tab === 'extratos' && (
        <FlatList
          data={extrato}
          keyExtractor={(i) => `${i.id}-${i.direction}`}
          contentContainerStyle={styles.list}
          ListHeaderComponent={Header}
          renderItem={({ item }) => <ExtratoItem item={item} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={isLoadingTab ? <ScreenLoading /> : <EmptyState title="Sem movimentação" hint="Nada no período selecionado." />}
        />
      )}
    </View>
  );
}

/* ─────────────────────────── itens ─────────────────────────── */

function ChargeItem({ item }: { item: ChargeRow }) {
  const s = chargeStatusInfo(item.status);
  const handleShowPix = () => {
    if (!item.br_code) {
      Alert.alert('Sem código', 'Esta cobrança não possui código Pix.');
      return;
    }
    Alert.alert('Código Pix', item.br_code, [{ text: 'OK' }]);
  };
  const handleOpenLink = async () => {
    if (!item.payment_link) {
      Alert.alert('Sem link', 'Esta cobrança não possui link.');
      return;
    }
    const can = await Linking.canOpenURL(item.payment_link);
    if (can) Linking.openURL(item.payment_link);
    else Alert.alert('Erro', 'Não foi possível abrir o link.');
  };
  return (
    <Card style={styles.item}>
      <View style={styles.itemTop}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.itemNome} numberOfLines={1}>{item.clientes?.nome ?? 'Cliente'}</Text>
          <Text style={styles.itemMeta} numberOfLines={1}>
            {(item.gateway ?? 'woovi').toUpperCase()} · {formatDateBR(item.created_at.slice(0, 10))}
            {item.paid_at ? ` · paga ${formatDateBR(item.paid_at.slice(0, 10))}` : ''}
          </Text>
        </View>
        <Badge label={s.label} tone={s.tone} />
      </View>
      <View style={styles.itemRow}>
        <View>
          <Text style={styles.itemLabel}>Valor</Text>
          <Text style={styles.itemValor}>{formatCurrency(item.valor)}</Text>
        </View>
        {item.expiration_date && item.status === 'ACTIVE' ? (
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.itemLabel}>Expira</Text>
            <Text style={styles.itemValorSmall}>{formatDateBR(item.expiration_date.slice(0, 10))}</Text>
          </View>
        ) : null}
      </View>
      {item.status === 'ACTIVE' && (item.br_code || item.payment_link) ? (
        <View style={styles.actions}>
          {item.br_code ? (
            <Pressable onPress={handleShowPix} style={[styles.actionBtn, styles.actionPrimary]}>
              <Ionicons name="qr-code-outline" size={14} color={colors.primaryFg} />
              <Text style={[styles.actionText, { color: colors.primaryFg }]}>Ver código</Text>
            </Pressable>
          ) : null}
          {item.payment_link ? (
            <Pressable onPress={handleOpenLink} style={[styles.actionBtn, styles.actionGhost]}>
              <Ionicons name="open-outline" size={14} color={colors.primary} />
              <Text style={[styles.actionText, { color: colors.primary }]}>Abrir link</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

function TxItem({ item }: { item: TxRow }) {
  const s = txStatusInfo(item.status);
  const isEntrada = item.tipo === 'CHARGE';
  return (
    <Card style={styles.item}>
      <View style={styles.itemTop}>
        <View style={[styles.dirIcon, { backgroundColor: isEntrada ? colors.successBg : colors.dangerBg }]}>
          <Ionicons
            name={isEntrada ? 'arrow-down-outline' : 'arrow-up-outline'}
            size={16}
            color={isEntrada ? colors.success : colors.danger}
          />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.itemNome} numberOfLines={1}>
            {item.destinatario_nome ?? item.clientes?.nome ?? '—'}
          </Text>
          <Text style={styles.itemMeta} numberOfLines={1}>
            {TX_TIPO_LABEL[item.tipo] ?? item.tipo} · {formatDateBR(item.created_at.slice(0, 10))}
          </Text>
        </View>
        <Badge label={s.label} tone={s.tone} />
      </View>
      <View style={styles.itemRow}>
        <Text style={[styles.itemValor, { color: isEntrada ? colors.success : colors.danger }]}>
          {isEntrada ? '+' : '-'}{formatCurrency(item.valor)}
        </Text>
      </View>
      {item.descricao ? (
        <Text style={styles.itemDetail} numberOfLines={2}>{item.descricao}</Text>
      ) : null}
      {item.pix_key ? (
        <Text style={styles.itemDetail} numberOfLines={1}>
          <Ionicons name="key-outline" size={11} color={colors.textMuted} /> {item.pix_key}
        </Text>
      ) : null}
    </Card>
  );
}

function DesembolsoItem({
  item,
  loading,
  onConfirm,
}: {
  item: DesembolsoRow;
  loading: boolean;
  onConfirm: () => void;
}) {
  const handleShowKey = () => {
    if (!item.pix_key) {
      Alert.alert('Sem chave', 'Cliente sem chave Pix cadastrada.');
      return;
    }
    Alert.alert('Chave Pix', item.pix_key, [{ text: 'OK' }]);
  };
  return (
    <Card style={styles.item}>
      <View style={styles.itemTop}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.itemNome} numberOfLines={1}>{item.cliente_nome}</Text>
          <Text style={styles.itemMeta} numberOfLines={1}>
            Aprovado {formatDateBR(item.created_at.slice(0, 10))}
            {item.cliente_cpf ? ` · CPF ${item.cliente_cpf}` : ''}
          </Text>
        </View>
        <Badge label="Aguardando" tone="warning" />
      </View>
      <View style={styles.itemRow}>
        <View>
          <Text style={styles.itemLabel}>A enviar</Text>
          <Text style={styles.itemValor}>{formatCurrency(item.valor)}</Text>
        </View>
        {item.pix_key_type ? (
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.itemLabel}>Tipo</Text>
            <Text style={styles.itemValorSmall}>{item.pix_key_type.toUpperCase()}</Text>
          </View>
        ) : null}
      </View>
      {item.pix_key ? (
        <Text style={styles.itemDetail} numberOfLines={1}>
          <Ionicons name="key-outline" size={11} color={colors.textMuted} /> {item.pix_key}
        </Text>
      ) : (
        <Text style={[styles.itemDetail, { color: colors.danger }]}>Cliente sem chave Pix cadastrada.</Text>
      )}
      <View style={styles.actions}>
        <Pressable onPress={handleShowKey} style={[styles.actionBtn, styles.actionGhost]}>
          <Ionicons name="key-outline" size={14} color={colors.primary} />
          <Text style={[styles.actionText, { color: colors.primary }]}>Ver chave</Text>
        </Pressable>
        <Pressable
          onPress={onConfirm}
          disabled={loading}
          style={[styles.actionBtn, styles.actionPrimary, loading && { opacity: 0.6 }]}
        >
          <Ionicons name="checkmark-outline" size={14} color={colors.primaryFg} />
          <Text style={[styles.actionText, { color: colors.primaryFg }]}>Marcar como pago</Text>
        </Pressable>
      </View>
    </Card>
  );
}

function ExtratoItem({ item }: { item: ExtratoItemT }) {
  const isEntrada = item.direction === 'entrada';
  return (
    <Card style={styles.itemCompact}>
      <View style={[styles.dirIcon, { backgroundColor: isEntrada ? colors.successBg : colors.dangerBg }]}>
        <Ionicons
          name={isEntrada ? 'arrow-down-outline' : 'arrow-up-outline'}
          size={16}
          color={isEntrada ? colors.success : colors.danger}
        />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.itemNome} numberOfLines={1}>{item.nome}</Text>
        <Text style={styles.itemMeta} numberOfLines={1}>
          {formatDateBR(item.horario.slice(0, 10))} · {item.descricao}
        </Text>
      </View>
      <Text style={[styles.extratoValor, { color: isEntrada ? colors.success : colors.danger }]}>
        {isEntrada ? '+' : '-'}{formatCurrency(item.valor)}
      </Text>
    </Card>
  );
}

/* ─────────────────────────── styles ─────────────────────────── */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  h1: { color: colors.text, fontSize: fontSizes.xxl, fontWeight: '700' },
  subtitle: { color: colors.textMuted, fontSize: fontSizes.sm },

  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.bgElevated,
  },
  exportText: { color: colors.primary, fontSize: fontSizes.xs, fontWeight: '700' },

  tabsRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    flexWrap: 'wrap',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: { borderColor: colors.primary, backgroundColor: 'rgba(59,130,246,0.10)' },
  tabText: { color: colors.textMuted, fontSize: fontSizes.xs, fontWeight: '600' },
  tabTextActive: { color: colors.primary },
  tabBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radii.pill,
    backgroundColor: colors.bgMuted,
    minWidth: 18,
    alignItems: 'center',
  },
  tabBadgeActive: { backgroundColor: colors.primary },
  tabBadgeText: { color: colors.textMuted, fontSize: 10, fontWeight: '700' },
  tabBadgeTextActive: { color: colors.primaryFg },

  kpis: { flexDirection: 'row', gap: spacing.sm },

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
  searchInput: { flex: 1, color: colors.text, fontSize: fontSizes.sm, paddingVertical: spacing.sm },

  list: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl },

  item: { gap: spacing.sm, padding: spacing.md },
  itemCompact: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  itemNome: { color: colors.text, fontSize: fontSizes.md, fontWeight: '600' },
  itemMeta: { color: colors.textMuted, fontSize: fontSizes.xs },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  itemLabel: { color: colors.textMuted, fontSize: fontSizes.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  itemValor: { color: colors.text, fontSize: fontSizes.lg, fontWeight: '700' },
  itemValorSmall: { color: colors.textMuted, fontSize: fontSizes.xs },
  itemDetail: { color: colors.textMuted, fontSize: fontSizes.xs },

  dirIcon: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  extratoValor: { fontSize: fontSizes.md, fontWeight: '700' },

  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: 'rgba(6,182,212,0.10)',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(6,182,212,0.30)',
    padding: spacing.md,
  },
  infoBannerText: {
    flex: 1,
    color: colors.info,
    fontSize: fontSizes.xs,
    lineHeight: 18,
  },

  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
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
  actionPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  actionGhost: { backgroundColor: colors.bgElevated, borderColor: colors.primary },
  actionText: { fontSize: fontSizes.sm, fontWeight: '700' },
});
