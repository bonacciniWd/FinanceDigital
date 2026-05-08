/**
 * DashboardCobrancaScreen — alinhado com web (DashboardCobrancaPage).
 *
 * Regras (mesmas do web):
 * - Exclui clientes com card no kanban_cobranca em etapa 'arquivado'/'perdido',
 *   ou 'vencido' com diasAtraso > 365.
 * - Considera empréstimos status='inadimplente' apenas (não-arquivados).
 * - Parcelas em aberto: status != paga/cancelada, cliente não-arquivado,
 *   dias de atraso ≤ 365 (regra de juros congelados).
 * - Valor em atraso = soma (valor + juros + multa - desconto) das parcelas
 *   em aberto dos inadimplentes (aproximação do valorCorrigido() do web).
 * - Acordos: tabela `acordos`, status='ativo' / 'quitado'.
 * - Pagamento Limpo: parcelas pagas SEM acordo_id.
 * - Recuperado via Acordos: parcelas pagas COM acordo_id + entradas pagas.
 */
import { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Card } from '../components/ui/Card';
import { StatCard } from '../components/ui/StatCard';
import { ScreenLoading } from '../components/ui/State';
import { colors, fontSizes, spacing } from '../theme/tokens';
import { formatCurrency, formatNumber } from '../lib/format';

interface CobStats {
  totalAtraso: number;
  qtdInadimplentes: number;
  qtdEmprestimosInadimplentes: number;
  mediaDiasAtraso: number;
  negociacoesAtivas: number;
  valorNegociacao: number;
  taxaRecuperacao: number;
  valorRecuperadoLimpo: number;
  acordosAtivos: number;
  valorTotalAcordos: number;
  valorEntradasPagas: number;
  valorRecuperadoAcordos: number;
}

const MS_DIA = 86_400_000;

