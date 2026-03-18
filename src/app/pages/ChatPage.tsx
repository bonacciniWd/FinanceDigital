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
  Users, Mic, Square, Trash2, AlertTriangle, User, Wallet, ExternalLink, Pause,
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
import { useAuth } from '../contexts/AuthContext';
import {
  useUsuariosChat,
  useMensagensInternas,
  useNaoLidasPorRemetente,
  useEnviarMensagemInterna,
  useMarcarLidasChatInterno,
  useEnviarAudioInterno,
  useEnviarAtencaoCliente,
  useEnviarAtencaoEmprestimo,
} from '../hooks/useChatInterno';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { useEmprestimos } from '../hooks/useEmprestimos';
import { useNavigate } from 'react-router';

type ChatMode = 'interno' | 'whatsapp' | 'equipe';

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

const EQUIPE_WAVE = [60, 90, 40, 100, 70, 85, 35, 95, 55, 80, 65, 100, 45, 75, 90, 50, 85, 60, 95, 70, 55, 80, 45, 90, 65];

// ── Audio player customizado para equipe ──
function EquipeAudioPlayer({ src, duration, isMe }: { src: string; duration?: number; isMe: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [cur, setCur] = useState(0);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => {
      setCur(el.currentTime);
      setProgress(el.duration ? (el.currentTime / el.duration) * 100 : 0);
    };
    const onEnd = () => { setPlaying(false); setProgress(0); setCur(0); };
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('ended', onEnd);
    return () => { el.removeEventListener('timeupdate', onTime); el.removeEventListener('ended', onEnd); };
  }, []);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) el.pause(); else el.play();
    setPlaying(!playing);
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;

  return (
    <div className="flex items-center gap-3 min-w-[200px]">
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
      <button
        onClick={toggle}
        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all ${
          isMe
            ? 'bg-white/20 hover:bg-white/30 text-white'
            : 'bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-400'
        }`}
      >
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-end gap-[2px] h-5">
          {EQUIPE_WAVE.map((h, i) => {
            const filled = (i / EQUIPE_WAVE.length) * 100 < progress;
            return (
              <div
                key={i}
                className={`flex-1 rounded-full transition-colors duration-150 ${
                  filled
                    ? isMe ? 'bg-white/80' : 'bg-indigo-400'
                    : isMe ? 'bg-white/25' : 'bg-foreground/15'
                }`}
                style={{ height: `${h}%` }}
              />
            );
          })}
        </div>
        <div className={`text-[10px] flex justify-between ${isMe ? 'text-white/50' : 'text-muted-foreground'}`}>
          <span>{fmt(cur)}</span>
          <span>{fmt(duration ?? 0)}</span>
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  const { user } = useAuth();
  const [mode, setMode] = useState<ChatMode>('whatsapp');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedTelefone, setSelectedTelefone] = useState<string | null>(null);
  const [selectedEquipeUserId, setSelectedEquipeUserId] = useState<string | null>(null);
  const [selectedEquipeUserName, setSelectedEquipeUserName] = useState('');
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

  // ── Hooks equipe (chat interno entre usuários) ──
  const meuId = user?.id;
  const { data: usuariosEquipe = [] } = useUsuariosChat(mode === 'equipe' ? meuId : undefined);
  const { data: naoLidasPorUser = {} } = useNaoLidasPorRemetente(mode === 'equipe' ? meuId : undefined);
  const { data: msgsEquipe = [] } = useMensagensInternas(
    mode === 'equipe' ? meuId : undefined,
    mode === 'equipe' ? selectedEquipeUserId ?? undefined : undefined
  );
  const enviarEquipe = useEnviarMensagemInterna();
  const marcarLidasEquipe = useMarcarLidasChatInterno();
  const enviarAudioEquipe = useEnviarAudioInterno();
  const enviarAtClienteEquipe = useEnviarAtencaoCliente();
  const enviarAtEmprestimoEquipe = useEnviarAtencaoEmprestimo();
  const { data: emprestimos = [] } = useEmprestimos();
  const audioEquipe = useAudioRecorder();
  const navigate = useNavigate();
  const isAdminEquipe = user?.role === 'admin' || user?.role === 'gerencia';
  const [atencaoTipoEquipe, setAtencaoTipoEquipe] = useState<'cliente' | 'emprestimo'>('cliente');
  const [atencaoItemIdEquipe, setAtencaoItemIdEquipe] = useState('');
  const [showAtencaoEquipe, setShowAtencaoEquipe] = useState(false);

  const selectedClient = allClientes.find((c) => c.id === selectedClientId);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgInternas, msgsWpp, msgsEquipe]);

  // Marcar como lidas quando abre conversa equipe
  useEffect(() => {
    if (mode === 'equipe' && meuId && selectedEquipeUserId && (naoLidasPorUser[selectedEquipeUserId] ?? 0) > 0) {
      marcarLidasEquipe.mutate({ meuId, deUserId: selectedEquipeUserId });
    }
  }, [mode, selectedEquipeUserId, meuId, naoLidasPorUser]);

  // ── Filtered ───────────────────────────────────────────
  const filteredClientes = allClientes.filter(
    (c) => !searchTerm || c.nome.toLowerCase().includes(searchTerm.toLowerCase()) || c.telefone?.includes(searchTerm)
  );

  const filteredConversas = conversasWpp.filter(
    (c) => !searchTerm || c.telefone.includes(searchTerm)
  );

  const filteredUsuariosEquipe = usuariosEquipe.filter(
    (u) => !searchTerm || u.name.toLowerCase().includes(searchTerm.toLowerCase()) || u.email.toLowerCase().includes(searchTerm.toLowerCase())
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
    } else if (mode === 'equipe' && meuId && selectedEquipeUserId) {
      try {
        await enviarEquipe.mutateAsync({
          de_user_id: meuId,
          para_user_id: selectedEquipeUserId,
          conteudo: message.trim(),
        });
        setMessage('');
      } catch (err) {
        console.error('Erro ao enviar mensagem interna:', err);
      }
    }
  };

  const applyTemplate = (templateId: string) => {
    const tmpl = templates.find((t) => t.id === templateId);
    if (tmpl) {
      setMessage(tmpl.conteudo || '');
    }
  };

  const handleSendAudioEquipe = async () => {
    if (!audioEquipe.blob || !meuId || !selectedEquipeUserId) return;
    try {
      await enviarAudioEquipe.mutateAsync({
        deUserId: meuId,
        paraUserId: selectedEquipeUserId,
        blob: audioEquipe.blob,
        duracaoSeg: audioEquipe.duration,
      });
      audioEquipe.clear();
    } catch (err) {
      console.error('Erro ao enviar áudio equipe:', err);
    }
  };

  const handleSendAtencaoEquipe = async () => {
    if (!meuId || !selectedEquipeUserId || !atencaoItemIdEquipe) return;
    try {
      if (atencaoTipoEquipe === 'cliente') {
        const cli = allClientes.find((c) => c.id === atencaoItemIdEquipe);
        if (!cli) return;
        await enviarAtClienteEquipe.mutateAsync({
          deUserId: meuId,
          paraUserId: selectedEquipeUserId,
          cliente: { id: cli.id, nome: cli.nome, status: cli.status, telefone: cli.telefone },
        });
      } else {
        const emp = emprestimos.find((e) => e.id === atencaoItemIdEquipe);
        if (!emp) return;
        const cn = allClientes.find((c) => c.id === emp.clienteId)?.nome ?? 'Cliente';
        await enviarAtEmprestimoEquipe.mutateAsync({
          deUserId: meuId,
          paraUserId: selectedEquipeUserId,
          emprestimo: {
            id: emp.id,
            cliente_nome: cn,
            valor_total: emp.valor,
            parcelas_pagas: emp.parcelasPagas,
            total_parcelas: emp.parcelas,
            status: emp.status,
          },
        });
      }
      setShowAtencaoEquipe(false);
      setAtencaoItemIdEquipe('');
    } catch (err) {
      console.error('Erro ao enviar atenção equipe:', err);
    }
  };

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatTime = (ts: string) =>
    new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const isSending = enviarInterna.isPending || enviarWpp.isPending || enviarEquipe.isPending || enviarAudioEquipe.isPending || enviarAtClienteEquipe.isPending || enviarAtEmprestimoEquipe.isPending;
  const canSend =
    message.trim() &&
    ((mode === 'interno' && selectedClientId) ||
      (mode === 'whatsapp' && selectedTelefone && activeInstanciaId && instanciaConectada) ||
      (mode === 'equipe' && selectedEquipeUserId && meuId));

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
          <Select value={mode} onValueChange={(v) => { setMode(v as ChatMode); setSelectedClientId(null); setSelectedTelefone(null); setSelectedEquipeUserId(null); setSearchTerm(''); }}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="equipe">Chat Equipe</SelectItem>
              <SelectItem value="interno">Chat Clientes</SelectItem>
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
                  {mode === 'whatsapp' ? 'Conversas WhatsApp' : mode === 'equipe' ? 'Equipe' : 'Clientes'}
                </h3>
                <Badge variant="secondary" className="text-xs">
                  {mode === 'whatsapp' ? filteredConversas.length : mode === 'equipe' ? filteredUsuariosEquipe.length : filteredClientes.length}
                </Badge>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder={mode === 'whatsapp' ? 'Buscar por telefone...' : mode === 'equipe' ? 'Buscar colaborador...' : 'Buscar cliente...'}
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
                        onClick={() => { setSelectedTelefone(c.telefone); setSelectedClientId(null); setSelectedEquipeUserId(null); }}
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
                ) : mode === 'equipe' ? (
                  filteredUsuariosEquipe.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground px-4">
                      <Users className="w-8 h-8 mb-2" />
                      <p className="text-sm">Nenhum colaborador encontrado</p>
                    </div>
                  ) : (
                    filteredUsuariosEquipe.map((u) => {
                      const naoLidas = naoLidasPorUser[u.id] ?? 0;
                      return (
                        <button
                          key={u.id}
                          onClick={() => { setSelectedEquipeUserId(u.id); setSelectedEquipeUserName(u.name); setSelectedClientId(null); setSelectedTelefone(null); }}
                          className={`w-full text-left p-3 rounded-lg transition-colors hover:bg-muted ${selectedEquipeUserId === u.id ? 'bg-muted' : ''}`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-semibold shrink-0">
                              {u.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-medium text-sm truncate">{u.name}</span>
                                {naoLidas > 0 && (
                                  <Badge className="bg-red-500 text-white text-[10px] px-1.5 min-w-[20px] justify-center">
                                    {naoLidas}
                                  </Badge>
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground capitalize">{u.role}</span>
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )
                ) : (
                  filteredClientes.slice(0, 20).map((cliente) => (
                    <button
                      key={cliente.id}
                      onClick={() => { setSelectedClientId(cliente.id); setSelectedTelefone(null); setSelectedEquipeUserId(null); }}
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
            {(mode === 'whatsapp' && !selectedTelefone) || (mode === 'interno' && !selectedClientId) || (mode === 'equipe' && !selectedEquipeUserId) ? (
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
                    <div className={`w-10 h-10 ${mode === 'whatsapp' ? 'bg-green-600' : mode === 'equipe' ? 'bg-blue-600' : 'bg-primary'} text-white rounded-full flex items-center justify-center font-semibold`}>
                      {mode === 'whatsapp' ? (selectedTelefone?.slice(-2) || '?') : mode === 'equipe' ? (selectedEquipeUserName.charAt(0).toUpperCase() || '?') : (selectedClient?.nome.charAt(0) || '?')}
                    </div>
                    <div>
                      <div className="font-semibold">
                        {mode === 'whatsapp' ? selectedTelefone : mode === 'equipe' ? selectedEquipeUserName : selectedClient?.nome}
                      </div>
                      <div className="flex items-center gap-2">
                        {mode === 'interno' && selectedClient && <StatusBadge status={selectedClient.status} />}
                        {mode === 'whatsapp' && (
                          <Badge variant="outline" className="text-[10px]">
                            <Phone className="w-2 h-2 mr-1" />WhatsApp
                          </Badge>
                        )}
                        {mode === 'equipe' && (
                          <Badge variant="outline" className="text-[10px]">
                            <Users className="w-2 h-2 mr-1" />Equipe
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
                    ) : mode === 'equipe' ? (
                      msgsEquipe.length === 0 ? (
                        <div className="text-center text-muted-foreground text-sm py-8">Nenhuma mensagem ainda. Diga olá!</div>
                      ) : (
                        msgsEquipe.map((msg) => {
                          const isMe = msg.de_user_id === meuId;
                          const tipo = (msg as any).tipo ?? 'texto';
                          const meta = ((msg as any).metadata ?? {}) as Record<string, unknown>;

                          const sentBubble = 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/20';
                          const recvBubble = 'bg-white/80 dark:bg-slate-700/60 text-foreground border border-white/30 dark:border-slate-600/30 shadow-sm';
                          const sentRound = 'rounded-2xl rounded-br-md';
                          const recvRound = 'rounded-2xl rounded-bl-md';
                          const timeClasses = isMe ? 'text-white/40 justify-end' : 'text-muted-foreground';

                          return (
                            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                              {tipo === 'audio' ? (
                                <div className={`max-w-[75%] ${isMe ? sentRound : recvRound} ${isMe ? sentBubble : recvBubble} px-4 py-3`}>
                                  <EquipeAudioPlayer src={meta.audio_url as string} duration={meta.duracao_seg as number} isMe={isMe} />
                                  <div className={`text-[10px] mt-1.5 flex items-center gap-1 ${timeClasses}`}>
                                    <span>{formatTime(msg.created_at)}</span>
                                    {isMe && msg.lida && <CheckCheck className="w-3 h-3 text-indigo-200" />}
                                  </div>
                                </div>
                              ) : tipo === 'atencao_cliente' ? (
                                <div className={`max-w-[75%] rounded-2xl overflow-hidden shadow-md ${
                                  isMe
                                    ? 'bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-amber-500/20'
                                    : 'bg-amber-50 dark:bg-amber-900/30 text-amber-900 dark:text-amber-100 border border-amber-200/50 dark:border-amber-700/30'
                                }`}>
                                  <div className="px-4 py-1.5 flex items-center gap-1.5 text-[10px] font-bold tracking-wider opacity-80 border-b border-black/10 dark:border-white/10">
                                    <AlertTriangle className="w-3 h-3" /> ATENÇÃO — CLIENTE
                                  </div>
                                  <div className="px-4 py-2.5 space-y-1">
                                    <div className="font-semibold text-sm flex items-center gap-1.5">
                                      <User className="w-3.5 h-3.5" /> {meta.cliente_nome as string}
                                    </div>
                                    <div className={`text-xs ${isMe ? 'text-white/70' : 'opacity-70'}`}>
                                      Status: {meta.cliente_status as string} · Tel: {meta.cliente_telefone as string}
                                    </div>
                                    <button onClick={() => navigate(`/clientes?clienteId=${meta.cliente_id}`)} className={`text-xs underline flex items-center gap-1 mt-1 ${isMe ? 'text-white/60 hover:text-white/90' : 'opacity-60 hover:opacity-100'}`}>
                                      <ExternalLink className="w-3 h-3" /> Abrir ficha
                                    </button>
                                  </div>
                                  <div className={`px-4 py-1 text-[10px] text-right ${isMe ? 'text-white/40' : 'text-muted-foreground'}`}>
                                    {formatTime(msg.created_at)}
                                    {isMe && msg.lida && <CheckCheck className="w-3 h-3 inline ml-1 text-amber-200" />}
                                  </div>
                                </div>
                              ) : tipo === 'atencao_emprestimo' ? (
                                <div className={`max-w-[75%] rounded-2xl overflow-hidden shadow-md ${
                                  isMe
                                    ? 'bg-gradient-to-br from-orange-500 to-red-500 text-white shadow-orange-500/20'
                                    : 'bg-orange-50 dark:bg-orange-900/30 text-orange-900 dark:text-orange-100 border border-orange-200/50 dark:border-orange-700/30'
                                }`}>
                                  <div className="px-4 py-1.5 flex items-center gap-1.5 text-[10px] font-bold tracking-wider opacity-80 border-b border-black/10 dark:border-white/10">
                                    <AlertTriangle className="w-3 h-3" /> ATENÇÃO — EMPRÉSTIMO
                                  </div>
                                  <div className="px-4 py-2.5 space-y-1">
                                    <div className="font-semibold text-sm flex items-center gap-1.5">
                                      <Wallet className="w-3.5 h-3.5" /> {meta.cliente_nome as string}
                                    </div>
                                    <div className={`text-xs ${isMe ? 'text-white/70' : 'opacity-70'}`}>
                                      R$ {Number(meta.valor_total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} · {meta.parcelas_pagas as number}/{meta.total_parcelas as number} parcelas · {meta.status as string}
                                    </div>
                                    <button onClick={() => navigate(`/clientes/emprestimos?emprestimoId=${meta.emprestimo_id}`)} className={`text-xs underline flex items-center gap-1 mt-1 ${isMe ? 'text-white/60 hover:text-white/90' : 'opacity-60 hover:opacity-100'}`}>
                                      <ExternalLink className="w-3 h-3" /> Ver empréstimo
                                    </button>
                                  </div>
                                  <div className={`px-4 py-1 text-[10px] text-right ${isMe ? 'text-white/40' : 'text-muted-foreground'}`}>
                                    {formatTime(msg.created_at)}
                                    {isMe && msg.lida && <CheckCheck className="w-3 h-3 inline ml-1 text-orange-200" />}
                                  </div>
                                </div>
                              ) : (
                                <div className={`max-w-[70%] px-4 py-2.5 text-sm ${isMe ? sentRound : recvRound} ${isMe ? sentBubble : recvBubble}`}>
                                  <p className="whitespace-pre-wrap break-words">{msg.conteudo}</p>
                                  <div className={`text-[10px] mt-1 flex items-center gap-1 ${timeClasses}`}>
                                    <span>{formatTime(msg.created_at)}</span>
                                    {isMe && msg.lida && <CheckCheck className="w-3 h-3 text-indigo-200" />}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })
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
                  ) : mode === 'equipe' ? (
                    /* ── Equipe input with audio + atenção ── */
                    <div className="space-y-2">
                      {/* Atenção Panel */}
                      {showAtencaoEquipe && isAdminEquipe && (
                        <div className="rounded-lg border p-3 space-y-2 bg-muted/50">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-amber-400" /> Enviar Atenção</span>
                            <button onClick={() => setShowAtencaoEquipe(false)} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" variant={atencaoTipoEquipe === 'cliente' ? 'default' : 'outline'} onClick={() => { setAtencaoTipoEquipe('cliente'); setAtencaoItemIdEquipe(''); }} className="flex-1 text-xs">
                              <User className="w-3 h-3 mr-1" /> Cliente
                            </Button>
                            <Button size="sm" variant={atencaoTipoEquipe === 'emprestimo' ? 'default' : 'outline'} onClick={() => { setAtencaoTipoEquipe('emprestimo'); setAtencaoItemIdEquipe(''); }} className="flex-1 text-xs">
                              <Wallet className="w-3 h-3 mr-1" /> Empréstimo
                            </Button>
                          </div>
                          {atencaoTipoEquipe === 'cliente' ? (
                            <Select value={atencaoItemIdEquipe} onValueChange={setAtencaoItemIdEquipe}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione um cliente..." /></SelectTrigger>
                              <SelectContent>
                                {allClientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Select value={atencaoItemIdEquipe} onValueChange={setAtencaoItemIdEquipe}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione um empréstimo..." /></SelectTrigger>
                              <SelectContent>
                                {emprestimos.map((e) => {
                                  const cn = allClientes.find((c) => c.id === e.clienteId)?.nome ?? '';
                                  return <SelectItem key={e.id} value={e.id}>{cn} — R$ {Number(e.valor).toLocaleString('pt-BR')}</SelectItem>;
                                })}
                              </SelectContent>
                            </Select>
                          )}
                          <Button size="sm" className="w-full" disabled={!atencaoItemIdEquipe || isSending} onClick={handleSendAtencaoEquipe}>
                            {isSending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Send className="w-3 h-3 mr-1" />} Enviar
                          </Button>
                        </div>
                      )}

                      {/* Audio recording indicator */}
                      {audioEquipe.isRecording && (
                        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                          <span className="text-sm text-red-400 flex-1">Gravando... {formatDuration(audioEquipe.duration)}</span>
                          <button onClick={audioEquipe.cancel} className="text-muted-foreground hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                          <button onClick={audioEquipe.stop} className="text-red-400 hover:text-red-300"><Square className="w-4 h-4" /></button>
                        </div>
                      )}

                      {/* Recorded audio ready to send */}
                      {audioEquipe.blob && !audioEquipe.isRecording && (
                        <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
                          <Mic className="w-4 h-4 text-primary" />
                          <span className="text-sm flex-1">{formatDuration(audioEquipe.duration)}s gravado</span>
                          <button onClick={audioEquipe.clear} className="text-muted-foreground hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                          <Button size="sm" onClick={handleSendAudioEquipe} disabled={enviarAudioEquipe.isPending}>
                            {enviarAudioEquipe.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3 mr-1" />} Enviar
                          </Button>
                        </div>
                      )}

                      {/* Main input row */}
                      {!audioEquipe.isRecording && !audioEquipe.blob && (
                        <div className="flex gap-2">
                          {isAdminEquipe && (
                            <Button size="icon" variant="ghost" onClick={() => setShowAtencaoEquipe(!showAtencaoEquipe)} title="Enviar atenção">
                              <AlertTriangle className="w-4 h-4 text-amber-400" />
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" onClick={audioEquipe.start} title="Gravar áudio">
                            <Mic className="w-4 h-4" />
                          </Button>
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
                            className="bg-blue-600 hover:bg-blue-700"
                          >
                            {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                          </Button>
                        </div>
                      )}
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
