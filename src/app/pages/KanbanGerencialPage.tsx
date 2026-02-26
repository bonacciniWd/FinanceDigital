/**
 * @module KanbanGerencialPage
 * @description Visão gerencial consolidada de todos os Kanbans.
 *
 * Tabs para alternar entre visões (Cobrança, Análise, Atendimento).
 * KPIs agregados, gráficos BarChart de distribuição por coluna
 * e métricas de tempo médio em cada etapa.
 *
 * @route /kanban/gerencial
 * @access Protegido — perfis admin, gerente
 */
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { AlertCircle, CheckCircle, Clock, TrendingUp, Users, ArrowUpDown } from 'lucide-react';

const visaoGeral = {
  totalSolicitacoes: 284,
  emAndamento: 47,
  aprovados: 198,
  recusados: 39,
  tempoMedioAnalise: '2.3 dias',
  taxaAprovacao: 83.5,
};

const porAnalista = [
  { nome: 'Carlos Lima', emAnalise: 12, aprovadasMes: 45, recusadasMes: 5, tempoMedio: '1.8d' },
  { nome: 'Fernanda Souza', emAnalise: 8, aprovadasMes: 38, recusadasMes: 8, tempoMedio: '2.1d' },
  { nome: 'Ricardo Santos', emAnalise: 15, aprovadasMes: 32, recusadasMes: 12, tempoMedio: '2.9d' },
  { nome: 'Paula Oliveira', emAnalise: 12, aprovadasMes: 41, recusadasMes: 6, tempoMedio: '1.5d' },
];

const volumePorSemana = [
  { semana: 'Sem 1', novas: 18, aprovadas: 15, recusadas: 3 },
  { semana: 'Sem 2', novas: 22, aprovadas: 19, recusadas: 4 },
  { semana: 'Sem 3', novas: 25, aprovadas: 20, recusadas: 5 },
  { semana: 'Sem 4', novas: 20, aprovadas: 18, recusadas: 3 },
];

const porStatus = [
  { name: 'Aprovadas', value: 198, color: '#22c55e' },
  { name: 'Em Análise', value: 47, color: '#eab308' },
  { name: 'Recusadas', value: 39, color: '#ef4444' },
];

const gargalos = [
  { etapa: 'Documentação', quantidade: 18, tempoMedio: '1.5d', cor: 'bg-orange-100 text-orange-800' },
  { etapa: 'Análise de Crédito', quantidade: 12, tempoMedio: '2.8d', cor: 'bg-red-100 text-red-800' },
  { etapa: 'Aprovação Final', quantidade: 8, tempoMedio: '1.2d', cor: 'bg-yellow-100 text-yellow-800' },
  { etapa: 'Liberação', quantidade: 9, tempoMedio: '0.5d', cor: 'bg-green-100 text-green-800' },
];

export default function KanbanGerencialPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Kanban - Visão Gerencial</h1>
        <p className="text-muted-foreground mt-1">Indicadores e performance do pipeline de crédito</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">Total Solicitações</p>
          <p className="text-2xl font-bold">{visaoGeral.totalSolicitacoes}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">Em Andamento</p>
          <p className="text-2xl font-bold text-yellow-600">{visaoGeral.emAndamento}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">Aprovados</p>
          <p className="text-2xl font-bold text-green-600">{visaoGeral.aprovados}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">Recusados</p>
          <p className="text-2xl font-bold text-red-600">{visaoGeral.recusados}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">Tempo Médio</p>
          <p className="text-2xl font-bold">{visaoGeral.tempoMedioAnalise}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">Taxa Aprovação</p>
          <p className="text-2xl font-bold text-green-600">{visaoGeral.taxaAprovacao}%</p>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="volume">
        <TabsList>
          <TabsTrigger value="volume">Volume Semanal</TabsTrigger>
          <TabsTrigger value="analistas">Por Analista</TabsTrigger>
          <TabsTrigger value="gargalos">Gargalos</TabsTrigger>
        </TabsList>

        <TabsContent value="volume" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4">
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle className="text-base">Volume por Semana</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={volumePorSemana}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="semana" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="novas" fill="var(--chart-1)" name="Novas" />
                    <Bar dataKey="aprovadas" fill="var(--chart-5)" name="Aprovadas" />
                    <Bar dataKey="recusadas" fill="var(--chart-4)" name="Recusadas" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Distribuição por Status</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={porStatus} cx="50%" cy="50%" innerRadius={60} outerRadius={90}
                      paddingAngle={5} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                      {porStatus.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="analistas" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 text-sm font-semibold">Analista</th>
                    <th className="text-center p-3 text-sm font-semibold">Em Análise</th>
                    <th className="text-center p-3 text-sm font-semibold">Aprovadas/Mês</th>
                    <th className="text-center p-3 text-sm font-semibold">Recusadas/Mês</th>
                    <th className="text-center p-3 text-sm font-semibold">Tempo Médio</th>
                    <th className="text-center p-3 text-sm font-semibold">Taxa Aprovação</th>
                  </tr>
                </thead>
                <tbody>
                  {porAnalista.map((a, i) => {
                    const taxa = ((a.aprovadasMes / (a.aprovadasMes + a.recusadasMes)) * 100).toFixed(0);
                    return (
                      <tr key={i} className="border-b hover:bg-muted/30">
                        <td className="p-3 text-sm font-medium">{a.nome}</td>
                        <td className="p-3 text-sm text-center">
                          <Badge variant="outline">{a.emAnalise}</Badge>
                        </td>
                        <td className="p-3 text-sm text-center text-green-600 font-semibold">{a.aprovadasMes}</td>
                        <td className="p-3 text-sm text-center text-red-600">{a.recusadasMes}</td>
                        <td className="p-3 text-sm text-center">{a.tempoMedio}</td>
                        <td className="p-3 text-sm text-center">
                          <Badge variant={Number(taxa) >= 80 ? 'default' : 'secondary'}>{taxa}%</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gargalos" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {gargalos.map((g, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <Badge className={g.cor}>{g.etapa}</Badge>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      <span>Média: {g.tempoMedio}</span>
                    </div>
                  </div>
                  <div className="text-3xl font-bold">{g.quantidade}</div>
                  <p className="text-sm text-muted-foreground">solicitações paradas nesta etapa</p>
                  <div className="mt-3 w-full bg-muted rounded-full h-2">
                    <div
                      className="bg-primary rounded-full h-2 transition-all"
                      style={{ width: `${(g.quantidade / 20) * 100}%` }}
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
