/**
 * @module DashboardComercialPage
 * @description Dashboard comercial com métricas de vendas e captação.
 *
 * Exibe novos clientes, volume de empréstimos originados,
 * taxa de conversão de leads e meta mensal. Gráficos de
 * desempenho da equipe comercial (BarChart por vendedor).
 *
 * @route /dashboard/comercial
 * @access Protegido — perfis admin, gerente, comercial
 */
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Users, Target, TrendingUp, UserPlus, ArrowUpRight } from 'lucide-react';


const conversoesMensais = [
  { mes: 'Set', leads: 120, convertidos: 45, taxa: 37.5 },
  { mes: 'Out', leads: 145, convertidos: 58, taxa: 40.0 },
  { mes: 'Nov', leads: 160, convertidos: 72, taxa: 45.0 },
  { mes: 'Dez', leads: 130, convertidos: 52, taxa: 40.0 },
  { mes: 'Jan', leads: 175, convertidos: 82, taxa: 46.9 },
  { mes: 'Fev', leads: 155, convertidos: 75, taxa: 48.4 },
];

const topIndicadores = [
  { nome: 'João Silva', indicacoes: 12, convertidos: 8, bonus: 2400 },
  { nome: 'Fernanda Lima', indicacoes: 9, convertidos: 6, bonus: 1800 },
  { nome: 'Paulo Mendes', indicacoes: 7, convertidos: 5, bonus: 1500 },
  { nome: 'Pedro Oliveira', indicacoes: 5, convertidos: 3, bonus: 900 },
];

const pipelineLeads = [
  { etapa: 'Prospect', quantidade: 45 },
  { etapa: 'Contato', quantidade: 32 },
  { etapa: 'Análise', quantidade: 22 },
  { etapa: 'Proposta', quantidade: 15 },
  { etapa: 'Aprovado', quantidade: 8 },
];

export default function DashboardComercialPage() {
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Dashboard Comercial</h1>
        <p className="text-muted-foreground mt-1">Métricas de captação, conversão e rede de indicações</p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Leads Este Mês</CardTitle>
            <Users className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">155</div>
            <div className="flex items-center text-sm text-red-500 mt-1">-11.4% vs mês anterior</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Conversões</CardTitle>
            <Target className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">75</div>
            <div className="flex items-center text-sm text-green-600 mt-1">
              <ArrowUpRight className="w-4 h-4" /> Taxa: 48.4%
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Indicações Ativas</CardTitle>
            <UserPlus className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">33</div>
            <div className="flex items-center text-sm text-green-600 mt-1">
              <ArrowUpRight className="w-4 h-4" /> +15% vs mês anterior
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Crédito Aprovado</CardTitle>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(485000)}</div>
            <div className="flex items-center text-sm text-green-600 mt-1">
              <ArrowUpRight className="w-4 h-4" /> +8.2% vs mês anterior
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Conversões */}
        <Card>
          <CardHeader><CardTitle>Leads vs Conversões</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={conversoesMensais}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="leads" name="Leads" fill="var(--chart-1)" />
                <Bar dataKey="convertidos" name="Convertidos" fill="var(--chart-2)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Pipeline */}
        <Card>
          <CardHeader><CardTitle>Pipeline de Leads</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={pipelineLeads} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="etapa" type="category" width={80} />
                <Tooltip />
                <Bar dataKey="quantidade" fill="var(--chart-1)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Top Indicadores */}
      <Card>
        <CardHeader><CardTitle>Top Indicadores</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 font-medium text-muted-foreground">Indicador</th>
                  <th className="text-center py-3 font-medium text-muted-foreground">Indicações</th>
                  <th className="text-center py-3 font-medium text-muted-foreground">Convertidos</th>
                  <th className="text-center py-3 font-medium text-muted-foreground">Taxa</th>
                  <th className="text-right py-3 font-medium text-muted-foreground">Bônus</th>
                </tr>
              </thead>
              <tbody>
                {topIndicadores.map((ind, i) => (
                  <tr key={i} className="border-b hover:bg-muted/50">
                    <td className="py-3 font-medium">{ind.nome}</td>
                    <td className="py-3 text-center">{ind.indicacoes}</td>
                    <td className="py-3 text-center">
                      <Badge variant="secondary">{ind.convertidos}</Badge>
                    </td>
                    <td className="py-3 text-center">{((ind.convertidos / ind.indicacoes) * 100).toFixed(0)}%</td>
                    <td className="py-3 text-right font-medium text-green-600">{formatCurrency(ind.bonus)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
