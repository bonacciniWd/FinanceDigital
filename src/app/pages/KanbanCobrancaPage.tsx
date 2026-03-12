/**
 * @module KanbanCobrancaPage
 * @description Kanban de cobrança com dados reais do Supabase.
 *
 * Board com colunas: A Vencer, Vencido, Contatado, Negociação, Acordo, Pago.
 * Cards exibem cliente, valor, dias de atraso e responsável.
 * Drag-and-drop muda etapa via mutation. Modal com ações de contato.
 * Sem dados mock — usa useCardsCobranca, useMoverCardCobranca, useRegistrarContato.
 *
 * @route /kanban/cobranca
 * @access Protegido — perfis admin, gerência, cobrança
 */
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import {
  MessageSquare,
  Phone,
  HandshakeIcon,
  ChevronRight,
  Search,
  Loader2,
  AlertCircle,
  UserCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useCardsCobranca,
  useMoverCardCobranca,
  useRegistrarContato,
  useUpdateCardCobranca,
} from '../hooks/useKanbanCobranca';
import type { KanbanCobrancaView } from '../lib/view-types';
import type { KanbanCobrancaEtapa } from '../lib/database.types';

interface ColumnDef {
  id: KanbanCobrancaEtapa;
  title: string;
  dotColor: string;
}

const COLUMNS: ColumnDef[] = [
  { id: 'a_vencer', title: 'A VENCER', dotColor: '#eab308' },
  { id: 'vencido', title: 'VENCIDOS', dotColor: '#ef4444' },
  { id: 'contatado', title: 'CONTATADO', dotColor: '#3b82f6' },
  { id: 'negociacao', title: 'NEGOCIAÇÃO', dotColor: '#f97316' },
  { id: 'acordo', title: 'ACORDOS', dotColor: '#22c55e' },
  { id: 'pago', title: 'PAGOS', dotColor: '#10b981' },
];

