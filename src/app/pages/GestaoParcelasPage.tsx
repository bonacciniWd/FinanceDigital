/**
 * @module GestaoParcelasPage
 * @description Gestão de parcelas agrupadas por cliente e empréstimo.
 *
 * Exibe acordeões por cliente, cada um com seus empréstimos
 * (ativos, quitados, vencidos) e respectivas parcelas.
 * Suporta operações em lote: quitar, editar e cancelar.
 *
 * @route /clientes/gestao-parcelas
 * @access Protegido — perfis admin, gerente, operador
 */
import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Checkbox } from '../components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Progress } from '../components/ui/progress';
import { Skeleton } from '../components/ui/skeleton';
import {
  Search, CheckCircle, Edit, Trash2, DollarSign, AlertTriangle, Clock, Ban, Receipt,
  ChevronDown, ChevronRight, User, CreditCard, QrCode, Upload, XCircle, Loader2, Image, Send, Copy,
} from 'lucide-react';
import { toast } from 'sonner';
import { useParcelas, useRegistrarPagamento, useUpdateParcela } from '../hooks/useParcelas';
import { useEmprestimos } from '../hooks/useEmprestimos';
import { useCriarCobvEfi } from '../hooks/useWoovi';
import { useInstancias, useEnviarWhatsapp } from '../hooks/useWhatsapp';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Parcela } from '../lib/view-types';
import type { ParcelaUpdate } from '../lib/database.types';
import { calcularJurosAtraso, diasDeAtraso } from '../lib/juros';

/* ── Types ───────────────────────────────────────────────── */

type EmprestimoGroup = {
  id: string;
  valor: number;
  parcelas: number;
  parcelasPagas: number;
  valorParcela: number;
  taxaJuros: number;
  tipoJuros: string;
  dataContrato: string;
  proximoVencimento: string;
  status: 'ativo' | 'quitado' | 'inadimplente';
  items: Parcela[];
};

type ClienteGroup = {
  clienteId: string;
  clienteNome: string;
  emprestimos: EmprestimoGroup[];
  totalPendente: number;
  totalVencida: number;
  totalPaga: number;
};

