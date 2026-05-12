/**
 * @module DashboardFinanceiroPage
 * @description Dashboard financeiro detalhado.
 *
 * Dados reais: receita = parcelas pagas, composição = juros + multas,
 * fluxo de caixa = pagamentos recentes agrupados por dia.
 *
 * @route /dashboard/financeiro
 * @access Protegido — perfis admin, gerente
 */
import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Skeleton } from '../components/ui/skeleton';
import { CalendarDays, DollarSign, TrendingDown, TrendingUp, HandshakeIcon, Clock, Percent } from 'lucide-react';
import { LWCChart } from '../components/charts/LWCChart';
import { DonutChart } from '../components/charts/DonutChart';
import { CategoryBarChart } from '../components/charts/CategoryBarChart';
import { useParcelas } from '../hooks/useParcelas';
import { useEmprestimos } from '../hooks/useEmprestimos';
import { useAnalises } from '../hooks/useAnaliseCredito';
import { useCardsCobranca } from '../hooks/useKanbanCobranca';
import { useAcordos } from '../hooks/useAcordos';

/**
 * Filtros de período do dashboard financeiro.
 * - `ultimos*` = janela passada (KPIs de receita realizada fazem sentido)
 * - `proximos*` = janela futura (À Receber mostra parcelas pendentes)
 * - `mesAtual` = 1º até o último dia do mês corrente (passado + futuro)
 * - `personalizado` = intervalo livre
 */
type PeriodoFiltro =
  | 'ultimos7dias'
  | 'ultimos15dias'
  | 'ultimos30dias'
  | 'proximos7dias'
  | 'proximos15dias'
  | 'proximos30dias'
  | 'mesAtual'
  | 'personalizado';

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getPeriodoRange(filtro: PeriodoFiltro, inicioCustom: string, fimCustom: string) {
  const hoje = startOfDay(new Date());

  if (filtro === 'personalizado') {
    const inicio = inicioCustom ? startOfDay(new Date(`${inicioCustom}T00:00:00`)) : hoje;
    const fim = fimCustom ? endOfDay(new Date(`${fimCustom}T00:00:00`)) : endOfDay(inicio);
    return {
      inicio,
      fim: fim < inicio ? endOfDay(inicio) : fim,
      label: 'Período personalizado',
    };
  }

  if (filtro === 'mesAtual') {
    const inicio = startOfDay(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
    const fim = endOfDay(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0));
    return { inicio, fim, label: 'Mês atual' };
  }

  const daysMap: Record<Exclude<PeriodoFiltro, 'mesAtual' | 'personalizado'>, { days: number; direcao: 'passado' | 'futuro' }> = {
    ultimos7dias: { days: 7, direcao: 'passado' },
    ultimos15dias: { days: 15, direcao: 'passado' },
    ultimos30dias: { days: 30, direcao: 'passado' },
    proximos7dias: { days: 7, direcao: 'futuro' },
    proximos15dias: { days: 15, direcao: 'futuro' },
    proximos30dias: { days: 30, direcao: 'futuro' },
  };

  const { days, direcao } = daysMap[filtro as Exclude<PeriodoFiltro, 'mesAtual' | 'personalizado'>];
  if (direcao === 'passado') {
    return {
      inicio: startOfDay(addDays(hoje, -(days - 1))),
      fim: endOfDay(hoje),
      label: `Últimos ${days} dias`,
    };
  }
  return {
    inicio: hoje,
    fim: endOfDay(addDays(hoje, days - 1)),
    label: `Próximos ${days} dias`,
  };
}

function getPeriodicidadeLabel(periodicidade?: string | null, intervaloDias?: number | null, datasPersonalizadas?: string | null) {
  if (periodicidade === 'personalizado' || !!intervaloDias || !!datasPersonalizadas) return 'Personalizado';
  if (periodicidade === 'diario') return 'Diário';
  if (periodicidade === 'semanal') return 'Semanal';
  if (periodicidade === 'quinzenal') return 'Quinzenal';
  return 'Mensal';
}

const _currencyFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const formatCurrency = (value: number) => _currencyFmt.format(value);

