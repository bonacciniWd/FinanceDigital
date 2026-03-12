/**
 * @module DashboardPage
 * @description Dashboard principal (visão geral) do FintechFlow.
 *
 * Apresenta KPIs consolidados: total emprestado, inadimplência,
 * clientes ativos, receita prevista. Inclui gráficos de evolução
 * financeira (AreaChart) e composição de carteira (PieChart).
 * Filtros por período e busca rápida.
 *
 * @route /dashboard
 * @access Protegido — todos os perfis autenticados
 * @see mockEvoluacaoFinanceira, mockComposicaoCarteira
 */
import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Input } from '../components/ui/input';
import { TrendingUp, TrendingDown, Users, Percent, DollarSign, Search, MessageSquare, Eye, Edit, Loader2 } from 'lucide-react';
import { LWCChart } from '../components/charts/LWCChart';
import { DonutChart } from '../components/charts/DonutChart';
import { useClientes } from '../hooks/useClientes';
import { useEmprestimos } from '../hooks/useEmprestimos';
import { useDashboardStats, useFinancialSummary } from '../hooks/useDashboardStats';
import { StatusBadge } from '../components/StatusBadge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';

const DONUT_COLORS = ['#22c55e', '#eab308', '#ef4444'];

const PERIODO_MESES: Record<string, number> = { '7': 1, '30': 2, '90': 3, '365': 12 };

