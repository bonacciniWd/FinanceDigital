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
import { CalendarDays, DollarSign, Loader2, TrendingDown, TrendingUp } from 'lucide-react';
import { LWCChart } from '../components/charts/LWCChart';
import { DonutChart } from '../components/charts/DonutChart';
import { CategoryBarChart } from '../components/charts/CategoryBarChart';
import { useParcelas } from '../hooks/useParcelas';
import { useEmprestimos } from '../hooks/useEmprestimos';
import { useAnalises } from '../hooks/useAnaliseCredito';

type ReceberFiltro = '7dias' | '15dias' | '30dias' | 'mesAtual' | 'personalizado';

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

function getReceberRange(filtro: ReceberFiltro, inicioCustom: string, fimCustom: string) {
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
    const inicio = hoje;
    const fim = endOfDay(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0));
    return { inicio, fim, label: 'Até o fim do mês' };
  }

  const daysByFilter: Record<Exclude<ReceberFiltro, 'mesAtual' | 'personalizado'>, number> = {
    '7dias': 7,
    '15dias': 15,
    '30dias': 30,
  };

  const days = daysByFilter[filtro as Exclude<ReceberFiltro, 'mesAtual' | 'personalizado'>] ?? 7;
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

export default function DashboardFinanceiroPage() {
  const { data: parcelas = [], isLoading: loadingParcelas } = useParcelas();
  const { data: emprestimos = [] } = useEmprestimos();
  const { data: analises = [] } = useAnalises();
  const [receberFiltro, setReceberFiltro] = useState<ReceberFiltro>('7dias');
  const [receberInicioCustom, setReceberInicioCustom] = useState(formatDateInput(new Date()));
  const [receberFimCustom, setReceberFimCustom] = useState(formatDateInput(addDays(new Date(), 6)));

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const periodoReceber = useMemo(
    () => getReceberRange(receberFiltro, receberInicioCustom, receberFimCustom),
    [receberFiltro, receberInicioCustom, receberFimCustom]
  );

  // Parcelas pagas = receita efetiva
  const parcelasPagas = parcelas.filter((p) => p.status === 'paga');

  const emprestimosNoPeriodo = useMemo(() => {
    return emprestimos.filter((emprestimo) => {
      if (emprestimo.status !== 'ativo' && emprestimo.status !== 'inadimplente') return false;
      if (!emprestimo.proximoVencimento) return false;

      const due = new Date(`${emprestimo.proximoVencimento}T00:00:00`);
      return due >= periodoReceber.inicio && due <= periodoReceber.fim;
    });
  }, [emprestimos, periodoReceber]);

  const emprestimosAReceber = emprestimosNoPeriodo.length;

  const totalAReceber = useMemo(
    () => emprestimosNoPeriodo.reduce((sum, emprestimo) => sum + (emprestimo.valorParcela ?? 0), 0),
    [emprestimosNoPeriodo]
  );

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

  // KPIs
  const receitaBruta = parcelasPagas.reduce((sum, p) => sum + (p.valor ?? 0), 0);
  const totalJuros = parcelasPagas.reduce((sum, p) => sum + (p.juros ?? 0), 0);
  const totalMultas = parcelasPagas.reduce((sum, p) => sum + (p.multa ?? 0), 0);
  const totalDescontos = parcelasPagas.reduce((sum, p) => sum + (p.desconto ?? 0), 0);
  const receitaLiquida = receitaBruta - totalDescontos;
  const margemPct = receitaBruta > 0 ? ((receitaLiquida / receitaBruta) * 100).toFixed(1) : '0';

  // Composição da receita
  const valorPrincipal = parcelasPagas.reduce((sum, p) => sum + (p.valorOriginal ?? p.valor ?? 0), 0);
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
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Dashboard Financeiro</h1>
          <p className="text-muted-foreground mt-1">Visão detalhada da saúde financeira da operação</p>
        </div>
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
            <div className="text-xs text-muted-foreground mt-1">{parcelasPagas.length} parcelas pagas</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Descontos</CardTitle>
            <TrendingDown className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalDescontos)}</div>
            <div className="text-xs text-muted-foreground mt-1">concedidos em pagamentos</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Receita Líquida</CardTitle>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(receitaLiquida)}</div>
            <div className="text-xs text-muted-foreground mt-1">receita - descontos</div>
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
              {emprestimos.filter((e) => e.status === 'ativo').length} empréstimos ativos
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-primary" />
              À Receber
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Empréstimos com parcelas pendentes dentro do período selecionado. Padrão: próximos 7 dias.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 lg:min-w-[420px]">
            <Select value={receberFiltro} onValueChange={(value) => setReceberFiltro(value as ReceberFiltro)}>
              <SelectTrigger className="sm:w-48">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7dias">Próximos 7 dias</SelectItem>
                <SelectItem value="15dias">Próximos 15 dias</SelectItem>
                <SelectItem value="30dias">Próximos 30 dias</SelectItem>
                <SelectItem value="mesAtual">Até o fim do mês</SelectItem>
                <SelectItem value="personalizado">Calendário personalizado</SelectItem>
              </SelectContent>
            </Select>

            {receberFiltro === 'personalizado' && (
              <>
                <Input
                  type="date"
                  value={receberInicioCustom}
                  onChange={(e) => setReceberInicioCustom(e.target.value)}
                  className="sm:w-40"
                />
                <Input
                  type="date"
                  value={receberFimCustom}
                  onChange={(e) => setReceberFimCustom(e.target.value)}
                  className="sm:w-40"
                />
              </>
            )}
          </div>
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
              <p className="text-xs text-muted-foreground mt-1">{emprestimosNoPeriodo.length} próxima(s) parcela(s) prevista(s) no período</p>
            </div>
          </div>
        </CardContent>
      </Card>

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
