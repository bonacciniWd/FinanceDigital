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
import { useNavigate, useSearchParams } from 'react-router';
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
import { Textarea } from '../components/ui/textarea';
import {
  Search, Eye, DollarSign, TrendingUp, AlertTriangle, CheckCircle, Plus,
  MessageSquare, Phone, User, CreditCard, Percent, Loader2, Share2,
  QrCode, Upload, Image, X, Copy,
} from 'lucide-react';
import { toast } from 'sonner';

import { useEmprestimos, useUpdateEmprestimo, useQuitarEmprestimo } from '../hooks/useEmprestimos';
import { useClientes, useIndicados, useUpdateCliente } from '../hooks/useClientes';
import { useParcelasByEmprestimo, useUpdateParcela, useRegistrarPagamento } from '../hooks/useParcelas';
import { useAdminUsers } from '../hooks/useAdminUsers';
import { useContasBancarias } from '../hooks/useContasBancarias';
import { useCriarCobvEfi } from '../hooks/useWoovi';
import { useInstancias, useEnviarWhatsapp } from '../hooks/useWhatsapp';
import { useClienteModal } from '../contexts/ClienteModalContext';
import { supabase } from '../lib/supabase';
import ComprovanteUploader from '../components/ComprovanteUploader';
import type { Emprestimo, Parcela, Cliente } from '../lib/view-types';
import { calcularJurosAtraso, diasDeAtraso } from '../lib/juros';

