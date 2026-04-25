/**
 * @module HistoricoClientesPage
 * @description Histórico unificado de atividades dos clientes.
 *
 * Gera uma timeline a partir de dados reais (React Query):
 * - **Pagamentos** — parcelas pagas (data de pagamento)
 * - **Empréstimos** — novos contratos (data de contrato)
 * - **Análises de crédito** — aprovações/recusas/pendentes
 * - **Vencimentos** — parcelas vencidas sem pagamento
 *
 * Filtros por tipo de evento e busca por nome do cliente.
 * Dark mode compliant, loading skeleton, empty state.
 *
 * @route /clientes/historico
 * @access Protegido — perfis admin, gerência
 */
import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Skeleton } from '../components/ui/skeleton';
import {
  Search, Download, DollarSign, FileText, AlertTriangle, ClipboardCheck,
  Clock, CreditCard, Ban, Activity,
} from 'lucide-react';
import { useParcelas } from '../hooks/useParcelas';
import { useEmprestimos } from '../hooks/useEmprestimos';
import { useAnalises } from '../hooks/useAnaliseCredito';

/* ── Tipos ────────────────────────────────────────────────── */

type TipoEvento = 'pagamento' | 'emprestimo' | 'analise' | 'vencimento';

interface HistoricoItem {
  id: string;
  clienteNome: string;
  tipo: TipoEvento;
  descricao: string;
  valor?: number;
  data: string;          // ISO string
  detalhe?: string;      // informação secundária
}

/* ── Componente ───────────────────────────────────────────── */

