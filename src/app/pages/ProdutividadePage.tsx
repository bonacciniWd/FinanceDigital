/**
 * @module ProdutividadePage
 * @description Relatórios de produtividade da equipe com dados reais.
 *
 * Métricas contabilizadas por atividades no Kanban:
 *  - role cobranca  → cards em kanban_cobranca (responsavelId)
 *  - role comercial → tickets_atendimento (atendenteId)
 *  - role admin/gerencia → analises_credito (analistaId)
 *
 * @route /equipe/produtividade
 * @access Protegido — perfis admin, gerente
 */
import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { TrendingUp, Award, Target, Clock, Loader2, Trophy, Medal, Star } from 'lucide-react';
import { useFuncionarios, useAllSessoesHoje } from '../hooks/useFuncionarios';
import { useAnalises } from '../hooks/useAnaliseCredito';
import { useCardsCobranca } from '../hooks/useKanbanCobranca';
import { useTickets } from '../hooks/useTickets';
import { CategoryBarChart } from '../components/charts/CategoryBarChart';
import { LWCChart } from '../components/charts/LWCChart';
import type { LWCSeriesDef } from '../components/charts/LWCChart';
import type { Funcionario } from '../lib/view-types';

/** Mapeia role → label do Kanban */
const ROLE_KANBAN_LABEL: Record<string, string> = {
  cobranca: 'Cobrança',
  comercial: 'Atendimento',
  admin: 'Análise Crédito',
  gerencia: 'Análise Crédito',
};