export default function KanbanCobrancaPage() {
  const navigate = useNavigate();
  const [selectedCard, setSelectedCard] = useState<KanbanCobrancaView | null>(null);
  const [busca, setBusca] = useState('');
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [contatoObs, setContatoObs] = useState('');

  const { data: allCards = [], isLoading, error } = useCardsCobranca();
  const moverCard = useMoverCardCobranca();
  const registrarContato = useRegistrarContato();
  const updateCard = useUpdateCardCobranca();

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const filteredCards = useMemo(() => {
    if (!busca.trim()) return allCards;
    const lower = busca.toLowerCase();
    return allCards.filter(
      (c) =>
        c.clienteNome.toLowerCase().includes(lower) ||
        c.clienteEmail.toLowerCase().includes(lower) ||
        c.responsavelNome.toLowerCase().includes(lower)
    );
  }, [allCards, busca]);

  const cardsByEtapa = useMemo(() => {
    const map: Record<string, KanbanCobrancaView[]> = {};
    for (const col of COLUMNS) {
      map[col.id] = filteredCards.filter((c) => c.etapa === col.id);
    }
    return map;
  }, [filteredCards]);

  const stats = useMemo(() => {
    const total = allCards.reduce((sum, c) => sum + c.valorDivida, 0);
    const negociacao = allCards
      .filter((c) => c.etapa === 'negociacao')
      .reduce((sum, c) => sum + c.valorDivida, 0);
    const acordos = allCards.filter((c) => c.etapa === 'acordo').length;
    const pagos = allCards.filter((c) => c.etapa === 'pago');
    const totalPago = pagos.reduce((sum, c) => sum + c.valorDivida, 0);
    const totalClientes = allCards.filter((c) => !['pago', 'perdido'].includes(c.etapa)).length;
    const taxaConversao = allCards.filter((c) => c.etapa === 'negociacao').length > 0
      ? Math.round((acordos / allCards.filter((c) => c.etapa === 'negociacao').length) * 100)
      : 0;
    return { total, negociacao, acordos, totalClientes, taxaConversao, totalPago };
  }, [allCards]);

  const handleDragStart = (e: React.DragEvent, cardId: string) => {
    e.dataTransfer.setData('cardId', cardId);
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
    const cardId = e.dataTransfer.getData('cardId');
    if (!cardId) return;

    const card = allCards.find((c) => c.id === cardId);
    if (!card || card.etapa === columnId) return;

    moverCard.mutate(
      { id: cardId, etapa: columnId as KanbanCobrancaEtapa },
      {
        onSuccess: () => toast.success(`Card movido para ${COLUMNS.find((c) => c.id === columnId)?.title}`),
        onError: (err) => toast.error(`Erro ao mover: ${err.message}`),
      }
    );
  };

  const handleRegistrarContato = () => {
    if (!selectedCard) return;
    registrarContato.mutate(
      { id: selectedCard.id, observacao: contatoObs || undefined },
      {
        onSuccess: () => {
          toast.success('Contato registrado com sucesso');
          setContatoObs('');
          setSelectedCard(null);
        },
        onError: (err) => toast.error(`Erro: ${err.message}`),
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
          <h1 className="text-2xl font-semibold text-foreground">Kanban - Cobrança</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie o fluxo de cobrança visualmente — arraste os cards entre colunas
          </p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar cliente..." className="pl-10" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="ml-3 text-muted-foreground">Carregando pipeline...</span>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map((column) => {
            const cards = cardsByEtapa[column.id] || [];
            const isOver = dragOverColumn === column.id;
            return (
              <div key={column.id} className="flex-shrink-0 w-80">
                <Card
                  className={`liquid-metal-column ${isOver ? 'dragging-over' : ''}`}
                  style={{ '--kanban-col-color': `${column.dotColor}88` } as React.CSSProperties}
                  onDragOver={(e) => handleDragOver(e, column.id)}
                  onDragLeave={() => setDragOverColumn(null)}
                  onDrop={(e) => handleDrop(e, column.id)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <span className="kanban-status-dot" style={{ background: column.dotColor, '--dot-color': column.dotColor } as React.CSSProperties} />
                        {column.title}
                      </CardTitle>
                      <Badge variant="secondary" className="font-semibold">{cards.length}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 min-h-[100px]">
                    {cards.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4 italic">Nenhum card nesta etapa</p>
                    )}
                    {cards.map((card) => (
                      <Card
                        key={card.id}
                        className="liquid-metal-card cursor-grab active:cursor-grabbing"
                        draggable
                        onDragStart={(e) => handleDragStart(e, card.id)}
                        onClick={() => setSelectedCard(card)}
                      >
                        <CardContent className="p-4">
                          <div className="space-y-2">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="font-semibold text-sm text-foreground">{card.clienteNome}</div>
                                <div className="text-xs text-muted-foreground mt-0.5">{card.clienteEmail}</div>
                              </div>
                              <span className="text-lg">{column.emoji}</span>
                            </div>
                            <div className="space-y-1 text-xs">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Valor:</span>
                                <span className="font-semibold text-foreground">{formatCurrency(card.valorDivida)}</span>
                              </div>
                              {card.diasAtraso > 0 && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Atraso:</span>
                                  <span className="font-semibold text-red-600 dark:text-red-400">{card.diasAtraso} dias</span>
                                </div>
                              )}
                              {card.tentativasContato > 0 && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Contatos:</span>
                                  <span className="font-medium text-foreground">{card.tentativasContato}x</span>
                                </div>
                              )}
                              {card.responsavelNome !== 'Não atribuído' && (
                                <div className="flex items-center gap-1 mt-1">
                                  <UserCheck className="w-3 h-3 text-muted-foreground" />
                                  <span className="text-muted-foreground">{card.responsavelNome}</span>
                                </div>
                              )}
                            </div>
                            <div className="flex gap-1 pt-2">
                              <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={(e) => { e.stopPropagation(); navigate(`/chat?phone=${encodeURIComponent(card.clienteTelefone)}`); }}>
                                <MessageSquare className="w-3 h-3 mr-1" />Chat
                              </Button>
                              <Button size="sm" variant="outline" className="h-8 px-2" onClick={(e) => { e.stopPropagation(); setSelectedCard(card); }}>
                                <ChevronRight className="w-4 h-4" />
                              </Button>
                            </div>
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

      {/* Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total em Cobrança</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{formatCurrency(stats.total)}</div>
            <p className="text-xs text-muted-foreground mt-1">{stats.totalClientes} clientes</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Em Negociação</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{formatCurrency(stats.negociacao)}</div>
            <p className="text-xs text-muted-foreground mt-1">{allCards.filter((c) => c.etapa === 'negociacao').length} clientes</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Acordos Fechados</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.acordos}</div>
            <p className="text-xs text-muted-foreground mt-1">Recuperado: {formatCurrency(stats.totalPago)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Taxa de Conversão</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{stats.taxaConversao}%</div>
            <p className="text-xs text-muted-foreground mt-1">negociação → acordo</p>
          </CardContent>
        </Card>
      </div>

      {/* Modal de Detalhes */}
      <Dialog open={!!selectedCard} onOpenChange={() => { setSelectedCard(null); setContatoObs(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="w-12 h-12 bg-primary text-white rounded-full flex items-center justify-center font-semibold text-lg">
                {selectedCard?.clienteNome.charAt(0)}
              </div>
              <div>
                <div className="text-foreground">{selectedCard?.clienteNome}</div>
                <div className="text-sm text-muted-foreground font-normal">
                  {selectedCard ? formatCurrency(selectedCard.valorDivida) : ''}
                </div>
              </div>
            </DialogTitle>
          </DialogHeader>
          {selectedCard && (
            <div className="space-y-4">
              {selectedCard.diasAtraso > 0 && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                  <div className="text-sm font-medium text-red-800 dark:text-red-300">
                    Vencido há {selectedCard.diasAtraso} dias
                  </div>
                </div>
              )}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Etapa:</span>
                  <Badge>{COLUMNS.find((c) => c.id === selectedCard.etapa)?.title}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Responsável:</span>
                  <span className="font-medium text-foreground">{selectedCard.responsavelNome}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Contatos:</span>
                  <span className="font-medium text-foreground">{selectedCard.tentativasContato}x</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Telefone:</span>
                  <span className="font-medium text-foreground">{selectedCard.clienteTelefone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email:</span>
                  <span className="font-medium text-foreground">{selectedCard.clienteEmail}</span>
                </div>
                {selectedCard.observacao && (
                  <div className="mt-2 p-2 bg-muted rounded text-xs text-muted-foreground">
                    <strong>Obs.:</strong> {selectedCard.observacao}
                  </div>
                )}
              </div>
              <div className="space-y-2 border-t pt-3">
                <label className="text-sm font-medium text-foreground">Registrar contato</label>
                <Textarea placeholder="Observação sobre o contato..." value={contatoObs} onChange={(e) => setContatoObs(e.target.value)} rows={2} />
                <Button size="sm" onClick={handleRegistrarContato} disabled={registrarContato.isPending} className="w-full">
                  {registrarContato.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Phone className="w-4 h-4 mr-2" />}
                  Registrar Contato
                </Button>
              </div>
              <div className="flex gap-2 pt-2">
                <Button className="flex-1" variant="outline" onClick={() => navigate(`/chat?phone=${encodeURIComponent(selectedCard.clienteTelefone)}`)}><MessageSquare className="w-4 h-4 mr-2" />Chat</Button>
                <Button className="flex-1" variant="outline" onClick={() => window.open(`tel:${selectedCard.clienteTelefone}`, '_self')}><Phone className="w-4 h-4 mr-2" />Ligar</Button>
                <Button className="flex-1 bg-secondary hover:bg-secondary/90" onClick={() => {
                  updateCard.mutate({ id: selectedCard.id, updates: { etapa: 'negociacao' } }, {
                    onSuccess: () => { toast.success('Enviado para negociação'); setSelectedCard(null); },
                  });
                }}>
                  <HandshakeIcon className="w-4 h-4 mr-2" />Negociar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
