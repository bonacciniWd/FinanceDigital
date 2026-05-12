/**
 * @module KanbanAtendimentoPage
 * @description Kanban de atendimento ao cliente com dados reais do Supabase.
 *
 * Board com colunas derivadas de ticket_status:
 * Aberto, Em Atendimento, Aguardando Cliente, Resolvido.
 * Cards exibem cliente, canal, prioridade e tempo desde abertura.
 * Drag-and-drop muda status via mutation useMoverTicket.
 * Sem dados mock — usa useTickets.
 *
 * @route /kanban/atendimento
 * @access Protegido — todos os perfis autenticados
 */
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Search, MessageSquare, Phone, Mail, Clock, Loader2, AlertCircle, User, CheckCircle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { useTickets, useMoverTicket, useUpdateTicket } from '../hooks/useTickets';
import type { TicketAtendimentoView } from '../lib/view-types';
import type { TicketStatus } from '../lib/database.types';

// ── Parser de histórico do chatbot ─────────────────────────────────────────
interface ChatMessage {
  type: 'bot' | 'client' | 'system';
  timestamp: string;
  content: string;
}

function parseDescricao(descricao: string): { header: string; messages: ChatMessage[] } {
  const SEP = 'Últimas mensagens:';
  const sepIdx = descricao.indexOf(SEP);
  const header = sepIdx > -1 ? descricao.slice(0, sepIdx).trim() : '';
  const msgText = sepIdx > -1 ? descricao.slice(sepIdx + SEP.length).trim() : descricao;

  // Divide no início de cada mensagem Bot/Cliente
  const parts = msgText
    .split(/(?=(?:🤖|\[Bot\]|Bot) \(|(?:👤|\[Cliente\]|Cliente) \()/)
    .map((s) => s.trim())
    .filter(Boolean);

  const messages: ChatMessage[] = parts.map((part) => {
    const botMatch = part.match(/^(?:🤖|Bot) \(([^)]+)\):\s*([\s\S]*)/);
    const cliMatch = part.match(/^(?:👤|Cliente) \(([^)]+)\):\s*([\s\S]*)/);
    if (botMatch) return { type: 'bot', timestamp: botMatch[1], content: botMatch[2].trim() };
    if (cliMatch) return { type: 'client', timestamp: cliMatch[1], content: cliMatch[2].trim() };
    return { type: 'system', timestamp: '', content: part };
  });

  // Se não conseguiu parsear nenhuma mensagem, trata tudo como system
  if (messages.length === 0) return { header: '', messages: [{ type: 'system', timestamp: '', content: descricao }] };

  return { header, messages };
}

/** Renderiza formatação WhatsApp: *bold*, _italic_, ~strike~ */
function renderWAText(text: string): React.ReactNode[] {
  const segments: React.ReactNode[] = [];
  // Substitui marcações simples sequencialmente
  let remaining = text;
  let key = 0;
  const push = (node: React.ReactNode) => segments.push(<span key={key++}>{node}</span>);
  // Regex para capturar marcações WhatsApp
  const re = /(\*[^*]+\*|_[^_]+_|~[^~]+~|\n)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(remaining)) !== null) {
    if (m.index > last) push(remaining.slice(last, m.index));
    const token = m[0];
    if (token === '\n') { segments.push(<br key={key++} />); }
    else if (token.startsWith('*')) push(<strong key={key++} className="font-semibold">{token.slice(1, -1)}</strong>);
    else if (token.startsWith('_')) push(<em key={key++}>{token.slice(1, -1)}</em>);
    else if (token.startsWith('~')) push(<s key={key++}>{token.slice(1, -1)}</s>);
    last = m.index + token.length;
  }
  if (last < remaining.length) push(remaining.slice(last));
  return segments;
}

