/**
 * @module DashboardComercialPage
 * @description Dashboard comercial com métricas de vendas e captação.
 *
 * Dados reais via hooks: useAnalises (pipeline), useMembrosRede (indicadores),
 * useEmprestimos (crédito aprovado), useClientes (novos clientes).
 *
 * @route /dashboard/comercial
 * @access Protegido — perfis admin, gerente, comercial
 */
import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Users, Target, TrendingUp, UserPlus, ArrowUpRight } from 'lucide-react';
import { CategoryBarChart } from '../components/charts/CategoryBarChart';
import { useAnalises } from '../hooks/useAnaliseCredito';
import { useMembrosRede } from '../hooks/useRedeIndicacoes';
import { useEmprestimos } from '../hooks/useEmprestimos';
import { useClientes } from '../hooks/useClientes';
import { DashboardSkeleton } from '../components/DashboardSkeleton';
import { PeriodoSelector, getPresetRange, type PeriodoRange } from '../components/PeriodoSelector';

export default function DashboardComercialPage() {
  const { data: analises = [], isLoading: loadingAnalises } = useAnalises();
  const { data: membros = [] } = useMembrosRede();
  const { data: emprestimos = [] } = useEmprestimos();
  const { data: clientes = [] } = useClientes();

  const [periodo, setPeriodo] = useState<PeriodoRange>(() => getPresetRange('30d'));

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  // Helper: filtra registros por período usando data de solicitação/criação
  const inPeriodo = (dt?: string | null) => {
    if (!dt) return false;
    const t = new Date(dt).getTime();
    return t >= periodo.from.getTime() && t <= periodo.to.getTime();
  };

  // Análises do período (base de leads/conversões/crédito aprovado)
  const analisesPeriodo = useMemo(
    () => analises.filter((a) => inPeriodo(a.dataSolicitacao ?? (a as any).data_solicitacao ?? (a as any).created_at)),
    [analises, periodo],
  );

  // KPIs do período
  const totalLeads = analisesPeriodo.length;
  const conversoes = analisesPeriodo.filter((a) => a.status === 'aprovado').length;
  const taxaConversao = totalLeads > 0 ? ((conversoes / totalLeads) * 100).toFixed(1) : '0';
  // Indicações ativas — métrica de stock, não muda por período (mostra estado atual)
  const indicacoesAtivas = membros.filter((m) => m.status === 'ativo').length;
  // Crédito aprovado no período
  const creditoAprovado = analisesPeriodo
    .filter((a) => a.status === 'aprovado')
    .reduce((sum, a) => sum + (a.valorSolicitado ?? (a as any).valor_solicitado ?? 0), 0);
  // Empréstimos efetivamente contratados no período
  const emprestimosPeriodo = useMemo(
    () => emprestimos.filter((e) => inPeriodo(e.dataContrato)),
    [emprestimos, periodo],
  );
  const valorEmprestimosPeriodo = emprestimosPeriodo.reduce((s, e) => s + e.valor, 0);

  // Pipeline de leads do período
  const pipelineLeads = useMemo(() => [
    { etapa: 'Pendente', quantidade: analisesPeriodo.filter((a) => a.status === 'pendente').length },
    { etapa: 'Em Análise', quantidade: analisesPeriodo.filter((a) => a.status === 'em_analise').length },
    { etapa: 'Aprovado', quantidade: analisesPeriodo.filter((a) => a.status === 'aprovado').length },
    { etapa: 'Recusado', quantidade: analisesPeriodo.filter((a) => a.status === 'recusado').length },
  ], [analisesPeriodo]);

  // Conversões por mês — usa TODAS as análises (visão histórica, não filtra)
  const conversoesMensais = useMemo(() => {
    const meses: Record<string, { leads: number; convertidos: number }> = {};
    analises.forEach((a) => {
      const date = new Date(a.dataSolicitacao ?? (a as any).data_solicitacao ?? (a as any).created_at);
      const key = date.toLocaleString('pt-BR', { month: 'short' }).replace('.', '');
      if (!meses[key]) meses[key] = { leads: 0, convertidos: 0 };
      meses[key].leads++;
      if (a.status === 'aprovado') meses[key].convertidos++;
    });
    return Object.entries(meses).map(([mes, v]) => ({
      mes: mes.charAt(0).toUpperCase() + mes.slice(1),
      leads: v.leads,
      convertidos: v.convertidos,
    }));
  }, [analises]);

  // Top indicadores: clientes que mais indicaram (extraído da rede)
  const topIndicadores = useMemo(() => {
    const indicadorMap: Record<string, { nome: string; indicacoes: number; bonus: number }> = {};
    membros.forEach((m) => {
      const indicadorId = m.indicadoPor ?? (m as any).indicado_por;
      if (!indicadorId) return;
      const cli = clientes.find((c) => c.id === indicadorId);
      if (!cli) return;
      if (!indicadorMap[indicadorId]) {
        indicadorMap[indicadorId] = { nome: cli.nome, indicacoes: 0, bonus: cli.bonusAcumulado ?? (cli as any).bonus_acumulado ?? 0 };
      }
      indicadorMap[indicadorId].indicacoes++;
    });
    return Object.values(indicadorMap)
      .sort((a, b) => b.indicacoes - a.indicacoes)
      .slice(0, 5);
  }, [membros, clientes]);

  if (loadingAnalises) {
    return <DashboardSkeleton kpis={4} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Dashboard Comercial</h1>
          <p className="text-muted-foreground mt-1">Métricas de captação, conversão e rede de indicações</p>
        </div>
        <PeriodoSelector value={periodo} onChange={setPeriodo} compact />
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Leads (Análises)</CardTitle>
            <Users className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalLeads}</div>
            <div className="text-xs text-muted-foreground mt-1">análises no período</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Conversões</CardTitle>
            <Target className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{conversoes}</div>
            <div className="flex items-center text-sm text-green-600 mt-1">
              <ArrowUpRight className="w-4 h-4" /> Taxa: {taxaConversao}%
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Indicações Ativas</CardTitle>
            <UserPlus className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{indicacoesAtivas}</div>
            <div className="text-xs text-muted-foreground mt-1">membros ativos na rede</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Crédito Aprovado</CardTitle>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(creditoAprovado)}</div>
            <div className="text-xs text-muted-foreground mt-1">aprovado no período</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Empréstimos no período</CardTitle>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(valorEmprestimosPeriodo)}</div>
            <div className="text-xs text-muted-foreground mt-1">{emprestimosPeriodo.length} contrato(s)</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Conversões por mês */}
        <Card>
          <CardHeader><CardTitle>Leads vs Conversões</CardTitle></CardHeader>
          <CardContent>
            <CategoryBarChart
              data={conversoesMensais.map((m) => ({ label: m.mes, leads: m.leads, convertidos: m.convertidos }))}
              series={[
                { label: 'Leads', color: '#3b82f6', dataKey: 'leads' },
                { label: 'Convertidos', color: '#22c55e', dataKey: 'convertidos' },
              ]}
              labelKey="label"
              height={300}
              emptyText="Nenhuma análise registrada ainda"
            />
          </CardContent>
        </Card>

        {/* Pipeline */}
        <Card>
          <CardHeader><CardTitle>Pipeline de Leads</CardTitle></CardHeader>
          <CardContent>
            <CategoryBarChart
              data={pipelineLeads.map((p) => ({ label: p.etapa, quantidade: p.quantidade }))}
              series={[{ label: 'Quantidade', color: '#8b5cf6', dataKey: 'quantidade' }]}
              labelKey="label"
              layout="horizontal"
              height={240}
            />
          </CardContent>
        </Card>
      </div>

      {/* Top Indicadores */}
      <Card>
        <CardHeader><CardTitle>Top Indicadores</CardTitle></CardHeader>
        <CardContent>
          {topIndicadores.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 font-medium text-muted-foreground">Indicador</th>
                    <th className="text-center py-3 font-medium text-muted-foreground">Indicações</th>
                    <th className="text-right py-3 font-medium text-muted-foreground">Bônus Acumulado</th>
                  </tr>
                </thead>
                <tbody>
                  {topIndicadores.map((ind, i) => (
                    <tr key={i} className="border-b hover:bg-muted/50">
                      <td className="py-3 font-medium">{ind.nome}</td>
                      <td className="py-3 text-center">
                        <Badge variant="secondary">{ind.indicacoes}</Badge>
                      </td>
                      <td className="py-3 text-right font-medium text-green-600">{formatCurrency(ind.bonus)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground text-sm">
              Nenhuma indicação registrada ainda
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
