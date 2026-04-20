/**
 * @module KanbanGerencialPage
 * @description Visão gerencial consolidada de todos os Kanbans com dados reais.
 *
 * Tabs: Visão Geral (KPIs + distribuição), Por Funcionário (desempenho),
 * Gargalos (etapas lentas). Dados de useAnalises, useCardsCobranca,
 * useTickets, useFuncionarios — sem mocks.
 *
 * @route /kanban/gerencial
 * @access Protegido — perfis admin, gerente
 */
import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Clock, Loader2, AlertCircle, TrendingUp, Users } from 'lucide-react';
import { CategoryBarChart } from '../components/charts/CategoryBarChart';
import { DonutChart } from '../components/charts/DonutChart';
import { useAnalises } from '../hooks/useAnaliseCredito';
import { useCardsCobranca } from '../hooks/useKanbanCobranca';
import { useTickets } from '../hooks/useTickets';
import { useFuncionarios } from '../hooks/useFuncionarios';

export default function KanbanGerencialPage() {
  const { data: analises = [], isLoading: loadingA } = useAnalises();
  const { data: cobrancas = [], isLoading: loadingC } = useCardsCobranca();
  const { data: tickets = [], isLoading: loadingT } = useTickets();
  const { data: funcionarios = [], isLoading: loadingF } = useFuncionarios();

  const isLoading = loadingA || loadingC || loadingT || loadingF;

  /* --------------- KPIs computados --------------- */
  const kpis = useMemo(() => {
    const aprovadas = analises.filter((a) => a.status === 'aprovado').length;
    const recusadas = analises.filter((a) => a.status === 'recusado').length;
    const concluidas = aprovadas + recusadas;
    const taxaAprovacao = concluidas > 0 ? Math.round((aprovadas / concluidas) * 100) : 0;

    const ticketsPendentes = tickets.filter((t) => !['resolvido', 'cancelado'].includes(t.status)).length;
    const ticketsResolvidos = tickets.filter((t) => t.status === 'resolvido').length;

    const cobrancasAtivas = cobrancas.filter((c) => !['pago', 'perdido', 'arquivado'].includes(c.etapa));
    const valorEmCobranca = cobrancasAtivas.reduce((s, c) => s + c.valorDivida, 0);
    const valorRecuperado = cobrancas
      .filter((c) => c.etapa === 'pago')
      .reduce((s, c) => s + c.valorDivida, 0);

    return {
      totalAnalises: analises.length,
      emAnalise: analises.filter((a) => ['pendente', 'em_analise'].includes(a.status)).length,
      aprovadas,
      recusadas,
      taxaAprovacao,
      totalTickets: tickets.length,
      ticketsPendentes,
      ticketsResolvidos,
      totalCobranca: cobrancasAtivas.length,
      acordos: cobrancas.filter((c) => c.etapa === 'acordo').length,
      pagos: cobrancas.filter((c) => c.etapa === 'pago').length,
      valorEmCobranca,
      valorRecuperado,
    };
  }, [analises, tickets, cobrancas]);

  /* --------------- Dados dos gráficos --------------- */
  const statusCredito = useMemo(
    () => [
      { name: 'Aprovadas', value: kpis.aprovadas, color: '#22c55e' },
      { name: 'Em Análise', value: kpis.emAnalise, color: '#eab308' },
      { name: 'Recusadas', value: kpis.recusadas, color: '#ef4444' },
    ],
    [kpis]
  );

  const distribuicaoPorArea = useMemo(
    () => [
      { area: 'Crédito', pendente: kpis.emAnalise, concluido: kpis.aprovadas + kpis.recusadas },
      { area: 'Atendim.', pendente: kpis.ticketsPendentes, concluido: kpis.ticketsResolvidos },
      { area: 'Cobrança', pendente: cobrancas.filter((c) => !['pago', 'perdido', 'arquivado'].includes(c.etapa)).length, concluido: kpis.pagos },
    ],
    [kpis, cobrancas]
  );

  /* --------------- Desempenho por Funcionário --------------- */
  const desempenhoFuncionarios = useMemo(() => {
    return funcionarios.map((f) => {
      const analisesFunc = analises.filter((a) => a.analistaId === f.id);
      const aprovFunc = analisesFunc.filter((a) => a.status === 'aprovado').length;
      const recFunc = analisesFunc.filter((a) => a.status === 'recusado').length;
      const ticketsFunc = tickets.filter((t) => t.atendenteId === f.id);
      const ticketsResolv = ticketsFunc.filter((t) => t.status === 'resolvido').length;
      const cobrancaFunc = cobrancas.filter((c) => c.responsavelId === f.id);
      const cobrancaPagos = cobrancaFunc.filter((c) => c.etapa === 'pago').length;
      const totalAcoes = analisesFunc.length + ticketsFunc.length + cobrancaFunc.length;
      const concluidos = aprovFunc + recFunc + ticketsResolv + cobrancaPagos;

      return {
        id: f.id,
        nome: f.nome,
        role: f.role,
        analises: analisesFunc.length,
        aprovadas: aprovFunc,
        recusadas: recFunc,
        tickets: ticketsFunc.length,
        ticketsResolvidos: ticketsResolv,
        cobrancas: cobrancaFunc.length,
        cobrancasPagas: cobrancaPagos,
        totalAcoes,
        concluidos,
        taxaConclusao: totalAcoes > 0 ? Math.round((concluidos / totalAcoes) * 100) : 0,
      };
    }).filter((f) => f.totalAcoes > 0)
      .sort((a, b) => b.totalAcoes - a.totalAcoes);
  }, [funcionarios, analises, tickets, cobrancas]);

  /* --------------- Gargalos --------------- */
  const gargalos = useMemo(() => {
    const analisesPendentes = analises.filter((a) => a.status === 'pendente').length;
    const analisesEmAnalise = analises.filter((a) => a.status === 'em_analise').length;
    const ticketsAbertos = tickets.filter((t) => t.status === 'aberto').length;
    const aguardandoCliente = tickets.filter((t) => t.status === 'aguardando_cliente').length;
    const cobrancaVencido = cobrancas.filter((c) => c.etapa === 'vencido').length;
    const cobrancaNegociacao = cobrancas.filter((c) => c.etapa === 'negociacao').length;

    return [
      { etapa: 'Análise Pendente', area: 'Crédito', quantidade: analisesPendentes, cor: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300' },
      { etapa: 'Em Análise', area: 'Crédito', quantidade: analisesEmAnalise, cor: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300' },
      { etapa: 'Tickets Abertos', area: 'Atendimento', quantidade: ticketsAbertos, cor: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300' },
      { etapa: 'Aguardando Cliente', area: 'Atendimento', quantidade: aguardandoCliente, cor: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300' },
      { etapa: 'Dívidas Vencidas', area: 'Cobrança', quantidade: cobrancaVencido, cor: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300' },
      { etapa: 'Em Negociação', area: 'Cobrança', quantidade: cobrancaNegociacao, cor: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300' },
    ].sort((a, b) => b.quantidade - a.quantidade);
  }, [analises, tickets, cobrancas]);

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const maxGargalo = Math.max(...gargalos.map((g) => g.quantidade), 1);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">Carregando dados gerenciais...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Kanban - Visão Gerencial</h1>
        <p className="text-muted-foreground mt-1">Indicadores e performance consolidados de todos os Kanbans</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">Análises de Crédito</p>
          <p className="text-2xl font-bold text-foreground">{kpis.totalAnalises}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">Em Andamento</p>
          <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{kpis.emAnalise}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">Taxa Aprovação</p>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">{kpis.taxaAprovacao}%</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">Tickets Pendentes</p>
          <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{kpis.ticketsPendentes}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">$ Em Cobrança</p>
          <p className="text-lg font-bold text-red-600 dark:text-red-400">{formatCurrency(kpis.valorEmCobranca)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">$ Recuperado</p>
          <p className="text-lg font-bold text-green-600 dark:text-green-400">{formatCurrency(kpis.valorRecuperado)}</p>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="volume">
        <TabsList>
          <TabsTrigger value="volume">Distribuição</TabsTrigger>
          <TabsTrigger value="analistas">Desempenho</TabsTrigger>
          <TabsTrigger value="gargalos">Gargalos</TabsTrigger>
        </TabsList>

        {/* TAB: Distribuição */}
        <TabsContent value="volume" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4">
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle className="text-base text-foreground">Volume por Área</CardTitle></CardHeader>
              <CardContent>
                <CategoryBarChart
                  data={distribuicaoPorArea.map((d) => ({ label: d.area, pendente: d.pendente, concluido: d.concluido }))}
                  series={[
                    { label: 'Pendente', color: '#3b82f6', dataKey: 'pendente' },
                    { label: 'Concluído', color: '#22c55e', dataKey: 'concluido' },
                  ]}
                  labelKey="label"
                  height={300}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base text-foreground">Status Crédito</CardTitle></CardHeader>
              <CardContent className="flex justify-center">
                <DonutChart
                  size={230}
                  data={statusCredito.map((s) => ({ name: s.name, value: s.value, color: s.color }))}
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB: Desempenho por Funcionário */}
        <TabsContent value="analistas" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base text-foreground flex items-center gap-2">
                <Users className="w-5 h-5" /> Desempenho Individual — Kanban
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {desempenhoFuncionarios.length === 0 ? (
                <p className="p-6 text-center text-muted-foreground">Nenhum funcionário com ações registradas</p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 text-xs font-semibold text-foreground">Funcionário</th>
                      <th className="text-center p-3 text-xs font-semibold text-foreground">Análises</th>
                      <th className="text-center p-3 text-xs font-semibold text-foreground">Aprov/Rec</th>
                      <th className="text-center p-3 text-xs font-semibold text-foreground">Tickets</th>
                      <th className="text-center p-3 text-xs font-semibold text-foreground">Resolvidos</th>
                      <th className="text-center p-3 text-xs font-semibold text-foreground">Cobranças</th>
                      <th className="text-center p-3 text-xs font-semibold text-foreground">Pagos</th>
                      <th className="text-center p-3 text-xs font-semibold text-foreground">Total</th>
                      <th className="text-center p-3 text-xs font-semibold text-foreground">% Conclusão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {desempenhoFuncionarios.map((f) => (
                      <tr key={f.id} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="p-3 text-sm font-medium text-foreground">
                          {f.nome}
                          <Badge variant="outline" className="ml-2 text-[10px]">{f.role}</Badge>
                        </td>
                        <td className="p-3 text-sm text-center text-foreground">{f.analises}</td>
                        <td className="p-3 text-sm text-center">
                          <span className="text-green-600 dark:text-green-400 font-semibold">{f.aprovadas}</span>
                          <span className="text-muted-foreground">/</span>
                          <span className="text-red-600 dark:text-red-400">{f.recusadas}</span>
                        </td>
                        <td className="p-3 text-sm text-center text-foreground">{f.tickets}</td>
                        <td className="p-3 text-sm text-center text-green-600 dark:text-green-400 font-semibold">{f.ticketsResolvidos}</td>
                        <td className="p-3 text-sm text-center text-foreground">{f.cobrancas}</td>
                        <td className="p-3 text-sm text-center text-green-600 dark:text-green-400 font-semibold">{f.cobrancasPagas}</td>
                        <td className="p-3 text-sm text-center font-bold text-foreground">{f.totalAcoes}</td>
                        <td className="p-3 text-sm text-center">
                          <Badge variant={f.taxaConclusao >= 70 ? 'default' : 'secondary'}>
                            {f.taxaConclusao}%
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: Gargalos */}
        <TabsContent value="gargalos" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {gargalos.map((g, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <Badge className={g.cor}>{g.etapa}</Badge>
                    <span className="text-xs text-muted-foreground">{g.area}</span>
                  </div>
                  <div className="text-3xl font-bold text-foreground">{g.quantidade}</div>
                  <p className="text-sm text-muted-foreground">itens parados nesta etapa</p>
                  <div className="mt-3 w-full bg-muted rounded-full h-2">
                    <div
                      className="bg-primary rounded-full h-2 transition-all"
                      style={{ width: `${(g.quantidade / maxGargalo) * 100}%` }}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
