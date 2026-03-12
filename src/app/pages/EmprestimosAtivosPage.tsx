/**
 * @module EmprestimosAtivosPage
 * @description Listagem de empréstimos ativos com detalhamento.
 *
 * Tabela com todos os empréstimos em andamento: valor, parcelas
 * pagas/totais, taxa de juros, status e próximo vencimento.
 * Filtros por status (em dia, atrasado) e busca por cliente.
 *
 * Integrado com Supabase via React Query (dual-mode).
 *
 * @route /clientes/emprestimos-ativos
 * @access Protegido — todos os perfis autenticados
 */
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Progress } from '../components/ui/progress';
import { Skeleton } from '../components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Search, Eye, DollarSign, TrendingUp, AlertTriangle, CheckCircle, Plus, X,
  MessageSquare, Phone, User, CreditCard, Percent, Loader2, Share2,
} from 'lucide-react';
import { toast } from 'sonner';

import { useEmprestimos, useCreateEmprestimo, useUpdateEmprestimo } from '../hooks/useEmprestimos';
import { useClientes, useIndicados, useUpdateCliente } from '../hooks/useClientes';
import { useParcelasByEmprestimo, useUpdateParcela, useRegistrarPagamento } from '../hooks/useParcelas';
import type { Emprestimo, Parcela } from '../lib/view-types';

