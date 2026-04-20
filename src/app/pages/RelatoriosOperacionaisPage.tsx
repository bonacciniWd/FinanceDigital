/**
 * @module RelatoriosOperacionaisPage
 * @description Relatórios operacionais com abas temáticas — dados reais do Supabase.
 *
 * Tabs: Cobrança, Crédito, Atendimento. Cada aba exibe
 * métricas específicas com gráficos, tabelas resumo e
 * filtros de período/equipe. Exportação individual por seção.
 *
 * @route /relatorios/operacionais
 * @access Protegido — perfis admin, gerente
 */
import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, AreaChart, Area, Legend } from 'recharts';
import { Download, TrendingUp, AlertCircle, DollarSign, Users, Loader2 } from 'lucide-react';
import { useParcelas } from '../hooks/useParcelas';
import { useEmprestimos } from '../hooks/useEmprestimos';
import { useCardsCobranca } from '../hooks/useKanbanCobranca';
import { useClientes } from '../hooks/useClientes';

const MESES_NOME = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** Retorna quantos meses olhar atrás com base no valor do select */
function periodoParaMeses(p: string): number {
  switch (p) {
    case '1m': return 1;
    case '3m': return 3;
    case '6m': return 6;
    case '12m': return 12;
    default: return 6;
  }
}

