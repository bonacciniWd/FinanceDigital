/**
 * @module GestaoParcelasPage
 * @description Gestão avançada de parcelas com operações em lote.
 *
 * Funcionalidades principais:
 * - **Quitar em lote**: selecionar múltiplas parcelas e liquidar
 * - **Editar série**: alterar datas de vencimento ou valores de
 *   várias parcelas simultaneamente
 * - **Excluir em lote**: cancelar parcelas selecionadas
 *
 * Tabela com seleção via checkbox, filtros por status (pendente,
 * paga, atrasada, cancelada) e busca por cliente/empréstimo.
 * Integrado via React Query — todas as mutações são persistidas.
 *
 * @route /clientes/gestao-parcelas
 * @access Protegido — perfis admin, gerente, operador
 */
import { useState, useMemo } from 'react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Checkbox } from '../components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Skeleton } from '../components/ui/skeleton';
import { Search, CheckCircle, Edit, Trash2, DollarSign, AlertTriangle, Clock, Ban, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { useParcelas, useRegistrarPagamento, useUpdateParcela } from '../hooks/useParcelas';

export default function GestaoParcelasPage() {
  const { data: parcelas = [], isLoading, isError } = useParcelas();
  const registrarPagamento = useRegistrarPagamento();
  const updateParcela = useUpdateParcela();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [modalQuitacao, setModalQuitacao] = useState(false);
  const [modalEdicao, setModalEdicao] = useState(false);
  const [modalExclusao, setModalExclusao] = useState(false);
  const [novoValor, setNovoValor] = useState('');
  const [novoDia, setNovoDia] = useState('');
  const [operacaoEmAndamento, setOperacaoEmAndamento] = useState(false);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { label: string; className: string }> = {
      pendente: { label: 'Pendente', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
      paga: { label: 'Paga', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
      vencida: { label: 'Vencida', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
      cancelada: { label: 'Cancelada', className: 'bg-muted text-muted-foreground' },
    };
    const c = configs[status] ?? configs.pendente;
    return <Badge className={c.className}>{c.label}</Badge>;
  };

  /* ── Filtro e métricas ─────────────────────────────────────── */

  const filtered = useMemo(() =>
    parcelas.filter(p => {
      const matchSearch = !searchTerm ||
        p.clienteNome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.emprestimoId.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = filtroStatus === 'todos' || p.status === filtroStatus;
      return matchSearch && matchStatus;
    }),
    [parcelas, searchTerm, filtroStatus],
  );

  const metricas = useMemo(() => {
    const pendentes = parcelas.filter(p => p.status === 'pendente');
    const vencidas = parcelas.filter(p => p.status === 'vencida');
    const pagas = parcelas.filter(p => p.status === 'paga');
    return {
      totalPendentes: pendentes.length,
      valorPendentes: pendentes.reduce((a, p) => a + p.valor, 0),
      totalVencidas: vencidas.length,
      valorVencidas: vencidas.reduce((a, p) => a + p.valor, 0),
      totalPagas: pagas.length,
      valorPagas: pagas.reduce((a, p) => a + p.valor, 0),
      total: parcelas.length,
    };
  }, [parcelas]);

  /* ── Seleção ────────────────────────────────────────────────── */

  const toggleSelect = (id: string) =>
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const toggleAll = () =>
    setSelectedIds(prev => prev.length === filtered.length ? [] : filtered.map(p => p.id));

  const selectedParcelas = useMemo(
    () => parcelas.filter(p => selectedIds.includes(p.id)),
    [parcelas, selectedIds],
  );

  const totalSelecionado = useMemo(
    () => selectedParcelas.reduce((a, p) => a + p.valor, 0),
    [selectedParcelas],
  );

  /* ── Ações em lote ──────────────────────────────────────────── */

  const handleQuitarLote = async () => {
    setOperacaoEmAndamento(true);
    const hoje = new Date().toISOString().split('T')[0];
    let sucesso = 0;
    let falha = 0;

    for (const id of selectedIds) {
      try {
        await registrarPagamento.mutateAsync({ id, dataPagamento: hoje });
        sucesso++;
      } catch {
        falha++;
      }
    }

    setOperacaoEmAndamento(false);
    setSelectedIds([]);
    setModalQuitacao(false);

    if (falha === 0) {
      toast.success(`${sucesso} parcela(s) quitada(s) com sucesso!`);
    } else {
      toast.warning(`${sucesso} quitada(s), ${falha} com erro.`);
    }
  };

  const handleEditarLote = async () => {
    if (!novoValor && !novoDia) {
      toast.error('Preencha pelo menos um campo para editar.');
      return;
    }

    setOperacaoEmAndamento(true);
    let sucesso = 0;
    let falha = 0;

    for (const p of selectedParcelas) {
      const data: Record<string, unknown> = {};
      if (novoValor) data.valor = parseFloat(novoValor);
      if (novoDia) {
        const dt = new Date(p.dataVencimento);
        dt.setDate(parseInt(novoDia));
        data.data_vencimento = dt.toISOString().split('T')[0];
      }
      try {
        await updateParcela.mutateAsync({ id: p.id, data });
        sucesso++;
      } catch {
        falha++;
      }
    }

    setOperacaoEmAndamento(false);
    setSelectedIds([]);
    setModalEdicao(false);
    setNovoValor('');
    setNovoDia('');

    if (falha === 0) {
      toast.success(`${sucesso} parcela(s) atualizada(s)!`);
    } else {
      toast.warning(`${sucesso} atualizada(s), ${falha} com erro.`);
    }
  };

  const handleExcluirLote = async () => {
    setOperacaoEmAndamento(true);
    let sucesso = 0;
    let falha = 0;

    for (const id of selectedIds) {
      try {
        await updateParcela.mutateAsync({ id, data: { status: 'cancelada' } });
        sucesso++;
      } catch {
        falha++;
      }
    }

    setOperacaoEmAndamento(false);
    setSelectedIds([]);
    setModalExclusao(false);

    if (falha === 0) {
      toast.success(`${sucesso} parcela(s) cancelada(s).`);
    } else {
      toast.warning(`${sucesso} cancelada(s), ${falha} com erro.`);
    }
  };

  /* ── Loading skeleton ───────────────────────────────────────── */

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-56 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-6 space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-8 w-28" />
              <Skeleton className="h-3 w-24" />
            </CardContent></Card>
          ))}
        </div>
        <Card><CardContent className="pt-6 space-y-4">
          <Skeleton className="h-10 w-full" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent></Card>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertTriangle className="w-12 h-12 text-destructive mb-4" />
        <h2 className="text-xl font-semibold mb-2">Erro ao carregar parcelas</h2>
        <p className="text-muted-foreground">Tente novamente mais tarde.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Gestão de Parcelas</h1>
          <p className="text-muted-foreground mt-1">Quitação, edição e exclusão em lote</p>
        </div>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-100 dark:bg-yellow-900/30">
                <Clock className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pendentes</p>
                <p className="text-xl font-bold">{metricas.totalPendentes}</p>
                <p className="text-xs text-muted-foreground">{formatCurrency(metricas.valorPendentes)}</p>
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
                <p className="text-xl font-bold">{metricas.totalVencidas}</p>
                <p className="text-xs text-muted-foreground">{formatCurrency(metricas.valorVencidas)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pagas</p>
                <p className="text-xl font-bold">{metricas.totalPagas}</p>
                <p className="text-xs text-muted-foreground">{formatCurrency(metricas.valorPagas)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Receipt className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Geral</p>
                <p className="text-xl font-bold">{metricas.total}</p>
                <p className="text-xs text-muted-foreground">parcelas cadastradas</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ações em Lote */}
      {selectedIds.length > 0 && (
        <Card className="border-primary bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="font-semibold text-primary">{selectedIds.length} parcela(s) selecionada(s)</span>
                <span className="ml-4 text-sm text-muted-foreground">Total: {formatCurrency(totalSelecionado)}</span>
              </div>
              <div className="flex gap-3">
                <Button className="bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600" onClick={() => setModalQuitacao(true)}>
                  <CheckCircle className="w-4 h-4 mr-2" />Quitar em Lote
                </Button>
                <Button variant="outline" onClick={() => setModalEdicao(true)}>
                  <Edit className="w-4 h-4 mr-2" />Editar Série
                </Button>
                <Button variant="destructive" onClick={() => setModalExclusao(true)}>
                  <Trash2 className="w-4 h-4 mr-2" />Excluir em Lote
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="vencida">Vencida</SelectItem>
                <SelectItem value="paga">Paga</SelectItem>
                <SelectItem value="cancelada">Cancelada</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex-1 min-w-64 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar por cliente ou ID do empréstimo..." className="pl-10" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardContent className="pt-6">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Ban className="w-12 h-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium mb-1">Nenhuma parcela encontrada</h3>
              <p className="text-sm text-muted-foreground">
                {searchTerm || filtroStatus !== 'todos'
                  ? 'Tente ajustar os filtros de busca.'
                  : 'Ainda não há parcelas cadastradas.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 w-10">
                      <Checkbox
                        checked={selectedIds.length === filtered.length && filtered.length > 0}
                        onCheckedChange={toggleAll}
                      />
                    </th>
                    <th className="text-left py-3 font-medium text-muted-foreground">Cliente</th>
                    <th className="text-center py-3 font-medium text-muted-foreground">Nº</th>
                    <th className="text-right py-3 font-medium text-muted-foreground">Valor Original</th>
                    <th className="text-right py-3 font-medium text-muted-foreground">Juros/Multa</th>
                    <th className="text-right py-3 font-medium text-muted-foreground">Valor Total</th>
                    <th className="text-center py-3 font-medium text-muted-foreground">Vencimento</th>
                    <th className="text-center py-3 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr
                      key={p.id}
                      className={`border-b transition-colors hover:bg-muted/50 ${
                        selectedIds.includes(p.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                      }`}
                    >
                      <td className="py-3">
                        <Checkbox checked={selectedIds.includes(p.id)} onCheckedChange={() => toggleSelect(p.id)} />
                      </td>
                      <td className="py-3 font-medium">{p.clienteNome}</td>
                      <td className="py-3 text-center">{p.numero}</td>
                      <td className="py-3 text-right">{formatCurrency(p.valorOriginal)}</td>
                      <td className="py-3 text-right text-red-600 dark:text-red-400">
                        {p.juros + p.multa > 0 ? `+${formatCurrency(p.juros + p.multa)}` : '-'}
                      </td>
                      <td className="py-3 text-right font-bold">{formatCurrency(p.valor)}</td>
                      <td className="py-3 text-center">{new Date(p.dataVencimento).toLocaleDateString('pt-BR')}</td>
                      <td className="py-3 text-center">{getStatusBadge(p.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Modal Quitação em Lote ─────────────────────────────── */}
      <Dialog open={modalQuitacao} onOpenChange={setModalQuitacao}>
        <DialogContent>
          <DialogHeader><DialogTitle>Quitar Parcelas em Lote</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-5 h-5 text-green-600 dark:text-green-400" />
                <span className="font-semibold text-green-800 dark:text-green-300">Resumo da Quitação</span>
              </div>
              <p className="text-sm text-green-700 dark:text-green-400">{selectedIds.length} parcela(s) selecionada(s)</p>
              <p className="text-2xl font-bold text-green-800 dark:text-green-300 mt-2">{formatCurrency(totalSelecionado)}</p>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {selectedParcelas.map(p => (
                <div key={p.id} className="flex justify-between text-sm py-2 border-b">
                  <span>{p.clienteNome} — Parcela {p.numero}</span>
                  <span className="font-medium">{formatCurrency(p.valor)}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600"
                onClick={handleQuitarLote}
                disabled={operacaoEmAndamento}
              >
                {operacaoEmAndamento ? 'Processando...' : 'Confirmar Quitação'}
              </Button>
              <Button className="flex-1" variant="outline" onClick={() => setModalQuitacao(false)} disabled={operacaoEmAndamento}>
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modal Edição em Lote ──────────────────────────────── */}
      <Dialog open={modalEdicao} onOpenChange={setModalEdicao}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Série de Parcelas</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-700 dark:text-blue-400">Editando {selectedIds.length} parcela(s)</p>
              <p className="text-xs text-blue-600 dark:text-blue-500 mt-1">Deixe em branco os campos que não deseja alterar</p>
            </div>
            <div className="space-y-3">
              <div>
                <Label>Novo valor da parcela (R$)</Label>
                <Input type="number" step="0.01" placeholder="Ex: 500.00" value={novoValor} onChange={e => setNovoValor(e.target.value)} />
              </div>
              <div>
                <Label>Novo dia do mês para vencimento</Label>
                <Select value={novoDia} onValueChange={setNovoDia}>
                  <SelectTrigger><SelectValue placeholder="Selecione o dia" /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                      <SelectItem key={d} value={String(d)}>Dia {d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-3">
              <Button
                className="flex-1 bg-primary hover:bg-primary/90"
                onClick={handleEditarLote}
                disabled={operacaoEmAndamento}
              >
                {operacaoEmAndamento ? 'Salvando...' : 'Aplicar Alterações'}
              </Button>
              <Button className="flex-1" variant="outline" onClick={() => setModalEdicao(false)} disabled={operacaoEmAndamento}>
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modal Exclusão em Lote ────────────────────────────── */}
      <Dialog open={modalExclusao} onOpenChange={setModalExclusao}>
        <DialogContent>
          <DialogHeader><DialogTitle>Excluir Parcelas em Lote</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                <span className="font-semibold text-red-800 dark:text-red-300">Atenção!</span>
              </div>
              <p className="text-sm text-red-700 dark:text-red-400">Você está prestes a cancelar {selectedIds.length} parcela(s).</p>
              <p className="text-sm text-red-700 dark:text-red-400 mt-1">Valor total: {formatCurrency(totalSelecionado)}</p>
              <p className="text-sm text-red-600 dark:text-red-300 font-medium mt-2">Esta ação não pode ser desfeita.</p>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {selectedParcelas.map(p => (
                <div key={p.id} className="flex justify-between text-sm py-2 border-b">
                  <span>{p.clienteNome} — Parcela {p.numero}</span>
                  <span className="font-medium">{formatCurrency(p.valor)}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <Button
                className="flex-1"
                variant="destructive"
                onClick={handleExcluirLote}
                disabled={operacaoEmAndamento}
              >
                {operacaoEmAndamento ? 'Cancelando...' : 'Confirmar Exclusão'}
              </Button>
              <Button className="flex-1" variant="outline" onClick={() => setModalExclusao(false)} disabled={operacaoEmAndamento}>
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
