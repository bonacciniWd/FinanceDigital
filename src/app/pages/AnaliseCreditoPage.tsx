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
import { useState, useMemo } from 'react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Skeleton } from '../components/ui/skeleton';
import { Search, CheckCircle, XCircle, Clock, AlertTriangle, FileText, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { useAnalises, useCreateAnalise, useUpdateAnalise } from '../hooks/useAnaliseCredito';
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
    clienteNome: '',
    cpf: '',
    valorSolicitado: '',
    rendaMensal: '',
    scoreSerasa: '',
  });

  // ── React Query ──────────────────────────────────────────
  const { data: analises, isLoading, isError } = useAnalises();
  const createMutation = useCreateAnalise();
  const updateMutation = useUpdateAnalise();

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
  const handleAprovar = (analise: AnaliseCredito) => {
    updateMutation.mutate(
      { id: analise.id, updates: { status: 'aprovado' } },
      {
        onSuccess: () => {
          toast.success(`Análise de ${analise.clienteNome} aprovada!`);
          setSelectedAnalise(null);
        },
        onError: (err) => toast.error(`Erro ao aprovar: ${err.message}`),
      }
    );
  };

  const handleIniciarRecusa = (analise: AnaliseCredito) => {
    setAnaliseParaRecusar(analise);
    setMotivoRecusa('');
    setShowRecusaDialog(true);
  };

  const handleConfirmarRecusa = () => {
    if (!analiseParaRecusar) return;
    updateMutation.mutate(
      { id: analiseParaRecusar.id, updates: { status: 'recusado', motivo: motivoRecusa || null } },
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

  const handleNovaAnalise = () => {
    if (!formNova.clienteNome || !formNova.cpf || !formNova.valorSolicitado || !formNova.rendaMensal || !formNova.scoreSerasa) {
      toast.error('Preencha todos os campos obrigatórios.');
      return;
    }
    createMutation.mutate(
      {
        cliente_nome: formNova.clienteNome,
        cpf: formNova.cpf,
        valor_solicitado: parseFloat(formNova.valorSolicitado),
        renda_mensal: parseFloat(formNova.rendaMensal),
        score_serasa: parseInt(formNova.scoreSerasa),
      },
      {
        onSuccess: () => {
          toast.success('Análise criada com sucesso!');
          setShowNovaAnalise(false);
          setFormNova({ clienteNome: '', cpf: '', valorSolicitado: '', rendaMensal: '', scoreSerasa: '' });
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
                  <th className="text-center py-3 font-medium text-muted-foreground">Score Serasa</th>
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
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Modal Detalhes */}
      <Dialog open={!!selectedAnalise} onOpenChange={() => setSelectedAnalise(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Análise — {selectedAnalise?.clienteNome}</DialogTitle>
          </DialogHeader>
          {selectedAnalise && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-sm text-muted-foreground">CPF</span>
                  <p className="font-medium">{selectedAnalise.cpf}</p>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Renda Mensal</span>
                  <p className="font-medium">{formatCurrency(selectedAnalise.rendaMensal)}</p>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Valor Solicitado</span>
                  <p className="font-medium">{formatCurrency(selectedAnalise.valorSolicitado)}</p>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Comprometimento</span>
                  <p className="font-medium">
                    {((selectedAnalise.valorSolicitado / 12) / selectedAnalise.rendaMensal * 100).toFixed(1)}%
                  </p>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Score Serasa</span>
                  <p className={`font-bold text-lg ${selectedAnalise.scoreSerasa >= 700 ? 'text-green-600' : selectedAnalise.scoreSerasa >= 500 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {selectedAnalise.scoreSerasa}
                  </p>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Status</span>
                  <div className="mt-1">{getStatusBadge(selectedAnalise.status)}</div>
                </div>
              </div>

              {selectedAnalise.motivo && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                  <p className="text-sm text-red-800 dark:text-red-400">
                    <strong>Motivo da Recusa:</strong> {selectedAnalise.motivo}
                  </p>
                </div>
              )}

              {(selectedAnalise.status === 'pendente' || selectedAnalise.status === 'em_analise') && (
                <div className="flex gap-3">
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    onClick={() => handleAprovar(selectedAnalise)}
                    disabled={updateMutation.isPending}
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Aprovar
                  </Button>
                  <Button
                    className="flex-1"
                    variant="destructive"
                    onClick={() => handleIniciarRecusa(selectedAnalise)}
                    disabled={updateMutation.isPending}
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Recusar
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

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
                onChange={(e) => setFormNova({ ...formNova, cpf: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="valor">Valor Solicitado *</Label>
                <Input
                  id="valor"
                  type="number"
                  placeholder="10000"
                  value={formNova.valorSolicitado}
                  onChange={(e) => setFormNova({ ...formNova, valorSolicitado: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="renda">Renda Mensal *</Label>
                <Input
                  id="renda"
                  type="number"
                  placeholder="5500"
                  value={formNova.rendaMensal}
                  onChange={(e) => setFormNova({ ...formNova, rendaMensal: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="score">Score Serasa *</Label>
              <Input
                id="score"
                type="number"
                placeholder="0 a 1000"
                min={0}
                max={1000}
                value={formNova.scoreSerasa}
                onChange={(e) => setFormNova({ ...formNova, scoreSerasa: e.target.value })}
              />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowNovaAnalise(false)}>
                Cancelar
              </Button>
              <Button
                className="flex-1 bg-primary"
                onClick={handleNovaAnalise}
                disabled={createMutation.isPending}
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
