/**
 * @module BonusComissoesPage
 * @description Gestão de bônus e comissões da rede de indicações.
 *
 * Exibe comissões acumuladas, pendentes de pagamento e pagas.
 * Gráfico BarChart de comissões por mês. Tabela detalhada
 * dos indicadores com bônus, score e status na rede.
 *
 * @route /rede/bonus-comissoes
 * @access Protegido — perfis admin, gerente
 */
import { useMemo, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { DollarSign, TrendingUp, Gift, Users, Download, Search, ArrowUpDown } from 'lucide-react';
import { LWCChart } from '../components/charts/LWCChart';
import { DonutChart } from '../components/charts/DonutChart';
import { useMembrosRede, useBloqueiosAtivos } from '../hooks/useRedeIndicacoes';

const DONUT_COLORS = ['#22c55e', '#eab308', '#ef4444', '#6b7280'];

export default function BonusComissoesPage() {
  const { data: allMembros = [], isLoading } = useMembrosRede();
  const { data: bloqueiosAtivos = [] } = useBloqueiosAtivos();
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'bonus' | 'nome' | 'indicacoes'>('bonus');

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  // Calculate who is an "indicador" (someone who has referred others)
  const indicadores = useMemo(() => {
    const indicadorMap = new Map<string, {
      clienteId: string;
      nome: string;
      email: string;
      status: string;
      membroStatus: string;
      bonusAcumulado: number;
      scoreInterno: number;
      indicacoes: number;
      redeId: string;
    }>();

    // Count how many people each member has referred
    allMembros.forEach((m) => {
      if (m.indicadoPor) {
        const parent = indicadorMap.get(m.indicadoPor);
        if (parent) {
          parent.indicacoes++;
        }
      }
    });

    // Build a proper list from members who have bonus > 0 or have referred someone
    allMembros.forEach((m) => {
      if (!indicadorMap.has(m.clienteId)) {
        indicadorMap.set(m.clienteId, {
          clienteId: m.clienteId,
          nome: m.clienteNome,
          email: m.clienteEmail,
          status: m.clienteStatus,
          membroStatus: m.status,
          bonusAcumulado: m.clienteBonusAcumulado,
          scoreInterno: m.clienteScoreInterno,
          indicacoes: 0,
          redeId: m.redeId,
        });
      } else {
        const existing = indicadorMap.get(m.clienteId)!;
        existing.bonusAcumulado = m.clienteBonusAcumulado;
        existing.nome = m.clienteNome;
        existing.email = m.clienteEmail;
        existing.status = m.clienteStatus;
        existing.membroStatus = m.status;
        existing.scoreInterno = m.clienteScoreInterno;
        existing.redeId = m.redeId;
      }
    });

    // Now count indicacoes properly
    allMembros.forEach((m) => {
      if (m.indicadoPor && indicadorMap.has(m.indicadoPor)) {
        indicadorMap.get(m.indicadoPor)!.indicacoes++;
      }
    });

    return Array.from(indicadorMap.values()).filter(
      (i) => i.bonusAcumulado > 0 || i.indicacoes > 0
    );
  }, [allMembros]);

  // Global stats
  const totalBonusAcumulado = useMemo(
    () => indicadores.reduce((acc, i) => acc + i.bonusAcumulado, 0),
    [indicadores]
  );
  const totalIndicacoes = useMemo(
    () => indicadores.reduce((acc, i) => acc + i.indicacoes, 0),
    [indicadores]
  );
  // Evolução de bônus mês a mês — derivada do bonus_acumulado real dos membros
  const bonusMensais = useMemo(() => {
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      // membros criados até esse mês
      const membrosAteMes = allMembros.filter(
        (m) => new Date(m.createdAt) <= new Date(d.getFullYear(), d.getMonth() + 1, 0),
      );
      const bonus = membrosAteMes.reduce((acc, m) => acc + m.clienteBonusAcumulado, 0);
      return { mes: meses[d.getMonth()], bonus };
    });
  }, [allMembros]);

  const totalBonusMes = bonusMensais[bonusMensais.length - 1]?.bonus ?? 0;

  // Filtered and sorted
  const filteredIndicadores = useMemo(() => {
    let list = indicadores;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((i) => i.nome.toLowerCase().includes(q) || i.email.toLowerCase().includes(q));
    }
    return list.sort((a, b) => {
      if (sortBy === 'bonus') return b.bonusAcumulado - a.bonusAcumulado;
      if (sortBy === 'indicacoes') return b.indicacoes - a.indicacoes;
      return a.nome.localeCompare(b.nome);
    });
  }, [indicadores, search, sortBy]);

  // Status breakdown for PieChart
  const statusData = useMemo(() => {
    const em_dia = allMembros.filter((m) => m.clienteStatus === 'em_dia').length;
    const a_vencer = allMembros.filter((m) => m.clienteStatus === 'a_vencer').length;
    const vencido = allMembros.filter((m) => m.clienteStatus === 'vencido').length;
    const bloqueado = allMembros.filter((m) => m.status === 'bloqueado').length;
    return [
      { name: 'Em dia', value: em_dia },
      { name: 'À vencer', value: a_vencer },
      { name: 'Vencidos', value: vencido },
      { name: 'Bloqueados', value: bloqueado },
    ];
  }, [allMembros]);

  const handleExportar = useCallback(() => {
    if (filteredIndicadores.length === 0) return;
    const header = 'Nome,Email,Status,Indicações,Bônus Acumulado,Score';
    const rows = filteredIndicadores.map(i =>
      [i.nome, i.email, i.status, i.indicacoes, i.bonusAcumulado.toFixed(2), i.scoreInterno].join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bonus-comissoes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredIndicadores]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Bônus e Comissões</h1>
          <p className="text-muted-foreground mt-1">Gerencie os bônus de indicação e comissões da rede</p>
        </div>
        <Button variant="outline" onClick={handleExportar}><Download className="w-4 h-4 mr-2" />Exportar</Button>
      </div>

      {/* Cards métricas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Bônus Este Mês</CardTitle>
            <DollarSign className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{formatCurrency(totalBonusMes)}</div>
            <p className="text-xs text-muted-foreground mt-1">último período</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Acumulado</CardTitle>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalBonusAcumulado)}</div>
            <p className="text-xs text-muted-foreground mt-1">todos os indicadores</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Indicadores Ativos</CardTitle>
            <Users className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{indicadores.length}</div>
            <p className="text-xs text-muted-foreground mt-1">{totalIndicacoes} indicações total</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Bônus Médio</CardTitle>
            <Gift className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {indicadores.length > 0 ? formatCurrency(totalBonusAcumulado / indicadores.length) : 'R$ 0'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">por indicador</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico de Evolução */}
        <Card>
          <CardHeader><CardTitle>Evolução de Bônus Mensais</CardTitle></CardHeader>
          <CardContent>
            <LWCChart
              height={300}
              series={[{
                label: 'Bônus',
                color: '#a855f7',
                type: 'histogram',
                data: bonusMensais.map((b) => ({ time: b.mes, value: b.bonus })),
              }]}
              emptyText="Sem dados de bônus registrados"
            />
          </CardContent>
        </Card>

        {/* Status Pie */}
        <Card>
          <CardHeader><CardTitle>Composição da Rede</CardTitle></CardHeader>
          <CardContent className="flex justify-center">
            <DonutChart
              size={270}
              data={statusData.map((d, i) => ({
                name: d.name,
                value: d.value,
                color: DONUT_COLORS[i % DONUT_COLORS.length],
              }))}
            />
          </CardContent>
        </Card>
      </div>

      {/* Ranking / Tabela de Indicadores */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Ranking de Indicadores</CardTitle>
            <div className="flex gap-2 items-center">
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar indicador..."
                  className="pl-10"
                />
              </div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="bonus">Maior Bônus</option>
                <option value="indicacoes">Mais Indicações</option>
                <option value="nome">Nome A-Z</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium text-sm">#</th>
                  <th className="text-left py-3 px-4 font-medium text-sm">Indicador</th>
                  <th className="text-left py-3 px-4 font-medium text-sm">Rede</th>
                  <th className="text-center py-3 px-4 font-medium text-sm">Indicações</th>
                  <th className="text-center py-3 px-4 font-medium text-sm">Score</th>
                  <th className="text-right py-3 px-4 font-medium text-sm">Bônus Acumulado</th>
                  <th className="text-center py-3 px-4 font-medium text-sm">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredIndicadores.map((ind, index) => (
                  <tr key={ind.clienteId} className="border-b hover:bg-muted/50 transition-colors">
                    <td className="py-3 px-4">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs text-white ${
                        index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-gray-400' : index === 2 ? 'bg-amber-700' : 'bg-muted-foreground'
                      }`}>
                        {index + 1}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                          ind.status === 'vencido' ? 'bg-red-500' : ind.status === 'a_vencer' ? 'bg-yellow-500' : 'bg-green-500'
                        }`}>
                          {ind.nome.charAt(0)}
                        </div>
                        <div>
                          <div className="font-medium text-sm">{ind.nome}</div>
                          <div className="text-xs text-muted-foreground">{ind.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant="outline" className="text-xs">{ind.redeId}</Badge>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="font-semibold">{ind.indicacoes}</span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Badge className={`text-xs ${
                        ind.scoreInterno >= 700 ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300' :
                        ind.scoreInterno >= 400 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300' :
                        'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
                      }`}>
                        {ind.scoreInterno}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="font-bold text-green-600 dark:text-green-400">{formatCurrency(ind.bonusAcumulado)}</span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Badge className={`text-xs ${
                        ind.membroStatus === 'bloqueado'
                          ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
                          : ind.status === 'vencido'
                          ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
                          : 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
                      }`}>
                        {ind.membroStatus === 'bloqueado' ? '🔴 Bloqueado' : ind.status === 'vencido' ? '⚠️ Vencido' : '✅ Ativo'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredIndicadores.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum indicador encontrado
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
