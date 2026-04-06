/**
 * @module RelatorioComissoesPage
 * @description Relatório mensal de comissões por agente (gerencia + admin).
 * Exibe comissões calculadas automaticamente pelo trigger de liquidação,
 * com filtros por período, funcionário, tipo e status + resumo por agente.
 * 
 * @route /relatorios/comissoes
 * @access Protegido — admin e gerencia
 */
import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  FileBarChart,
  Loader2,
  CheckCircle2,
  DollarSign,
  Users,
  Filter,
  Download,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useComissoesLiquidacoes,
  useAtualizarStatusComissao,
  useAprovarComissoesEmLote,
  useFuncionariosComissoes,
} from '../hooks/useComissoes';
import { useAuth } from '../contexts/AuthContext';
import type { ComissaoLiquidacaoView } from '../lib/view-types';

const tipoLabels: Record<string, string> = {
  venda: 'Venda',
  cobranca: 'Cobrança',
  gerencia: 'Gerência',
};

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  pendente: { label: 'Pendente', variant: 'secondary' },
  aprovado: { label: 'Aprovado', variant: 'outline' },
  pago: { label: 'Pago', variant: 'default' },
};

function getCurrentMonth() {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

export default function RelatorioComissoesPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  // Filtros
  const [mesInicio, setMesInicio] = useState(getCurrentMonth());
  const [mesFim, setMesFim] = useState(getCurrentMonth());
  const [agenteFilter, setAgenteFilter] = useState('todos');
  const [tipoFilter, setTipoFilter] = useState('todos');
  const [statusFilter, setStatusFilter] = useState('todos');

  // Formato YYYY-MM-01 para query
  const mesReferencia = mesInicio ? `${mesInicio}-01` : undefined;
  const mesReferenciaFim = mesFim ? `${mesFim}-01` : undefined;

  const { data: comissoes = [], isLoading } = useComissoesLiquidacoes({
    mesReferencia,
    mesReferenciaFim,
    agenteId: agenteFilter !== 'todos' ? agenteFilter : undefined,
    tipo: tipoFilter !== 'todos' ? (tipoFilter as any) : undefined,
    status: statusFilter !== 'todos' ? (statusFilter as any) : undefined,
  });

  const { data: funcionarios = [] } = useFuncionariosComissoes();

  const atualizarStatusMutation = useAtualizarStatusComissao();
  const aprovarLoteMutation = useAprovarComissoesEmLote();

  // Totais
  const totais = useMemo(() => {
    const total = comissoes.reduce((sum, c) => sum + c.valorComissao, 0);
    const pendente = comissoes.filter(c => c.status === 'pendente').reduce((sum, c) => sum + c.valorComissao, 0);
    const aprovado = comissoes.filter(c => c.status === 'aprovado').reduce((sum, c) => sum + c.valorComissao, 0);
    const pago = comissoes.filter(c => c.status === 'pago').reduce((sum, c) => sum + c.valorComissao, 0);
    return { total, pendente, aprovado, pago };
  }, [comissoes]);

  // Resumo agrupado por agente
  const resumoAgentes = useMemo(() => {
    const map = new Map<string, { nome: string; role: string; venda: number; cobranca: number; gerencia: number; total: number; count: number }>();
    comissoes.forEach((c) => {
      const key = c.agenteId;
      const current = map.get(key) || { nome: c.agenteNome || key.slice(0, 8), role: '', venda: 0, cobranca: 0, gerencia: 0, total: 0, count: 0 };
      if (c.agenteNome) current.nome = c.agenteNome;
      current[c.tipo] += c.valorComissao;
      current.total += c.valorComissao;
      current.count += 1;
      map.set(key, current);
    });
    return Array.from(map.entries()).sort((a, b) => b[1].total - a[1].total);
  }, [comissoes]);

  const pendentesCount = comissoes.filter(c => c.status === 'pendente').length;

  function handleExportCSV() {
    if (comissoes.length === 0) { toast.info('Nenhuma comissão para exportar'); return; }
    const header = 'Agente,Tipo,Valor Base,Percentual,Comissão,Status,Mês Ref.';
    const rows = comissoes.map((c) =>
      [c.agenteNome || c.agenteId, c.tipo, c.valorBase.toFixed(2), c.percentual.toFixed(2), c.valorComissao.toFixed(2), c.status, c.mesReferencia].join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comissoes_${mesInicio || 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exportado');
  }

  async function handleAprovarTodas() {
    if (!mesReferencia) return;
    if (!confirm(`Aprovar todas as ${pendentesCount} comissões pendentes deste mês?`)) return;
    try {
      const count = await aprovarLoteMutation.mutateAsync(mesReferencia);
      toast.success(`${count} comissões aprovadas`);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao aprovar');
    }
  }

  async function handleMarcarPago(id: string) {
    try {
      await atualizarStatusMutation.mutateAsync({ id, status: 'pago' });
      toast.success('Comissão marcada como paga');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar');
    }
  }

  const fmt = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileBarChart className="h-6 w-6" />
            Relatório de Comissões
          </h1>
          <p className="text-muted-foreground mt-1">
            Comissões calculadas automaticamente na liquidação de parcelas.
          </p>
        </div>
        {isAdmin && pendentesCount > 0 && (
          <Button onClick={handleAprovarTodas} disabled={aprovarLoteMutation.isPending}>
            {aprovarLoteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Aprovar Todas ({pendentesCount})
          </Button>
        )}
        <Button variant="outline" onClick={handleExportCSV} disabled={comissoes.length === 0}>
          <Download className="h-4 w-4 mr-2" />
          Exportar CSV
        </Button>
      </div>

      {/* Resumo Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <DollarSign className="h-4 w-4" />
              Total
            </div>
            <p className="text-2xl font-bold mt-1">{fmt(totais.total)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Pendente</div>
            <p className="text-2xl font-bold mt-1 text-yellow-600">{fmt(totais.pendente)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Aprovado</div>
            <p className="text-2xl font-bold mt-1 text-blue-600">{fmt(totais.aprovado)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Pago</div>
            <p className="text-2xl font-bold mt-1 text-green-600">{fmt(totais.pago)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Mês Início</Label>
              <Input
                type="month"
                value={mesInicio}
                onChange={(e) => setMesInicio(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Mês Fim</Label>
              <Input
                type="month"
                value={mesFim}
                onChange={(e) => setMesFim(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Funcionário</Label>
              <Select value={agenteFilter} onValueChange={setAgenteFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {funcionarios.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.name} ({f.role})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tipo</Label>
              <Select value={tipoFilter} onValueChange={setTipoFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="venda">Venda</SelectItem>
                  <SelectItem value="cobranca">Cobrança</SelectItem>
                  <SelectItem value="gerencia">Gerência</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="aprovado">Aprovado</SelectItem>
                  <SelectItem value="pago">Pago</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resumo por Agente */}
      {resumoAgentes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" />
              Resumo por Funcionário ({resumoAgentes.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Funcionário</TableHead>
                    <TableHead className="text-right">Venda</TableHead>
                    <TableHead className="text-right">Cobrança</TableHead>
                    <TableHead className="text-right">Gerência</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-center">Qtd.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resumoAgentes.map(([id, r]) => (
                    <TableRow key={id}>
                      <TableCell className="font-medium">{r.nome}</TableCell>
                      <TableCell className="text-right">{r.venda > 0 ? fmt(r.venda) : '—'}</TableCell>
                      <TableCell className="text-right">{r.cobranca > 0 ? fmt(r.cobranca) : '—'}</TableCell>
                      <TableCell className="text-right">{r.gerencia > 0 ? fmt(r.gerencia) : '—'}</TableCell>
                      <TableCell className="text-right font-bold">{fmt(r.total)}</TableCell>
                      <TableCell className="text-center">{r.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabela de Comissões */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Comissões ({comissoes.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : comissoes.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhuma comissão encontrada para os filtros selecionados.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agente</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Valor Base</TableHead>
                    <TableHead className="text-right">%</TableHead>
                    <TableHead className="text-right">Comissão</TableHead>
                    <TableHead>Status</TableHead>
                    {isAdmin && <TableHead className="text-right">Ação</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comissoes.map((c) => {
                    const sc = statusConfig[c.status] || statusConfig.pendente;
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">
                          {c.agenteNome || c.agenteId.slice(0, 8)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{tipoLabels[c.tipo] || c.tipo}</Badge>
                        </TableCell>
                        <TableCell className="text-right">{fmt(c.valorBase)}</TableCell>
                        <TableCell className="text-right font-mono">
                          {c.percentual.toFixed(2)}%
                        </TableCell>
                        <TableCell className="text-right font-bold">{fmt(c.valorComissao)}</TableCell>
                        <TableCell>
                          <Badge variant={sc.variant}>{sc.label}</Badge>
                        </TableCell>
                        {isAdmin && (
                          <TableCell className="text-right">
                            {c.status === 'aprovado' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleMarcarPago(c.id)}
                                disabled={atualizarStatusMutation.isPending}
                              >
                                Marcar Pago
                              </Button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