export default function HistoricoClientesPage() {
  const { data: parcelas = [], isLoading: loadingParcelas } = useParcelas();
  const { data: emprestimos = [], isLoading: loadingEmprestimos } = useEmprestimos();
  const { data: analises = [], isLoading: loadingAnalises } = useAnalises();

  const isLoading = loadingParcelas || loadingEmprestimos || loadingAnalises;

  const [searchTerm, setSearchTerm] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<string>('todos');

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  /* ── Gerar timeline unificada ───────────────────────────── */

  const timeline = useMemo<HistoricoItem[]>(() => {
    const items: HistoricoItem[] = [];

    // 1. Pagamentos realizados (parcelas pagas)
    parcelas
      .filter(p => p.status === 'paga' && p.dataPagamento)
      .forEach(p => {
        items.push({
          id: `pag-${p.id}`,
          clienteNome: p.clienteNome,
          tipo: 'pagamento',
          descricao: `Parcela ${p.numero} paga${p.desconto > 0 ? ` (desconto ${formatCurrency(p.desconto)})` : ''}`,
          valor: p.valor,
          data: p.dataPagamento!,
          detalhe: `Original: ${formatCurrency(p.valorOriginal)}`,
        });
      });

    // 2. Parcelas vencidas (não pagas, status = vencida)
    parcelas
      .filter(p => p.status === 'vencida')
      .forEach(p => {
        items.push({
          id: `venc-${p.id}`,
          clienteNome: p.clienteNome,
          tipo: 'vencimento',
          descricao: `Parcela ${p.numero} vencida — juros ${formatCurrency(p.juros)} + multa ${formatCurrency(p.multa)}`,
          valor: p.valor,
          data: p.dataVencimento,
          detalhe: `Vencimento: ${new Date(p.dataVencimento).toLocaleDateString('pt-BR')}`,
        });
      });

    // 3. Empréstimos criados
    emprestimos.forEach(e => {
      items.push({
        id: `emp-${e.id}`,
        clienteNome: e.clienteNome ?? 'Cliente',
        tipo: 'emprestimo',
        descricao: `Novo empréstimo — ${e.parcelas}x de ${formatCurrency(e.valorParcela)} (${e.taxaJuros}% ${
          e.tipoJuros === 'mensal' ? 'a.m.' : e.tipoJuros === 'semanal' ? 'a.s.' : 'a.d.'
        })`,
        valor: e.valor,
        data: e.dataContrato,
        detalhe: `Status: ${e.status}`,
      });
    });

    // 4. Análises de crédito
    analises.forEach(a => {
      const statusLabel = { pendente: 'pendente', em_analise: 'em análise', aprovado: 'aprovada', recusado: 'recusada' }[a.status] ?? a.status;
      items.push({
        id: `ana-${a.id}`,
        clienteNome: a.clienteNome,
        tipo: 'analise',
        descricao: `Análise de crédito ${statusLabel} — ${formatCurrency(a.valorSolicitado)}`,
        valor: a.valorSolicitado,
        data: a.dataSolicitacao,
        detalhe: a.motivo ? `Motivo: ${a.motivo}` : `Score Serasa: ${a.scoreSerasa}`,
      });
    });

    // Ordenar por data decrescente
    return items.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
  }, [parcelas, emprestimos, analises]);

  /* ── Filtros ────────────────────────────────────────────── */

  const filtered = useMemo(() =>
    timeline.filter(h => {
      const matchSearch = !searchTerm || h.clienteNome.toLowerCase().includes(searchTerm.toLowerCase());
      const matchTipo = filtroTipo === 'todos' || h.tipo === filtroTipo;
      return matchSearch && matchTipo;
    }),
    [timeline, searchTerm, filtroTipo],
  );

  /* ── Métricas ───────────────────────────────────────────── */

  const metricas = useMemo(() => {
    const pagamentos = timeline.filter(h => h.tipo === 'pagamento');
    const vencidas = timeline.filter(h => h.tipo === 'vencimento');
    return {
      totalEventos: timeline.length,
      pagamentos: pagamentos.length,
      valorPagamentos: pagamentos.reduce((a, p) => a + (p.valor ?? 0), 0),
      vencidas: vencidas.length,
      emprestimos: timeline.filter(h => h.tipo === 'emprestimo').length,
      analises: timeline.filter(h => h.tipo === 'analise').length,
    };
  }, [timeline]);
  /* ── Exportar CSV ───────────────────────────────────────── */

  const handleExportar = useCallback(() => {
    if (filtered.length === 0) return;
    const header = 'Cliente,Tipo,Descrição,Valor,Data,Detalhe';
    const rows = filtered.map(h =>
      [h.clienteNome, h.tipo, `"${h.descricao}"`, h.valor?.toFixed(2) ?? '', h.data, `"${h.detalhe ?? ''}"`].join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `historico-clientes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered]);
  /* ── Config de ícone e badge por tipo ───────────────────── */

  const tipoConfig: Record<TipoEvento, {
    label: string;
    badgeClass: string;
    icon: React.ReactNode;
    iconBg: string;
  }> = {
    pagamento: {
      label: 'Pagamento',
      badgeClass: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      icon: <DollarSign className="w-4 h-4 text-green-600 dark:text-green-400" />,
      iconBg: 'bg-green-100 dark:bg-green-900/40',
    },
    emprestimo: {
      label: 'Empréstimo',
      badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      icon: <CreditCard className="w-4 h-4 text-blue-600 dark:text-blue-400" />,
      iconBg: 'bg-blue-100 dark:bg-blue-900/40',
    },
    analise: {
      label: 'Análise',
      badgeClass: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
      icon: <ClipboardCheck className="w-4 h-4 text-purple-600 dark:text-purple-400" />,
      iconBg: 'bg-purple-100 dark:bg-purple-900/40',
    },
    vencimento: {
      label: 'Vencida',
      badgeClass: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      icon: <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />,
      iconBg: 'bg-red-100 dark:bg-red-900/40',
    },
  };

  /* ── Loading ────────────────────────────────────────────── */

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-6 space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-8 w-16" />
            </CardContent></Card>
          ))}
        </div>
        <Card><CardContent className="pt-6 space-y-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-4">
              <Skeleton className="h-10 w-10 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
          ))}
        </CardContent></Card>
      </div>
    );
  }

  /* ── Render ─────────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Histórico de Clientes</h1>
          <p className="text-muted-foreground mt-1">Timeline unificada de pagamentos, empréstimos e análises</p>
        </div>
        <Button variant="outline" onClick={handleExportar}><Download className="w-4 h-4 mr-2" />Exportar</Button>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Activity className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Eventos</p>
                <p className="text-xl font-bold">{metricas.totalEventos}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                <DollarSign className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pagamentos</p>
                <p className="text-xl font-bold">{metricas.pagamentos}</p>
                <p className="text-xs text-muted-foreground">{formatCurrency(metricas.valorPagamentos)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Vencidas</p>
                <p className="text-xl font-bold">{metricas.vencidas}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <CreditCard className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Empréstimos</p>
                <p className="text-xl font-bold">{metricas.emprestimos}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <Select value={filtroTipo} onValueChange={setFiltroTipo}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os tipos</SelectItem>
                <SelectItem value="pagamento">Pagamentos</SelectItem>
                <SelectItem value="emprestimo">Empréstimos</SelectItem>
                <SelectItem value="analise">Análises de Crédito</SelectItem>
                <SelectItem value="vencimento">Vencidas</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex-1 min-w-64 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar por cliente..." className="pl-10" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardContent className="pt-6">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Ban className="w-12 h-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium mb-1">Nenhum evento encontrado</h3>
              <p className="text-sm text-muted-foreground">
                {searchTerm || filtroTipo !== 'todos'
                  ? 'Tente ajustar os filtros de busca.'
                  : 'Ainda não há atividades registradas.'}
              </p>
            </div>
          ) : (
            <div className="space-y-0">
              {filtered.map((item, index) => {
                const cfg = tipoConfig[item.tipo];
                return (
                  <div key={item.id} className="flex gap-4 pb-6 relative">
                    {/* Linha de conexão */}
                    {index < filtered.length - 1 && (
                      <div className="absolute left-[19px] top-10 bottom-0 w-0.5 bg-border" />
                    )}

                    {/* Ícone colorido */}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 z-10 ${cfg.iconBg}`}>
                      {cfg.icon}
                    </div>

                    {/* Card do evento */}
                    <div className="flex-1 bg-muted/50 rounded-lg p-4 hover:bg-muted transition-colors">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{item.clienteNome}</span>
                          <Badge className={cfg.badgeClass}>{cfg.label}</Badge>
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(item.data).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{item.descricao}</p>
                      <div className="flex items-center justify-between mt-2">
                        {item.valor != null && (
                          <span className="text-sm font-semibold text-green-600 dark:text-green-400">
                            {formatCurrency(item.valor)}
                          </span>
                        )}
                        {item.detalhe && (
                          <span className="text-xs text-muted-foreground">{item.detalhe}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
