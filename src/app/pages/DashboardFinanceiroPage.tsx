/**
 * @module DashboardFinanceiroPage
 * @description Dashboard financeiro detalhado.
 *
 * Exibe receita bruta/líquida, lucro operacional, ROI e
 * taxa de inadimplência com gráficos LineChart e BarChart.
 * Permite filtro por período (mês/trimestre/ano).
 *
 * @route /dashboard/financeiro
 * @access Protegido — perfis admin, gerente, operador
 * @see mockEvoluacaoFinanceira
 */
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { DollarSign, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Download } from 'lucide-react';

const receitasMensais = [
  { mes: 'Set', receita: 780000, despesa: 320000, lucro: 460000 },
  { mes: 'Out', receita: 920000, despesa: 350000, lucro: 570000 },
  { mes: 'Nov', receita: 1050000, despesa: 380000, lucro: 670000 },
  { mes: 'Dez', receita: 1180000, despesa: 410000, lucro: 770000 },
  { mes: 'Jan', receita: 1250000, despesa: 420000, lucro: 830000 },
  { mes: 'Fev', receita: 1320000, despesa: 440000, lucro: 880000 },
];

const composicaoReceita = [
  { name: 'Juros', value: 680000, color: 'var(--chart-1)' },
  { name: 'Multas', value: 120000, color: 'var(--chart-4)' },
  { name: 'Taxas', value: 85000, color: 'var(--chart-3)' },
  { name: 'Comissões', value: 45000, color: 'var(--chart-2)' },
];

const fluxoCaixa = [
  { dia: '17/02', entrada: 45000, saida: 12000 },
  { dia: '18/02', entrada: 38000, saida: 8000 },
  { dia: '19/02', entrada: 52000, saida: 15000 },
  { dia: '20/02', entrada: 28000, saida: 22000 },
  { dia: '21/02', entrada: 61000, saida: 9000 },
  { dia: '22/02', entrada: 15000, saida: 5000 },
  { dia: '23/02', entrada: 42000, saida: 11000 },
];

export default function DashboardFinanceiroPage() {
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Dashboard Financeiro</h1>
          <p className="text-muted-foreground mt-1">Visão detalhada da saúde financeira da operação</p>
        </div>
        <div className="flex gap-3">
          <Select defaultValue="fev">
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="jan">Janeiro 2026</SelectItem>
              <SelectItem value="fev">Fevereiro 2026</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline"><Download className="w-4 h-4 mr-2" />Exportar</Button>
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
            <div className="text-2xl font-bold">{formatCurrency(1320000)}</div>
            <div className="flex items-center text-sm text-green-600 mt-1">
              <ArrowUpRight className="w-4 h-4" /> +5.6% vs mês anterior
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Despesas</CardTitle>
            <TrendingDown className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(440000)}</div>
            <div className="flex items-center text-sm text-red-600 mt-1">
              <ArrowDownRight className="w-4 h-4" /> +4.8% vs mês anterior
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Lucro Líquido</CardTitle>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(880000)}</div>
            <div className="flex items-center text-sm text-green-600 mt-1">
              <ArrowUpRight className="w-4 h-4" /> +6.0% vs mês anterior
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Margem</CardTitle>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">66.7%</div>
            <div className="flex items-center text-sm text-green-600 mt-1">
              <ArrowUpRight className="w-4 h-4" /> +0.3pp vs mês anterior
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Evolução Receita x Despesa</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={receitasMensais}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Legend />
                <Line type="monotone" dataKey="receita" name="Receita" stroke="var(--chart-1)" strokeWidth={2} />
                <Line type="monotone" dataKey="despesa" name="Despesa" stroke="var(--chart-4)" strokeWidth={2} />
                <Line type="monotone" dataKey="lucro" name="Lucro" stroke="var(--chart-5)" strokeWidth={2} strokeDasharray="5 5" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Composição da Receita</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={composicaoReceita} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {composicaoReceita.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Fluxo de Caixa Diário */}
      <Card>
        <CardHeader><CardTitle>Fluxo de Caixa - Últimos 7 dias</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={fluxoCaixa}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="dia" />
              <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
              <Legend />
              <Bar dataKey="entrada" name="Entradas" fill="var(--chart-5)" />
              <Bar dataKey="saida" name="Saídas" fill="var(--chart-4)" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