export default function EmprestimosAtivosPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { openClienteModal } = useClienteModal();
  const [selectedEmprestimo, setSelectedEmprestimo] = useState<Emprestimo | null>(null);
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [searchTerm, setSearchTerm] = useState('');


  /** Label do tipo de juros para exibição */
  const tipoJurosLabel: Record<string, string> = {
    mensal: '% a.m.',
    semanal: '% a.s.',
    diario: '% a.d.',
  };

  // ── React Query ──────────────────────────────────────────
  const { data: emprestimos = [], isLoading, isError } = useEmprestimos();
  const { data: clientes = [] } = useClientes();
  const updateMutation = useUpdateEmprestimo();
  const quitarMutation = useQuitarEmprestimo();
  const updateClienteMutation = useUpdateCliente();

  // Abre empréstimo pelo param ?emprestimoId=
  useEffect(() => {
    const id = searchParams.get('emprestimoId');
    if (!id || emprestimos.length === 0) return;
    const found = emprestimos.find((e) => e.id === id);
    if (found) {
      setSelectedEmprestimo(found);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, emprestimos]);

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

  // ── Filtros ──────────────────────────────────────────────
  const filtered = useMemo(() => {
    return emprestimos.filter((e) => {
      const matchStatus = filtroStatus === 'todos' || e.status === filtroStatus;
      const matchSearch =
        !searchTerm || e.clienteNome?.toLowerCase().includes(searchTerm.toLowerCase());
      return matchStatus && matchSearch;
    });
  }, [emprestimos, filtroStatus, searchTerm]);

  // ── Paginação ────────────────────────────────────────────
  // 10k empréstimos não cabem em uma tabela DOM. 100 por página dá render
  // rápido. Reset automático ao mudar filtros.
  const PAGE_SIZE = 100;
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  useEffect(() => {
    setCurrentPage(1);
  }, [filtroStatus, searchTerm]);

  const paginatedEmprestimos = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage],
  );

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
    quitarMutation.mutate(
      { id: emp.id, totalParcelas: emp.parcelas },
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
        <Button className="bg-primary hover:bg-primary/90" onClick={() => navigate('/clientes/analise')}>
          <Plus className="w-4 h-4 mr-2" />
          Nova Análise de Crédito
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
                  <th className="text-center py-3 font-medium text-muted-foreground">Gateway</th>
                  <th className="text-center py-3 font-medium text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {Array.from({ length: 10 }).map((_, j) => (
                        <td key={j} className="py-3"><Skeleton className="h-5 w-full" /></td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-muted-foreground">
                      Nenhum empréstimo encontrado.
                    </td>
                  </tr>
                ) : (
                  paginatedEmprestimos.map((e) => (
                    <tr key={e.id} className="border-b hover:bg-muted/50">
                      <td className="py-3 font-medium">
                        <button
                          type="button"
                          className="hover:text-primary hover:underline text-left"
                          title="Abrir detalhes do cliente"
                          onClick={() => openClienteModal(e.clienteId)}
                        >
                          {e.clienteNome}
                        </button>
                      </td>
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
                        {e.gateway ? (
                          <Badge variant="outline" className="text-xs">{e.gateway === 'woovi' ? 'Woovi' : e.gateway === 'efi' ? 'EFI' : e.gateway}</Badge>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="py-3 text-center">
                        <Button
                          size="sm"
                          variant="outline"
                          title="Abrir detalhes do cliente (Cobrança)"
                          onClick={() => openClienteModal(e.clienteId, { tab: 'cobranca' })}
                        >
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

      {/* Controles de paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-4 px-2">
          <span className="text-sm text-muted-foreground">
            Mostrando {(currentPage - 1) * PAGE_SIZE + 1}–
            {Math.min(currentPage * PAGE_SIZE, filtered.length)} de {filtered.length}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              Anterior
            </Button>
            <span className="text-sm">
              Página <strong>{currentPage}</strong> de {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}

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


    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 *  Componente de Detalhe — painel completo do empréstimo
 * ═══════════════════════════════════════════════════════════ */

interface DetailProps {
  emprestimo: Emprestimo;
  clientes: Cliente[];
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
  const { data: allUsers = [] } = useAdminUsers();
  const { data: contasBancarias = [] } = useContasBancarias();
  const criarCobvEfi = useCriarCobvEfi();
  const { data: instancias = [] } = useInstancias();
  const enviarWhatsapp = useEnviarWhatsapp();

  // Funcionários por role para exibição de nomes
  const findUserName = useCallback((id?: string | null) => {
    if (!id) return null;
    const u = allUsers.find((u: any) => u.id === id);
    return u?.name || u?.email || id.slice(0, 8);
  }, [allUsers]);

  // Cobradores disponíveis
  const cobradores = useMemo(
    () => allUsers.filter((u: any) => ['cobranca', 'gerencia', 'admin'].includes(u.role)),
    [allUsers],
  );

  // State for editing juros/multa inline
  const [editingParcelaId, setEditingParcelaId] = useState<string | null>(null);
  const [editJuros, setEditJuros] = useState('');
  const [editMulta, setEditMulta] = useState('');

  // State for partial payment
  const [partialParcelaId, setPartialParcelaId] = useState<string | null>(null);
  const [partialValorPago, setPartialValorPago] = useState('');

  // State for "Efetuar Pagamento" modal
  const [pagamentoParcelaId, setPagamentoParcelaId] = useState<string | null>(null);
  const [pagamentoTab, setPagamentoTab] = useState<'completo' | 'parcial'>('completo');
  const [pagamentoObs, setPagamentoObs] = useState('');
  const [pagamentoData, setPagamentoData] = useState(new Date().toISOString().slice(0, 10));
  const [pagamentoDesconto, setPagamentoDesconto] = useState('0');
  const [pagamentoValorParcial, setPagamentoValorParcial] = useState('');
  const [pagamentoConta, setPagamentoConta] = useState('CONTA PRINCIPAL');

  // State for reactivation dialog (shown after last parcela is paid)
  const [showReativarDialog, setShowReativarDialog] = useState(false);

  // Gerar PIX state
  const [gerandoPixId, setGerandoPixId] = useState<string | null>(null);
  const [pixResultDialog, setPixResultDialog] = useState<{ qrImage: string | null; brCode: string | null; parcelaNumero: number } | null>(null);

  // Confirmar pagamento manual com comprovante
  const [comprovanteParcela, setComprovanteParcela] = useState<Parcela | null>(null);
  const [showComprovanteModal, setShowComprovanteModal] = useState(false);
  const [comprovanteFile, setComprovanteFile] = useState<File | null>(null);
  const [comprovantePreview, setComprovantePreview] = useState<string | null>(null);
  const [comprovanteLoading, setComprovanteLoading] = useState(false);

  // Visualizar comprovante existente
  const [viewComprovanteUrl, setViewComprovanteUrl] = useState<string | null>(null);

  const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR');
  const today = new Date().toISOString().slice(0, 10);

  // Valores computados a partir dos dados ao vivo (não do prop emprestimo)
  const parcelasLive = parcelas;
  const parcelasPagasCount = parcelasLive.filter(p => p.status === 'paga').length;
  const parcelasTotalCount = parcelasLive.length || emprestimo.parcelas;
  const pendentesCount = parcelasLive.filter(p => p.status === 'pendente' || p.status === 'vencida').length;

  /** Juros efetivo da parcela: manual (se > 0) ou calculado automaticamente */
  const jurosEfetivo = useCallback((p: Parcela) => {
    if (p.status === 'paga' || p.status === 'cancelada') return p.juros;
    if (p.juros > 0) return p.juros; // manual override
    const dias = diasDeAtraso(p.dataVencimento);
    return calcularJurosAtraso(p.valorOriginal, dias);
  }, []);

  const saldoDevedor = parcelasLive
    .filter((p) => p.status !== 'paga' && p.status !== 'cancelada')
    .reduce((acc, p) => acc + p.valorOriginal + jurosEfetivo(p) + p.multa - p.desconto, 0);

  const totalJuros = parcelasLive.reduce((acc, p) => acc + jurosEfetivo(p), 0);
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

  const openPagamentoModal = useCallback((parcela: Parcela) => {
    setPagamentoParcelaId(parcela.id);
    setPagamentoTab('completo');
    setPagamentoObs('');
    setPagamentoData(new Date().toISOString().slice(0, 10));
    setPagamentoDesconto('0');
    setPagamentoValorParcial('');
    // Auto-seleciona conta do gateway do empréstimo, ou a padrão
    const gw = emprestimo.gateway;
    const contaGateway = gw ? contasBancarias.find(c => c.tipo === 'gateway' && c.nome.toLowerCase().includes(gw)) : null;
    const contaPadrao = contasBancarias.find(c => c.padrao);
    setPagamentoConta(contaGateway?.nome ?? contaPadrao?.nome ?? (gw === 'efi' ? 'EFI BANK' : 'CONTA PRINCIPAL'));
  }, [emprestimo.gateway, contasBancarias]);

  const closePagamentoModal = useCallback(() => {
    setPagamentoParcelaId(null);
  }, []);

  const handleEfetuarPagamento = useCallback((parcela: Parcela) => {
    const desconto = parseFloat(pagamentoDesconto) || 0;
    const jEfetivo = jurosEfetivo(parcela);
    const valorCorrigido = parcela.valorOriginal + jEfetivo + parcela.multa;
    const totalPagar = Math.max(valorCorrigido - desconto, 0);

    if (pagamentoTab === 'parcial') {
      const valorPago = parseFloat(pagamentoValorParcial) || 0;
      if (valorPago <= 0 || valorPago >= totalPagar) {
        toast.error('Valor parcial deve ser maior que zero e menor que o total.');
        return;
      }
      const restante = totalPagar - valorPago;
      updateParcela.mutate(
        {
          id: parcela.id,
          data: {
            valor: Math.max(restante, 0),
            desconto,
            observacao: pagamentoObs || null,
            conta_bancaria: pagamentoConta || null,
          },
        },
        {
          onSuccess: () => {
            toast.success(`Amortização registrada · Pago: ${formatCurrency(valorPago)} · Restante: ${formatCurrency(restante)}`);
            closePagamentoModal();
          },
          onError: (err) => toast.error(`Erro: ${err.message}`),
        },
      );
    } else {
      // Pagamento completo
      registrarPagamento.mutate(
        { id: parcela.id, dataPagamento: pagamentoData },
        {
          onSuccess: () => {
            // Persist extras (desconto, obs, conta)
            updateParcela.mutate({
              id: parcela.id,
              data: {
                desconto,
                observacao: pagamentoObs || null,
                conta_bancaria: pagamentoConta || null,
              },
            });
            toast.success(`Parcela ${parcela.numero} quitada com sucesso!`);
            closePagamentoModal();
            if (pendentesCount <= 1) {
              setShowReativarDialog(true);
            }
          },
          onError: (err) => toast.error(`Erro: ${err.message}`),
        },
      );
    }
  }, [pagamentoTab, pagamentoDesconto, pagamentoValorParcial, pagamentoObs, pagamentoData, pagamentoConta, updateParcela, registrarPagamento, formatCurrency, pendentesCount, closePagamentoModal]);

  const handleQuitarApenasJuros = useCallback((parcela: Parcela) => {
    const jEfetivo = jurosEfetivo(parcela);
    if (jEfetivo <= 0) { toast.info('Sem juros a quitar nesta parcela'); return; }
    // Zera os juros/multa, ajusta valor = valorOriginal - desconto
    const novoValor = parcela.valorOriginal - parcela.desconto;
    updateParcela.mutate(
      { id: parcela.id, data: { juros: 0, multa: 0, valor: Math.max(novoValor, 0) } },
      {
        onSuccess: () => toast.success(`Juros da parcela ${parcela.numero} quitados (${formatCurrency(jEfetivo + parcela.multa)})`),
        onError: (err) => toast.error(`Erro: ${err.message}`),
      },
    );
  }, [updateParcela, formatCurrency, jurosEfetivo]);

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
                              <span className={jurosEfetivo(p) > 0 ? 'text-red-600 font-semibold' : 'text-muted-foreground'}>
                                {formatCurrency(jurosEfetivo(p))}
                                {p.juros === 0 && jurosEfetivo(p) > 0 && (
                                  <span className="text-[10px] text-red-400 block">auto {diasDeAtraso(p.dataVencimento)}d</span>
                                )}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-2 text-right tabular-nums">
                            {isEditing ? (
                              <Input type="number" step="0.01" className="w-24 h-8 text-xs text-right rounded-lg border-orange-300 focus:border-orange-500" value={editMulta} onChange={(e) => setEditMulta(e.target.value)} />
                            ) : (
                              <span className={p.multa > 0 ? 'text-orange-600 font-semibold' : 'text-muted-foreground'}>{formatCurrency(p.multa)}</span>
                            )}
                          </td>
                          <td className="py-3 px-2 text-right font-bold tabular-nums">{formatCurrency(p.valorOriginal + jurosEfetivo(p) + p.multa - p.desconto)}</td>
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
                                ) : (
                                  <>
                                    <Button size="sm" className="h-7 text-xs px-3 rounded-lg bg-green-600 hover:bg-green-700 text-white shadow-sm" title="Efetuar Pagamento" onClick={() => openPagamentoModal(p)} disabled={isBusy}>
                                      <DollarSign className="w-3 h-3 mr-1" />Pagar
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs px-2 rounded-lg text-blue-600 border-blue-200"
                                      title="Gerar cobrança PIX e enviar via WhatsApp"
                                      disabled={gerandoPixId === p.id || criarCobvEfi.isPending}
                                      onClick={async () => {
                                        setGerandoPixId(p.id);
                                        try {
                                          const { data: cli } = await supabase.from('clientes').select('cpf, nome, telefone').eq('id', p.clienteId).single() as { data: { cpf: string | null; nome: string; telefone: string } | null };
                                          const result = await criarCobvEfi.mutateAsync({
                                            parcela_id: p.id,
                                            emprestimo_id: p.emprestimoId,
                                            cliente_id: p.clienteId,
                                            valor: p.valor,
                                            descricao: `Parcela ${p.numero} - ${emprestimo.clienteNome}`,
                                            cliente_nome: emprestimo.clienteNome,
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
                                          const instSistema = instancias.find((i: any) => ['conectado', 'conectada', 'open', 'connected'].includes(i.status?.toLowerCase?.() || i.status));
                                          if (instSistema && cli?.telefone && brCode) {
                                            const phone = cli.telefone.replace(/\D/g, '').length <= 11 ? '55' + cli.telefone.replace(/\D/g, '') : cli.telefone.replace(/\D/g, '');
                                            // Enviar texto com copia-e-cola
                                            const msg = `💰 *Cobrança PIX - Parcela ${p.numero}*\n\nOlá ${emprestimo.clienteNome}!\n\nValor: *${formatCurrency(p.valor)}*\nVencimento: ${formatDate(p.dataVencimento)}\n\n📱 Copie o código PIX abaixo e cole no app do seu banco:\n\n${brCode}\n\n_CasaDaMoeda_`;
                                            await enviarWhatsapp.mutateAsync({ instancia_id: instSistema.id, telefone: phone, conteudo: msg });
                                            // Enviar QR code como imagem separada
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
                                      variant="outline"
                                      className="h-7 text-xs px-2 rounded-lg text-orange-600 border-orange-200"
                                      title="Confirmar pagamento manual (com comprovante)"
                                      onClick={() => {
                                        setComprovanteParcela(p);
                                        setComprovanteFile(null);
                                        setComprovantePreview(null);
                                        setShowComprovanteModal(true);
                                      }}
                                    >
                                      <Upload className="w-3.5 h-3.5" />
                                    </Button>
                                    <Button size="sm" variant="outline" className="h-7 text-xs px-2 rounded-lg" title="Atribuir juros/multa manualmente" onClick={() => { setEditingParcelaId(p.id); setEditJuros(String(jurosEfetivo(p))); setEditMulta(String(p.multa)); }} disabled={isBusy}>
                                      <Percent className="w-3.5 h-3.5" />
                                    </Button>
                                    {(jurosEfetivo(p) > 0 || p.multa > 0) && (
                                      <Button size="sm" variant="outline" className="h-7 text-xs px-3 rounded-lg border-red-200 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" title="Quitar apenas juros/multa" onClick={() => handleQuitarApenasJuros(p)} disabled={isBusy}>
                                        Zerar J
                                      </Button>
                                    )}
                                  </>
                                )}
                              </div>
                            )}
                            {p.status === 'paga' && (
                              <div className="flex items-center gap-1 justify-center">
                                {p.dataPagamento && (
                                  <span className="text-xs text-muted-foreground">Pago {formatDate(p.dataPagamento)}</span>
                                )}
                                {(p as any).comprovanteUrl && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 w-6 p-0 text-muted-foreground"
                                    title="Ver comprovante"
                                    onClick={() => setViewComprovanteUrl((p as any).comprovanteUrl)}
                                  >
                                    <Image className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                              </div>
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
                  <Button variant="outline" className="flex-1 h-10 rounded-xl gap-2" onClick={() => { onClose(); navigate(`/whatsapp?telefone=${encodeURIComponent(cliente.telefone)}`); }}>
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

            {/* Responsáveis & Gateway */}
            <div className="rounded-xl border bg-card p-5">
              <h4 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-4">Responsáveis & Gateway</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Vendedor</span>
                  <p className="font-medium mt-0.5">{findUserName(emprestimo.vendedorId) || <span className="text-muted-foreground">Não atribuído</span>}</p>
                </div>
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Cobrador</span>
                  <div className="mt-0.5">
                    <Select
                      value={emprestimo.cobradorId || '_none'}
                      onValueChange={(v) => {
                        const val = v === '_none' ? null : v;
                        updateEmprestimo.mutate(
                          { id: emprestimo.id, data: { cobrador_id: val } },
                          {
                            onSuccess: () => toast.success('Cobrador atualizado'),
                            onError: (err) => toast.error(`Erro: ${err.message}`),
                          },
                        );
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Selecionar cobrador" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">Nenhum</SelectItem>
                        {cobradores.map((u: any) => (
                          <SelectItem key={u.id} value={u.id}>{u.name || u.email} ({u.role})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Gateway</span>
                  <p className="font-medium mt-0.5">
                    {emprestimo.gateway ? (
                      <Badge variant="outline">{emprestimo.gateway === 'woovi' ? 'Woovi (OpenPix)' : emprestimo.gateway === 'efi' ? 'EFI Bank' : emprestimo.gateway}</Badge>
                    ) : <span className="text-muted-foreground">—</span>}
                  </p>
                </div>
                {emprestimo.aprovadoPor && (
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Aprovado por</span>
                    <p className="font-medium mt-0.5">{findUserName(emprestimo.aprovadoPor)}</p>
                  </div>
                )}
                {emprestimo.aprovadoEm && (
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Data Aprovação</span>
                    <p className="font-medium mt-0.5">{formatDate(emprestimo.aprovadoEm)}</p>
                  </div>
                )}
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

    {/* ── Dialog: Efetuar Pagamento ────────────────────────────── */}
    {pagamentoParcelaId && (() => {
      const parcela = parcelasLive.find(p => p.id === pagamentoParcelaId);
      if (!parcela) return null;
      const valorCorrigido = parcela.valorOriginal + parcela.juros + parcela.multa;
      const desconto = parseFloat(pagamentoDesconto) || 0;
      const totalPagar = Math.max(valorCorrigido - desconto, 0);
      const diasAtraso = (() => {
        const venc = new Date(parcela.dataVencimento);
        const pagDt = new Date(pagamentoData);
        const diff = Math.floor((pagDt.getTime() - venc.getTime()) / 86400000);
        return Math.max(diff, 0);
      })();
      const isUltima = pendentesCount <= 1;

      return (
        <Dialog open onOpenChange={closePagamentoModal}>
          <DialogContent className="max-w-lg sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-green-500" />
                Efetuar Pagamento — Parcela {parcela.numero}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {isUltima && (
                <div className="flex items-center gap-2 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-700 dark:text-yellow-400">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Última parcela deste empréstimo
                </div>
              )}

              <div>
                <Label className="text-xs mb-1 block">Observação</Label>
                <Textarea
                  placeholder="Observação sobre o pagamento..."
                  className="resize-none h-16 text-sm"
                  value={pagamentoObs}
                  onChange={(e) => setPagamentoObs(e.target.value)}
                />
              </div>

              <Tabs value={pagamentoTab} onValueChange={(v) => setPagamentoTab(v as 'completo' | 'parcial')}>
                <TabsList className="w-full grid grid-cols-2">
                  <TabsTrigger value="completo">Pagamento Completo</TabsTrigger>
                  <TabsTrigger value="parcial">Pagamento Parcial</TabsTrigger>
                </TabsList>

                <TabsContent value="completo" className="space-y-3 mt-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs">Vencimento</Label>
                      <Input value={parcela.dataVencimento} readOnly className="h-8 text-xs bg-muted" />
                    </div>
                    <div>
                      <Label className="text-xs">Pagamento</Label>
                      <Input type="date" value={pagamentoData} onChange={e => setPagamentoData(e.target.value)} className="h-8 text-xs" />
                    </div>
                    <div>
                      <Label className="text-xs">Dias</Label>
                      <Input value={diasAtraso} readOnly className="h-8 text-xs bg-muted" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Valor Parcela</Label>
                      <Input value={formatCurrency(parcela.valorOriginal)} readOnly className="h-8 text-xs bg-muted" />
                    </div>
                    <div>
                      <Label className="text-xs">Valor Corrigido</Label>
                      <Input value={formatCurrency(valorCorrigido)} readOnly className="h-8 text-xs bg-muted" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Desconto (R$)</Label>
                      <Input type="number" min="0" step="0.01" value={pagamentoDesconto} onChange={e => setPagamentoDesconto(e.target.value)} className="h-8 text-xs" />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold">Total a pagar</Label>
                      <Input value={formatCurrency(totalPagar)} readOnly className="h-8 text-xs bg-muted font-bold" />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="parcial" className="space-y-3 mt-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs">Vencimento</Label>
                      <Input value={parcela.dataVencimento} readOnly className="h-8 text-xs bg-muted" />
                    </div>
                    <div>
                      <Label className="text-xs">Pagamento</Label>
                      <Input type="date" value={pagamentoData} onChange={e => setPagamentoData(e.target.value)} className="h-8 text-xs" />
                    </div>
                    <div>
                      <Label className="text-xs">Dias</Label>
                      <Input value={diasAtraso} readOnly className="h-8 text-xs bg-muted" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Valor Total</Label>
                      <Input value={formatCurrency(totalPagar)} readOnly className="h-8 text-xs bg-muted" />
                    </div>
                    <div>
                      <Label className="text-xs">Valor a Pagar</Label>
                      <Input type="number" min="0.01" step="0.01" max={totalPagar - 0.01} placeholder="0,00" value={pagamentoValorParcial} onChange={e => setPagamentoValorParcial(e.target.value)} className="h-8 text-xs" autoFocus />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Desconto (R$)</Label>
                      <Input type="number" min="0" step="0.01" value={pagamentoDesconto} onChange={e => setPagamentoDesconto(e.target.value)} className="h-8 text-xs" />
                    </div>
                    <div>
                      <Label className="text-xs">Restante</Label>
                      <Input value={formatCurrency(Math.max(totalPagar - (parseFloat(pagamentoValorParcial) || 0), 0))} readOnly className="h-8 text-xs bg-muted" />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              <div>
                <Label className="text-xs">Conta Bancária</Label>
                <Select value={pagamentoConta} onValueChange={setPagamentoConta}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {contasBancarias.length > 0 ? (
                      contasBancarias.map(c => (
                        <SelectItem key={c.id} value={c.nome}>
                          {c.nome}{c.padrao ? ' — Padrão' : ''}
                        </SelectItem>
                      ))
                    ) : (
                      <>
                        <SelectItem value="EFI BANK">EFI Bank (Gateway PIX)</SelectItem>
                        <SelectItem value="CONTA PRINCIPAL">CONTA PRINCIPAL</SelectItem>
                        <SelectItem value="CONTA SECUNDÁRIA">CONTA SECUNDÁRIA</SelectItem>
                        <SelectItem value="CAIXA">CAIXA</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <Button variant="outline" onClick={closePagamentoModal}>Cancelar</Button>
                <Button className="bg-green-600 hover:bg-green-700" onClick={() => handleEfetuarPagamento(parcela)} disabled={isBusy}>
                  {isBusy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle className="w-4 h-4 mr-1" />}
                  Efetuar Pagamento
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      );
    })()}

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

    {/* ── Modal: Confirmar Pagamento Manual com Comprovante ──── */}
    {showComprovanteModal && comprovanteParcela && (
      <Dialog open onOpenChange={() => { setShowComprovanteModal(false); setComprovanteParcela(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-orange-500" />
              Confirmar Pagamento — Parcela {comprovanteParcela.numero}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <Label className="text-xs">Valor</Label>
                <p className="font-semibold">{formatCurrency(comprovanteParcela.valor)}</p>
              </div>
              <div>
                <Label className="text-xs">Vencimento</Label>
                <p className="font-semibold">{formatDate(comprovanteParcela.dataVencimento)}</p>
              </div>
            </div>

            <ComprovanteUploader
              parcela={{
                valor: comprovanteParcela.valor,
                juros: comprovanteParcela.juros,
                multa: comprovanteParcela.multa,
                desconto: comprovanteParcela.desconto,
              }}
              submitting={comprovanteLoading}
              onCancel={() => { setShowComprovanteModal(false); setComprovanteParcela(null); }}
              onConfirm={async ({ file, ocr, ocrAvaliacao, confirmDivergencia }) => {
                if (!comprovanteParcela) return;
                setComprovanteLoading(true);
                try {
                  const ext = file.name.split('.').pop() || 'png';
                  const path = `comprovantes/${comprovanteParcela.id}_${Date.now()}.${ext}`;
                  const { error: upErr } = await supabase.storage.from('whatsapp-media').upload(path, file, { upsert: true });
                  if (upErr) throw upErr;
                  const { data: urlData } = supabase.storage.from('whatsapp-media').getPublicUrl(path);

                  await registrarPagamento.mutateAsync({ id: comprovanteParcela.id, dataPagamento: new Date().toISOString().slice(0, 10) });
                  await updateParcela.mutateAsync({
                    id: comprovanteParcela.id,
                    data: {
                      comprovante_url: urlData.publicUrl,
                      pagamento_tipo: 'manual' as const,
                      comprovante_valor_ocr: ocr?.valor ?? null,
                      comprovante_data_ocr: ocr?.data ?? null,
                      comprovante_chave_ocr: ocr?.chavePix ?? null,
                      comprovante_ocr_score: ocr?.confidenceMedia ?? null,
                      comprovante_ocr_status: ocr
                        ? (ocrAvaliacao?.aprovado ? 'auto_aprovado' : confirmDivergencia ? 'divergencia' : 'manual')
                        : 'sem_ocr',
                    } as any,
                  });

                  toast.success(`Parcela ${comprovanteParcela.numero} confirmada com comprovante!`);
                  setShowComprovanteModal(false);
                  setComprovanteParcela(null);
                  if (pendentesCount <= 1) setShowReativarDialog(true);
                } catch (err) {
                  toast.error(`Erro: ${err instanceof Error ? err.message : 'Falha ao confirmar pagamento'}`);
                } finally {
                  setComprovanteLoading(false);
                }
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    )}

    {/* ── Modal: Visualizar Comprovante ──── */}
    {viewComprovanteUrl && (
      <Dialog open onOpenChange={() => setViewComprovanteUrl(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Image className="w-5 h-5" />
              Comprovante de Pagamento
            </DialogTitle>
          </DialogHeader>
          <img src={viewComprovanteUrl} alt="Comprovante" className="w-full rounded-lg border" />
        </DialogContent>
      </Dialog>
    )}

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
    </>
  );
}
