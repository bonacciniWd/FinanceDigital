/**
 * @module RelatoriosOperacionaisPage
 * @description Relatórios operacionais com abas temáticas.
 *
 * Tabs: Cobrança, Crédito, Atendimento. Cada aba exibe
 * métricas específicas com gráficos, tabelas resumo e
 * filtros de período/equipe. Exportação individual por seção.
 *
 * @route /relatorios/operacionais
 * @access Protegido — perfis admin, gerente
 */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, AreaChart, Area, Legend } from 'recharts';
import { Download, Calendar, TrendingUp, AlertCircle, DollarSign, Users } from 'lucide-react';

const inadimplencia = [
  { mes: 'Jan', taxa: 4.2 }, { mes: 'Fev', taxa: 3.8 }, { mes: 'Mar', taxa: 5.1 },
  { mes: 'Abr', taxa: 4.7 }, { mes: 'Mai', taxa: 4.3 }, { mes: 'Jun', taxa: 3.9 },
];

const volumeOperacoes = [
  { mes: 'Jan', emprestimos: 45, valor: 180000 },
  { mes: 'Fev', emprestimos: 52, valor: 210000 },
  { mes: 'Mar', emprestimos: 48, valor: 195000 },
  { mes: 'Abr', emprestimos: 61, valor: 248000 },
  { mes: 'Mai', emprestimos: 55, valor: 225000 },
  { mes: 'Jun', emprestimos: 67, valor: 275000 },
];

const recebimentosDiarios = [
  { dia: '01', previsto: 12500, recebido: 11800 },
  { dia: '05', previsto: 15000, recebido: 14200 },
  { dia: '10', previsto: 18000, recebido: 16500 },
  { dia: '15', previsto: 22000, recebido: 20800 },
  { dia: '20', previsto: 16000, recebido: 15200 },
  { dia: '25', previsto: 19000, recebido: 17800 },
  { dia: '30', previsto: 14000, recebido: 13500 },
];

const cobrancaEficiencia = [
  { etapa: '1° Contato', total: 120, sucesso: 42, taxa: 35 },
  { etapa: '2° Contato', total: 78, sucesso: 28, taxa: 36 },
  { etapa: 'Negociação', total: 50, sucesso: 35, taxa: 70 },
  { etapa: 'Acordo', total: 35, sucesso: 30, taxa: 86 },
  { etapa: 'Jurídico', total: 15, sucesso: 5, taxa: 33 },
];

export default function RelatoriosOperacionaisPage() {
  const [periodo, setPeriodo] = useState('6m');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Relatórios Operacionais</h1>
          <p className="text-muted-foreground mt-1">Indicadores operacionais e métricas de desempenho</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={periodo} onValueChange={setPeriodo}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1m">Último Mês</SelectItem>
              <SelectItem value="3m">3 Meses</SelectItem>
              <SelectItem value="6m">6 Meses</SelectItem>
              <SelectItem value="12m">12 Meses</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" /> Exportar PDF
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <DollarSign className="w-3 h-3" /> Volume Total
            </div>
            <p className="text-2xl font-bold">R$ 1.33M</p>
            <p className="text-xs text-green-600">+15% vs período anterior</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <AlertCircle className="w-3 h-3" /> Inadimplência
            </div>
            <p className="text-2xl font-bold">4.3%</p>
            <p className="text-xs text-green-600">-0.8% vs período anterior</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Users className="w-3 h-3" /> Clientes Ativos
            </div>
            <p className="text-2xl font-bold">328</p>
            <p className="text-xs text-green-600">+23 novos no período</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <TrendingUp className="w-3 h-3" /> Taxa Recuperação
            </div>
            <p className="text-2xl font-bold">72%</p>
            <p className="text-xs text-green-600">+5% vs período anterior</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="inadimplencia">
        <TabsList>
          <TabsTrigger value="inadimplencia">Inadimplência</TabsTrigger>
          <TabsTrigger value="volume">Volume de Operações</TabsTrigger>
          <TabsTrigger value="recebimentos">Recebimentos</TabsTrigger>
          <TabsTrigger value="cobranca">Eficiência de Cobrança</TabsTrigger>
        </TabsList>

        <TabsContent value="inadimplencia" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Evolução da Inadimplência (%)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={inadimplencia}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" />
                  <YAxis domain={[0, 8]} tickFormatter={v => `${v}%`} />
                  <Tooltip formatter={(v: number) => `${v}%`} />
                  <Line type="monotone" dataKey="taxa" stroke="var(--chart-4)" strokeWidth={2} dot={{ r: 4 }} name="Taxa de Inadimplência" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="volume" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Volume de Operações por Mês</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={volumeOperacoes}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={v => `R$ ${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number, name: string) => name === 'valor' ? `R$ ${v.toLocaleString('pt-BR')}` : v} />
                  <Legend />
                  <Bar yAxisId="left" dataKey="emprestimos" fill="var(--chart-1)" name="Qtd. Empréstimos" />
                  <Bar yAxisId="right" dataKey="valor" fill="var(--chart-5)" name="Valor Total" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recebimentos" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Recebimentos Diários - Previsto vs Realizado</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <AreaChart data={recebimentosDiarios}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="dia" />
                  <YAxis tickFormatter={v => `R$ ${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => `R$ ${v.toLocaleString('pt-BR')}`} />
                  <Legend />
                  <Area type="monotone" dataKey="previsto" fill="var(--chart-1)" stroke="var(--chart-1)" fillOpacity={0.3} name="Previsto" />
                  <Area type="monotone" dataKey="recebido" fill="var(--chart-5)" stroke="var(--chart-5)" fillOpacity={0.3} name="Recebido" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cobranca" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Eficiência por Etapa de Cobrança</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-4">
                {cobrancaEficiencia.map((etapa, i) => (
                  <div key={i} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-sm">{etapa.etapa}</span>
                      <span className="text-sm text-muted-foreground">{etapa.sucesso}/{etapa.total} ({etapa.taxa}%)</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-3">
                      <div
                        className={`rounded-full h-3 transition-all ${etapa.taxa >= 70 ? 'bg-green-500' : etapa.taxa >= 35 ? 'bg-yellow-500' : 'bg-red-500'}`}
                        style={{ width: `${etapa.taxa}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