async function fetchAll<T = any>(
  table: string,
  select: string,
  apply?: (q: any) => any,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  const PAGE = 1000;
  for (let i = 0; i < 100; i++) {
    let q: any = supabase.from(table).select(select).range(from, from + PAGE - 1);
    if (apply) q = apply(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    const rows = (data ?? []) as T[];
    all.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

async function fetchCobStats(): Promise<CobStats> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [cards, emprestimos, parcelasAbertas, parcelasPagas, acordos] = await Promise.all([
    fetchAll<any>('kanban_cobranca', 'cliente_id, etapa, dias_atraso, valor_divida'),
    fetchAll<any>('emprestimos', 'id, cliente_id, status, proximo_vencimento', (q) =>
      q.in('status', ['ativo', 'inadimplente']),
    ),
    fetchAll<any>(
      'parcelas',
      'id, emprestimo_id, cliente_id, valor, juros, multa, desconto, data_vencimento, status',
      (q) => q.in('status', ['pendente', 'vencida']),
    ),
    fetchAll<any>('parcelas', 'valor, acordo_id', (q) => q.eq('status', 'paga')),
    fetchAll<any>('acordos', 'status, valor_divida_original, valor_entrada, entrada_paga'),
  ]);

  // Clientes arquivados (mesma regra do web)
  const clienteIdsArquivados = new Set<string>(
    cards
      .filter((c) => {
        if (c.etapa === 'arquivado' || c.etapa === 'perdido') return true;
        if (c.etapa === 'vencido' && (c.dias_atraso ?? 0) > 365) return true;
        return false;
      })
      .map((c) => c.cliente_id)
      .filter(Boolean),
  );

  const emprestimosVivos = emprestimos.filter((e) => !clienteIdsArquivados.has(e.cliente_id));
  const inadimplentes = emprestimosVivos.filter((e) => e.status === 'inadimplente');

  // Parcelas em aberto (≤ 365d e cliente não arquivado)
  const parcelasOk = parcelasAbertas.filter((p) => {
    if (clienteIdsArquivados.has(p.cliente_id)) return false;
    const dias = Math.floor((today.getTime() - new Date(p.data_vencimento).getTime()) / MS_DIA);
    return dias <= 365;
  });

  // Aproxima valorCorrigido: valor + juros + multa - desconto
  const valorParcela = (p: any) =>
    Number(p.valor || 0) + Number(p.juros || 0) + Number(p.multa || 0) - Number(p.desconto || 0);

  const parcelasPorEmp = new Map<string, any[]>();
  for (const p of parcelasOk) {
    const arr = parcelasPorEmp.get(p.emprestimo_id) ?? [];
    arr.push(p);
    parcelasPorEmp.set(p.emprestimo_id, arr);
  }

  const valorTotalAtraso = inadimplentes.reduce((acc, e) => {
    const ps = parcelasPorEmp.get(e.id) ?? [];
    return acc + ps.reduce((s, p) => s + valorParcela(p), 0);
  }, 0);

  // Clientes inadimplentes únicos com débito
  const clientesInadimpComDebito = new Set<string>();
  let totalDias = 0;
  let countDias = 0;
  for (const e of inadimplentes) {
    const ps = parcelasPorEmp.get(e.id) ?? [];
    if (ps.length === 0) continue;
    clientesInadimpComDebito.add(e.cliente_id);
    if (e.proximo_vencimento) {
      const d = Math.max(
        0,
        Math.floor((today.getTime() - new Date(e.proximo_vencimento).getTime()) / MS_DIA),
      );
      totalDias += Math.min(d, 365);
      countDias += 1;
    }
  }
  const mediaDiasAtraso = countDias > 0 ? Math.round(totalDias / countDias) : 0;

  // Kanban
  const emNegociacao = cards.filter((c) => c.etapa === 'negociacao');
  const pagosKanban = cards.filter((c) => c.etapa === 'pago');
  const valorNegociacao = emNegociacao.reduce((s, c) => s + Number(c.valor_divida || 0), 0);
  const valorRecuperadoKanban = pagosKanban.reduce((s, c) => s + Number(c.valor_divida || 0), 0);
  const taxaRecuperacao =
    valorTotalAtraso + valorRecuperadoKanban > 0
      ? Math.round((valorRecuperadoKanban / (valorTotalAtraso + valorRecuperadoKanban)) * 100)
      : 0;

  // Acordos
  const acordosAtivos = acordos.filter((a) => a.status === 'ativo');
  const acordosQuitados = acordos.filter((a) => a.status === 'quitado');
  const valorTotalAcordos = acordosAtivos.reduce(
    (s, a) => s + Number(a.valor_divida_original || 0),
    0,
  );
  const valorEntradasPagas = acordosAtivos
    .filter((a) => a.entrada_paga)
    .reduce((s, a) => s + Number(a.valor_entrada || 0), 0);

  // Faturamento por origem
  const valorPagamentoLimpo = parcelasPagas
    .filter((p) => !p.acordo_id)
    .reduce((s, p) => s + Number(p.valor || 0), 0);
  const valorParcelasAcordo = parcelasPagas
    .filter((p) => !!p.acordo_id)
    .reduce((s, p) => s + Number(p.valor || 0), 0);
  const valorRecuperadoAcordosTotal = valorParcelasAcordo + valorEntradasPagas;

  return {
    totalAtraso: valorTotalAtraso,
    qtdInadimplentes: clientesInadimpComDebito.size,
    qtdEmprestimosInadimplentes: inadimplentes.length,
    mediaDiasAtraso,
    negociacoesAtivas: emNegociacao.length,
    valorNegociacao,
    taxaRecuperacao,
    valorRecuperadoLimpo: valorPagamentoLimpo,
    acordosAtivos: acordosAtivos.length,
    valorTotalAcordos,
    valorEntradasPagas,
    valorRecuperadoAcordos: valorRecuperadoAcordosTotal,
  };
}

export function DashboardCobrancaScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['dash-cob-mobile-v2'],
    queryFn: fetchCobStats,
    staleTime: 60_000,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refetch(); } finally { setRefreshing(false); }
  }, [refetch]);

  if (isLoading && !data) return <ScreenLoading />;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      <Text style={styles.h1}>Dashboard Cobrança</Text>
      <Text style={styles.subtitle}>
        Gestão de inadimplentes · Dados em tempo real dos empréstimos
      </Text>

      <Card style={styles.bigCard}>
        <Text style={styles.bigLabel}>Total em Atraso</Text>
        <Text style={[styles.bigValue, { color: colors.danger }]}>
          {formatCurrency(data?.totalAtraso ?? 0)}
        </Text>
        <Text style={styles.bigHint}>
          {formatNumber(data?.qtdInadimplentes ?? 0)} clientes ·{' '}
          {formatNumber(data?.qtdEmprestimosInadimplentes ?? 0)} empréstimos
        </Text>
      </Card>

      <View style={styles.row}>
        <StatCard
          label="Média Dias Atraso"
          value={formatNumber(data?.mediaDiasAtraso ?? 0)}
          tone="warning"
          hint="dias (cap 365)"
        />
        <StatCard
          label="Negociações"
          value={formatNumber(data?.negociacoesAtivas ?? 0)}
          hint={`${formatCurrency(data?.valorNegociacao ?? 0)} ativos`}
        />
      </View>

      <View style={styles.row}>
        <StatCard
          label="Taxa Recuperação"
          value={`${data?.taxaRecuperacao ?? 0}%`}
          tone="success"
          hint="kanban: pagos / (atraso + pagos)"
        />
        <StatCard
          label="Acordos Ativos"
          value={formatNumber(data?.acordosAtivos ?? 0)}
          hint={`${formatCurrency(data?.valorTotalAcordos ?? 0)} dívida`}
        />
      </View>

      <Text style={styles.section}>Faturamento por Origem</Text>

      <Card style={styles.bigCard}>
        <Text style={styles.bigLabel}>Pagamento Limpo</Text>
        <Text style={[styles.bigValue, { color: colors.success }]}>
          {formatCurrency(data?.valorRecuperadoLimpo ?? 0)}
        </Text>
        <Text style={styles.bigHint}>parcelas pagas sem renegociação</Text>
      </Card>

      <Card style={styles.bigCard}>
        <Text style={styles.bigLabel}>Recuperado via Acordos</Text>
        <Text style={styles.bigValue}>
          {formatCurrency(data?.valorRecuperadoAcordos ?? 0)}
        </Text>
        <Text style={styles.bigHint}>
          parcelas de acordos + entradas pagas (
          {formatCurrency(data?.valorEntradasPagas ?? 0)})
        </Text>
      </Card>

      <Text style={styles.foot}>
        Clientes com card 'arquivado'/'perdido' ou 'vencido' &gt; 365d são
        excluídos. Parcelas com mais de 365 dias de atraso (juros congelados)
        também não entram nos cálculos.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  h1: { color: colors.text, fontSize: fontSizes.xxl, fontWeight: '700' },
  subtitle: { color: colors.textMuted, fontSize: fontSizes.sm, marginTop: -spacing.sm },
  section: { color: colors.text, fontSize: fontSizes.lg, fontWeight: '700', marginTop: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.md },
  bigCard: { padding: spacing.lg, gap: 4 },
  bigLabel: { color: colors.textMuted, fontSize: fontSizes.xs, fontWeight: '600', textTransform: 'uppercase' },
  bigValue: { color: colors.text, fontSize: 28, fontWeight: '800' },
  bigHint: { color: colors.textMuted, fontSize: fontSizes.xs, marginTop: 4 },
  foot: { color: colors.textDim, fontSize: fontSizes.xs, lineHeight: 18, marginTop: spacing.md, fontStyle: 'italic' },
});