function ChatHistorico({ descricao }: { descricao: string }) {
  const { header, messages } = parseDescricao(descricao);
  return (
    <div className="space-y-2">
      {header && (
        <div className="text-[11px] text-muted-foreground bg-muted/60 rounded-lg px-3 py-2 leading-relaxed">
          {header}
        </div>
      )}
      <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
        {messages.map((msg, i) => {
          if (msg.type === 'system') {
            return (
              <div key={i} className="text-[11px] text-muted-foreground text-center italic px-2">
                {msg.content}
              </div>
            );
          }
          const isBot = msg.type === 'bot';
          return (
            <div key={i} className={`flex ${isBot ? 'justify-start' : 'justify-end'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed shadow-sm ${
                  isBot
                    ? 'bg-muted text-foreground rounded-tl-sm'
                    : 'bg-primary text-primary-foreground rounded-tr-sm'
                }`}
              >
                <div className={`text-[10px] font-semibold mb-0.5 ${
                  isBot ? 'text-muted-foreground' : 'text-primary-foreground/70'
                }`}>
                  {isBot ? '🤖 Bot' : '👤 Cliente'}
                  {msg.timestamp && <span className="ml-1 font-normal opacity-70">{msg.timestamp}</span>}
                </div>
                <div>{renderWAText(msg.content)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface ColumnDef {
  id: TicketStatus;
  title: string;
  dotColor: string;
  icon: React.ReactNode;
}

const COLUMNS: ColumnDef[] = [
  { id: 'aberto', title: 'ABERTO', dotColor: '#3b82f6', icon: <AlertCircle className="w-4 h-4" /> },
  { id: 'em_atendimento', title: 'EM ATENDIMENTO', dotColor: '#eab308', icon: <User className="w-4 h-4" /> },
  { id: 'aguardando_cliente', title: 'AGUARD. CLIENTE', dotColor: '#f97316', icon: <Clock className="w-4 h-4" /> },
  { id: 'resolvido', title: 'RESOLVIDO', dotColor: '#22c55e', icon: <CheckCircle className="w-4 h-4" /> },
];

const CANAL_ICON: Record<string, React.ReactNode> = {
  whatsapp: <Phone className="w-3 h-3" />,
  chat: <MessageSquare className="w-3 h-3" />,
  telefone: <Phone className="w-3 h-3" />,
  email: <Mail className="w-3 h-3" />,
  presencial: <User className="w-3 h-3" />,
};

const CANAL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  chat: 'Chat',
  telefone: 'Telefone',
  email: 'E-mail',
  presencial: 'Presencial',
};

const PRIORIDADE_COLOR: Record<string, string> = {
  baixa: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  media: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  alta: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  urgente: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

function tempoDesde(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export default function KanbanAtendimentoPage() {
  const navigate = useNavigate();
  const [selectedTicket, setSelectedTicket] = useState<TicketAtendimentoView | null>(null);
  const [busca, setBusca] = useState('');
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  const { data: allTickets = [], isLoading, error } = useTickets();
  const moverTicket = useMoverTicket();
  const updateTicket = useUpdateTicket();

  const filtered = useMemo(() => {
    if (!busca.trim()) return allTickets;
    const lower = busca.toLowerCase();
    return allTickets.filter(
      (t) =>
        t.clienteNome.toLowerCase().includes(lower) ||
        t.assunto.toLowerCase().includes(lower)
    );
  }, [allTickets, busca]);

  const ticketsByStatus = useMemo(() => {
    const map: Record<string, TicketAtendimentoView[]> = {};
    for (const col of COLUMNS) {
      map[col.id] = filtered.filter((t) => t.status === col.id);
    }
    return map;
  }, [filtered]);

  const handleDragStart = (e: React.DragEvent, ticketId: string) => {
    e.dataTransfer.setData('ticketId', ticketId);
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
    const ticketId = e.dataTransfer.getData('ticketId');
    if (!ticketId) return;

    const ticket = allTickets.find((t) => t.id === ticketId);
    if (!ticket || ticket.status === columnId) return;

    moverTicket.mutate(
      { id: ticketId, status: columnId as TicketStatus },
      {
        onSuccess: () => toast.success(`Ticket movido para ${COLUMNS.find((c) => c.id === columnId)?.title}`),
        onError: (err) => toast.error(`Erro ao mover: ${err.message}`),
      }
    );
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <p className="text-destructive font-medium">Erro ao carregar tickets</p>
          <p className="text-sm text-muted-foreground mt-1">{(error as Error).message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Kanban - Atendimento</h1>
          <p className="text-muted-foreground mt-1">Gerencie o fluxo de atendimento — arraste para mudar status</p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar cliente ou assunto..." className="pl-10" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="ml-3 text-muted-foreground">Carregando tickets...</span>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map((col) => {
            const items = ticketsByStatus[col.id] || [];
            const isOver = dragOverColumn === col.id;
            return (
              <div key={col.id} className="flex-shrink-0 w-80">
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
                      <p className="text-xs text-muted-foreground text-center py-4 italic">Nenhum ticket</p>
                    )}
                    {items.map((item) => (
                      <Card
                        key={item.id}
                        className="liquid-metal-card cursor-grab active:cursor-grabbing"
                        draggable
                        onDragStart={(e) => handleDragStart(e, item.id)}
                        onClick={() => setSelectedTicket(item)}
                      >
                        <CardContent className="p-4 space-y-2">
                          <div className="flex items-start justify-between">
                            <div className="font-semibold text-sm text-foreground">{item.clienteNome}</div>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="w-3 h-3" />{tempoDesde(item.createdAt)}
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2">{item.assunto}</p>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              {CANAL_ICON[item.canal] || <MessageSquare className="w-3 h-3" />}
                              <span>{CANAL_LABEL[item.canal] || item.canal}</span>
                            </div>
                            <Badge className={`text-[10px] px-1.5 py-0.5 ${PRIORIDADE_COLOR[item.prioridade] || ''}`}>
                              {item.prioridade}
                            </Badge>
                          </div>
                          {item.atendenteNome && (
                            <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <User className="w-3 h-3" />{item.atendenteNome}
                            </div>
                          )}
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
            <p className="text-xs text-muted-foreground">Abertos</p>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {allTickets.filter((t) => t.status === 'aberto').length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Em Atendimento</p>
            <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
              {allTickets.filter((t) => t.status === 'em_atendimento').length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Resolvidos Hoje</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
              {allTickets.filter(
                (t) =>
                  t.status === 'resolvido' &&
                  t.resolvidoEm &&
                  new Date(t.resolvidoEm).toDateString() === new Date().toDateString()
              ).length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Total Pendentes</p>
            <p className="text-2xl font-bold text-foreground">
              {allTickets.filter((t) => !['resolvido', 'cancelado'].includes(t.status)).length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Modal de Detalhes */}
      <Dialog open={!!selectedTicket} onOpenChange={() => setSelectedTicket(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-foreground">{selectedTicket?.assunto}</DialogTitle>
          </DialogHeader>
          {selectedTicket && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground block">Cliente</span>
                  <span className="font-medium text-foreground">{selectedTicket.clienteNome}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Canal</span>
                  <span className="font-medium text-foreground flex items-center gap-1">
                    {CANAL_ICON[selectedTicket.canal]} {CANAL_LABEL[selectedTicket.canal]}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Prioridade</span>
                  <Badge className={PRIORIDADE_COLOR[selectedTicket.prioridade]}>{selectedTicket.prioridade}</Badge>
                </div>
                <div>
                  <span className="text-muted-foreground block">Atendente</span>
                  <span className="font-medium text-foreground">{selectedTicket.atendenteNome || 'Não atribuído'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Telefone</span>
                  <span className="font-medium text-foreground">{selectedTicket.clienteTelefone}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Aberto em</span>
                  <span className="font-medium text-foreground">{new Date(selectedTicket.createdAt).toLocaleString('pt-BR')}</span>
                </div>
              </div>
              {selectedTicket.descricao && (
                <div className="space-y-1.5">
                  <strong className="text-sm text-foreground">Histórico da conversa</strong>
                  <ChatHistorico descricao={selectedTicket.descricao} />
                </div>
              )}
              <div className="flex gap-2 pt-2">
                {selectedTicket.clienteTelefone && (
                  <Button
                    variant="outline"
                    size="icon"
                    title="Abrir conversa no WhatsApp"
                    onClick={() => {
                      const digits = selectedTicket.clienteTelefone.replace(/\D/g, '');
                      const num = digits.length >= 10 && !digits.startsWith('55') ? '55' + digits : digits;
                      navigate(`/whatsapp?telefone=${encodeURIComponent(num)}`);
                      setSelectedTicket(null);
                    }}
                  >
                    <ExternalLink className="w-4 h-4 text-green-600" />
                  </Button>
                )}
                {selectedTicket.status !== 'resolvido' && (
                  <Button
                    className="flex-1"
                    onClick={() => {
                      moverTicket.mutate(
                        { id: selectedTicket.id, status: 'resolvido' },
                        { onSuccess: () => { toast.success('Ticket resolvido!'); setSelectedTicket(null); } }
                      );
                    }}
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />Resolver
                  </Button>
                )}
                <Button variant="outline" onClick={() => setSelectedTicket(null)}>Fechar</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
