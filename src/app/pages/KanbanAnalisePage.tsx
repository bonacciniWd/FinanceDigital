/**
 * @module KanbanAnalisePage
 * @description Kanban de análise de crédito com dados reais do Supabase.
 *
 * Board com colunas derivadas de analise_credito_status:
 * Pendente, Em Análise, Aprovado, Recusado.
 * Cards mostram solicitante, valor, score e data.
 * Drag-and-drop muda status via mutation useUpdateAnalise.
 * Sem dados mock — usa useAnalises.
 *
 * @route /kanban/analise
 * @access Protegido — perfis admin, gerência
 */
import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Search, Loader2, AlertCircle, CheckCircle, XCircle, Clock, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { useAnalises, useUpdateAnalise } from '../hooks/useAnaliseCredito';
import type { AnaliseCredito } from '../lib/view-types';
import type { AnaliseCreditoStatus } from '../lib/database.types';

interface ColumnDef {
  id: AnaliseCreditoStatus;
  title: string;
  dotColor: string;
  icon: React.ReactNode;
}

const COLUMNS: ColumnDef[] = [
  { id: 'pendente', title: 'PENDENTE', dotColor: '#3b82f6', icon: <Clock className="w-4 h-4" /> },
  { id: 'em_analise', title: 'EM ANÁLISE', dotColor: '#a855f7', icon: <FileText className="w-4 h-4" /> },
  { id: 'aprovado', title: 'APROVADO', dotColor: '#22c55e', icon: <CheckCircle className="w-4 h-4" /> },
  { id: 'recusado', title: 'RECUSADO', dotColor: '#ef4444', icon: <XCircle className="w-4 h-4" /> },
];