export default function EmprestimosAtivosPage() {
  const navigate = useNavigate();
  const [selectedEmprestimo, setSelectedEmprestimo] = useState<Emprestimo | null>(null);
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [showNovoEmprestimo, setShowNovoEmprestimo] = useState(false);
  const [clienteSearch, setClienteSearch] = useState('');
  const [clienteDropdownOpen, setClienteDropdownOpen] = useState(false);

  // ── Form novo empréstimo ─────────────────────────────────
  const [formNovo, setFormNovo] = useState({
    clienteId: '',
    valor: '',
    parcelas: '',
    taxaJuros: '',
    tipoJuros: 'mensal' as 'mensal' | 'semanal' | 'diario',
    dataContrato: new Date().toISOString().slice(0, 10),
  });

  /** Converte a taxa informada para mensal equivalente */
  const taxaMensalEquivalente = useMemo(() => {
    const t = parseFloat(formNovo.taxaJuros);
    if (!t || t <= 0) return 0;
    const decimal = t / 100;
    switch (formNovo.tipoJuros) {
      case 'diario':  return (Math.pow(1 + decimal, 30) - 1);    // 30 dias
      case 'semanal': return (Math.pow(1 + decimal, 4.2857) - 1); // ~4.29 semanas/mês
      case 'mensal':
      default:        return decimal;
    }
  }, [formNovo.taxaJuros, formNovo.tipoJuros]);

  /** Label do tipo de juros para exibição */
  const tipoJurosLabel: Record<string, string> = {
    mensal: '% a.m.',
    semanal: '% a.s.',
    diario: '% a.d.',
  };

  // ── React Query ──────────────────────────────────────────
  const { data: emprestimos = [], isLoading, isError } = useEmprestimos();
  const { data: clientes = [] } = useClientes();
  const createMutation = useCreateEmprestimo();
  const updateMutation = useUpdateEmprestimo();
  const updateClienteMutation = useUpdateCliente();

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  // ── Reconciliação automática de status dos clientes ──────
  // Corrige clientes cujo status está inconsistente com seus empréstimos
  const reconciledRef = useRef(false);
  useEffect(() => {
    if (reconciledRef.current || isLoading || emprestimos.length === 0 || clientes.length === 0) return;
    reconciledRef.current = true;

    // Agrupar empréstimos por cliente
    const clienteEmps = new Map<string, string[]>();
    for (const emp of emprestimos) {
      const list = clienteEmps.get(emp.clienteId) || [];
      list.push(emp.status);
      clienteEmps.set(emp.clienteId, list);
    }

    for (const [clienteId, statuses] of clienteEmps) {
      const cliente = clientes.find(c => c.id === clienteId);
      if (!cliente) continue;

      const hasInadimplente = statuses.includes('inadimplente');
      const allQuitados = statuses.every(s => s === 'quitado');

      let expectedStatus: 'em_dia' | 'vencido' | 'a_vencer' | null = null;
      if (hasInadimplente && cliente.status !== 'vencido') {
        expectedStatus = 'vencido';
      } else if (allQuitados && cliente.status === 'vencido') {
        expectedStatus = 'em_dia';
      }

      if (expectedStatus) {
        updateClienteMutation.mutate({ id: clienteId, data: { status: expectedStatus } });
      }
    }
  }, [emprestimos, clientes, isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Clientes filtrados para o combobox ───────────────────
  const clientesFiltrados = useMemo(() => {
    if (!clienteSearch.trim()) return clientes;
    const q = clienteSearch.toLowerCase();
    return clientes.filter(
      (c) => c.nome.toLowerCase().includes(q) || (c.cpf && c.cpf.includes(q))
    );
  }, [clientes, clienteSearch]);

  const clienteSelecionado = useMemo(
    () => clientes.find((c) => c.id === formNovo.clienteId),
    [clientes, formNovo.clienteId]
  );

  // ── Filtros ──────────────────────────────────────────────
  const filtered = useMemo(() => {
    return emprestimos.filter((e) => {
      const matchStatus = filtroStatus === 'todos' || e.status === filtroStatus;
      const matchSearch =
        !searchTerm || e.clienteNome?.toLowerCase().includes(searchTerm.toLowerCase());
      return matchStatus && matchSearch;
    });
  }, [emprestimos, filtroStatus, searchTerm]);

  // ── Métricas dinâmicas ───────────────────────────────────
  const metricas = useMemo(() => {
    const totalCarteira = emprestimos.reduce((acc, e) => acc + e.valor, 0);
    const totalAtivos = emprestimos.filter((e) => e.status === 'ativo').length;
    const totalInadimplentes = emprestimos.filter((e) => e.status === 'inadimplente').length;
    const taxaMedia =
      emprestimos.length > 0
        ? emprestimos.reduce((acc, e) => acc + e.taxaJuros, 0) / emprestimos.length
        : 0;
    return { totalCarteira, totalAtivos, totalInadimplentes, taxaMedia };
  }, [emprestimos]);

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { label: string; className: string }> = {
      ativo: { label: 'Ativo', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
      quitado: { label: 'Quitado', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
      inadimplente: { label: 'Inadimplente', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
    };
    const c = configs[status] || { label: status, className: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400' };
    return <Badge className={c.className}>{c.label}</Badge>;
  };

  // ── Ações ────────────────────────────────────────────────
  const handleNovoEmprestimo = () => {
    if (!formNovo.clienteId || !formNovo.valor || !formNovo.parcelas || !formNovo.taxaJuros) {
      toast.error('Preencha todos os campos obrigatórios.');
      return;
    }

    const valor = parseFloat(formNovo.valor.replace(/\./g, '').replace(',', '.'));
    const parcelas = parseInt(formNovo.parcelas);

    // Usa taxa mensal equivalente para o cálculo Price
    const tm = taxaMensalEquivalente;
    const valorParcela =
      tm > 0
        ? (valor * tm * Math.pow(1 + tm, parcelas)) /
          (Math.pow(1 + tm, parcelas) - 1)
        : valor / parcelas;

    // Armazena taxa original + tipo (sem conversão)
    const taxaOriginal = parseFloat(formNovo.taxaJuros);

    // Primeiro vencimento: 30 dias após contrato
    const dataContrato = new Date(formNovo.dataContrato);
    const proxVenc = new Date(dataContrato);
    proxVenc.setDate(proxVenc.getDate() + 30);

    createMutation.mutate(
      {
        cliente_id: formNovo.clienteId,
        valor,
        parcelas,
        valor_parcela: Math.round(valorParcela * 100) / 100,
        taxa_juros: taxaOriginal,
        tipo_juros: formNovo.tipoJuros,
        data_contrato: formNovo.dataContrato,
        proximo_vencimento: proxVenc.toISOString().slice(0, 10),
      },
      {
        onSuccess: () => {
          toast.success('Empréstimo criado com sucesso!');
          setShowNovoEmprestimo(false);
          setFormNovo({ clienteId: '', valor: '', parcelas: '', taxaJuros: '', tipoJuros: 'mensal', dataContrato: new Date().toISOString().slice(0, 10) });
          setClienteSearch('');
          setClienteDropdownOpen(false);
        },
        onError: (err) => toast.error(`Erro ao criar empréstimo: ${err.message}`),
      }
    );
  };

  const handleMarcarInadimplente = (emp: Emprestimo) => {
    updateMutation.mutate(
      { id: emp.id, data: { status: 'inadimplente' } },
      {
        onSuccess: () => {
          toast.success(`Empréstimo de ${emp.clienteNome} marcado como inadimplente.`);
          setSelectedEmprestimo(null);
          // Sync: marcar cliente como vencido
          updateClienteMutation.mutate({ id: emp.clienteId, data: { status: 'vencido' } });
        },
        onError: (err) => toast.error(`Erro: ${err.message}`),
      }
    );
  };

  const handleMarcarQuitado = (emp: Emprestimo) => {
    updateMutation.mutate(
      { id: emp.id, data: { status: 'quitado', parcelas_pagas: emp.parcelas } },
      {
        onSuccess: () => {
          toast.success(`Empréstimo de ${emp.clienteNome} quitado com sucesso!`);
          setSelectedEmprestimo(null);
          // Sync: se não houver outros empréstimos ativos/inadimplentes, reativar cliente
          const outrosAtivos = emprestimos.filter(
            e => e.clienteId === emp.clienteId && e.id !== emp.id && e.status !== 'quitado'
          );
          if (outrosAtivos.length === 0) {
            updateClienteMutation.mutate({ id: emp.clienteId, data: { status: 'em_dia' } });
          }
        },
        onError: (err) => toast.error(`Erro: ${err.message}`),
      }
    );
  };

  // ── Loading / Error ──────────────────────────────────────
  if (isError) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-destructive">Erro ao carregar empréstimos.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Empréstimos Ativos</h1>
          <p className="text-muted-foreground mt-1">
            {isLoading ? '...' : `${filtered.length} empréstimo(s) encontrado(s)`}
          </p>
        </div>
        <Button className="bg-primary hover:bg-primary/90" onClick={() => setShowNovoEmprestimo(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Novo Empréstimo
        </Button>
      </div>

      {/* Cards Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4 rounded-full" />
              </CardHeader>
              <CardContent><Skeleton className="h-8 w-28" /></CardContent>
            </Card>
          ))
        ) : (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Carteira Total</CardTitle>
                <DollarSign className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{formatCurrency(metricas.totalCarteira)}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Ativos</CardTitle>
                <CheckCircle className="w-4 h-4 text-green-500" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold text-green-600">{metricas.totalAtivos}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Inadimplentes</CardTitle>
                <AlertTriangle className="w-4 h-4 text-red-500" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold text-red-600">{metricas.totalInadimplentes}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Taxa Média</CardTitle>
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{metricas.taxaMedia.toFixed(1)}% a.m.</div></CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="inadimplente">Inadimplente</SelectItem>
                <SelectItem value="quitado">Quitado</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex-1 min-w-64 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar cliente..."
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 font-medium text-muted-foreground">Cliente</th>
                  <th className="text-right py-3 font-medium text-muted-foreground">Valor</th>
                  <th className="text-center py-3 font-medium text-muted-foreground">Parcelas</th>
                  <th className="text-center py-3 font-medium text-muted-foreground">Progresso</th>
                  <th className="text-right py-3 font-medium text-muted-foreground">Valor Parcela</th>
                  <th className="text-center py-3 font-medium text-muted-foreground">Taxa</th>
                  <th className="text-center py-3 font-medium text-muted-foreground">Próx. Venc.</th>
                  <th className="text-center py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-center py-3 font-medium text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {Array.from({ length: 9 }).map((_, j) => (
                        <td key={j} className="py-3"><Skeleton className="h-5 w-full" /></td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-muted-foreground">
                      Nenhum empréstimo encontrado.
                    </td>
                  </tr>
                ) : (
                  filtered.map((e) => (
                    <tr key={e.id} className="border-b hover:bg-muted/50">
                      <td className="py-3 font-medium">{e.clienteNome}</td>
                      <td className="py-3 text-right">{formatCurrency(e.valor)}</td>
                      <td className="py-3 text-center">{e.parcelasPagas}/{e.parcelas}</td>
                      <td className="py-3 w-32">
                        <Progress value={(e.parcelasPagas / e.parcelas) * 100} className="h-2" />
                      </td>
                      <td className="py-3 text-right">{formatCurrency(e.valorParcela)}</td>
                      <td className="py-3 text-center">{e.taxaJuros}% {tipoJurosLabel[e.tipoJuros] || 'a.m.'}</td>
                      <td className="py-3 text-center text-muted-foreground">
                        {new Date(e.proximoVencimento).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="py-3 text-center">{getStatusBadge(e.status)}</td>
                      <td className="py-3 text-center">
                        <Button size="sm" variant="outline" onClick={() => setSelectedEmprestimo(e)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Modal Detalhes — Painel completo do empréstimo */}
      {selectedEmprestimo && (
        <EmprestimoDetailModal
          emprestimo={selectedEmprestimo}
          clientes={clientes}
          onClose={() => setSelectedEmprestimo(null)}
          navigate={navigate}
          updateEmprestimo={updateMutation}
          tipoJurosLabel={tipoJurosLabel}
          formatCurrency={formatCurrency}
          getStatusBadge={getStatusBadge}
          handleMarcarQuitado={handleMarcarQuitado}
          handleMarcarInadimplente={handleMarcarInadimplente}
        />
      )}

      {/* Modal Novo Empréstimo */}
      <Dialog open={showNovoEmprestimo} onOpenChange={setShowNovoEmprestimo}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo Empréstimo</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            {/* Seleção de Cliente com busca inline */}
            <div className="space-y-1.5">
              <Label>Cliente *</Label>
              {clienteSelecionado ? (
                <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
                    {clienteSelecionado.nome.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{clienteSelecionado.nome}</p>
                    <p className="text-xs text-muted-foreground">{clienteSelecionado.cpf || clienteSelecionado.email}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      setFormNovo({ ...formNovo, clienteId: '' });
                      setClienteSearch('');
                      setClienteDropdownOpen(false);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="Digite nome ou CPF do cliente..."
                    className="pl-9"
                    value={clienteSearch}
                    onChange={(e) => {
                      setClienteSearch(e.target.value);
                      setClienteDropdownOpen(true);
                    }}
                    onFocus={() => setClienteDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setClienteDropdownOpen(false), 200)}
                  />
                  {clienteDropdownOpen && clienteSearch.trim() && (
                    <div className="absolute z-50 left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto rounded-lg border bg-popover shadow-lg">
                      {clientesFiltrados.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-muted-foreground text-center">
                          Nenhum cliente encontrado
                        </div>
                      ) : (
                        clientesFiltrados.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-accent transition-colors first:rounded-t-lg last:rounded-b-lg"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setFormNovo({ ...formNovo, clienteId: c.id });
                              setClienteSearch('');
                              setClienteDropdownOpen(false);
                            }}
                          >
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground font-medium text-xs shrink-0">
                              {c.nome.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{c.nome}</p>
                              <p className="text-xs text-muted-foreground">{c.cpf || c.email}</p>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="valor">Valor do Empréstimo *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">R$</span>
                  <Input
                    id="valor"
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    className="pl-10"
                    value={formNovo.valor}
                    onChange={(e) => {
                      // Allow only digits, comma and dot
                      const raw = e.target.value.replace(/[^\d.,]/g, '');
                      setFormNovo({ ...formNovo, valor: raw });
                    }}
                    onBlur={() => {
                      // Format on blur
                      const num = parseFloat(formNovo.valor.replace(/\./g, '').replace(',', '.'));
                      if (!isNaN(num) && num > 0) {
                        setFormNovo({ ...formNovo, valor: num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) });
                      }
                    }}
                    onFocus={() => {
                      // Remove formatting on focus for easy editing
                      const num = parseFloat(formNovo.valor.replace(/\./g, '').replace(',', '.'));
                      if (!isNaN(num)) {
                        setFormNovo({ ...formNovo, valor: String(num) });
                      }
                    }}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="parcelas">Nº de Parcelas *</Label>
                <Input
                  id="parcelas"
                  type="number"
                  placeholder="12"
                  min={1}
                  max={360}
                  value={formNovo.parcelas}
                  onChange={(e) => setFormNovo({ ...formNovo, parcelas: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="taxa">Taxa de Juros *</Label>
                <Input
                  id="taxa"
                  type="number"
                  step="0.01"
                  placeholder="2.5"
                  value={formNovo.taxaJuros}
                  onChange={(e) => setFormNovo({ ...formNovo, taxaJuros: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="tipoJuros">Período</Label>
                <Select value={formNovo.tipoJuros} onValueChange={(v: 'mensal' | 'semanal' | 'diario') => setFormNovo({ ...formNovo, tipoJuros: v })}>
                  <SelectTrigger id="tipoJuros">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mensal">Mensal</SelectItem>
                    <SelectItem value="semanal">Semanal</SelectItem>
                    <SelectItem value="diario">Diário</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="dataContrato">Data Contrato</Label>
                <Input
                  id="dataContrato"
                  type="date"
                  value={formNovo.dataContrato}
                  onChange={(e) => setFormNovo({ ...formNovo, dataContrato: e.target.value })}
                />
              </div>
            </div>

            {/* Preview da parcela */}
            {formNovo.valor && formNovo.parcelas && formNovo.taxaJuros && (
              <div className="p-4 bg-muted/50 rounded-lg border space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Valor estimado da parcela:</span>
                  <span className="font-bold text-lg text-primary">
                    {(() => {
                      const v = parseFloat(formNovo.valor.replace(/\./g, '').replace(',', '.'));
                      const n = parseInt(formNovo.parcelas);
                      const tm = taxaMensalEquivalente;
                      if (!v || !n) return '—';
                      const vp = tm > 0 ? (v * tm * Math.pow(1 + tm, n)) / (Math.pow(1 + tm, n) - 1) : v / n;
                      return formatCurrency(Math.round(vp * 100) / 100);
                    })()}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Total a pagar:</span>
                  <span className="font-medium">
                    {(() => {
                      const v = parseFloat(formNovo.valor.replace(/\./g, '').replace(',', '.'));
                      const n = parseInt(formNovo.parcelas);
                      const tm = taxaMensalEquivalente;
                      if (!v || !n) return '—';
                      const vp = tm > 0 ? (v * tm * Math.pow(1 + tm, n)) / (Math.pow(1 + tm, n) - 1) : v / n;
                      return formatCurrency(Math.round(vp * n * 100) / 100);
                    })()}
                  </span>
                </div>
                {formNovo.tipoJuros !== 'mensal' && (
                  <p className="text-xs text-muted-foreground">
                    Taxa equivalente mensal: {(taxaMensalEquivalente * 100).toFixed(2)}% a.m.
                  </p>
                )}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowNovoEmprestimo(false)}>
                Cancelar
              </Button>
              <Button
                className="flex-1 bg-primary"
                onClick={handleNovoEmprestimo}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? 'Criando...' : 'Criar Empréstimo'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 *  Componente de Detalhe — painel completo do empréstimo
 * ═══════════════════════════════════════════════════════════ */

interface DetailProps {
  emprestimo: Emprestimo;
  clientes: ReturnType<typeof useClientes>['data'] extends (infer T)[] ? T[] : never[];
  onClose: () => void;
  navigate: ReturnType<typeof useNavigate>;
  updateEmprestimo: ReturnType<typeof useUpdateEmprestimo>;
  tipoJurosLabel: Record<string, string>;
  formatCurrency: (v: number) => string;
  getStatusBadge: (s: string) => React.ReactNode;
  handleMarcarQuitado: (e: Emprestimo) => void;
  handleMarcarInadimplente: (e: Emprestimo) => void;
}

function EmprestimoDetailModal({
  emprestimo,
  clientes,
  onClose,
  navigate,
  updateEmprestimo,
  tipoJurosLabel,
  formatCurrency,
  getStatusBadge,
  handleMarcarQuitado,
  handleMarcarInadimplente,
}: DetailProps) {
  const cliente = useMemo(
    () => clientes.find((c) => c.id === emprestimo.clienteId),
    [clientes, emprestimo.clienteId],
  );
  const { data: parcelas = [], isLoading: loadingParcelas } = useParcelasByEmprestimo(emprestimo.id);
  const { data: indicados = [] } = useIndicados(emprestimo.clienteId);
  const updateParcela = useUpdateParcela();
  const registrarPagamento = useRegistrarPagamento();
  const updateCliente = useUpdateCliente();

  // State for editing juros/multa inline
  const [editingParcelaId, setEditingParcelaId] = useState<string | null>(null);
  const [editJuros, setEditJuros] = useState('');
  const [editMulta, setEditMulta] = useState('');

  // State for partial payment
  const [partialParcelaId, setPartialParcelaId] = useState<string | null>(null);
  const [partialValorPago, setPartialValorPago] = useState('');

  // State for reactivation dialog (shown after last parcela is paid)
  const [showReativarDialog, setShowReativarDialog] = useState(false);

  const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR');
  const today = new Date().toISOString().slice(0, 10);

  // Valores computados a partir dos dados ao vivo (não do prop emprestimo)
  const parcelasLive = parcelas;
  const parcelasPagasCount = parcelasLive.filter(p => p.status === 'paga').length;
  const parcelasTotalCount = parcelasLive.length || emprestimo.parcelas;
  const pendentesCount = parcelasLive.filter(p => p.status === 'pendente' || p.status === 'vencida').length;

  const saldoDevedor = parcelasLive
    .filter((p) => p.status !== 'paga' && p.status !== 'cancelada')
    .reduce((acc, p) => acc + p.valor, 0);

  const totalJuros = parcelasLive.reduce((acc, p) => acc + p.juros, 0);
  const totalMulta = parcelasLive.reduce((acc, p) => acc + p.multa, 0);

  const parcelaBadge = (status: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      paga: { label: 'Paga', cls: 'bg-green-100 text-green-800' },
      pendente: { label: 'Pendente', cls: 'bg-yellow-100 text-yellow-800' },
      vencida: { label: 'Vencida', cls: 'bg-red-100 text-red-800' },
      cancelada: { label: 'Cancelada', cls: 'bg-gray-100 text-gray-800' },
    };
    const s = map[status] || { label: status, cls: '' };
    return <Badge className={`${s.cls} hover:${s.cls}`}>{s.label}</Badge>;
  };

  /* ── Ações sobre parcelas ──────────────────────────────── */

  const handleSaveJuros = useCallback((parcela: Parcela) => {
    const juros = parseFloat(editJuros) || 0;
    const multa = parseFloat(editMulta) || 0;
    const novoValor = parcela.valorOriginal + juros + multa - parcela.desconto;
    updateParcela.mutate(
      { id: parcela.id, data: { juros, multa, valor: Math.max(novoValor, 0) } },
      {
        onSuccess: () => { toast.success('Juros/multa atualizados'); setEditingParcelaId(null); },
        onError: (err) => toast.error(`Erro: ${err.message}`),
      },
    );
  }, [editJuros, editMulta, updateParcela]);

  const handleQuitarParcela = useCallback((parcela: Parcela) => {
    registrarPagamento.mutate(
      { id: parcela.id, dataPagamento: today },
      {
        onSuccess: () => {
          toast.success(`Parcela ${parcela.numero} quitada`);
          // Se era a última pendente, mostrar dialog de reativação
          if (pendentesCount <= 1) {
            setShowReativarDialog(true);
          }
        },
        onError: (err) => toast.error(`Erro: ${err.message}`),
      },
    );
  }, [registrarPagamento, today, pendentesCount]);

  const handleBaixaParcial = useCallback((parcela: Parcela) => {
    const valorPago = parseFloat(partialValorPago) || 0;
    if (valorPago <= 0 || valorPago >= parcela.valor) {
      toast.error('Valor inválido — deve ser maior que zero e menor que o total da parcela');
      return;
    }
    const restante = parcela.valor - valorPago;
    // Amortização parcial: reduz o valor devido, mantém status como pendente
    updateParcela.mutate(
      { id: parcela.id, data: { valor: Math.max(restante, 0) } },
      {
        onSuccess: () => {
          toast.success(`Amortização registrada · Pago: ${formatCurrency(valorPago)} · Restante: ${formatCurrency(restante)}`);
          setPartialParcelaId(null);
          setPartialValorPago('');
        },
        onError: (err) => toast.error(`Erro: ${err.message}`),
      },
    );
  }, [updateParcela, partialValorPago, formatCurrency]);

  const handleQuitarApenasJuros = useCallback((parcela: Parcela) => {
    if (parcela.juros <= 0) { toast.info('Sem juros a quitar nesta parcela'); return; }
    // Zera os juros/multa, ajusta valor = valorOriginal - desconto
    const novoValor = parcela.valorOriginal - parcela.desconto;
    updateParcela.mutate(
      { id: parcela.id, data: { juros: 0, multa: 0, valor: Math.max(novoValor, 0) } },
      {
        onSuccess: () => toast.success(`Juros da parcela ${parcela.numero} quitados (${formatCurrency(parcela.juros + parcela.multa)})`),
        onError: (err) => toast.error(`Erro: ${err.message}`),
      },
    );
  }, [updateParcela, formatCurrency]);

  const isBusy = updateParcela.isPending || registrarPagamento.isPending || updateEmprestimo.isPending || updateCliente.isPending;

  return (
    <>
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-[95vw] max-h-[92vh] overflow-y-auto p-0">
        {/* ── Header com gradiente ──────────────────────── */}
        <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-6 pt-6 pb-4 border-b">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-br from-primary to-primary/70 text-white rounded-2xl flex items-center justify-center text-xl font-bold shadow-lg">
                {emprestimo.clienteNome?.charAt(0) || 'C'}
              </div>
              <div className="flex-1">
                <div className="text-lg text-foreground">{emprestimo.clienteNome}</div>
                <div className="text-sm text-muted-foreground font-normal flex items-center gap-3 mt-0.5">
                  <span className="font-semibold text-foreground">{formatCurrency(emprestimo.valor)}</span>
                  <span className="text-muted-foreground">•</span>
                  <span>{loadingParcelas ? `${emprestimo.parcelasPagas}/${emprestimo.parcelas}` : `${parcelasPagasCount}/${parcelasTotalCount}`} parcelas</span>
                  <span className="text-muted-foreground">•</span>
                  <span>{emprestimo.taxaJuros}% {tipoJurosLabel[emprestimo.tipoJuros] || 'a.m.'}</span>
                </div>
              </div>
              <div className="ml-auto">{getStatusBadge(emprestimo.status)}</div>
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6 pt-4">
        <Tabs defaultValue="parcelas">
          <TabsList className="w-full grid grid-cols-3 mb-4">
            <TabsTrigger value="parcelas" className="gap-1.5">
              <CreditCard className="w-4 h-4" />Parcelas
            </TabsTrigger>
            <TabsTrigger value="cliente" className="gap-1.5">
              <User className="w-4 h-4" />Cliente
            </TabsTrigger>
            <TabsTrigger value="emprestimo" className="gap-1.5">
              <DollarSign className="w-4 h-4" />Empréstimo
            </TabsTrigger>
          </TabsList>

          {/* ── Tab: Parcelas ─────────────────────────────── */}
          <TabsContent value="parcelas" className="space-y-5">
            {/* Resumo rápido — cards estilizados */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-center">
                <DollarSign className="w-5 h-5 mx-auto mb-1 text-primary" />
                <div className="text-xl font-bold">{formatCurrency(saldoDevedor)}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Saldo devedor</div>
              </div>
              <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900/30 p-4 text-center">
                <Percent className="w-5 h-5 mx-auto mb-1 text-red-500" />
                <div className="text-xl font-bold text-red-600">{formatCurrency(totalJuros)}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Total juros</div>
              </div>
              <div className="rounded-xl border border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-900/30 p-4 text-center">
                <AlertTriangle className="w-5 h-5 mx-auto mb-1 text-orange-500" />
                <div className="text-xl font-bold text-orange-600">{formatCurrency(totalMulta)}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Total multa</div>
              </div>
              <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-900/30 p-4 text-center">
                <CheckCircle className="w-5 h-5 mx-auto mb-1 text-green-500" />
                <div className="text-xl font-bold text-green-700 dark:text-green-400">
                  {parcelasPagasCount}/{parcelasTotalCount}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">Pagas</div>
              </div>
            </div>

            {loadingParcelas ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : parcelas.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Nenhuma parcela registrada.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/60 border-b">
                      <th className="text-left py-3 px-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Nº</th>
                      <th className="text-left py-3 px-2 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Vencimento</th>
                      <th className="text-right py-3 px-2 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Original</th>
                      <th className="text-right py-3 px-2 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Juros</th>
                      <th className="text-right py-3 px-2 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Multa</th>
                      <th className="text-right py-3 px-2 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Total</th>
                      <th className="text-center py-3 px-2 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Status</th>
                      <th className="text-center py-3 px-2 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parcelas.map((p) => {
                      const isEditing = editingParcelaId === p.id;
                      const isPartial = partialParcelaId === p.id;
                      const isPendente = p.status === 'pendente' || p.status === 'vencida';
                      return (
                        <tr key={p.id} className="border-b last:border-b-0 hover:bg-muted/40 transition-colors">
                          <td className="py-3 px-3 font-semibold text-primary">#{p.numero}</td>
                          <td className="py-3 px-2">{formatDate(p.dataVencimento)}</td>
                          <td className="py-3 px-2 text-right tabular-nums">{formatCurrency(p.valorOriginal)}</td>
                          <td className="py-3 px-2 text-right tabular-nums">
                            {isEditing ? (
                              <Input type="number" step="0.01" className="w-24 h-8 text-xs text-right rounded-lg border-red-300 focus:border-red-500" value={editJuros} onChange={(e) => setEditJuros(e.target.value)} />
                            ) : (
                              <span className={p.juros > 0 ? 'text-red-600 font-semibold' : 'text-muted-foreground'}>{formatCurrency(p.juros)}</span>
                            )}
                          </td>
                          <td className="py-3 px-2 text-right tabular-nums">
                            {isEditing ? (
                              <Input type="number" step="0.01" className="w-24 h-8 text-xs text-right rounded-lg border-orange-300 focus:border-orange-500" value={editMulta} onChange={(e) => setEditMulta(e.target.value)} />
                            ) : (
                              <span className={p.multa > 0 ? 'text-orange-600 font-semibold' : 'text-muted-foreground'}>{formatCurrency(p.multa)}</span>
                            )}
                          </td>
                          <td className="py-3 px-2 text-right font-bold tabular-nums">{formatCurrency(p.valor)}</td>
                          <td className="py-3 px-2 text-center">{parcelaBadge(p.status)}</td>
                          <td className="py-3 px-2">
                            {isPendente && (
                              <div className="flex flex-wrap gap-1 justify-center">
                                {isEditing ? (
                                  <>
                                    <Button size="sm" className="h-6 text-xs px-2 bg-green-600 hover:bg-green-700" onClick={() => handleSaveJuros(p)} disabled={isBusy}>
                                      Salvar
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setEditingParcelaId(null)}>
                                      X
                                    </Button>
                                  </>
                                ) : isPartial ? (
                                  <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs text-muted-foreground whitespace-nowrap">Pago R$</span>
                                      <Input
                                        type="number"
                                        step="0.01"
                                        min="0.01"
                                        max={p.valor - 0.01}
                                        placeholder="0,00"
                                        className="w-24 h-6 text-xs"
                                        value={partialValorPago}
                                        onChange={(e) => setPartialValorPago(e.target.value)}
                                        autoFocus
                                      />
                                      <Button size="sm" className="h-6 text-xs px-2 bg-blue-600 hover:bg-blue-700" onClick={() => handleBaixaParcial(p)} disabled={isBusy}>
                                        OK
                                      </Button>
                                      <Button size="sm" variant="ghost" className="h-6 text-xs px-1" onClick={() => { setPartialParcelaId(null); setPartialValorPago(''); }}>
                                        X
                                      </Button>
                                    </div>
                                    {partialValorPago && parseFloat(partialValorPago) > 0 && parseFloat(partialValorPago) < p.valor && (
                                      <p className="text-xs text-muted-foreground pl-1">
                                        Total: {formatCurrency(p.valor)} · Restante: {formatCurrency(p.valor - parseFloat(partialValorPago))}
                                      </p>
                                    )}
                                  </div>
                                ) : (
                                  <>
                                    <Button size="sm" className="h-7 text-xs px-3 rounded-lg bg-green-600 hover:bg-green-700 text-white shadow-sm" title="Quitar parcela" onClick={() => handleQuitarParcela(p)} disabled={isBusy}>
                                      <CheckCircle className="w-3 h-3 mr-1" />Quitar
                                    </Button>
                                    <Button size="sm" variant="outline" className="h-7 text-xs px-3 rounded-lg" title="Registrar amortização parcial" onClick={() => { setPartialParcelaId(p.id); setPartialValorPago(''); }} disabled={isBusy}>
                                      Parcial
                                    </Button>
                                    <Button size="sm" variant="outline" className="h-7 text-xs px-2 rounded-lg" title="Atribuir juros/multa manualmente" onClick={() => { setEditingParcelaId(p.id); setEditJuros(String(p.juros)); setEditMulta(String(p.multa)); }} disabled={isBusy}>
                                      <Percent className="w-3.5 h-3.5" />
                                    </Button>
                                    {(p.juros > 0 || p.multa > 0) && (
                                      <Button size="sm" variant="outline" className="h-7 text-xs px-3 rounded-lg border-red-200 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" title="Quitar apenas juros/multa" onClick={() => handleQuitarApenasJuros(p)} disabled={isBusy}>
                                        Zerar J
                                      </Button>
                                    )}
                                  </>
                                )}
                              </div>
                            )}
                            {p.status === 'paga' && p.dataPagamento && (
                              <span className="text-xs text-muted-foreground">Pago {formatDate(p.dataPagamento)}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          {/* ── Tab: Cliente ──────────────────────────────── */}
          <TabsContent value="cliente" className="space-y-5">
            {cliente ? (
              <>
                {/* Dados pessoais card */}
                <div className="rounded-xl border bg-card p-5">
                  <h4 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-4 flex items-center gap-2">
                    <User className="w-4 h-4" />Dados Pessoais
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
                    <div>
                      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Nome</span>
                      <p className="font-semibold mt-0.5">{cliente.nome}</p>
                    </div>
                    <div>
                      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Email</span>
                      <p className="font-medium mt-0.5 break-all">{cliente.email}</p>
                    </div>
                    <div>
                      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Telefone</span>
                      <p className="font-medium mt-0.5">{cliente.telefone}</p>
                    </div>
                    {cliente.cpf && (
                      <div>
                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">CPF</span>
                        <p className="font-medium mt-0.5 tabular-nums">{cliente.cpf}</p>
                      </div>
                    )}
                    {cliente.endereco && (
                      <div className="col-span-2">
                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Endereço</span>
                        <p className="font-medium mt-0.5">{cliente.endereco}</p>
                      </div>
                    )}
                    <div>
                      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Status</span>
                      <div className="mt-1">{getStatusBadge(cliente.status)}</div>
                    </div>
                  </div>
                </div>

                {/* Financeiro card */}
                <div className="rounded-xl border bg-card p-5">
                  <h4 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-4 flex items-center gap-2">
                    <CreditCard className="w-4 h-4" />Financeiro
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="rounded-lg bg-muted/50 p-3">
                      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Score</span>
                      <div className="flex items-center gap-2 mt-1">
                        <Progress value={(cliente.scoreInterno / 1000) * 100} className="h-2 flex-1" />
                        <span className="text-sm font-bold tabular-nums">{cliente.scoreInterno}</span>
                      </div>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-3">
                      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Limite</span>
                      <p className="font-bold text-base mt-1 tabular-nums">{formatCurrency(cliente.limiteCredito)}</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-3">
                      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Utilizado</span>
                      <p className="font-bold text-base mt-1 tabular-nums">{formatCurrency(cliente.creditoUtilizado)}</p>
                    </div>
                    <div className="rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900/30 p-3">
                      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Disponível</span>
                      <p className="font-bold text-base mt-1 text-green-700 dark:text-green-400 tabular-nums">{formatCurrency(cliente.limiteCredito - cliente.creditoUtilizado)}</p>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-dashed flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Bônus acumulado</span>
                    <span className="font-bold text-secondary tabular-nums">{formatCurrency(cliente.bonusAcumulado)}</span>
                  </div>
                </div>

                {/* Indicações card */}
                <div className="rounded-xl border bg-card p-5">
                  <h4 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                    <Share2 className="w-4 h-4" /> Rede de Indicações
                    {indicados.length > 0 && (
                      <Badge variant="secondary" className="ml-auto text-xs">{indicados.length}</Badge>
                    )}
                  </h4>
                  {indicados.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma indicação registrada.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {indicados.map((ind) => (
                        <Badge key={ind.id} variant="outline" className="px-3 py-1 rounded-lg text-xs font-medium">
                          {ind.nome} — {ind.status}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* Ações rápidas */}
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1 h-10 rounded-xl gap-2" onClick={() => { onClose(); navigate(`/chat?phone=${encodeURIComponent(cliente.telefone)}`); }}>
                    <MessageSquare className="w-4 h-4" />Chat
                  </Button>
                  <Button variant="outline" className="flex-1 h-10 rounded-xl gap-2" onClick={() => window.open(`tel:${cliente.telefone}`, '_self')}>
                    <Phone className="w-4 h-4" />Ligar
                  </Button>
                  <Button variant="outline" className="flex-1 h-10 rounded-xl gap-2" onClick={() => { onClose(); navigate(`/whatsapp?telefone=${encodeURIComponent(cliente.telefone)}`); }}>
                    <Phone className="w-4 h-4" />WhatsApp
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-center text-muted-foreground py-8">Dados do cliente não encontrados.</p>
            )}
          </TabsContent>

          {/* ── Tab: Empréstimo ───────────────────────────── */}
          <TabsContent value="emprestimo" className="space-y-5">
            {/* Info cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border bg-card p-4">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Valor</span>
                <p className="font-bold text-xl mt-1 tabular-nums">{formatCurrency(emprestimo.valor)}</p>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Parcelas</span>
                <p className="font-bold text-xl mt-1 tabular-nums">{parcelasPagasCount}<span className="text-muted-foreground text-base">/{parcelasTotalCount}</span></p>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Valor Parcela</span>
                <p className="font-bold text-xl mt-1 tabular-nums">{formatCurrency(emprestimo.valorParcela)}</p>
              </div>
              <div className="rounded-xl border border-red-200 dark:border-red-900/30 bg-red-50 dark:bg-red-950/20 p-4">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Saldo Devedor</span>
                <p className="font-bold text-xl mt-1 text-red-600 tabular-nums">{formatCurrency(saldoDevedor)}</p>
              </div>
            </div>

            {/* Detalhes do contrato */}
            <div className="rounded-xl border bg-card p-5">
              <h4 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-4">Detalhes do Contrato</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Taxa de Juros</span>
                  <p className="font-semibold mt-0.5">{emprestimo.taxaJuros}% {tipoJurosLabel[emprestimo.tipoJuros] || 'a.m.'}</p>
                </div>
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Data do Contrato</span>
                  <p className="font-medium mt-0.5">{formatDate(emprestimo.dataContrato)}</p>
                </div>
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Próximo Vencimento</span>
                  <p className="font-medium mt-0.5">{formatDate(emprestimo.proximoVencimento)}</p>
                </div>
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Status</span>
                  <div className="mt-1">{getStatusBadge(emprestimo.status)}</div>
                </div>
              </div>
            </div>

            {/* Progresso */}
            <div className="rounded-xl border bg-card p-5">
              <div className="flex justify-between text-sm mb-2">
                <span className="font-medium">Progresso de Pagamento</span>
                <span className="font-bold text-primary">{((parcelasPagasCount / parcelasTotalCount) * 100).toFixed(0)}%</span>
              </div>
              <Progress value={(parcelasPagasCount / parcelasTotalCount) * 100} className="h-3" />
              <p className="text-xs text-muted-foreground mt-2">
                {parcelasPagasCount} de {parcelasTotalCount} parcelas pagas
              </p>
            </div>

            {/* Ações */}
            <div className="flex gap-3">
              {emprestimo.status === 'ativo' && (
                <>
                  <Button className="flex-1 h-11 rounded-xl bg-green-600 hover:bg-green-700 gap-2 text-sm" onClick={() => handleMarcarQuitado(emprestimo)} disabled={isBusy}>
                    <CheckCircle className="w-4 h-4" />Quitar Tudo
                  </Button>
                  <Button className="flex-1 h-11 rounded-xl gap-2 text-sm" variant="destructive" onClick={() => handleMarcarInadimplente(emprestimo)} disabled={isBusy}>
                    <AlertTriangle className="w-4 h-4" />Inadimplente
                  </Button>
                </>
              )}
              {emprestimo.status === 'inadimplente' && (
                <>
                  <Button className="flex-1 h-11 rounded-xl bg-green-600 hover:bg-green-700 gap-2 text-sm" onClick={() => handleMarcarQuitado(emprestimo)} disabled={isBusy}>
                    <CheckCircle className="w-4 h-4" />Quitar Tudo
                  </Button>
                  <Button className="flex-1 h-11 rounded-xl gap-2 text-sm" variant="outline" onClick={() => {
                    updateEmprestimo.mutate(
                      { id: emprestimo.id, data: { status: 'ativo' } },
                      {
                        onSuccess: () => { toast.success('Empréstimo reativado'); onClose(); },
                        onError: (err) => toast.error(`Erro: ${err.message}`),
                      },
                    );
                  }} disabled={isBusy}>
                    Reativar
                  </Button>
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>
        </div>
      </DialogContent>
    </Dialog>

    {/* Dialog de reativação após quitar última parcela */}
    {showReativarDialog && (
      <Dialog open onOpenChange={() => setShowReativarDialog(false)}>
        <DialogContent className="max-w-md sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              Todas as parcelas quitadas!
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {emprestimo.clienteNome} quitou todas as parcelas deste empréstimo.
              Deseja reativar o cliente ou mantê-lo inativo (considerando o histórico de atraso)?
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Button
                className="h-12 rounded-xl bg-green-600 hover:bg-green-700 gap-2"
                onClick={() => {
                  // Quitar empréstimo e reativar cliente
                  updateEmprestimo.mutate(
                    { id: emprestimo.id, data: { status: 'quitado' } },
                    {
                      onSuccess: () => {
                        // Sync: reativar cliente para em_dia
                        updateCliente.mutate({ id: emprestimo.clienteId, data: { status: 'em_dia' } });
                        toast.success('Empréstimo quitado e cliente reativado!');
                        setShowReativarDialog(false);
                        onClose();
                      },
                      onError: (err) => toast.error(`Erro: ${err.message}`),
                    },
                  );
                }}
                disabled={isBusy}
              >
                <CheckCircle className="w-4 h-4" />
                Reativar Cliente
              </Button>
              <Button
                variant="destructive"
                className="h-12 rounded-xl gap-2"
                onClick={() => {
                  // Quitar empréstimo mas manter inadimplente
                  updateEmprestimo.mutate(
                    { id: emprestimo.id, data: { status: 'quitado' } },
                    {
                      onSuccess: () => {
                        toast.success('Empréstimo quitado. Cliente mantido como inativo (mal pagador).');
                        setShowReativarDialog(false);
                        onClose();
                      },
                      onError: (err) => toast.error(`Erro: ${err.message}`),
                    },
                  );
                }}
                disabled={isBusy}
              >
                <AlertTriangle className="w-4 h-4" />
                Manter Inativo
              </Button>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Clientes inativos são considerados mal pagadores e não recebem novos empréstimos.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    )}
    </>
  );
}