export default function RelatoriosOperacionaisPage() {
  const [periodo, setPeriodo] = useState('6m');
  const meses = periodoParaMeses(periodo);

  const { data: parcelas, isLoading: loadingParcelas } = useParcelas();
  const { data: emprestimos, isLoading: loadingEmprestimos } = useEmprestimos();
  const { data: cardsCobranca, isLoading: loadingCards } = useCardsCobranca();
  const { data: clientes, isLoading: loadingClientes } = useClientes();

  const loading = loadingParcelas || loadingEmprestimos || loadingCards || loadingClientes;

  // ── Dados de Inadimplência por mês ──
  const inadimplenciaData = useMemo(() => {
    if (!parcelas) return [];
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const result: { mes: string; taxa: number }[] = [];
    for (let i = meses - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mesNum = d.getMonth();
      const anoNum = d.getFullYear();
      const doMes = parcelas.filter((p) => {
        const dv = new Date(p.dataVencimento);
        return dv.getMonth() === mesNum && dv.getFullYear() === anoNum;
      });
      const vencidas = doMes.filter((p) => p.status !== 'paga' && p.status !== 'cancelada' && new Date(p.dataVencimento) < today).length;
      const taxa = doMes.length > 0 ? parseFloat(((vencidas / doMes.length) * 100).toFixed(1)) : 0;
      result.push({ mes: MESES_NOME[mesNum], taxa });
    }
    return result;
  }, [parcelas, meses]);

  // ── Volume de Operações por mês ──
  const volumeData = useMemo(() => {
    if (!emprestimos) return [];
    const now = new Date();
    const result: { mes: string; emprestimos: number; valor: number }[] = [];
    for (let i = meses - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mesNum = d.getMonth();
      const anoNum = d.getFullYear();
      const doMes = emprestimos.filter((e) => {
        const dc = new Date(e.dataContrato);
        return dc.getMonth() === mesNum && dc.getFullYear() === anoNum;
      });
      result.push({
        mes: MESES_NOME[mesNum],
        emprestimos: doMes.length,
        valor: doMes.reduce((s, e) => s + e.valor, 0),
      });
    }
    return result;
  }, [emprestimos, meses]);

  // ── Recebimentos Diários (mês atual) ──
  const recebimentosData = useMemo(() => {
    if (!parcelas) return [];
    const now = new Date();
    const mesAtual = now.getMonth();
    const anoAtual = now.getFullYear();
    // Agrupa por dia (5 em 5 dias)
    const diasChave = [1, 5, 10, 15, 20, 25, 30];
    return diasChave.map((dia) => {
      const diaInicio = dia;
      const diaFim = diasChave[diasChave.indexOf(dia) + 1] || 32;
      const previstas = parcelas.filter((p) => {
        const dv = new Date(p.dataVencimento);
        return (
          dv.getMonth() === mesAtual &&
          dv.getFullYear() === anoAtual &&
          dv.getDate() >= diaInicio &&
          dv.getDate() < diaFim
        );
      });
      const previsto = previstas.reduce((s, p) => s + p.valor, 0);
      const recebido = previstas
        .filter((p) => p.status === 'paga')
        .reduce((s, p) => s + p.valor, 0);
      return { dia: String(dia).padStart(2, '0'), previsto, recebido };
    });
  }, [parcelas]);

  // ── Eficiência de Cobrança por Etapa (com N1/N2/N3) ──
  const cobrancaData = useMemo(() => {
    if (!cardsCobranca) return [];
    const vencidos = cardsCobranca.filter((c) => c.etapa === 'vencido');
    const n1Cards = vencidos.filter((c) => c.diasAtraso >= 1 && c.diasAtraso <= 15);
    const n2Cards = vencidos.filter((c) => c.diasAtraso >= 16 && c.diasAtraso <= 45);
    const n3Cards = vencidos.filter((c) => c.diasAtraso >= 46);

    type EtapaDef = { etapa: string; cards: typeof cardsCobranca; successFn: (c: typeof cardsCobranca) => number };
    const etapas: EtapaDef[] = [
      { etapa: 'N1 — Vencido (1-15d)', cards: n1Cards, successFn: (cs) => cs.filter((c) => c.tentativasContato >= 1).length },
      { etapa: 'N2 — Vencido (16-45d)', cards: n2Cards, successFn: (cs) => cs.filter((c) => c.tentativasContato >= 1).length },
      { etapa: 'N3 — Vencido (46d+)', cards: n3Cards, successFn: (cs) => cs.filter((c) => c.tentativasContato >= 1).length },
      { etapa: '1° Contato', cards: cardsCobranca.filter((c) => c.etapa === 'contatado'), successFn: (cs) => cs.filter((c) => c.tentativasContato >= 1).length },
      { etapa: 'Negociação', cards: cardsCobranca.filter((c) => c.etapa === 'negociacao'), successFn: (cs) => cs.filter((c) => c.tentativasContato >= 2).length },
      { etapa: 'Acordo', cards: cardsCobranca.filter((c) => c.etapa === 'acordo'), successFn: (cs) => cs.length },
      { etapa: 'Arquivados', cards: cardsCobranca.filter((c) => c.etapa === 'arquivado'), successFn: () => 0 },
      { etapa: 'Pago', cards: cardsCobranca.filter((c) => c.etapa === 'pago'), successFn: (cs) => cs.length },
      { etapa: 'Perdido', cards: cardsCobranca.filter((c) => c.etapa === 'perdido'), successFn: () => 0 },
    ];
    return etapas.map(({ etapa, cards, successFn }) => {
      const total = cards.length;
      const sucesso = successFn(cards);
      const taxa = total > 0 ? Math.round((sucesso / total) * 100) : 0;
      return { etapa, total, sucesso, taxa };
    });
  }, [cardsCobranca]);

  // ── Desempenho por Responsável ──
  const userCobrancaData = useMemo(() => {
    if (!cardsCobranca) return [];
    const byUser = new Map<string, { nome: string; total: number; contatados: number; acordos: number; pagos: number; perdidos: number; n1: number; n2: number; n3: number }>();
    for (const c of cardsCobranca) {
      const nome = c.responsavelNome || 'Sem responsável';
      if (!byUser.has(nome)) byUser.set(nome, { nome, total: 0, contatados: 0, acordos: 0, pagos: 0, perdidos: 0, n1: 0, n2: 0, n3: 0 });
      const u = byUser.get(nome)!;
      u.total++;
      if (c.etapa === 'contatado') u.contatados++;
      if (c.etapa === 'acordo') u.acordos++;
      if (c.etapa === 'pago') u.pagos++;
      if (c.etapa === 'perdido') u.perdidos++;
      if (c.etapa === 'vencido') {
        if (c.diasAtraso >= 1 && c.diasAtraso <= 15) u.n1++;
        else if (c.diasAtraso >= 16 && c.diasAtraso <= 45) u.n2++;
        else if (c.diasAtraso >= 46) u.n3++;
      }
    }
    return Array.from(byUser.values()).sort((a, b) => b.total - a.total);
  }, [cardsCobranca]);

  // ── KPIs ──
  const kpis = useMemo(() => {
    if (!emprestimos || !parcelas || !clientes || !cardsCobranca) {
      return { volumeTotal: 0, inadimplencia: 0, clientesAtivos: 0, taxaRecuperacao: 0 };
    }
    const now = new Date();
    const limiteInicio = new Date(now.getFullYear(), now.getMonth() - meses, 1);

    const empPeriodo = emprestimos.filter((e) => new Date(e.dataContrato) >= limiteInicio);
    const volumeTotal = empPeriodo.reduce((s, e) => s + e.valor, 0);

    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const parcelasPeriodo = parcelas.filter((p) => new Date(p.dataVencimento) >= limiteInicio);
    const vencidas = parcelasPeriodo.filter((p) => p.status !== 'paga' && p.status !== 'cancelada' && new Date(p.dataVencimento) < today).length;
    const inadimplencia =
      parcelasPeriodo.length > 0
        ? parseFloat(((vencidas / parcelasPeriodo.length) * 100).toFixed(1))
        : 0;

    const clientesAtivos = clientes.filter((c) => c.status !== 'vencido').length;

    const totalCobranca = cardsCobranca.filter((c) => c.etapa !== 'arquivado').length;
    const pagos = cardsCobranca.filter((c) => c.etapa === 'pago' || c.etapa === 'acordo').length;
    const taxaRecuperacao = totalCobranca > 0 ? Math.round((pagos / totalCobranca) * 100) : 0;

    return { volumeTotal, inadimplencia, clientesAtivos, taxaRecuperacao };
  }, [emprestimos, parcelas, clientes, cardsCobranca, meses]);

  const formatBRL = (v: number) =>
    v >= 1_000_000
      ? `R$ ${(v / 1_000_000).toFixed(2).replace('.', ',')}M`
      : `R$ ${v.toLocaleString('pt-BR')}`;

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
            <p className="text-2xl font-bold">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : formatBRL(kpis.volumeTotal)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <AlertCircle className="w-3 h-3" /> Inadimplência
            </div>
            <p className="text-2xl font-bold">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : `${kpis.inadimplencia}%`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Users className="w-3 h-3" /> Clientes Ativos
            </div>
            <p className="text-2xl font-bold">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : kpis.clientesAtivos}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <TrendingUp className="w-3 h-3" /> Taxa Recuperação
            </div>
            <p className="text-2xl font-bold">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : `${kpis.taxaRecuperacao}%`}
            </p>
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
              {loading ? (
                <div className="flex items-center justify-center h-[350px]">
                  <Loader2 className="w-6 h-6 animate-spin mr-2" /> Carregando...
                </div>
              ) : inadimplenciaData.length === 0 ? (
                <div className="flex items-center justify-center h-[350px] text-muted-foreground">
                  Sem dados no período
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={inadimplenciaData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="mes" />
                    <YAxis domain={[0, 'auto']} tickFormatter={v => `${v}%`} />
                    <Tooltip formatter={(v: number) => `${v}%`} />
                    <Line type="monotone" dataKey="taxa" stroke="var(--chart-4)" strokeWidth={2} dot={{ r: 4 }} name="Taxa de Inadimplência" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="volume" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Volume de Operações por Mês</CardTitle></CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center h-[350px]">
                  <Loader2 className="w-6 h-6 animate-spin mr-2" /> Carregando...
                </div>
              ) : volumeData.length === 0 ? (
                <div className="flex items-center justify-center h-[350px] text-muted-foreground">
                  Sem dados no período
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={volumeData}>
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
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recebimentos" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Recebimentos Diários - Previsto vs Realizado</CardTitle></CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center h-[350px]">
                  <Loader2 className="w-6 h-6 animate-spin mr-2" /> Carregando...
                </div>
              ) : recebimentosData.every((d) => d.previsto === 0 && d.recebido === 0) ? (
                <div className="flex items-center justify-center h-[350px] text-muted-foreground">
                  Sem dados no mês atual
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={350}>
                  <AreaChart data={recebimentosData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="dia" />
                    <YAxis tickFormatter={v => `R$ ${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => `R$ ${v.toLocaleString('pt-BR')}`} />
                    <Legend />
                    <Area type="monotone" dataKey="previsto" fill="var(--chart-1)" stroke="var(--chart-1)" fillOpacity={0.3} name="Previsto" />
                    <Area type="monotone" dataKey="recebido" fill="var(--chart-5)" stroke="var(--chart-5)" fillOpacity={0.3} name="Recebido" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cobranca" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Eficiência por Etapa de Cobrança</CardTitle></CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mr-2" /> Carregando...
                </div>
              ) : cobrancaData.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  Sem dados de cobrança
                </div>
              ) : (
                <div className="space-y-4">
                  {cobrancaData.map((etapa, i) => (
                    <div key={i} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-sm">{etapa.etapa}</span>
                        <span className="text-sm text-muted-foreground">
                          {etapa.sucesso}/{etapa.total} ({etapa.taxa}%)
                        </span>
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
              )}
            </CardContent>
          </Card>

          {/* Desempenho por Responsável */}
          <Card>
            <CardHeader><CardTitle className="text-base">Desempenho por Responsável</CardTitle></CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mr-2" /> Carregando...
                </div>
              ) : userCobrancaData.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  Sem dados de responsáveis
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-4 font-medium">Responsável</th>
                        <th className="py-2 px-2 font-medium text-center">Total</th>
                        <th className="py-2 px-2 font-medium text-center text-yellow-600">N1</th>
                        <th className="py-2 px-2 font-medium text-center text-orange-600">N2</th>
                        <th className="py-2 px-2 font-medium text-center text-red-600">N3</th>
                        <th className="py-2 px-2 font-medium text-center">Contatados</th>
                        <th className="py-2 px-2 font-medium text-center">Acordos</th>
                        <th className="py-2 px-2 font-medium text-center text-green-600">Pagos</th>
                        <th className="py-2 px-2 font-medium text-center text-red-500">Perdidos</th>
                        <th className="py-2 pl-2 font-medium text-center">Eficiência</th>
                      </tr>
                    </thead>
                    <tbody>
                      {userCobrancaData.map((u) => {
                        const eficiencia = u.total > 0 ? Math.round(((u.pagos + u.acordos) / u.total) * 100) : 0;
                        return (
                          <tr key={u.nome} className="border-b last:border-0 hover:bg-muted/50">
                            <td className="py-2 pr-4 font-medium">{u.nome}</td>
                            <td className="py-2 px-2 text-center">{u.total}</td>
                            <td className="py-2 px-2 text-center text-yellow-600 font-medium">{u.n1 || '-'}</td>
                            <td className="py-2 px-2 text-center text-orange-600 font-medium">{u.n2 || '-'}</td>
                            <td className="py-2 px-2 text-center text-red-600 font-medium">{u.n3 || '-'}</td>
                            <td className="py-2 px-2 text-center">{u.contatados || '-'}</td>
                            <td className="py-2 px-2 text-center">{u.acordos || '-'}</td>
                            <td className="py-2 px-2 text-center text-green-600 font-medium">{u.pagos || '-'}</td>
                            <td className="py-2 px-2 text-center text-red-500 font-medium">{u.perdidos || '-'}</td>
                            <td className="py-2 pl-2 text-center">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                eficiencia >= 70 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                : eficiencia >= 35 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                              }`}>
                                {eficiencia}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