export default function KanbanAnalisePage() {
  const [selectedAnalise, setSelectedAnalise] = useState<AnaliseCredito | null>(null);
  const [busca, setBusca] = useState('');
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  const { data: allAnalises = [], isLoading, error } = useAnalises();
  const updateAnalise = useUpdateAnalise();

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const filteredAnalises = useMemo(() => {
    if (!busca.trim()) return allAnalises;
    const lower = busca.toLowerCase();
    return allAnalises.filter(
      (a) =>
        a.clienteNome.toLowerCase().includes(lower) ||
        a.cpf.includes(busca)
    );
  }, [allAnalises, busca]);

  const analisesByStatus = useMemo(() => {
    const map: Record<string, AnaliseCredito[]> = {};
    for (const col of COLUMNS) {
      map[col.id] = filteredAnalises.filter((a) => a.status === col.id);
    }
    return map;
  }, [filteredAnalises]);

  const getScoreColor = (score: number) => {
    if (score >= 700) return 'text-green-600 dark:text-green-400';
    if (score >= 500) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const handleDragStart = (e: React.DragEvent, analiseId: string) => {
    e.dataTransfer.setData('analiseId', analiseId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColumn(columnId);
  };

  const handleDrop = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    setDragOverColumn(null);
    const analiseId = e.dataTransfer.getData('analiseId');
    if (!analiseId) return;

    const analise = allAnalises.find((a) => a.id === analiseId);
    if (!analise || analise.status === columnId) return;

    updateAnalise.mutate(
      { id: analiseId, updates: { status: columnId as AnaliseCreditoStatus } },
      {
        onSuccess: () => toast.success(`Análise movida para ${COLUMNS.find((c) => c.id === columnId)?.title}`),
        onError: (err) => toast.error(`Erro ao mover: ${err.message}`),
      }
    );
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <p className="text-destructive font-medium">Erro ao carregar dados</p>
          <p className="text-sm text-muted-foreground mt-1">{(error as Error).message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Kanban - Análise de Crédito</h1>
          <p className="text-muted-foreground mt-1">Acompanhe o fluxo de análise — arraste para mudar status</p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome ou CPF..." className="pl-10" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="ml-3 text-muted-foreground">Carregando análises...</span>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map((col) => {
            const items = analisesByStatus[col.id] || [];
            const isOver = dragOverColumn === col.id;
            return (
              <div key={col.id} className="flex-shrink-0 w-72">
                <Card
                  className={`liquid-metal-column ${isOver ? 'dragging-over' : ''}`}
                  style={{ '--kanban-col-color': `${col.dotColor}88` } as React.CSSProperties}
                  onDragOver={(e) => handleDragOver(e, col.id)}
                  onDragLeave={() => setDragOverColumn(null)}
                  onDrop={(e) => handleDrop(e, col.id)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <span className="kanban-status-dot" style={{ background: col.dotColor, '--dot-color': col.dotColor } as React.CSSProperties} />
                        {col.title}
                      </CardTitle>
                      <Badge variant="secondary" className="font-semibold">{items.length}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 min-h-[80px]">
                    {items.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4 italic">Nenhuma análise</p>
                    )}
                    {items.map((item) => (
                      <Card
                        key={item.id}
                        className="liquid-metal-card cursor-grab active:cursor-grabbing"
                        draggable
                        onDragStart={(e) => handleDragStart(e, item.id)}
                        onClick={() => setSelectedAnalise(item)}
                      >
                        <CardContent className="p-4 space-y-2">
                          <div className="font-semibold text-sm text-foreground">{item.clienteNome}</div>
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{formatCurrency(item.valorSolicitado)}</span>
                            <span>{new Date(item.dataSolicitacao).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className={`text-xs font-bold ${getScoreColor(item.scoreSerasa)}`}>
                              Score: {item.scoreSerasa}
                            </span>
                            {item.rendaMensal > 0 && (
                              <span className="text-xs text-muted-foreground">
                                Renda: {formatCurrency(item.rendaMensal)}
                              </span>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-2xl font-bold text-foreground">{allAnalises.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Aprovadas</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
              {allAnalises.filter((a) => a.status === 'aprovado').length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Recusadas</p>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">
              {allAnalises.filter((a) => a.status === 'recusado').length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Taxa Aprovação</p>
            <p className="text-2xl font-bold text-foreground">
              {allAnalises.filter((a) => ['aprovado', 'recusado'].includes(a.status)).length > 0
                ? Math.round(
                    (allAnalises.filter((a) => a.status === 'aprovado').length /
                      allAnalises.filter((a) => ['aprovado', 'recusado'].includes(a.status)).length) *
                      100
                  )
                : 0}
              %
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Modal de Detalhes */}
      <Dialog open={!!selectedAnalise} onOpenChange={() => setSelectedAnalise(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-foreground">{selectedAnalise?.clienteNome}</DialogTitle>
          </DialogHeader>
          {selectedAnalise && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground block">CPF</span>
                  <span className="font-medium text-foreground">{selectedAnalise.cpf}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Valor Solicitado</span>
                  <span className="font-medium text-foreground">{formatCurrency(selectedAnalise.valorSolicitado)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Renda Mensal</span>
                  <span className="font-medium text-foreground">{formatCurrency(selectedAnalise.rendaMensal)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Score Serasa</span>
                  <span className={`font-bold ${getScoreColor(selectedAnalise.scoreSerasa)}`}>{selectedAnalise.scoreSerasa}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Score Interno</span>
                  <span className={`font-bold ${getScoreColor(selectedAnalise.scoreInterno)}`}>{selectedAnalise.scoreInterno}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Data</span>
                  <span className="font-medium text-foreground">{new Date(selectedAnalise.dataSolicitacao).toLocaleDateString('pt-BR')}</span>
                </div>
              </div>
              {selectedAnalise.motivo && (
                <div className="p-3 bg-muted rounded-lg text-sm">
                  <strong className="text-foreground">Motivo:</strong>
                  <p className="text-muted-foreground mt-1">{selectedAnalise.motivo}</p>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <Button
                  className="flex-1"
                  variant="outline"
                  disabled={selectedAnalise.status === 'aprovado'}
                  onClick={() => {
                    updateAnalise.mutate(
                      { id: selectedAnalise.id, updates: { status: 'aprovado' } },
                      { onSuccess: () => { toast.success('Análise aprovada'); setSelectedAnalise(null); } }
                    );
                  }}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />Aprovar
                </Button>
                <Button
                  className="flex-1"
                  variant="destructive"
                  disabled={selectedAnalise.status === 'recusado'}
                  onClick={() => {
                    updateAnalise.mutate(
                      { id: selectedAnalise.id, updates: { status: 'recusado' } },
                      { onSuccess: () => { toast.success('Análise recusada'); setSelectedAnalise(null); } }
                    );
                  }}
                >
                  <XCircle className="w-4 h-4 mr-2" />Recusar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
