import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Input } from '../components/ui/input';
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Users, Percent, DollarSign, Search, MessageSquare, Eye, Edit } from 'lucide-react';
import { mockClientes, mockEvoluacaoFinanceira, mockComposicaoCarteira } from '../lib/mockData';
import { StatusBadge } from '../components/StatusBadge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';

const COLORS = ['#2DC937', '#FFB703', '#E71D36'];

export default function DashboardPage() {
  const [selectedClient, setSelectedClient] = useState<any>(null);

  // Calcular métricas
  const totalFaturamento = 1245890;
  const taxaInadimplencia = 5.2;
  const clientesAtivos = 1245;
  const taxaConversao = 68;

  const clientesRecentes = mockClientes.slice(0, 6);

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
            <Select defaultValue="30">
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

            <Select defaultValue="todos">
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

            <Select defaultValue="todos">
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Grupo/Rede" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="rede_a">Rede A</SelectItem>
                <SelectItem value="rede_b">Rede B</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex-1 min-w-64">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Buscar cliente..." className="pl-10" />
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
              Faturamento
            </CardTitle>
            <DollarSign className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalFaturamento)}</div>
            <p className="text-xs text-green-600 flex items-center gap-1 mt-1">
              <TrendingUp className="w-3 h-3" />
              +12% vs mês passado
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
            <div className="text-2xl font-bold">{taxaInadimplencia}%</div>
            <p className="text-xs text-green-600 flex items-center gap-1 mt-1">
              <TrendingDown className="w-3 h-3" />
              -0,8% vs mês passado
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
            <div className="text-2xl font-bold">{clientesAtivos.toLocaleString('pt-BR')}</div>
            <p className="text-xs text-green-600 flex items-center gap-1 mt-1">
              <TrendingUp className="w-3 h-3" />
              +34 novos
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
            <div className="text-2xl font-bold">{taxaConversao}%</div>
            <p className="text-xs text-green-600 flex items-center gap-1 mt-1">
              <TrendingUp className="w-3 h-3" />
              +5% vs mês passado
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
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={mockEvoluacaoFinanceira}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="receita"
                  stroke="#0A2472"
                  strokeWidth={2}
                  name="Receita (R$)"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="inadimplencia"
                  stroke="#E71D36"
                  strokeWidth={2}
                  name="Inadimplência (%)"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status dos Clientes</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={mockComposicaoCarteira}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ status, porcentagem }) => `${status}: ${porcentagem}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="clientes"
                >
                  {mockComposicaoCarteira.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>

            <div className="mt-4 space-y-2">
              {mockComposicaoCarteira.map((item, index) => (
                <div key={item.status} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: COLORS[index] }}
                    />
                    <span>{item.status}</span>
                  </div>
                  <span className="font-medium">
                    {item.clientes} ({item.porcentagem}%)
                  </span>
                </div>
              ))}
            </div>
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
                        {mockClientes.find((c) => c.id === selectedClient.indicadoPor)?.nome}
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
