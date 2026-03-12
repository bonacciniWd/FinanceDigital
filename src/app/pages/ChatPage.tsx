/**
 * @module ChatPage
 * @description Interface de chat unificada — mensagens internas + WhatsApp.
 *
 * Painel lateral com conversas (clientes + WhatsApp), área de chat
 * com envio real via Edge Function send-whatsapp e Supabase Realtime.
 *
 * @route /comunicacao/chat
 * @access Protegido — todos os perfis autenticados
 */
import { useState, useRef, useEffect } from 'react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { ScrollArea } from '../components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Send, Paperclip, CheckCheck, Search, MessageSquare, Loader2,
  AlertCircle, Phone, Wifi, WifiOff, Image as ImageIcon, Video, Play, FileText, Download,
} from 'lucide-react';
import { useClientes } from '../hooks/useClientes';
import { useMensagens, useEnviarMensagem } from '../hooks/useMensagens';
import {
  useInstancias,
  useMensagensWhatsapp,
  useEnviarWhatsapp,
  useConversasWhatsapp,
} from '../hooks/useWhatsapp';
import { useTemplates } from '../hooks/useTemplates';
import { StatusBadge } from '../components/StatusBadge';

type ChatMode = 'interno' | 'whatsapp';

// ── Componente de conteúdo de mensagem (renderiza mídia) ──
function ChatMsgContent({ msg }: { msg: { tipo: string; conteudo: string | null; metadata: Record<string, unknown> } }) {
  const meta = msg.metadata ?? {};
  const mediaUrl = typeof meta.media_url === 'string' ? meta.media_url : null;
  const mimetype = typeof meta.media_mimetype === 'string' ? meta.media_mimetype : '';

  if (msg.tipo === 'image') {
    return (
      <div className="space-y-1">
        {mediaUrl ? (
          <img src={mediaUrl} alt="Imagem" className="max-w-full rounded-lg max-h-56 object-cover" loading="lazy" />
        ) : (
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><ImageIcon className="w-4 h-4" /> 📷 Imagem</div>
        )}
        {msg.conteudo && <p className="text-sm whitespace-pre-wrap">{msg.conteudo}</p>}
      </div>
    );
  }
  if (msg.tipo === 'video') {
    return (
      <div className="space-y-1">
        {mediaUrl ? (
          <video controls preload="metadata" className="max-w-full rounded-lg max-h-56">
            <source src={mediaUrl} type={mimetype || 'video/mp4'} />
          </video>
        ) : (
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Video className="w-4 h-4" /> 🎬 Vídeo</div>
        )}
        {msg.conteudo && <p className="text-sm whitespace-pre-wrap">{msg.conteudo}</p>}
      </div>
    );
  }
  if (msg.tipo === 'audio') {
    return mediaUrl ? (
      <audio controls preload="metadata" className="max-w-full min-w-[180px]"><source src={mediaUrl} type={mimetype || 'audio/ogg'} /></audio>
    ) : (
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Play className="w-4 h-4" /> 🎵 Áudio</div>
    );
  }
  if (msg.tipo === 'document') {
    return (
      <div className="flex items-center gap-2 text-xs">
        <FileText className="w-5 h-5 text-blue-500" />
        <span className="truncate">{msg.conteudo || 'Documento'}</span>
        {mediaUrl && <a href={mediaUrl} target="_blank" rel="noopener noreferrer"><Download className="w-4 h-4" /></a>}
      </div>
    );
  }
  return msg.conteudo ? <p className="text-sm whitespace-pre-wrap">{msg.conteudo}</p> : null;
}

