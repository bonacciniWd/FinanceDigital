/**
 * @module BonusComissoesPage
 * @description Gestão de bônus e comissões da rede de indicações.
 *
 * Exibe comissões acumuladas, pendentes de pagamento e pagas.
 * Gráfico BarChart de comissões por mês. Tabela detalhada
 * com indicação, valor do empréstimo e comissão gerada.
 *
 * @route /rede/bonus-comissoes
 * @access Protegido — perfis admin, gerente
 */
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { DollarSign, TrendingUp, Gift, Users, Download } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useClientes } from '../hooks/useClientes';

const bonusMensais = [
  { mes: 'Set', bonus: 4500 },
  { mes: 'Out', bonus: 6200 },
  { mes: 'Nov', bonus: 7800 },
  { mes: 'Dez', bonus: 5100 },
  { mes: 'Jan', bonus: 8400 },
  { mes: 'Fev', bonus: 6600 },
];

export default function BonusComissoesPage() {
  const { data: allClientes = [] } = useClientes();

  const indicadoresComBonus = allClientes
    .filter(c => c.bonusAcumulado > 0)
    .sort((a, b) => b.bonusAcumulado - a.bonusAcumulado);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const totalBonusMes = 6600;
  const totalBonusAcumulado = indicadoresComBonus.reduce((acc, c) => acc + c.bonusAcumulado, 0);
  const totalIndicacoes = allClientes.filter(c => c.indicou && c.indicou.length > 0).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Bônus e Comissões</h1>
          <p className="text-muted-foreground mt-1">Gerencie os bônus de indicação e comissões</p>
        </div>
        <Button variant="outline"><Download className="w-4 h-4 mr-2" />Exportar</Button>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Bônus Este Mês</CardTitle>
            <DollarSign className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">{formatCurrency(totalBonusMes)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Acumulado</CardTitle>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatCurrency(totalBonusAcumulado)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Indicadores Ativos</CardTitle>
            <Users className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{totalIndicacoes}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Bônus Médio</CardTitle>
            <Gift className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatCurrency(totalBonusAcumulado / indicadoresComBonus.length)}</div></CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico */}
        <Card>
          <CardHeader><CardTitle>Evolução de Bônus Mensais</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={bonusMensais}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="bonus" name="Bônus" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Ranking */}
        <Card>
          <CardHeader><CardTitle>Ranking de Indicadores</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {indicadoresComBonus.map((cliente, index) => (
                <div key={cliente.id} className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white ${index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-muted-foreground' : index === 2 ? 'bg-amber-700' : 'bg-muted-foreground'}`}>
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">{cliente.nome}</div>
                    <div className="text-xs text-muted-foreground">{cliente.indicou?.length || 0} indicações</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-green-600">{formatCurrency(cliente.bonusAcumulado)}</div>
                    <div className="text-xs text-muted-foreground">acumulado</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
