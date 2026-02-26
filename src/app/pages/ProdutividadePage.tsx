/**
 * @module ProdutividadePage
 * @description Relatórios de produtividade da equipe.
 *
 * Métricas: atendimentos/hora, tempo médio de resolução, acordos
 * fechados e taxa de conversão por funcionário. Gráficos RadarChart
 * de competências e BarChart de produtividade por hora/dia.
 *
 * @route /equipe/produtividade
 * @access Protegido — perfis admin, gerente
 * @see mockProdutividadePorHora, mockProdutividadeSemanal, mockFuncionarios
 */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { TrendingUp, Award, Target, Clock, Users } from 'lucide-react';
import { mockFuncionarios, mockProdutividadePorHora, mockProdutividadeSemanal } from '../lib/mockData';

const metricasPorFuncionario = [
  { nome: 'Carlos L.', atendimentos: 45, cobranças: 32, analises: 18, conversoes: 12, meta: 40, realizado: 45 },
  { nome: 'Maria S.', atendimentos: 52, cobranças: 41, analises: 22, conversoes: 15, meta: 45, realizado: 52 },
  { nome: 'Pedro O.', atendimentos: 28, cobranças: 20, analises: 14, conversoes: 8, meta: 35, realizado: 28 },
  { nome: 'Fernanda S.', atendimentos: 38, cobranças: 28, analises: 16, conversoes: 10, meta: 38, realizado: 38 },
];

const radarData = [
  { metrica: 'Atendimentos', Carlos: 90, Maria: 100, Pedro: 60, Fernanda: 80 },
  { metrica: 'Cobranças', Carlos: 75, Maria: 95, Pedro: 55, Fernanda: 70 },
  { metrica: 'Análises', Carlos: 85, Maria: 90, Pedro: 65, Fernanda: 75 },
  { metrica: 'Conversões', Carlos: 70, Maria: 88, Pedro: 50, Fernanda: 65 },
  { metrica: 'Pontualidade', Carlos: 95, Maria: 92, Pedro: 72, Fernanda: 88 },
  { metrica: 'Horas', Carlos: 88, Maria: 95, Pedro: 68, Fernanda: 82 },
];

const ranking = [
  { pos: 1, nome: 'Maria Santos', pontos: 1250, tendencia: 'up', avatar: 'MS' },
  { pos: 2, nome: 'Carlos Lima', pontos: 1120, tendencia: 'up', avatar: 'CL' },
  { pos: 3, nome: 'Fernanda Souza', pontos: 980, tendencia: 'stable', avatar: 'FS' },
  { pos: 4, nome: 'Pedro Oliveira', pontos: 720, tendencia: 'down', avatar: 'PO' },
];

export default function ProdutividadePage() {
  const [periodo, setPeriodo] = useState('semana');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Produtividade da Equipe</h1>
          <p className="text-muted-foreground mt-1">Análise de desempenho e metas da equipe</p>
        </div>
        <Select value={periodo} onValueChange={setPeriodo}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="dia">Hoje</SelectItem>
            <SelectItem value="semana">Esta Semana</SelectItem>
            <SelectItem value="mes">Este Mês</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <Target className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">87%</p>
              <p className="text-xs text-muted-foreground">Meta atingida</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">163</p>
              <p className="text-xs text-muted-foreground">Atendimentos</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
              <Clock className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">7.2h</p>
              <p className="text-xs text-muted-foreground">Média horas/dia</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
              <Award className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">Maria S.</p>
              <p className="text-xs text-muted-foreground">Top performer</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="visao_geral">
        <TabsList>
          <TabsTrigger value="visao_geral">Visão Geral</TabsTrigger>
          <TabsTrigger value="por_hora">Por Hora</TabsTrigger>
          <TabsTrigger value="ranking">Ranking</TabsTrigger>
          <TabsTrigger value="radar">Comparativo</TabsTrigger>
        </TabsList>

        <TabsContent value="visao_geral" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-base">Meta vs Realizado por Funcionário</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={metricasPorFuncionario}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="nome" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="meta" fill="var(--chart-1)" name="Meta" fillOpacity={0.4} />
                    <Bar dataKey="realizado" fill="var(--chart-1)" name="Realizado" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Evolução Semanal</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={mockProdutividadeSemanal}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="dia" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="atendimentos" stroke="var(--chart-1)" strokeWidth={2} name="Atendimentos" />
                    <Line type="monotone" dataKey="cobrancas" stroke="var(--chart-4)" strokeWidth={2} name="Cobranças" />
                    <Line type="monotone" dataKey="conversoes" stroke="var(--chart-5)" strokeWidth={2} name="Conversões" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="por_hora" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Atividades por Hora do Dia</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={mockProdutividadePorHora}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hora" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="atividades" fill="var(--chart-1)" name="Atividades" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ranking" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Award className="w-4 h-4" /> Ranking de Produtividade</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {ranking.map(r => (
                <div key={r.pos} className={`flex items-center gap-4 p-4 rounded-lg border ${r.pos === 1 ? 'border-yellow-300 bg-yellow-50' : ''}`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
                    r.pos === 1 ? 'bg-yellow-400 text-white' : r.pos === 2 ? 'bg-muted-foreground text-white' : r.pos === 3 ? 'bg-amber-600 text-white' : 'bg-muted text-muted-foreground'
                  }`}>
                    {r.pos}
                  </div>
                  <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center font-semibold text-sm text-primary">
                    {r.avatar}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold">{r.nome}</p>
                    <p className="text-xs text-muted-foreground">{r.pontos} pontos</p>
                  </div>
                  <Badge variant={r.tendencia === 'up' ? 'default' : r.tendencia === 'down' ? 'destructive' : 'secondary'}>
                    {r.tendencia === 'up' ? '↑ Subindo' : r.tendencia === 'down' ? '↓ Caindo' : '→ Estável'}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="radar" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Comparativo por Métricas</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="metrica" />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} />
                  <Radar name="Carlos" dataKey="Carlos" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.15} />
                  <Radar name="Maria" dataKey="Maria" stroke="var(--chart-5)" fill="var(--chart-5)" fillOpacity={0.15} />
                  <Radar name="Pedro" dataKey="Pedro" stroke="var(--chart-4)" fill="var(--chart-4)" fillOpacity={0.15} />
                  <Radar name="Fernanda" dataKey="Fernanda" stroke="var(--chart-3)" fill="var(--chart-3)" fillOpacity={0.15} />
                  <Legend />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