export default function ChatPage() {
  const [mode, setMode] = useState<ChatMode>('whatsapp');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedTelefone, setSelectedTelefone] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeInstanciaId, setActiveInstanciaId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Hooks ──────────────────────────────────────────────
  const { data: allClientes = [] } = useClientes();
  const { data: msgInternas = [] } = useMensagens(mode === 'interno' ? selectedClientId || undefined : undefined);
  const enviarInterna = useEnviarMensagem();

  const { data: instancias = [] } = useInstancias();
  const instanciaConectada = instancias.find((i) => i.status === 'conectada');

  useEffect(() => {
    if (!activeInstanciaId && instanciaConectada) {
      setActiveInstanciaId(instanciaConectada.id);
    }
  }, [instanciaConectada, activeInstanciaId]);

  const { data: conversasWpp = [] } = useConversasWhatsapp(activeInstanciaId || undefined);
  const { data: msgsWpp = [] } = useMensagensWhatsapp(
    mode === 'whatsapp' ? selectedTelefone || undefined : undefined
  );
  const enviarWpp = useEnviarWhatsapp();
  const { data: templates = [] } = useTemplates();

  const selectedClient = allClientes.find((c) => c.id === selectedClientId);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgInternas, msgsWpp]);

  // ── Filtered ───────────────────────────────────────────
  const filteredClientes = allClientes.filter(
    (c) => !searchTerm || c.nome.toLowerCase().includes(searchTerm.toLowerCase()) || c.telefone?.includes(searchTerm)
  );

  const filteredConversas = conversasWpp.filter(
    (c) => !searchTerm || c.telefone.includes(searchTerm)
  );

  // ── Handlers ───────────────────────────────────────────
  const handleSend = async () => {
    if (!message.trim()) return;

    if (mode === 'interno' && selectedClientId) {
      enviarInterna.mutate({
        cliente_id: selectedClientId,
        remetente: 'sistema',
        conteudo: message,
        tipo: 'texto',
      });
      setMessage('');
    } else if (mode === 'whatsapp' && selectedTelefone && activeInstanciaId) {
      try {
        await enviarWpp.mutateAsync({
          instancia_id: activeInstanciaId,
          telefone: selectedTelefone,
          conteudo: message,
          tipo: 'text',
        });
        setMessage('');
      } catch (err) {
        console.error('Erro ao enviar WhatsApp:', err);
      }
    }
  };

  const applyTemplate = (templateId: string) => {
    const tmpl = templates.find((t) => t.id === templateId);
    if (tmpl) {
      setMessage(tmpl.conteudo || '');
    }
  };

  const formatTime = (ts: string) =>
    new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const isSending = enviarInterna.isPending || enviarWpp.isPending;
  const canSend =
    message.trim() &&
    ((mode === 'interno' && selectedClientId) ||
      (mode === 'whatsapp' && selectedTelefone && activeInstanciaId && instanciaConectada));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Chat</h1>
          <p className="text-muted-foreground mt-1">Converse com clientes em tempo real</p>
        </div>
        <div className="flex items-center gap-2">
          {instanciaConectada ? (
            <Badge className="bg-green-500 text-white flex items-center gap-1">
              <Wifi className="w-3 h-3" />WhatsApp Conectado
            </Badge>
          ) : (
            <Badge variant="secondary" className="flex items-center gap-1">
              <WifiOff className="w-3 h-3" />WhatsApp Desconectado
            </Badge>
          )}
          <Select value={mode} onValueChange={(v) => { setMode(v as ChatMode); setSelectedClientId(null); setSelectedTelefone(null); }}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="interno">Chat Interno</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6 h-[calc(100vh-220px)]">
        {/* Lista de Conversas */}
        <div className="col-span-12 lg:col-span-4">
          <Card className="h-full flex flex-col">
            <div className="p-4 border-b space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">
                  {mode === 'whatsapp' ? 'Conversas WhatsApp' : 'Clientes'}
                </h3>
                <Badge variant="secondary" className="text-xs">
                  {mode === 'whatsapp' ? filteredConversas.length : filteredClientes.length}
                </Badge>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder={mode === 'whatsapp' ? 'Buscar por telefone...' : 'Buscar cliente...'}
                  className="pl-10 h-9 text-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {mode === 'whatsapp' ? (
                  filteredConversas.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground px-4">
                      <MessageSquare className="w-8 h-8 mb-2" />
                      <p className="text-sm">Nenhuma conversa WhatsApp</p>
                    </div>
                  ) : (
                    filteredConversas.map((c) => (
                      <button
                        key={c.telefone}
                        onClick={() => { setSelectedTelefone(c.telefone); setSelectedClientId(null); }}
                        className={`w-full text-left p-3 rounded-lg transition-colors hover:bg-muted ${selectedTelefone === c.telefone ? 'bg-muted' : ''}`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 bg-green-600 text-white rounded-full flex items-center justify-center text-sm font-semibold shrink-0">
                            {c.telefone.slice(-2)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium text-sm truncate">{c.telefone}</span>
                              <span className="text-[10px] text-muted-foreground">{formatTime(c.created_at)}</span>
                            </div>
                            <p className="text-xs text-muted-foreground truncate">{c.ultima_msg}</p>
                          </div>
                        </div>
                      </button>
                    ))
                  )
                ) : (
                  filteredClientes.slice(0, 20).map((cliente) => (
                    <button
                      key={cliente.id}
                      onClick={() => { setSelectedClientId(cliente.id); setSelectedTelefone(null); }}
                      className={`w-full text-left p-3 rounded-lg transition-colors hover:bg-muted ${selectedClientId === cliente.id ? 'bg-muted' : ''}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-primary text-white rounded-full flex items-center justify-center font-semibold">
                          {cliente.nome.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-sm truncate">{cliente.nome}</span>
                          </div>
                          <StatusBadge status={cliente.status} />
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </Card>
        </div>

        {/* Chat */}
        <div className="col-span-12 lg:col-span-8">
          <Card className="h-full flex flex-col">
            {(mode === 'whatsapp' && !selectedTelefone) || (mode === 'interno' && !selectedClientId) ? (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                <MessageSquare className="w-16 h-16 mb-4 opacity-30" />
                <h3 className="font-semibold text-lg mb-1">Selecione uma conversa</h3>
                <p className="text-sm">Escolha um contato na lista ao lado para iniciar</p>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="p-4 border-b">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 ${mode === 'whatsapp' ? 'bg-green-600' : 'bg-primary'} text-white rounded-full flex items-center justify-center font-semibold`}>
                      {mode === 'whatsapp' ? (selectedTelefone?.slice(-2) || '?') : (selectedClient?.nome.charAt(0) || '?')}
                    </div>
                    <div>
                      <div className="font-semibold">
                        {mode === 'whatsapp' ? selectedTelefone : selectedClient?.nome}
                      </div>
                      <div className="flex items-center gap-2">
                        {mode === 'interno' && selectedClient && <StatusBadge status={selectedClient.status} />}
                        {mode === 'whatsapp' && (
                          <Badge variant="outline" className="text-[10px]">
                            <Phone className="w-2 h-2 mr-1" />WhatsApp
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Mensagens */}
                <ScrollArea className="flex-1 p-4">
                  <div className="space-y-4">
                    {mode === 'interno' ? (
                      msgInternas.length === 0 ? (
                        <div className="text-center text-muted-foreground text-sm py-8">Nenhuma mensagem</div>
                      ) : (
                        msgInternas.map((msg) => (
                          <div key={msg.id} className={`flex ${msg.remetente === 'sistema' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[70%] rounded-lg px-4 py-2 ${msg.remetente === 'sistema' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                              <p className="text-sm">{msg.conteudo}</p>
                              <div className={`text-xs mt-1 flex items-center gap-1 ${msg.remetente === 'sistema' ? 'text-white/70 justify-end' : 'text-muted-foreground'}`}>
                                <span>{formatTime(msg.timestamp)}</span>
                                {msg.remetente === 'sistema' && <CheckCheck className="w-3 h-3" />}
                              </div>
                            </div>
                          </div>
                        ))
                      )
                    ) : (
                      msgsWpp.length === 0 ? (
                        <div className="text-center text-muted-foreground text-sm py-8">Nenhuma mensagem</div>
                      ) : (
                        msgsWpp.map((msg) => (
                          <div key={msg.id} className={`flex ${msg.direcao === 'saida' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[70%] rounded-lg px-4 py-2 ${msg.direcao === 'saida' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-muted'}`}>
                              <ChatMsgContent msg={{ tipo: msg.tipo, conteudo: msg.conteudo, metadata: (msg.metadata ?? {}) as Record<string, unknown> }} />
                              <div className="text-xs mt-1 flex items-center gap-1 text-muted-foreground justify-end">
                                <span>{formatTime(msg.created_at)}</span>
                                {msg.direcao === 'saida' && <CheckCheck className={`w-3 h-3 ${msg.status === 'lida' ? 'text-blue-500' : ''}`} />}
                              </div>
                            </div>
                          </div>
                        ))
                      )
                    )}
                    <div ref={scrollRef} />
                  </div>
                </ScrollArea>

                {/* Input */}
                <div className="p-4 border-t space-y-3">
                  {mode === 'whatsapp' && !instanciaConectada ? (
                    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-2">
                      <AlertCircle className="w-4 h-4" />
                      Conecte uma instância WhatsApp para enviar mensagens
                    </div>
                  ) : (
                    <>
                      <div className="flex gap-2">
                        <Select onValueChange={applyTemplate}>
                          <SelectTrigger className="w-48">
                            <SelectValue placeholder="Usar template..." />
                          </SelectTrigger>
                          <SelectContent>
                            {templates.map((t) => (
                              <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Digite sua mensagem..."
                          value={message}
                          onChange={(e) => setMessage(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleSend();
                            }
                          }}
                          className="flex-1"
                          disabled={isSending}
                        />
                        <Button
                          onClick={handleSend}
                          disabled={!canSend || isSending}
                          className={mode === 'whatsapp' ? 'bg-green-600 hover:bg-green-700' : ''}
                        >
                          {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