export default function ProdutividadePage() {
  const [periodo, setPeriodo] = useState('semana');
  const { data: funcionarios = [], isLoading: loadingF } = useFuncionarios();
  const { data: sessoesRaw = [] } = useAllSessoesHoje();
  const { data: analises = [], isLoading: loadingA } = useAnalises();
  const { data: cobrancas = [], isLoading: loadingC } = useCardsCobranca();
  const { data: tickets = [], isLoading: loadingT } = useTickets();

  const isLoading = loadingF || loadingA || loadingC || loadingT;

  // ── Atividades kanban por funcionário ────────────────────

  const atividadesPorFunc = useMemo(() => {
    return funcionarios.map((f: Funcionario) => {
      let atividades = 0;
      let kanbanLabel = ROLE_KANBAN_LABEL[f.role] ?? '—';

      if (f.role === 'cobranca') {
        atividades = cobrancas.filter((c) => c.responsavelId === f.id).length;
      } else if (f.role === 'comercial') {
        atividades = tickets.filter((t) => t.atendenteId === f.id).length;
      } else {
        // admin / gerencia → análise de crédito
        atividades = analises.filter((a) => a.analistaId === f.id).length;
      }

      const metaPct = f.metaDiaria > 0 ? Math.round((atividades / f.metaDiaria) * 100) : 0;
      const parts = f.nome.split(' ');
      const nomeAbrev = parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : parts[0];

      return { ...f, atividades, kanbanLabel, metaPct, nomeAbrev };
    });
  }, [funcionarios, analises, cobrancas, tickets]);

  // ── KPIs calculados ──────────────────────────────────────

  const kpis = useMemo(() => {
    if (atividadesPorFunc.length === 0)
      return { metaPct: 0, totalAtiv: 0, mediaHoras: '0h', topPerformer: '—' };

    const totalAtiv = atividadesPorFunc.reduce((sum, f) => sum + f.atividades, 0);
    const totalMeta = atividadesPorFunc.reduce((sum, f) => sum + f.metaDiaria, 0);
    const metaPct = totalMeta > 0 ? Math.round((totalAtiv / totalMeta) * 100) : 0;

    let horasKey: 'horasHoje' | 'horasSemana' | 'horasMes' = 'horasSemana';
    let divisor = 5;
    if (periodo === 'dia') { horasKey = 'horasHoje'; divisor = 1; }
    else if (periodo === 'mes') { horasKey = 'horasMes'; divisor = 22; }

    const totalHoras = atividadesPorFunc.reduce((sum, f) => sum + f[horasKey], 0);
    const mediaHoras = atividadesPorFunc.length > 0 ? (totalHoras / atividadesPorFunc.length / divisor).toFixed(1) : '0';

    let topPerformer = '—';
    let maxRatio = 0;
    atividadesPorFunc.forEach((f) => {
      const ratio = f.metaDiaria > 0 ? f.atividades / f.metaDiaria : 0;
      if (ratio > maxRatio) { maxRatio = ratio; topPerformer = f.nomeAbrev; }
    });

    return { metaPct, totalAtiv, mediaHoras: `${mediaHoras}h`, topPerformer };
  }, [atividadesPorFunc, periodo]);

  // ── Visão Geral: CategoryBarChart meta vs realizado ──────

  const metaVsRealizadoData = useMemo(() => {
    return atividadesPorFunc.map((f) => ({
      label: f.nomeAbrev,
      meta: f.metaDiaria,
      realizado: f.atividades,
    }));
  }, [atividadesPorFunc]);

  // ── Ranking ──────────────────────────────────────────────

  const ranking = useMemo(() => {
    const horasKey = periodo === 'dia' ? 'horasHoje' as const : periodo === 'mes' ? 'horasMes' as const : 'horasSemana' as const;
    return [...atividadesPorFunc]
      .map((f) => {
        const pontos = f.atividades + Math.round(f[horasKey] * 10);
        const parts = f.nome.split(' ');
        const avatar = parts.map((p: string) => p[0]).join('').slice(0, 2).toUpperCase();
        return {
          nome: f.nome,
          pontos,
          metaPct: f.metaPct,
          avatar,
          kanbanLabel: f.kanbanLabel,
          atividades: f.atividades,
          tendencia: f.metaPct >= 100 ? 'up' as const : f.metaPct >= 60 ? 'stable' as const : 'down' as const,
        };
      })
      .sort((a, b) => b.pontos - a.pontos)
      .map((r, i) => ({ ...r, pos: i + 1 }));
  }, [atividadesPorFunc, periodo]);

  // ── Comparativo: CategoryBarChart horizontal ─────────────

  const comparativoData = useMemo(() => {
    return [...atividadesPorFunc]
      .sort((a, b) => b.horasHoje - a.horasHoje)
      .map((f) => ({
        label: f.nomeAbrev,
        horasHoje: Number(f.horasHoje.toFixed(1)),
        horasSemana: Number(f.horasSemana.toFixed(1)),
      }));
  }, [atividadesPorFunc]);

  // ── Por Hora: atividades por hora do dia (LWCChart) ──────

  const atividadesPorHoraSeries = useMemo((): LWCSeriesDef[] => {
    const horas: Record<number, number> = {};
    for (let h = 7; h <= 20; h++) horas[h] = 0;

    sessoesRaw.forEach((s: any) => {
      const h = new Date(s.inicio).getHours();
      if (h >= 7 && h <= 20) horas[h] += (s.acoes || 1);
    });

    const hoje = new Date();
    const mm = String(hoje.getMonth() + 1).padStart(2, '0');
    const yyyy = hoje.getFullYear();
    const data = Object.entries(horas).map(([h, acoes]) => ({
      time: `${yyyy}-${mm}-${String(Number(h) - 6).padStart(2, '0')}`,
      value: acoes,
    }));

    return [{
      label: 'Atividades',
      type: 'area',
      color: '#22c55e',
      data,
    }];
  }, [sessoesRaw]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

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
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/40 rounded-full flex items-center justify-center">
              <Target className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{kpis.metaPct}%</p>
              <p className="text-xs text-muted-foreground">Meta atingida</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{kpis.totalAtiv}</p>
              <p className="text-xs text-muted-foreground">Atividades Kanban</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/40 rounded-full flex items-center justify-center">
              <Clock className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{kpis.mediaHoras}</p>
              <p className="text-xs text-muted-foreground">Média horas/dia</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/40 rounded-full flex items-center justify-center">
              <Award className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{kpis.topPerformer}</p>
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

        {/* ── Visão Geral: barras agrupadas Meta vs Realizado ── */}
        <TabsContent value="visao_geral" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base text-foreground">Meta vs Realizado por Funcionário</CardTitle></CardHeader>
            <CardContent>
              <CategoryBarChart
                data={metaVsRealizadoData}
                series={[
                  { label: 'Meta', color: '#3b82f6', dataKey: 'meta' },
                  { label: 'Realizado', color: '#22c55e', dataKey: 'realizado' },
                ]}
                labelKey="label"
                height={320}
                formatValue={(v) => `${v}`}
                emptyText="Nenhum funcionário cadastrado."
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Por Hora: gráfico de área (LWC) ── */}
        <TabsContent value="por_hora" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base text-foreground">Atividades por Hora do Dia (Hoje)</CardTitle></CardHeader>
            <CardContent>
              <LWCChart
                series={atividadesPorHoraSeries}
                height={350}
                formatValue={(v) => `${v} atividades`}
                emptyText="Nenhuma sessão registrada hoje."
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Ranking redesenhado ── */}
        <TabsContent value="ranking" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 text-foreground">
                <Trophy className="w-4 h-4" /> Ranking de Produtividade
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {ranking.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nenhum funcionário cadastrado.</p>
              ) : ranking.map(r => {
                const isFirst = r.pos === 1;
                const isSecond = r.pos === 2;
                const isThird = r.pos === 3;
                const maxPontos = ranking[0]?.pontos || 1;
                const barPct = Math.max((r.pontos / maxPontos) * 100, 2);

                return (
                  <div
                    key={r.pos}
                    className={`relative flex items-center gap-4 p-4 rounded-xl border transition-colors ${
                      isFirst
                        ? 'border-amber-400/50 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-950/20'
                        : isSecond
                        ? 'border-slate-300/50 bg-slate-50/40 dark:border-slate-500/20 dark:bg-slate-800/20'
                        : isThird
                        ? 'border-orange-300/40 bg-orange-50/30 dark:border-orange-500/20 dark:bg-orange-950/10'
                        : 'border-border bg-card'
                    }`}
                  >
                    {/* Posição com ícone para top 3 */}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                      isFirst
                        ? 'bg-gradient-to-br from-amber-400 to-amber-500 text-white shadow-sm shadow-amber-300/40 dark:shadow-amber-600/30'
                        : isSecond
                        ? 'bg-gradient-to-br from-slate-400 to-slate-500 text-white shadow-sm'
                        : isThird
                        ? 'bg-gradient-to-br from-orange-400 to-orange-500 text-white shadow-sm'
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      {isFirst ? <Trophy className="w-4 h-4" /> : isSecond ? <Medal className="w-4 h-4" /> : isThird ? <Star className="w-4 h-4" /> : r.pos}
                    </div>

                    {/* Avatar */}
                    <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center font-semibold text-sm text-primary shrink-0">
                      {r.avatar}
                    </div>

                    {/* Info + barra de progresso */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-foreground truncate">{r.nome}</p>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                          {r.kanbanLabel}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${
                              r.tendencia === 'up'
                                ? 'bg-emerald-500 dark:bg-emerald-400'
                                : r.tendencia === 'stable'
                                ? 'bg-blue-500 dark:bg-blue-400'
                                : 'bg-red-400 dark:bg-red-500'
                            }`}
                            style={{ width: `${barPct}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-muted-foreground shrink-0 tabular-nums">
                          {r.pontos} pts
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {r.atividades} atividades · {r.metaPct}% da meta
                      </p>
                    </div>

                    {/* Badge de tendência */}
                    <Badge
                      variant={r.tendencia === 'up' ? 'default' : r.tendencia === 'down' ? 'destructive' : 'secondary'}
                      className="shrink-0"
                    >
                      {r.tendencia === 'up' ? '↑ Acima' : r.tendencia === 'down' ? '↓ Abaixo' : '→ Na meta'}
                    </Badge>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Comparativo: barras horizontais ── */}
        <TabsContent value="radar" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base text-foreground">Comparativo — Horas Hoje vs Semana</CardTitle></CardHeader>
            <CardContent>
              <CategoryBarChart
                data={comparativoData}
                series={[
                  { label: 'Horas Hoje', color: '#22c55e', dataKey: 'horasHoje' },
                  { label: 'Horas Semana', color: '#3b82f6', dataKey: 'horasSemana' },
                ]}
                labelKey="label"
                layout="horizontal"
                height={Math.max(280, atividadesPorFunc.length * 60)}
                formatValue={(v) => `${v}h`}
                emptyText="Nenhum funcionário cadastrado."
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
