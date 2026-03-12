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
import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { DollarSign, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Loader2 } from 'lucide-react';
import { LWCChart } from '../components/charts/LWCChart';
import { DonutChart } from '../components/charts/DonutChart';
import { CategoryBarChart } from '../components/charts/CategoryBarChart';
import { useParcelas } from '../hooks/useParcelas';
import { useEmprestimos } from '../hooks/useEmprestimos';

export default function DashboardFinanceiroPage() {
  const { data: parcelas = [], isLoading: loadingParcelas } = useParcelas();
  const { data: emprestimos = [] } = useEmprestimos();

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  // Parcelas pagas = receita efetiva
  const parcelasPagas = parcelas.filter((p) => p.status === 'paga');

  // KPIs
  const receitaBruta = parcelasPagas.reduce((sum, p) => sum + (p.valor ?? 0), 0);
  const totalJuros = parcelasPagas.reduce((sum, p) => sum + (p.juros ?? 0), 0);
  const totalMultas = parcelasPagas.reduce((sum, p) => sum + (p.multa ?? 0), 0);
  const totalDescontos = parcelasPagas.reduce((sum, p) => sum + (p.desconto ?? 0), 0);
  const receitaLiquida = receitaBruta - totalDescontos;
  const margemPct = receitaBruta > 0 ? ((receitaLiquida / receitaBruta) * 100).toFixed(1) : '0';

  // Composição da receita
  const valorPrincipal = parcelasPagas.reduce((sum, p) => sum + ((p.valorOriginal ?? p.valor_original ?? p.valor ?? 0)), 0);
  const composicaoReceita = useMemo(() => [
    { name: 'Principal', value: valorPrincipal - totalJuros - totalMultas, color: 'var(--chart-1)' },
    { name: 'Juros', value: totalJuros, color: 'var(--chart-3)' },
    { name: 'Multas', value: totalMultas, color: 'var(--chart-4)' },
  ].filter((item) => item.value > 0), [valorPrincipal, totalJuros, totalMultas]);

  // Evolução mensal: agrupa parcelas pagas por mês
  const receitasMensais = useMemo(() => {
    const meses: Record<string, { receita: number; descontos: number }> = {};
    parcelasPagas.forEach((p) => {
      const date = new Date(p.dataPagamento ?? p.data_pagamento ?? p.created_at);
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
      const date = new Date(p.dataPagamento ?? p.data_pagamento ?? p.created_at);
      const key = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      if (dias[key]) {
        dias[key].entrada += p.valor ?? 0;
      }
    });
    // Descontos concedidos como "saída"
    parcelasPagas.forEach((p) => {
      if ((p.desconto ?? 0) > 0) {
        const date = new Date(p.dataPagamento ?? p.data_pagamento ?? p.created_at);
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