export default function DashboardPage() {
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [periodo, setPeriodo] = useState('30');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [grupoFilter, setGrupoFilter] = useState('todos');
  const [busca, setBusca] = useState('');

  const { data: clientes = [] } = useClientes();
  const { data: emprestimos = [] } = useEmprestimos();
  const { data: stats, isLoading: loadingStats } = useDashboardStats();
  const { data: evoluacaoFinanceira = [] } = useFinancialSummary(PERIODO_MESES[periodo] ?? 2);

  // Derivar inadimplência real a partir dos empréstimos
  const clienteIdsInadimplentes = new Set(
    emprestimos.filter(e => e.status === 'inadimplente').map(e => e.clienteId)
  );
  const vencidosReal = clienteIdsInadimplentes.size;

  // KPIs reais do RPC (com fallback derivado dos empréstimos)
  const totalCarteira = stats?.total_carteira ?? 0;
  const taxaInadimplenciaReal = clientes.length > 0
    ? Math.round((vencidosReal / clientes.length) * 100)
    : (stats?.taxa_inadimplencia ?? 0);
  const clientesAtivos = stats?.total_clientes ?? clientes.length;
  // Taxa conversão = aprovados / (aprovados + recusados) — derivado de clientes em_dia / total
  const taxaConversao = clientesAtivos > 0
    ? Math.round(((stats?.clientes_em_dia ?? 0) / clientesAtivos) * 100)
    : 0;

  // Effective status per client — empréstimos are source of truth for 'vencido'
  const getEffectiveStatus = (c: typeof clientes[0]) =>
    clienteIdsInadimplentes.has(c.id) ? 'vencido' : c.status;

  // Derive rede options from indicadoPor chain (same logic as RedeIndicacoesPage)
  const { redesOptions, clienteRootMap } = useMemo(() => {
    const clienteById = new Map(clientes.map((c) => [c.id, c]));

    function findRoot(id: string): string {
      const visited = new Set<string>();
      let cur = id;
      while (true) {
        if (visited.has(cur)) break;
        visited.add(cur);
        const parent = clienteById.get(cur)?.indicadoPor;
        if (!parent || !clienteById.has(parent)) break;
        cur = parent;
      }
      return cur;
    }

    const rootMap = new Map<string, string>();
    for (const c of clientes) rootMap.set(c.id, findRoot(c.id));

    // Only include roots that at least one other client points to (real networks)
    const hasFollowers = new Set(clientes.filter((c) => c.indicadoPor).map((c) => c.indicadoPor!));
    const seenRoots = new Set<string>();
    const options: { id: string; nome: string }[] = [];
    for (const [, rootId] of rootMap) {
      if (!seenRoots.has(rootId) && hasFollowers.has(rootId)) {
        seenRoots.add(rootId);
        const rc = clienteById.get(rootId);
        if (rc) options.push({ id: rootId, nome: rc.nome });
      }
    }
    return {
      redesOptions: options.sort((a, b) => a.nome.localeCompare(b.nome)),
      clienteRootMap: rootMap,
    };
  }, [clientes]);

  const clientesRecentes = clientes
    .filter((c) => statusFilter === 'todos' || getEffectiveStatus(c) === statusFilter)
    .filter((c) => grupoFilter === 'todos' || clienteRootMap.get(c.id) === grupoFilter)
    .filter((c) => !busca.trim() || c.nome.toLowerCase().includes(busca.toLowerCase()))
    .slice(0, 6);

  // Composição da carteira derivada dos empréstimos (fonte de verdade)
  const totalCl = clientes.length || 1;
  const vencidos = vencidosReal;
  const emDia = clientes.filter(c => !clienteIdsInadimplentes.has(c.id) && c.status !== 'a_vencer').length;
  const aVencer = clientes.filter(c => !clienteIdsInadimplentes.has(c.id) && c.status === 'a_vencer').length;
  const composicaoCarteira = [
    { status: 'Em dia', clientes: emDia, porcentagem: Math.round((emDia / totalCl) * 100) },
    { status: 'À vencer', clientes: aVencer, porcentagem: Math.round((aVencer / totalCl) * 100) },
    { status: 'Vencidos', clientes: vencidos, porcentagem: Math.round((vencidos / totalCl) * 100) },
  ];

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('pt-BR');
  };

  return (
    <div className="space-y-6">
      {/* Título */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Dashboard - Visão Geral</h1>
        <p className="text-muted-foreground mt-1">Acompanhe as principais métricas da sua operação</p>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <Select value={periodo} onValueChange={setPeriodo}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="90">Últimos 90 dias</SelectItem>
                <SelectItem value="365">Último ano</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="em_dia">Em dia</SelectItem>
                <SelectItem value="a_vencer">À vencer</SelectItem>
                <SelectItem value="vencido">Vencidos</SelectItem>
              </SelectContent>
            </Select>

            <Select value={grupoFilter} onValueChange={setGrupoFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Rede (Pioneiro)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as Redes</SelectItem>
                {redesOptions.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex-1 min-w-64">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar cliente..."
                  className="pl-10"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cards de Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Carteira Ativa
            </CardTitle>
            <DollarSign className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loadingStats ? '...' : formatCurrency(totalCarteira)}</div>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              {stats?.total_emprestimos_ativos ?? 0} empréstimos ativos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Inadimplência
            </CardTitle>
            <Percent className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loadingStats ? '...' : `${taxaInadimplenciaReal}%`}</div>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              {vencidosReal} clientes vencidos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Clientes Ativos
            </CardTitle>
            <Users className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loadingStats ? '...' : clientesAtivos.toLocaleString('pt-BR')}</div>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              {stats?.clientes_a_vencer ?? 0} a vencer
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Taxa Conversão
            </CardTitle>
            <Percent className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loadingStats ? '...' : `${taxaConversao}%`}</div>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              clientes em dia / total
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Evolução de Receita x Inadimplência</CardTitle>
          </CardHeader>
          <CardContent>
            <LWCChart
              height={300}
              series={[
                {
                  label: 'Receita (R$)',
                  color: '#3b82f6',
                  type: 'area',
                  data: evoluacaoFinanceira.map((m) => ({ time: m.mes, value: m.receita })),
                },
                {
                  label: 'Inadimplência (%)',
                  color: '#ef4444',
                  type: 'line',
                  data: evoluacaoFinanceira.map((m) => ({ time: m.mes, value: m.inadimplencia })),
                },
              ]}
              emptyText="Aguardando dados do servidor…"
            />
            {/* Legenda manual */}
            <div className="flex gap-6 justify-center mt-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="w-3 h-0.5 bg-blue-500 inline-block rounded" />
                Receita
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="w-3 h-0.5 bg-red-500 inline-block rounded" />
                Inadimplência
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status dos Clientes</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center">
            <DonutChart
              size={210}
              data={composicaoCarteira.map((item, i) => ({
                name: item.status,
                value: item.clientes,
                color: DONUT_COLORS[i % DONUT_COLORS.length],
              }))}
              centerLabel={String(clientes.length)}
            />
          </CardContent>
        </Card>
      </div>

      {/* Tabela de Clientes */}
      <Card>
        <CardHeader>
          <CardTitle>Clientes Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium">Cliente</th>
                  <th className="text-left py-3 px-4 font-medium">Status</th>
                  <th className="text-left py-3 px-4 font-medium">Valor</th>
                  <th className="text-left py-3 px-4 font-medium">Vencimento</th>
                  <th className="text-left py-3 px-4 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {clientesRecentes.map((cliente) => (
                  <tr key={cliente.id} className="border-b hover:bg-muted/50">
                    <td className="py-3 px-4">{cliente.nome}</td>
                    <td className="py-3 px-4">
                      <StatusBadge status={cliente.status} />
                    </td>
                    <td className="py-3 px-4">{formatCurrency(cliente.valor)}</td>
                    <td className="py-3 px-4">{formatDate(cliente.vencimento)}</td>
                    <td className="py-3 px-4">
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm">
                          <MessageSquare className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedClient(cliente)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Edit className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Modal de Detalhes do Cliente */}
      <Dialog open={!!selectedClient} onOpenChange={() => setSelectedClient(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="w-12 h-12 bg-primary text-white rounded-full flex items-center justify-center font-semibold text-lg">
                {selectedClient?.nome.charAt(0)}
              </div>
              <div>
                <div>{selectedClient?.nome}</div>
                <div className="text-sm text-muted-foreground font-normal">
                  {selectedClient?.email} • {selectedClient?.telefone}
                </div>
              </div>
            </DialogTitle>
          </DialogHeader>

          {selectedClient && (
            <div className="space-y-6">
              <div>
                <h3 className="font-medium mb-3">📊 Informações Financeiras</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Limite:</span>
                    <div className="font-medium">{formatCurrency(selectedClient.limiteCredito)}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Utilizado:</span>
                    <div className="font-medium">{formatCurrency(selectedClient.creditoUtilizado)}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Disponível:</span>
                    <div className="font-medium text-green-600">
                      {formatCurrency(selectedClient.limiteCredito - selectedClient.creditoUtilizado)}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Score Interno:</span>
                    <div className="font-medium">{selectedClient.scoreInterno}/1000</div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-medium mb-3">🕸️ Rede de Indicações</h3>
                <div className="text-sm space-y-1">
                  <p>
                    <span className="text-muted-foreground">Indicou:</span>{' '}
                    <span className="font-medium">
                      {selectedClient.indicou?.length || 0} pessoa(s)
                    </span>
                  </p>
                  {selectedClient.indicadoPor && (
                    <p>
                      <span className="text-muted-foreground">Indicado por:</span>{' '}
                      <span className="font-medium">
                        {clientes.find((c) => c.id === selectedClient.indicadoPor)?.nome}
                      </span>
                    </p>
                  )}
                  <p>
                    <span className="text-muted-foreground">Bônus acumulado:</span>{' '}
                    <span className="font-medium text-green-600">
                      {formatCurrency(selectedClient.bonusAcumulado)}
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <Button className="flex-1">Editar</Button>
                <Button variant="outline" className="flex-1">
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Chat
                </Button>
                <Button variant="destructive" className="flex-1">
                  Bloquear
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
