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
import { Search, CheckCircle, XCircle, Clock, AlertTriangle, FileText, Plus, Shield, Send, CalendarDays, X, Banknote, DollarSign } from 'lucide-react';
import { toast } from 'sonner';

import { useAnalises, useCreateAnalise, useUpdateAnalise } from '../hooks/useAnaliseCredito';
import { useClientes } from '../hooks/useClientes';
import { useEmprestimos } from '../hooks/useEmprestimos';
import { useConfigSistema } from '../hooks/useConfigSistema';
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
    rendaMensal: '',
    scoreSerasa: '0',
    numeroParcelas: '',
    periodicidade: 'mensal',
    diaPagamento: '',
    intervaloDias: '',
    diaUtil: false,
    datasPersonalizadas: [] as Date[],
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
  const { data: emprestimos = [] } = useEmprestimos();
  const { data: configSistema } = useConfigSistema();
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

  // ── Desembolso manual ────────────────────────────────────
  const [markingDesembolso, setMarkingDesembolso] = useState<string | null>(null);
  const isAdminGerencia = user?.role === 'admin' || user?.role === 'gerencia';

  const handleMarcarDesembolsado = async (emprestimoId: string) => {
    setMarkingDesembolso(emprestimoId);
    try {
      const { error } = await (supabase.from('emprestimos') as any)
        .update({ desembolsado: true, desembolsado_em: new Date().toISOString(), desembolsado_por: user?.id })
        .eq('id', emprestimoId);
      if (error) throw error;
      toast.success('Empréstimo marcado como desembolsado!');
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setMarkingDesembolso(null);
    }
  };

  // Empréstimos de análises aprovadas que aguardam desembolso
  const emprestimosAprovados = useMemo(() => {
    if (!analises || !emprestimos.length) return [];
    const analisesAprovadas = new Set(analises.filter(a => a.status === 'aprovado').map(a => a.id));
    return emprestimos
      .filter(e => e.analiseId && analisesAprovadas.has(e.analiseId))
      .map(e => {
        const analise = analises.find(a => a.id === e.analiseId);
        return { ...e, clienteNome: analise?.clienteNome ?? e.clienteNome ?? '' };
      });
  }, [analises, emprestimos]);

  const aguardandoEnvio = emprestimosAprovados.filter(e => !e.desembolsado);
  const jaEnviados = emprestimosAprovados.filter(e => e.desembolsado);
  const controleDesembolsoAtivo = configSistema?.controle_desembolso_ativo !== false;
  const totalAguardandoEnvio = aguardandoEnvio.reduce((sum, e) => sum + e.valor, 0);
  const totalJaEnviado = jaEnviados.reduce((sum, e) => sum + e.valor, 0);

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
        onSuccess: () => {
          toast.success('Análise criada com sucesso!');
          setShowNovaAnalise(false);
          setFormNova({ clienteId: '', clienteNome: '', cpf: '', valorSolicitado: '', rendaMensal: '', scoreSerasa: '0', numeroParcelas: '', periodicidade: 'mensal', diaPagamento: '', intervaloDias: '', diaUtil: false, datasPersonalizadas: [] });
          setPendenciaCliente(null);
          setBuscaCliente('');
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

      {/* Controle de Desembolso — admin/gerência */}
      {isAdminGerencia && controleDesembolsoAtivo && emprestimosAprovados.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-4">
              <Banknote className="w-5 h-5 text-primary" />
              <h3 className="font-semibold">Controle de Desembolso</h3>
              <Badge variant="outline" className="ml-auto">{aguardandoEnvio.length} aguardando</Badge>
              <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400">{jaEnviados.length} enviados</Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                <p className="text-xs text-muted-foreground">Valor pendente de envio</p>
                <p className="text-lg font-semibold text-amber-700 dark:text-amber-400">{formatCurrency(totalAguardandoEnvio)}</p>
              </div>
              <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3">
                <p className="text-xs text-muted-foreground">Valor já desembolsado</p>
                <p className="text-lg font-semibold text-green-700 dark:text-green-400">{formatCurrency(totalJaEnviado)}</p>
              </div>
            </div>

            {configSistema?.desembolso_automatico_ativo === false && (
              <div className="mb-4 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 text-sm text-blue-700 dark:text-blue-300">
                O desembolso automático está desligado. Aprovações novas entram aqui para envio manual e conferência do que já foi pago.
              </div>
            )}

            {aguardandoEnvio.length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-medium text-amber-600 dark:text-amber-400 mb-2">⏳ Aguardando Envio do Dinheiro</p>
                <div className="space-y-2">
                  {aguardandoEnvio.map(e => (
                    <div key={e.id} className="flex items-center justify-between p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                      <div>
                        <span className="font-medium">{e.clienteNome}</span>
                        <span className="text-muted-foreground text-sm ml-2">{formatCurrency(e.valor)}</span>
                        <span className="text-muted-foreground text-xs ml-2">{new Date(e.dataContrato).toLocaleDateString('pt-BR')}</span>
                      </div>
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => handleMarcarDesembolsado(e.id)}
                        disabled={markingDesembolso === e.id}
                      >
                        <DollarSign className="w-4 h-4 mr-1" />
                        {markingDesembolso === e.id ? 'Marcando...' : 'Marcar Enviado'}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {jaEnviados.length > 0 && (
              <details className="group">
                <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                  ✅ Já enviados ({jaEnviados.length})
                </summary>
                <div className="mt-2 space-y-1">
                  {jaEnviados.map(e => (
                    <div key={e.id} className="flex items-center justify-between p-2 rounded bg-green-500/5 text-sm">
                      <span>{e.clienteNome} — {formatCurrency(e.valor)}</span>
                      <span className="text-xs text-muted-foreground">{e.desembolsadoEm ? new Date(e.desembolsadoEm).toLocaleDateString('pt-BR') : '—'}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </CardContent>
        </Card>
      )}

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
        <DialogContent className="max-w-md">
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
                <Label htmlFor="valor">Valor Solicitado *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2  text-sm">R$</span>
                  <Input
                    id="valor"
                    className="pl-10"
                    placeholder="10.000,00"
                    value={formNova.valorSolicitado}
                    onChange={(e) => setFormNova({ ...formNova, valorSolicitado: formatBRL(e.target.value) })}
                  />
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="numParcelas">Nº Parcelas</Label>
                  <Input
                    id="numParcelas"
                    type="number"
                    placeholder="Ex: 4"
                    min={1}
                    max={60}
                    value={formNova.numeroParcelas}
                    onChange={(e) => setFormNova({ ...formNova, numeroParcelas: e.target.value })}
                  />
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
                            <Badge key={i} variant="secondary" className="text-xs gap-1">
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

              {/* Simulação */}
              {formNova.numeroParcelas && formNova.valorSolicitado && (
                <p className="text-xs text-muted-foreground mt-2">
                  Simulação: {formNova.numeroParcelas}x de ~{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parseFloat(formNova.valorSolicitado) / parseInt(formNova.numeroParcelas))}
                  {formNova.periodicidade === 'diario' ? ' (diárias)' : formNova.periodicidade === 'semanal' ? ' (semanais)' : formNova.periodicidade === 'quinzenal' ? ' (quinzenais)' : formNova.periodicidade === 'personalizado' ? (formNova.intervaloDias ? ` (a cada ${formNova.intervaloDias} dia${formNova.intervaloDias !== '1' ? 's' : ''})` : ' (datas personalizadas)') : ' (mensais)'}
                  {formNova.diaUtil ? ' — dias úteis' : ''}
                  {' '}— valor final com juros calculado na aprovação
                </p>
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
