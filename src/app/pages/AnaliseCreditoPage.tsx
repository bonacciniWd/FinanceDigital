/**
 * @module AnaliseCreditoPage
 * @description Análise de crédito e score dos clientes.
 *
 * Lista solicitações de crédito pendentes com score interno,
 * histórico financeiro e parecer do analista. Permite aprovar,
 * reprovar ou solicitar documentação adicional.
 *
 * Integrado com Supabase via React Query (dual-mode).
 *
 * @route /clientes/analise-credito
 * @access Protegido — perfis admin, gerente, analista
 */
import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Checkbox } from '../components/ui/checkbox';
import { Calendar } from '../components/ui/calendar';
import { ptBR } from 'date-fns/locale/pt-BR';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Skeleton } from '../components/ui/skeleton';
import { Search, CheckCircle, XCircle, Clock, AlertTriangle, FileText, Plus, Shield, Send, CalendarDays, X } from 'lucide-react';
import { toast } from 'sonner';

import { useAnalises, useCreateAnalise, useUpdateAnalise } from '../hooks/useAnaliseCredito';
import { useClientes } from '../hooks/useClientes';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import AnaliseDetalhadaModal from '../components/AnaliseDetalhadaModal';
import type { AnaliseCredito } from '../lib/view-types';

export default function AnaliseCreditoPage() {
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [busca, setBusca] = useState('');
  const [selectedAnalise, setSelectedAnalise] = useState<AnaliseCredito | null>(null);
  const [showNovaAnalise, setShowNovaAnalise] = useState(false);
  const [motivoRecusa, setMotivoRecusa] = useState('');
  const [showRecusaDialog, setShowRecusaDialog] = useState(false);
  const [analiseParaRecusar, setAnaliseParaRecusar] = useState<AnaliseCredito | null>(null);

  // ── Form nova análise ────────────────────────────────────
  const [formNova, setFormNova] = useState({
    clienteId: '' as string,
    clienteNome: '',
    cpf: '',
    valorSolicitado: '',
    valorTotalReceber: '',
    valorParcela: '',
    valoresParcelas: [] as string[],
    rendaMensal: '',
    scoreSerasa: '0',
    numeroParcelas: '',
    periodicidade: 'mensal',
    diaPagamento: '',
    intervaloDias: '',
    diaUtil: false,
    datasPersonalizadas: [] as Date[],
    skipVerification: false,
    skipVerificationReason: '',
  });
  const [buscaCliente, setBuscaCliente] = useState('');
  const [showClienteResults, setShowClienteResults] = useState(false);
  const [pendenciaCliente, setPendenciaCliente] = useState<{ temPendencia: boolean; total: number; emprestimos: Array<{ id: string; valor: number; status: string; parcelas: number; parcelas_pagas: number }> } | null>(null);
  const [verificandoPendencia, setVerificandoPendencia] = useState(false);

  // ── React Query ──────────────────────────────────────────
  const { data: analises, isLoading, isError } = useAnalises();
  const createMutation = useCreateAnalise();
  const updateMutation = useUpdateAnalise();
  const { data: clientes } = useClientes();
  const { user } = useAuth();

  const formatCpf = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  };

  const formatBRL = (v: string) => {
    const num = v.replace(/\D/g, '');
    if (!num) return '';
    const cents = parseInt(num);
    return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const parseBRL = (v: string) => {
    const num = v.replace(/\./g, '').replace(',', '.');
    return parseFloat(num) || 0;
  };

  // ── Verificar pendências do cliente ──────────────────────
  const verificarPendencias = useCallback(async (clienteId?: string, cpf?: string) => {
    if (!clienteId && !cpf) { setPendenciaCliente(null); return; }
    setVerificandoPendencia(true);
    try {
      let result: {
        tem_pendencia: boolean;
        total_emprestimos_pendentes: number;
        emprestimos?: Array<{ id: string; valor: number; status: string; parcelas: number; parcelas_pagas: number }>;
      } | null = null;
      if (clienteId) {
        const { data, error } = await (supabase as any).rpc('verificar_pendencias_cliente_id', { p_cliente_id: clienteId });
        if (error) throw error;
        result = data;
      } else {
        const { data, error } = await (supabase as any).rpc('verificar_pendencias_cliente', { p_cpf: cpf });
        if (error) throw error;
        result = data;
      }
      if (result) {
        setPendenciaCliente({
          temPendencia: result.tem_pendencia,
          total: result.total_emprestimos_pendentes,
          emprestimos: result.emprestimos || [],
        });
      }
    } catch {
      setPendenciaCliente(null);
    } finally {
      setVerificandoPendencia(false);
    }
  }, []);

  // ── Enviar Link de Verificação via WhatsApp ──────────────
  const [sendingLink, setSendingLink] = useState(false);
  const handleSendMagicLink = async (analiseId: string) => {
    if (!user || sendingLink) return;
    setSendingLink(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-verification-link', {
        body: { analise_id: analiseId },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success(data.message || 'Link de verificação enviado via WhatsApp!');
      } else {
        toast.error(data?.error || 'Erro ao enviar link de verificação.');
      }
    } catch (err: any) {
      toast.error(`Erro ao enviar link: ${err.message}`);
    } finally {
      setSendingLink(false);
    }
  };

  const clientesFiltrados = useMemo(() => {
    if (!clientes || !buscaCliente.trim()) return [];
    const q = buscaCliente.toLowerCase();
    return clientes.filter(
      (c) => c.nome.toLowerCase().includes(q) || (c.cpf && c.cpf.includes(q))
    ).slice(0, 8);
  }, [clientes, buscaCliente]);

  // ── Filtros ──────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!analises) return [];
    let result = analises;
    if (filtroStatus !== 'todos') {
      result = result.filter((a) => a.status === filtroStatus);
    }
    if (busca.trim()) {
      const q = busca.toLowerCase();
      result = result.filter(
        (a) => a.clienteNome.toLowerCase().includes(q) || a.cpf.includes(q)
      );
    }
    return result;
  }, [analises, filtroStatus, busca]);

  // ── Métricas dinâmicas ───────────────────────────────────
  const metricas = useMemo(() => {
    if (!analises) return { pendentes: 0, emAnalise: 0, aprovados: 0, recusados: 0 };
    return {
      pendentes: analises.filter((a) => a.status === 'pendente').length,
      emAnalise: analises.filter((a) => a.status === 'em_analise').length,
      aprovados: analises.filter((a) => a.status === 'aprovado').length,
      recusados: analises.filter((a) => a.status === 'recusado').length,
    };
  }, [analises]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { label: string; className: string }> = {
      pendente: { label: 'Pendente', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
      em_analise: { label: 'Em Análise', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
      aprovado: { label: 'Aprovado', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
      recusado: { label: 'Recusado', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
    };
    const c = configs[status];
    return <Badge className={c.className}>{c.label}</Badge>;
  };

  // ── Ações ────────────────────────────────────────────────
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const handleAprovar = async (analise: AnaliseCredito) => {
    setApprovingId(analise.id);
    try {
      // pix_key é lido automaticamente da tabela clientes pelo backend
      const { data, error } = await supabase.functions.invoke('approve-credit', {
        body: {
          analise_id: analise.id,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Erro na aprovação');
      const payoutMsg = data?.payment_status === 'initiated'
        ? 'Desembolso automático iniciado.'
        : 'Crédito aprovado e aguardando desembolso manual.';
      toast.success(`Análise de ${analise.clienteNome} aprovada! ${data.parcelas_geradas} parcela(s) criada(s). ${payoutMsg}`);
      setSelectedAnalise(null);
      // Invalidate relevant caches
      updateMutation.reset();
    } catch (err: any) {
      toast.error(`Erro ao aprovar: ${err.message}`);
    } finally {
      setApprovingId(null);
    }
  };

  const handleIniciarRecusa = (analise: AnaliseCredito) => {
    setAnaliseParaRecusar(analise);
    setMotivoRecusa('');
    setShowRecusaDialog(true);
  };

  const handleConfirmarRecusa = () => {
    if (!analiseParaRecusar) return;
    updateMutation.mutate(
      { id: analiseParaRecusar.id, updates: { status: 'recusado', motivo: motivoRecusa || null, data_resultado: new Date().toISOString() } },
      {
        onSuccess: () => {
          toast.success(`Análise de ${analiseParaRecusar.clienteNome} recusada.`);
          setShowRecusaDialog(false);
          setAnaliseParaRecusar(null);
          setSelectedAnalise(null);
        },
        onError: (err) => toast.error(`Erro: ${err.message}`),
      }
    );
  };

  const handleIniciarAnalise = (analise: AnaliseCredito) => {
    updateMutation.mutate(
      { id: analise.id, updates: { status: 'em_analise' } },
      {
        onSuccess: () => toast.success(`Análise de ${analise.clienteNome} iniciada.`),
        onError: (err) => toast.error(`Erro: ${err.message}`),
      }
    );
  };

  // ── (Desembolso migrou para PagamentosWooviPage) ─────────────────────────

  const handleNovaAnalise = () => {
    if (!formNova.clienteNome || !formNova.cpf || !formNova.valorSolicitado) {
      toast.error('Preencha todos os campos obrigatórios.');
      return;
    }
    if (pendenciaCliente?.temPendencia) {
      toast.warning(`Atenção: cliente possui ${pendenciaCliente.total} empréstimo(s) ativo(s). A análise será criada mesmo assim.`);
    }
    createMutation.mutate(
      {
        cliente_id: formNova.clienteId || null,
        cliente_nome: formNova.clienteNome,
        cpf: formNova.cpf,
        valor_solicitado: parseBRL(formNova.valorSolicitado),
        valor_total_receber: formNova.valorTotalReceber ? parseBRL(formNova.valorTotalReceber) : null,
        valor_parcela: formNova.valorParcela ? parseBRL(formNova.valorParcela) : null,
        valores_parcelas: formNova.valoresParcelas.length > 0 && formNova.valoresParcelas.every(v => v && parseBRL(v) > 0)
          ? formNova.valoresParcelas.map(v => parseBRL(v))
          : null,
        skip_verification: formNova.skipVerification,
        skip_verification_reason: formNova.skipVerification ? (formNova.skipVerificationReason || null) : null,
        renda_mensal: formNova.rendaMensal ? parseBRL(formNova.rendaMensal) : 0,
        score_serasa: parseInt(formNova.scoreSerasa),
        numero_parcelas: formNova.numeroParcelas ? parseInt(formNova.numeroParcelas) : null,
        periodicidade: formNova.periodicidade || 'mensal',
        dia_pagamento: formNova.diaPagamento ? parseInt(formNova.diaPagamento) : null,
        intervalo_dias: formNova.intervaloDias ? parseInt(formNova.intervaloDias) : null,
        dia_util: formNova.diaUtil,
        datas_personalizadas: formNova.datasPersonalizadas.length > 0
          ? JSON.stringify(formNova.datasPersonalizadas.map(d => d.toISOString().split('T')[0]).sort())
          : null,
      },
      {
        onSuccess: async (created: { id: string } | undefined) => {
          const skipAutoApprove = formNova.skipVerification;
          toast.success(skipAutoApprove ? 'Análise criada — auto-aprovando (verificação pulada)...' : 'Análise criada com sucesso!');
          setShowNovaAnalise(false);
          setFormNova({ clienteId: '', clienteNome: '', cpf: '', valorSolicitado: '', valorTotalReceber: '', valorParcela: '', valoresParcelas: [], rendaMensal: '', scoreSerasa: '0', numeroParcelas: '', periodicidade: 'mensal', diaPagamento: '', intervaloDias: '', diaUtil: false, datasPersonalizadas: [], skipVerification: false, skipVerificationReason: '' });
          setPendenciaCliente(null);
          setBuscaCliente('');

          // Se o criador optou por pular verificação, dispara approve-credit imediatamente.
          // Fica registrado em verification_logs (action=credit_approved_skip_verification) e em emprestimos.skip_verification.
          if (skipAutoApprove && created?.id) {
            try {
              const { data, error } = await supabase.functions.invoke('approve-credit', {
                body: { analise_id: created.id },
              });
              if (error) throw error;
              if (!data?.success) throw new Error(data?.error || 'Erro na auto-aprovação');
              toast.success(`Auto-aprovação concluída — ${data.parcelas_geradas} parcela(s) criada(s).`);
            } catch (err) {
              toast.error(`Análise criada, mas auto-aprovação falhou: ${(err as Error).message}`);
            }
          }
        },
        onError: (err) => toast.error(`Erro ao criar análise: ${err.message}`),
      }
    );
  };

  // ── Loading / Error ──────────────────────────────────────
  if (isError) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-destructive">Erro ao carregar análises de crédito.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Análise de Crédito</h1>
          <p className="text-muted-foreground mt-1">
            {isLoading ? '...' : `${filtered.length} solicitação(ões) encontrada(s)`}
          </p>
        </div>
        <Button className="bg-primary hover:bg-primary/90" onClick={() => setShowNovaAnalise(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Nova Análise
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="em_analise">Em Análise</SelectItem>
                <SelectItem value="aprovado">Aprovado</SelectItem>
                <SelectItem value="recusado">Recusado</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex-1 min-w-64">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou CPF..."
                  className="pl-10"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cards Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6 text-center">
                <Skeleton className="w-8 h-8 mx-auto mb-2 rounded-full" />
                <Skeleton className="h-8 w-12 mx-auto mb-1" />
                <Skeleton className="h-4 w-20 mx-auto" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <Card>
              <CardContent className="pt-6 text-center">
                <Clock className="w-8 h-8 mx-auto text-yellow-500 mb-2" />
                <div className="text-2xl font-bold">{metricas.pendentes}</div>
                <p className="text-sm text-muted-foreground">Pendentes</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <AlertTriangle className="w-8 h-8 mx-auto text-blue-500 mb-2" />
                <div className="text-2xl font-bold">{metricas.emAnalise}</div>
                <p className="text-sm text-muted-foreground">Em Análise</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <CheckCircle className="w-8 h-8 mx-auto text-green-500 mb-2" />
                <div className="text-2xl font-bold">{metricas.aprovados}</div>
                <p className="text-sm text-muted-foreground">Aprovados</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <XCircle className="w-8 h-8 mx-auto text-red-500 mb-2" />
                <div className="text-2xl font-bold">{metricas.recusados}</div>
                <p className="text-sm text-muted-foreground">Recusados</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Tabela */}
      <Card>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 font-medium text-muted-foreground">Cliente</th>
                  <th className="text-left py-3 font-medium text-muted-foreground">CPF</th>
                  <th className="text-right py-3 font-medium text-muted-foreground">Valor Solicitado</th>
                  <th className="text-right py-3 font-medium text-muted-foreground">Renda</th>
                  <th className="text-center py-3 font-medium text-muted-foreground">Score</th>
                  <th className="text-center py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-center py-3 font-medium text-muted-foreground">Data</th>
                  <th className="text-center py-3 font-medium text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="py-3"><Skeleton className="h-5 w-full" /></td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-muted-foreground">
                      Nenhuma análise encontrada.
                    </td>
                  </tr>
                ) : (
                  filtered.map((a) => (
                    <tr key={a.id} className="border-b hover:bg-muted/50">
                      <td className="py-3 font-medium">{a.clienteNome}</td>
                      <td className="py-3 text-muted-foreground">{a.cpf}</td>
                      <td className="py-3 text-right font-medium">{formatCurrency(a.valorSolicitado)}</td>
                      <td className="py-3 text-right">{formatCurrency(a.rendaMensal)}</td>
                      <td className="py-3 text-center">
                        <span className={`font-bold ${a.scoreSerasa >= 700 ? 'text-green-600' : a.scoreSerasa >= 500 ? 'text-yellow-600' : 'text-red-600'}`}>
                          {a.scoreSerasa}
                        </span>
                      </td>
                      <td className="py-3 text-center">{getStatusBadge(a.status)}</td>
                      <td className="py-3 text-center text-muted-foreground">
                        {new Date(a.dataSolicitacao).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="py-3 text-center space-x-1">
                        <Button size="sm" variant="outline" onClick={() => setSelectedAnalise(a)}>
                          <FileText className="w-4 h-4" />
                        </Button>
                        {a.status === 'pendente' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-blue-600"
                            onClick={() => handleIniciarAnalise(a)}
                            disabled={updateMutation.isPending}
                          >
                            Iniciar
                          </Button>
                        )}
                        {(a.status === 'pendente' || a.status === 'em_analise') && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-purple-600"
                            onClick={() => handleSendMagicLink(a.id)}
                            disabled={sendingLink}
                            title="Solicitar verificação de identidade"
                          >
                            <Shield className="w-4 h-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Controle de Desembolso migrado para /pagamentos-woovi */}

      {/* Modal Detalhes (com verificação de identidade) */}
      <AnaliseDetalhadaModal
        analise={selectedAnalise}
        open={!!selectedAnalise}
        onClose={() => setSelectedAnalise(null)}
        onSendMagicLink={handleSendMagicLink}
      />

      {/* Modal Recusa com Motivo */}
      <Dialog open={showRecusaDialog} onOpenChange={setShowRecusaDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Recusar Análise — {analiseParaRecusar?.clienteNome}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="motivo">Motivo da Recusa (opcional)</Label>
              <Textarea
                id="motivo"
                placeholder="Ex.: Score abaixo do mínimo, comprometimento de renda elevado..."
                value={motivoRecusa}
                onChange={(e) => setMotivoRecusa(e.target.value)}
                rows={3}
              />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowRecusaDialog(false)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handleConfirmarRecusa}
                disabled={updateMutation.isPending}
              >
                Confirmar Recusa
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Nova Análise */}
      <Dialog open={showNovaAnalise} onOpenChange={setShowNovaAnalise}>
        <DialogContent className="min-w-[700px]">
          <DialogHeader>
            <DialogTitle>Nova Análise de Crédito</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Busca de cliente existente */}
            <div className="relative">
              <Label>Buscar Cliente (nome ou CPF)</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Digite nome ou CPF para buscar..."
                  className="pl-8"
                  value={buscaCliente}
                  onChange={(e) => {
                    setBuscaCliente(e.target.value);
                    setShowClienteResults(true);
                  }}
                  onFocus={() => buscaCliente.trim() && setShowClienteResults(true)}
                />
              </div>
              {showClienteResults && clientesFiltrados.length > 0 && (
                <div className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto">
                  {clientesFiltrados.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center justify-between"
                      onClick={() => {
                        const cpfFormatted = c.cpf ? formatCpf(c.cpf) : '';
                        const rendaStr = c.rendaMensal ? (c.rendaMensal).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '';
                        setFormNova({ ...formNova, clienteId: c.id, clienteNome: c.nome, cpf: cpfFormatted, rendaMensal: rendaStr, scoreSerasa: String(c.scoreInterno ?? '') });
                        setBuscaCliente('');
                        setShowClienteResults(false);
                        verificarPendencias(c.id);
                      }}
                    >
                      <span className="font-medium truncate">{c.nome}</span>
                      <span className="text-muted-foreground text-xs ml-2 shrink-0">{c.cpf ?? '—'}</span>
                    </button>
                  ))}
                </div>
              )}
              {showClienteResults && buscaCliente.trim() && clientesFiltrados.length === 0 && (
                <div className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-lg px-3 py-2 text-sm text-muted-foreground">
                  Nenhum cliente encontrado
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="nome">Nome do Cliente *</Label>
              <Input
                id="nome"
                placeholder="Nome completo"
                value={formNova.clienteNome}
                onChange={(e) => setFormNova({ ...formNova, clienteNome: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="cpfNovo">CPF *</Label>
              <Input
                id="cpfNovo"
                placeholder="000.000.000-00"
                value={formNova.cpf}
                onChange={(e) => { setFormNova({ ...formNova, cpf: formatCpf(e.target.value) }); setPendenciaCliente(null); }}
                onBlur={() => { if (formNova.cpf.replace(/\D/g, '').length >= 11 && !formNova.clienteId) verificarPendencias(undefined, formNova.cpf); }}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="valor">Valor Solicitado * <span className="text-[10px] text-muted-foreground font-normal">(PIX para o cliente)</span></Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2  text-sm">R$</span>
                  <Input
                    id="valor"
                    className="pl-10"
                    placeholder="1.000,00"
                    value={formNova.valorSolicitado}
                    onChange={(e) => setFormNova({ ...formNova, valorSolicitado: formatBRL(e.target.value) })}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="valorTotalReceber">Valor a Receber (Total) <span className="text-[10px] text-muted-foreground font-normal">(quanto volta pra nós)</span></Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm">R$</span>
                  <Input
                    id="valorTotalReceber"
                    className="pl-10"
                    placeholder="1.400,00"
                    value={formNova.valorTotalReceber}
                    onChange={(e) => {
                      const novoTotal = formatBRL(e.target.value);
                      const n = parseInt(formNova.numeroParcelas || '0');
                      const totalNum = parseBRL(novoTotal);
                      const novaParcela = n > 0 && totalNum > 0
                        ? (totalNum / n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : formNova.valorParcela;
                      setFormNova({ ...formNova, valorTotalReceber: novoTotal, valorParcela: novaParcela });
                    }}
                  />
                </div>
              </div>
            </div>
            <div>
              <Label htmlFor="renda">Renda Mensal</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm">R$</span>
                <Input
                  id="renda"
                  className="pl-10"
                  placeholder="5.500,00"
                  value={formNova.rendaMensal}
                  onChange={(e) => setFormNova({ ...formNova, rendaMensal: formatBRL(e.target.value) })}
                />
              </div>
            </div>


            {/* ── Alerta de pendências ──────────────── */}
            {verificandoPendencia && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted text-sm text-muted-foreground">
                <Clock className="h-4 w-4 animate-spin" /> Verificando pendências do cliente...
              </div>
            )}
            {pendenciaCliente?.temPendencia && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                    Atenção — {pendenciaCliente.total} empréstimo(s) ativo(s)
                  </p>
                  <p className="text-xs text-amber-600/80 dark:text-amber-400/70 mt-1">
                    Este cliente já possui empréstimos em andamento. A análise pode ser criada normalmente, mas o admin/gerência será notificado.
                  </p>
                  <div className="mt-2 space-y-1">
                    {pendenciaCliente.emprestimos.map((emp) => (
                      <div key={emp.id} className="text-xs text-amber-700/70 dark:text-amber-400/60 flex items-center gap-2">
                        <span>•</span>
                        <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(emp.valor)}</span>
                        <Badge variant="outline" className="text-[10px] h-4 px-1">{emp.status}</Badge>
                        <span className="text-muted-foreground">({emp.parcelas_pagas}/{emp.parcelas} pagas)</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Configuração de Parcelas ────────────── */}
            <div className="border-t pt-4 mt-2">
              <p className="text-sm font-medium text-muted-foreground mb-3">Configuração de Parcelas (opcional)</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label htmlFor="numParcelas">Nº Parcelas</Label>
                  <Input
                    id="numParcelas"
                    type="number"
                    placeholder="Ex: 4"
                    min={1}
                    max={60}
                    value={formNova.numeroParcelas}
                    onChange={(e) => {
                      const novoN = e.target.value;
                      const n = parseInt(novoN || '0');
                      let novaParcela = formNova.valorParcela;
                      let novoTotal = formNova.valorTotalReceber;
                      const totalNum = parseBRL(formNova.valorTotalReceber);
                      const parcelaNum = parseBRL(formNova.valorParcela);
                      if (n > 0 && totalNum > 0) {
                        novaParcela = (totalNum / n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                      } else if (n > 0 && parcelaNum > 0) {
                        novoTotal = (parcelaNum * n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                      }
                      setFormNova({ ...formNova, numeroParcelas: novoN, valorParcela: novaParcela, valorTotalReceber: novoTotal });
                    }}
                  />
                </div>
                <div>
                  <Label htmlFor="valorParcela">Valor da Parcela <span className="text-[10px] text-muted-foreground font-normal">(manual)</span></Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm">R$</span>
                    <Input
                      id="valorParcela"
                      className="pl-10"
                      placeholder="250,00"
                      value={formNova.valorParcela}
                      onChange={(e) => {
                        const novaParcela = formatBRL(e.target.value);
                        const n = parseInt(formNova.numeroParcelas || '0');
                        const parcelaNum = parseBRL(novaParcela);
                        const novoTotal = n > 0 && parcelaNum > 0
                          ? (parcelaNum * n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                          : formNova.valorTotalReceber;
                        setFormNova({ ...formNova, valorParcela: novaParcela, valorTotalReceber: novoTotal });
                      }}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="periodicidade">Periodicidade</Label>
                  <Select value={formNova.periodicidade} onValueChange={(v) => setFormNova({ ...formNova, periodicidade: v, diaPagamento: '', intervaloDias: '', datasPersonalizadas: [] })}>
                    <SelectTrigger id="periodicidade">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="diario">Diário</SelectItem>
                      <SelectItem value="semanal">Semanal</SelectItem>
                      <SelectItem value="quinzenal">Quinzenal</SelectItem>
                      <SelectItem value="mensal">Mensal</SelectItem>
                      <SelectItem value="personalizado">Personalizado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Campos dinâmicos por periodicidade */}
              {formNova.periodicidade === 'semanal' && (
                <div className="mt-3">
                  <Label htmlFor="diaPagamento">Dia da Semana</Label>
                  <Select value={formNova.diaPagamento} onValueChange={(v) => setFormNova({ ...formNova, diaPagamento: v })}>
                    <SelectTrigger id="diaPagamento">
                      <SelectValue placeholder="Escolha..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Segunda-feira</SelectItem>
                      <SelectItem value="2">Terça-feira</SelectItem>
                      <SelectItem value="3">Quarta-feira</SelectItem>
                      <SelectItem value="4">Quinta-feira</SelectItem>
                      <SelectItem value="5">Sexta-feira</SelectItem>
                      <SelectItem value="6">Sábado</SelectItem>
                      <SelectItem value="0">Domingo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {(formNova.periodicidade === 'quinzenal' || formNova.periodicidade === 'mensal') && (
                <div className="mt-3">
                  <Label htmlFor="diaPagamento">Dia do Mês</Label>
                  <Input
                    id="diaPagamento"
                    type="number"
                    placeholder={formNova.periodicidade === 'mensal' ? '1 a 31' : '1 a 15'}
                    min={1}
                    max={formNova.periodicidade === 'mensal' ? 31 : 15}
                    value={formNova.diaPagamento}
                    onChange={(e) => setFormNova({ ...formNova, diaPagamento: e.target.value })}
                  />
                </div>
              )}

              {formNova.periodicidade === 'personalizado' && (
                <div className="mt-3 space-y-3">
                  <div>
                    <Label htmlFor="intervaloDias">Intervalo entre parcelas (dias)</Label>
                    <Input
                      id="intervaloDias"
                      type="number"
                      placeholder="Ex: 23"
                      min={1}
                      max={365}
                      value={formNova.intervaloDias}
                      onChange={(e) => setFormNova({ ...formNova, intervaloDias: e.target.value })}
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">Deixe vazio se for informar datas específicas abaixo</p>
                  </div>
                  <div>
                    <Label>Datas específicas de vencimento</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start text-left font-normal mt-1">
                          <CalendarDays className="mr-2 h-4 w-4" />
                          {formNova.datasPersonalizadas.length > 0
                            ? `${formNova.datasPersonalizadas.length} data(s) selecionada(s)`
                            : 'Selecione as datas...'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="multiple"
                          selected={formNova.datasPersonalizadas}
                          onSelect={(dates) => setFormNova({ ...formNova, datasPersonalizadas: dates || [] })}
                          disabled={{ before: new Date() }}
                          locale={ptBR}
                        />
                      </PopoverContent>
                    </Popover>
                    {formNova.datasPersonalizadas.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {formNova.datasPersonalizadas
                          .sort((a, b) => a.getTime() - b.getTime())
                          .map((date, i) => (
                            <Badge key={i} variant="destructive" className="text-xs gap-1">
                              {date.toLocaleDateString('pt-BR')}
                              <X
                                className="h-3 w-3 cursor-pointer hover:text-destructive"
                                onClick={() => setFormNova({
                                  ...formNova,
                                  datasPersonalizadas: formNova.datasPersonalizadas.filter((_, idx) => idx !== i)
                                })}
                              />
                            </Badge>
                          ))}
                      </div>
                    )}
                    <p className="text-[11px] text-muted-foreground mt-1">Se preenchido, estas datas têm prioridade sobre o intervalo</p>
                  </div>
                </div>
              )}

              {/* Checkbox dia útil — visível para todos exceto diário */}
              {formNova.periodicidade !== 'diario' && (
                <div className="flex items-center gap-2 mt-3">
                  <Checkbox
                    id="diaUtil"
                    checked={formNova.diaUtil}
                    onCheckedChange={(v) => setFormNova({ ...formNova, diaUtil: !!v })}
                  />
                  <Label htmlFor="diaUtil" className="text-sm font-normal cursor-pointer">
                    Considerar apenas dias úteis (ajusta vencimentos para o próximo dia útil)
                  </Label>
                </div>
              )}

              {/* Valores individuais por parcela (opcional) */}
              {formNova.numeroParcelas && parseInt(formNova.numeroParcelas) > 0 && parseInt(formNova.numeroParcelas) <= 60 && (() => {
                const n = parseInt(formNova.numeroParcelas);
                const base = parseBRL(formNova.valorParcela) || (parseBRL(formNova.valorTotalReceber) > 0 ? parseBRL(formNova.valorTotalReceber) / n : 0);
                const formatValor = (v: number) => v > 0 ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
                const valores = Array.from({ length: n }, (_, i) => formNova.valoresParcelas[i] ?? formatValor(base));
                const somaAtual = valores.reduce((s, v) => s + parseBRL(v || '0'), 0);
                return (
                  <div className="mt-4 p-3 rounded-lg border border-dashed">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium text-muted-foreground">Valores individuais por parcela <span className="font-normal">(opcional — permite cobrar valores diferentes em cada parcela)</span></p>
                      <button
                        type="button"
                        className="text-[11px] text-muted-foreground hover:text-foreground underline"
                        onClick={() => setFormNova({ ...formNova, valoresParcelas: [] })}
                      >
                        Resetar
                      </button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {valores.map((v, i) => (
                        <div key={i}>
                          <Label htmlFor={`parcela-${i}`} className="text-[11px]">Parcela {i + 1}</Label>
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                            <Input
                              id={`parcela-${i}`}
                              className="pl-8 h-8 text-sm"
                              placeholder="0,00"
                              value={v}
                              onChange={(e) => {
                                const novo = formatBRL(e.target.value);
                                const novoArray = [...valores];
                                novoArray[i] = novo;
                                const novaSoma = novoArray.reduce((s, x) => s + parseBRL(x || '0'), 0);
                                setFormNova({
                                  ...formNova,
                                  valoresParcelas: novoArray,
                                  valorTotalReceber: novaSoma > 0 ? novaSoma.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : formNova.valorTotalReceber,
                                });
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-2">
                      Soma atual: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(somaAtual)}
                    </p>
                  </div>
                );
              })()}

              {/* Simulação */}
              {formNova.numeroParcelas && (formNova.valorParcela || formNova.valorTotalReceber || formNova.valorSolicitado) && (() => {
                const n = parseInt(formNova.numeroParcelas || '0');
                const parcelaNum = parseBRL(formNova.valorParcela);
                const totalNum = parseBRL(formNova.valorTotalReceber);
                const solicitadoNum = parseBRL(formNova.valorSolicitado);
                const parcelaCalc = parcelaNum > 0
                  ? parcelaNum
                  : totalNum > 0
                    ? totalNum / n
                    : solicitadoNum / n;
                const totalCalc = parcelaCalc * n;
                const lucro = totalCalc - solicitadoNum;
                const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
                return (
                  <p className="text-xs text-muted-foreground mt-2">
                    Simulação: {n}x de {fmt(parcelaCalc)}
                    {formNova.periodicidade === 'diario' ? ' (diárias)' : formNova.periodicidade === 'semanal' ? ' (semanais)' : formNova.periodicidade === 'quinzenal' ? ' (quinzenais)' : formNova.periodicidade === 'personalizado' ? (formNova.intervaloDias ? ` (a cada ${formNova.intervaloDias} dia${formNova.intervaloDias !== '1' ? 's' : ''})` : ' (datas personalizadas)') : ' (mensais)'}
                    {formNova.diaUtil ? ' — dias úteis' : ''}
                    {' '}— total a receber {fmt(totalCalc)}
                    {solicitadoNum > 0 && lucro > 0 ? ` (lucro ${fmt(lucro)})` : ''}
                    {' '}— juros de mora apenas em caso de atraso
                  </p>
                );
              })()}
            </div>

            {/* ── Pular verificação de identidade (auto-aprova) ─────── */}
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 space-y-2">
              <div className="flex items-start gap-2">
                <Checkbox
                  id="skipVerification"
                  checked={formNova.skipVerification}
                  onCheckedChange={(v) => setFormNova({ ...formNova, skipVerification: !!v })}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <Label htmlFor="skipVerification" className="text-sm font-medium cursor-pointer flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                    Pular link de verificação (auto-aprovar)
                  </Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    A análise será aprovada imediatamente, sem vídeo-selfie nem validação de documentos.
                    Use apenas com clientes de confiança.
                  </p>
                </div>
              </div>
              {formNova.skipVerification && (
                <div>
                  <Label htmlFor="skipReason" className="text-[11px] text-muted-foreground">Motivo (opcional, visível ao admin)</Label>
                  <Input
                    id="skipReason"
                    className="h-8 text-sm"
                    placeholder="Ex: cliente recorrente, já verificado em análise anterior..."
                    value={formNova.skipVerificationReason}
                    onChange={(e) => setFormNova({ ...formNova, skipVerificationReason: e.target.value })}
                  />
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => { setShowNovaAnalise(false); setPendenciaCliente(null); }}>
                Cancelar
              </Button>
              <Button
                className="flex-1 bg-primary"
                onClick={handleNovaAnalise}
                disabled={createMutation.isPending || verificandoPendencia}
              >
                {createMutation.isPending ? 'Criando...' : 'Criar Análise'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