export default function DashboardFinanceiroPage() {
  const { data: parcelas = [], isLoading: loadingParcelas } = useParcelas();
  const { data: emprestimos = [] } = useEmprestimos();
  const { data: analises = [] } = useAnalises();
  const { data: cardsCobranca = [] } = useCardsCobranca();
  const { data: acordos = [] } = useAcordos();
  const [periodoFiltro, setPeriodoFiltro] = useState<PeriodoFiltro>('mesAtual');
  const [periodoInicioCustom, setPeriodoInicioCustom] = useState(formatDateInput(new Date()));
  const [periodoFimCustom, setPeriodoFimCustom] = useState(formatDateInput(addDays(new Date(), 6)));

  const periodoReceber = useMemo(
    () => getPeriodoRange(periodoFiltro, periodoInicioCustom, periodoFimCustom),
    [periodoFiltro, periodoInicioCustom, periodoFimCustom]
  );

  // Parcelas pagas históricas (todas as pagas, p/ gráficos de evolução)
  const parcelasPagas = useMemo(() => parcelas.filter((p) => p.status === 'paga'), [parcelas]);

  // Parcelas pagas DENTRO do período selecionado (driver dos KPIs).
  // Usa dataPagamento como referência; se faltar, cai p/ dataVencimento.
  const parcelasPagasNoPeriodo = useMemo(() => {
    const inicioMs = periodoReceber.inicio.getTime();
    const fimMs = periodoReceber.fim.getTime();
    return parcelasPagas.filter((p) => {
      const ref = p.dataPagamento ?? p.dataVencimento;
      if (!ref) return false;
      const ms = new Date(`${ref}T00:00:00`).getTime();
      return ms >= inicioMs && ms <= fimMs;
    });
  }, [parcelasPagas, periodoReceber]);

  // Parcelas a vencer dentro do período selecionado.
  // Fonte de verdade real — `emprestimo.proximoVencimento` cobre só a próxima
  // parcela e pode estar desatualizado, então usamos as parcelas diretamente.
  //
  // ⚠️ Filtros importantes para evitar contagem dobrada:
  //  - Exclui `congelada: true` (parcelas originais substituídas por acordo de
  //    renegociação — caso contrário a parcela original + a do acordo entram
  //    juntas no mesmo período).
  //  - Deduplica por `id` (defensivo: se o hook retornar duplicatas por algum
  //    join na origem, evita inflar o total).
  const parcelasNoPeriodo = useMemo(() => {
    const inicioMs = periodoReceber.inicio.getTime();
    const fimMs = periodoReceber.fim.getTime();
    const seen = new Set<string>();
    const result: typeof parcelas = [];
    for (const p of parcelas) {
      if (p.congelada) continue;
      if (p.status !== 'pendente' && p.status !== 'vencida') continue;
      if (!p.dataVencimento) continue;
      const dueMs = new Date(`${p.dataVencimento}T00:00:00`).getTime();
      if (dueMs < inicioMs || dueMs > fimMs) continue;
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      result.push(p);
    }
    return result;
  }, [parcelas, periodoReceber]);

  // Empréstimos únicos com pelo menos uma parcela prevista no período
  const emprestimosNoPeriodo = useMemo(() => {
    const ids = new Set<string>();
    for (const p of parcelasNoPeriodo) if (p.emprestimoId) ids.add(p.emprestimoId);
    return emprestimos.filter((e) => ids.has(e.id));
  }, [parcelasNoPeriodo, emprestimos]);

  const emprestimosAReceber = emprestimosNoPeriodo.length;

  // Valor previsto = soma de TODAS as parcelas previstas no período
  const totalAReceber = useMemo(
    () => parcelasNoPeriodo.reduce((sum, p) => sum + (p.valor ?? 0), 0),
    [parcelasNoPeriodo]
  );

  // ── Métricas de Cobrança & Recuperação ──────────────────────────────
  // Mesma lógica do DashboardCobrancaPage, com filtro por período onde faz
  // sentido (Pagamento Limpo / Recuperado via Acordos / Taxa de Recuperação).
  // Snapshot (estado atual) para: Acordos Ativos, Média Dias Atraso, Atraso.
  const metricasCobranca = useMemo(() => {
    const hoje = startOfDay(new Date());
    const MS_DIA = 86400000;

    // Clientes arquivados (kanban): excluídos do snapshot de inadimplência
    const clienteIdsArquivados = new Set<string>(
      cardsCobranca
        .filter((c) => {
          if (c.etapa === 'arquivado' || c.etapa === 'perdido') return true;
          if (c.etapa === 'vencido' && (c.diasAtraso ?? 0) > 365) return true;
          return false;
        })
        .map((c) => c.clienteId)
        .filter(Boolean) as string[],
    );

    const inadimplentes = emprestimos.filter(
      (e) => e.status === 'inadimplente' && !clienteIdsArquivados.has(e.clienteId),
    );

    // Média dias atraso (snapshot atual)
    const diasAtraso = inadimplentes.map((e) => {
      const venc = new Date(e.proximoVencimento);
      const d = Math.max(0, Math.floor((hoje.getTime() - venc.getTime()) / MS_DIA));
      return Math.min(d, 365);
    });
    const mediaDiasAtraso =
      diasAtraso.length > 0
        ? Math.round(diasAtraso.reduce((s, d) => s + d, 0) / diasAtraso.length)
        : 0;

    // Valor total em atraso (snapshot): parcelas abertas dos inadimplentes,
    // excluindo congeladas, arquivados e atraso > 365d.
    const valorTotalAtraso = parcelas.reduce((sum, p) => {
      if (p.status === 'paga' || p.status === 'cancelada') return sum;
      if (p.congelada) return sum;
      if (clienteIdsArquivados.has(p.clienteId)) return sum;
      if (!p.dataVencimento) return sum;
      const diff = Math.floor((hoje.getTime() - new Date(`${p.dataVencimento}T00:00:00`).getTime()) / MS_DIA);
      if (diff < 0 || diff > 365) return sum;
      return sum + (p.valor ?? 0);
    }, 0);

    // Período: Pagamento Limpo (sem acordoId) vs Recuperado via Acordos (com acordoId)
    const valorPagamentoLimpo = parcelasPagasNoPeriodo
      .filter((p) => !p.acordoId)
      .reduce((s, p) => s + (p.valor ?? 0), 0);
    const valorRecuperadoParcelasAcordo = parcelasPagasNoPeriodo
      .filter((p) => !!p.acordoId)
      .reduce((s, p) => s + (p.valor ?? 0), 0);

    // Acordos ativos (snapshot) + entradas pagas (snapshot — flag booleana sem data própria)
    const acordosAtivos = acordos.filter((a) => a.status === 'ativo');
    const valorTotalAcordos = acordosAtivos.reduce(
      (s, a) => s + Number(a.valor_divida_original ?? 0),
      0,
    );
    const valorEntradasPagas = acordosAtivos
      .filter((a) => a.entrada_paga)
      .reduce((s, a) => s + Number(a.valor_entrada ?? 0), 0);

    const valorRecuperadoAcordos = valorRecuperadoParcelasAcordo + valorEntradasPagas;
    const valorRecuperadoTotal = valorPagamentoLimpo + valorRecuperadoAcordos;
    const taxaRecuperacao =
      valorTotalAtraso + valorRecuperadoTotal > 0
        ? Math.round((valorRecuperadoTotal / (valorTotalAtraso + valorRecuperadoTotal)) * 100)
        : 0;

    return {
      valorPagamentoLimpo,
      valorRecuperadoAcordos,
      acordosAtivos: acordosAtivos.length,
      valorTotalAcordos,
      valorEntradasPagas,
      mediaDiasAtraso,
      totalInadimplentes: inadimplentes.length,
      valorTotalAtraso,
      taxaRecuperacao,
    };
  }, [emprestimos, parcelas, parcelasPagasNoPeriodo, cardsCobranca, acordos]);

  const analisesById = useMemo(
    () => new Map(analises.map((analise) => [analise.id, analise])),
    [analises]
  );

  const clientesPorPeriodicidade = useMemo(() => {
    const buckets: Record<string, Set<string>> = {
      'Diário': new Set(),
      'Semanal': new Set(),
      'Quinzenal': new Set(),
      'Mensal': new Set(),
      'Personalizado': new Set(),
    };

    emprestimos
      .filter((emprestimo) => emprestimo.status === 'ativo' || emprestimo.status === 'inadimplente')
      .forEach((emprestimo) => {
        const analise = emprestimo.analiseId ? analisesById.get(emprestimo.analiseId) : undefined;
        const periodicidade = getPeriodicidadeLabel(
          analise?.periodicidade,
          analise?.intervaloDias,
          analise?.datasPersonalizadas
        );
        buckets[periodicidade].add(emprestimo.clienteId);
      });

    return Object.entries(buckets).map(([label, clientes]) => ({
      label,
      clientes: clientes.size,
    }));
  }, [emprestimos, analisesById]);

  // KPIs — todos baseados nas parcelas PAGAS dentro do período selecionado
  const { receitaBruta, totalJuros, totalMultas, totalDescontos, valorPrincipal } = useMemo(() => ({
    receitaBruta:   parcelasPagasNoPeriodo.reduce((sum, p) => sum + (p.valor ?? 0), 0),
    totalJuros:     parcelasPagasNoPeriodo.reduce((sum, p) => sum + (p.juros ?? 0), 0),
    totalMultas:    parcelasPagasNoPeriodo.reduce((sum, p) => sum + (p.multa ?? 0), 0),
    totalDescontos: parcelasPagasNoPeriodo.reduce((sum, p) => sum + (p.desconto ?? 0), 0),
    valorPrincipal: parcelasPagasNoPeriodo.reduce((sum, p) => sum + (p.valorOriginal ?? p.valor ?? 0), 0),
  }), [parcelasPagasNoPeriodo]);

  const receitaLiquida = receitaBruta - totalDescontos;
  const margemPct = receitaBruta > 0 ? ((receitaLiquida / receitaBruta) * 100).toFixed(1) : '0';
  const composicaoReceita = useMemo(() => [
    { name: 'Principal', value: valorPrincipal - totalJuros - totalMultas, color: 'var(--chart-1)' },
    { name: 'Juros', value: totalJuros, color: 'var(--chart-3)' },
    { name: 'Multas', value: totalMultas, color: 'var(--chart-4)' },
  ].filter((item) => item.value > 0), [valorPrincipal, totalJuros, totalMultas]);

  // Evolução mensal: agrupa parcelas pagas por mês
  const receitasMensais = useMemo(() => {
    const meses: Record<string, { receita: number; descontos: number }> = {};
    parcelasPagas.forEach((p) => {
      const date = new Date(p.dataPagamento ?? p.dataVencimento);
      const key = date.toLocaleString('pt-BR', { year: 'numeric', month: 'short' }).replace('.', '');
      if (!meses[key]) meses[key] = { receita: 0, descontos: 0 };
      meses[key].receita += p.valor ?? 0;
      meses[key].descontos += p.desconto ?? 0;
    });
    return Object.entries(meses)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([mes, v]) => ({
        mes: mes.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
        receita: v.receita,
        despesa: v.descontos,
        lucro: v.receita - v.descontos,
      }));
  }, [parcelasPagas]);

  // Fluxo de caixa: últimos 7 dias de pagamentos
  const fluxoCaixa = useMemo(() => {
    const hoje = new Date();
    const dias: Record<string, { entrada: number; saida: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(hoje);
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      dias[key] = { entrada: 0, saida: 0 };
    }
    parcelasPagas.forEach((p) => {
      const date = new Date(p.dataPagamento ?? p.dataVencimento);
      const key = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      if (dias[key]) {
        dias[key].entrada += p.valor ?? 0;
      }
    });
    // Descontos concedidos como "saída"
    parcelasPagas.forEach((p) => {
      if ((p.desconto ?? 0) > 0) {
        const date = new Date(p.dataPagamento ?? p.dataVencimento);
        const key = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        if (dias[key]) {
          dias[key].saida += p.desconto ?? 0;
        }
      }
    });
    return Object.entries(dias).map(([dia, v]) => ({ dia, ...v }));
  }, [parcelasPagas]);

  if (loadingParcelas) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-80" />
          </div>
        </div>

        {/* 4 KPI cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-4 rounded" />
              </CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-8 w-36" />
                <Skeleton className="h-3 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* À Receber card */}
        <Card>
          <CardHeader className="gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-72" />
            </div>
            <Skeleton className="h-9 w-48" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-lg border p-4 space-y-3">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-8 w-24" />
                  <Skeleton className="h-3 w-36" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 2 charts side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i}>
              <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
              <CardContent><Skeleton className="h-[300px] w-full" /></CardContent>
            </Card>
          ))}
        </div>

        {/* 2 bar charts */}
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardHeader><Skeleton className="h-5 w-52" /></CardHeader>
            <CardContent><Skeleton className="h-[280px] w-full" /></CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Dashboard Financeiro</h1>
          <p className="text-muted-foreground mt-1">
            Visão detalhada da saúde financeira da operação — todos os indicadores e o card “À Receber” respeitam o período selecionado.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 lg:min-w-[460px]">
          <Select value={periodoFiltro} onValueChange={(value) => setPeriodoFiltro(value as PeriodoFiltro)}>
            <SelectTrigger className="sm:w-56">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ultimos7dias">Últimos 7 dias</SelectItem>
              <SelectItem value="ultimos15dias">Últimos 15 dias</SelectItem>
              <SelectItem value="ultimos30dias">Últimos 30 dias</SelectItem>
              <SelectItem value="mesAtual">Mês atual</SelectItem>
              <SelectItem value="proximos7dias">Próximos 7 dias</SelectItem>
              <SelectItem value="proximos15dias">Próximos 15 dias</SelectItem>
              <SelectItem value="proximos30dias">Próximos 30 dias</SelectItem>
              <SelectItem value="personalizado">Calendário personalizado</SelectItem>
            </SelectContent>
          </Select>

          {periodoFiltro === 'personalizado' && (
            <>
              <Input
                type="date"
                value={periodoInicioCustom}
                onChange={(e) => setPeriodoInicioCustom(e.target.value)}
                className="sm:w-40"
              />
              <Input
                type="date"
                value={periodoFimCustom}
                onChange={(e) => setPeriodoFimCustom(e.target.value)}
                className="sm:w-40"
              />
            </>
          )}
        </div>
      </div>

      <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{periodoReceber.label}:</span>{' '}
        {periodoReceber.inicio.toLocaleDateString('pt-BR')} até {periodoReceber.fim.toLocaleDateString('pt-BR')}
      </div>

      {/* Cards de Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Receita Bruta</CardTitle>
            <DollarSign className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(receitaBruta)}</div>
            <div className="text-xs text-muted-foreground mt-1">{parcelasPagasNoPeriodo.length} parcela(s) paga(s) no período</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Descontos</CardTitle>
            <TrendingDown className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalDescontos)}</div>
            <div className="text-xs text-muted-foreground mt-1">concedidos em pagamentos do período</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Receita Líquida</CardTitle>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(receitaLiquida)}</div>
            <div className="text-xs text-muted-foreground mt-1">receita - descontos no período</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Margem</CardTitle>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{margemPct}%</div>
            <div className="text-xs text-muted-foreground mt-1">
              {emprestimos.filter((e) => e.status === 'ativo').length} empréstimos ativos no total
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-primary" />
            À Receber
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Empréstimos com parcelas pendentes a vencer dentro do período selecionado acima.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Período</p>
              <p className="text-lg font-semibold mt-1">{periodoReceber.label}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {periodoReceber.inicio.toLocaleDateString('pt-BR')} até {periodoReceber.fim.toLocaleDateString('pt-BR')}
              </p>
            </div>
            <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Empréstimos</p>
              <p className="text-3xl font-bold mt-1 text-blue-700 dark:text-blue-300">{emprestimosAReceber}</p>
              <p className="text-xs text-muted-foreground mt-1">com pelo menos uma parcela prevista para vencer</p>
            </div>
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Valor previsto</p>
              <p className="text-3xl font-bold mt-1 text-emerald-700 dark:text-emerald-300">{formatCurrency(totalAReceber)}</p>
              <p className="text-xs text-muted-foreground mt-1">{parcelasNoPeriodo.length} parcela(s) prevista(s) no período</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cobrança & Recuperação */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3">Cobrança & Recuperação</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card className="border-green-200 dark:border-green-900/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-green-700 dark:text-green-400">Pagamento Limpo</CardTitle>
              <DollarSign className="w-4 h-4 text-green-600 dark:text-green-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">{formatCurrency(metricasCobranca.valorPagamentoLimpo)}</div>
              <p className="text-xs text-muted-foreground mt-1">pago direto no período (sem acordo)</p>
            </CardContent>
          </Card>

          <Card className="border-blue-200 dark:border-blue-900/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-blue-700 dark:text-blue-400">Recuperado via Acordos</CardTitle>
              <HandshakeIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{formatCurrency(metricasCobranca.valorRecuperadoAcordos)}</div>
              <p className="text-xs text-muted-foreground mt-1">parcelas de acordo no período + entradas pagas</p>
            </CardContent>
          </Card>

          <Card className="border-orange-200 dark:border-orange-900/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-orange-700 dark:text-orange-400">Acordos Ativos</CardTitle>
              <HandshakeIcon className="w-4 h-4 text-orange-600 dark:text-orange-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">{metricasCobranca.acordosAtivos}</div>
              <p className="text-xs text-muted-foreground mt-1">dívida: {formatCurrency(metricasCobranca.valorTotalAcordos)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Média Dias Atraso</CardTitle>
              <Clock className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metricasCobranca.mediaDiasAtraso}</div>
              <p className="text-xs text-muted-foreground mt-1">{metricasCobranca.totalInadimplentes} inadimplente(s) hoje</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Taxa Recuperação</CardTitle>
              <Percent className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">{metricasCobranca.taxaRecuperacao}%</div>
              <p className="text-xs text-muted-foreground mt-1">em atraso: {formatCurrency(metricasCobranca.valorTotalAtraso)}</p>
            </CardContent>
          </Card>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Pagamento Limpo e Recuperado via Acordos consideram o período selecionado. Acordos Ativos, Média Dias Atraso e Atraso são snapshots do estado atual.
        </p>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Evolução Receita</CardTitle></CardHeader>
          <CardContent>
            <LWCChart
              height={300}
              series={[
                {
                  label: 'Receita',
                  color: '#3b82f6',
                  type: 'area',
                  data: receitasMensais.map((r) => ({ time: r.mes, value: r.receita })),
                },
                {
                  label: 'Descontos',
                  color: '#ef4444',
                  type: 'line',
                  data: receitasMensais.map((r) => ({ time: r.mes, value: r.despesa })),
                },
                {
                  label: 'Líquido',
                  color: '#22c55e',
                  type: 'line',
                  data: receitasMensais.map((r) => ({ time: r.mes, value: r.lucro })),
                },
              ]}
              emptyText="Nenhuma parcela paga registrada"
            />
            <div className="flex gap-4 justify-center mt-3 flex-wrap">
              {[{c:'#3b82f6',l:'Receita'},{c:'#ef4444',l:'Descontos'},{c:'#22c55e',l:'Líquido'}].map((item) => (
                <div key={item.l} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="w-3 h-0.5 inline-block rounded" style={{ backgroundColor: item.c }} />
                  {item.l}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Composição da Receita</CardTitle></CardHeader>
          <CardContent className="flex justify-center">
            <DonutChart
              size={270}
              data={composicaoReceita.map((c) => ({ name: c.name, value: c.value, color: c.color }))}
              formatValue={formatCurrency}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Clientes por Periodicidade</CardTitle></CardHeader>
        <CardContent>
          <CategoryBarChart
            height={280}
            data={clientesPorPeriodicidade}
            series={[
              { label: 'Clientes', color: '#6366f1', dataKey: 'clientes' },
            ]}
            labelKey="label"
            formatValue={(value) => `${value} cliente(s)`}
            emptyText="Nenhum cliente com empréstimo ativo encontrado"
          />
        </CardContent>
      </Card>

      {/* Fluxo de Caixa Diário */}
      <Card>
        <CardHeader><CardTitle>Fluxo de Caixa — Últimos 7 dias</CardTitle></CardHeader>
        <CardContent>
          <CategoryBarChart
            height={280}
            data={fluxoCaixa.map((d) => ({ label: d.dia, entrada: d.entrada, saida: d.saida }))}
            series={[
              { label: 'Entradas', color: '#22c55e', dataKey: 'entrada' },
              { label: 'Descontos', color: '#ef4444', dataKey: 'saida' },
            ]}
            labelKey="label"
            formatValue={formatCurrency}
          />
        </CardContent>
      </Card>
    </div>
  );
}