/* ── Helpers ─────────────────────────────────────────────── */

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const statusBadge = (s: string) => {
  const m: Record<string, { l: string; c: string }> = {
    pendente: { l: 'Pendente', c: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
    paga:     { l: 'Paga',     c: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
    vencida:  { l: 'Vencida',  c: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
    cancelada:{ l: 'Cancelada',c: 'bg-muted text-muted-foreground' },
  };
  const v = m[s] ?? m.pendente;
  return <Badge className={v.c}>{v.l}</Badge>;
};

const empStatusBadge = (s: string) => {
  const m: Record<string, { l: string; c: string }> = {
    ativo:        { l: 'Ativo',        c: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
    quitado:      { l: 'Quitado',      c: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
    inadimplente: { l: 'Inadimplente', c: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  };
  const v = m[s] ?? m.ativo;
  return <Badge className={v.c}>{v.l}</Badge>;
};

/* ── Component ───────────────────────────────────────────── */

export default function GestaoParcelasPage() {
  const { user } = useAuth();
  const { data: parcelas = [], isLoading: loadingP, isError: errorP } = useParcelas();
  const { data: emprestimos = [], isLoading: loadingE } = useEmprestimos();
  const registrarPagamento = useRegistrarPagamento();
  const updateParcela = useUpdateParcela();
  const criarCobvEfi = useCriarCobvEfi();
  const { data: instancias = [] } = useInstancias();
  const enviarWhatsapp = useEnviarWhatsapp();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [filtroEmpStatus, setFiltroEmpStatus] = useState('todos');
  const [expandedClientes, setExpandedClientes] = useState<Set<string>>(new Set());
  const [expandedEmps, setExpandedEmps] = useState<Set<string>>(new Set());

  // Modals
  const [modalQuitacao, setModalQuitacao] = useState(false);
  const [modalEdicao, setModalEdicao] = useState(false);
  const [modalExclusao, setModalExclusao] = useState(false);
  const [novoValor, setNovoValor] = useState('');
  const [novoDia, setNovoDia] = useState('');
  const [operacaoEmAndamento, setOperacaoEmAndamento] = useState(false);

  // Comprovante modal
  const [showComprovanteModal, setShowComprovanteModal] = useState(false);
  const [comprovanteParcela, setComprovanteParcela] = useState<Parcela | null>(null);
  const [comprovanteFile, setComprovanteFile] = useState<File | null>(null);
  const [comprovantePreview, setComprovantePreview] = useState<string | null>(null);
  const [comprovanteLoading, setComprovanteLoading] = useState(false);

  // Gerar PIX state
  const [gerandoPixId, setGerandoPixId] = useState<string | null>(null);
  const [pixResultDialog, setPixResultDialog] = useState<{ qrImage: string | null; brCode: string | null; parcelaNumero: number } | null>(null);

  // Modal ver comprovante
  const [viewComprovanteUrl, setViewComprovanteUrl] = useState<string | null>(null);

  const isLoading = loadingP || loadingE;

  /* ── Agrupar por cliente → empréstimo ────────────────────── */

  const empMap = useMemo(() => {
    const map = new Map<string, typeof emprestimos[0]>();
    for (const e of emprestimos) map.set(e.id, e);
    return map;
  }, [emprestimos]);

  const clienteGroups = useMemo(() => {
    // Filtrar parcelas
    const filtered = parcelas.filter(p => {
      const matchSearch = !searchTerm ||
        p.clienteNome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.emprestimoId.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = filtroStatus === 'todos' || p.status === filtroStatus;
      return matchSearch && matchStatus;
    });

    // Agrupar por cliente → empréstimo
    const byCliente = new Map<string, Map<string, Parcela[]>>();
    for (const p of filtered) {
      if (!byCliente.has(p.clienteId)) byCliente.set(p.clienteId, new Map());
      const cMap = byCliente.get(p.clienteId)!;
      if (!cMap.has(p.emprestimoId)) cMap.set(p.emprestimoId, []);
      cMap.get(p.emprestimoId)!.push(p);
    }

    // Montar grupos
    const groups: ClienteGroup[] = [];
    for (const [clienteId, empParcelasMap] of byCliente.entries()) {
      const empGroups: EmprestimoGroup[] = [];
      let totalPendente = 0;
      let totalVencida = 0;
      let totalPaga = 0;

      for (const [empId, items] of empParcelasMap.entries()) {
        const empData = empMap.get(empId);

        // Filtro por status do empréstimo
        if (filtroEmpStatus !== 'todos' && empData && empData.status !== filtroEmpStatus) continue;

        const sorted = items.sort((a, b) => a.numero - b.numero);
        totalPendente += sorted.filter(p => p.status === 'pendente').length;
        totalVencida += sorted.filter(p => p.status === 'vencida').length;
        totalPaga += sorted.filter(p => p.status === 'paga').length;

        empGroups.push({
          id: empId,
          valor: empData?.valor ?? 0,
          parcelas: empData?.parcelas ?? sorted.length,
          parcelasPagas: empData?.parcelasPagas ?? sorted.filter(p => p.status === 'paga').length,
          valorParcela: empData?.valorParcela ?? 0,
          taxaJuros: empData?.taxaJuros ?? 0,
          tipoJuros: empData?.tipoJuros ?? 'mensal',
          dataContrato: empData?.dataContrato ?? '',
          proximoVencimento: empData?.proximoVencimento ?? '',
          status: empData?.status ?? 'ativo',
          items: sorted,
        });
      }

      if (empGroups.length === 0) continue;

      // Ordenar empréstimos: inadimplente primeiro, depois ativo, depois quitado
      const order: Record<string, number> = { inadimplente: 0, ativo: 1, quitado: 2 };
      empGroups.sort((a, b) => (order[a.status] ?? 1) - (order[b.status] ?? 1));

      groups.push({
        clienteId,
        clienteNome: empGroups[0].items[0]?.clienteNome ?? 'Desconhecido',
        emprestimos: empGroups,
        totalPendente,
        totalVencida,
        totalPaga,
      });
    }

    // Ordenar clientes por quantidade de vencidas (mais urgentes primeiro)
    groups.sort((a, b) => b.totalVencida - a.totalVencida || a.clienteNome.localeCompare(b.clienteNome));
    return groups;
  }, [parcelas, empMap, searchTerm, filtroStatus, filtroEmpStatus]);

  /* ── Métricas globais ───────────────────────────────────── */

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
      clientes: new Set(parcelas.map(p => p.clienteId)).size,
    };
  }, [parcelas]);

  /* ── Seleção ────────────────────────────────────────────── */

  const toggleSelect = (id: string) =>
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const toggleEmprestimo = (items: Parcela[]) => {
    const ids = items.filter(p => p.status !== 'paga' && p.status !== 'cancelada').map(p => p.id);
    const allSelected = ids.every(id => selectedIds.includes(id));
    setSelectedIds(prev => allSelected ? prev.filter(id => !ids.includes(id)) : [...new Set([...prev, ...ids])]);
  };

  const selectedParcelas = useMemo(
    () => parcelas.filter(p => selectedIds.includes(p.id)),
    [parcelas, selectedIds],
  );

  const totalSelecionado = useMemo(
    () => selectedParcelas.reduce((a, p) => a + p.valor, 0),
    [selectedParcelas],
  );

  /* ── Expand/collapse ────────────────────────────────────── */

  const toggleCliente = (id: string) =>
    setExpandedClientes(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleEmp = (id: string) =>
    setExpandedEmps(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const expandAll = () => {
    setExpandedClientes(new Set(clienteGroups.map(g => g.clienteId)));
    setExpandedEmps(new Set(clienteGroups.flatMap(g => g.emprestimos.map(e => e.id))));
  };

  const collapseAll = () => {
    setExpandedClientes(new Set());
    setExpandedEmps(new Set());
  };

  /* ── Ações em lote ──────────────────────────────────────── */

  const handleQuitarLote = async () => {
    setOperacaoEmAndamento(true);
    const hoje = new Date().toISOString().split('T')[0];
    let sucesso = 0, falha = 0;
    for (const id of selectedIds) {
      try { await registrarPagamento.mutateAsync({ id, dataPagamento: hoje }); sucesso++; } catch { falha++; }
    }
    setOperacaoEmAndamento(false);
    setSelectedIds([]);
    setModalQuitacao(false);
    if (falha === 0) toast.success(`${sucesso} parcela(s) quitada(s) com sucesso!`);
    else toast.warning(`${sucesso} quitada(s), ${falha} com erro.`);
  };

  const handleEditarLote = async () => {
    if (!novoValor && !novoDia) { toast.error('Preencha pelo menos um campo.'); return; }
    setOperacaoEmAndamento(true);
    let sucesso = 0, falha = 0;
    for (const p of selectedParcelas) {
      const data: Record<string, unknown> = {};
      if (novoValor) data.valor = parseFloat(novoValor);
      if (novoDia) {
        const dt = new Date(p.dataVencimento);
        dt.setDate(parseInt(novoDia));
        data.data_vencimento = dt.toISOString().split('T')[0];
      }
      try { await updateParcela.mutateAsync({ id: p.id, data }); sucesso++; } catch { falha++; }
    }
    setOperacaoEmAndamento(false);
    setSelectedIds([]);
    setModalEdicao(false);
    setNovoValor('');
    setNovoDia('');
    if (falha === 0) toast.success(`${sucesso} parcela(s) atualizada(s)!`);
    else toast.warning(`${sucesso} atualizada(s), ${falha} com erro.`);
  };

  const handleExcluirLote = async () => {
    if (user?.role !== 'admin') {
      toast.error('Apenas administradores podem cancelar parcelas.');
      return;
    }
    setOperacaoEmAndamento(true);
    let sucesso = 0, falha = 0;
    for (const id of selectedIds) {
      try { await updateParcela.mutateAsync({ id, data: { status: 'cancelada' } }); sucesso++; } catch { falha++; }
    }
    setOperacaoEmAndamento(false);
    setSelectedIds([]);
    setModalExclusao(false);
    if (falha === 0) toast.success(`${sucesso} parcela(s) cancelada(s).`);
    else toast.warning(`${sucesso} cancelada(s), ${falha} com erro.`);
  };

  /* ── Loading / Error ────────────────────────────────────── */

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-56" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardHeader className="pb-2"><Skeleton className="h-4 w-20" /></CardHeader>
              <CardContent><Skeleton className="h-8 w-28" /></CardContent></Card>
          ))}
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}><CardContent className="pt-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
        ))}
      </div>
    );
  }

  if (errorP) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertTriangle className="w-12 h-12 text-destructive mb-4" />
        <h2 className="text-xl font-semibold mb-2">Erro ao carregar parcelas</h2>
        <p className="text-muted-foreground">Tente novamente mais tarde.</p>
      </div>
    );
  }

  /* ── Render ─────────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Gestão de Parcelas</h1>
          <p className="text-muted-foreground mt-1">
            {metricas.clientes} cliente(s) · {metricas.total} parcela(s)
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={expandAll}>Expandir tudo</Button>
          <Button variant="outline" size="sm" onClick={collapseAll}>Recolher tudo</Button>
        </div>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pendentes</CardTitle>
            <Clock className="w-4 h-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{metricas.totalPendentes}</div>
            <p className="text-xs text-muted-foreground mt-1">{formatCurrency(metricas.valorPendentes)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Vencidas</CardTitle>
            <AlertTriangle className="w-4 h-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{metricas.totalVencidas}</div>
            <p className="text-xs text-muted-foreground mt-1">{formatCurrency(metricas.valorVencidas)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pagas</CardTitle>
            <CheckCircle className="w-4 h-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{metricas.totalPagas}</div>
            <p className="text-xs text-muted-foreground mt-1">{formatCurrency(metricas.valorPagas)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
            <Receipt className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metricas.total}</div>
            <p className="text-xs text-muted-foreground mt-1">parcelas cadastradas</p>
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
                {user?.role === 'admin' && (
                  <Button variant="destructive" onClick={() => setModalExclusao(true)}>
                    <Trash2 className="w-4 h-4 mr-2" />Excluir em Lote
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <Select value={filtroEmpStatus} onValueChange={setFiltroEmpStatus}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Empréstimo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos empréstimos</SelectItem>
                <SelectItem value="ativo">Ativos</SelectItem>
                <SelectItem value="inadimplente">Inadimplentes</SelectItem>
                <SelectItem value="quitado">Quitados</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Parcela" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas parcelas</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="vencida">Vencida</SelectItem>
                <SelectItem value="paga">Paga</SelectItem>
                <SelectItem value="cancelada">Cancelada</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex-1 min-w-64 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar por cliente..." className="pl-10" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Agrupamento: Cliente → Empréstimo → Parcelas */}
      {clienteGroups.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Ban className="w-12 h-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium mb-1">Nenhuma parcela encontrada</h3>
              <p className="text-sm text-muted-foreground">
                {searchTerm || filtroStatus !== 'todos' || filtroEmpStatus !== 'todos'
                  ? 'Tente ajustar os filtros de busca.'
                  : 'Ainda não há parcelas cadastradas.'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {clienteGroups.map(grupo => {
            const clienteExpanded = expandedClientes.has(grupo.clienteId);
            return (
              <Card key={grupo.clienteId}>
                {/* Header do cliente */}
                <CardHeader
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => toggleCliente(grupo.clienteId)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {clienteExpanded
                        ? <ChevronDown className="w-5 h-5 text-muted-foreground" />
                        : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
                      <User className="w-5 h-5 text-primary" />
                      <div>
                        <CardTitle className="text-base">{grupo.clienteNome}</CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {grupo.emprestimos.length} empréstimo(s)
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {grupo.totalVencida > 0 && (
                        <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                          {grupo.totalVencida} vencida(s)
                        </Badge>
                      )}
                      {grupo.totalPendente > 0 && (
                        <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                          {grupo.totalPendente} pendente(s)
                        </Badge>
                      )}
                      {grupo.totalPaga > 0 && (
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                          {grupo.totalPaga} paga(s)
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>

                {/* Empréstimos do cliente */}
                {clienteExpanded && (
                  <CardContent className="pt-0 space-y-4">
                    {grupo.emprestimos.map(emp => {
                      const empExpanded = expandedEmps.has(emp.id);
                      const progresso = emp.parcelas > 0 ? (emp.parcelasPagas / emp.parcelas) * 100 : 0;
                      const pendentesEmp = emp.items.filter(p => p.status !== 'paga' && p.status !== 'cancelada');
                      const allPendentesSelected = pendentesEmp.length > 0 && pendentesEmp.every(p => selectedIds.includes(p.id));

                      return (
                        <div key={emp.id} className="border rounded-lg">
                          {/* Header do empréstimo */}
                          <div
                            className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                            onClick={() => toggleEmp(emp.id)}
                          >
                            <div className="flex items-center gap-3">
                              <Checkbox
                                checked={allPendentesSelected}
                                onCheckedChange={() => toggleEmprestimo(emp.items)}
                                onClick={(e) => e.stopPropagation()}
                              />
                              {empExpanded
                                ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                              <CreditCard className="w-4 h-4 text-muted-foreground" />
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm">{formatCurrency(emp.valor)}</span>
                                  {empStatusBadge(emp.status)}
                                  <span className="text-xs text-muted-foreground">
                                    {emp.taxaJuros}% {emp.tipoJuros === 'mensal' ? 'a.m.' : emp.tipoJuros === 'semanal' ? 'a.s.' : 'a.d.'}
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {emp.parcelasPagas}/{emp.parcelas} parcelas · {formatCurrency(emp.valorParcela)}/parcela
                                  {emp.dataContrato && ` · Contrato: ${new Date(emp.dataContrato).toLocaleDateString('pt-BR')}`}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 min-w-32">
                              <Progress value={progresso} className="h-2 flex-1" />
                              <span className="text-xs text-muted-foreground whitespace-nowrap">{Math.round(progresso)}%</span>
                            </div>
                          </div>

                          {/* Tabela de parcelas */}
                          {empExpanded && (
                            <div className="border-t overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b bg-muted/30">
                                    <th className="text-left py-2 px-4 w-10" />
                                    <th className="text-center py-2 px-2 font-medium text-muted-foreground text-xs">Nº</th>
                                    <th className="text-right py-2 px-2 font-medium text-muted-foreground text-xs">Valor</th>
                                    <th className="text-right py-2 px-2 font-medium text-muted-foreground text-xs">Juros/Multa</th>
                                    <th className="text-right py-2 px-2 font-medium text-muted-foreground text-xs">Total</th>
                                    <th className="text-center py-2 px-2 font-medium text-muted-foreground text-xs">Vencimento</th>
                                    <th className="text-center py-2 px-2 font-medium text-muted-foreground text-xs">Pagamento</th>
                                    <th className="text-center py-2 px-2 font-medium text-muted-foreground text-xs">Status</th>
                                    <th className="text-center py-2 px-2 font-medium text-muted-foreground text-xs">Ações</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {emp.items.map(p => (
                                    <tr
                                      key={p.id}
                                      className={`border-b transition-colors hover:bg-muted/50 ${
                                        selectedIds.includes(p.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                                      }`}
                                    >
                                      <td className="py-2 px-4">
                                        {p.status !== 'paga' && p.status !== 'cancelada' && (
                                          <Checkbox checked={selectedIds.includes(p.id)} onCheckedChange={() => toggleSelect(p.id)} />
                                        )}
                                      </td>
                                      <td className="py-2 px-2 text-center font-mono text-xs">{p.numero}</td>
                                      <td className="py-2 px-2 text-right">{formatCurrency(p.valorOriginal)}</td>
                                      <td className="py-2 px-2 text-right text-red-600 dark:text-red-400">
                                        {(() => {
                                          const jAuto = p.status !== 'paga' && p.status !== 'cancelada' && p.juros === 0
                                            ? calcularJurosAtraso(p.valorOriginal, diasDeAtraso(p.dataVencimento))
                                            : p.juros;
                                          const total = jAuto + p.multa;
                                          return total > 0 ? `+${formatCurrency(total)}` : '—';
                                        })()}
                                      </td>
                                      <td className="py-2 px-2 text-right font-semibold">
                                        {(() => {
                                          const jAuto = p.status !== 'paga' && p.status !== 'cancelada' && p.juros === 0
                                            ? calcularJurosAtraso(p.valorOriginal, diasDeAtraso(p.dataVencimento))
                                            : p.juros;
                                          return formatCurrency(p.valorOriginal + jAuto + p.multa - p.desconto);
                                        })()}
                                      </td>
                                      <td className="py-2 px-2 text-center text-xs">{new Date(p.dataVencimento).toLocaleDateString('pt-BR')}</td>
                                      <td className="py-2 px-2 text-center text-xs">
                                        {p.dataPagamento ? new Date(p.dataPagamento).toLocaleDateString('pt-BR') : '—'}
                                      </td>
                                      <td className="py-2 px-2 text-center">{statusBadge(p.status)}</td>
                                      <td className="py-2 px-2 text-center">
                                        <div className="flex items-center justify-center gap-1">
                                          {p.status !== 'paga' && p.status !== 'cancelada' && (
                                            <>
                                              <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-7 w-7 p-0 text-blue-600"
                                                title="Gerar cobrança PIX"
                                                disabled={gerandoPixId === p.id || criarCobvEfi.isPending}
                                                onClick={async () => {
                                                  setGerandoPixId(p.id);
                                                  try {
                                                    // Buscar CPF do cliente
                                                    const { data: cli } = await supabase.from('clientes').select('cpf, nome, telefone').eq('id', p.clienteId).single() as { data: { cpf: string | null; nome: string; telefone: string } | null };
                                                    const result = await criarCobvEfi.mutateAsync({
                                                      parcela_id: p.id,
                                                      emprestimo_id: p.emprestimoId,
                                                      cliente_id: p.clienteId,
                                                      valor: p.valor,
                                                      descricao: `Parcela ${p.numero} - ${p.clienteNome}`,
                                                      cliente_nome: p.clienteNome,
                                                      cliente_cpf: cli?.cpf || undefined,
                                                      data_vencimento: p.dataVencimento,
                                                    });
                                                    const charge = (result as any)?.charge;
                                                    const brCode = charge?.br_code || '';
                                                    const qrImage = charge?.qr_code_image || '';
                                                    // Mostrar dialog com QR e copia-e-cola
                                                    if (brCode || qrImage) {
                                                      setPixResultDialog({ qrImage, brCode, parcelaNumero: p.numero });
                                                    }
                                                    // Enviar via WhatsApp se possível
                                                    const instSistema = instancias.find(i => ['conectado', 'conectada', 'open', 'connected'].includes(i.status?.toLowerCase?.() || i.status));
                                                    if (instSistema && cli?.telefone && brCode) {
                                                      const phone = cli.telefone.replace(/\D/g, '').length <= 11 ? '55' + cli.telefone.replace(/\D/g, '') : cli.telefone.replace(/\D/g, '');
                                                      const msg = `💰 *Cobrança PIX - Parcela ${p.numero}*\n\nOlá ${p.clienteNome}!\n\nValor: *${formatCurrency(p.valor)}*\nVencimento: ${new Date(p.dataVencimento).toLocaleDateString('pt-BR')}\n\n📱 Copie o código PIX abaixo e cole no app do seu banco:\n\n${brCode}\n\n_FinanceDigital_`;
                                                      await enviarWhatsapp.mutateAsync({ instancia_id: instSistema.id, telefone: phone, conteudo: msg });
                                                      // Enviar QR como imagem
                                                      if (qrImage) {
                                                        const base64Data = qrImage.replace(/^data:image\/\w+;base64,/, '');
                                                        await enviarWhatsapp.mutateAsync({ instancia_id: instSistema.id, telefone: phone, conteudo: `QR Code - Parcela ${p.numero}`, tipo: 'image', media_base64: base64Data });
                                                      }
                                                      toast.success('Cobrança PIX gerada e enviada ao cliente!');
                                                    } else if (!instSistema || !cli?.telefone) {
                                                      toast.success('Cobrança PIX gerada! Sem WhatsApp conectado para envio automático.');
                                                    } else {
                                                      toast.success('Cobrança PIX gerada!');
                                                    }
                                                  } catch (err) {
                                                    toast.error(`Erro: ${err instanceof Error ? err.message : 'Falha ao gerar PIX'}`);
                                                  } finally {
                                                    setGerandoPixId(null);
                                                  }
                                                }}
                                              >
                                                {gerandoPixId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <QrCode className="w-3.5 h-3.5" />}
                                              </Button>
                                              <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-7 w-7 p-0 text-green-600"
                                                title="Confirmar pagamento manual"
                                                onClick={() => {
                                                  setComprovanteParcela(p);
                                                  setComprovanteFile(null);
                                                  setComprovantePreview(null);
                                                  setShowComprovanteModal(true);
                                                }}
                                              >
                                                <CheckCircle className="w-3.5 h-3.5" />
                                              </Button>
                                            </>
                                          )}
                                          {p.status === 'paga' && (p as any).comprovanteUrl && (
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              className="h-7 w-7 p-0 text-muted-foreground"
                                              title="Ver comprovante"
                                              onClick={() => setViewComprovanteUrl((p as any).comprovanteUrl)}
                                            >
                                              <Image className="w-3.5 h-3.5" />
                                            </Button>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Modal Quitação em Lote ─────────────────────────── */}
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
              <Button className="flex-1 bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600" onClick={handleQuitarLote} disabled={operacaoEmAndamento}>
                {operacaoEmAndamento ? 'Processando...' : 'Confirmar Quitação'}
              </Button>
              <Button className="flex-1" variant="outline" onClick={() => setModalQuitacao(false)} disabled={operacaoEmAndamento}>Cancelar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modal Edição em Lote ──────────────────────────── */}
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
              <Button className="flex-1 bg-primary hover:bg-primary/90" onClick={handleEditarLote} disabled={operacaoEmAndamento}>
                {operacaoEmAndamento ? 'Salvando...' : 'Aplicar Alterações'}
              </Button>
              <Button className="flex-1" variant="outline" onClick={() => setModalEdicao(false)} disabled={operacaoEmAndamento}>Cancelar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modal Exclusão em Lote ────────────────────────── */}
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
              <Button className="flex-1" variant="destructive" onClick={handleExcluirLote} disabled={operacaoEmAndamento}>
                {operacaoEmAndamento ? 'Cancelando...' : 'Confirmar Exclusão'}
              </Button>
              <Button className="flex-1" variant="outline" onClick={() => setModalExclusao(false)} disabled={operacaoEmAndamento}>Cancelar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modal Confirmar Pagamento com Comprovante ───── */}
      <Dialog open={showComprovanteModal} onOpenChange={(open) => { if (!open) { setShowComprovanteModal(false); setComprovanteParcela(null); setComprovanteFile(null); setComprovantePreview(null); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><CheckCircle className="w-5 h-5 text-green-600" />Confirmar Pagamento Manual</DialogTitle></DialogHeader>
          {comprovanteParcela && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Cliente:</span><span className="font-medium">{comprovanteParcela.clienteNome}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Parcela:</span><span className="font-medium">#{comprovanteParcela.numero} — {formatCurrency(comprovanteParcela.valor)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Vencimento:</span><span className="font-medium">{new Date(comprovanteParcela.dataVencimento).toLocaleDateString('pt-BR')}</span></div>
              </div>
              <p className="text-sm text-muted-foreground">Anexe o comprovante de pagamento (imagem) recebido do cliente.</p>
              {comprovantePreview ? (
                <div className="relative rounded-lg overflow-hidden border">
                  <img src={comprovantePreview} alt="Comprovante" className="w-full h-48 object-contain bg-muted" />
                  <button onClick={() => { setComprovanteFile(null); setComprovantePreview(null); }} className="absolute top-2 right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center">
                    <XCircle className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center gap-2 p-6 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Clique para anexar comprovante</span>
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) { setComprovanteFile(file); setComprovantePreview(URL.createObjectURL(file)); }
                  }} />
                </label>
              )}
              <div className="flex gap-3">
                <Button className="flex-1 bg-green-600 hover:bg-green-700 text-white" disabled={!comprovanteFile || comprovanteLoading} onClick={async () => {
                  if (!comprovanteParcela || !comprovanteFile) return;
                  setComprovanteLoading(true);
                  try {
                    const ext = comprovanteFile.name.split('.').pop() || 'jpg';
                    const path = `comprovantes/${comprovanteParcela.emprestimoId}/${Date.now()}.${ext}`;
                    const { error: upErr } = await supabase.storage.from('whatsapp-media').upload(path, comprovanteFile, { contentType: comprovanteFile.type });
                    if (upErr) throw new Error(`Upload falhou: ${upErr.message}`);
                    const { data: urlData } = supabase.storage.from('whatsapp-media').getPublicUrl(path);

                    const updateData: ParcelaUpdate = {
                      status: 'paga',
                      data_pagamento: new Date().toISOString().split('T')[0],
                      pagamento_tipo: 'manual',
                      comprovante_url: urlData.publicUrl,
                      confirmado_por: user?.id,
                      confirmado_em: new Date().toISOString(),
                    };
                    await (supabase.from('parcelas') as any).update(updateData).eq('id', comprovanteParcela.id);

                    toast.success('Pagamento confirmado com comprovante!');
                    setShowComprovanteModal(false);
                    setComprovanteParcela(null);
                    setComprovanteFile(null);
                    setComprovantePreview(null);
                  } catch (err) {
                    toast.error(`Erro: ${err instanceof Error ? err.message : 'Falha'}`);
                  } finally {
                    setComprovanteLoading(false);
                  }
                }}>
                  {comprovanteLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                  Confirmar Pagamento
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => setShowComprovanteModal(false)}>Cancelar</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Modal Ver Comprovante ────────────────────────── */}
      <Dialog open={!!viewComprovanteUrl} onOpenChange={() => setViewComprovanteUrl(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Image className="w-5 h-5" />Comprovante de Pagamento</DialogTitle></DialogHeader>
          {viewComprovanteUrl && (
            <div className="rounded-lg overflow-hidden border">
              <img src={viewComprovanteUrl} alt="Comprovante" className="w-full object-contain max-h-[70vh]" />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Modal: Resultado PIX (QR Code + Copia e Cola) ──── */}
      {pixResultDialog && (
        <Dialog open onOpenChange={() => setPixResultDialog(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <QrCode className="w-5 h-5 text-blue-600" />
                Cobrança PIX — Parcela {pixResultDialog.parcelaNumero}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {pixResultDialog.qrImage && (
                <div className="flex justify-center">
                  <img src={pixResultDialog.qrImage} alt="QR Code PIX" className="w-48 h-48 rounded-lg border" />
                </div>
              )}
              {pixResultDialog.brCode && (
                <div className="space-y-2">
                  <Label className="text-xs font-medium">PIX Copia e Cola</Label>
                  <div className="flex gap-2">
                    <Input
                      value={pixResultDialog.brCode}
                      readOnly
                      className="text-xs font-mono flex-1"
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      onClick={() => {
                        navigator.clipboard.writeText(pixResultDialog.brCode!);
                        toast.success('Código PIX copiado!');
                      }}
                    >
                      <Copy className="w-4 h-4 mr-1" />
                      Copiar
                    </Button>
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground text-center">
                O QR Code e o código foram enviados ao cliente via WhatsApp.
              </p>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
