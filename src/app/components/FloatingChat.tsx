/**
 * @module FloatingChat
 * @description Widget de chat interno flutuante (bottom-right).
 *
 * Funcionalidades:
 * - Chat em tempo real entre admin e funcionários (Supabase Realtime)
 * - Gravação e envio de áudio (MediaRecorder)
 * - Admin/gerência podem enviar cards de atenção (cliente ou empréstimo)
 * - Badge com contagem de não-lidas
 */
import { useState, useRef, useEffect } from 'react';
import {
  MessageCircle, X, ArrowLeft, Send, Loader2, ChevronDown,
  Mic, Square, Trash2, AlertTriangle, User, Wallet, ExternalLink, Play, Pause,
} from 'lucide-react';
import { useNavigate } from 'react-router';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from './ui/command';
import { useAuth } from '../contexts/AuthContext';
import {
  useUsuariosChat,
  useMensagensInternas,
  useNaoLidasChatInterno,
  useNaoLidasPorRemetente,
  useEnviarMensagemInterna,
  useMarcarLidasChatInterno,
  useEnviarAudioInterno,
  useEnviarAtencaoCliente,
  useEnviarAtencaoEmprestimo,
} from '../hooks/useChatInterno';
import { useClientes } from '../hooks/useClientes';
import { useEmprestimos } from '../hooks/useEmprestimos';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import type { ChatInterno } from '../lib/database.types';
import Lottie from 'lottie-react';

import Chat from '../assets/animations/chat.json';

type View = 'contacts' | 'chat' | 'atencao';

// ── Combobox pesquisável ──
function SearchableCombobox({
  value,
  onChange,
  items,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  items: { id: string; label: string; sub?: string }[];
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = items.find((i) => i.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-full h-9 flex items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm hover:bg-purple-500/40 transition-colors text-left"
        >
          <span className="truncate flex-1">
            {selected ? selected.label : <span className="text-muted-foreground">{placeholder}</span>}
          </span>
          <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground ml-1" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-0"
        align="start"
        side="top"
        sideOffset={4}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command>
          <CommandInput placeholder="Buscar por nome ou CPF..." className="h-9" />
          <CommandList className="max-h-52">
            <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
            <CommandGroup>
              {items.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`${item.label} ${item.sub ?? ''}`}
                  onSelect={() => { onChange(item.id); setOpen(false); }}
                  className="flex flex-col items-start gap-0"
                >
                  <span className="font-medium text-sm">{item.label}</span>
                  {item.sub && <span className="text-[11px] text-muted-foreground">{item.sub}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const roleLabel: Record<string, string> = {
  admin: 'Admin',
  gerencia: 'Gerência',
  cobranca: 'Cobrança',
  comercial: 'Comercial',
  cliente: 'Cliente',
};

const canSendAtencao = (role?: string) => role === 'admin' || role === 'gerencia';

const WAVE_BARS = [60, 90, 40, 100, 70, 85, 35, 95, 55, 80, 65, 100, 45, 75, 90, 50, 85, 60, 95, 70];

// ── Player de áudio customizado com waveform ──
function AudioPlayerInline({ src, duration, isMe }: { src: string; duration?: number; isMe: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [cur, setCur] = useState(0);

  useEffect(() => {
    const el = ref.current;
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
    const el = ref.current;
    if (!el) return;
    if (playing) el.pause(); else el.play();
    setPlaying(!playing);
  };

  const fmtSec = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;

  return (
    <div className="flex items-center gap-2.5 min-w-[150px]">
      <audio ref={ref} src={src} preload="metadata" className="hidden" />
      <button
        onClick={toggle}
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all ${
          isMe
            ? 'bg-white/20 hover:bg-white/30 text-white'
            : 'bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-400'
        }`}
      >
        {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-end gap-[2px] h-4">
          {WAVE_BARS.map((h, i) => {
            const filled = (i / WAVE_BARS.length) * 100 < progress;
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
          <span>{fmtSec(cur)}</span>
          <span>{fmtSec(duration ?? 0)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Componente de renderização de mensagem ──
function MsgBubble({ msg, isMe, formatTime, navigate }: {
  msg: ChatInterno;
  isMe: boolean;
  formatTime: (ts: string) => string;
  navigate: (path: string) => void;
}) {
  const meta = (msg.metadata ?? {}) as Record<string, unknown>;
  const tipo = (msg as any).tipo || 'texto';

  const sentBubble = 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/20';
  const recvBubble = 'bg-white/80 dark:bg-slate-700/60 text-foreground border border-white/30 dark:border-slate-600/30 shadow-sm';
  const sentRound = 'rounded-2xl rounded-br-md';
  const recvRound = 'rounded-2xl rounded-bl-md';

  // Áudio
  if (tipo === 'audio') {
    return (
      <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
        <div className={`max-w-[85%] ${isMe ? sentRound : recvRound} ${isMe ? sentBubble : recvBubble} px-3 py-2.5`}>
          <AudioPlayerInline src={meta.audio_url as string} duration={meta.duracao_seg as number} isMe={isMe} />
          <span className={`text-[10px] block mt-1 ${isMe ? 'text-right text-white/40' : 'text-muted-foreground'}`}>
            {formatTime(msg.created_at)}
          </span>
        </div>
      </div>
    );
  }

  // Card atenção cliente
  if (tipo === 'atencao_cliente') {
    return (
      <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
        <div className={`max-w-[85%] rounded-2xl overflow-hidden shadow-md ${
          isMe
            ? 'bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-amber-500/20'
            : 'bg-amber-50 dark:bg-amber-900/30 text-amber-900 dark:text-amber-100 border border-amber-200/50 dark:border-amber-700/30'
        }`}>
          <div className="px-3 py-1.5 flex items-center gap-1.5 text-[10px] font-bold tracking-wider opacity-80 border-b border-black/10 dark:border-white/10">
            <AlertTriangle className="w-3 h-3" /> ATENÇÃO — CLIENTE
          </div>
          <div className="px-3 py-2 space-y-1">
            <div className="font-semibold text-sm flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" /> {meta.cliente_nome as string}
            </div>
            <div className={`text-[11px] ${isMe ? 'text-white/70' : 'opacity-70'}`}>
              Status: {meta.cliente_status as string} · Tel: {meta.cliente_telefone as string}
            </div>
            <button
              onClick={() => navigate(`/clientes?clienteId=${meta.cliente_id}`)}
              className={`text-[10px] underline flex items-center gap-1 mt-0.5 ${isMe ? 'text-white/60 hover:text-white/90' : 'opacity-60 hover:opacity-100'}`}
            >
              <ExternalLink className="w-2.5 h-2.5" /> Abrir ficha
            </button>
          </div>
          <div className={`px-3 py-1 text-[10px] text-right ${isMe ? 'text-white/40' : 'text-muted-foreground'}`}>
            {formatTime(msg.created_at)}
          </div>
        </div>
      </div>
    );
  }

  // Card atenção empréstimo
  if (tipo === 'atencao_emprestimo') {
    return (
      <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
        <div className={`max-w-[85%] rounded-2xl overflow-hidden shadow-md ${
          isMe
            ? 'bg-gradient-to-br from-orange-500 to-red-500 text-white shadow-orange-500/20'
            : 'bg-orange-50 dark:bg-orange-900/30 text-orange-900 dark:text-orange-100 border border-orange-200/50 dark:border-orange-700/30'
        }`}>
          <div className="px-3 py-1.5 flex items-center gap-1.5 text-[10px] font-bold tracking-wider opacity-80 border-b border-black/10 dark:border-white/10">
            <AlertTriangle className="w-3 h-3" /> ATENÇÃO — EMPRÉSTIMO
          </div>
          <div className="px-3 py-2 space-y-1">
            <div className="font-semibold text-sm flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5" /> {meta.cliente_nome as string}
            </div>
            <div className={`text-[11px] ${isMe ? 'text-white/70' : 'opacity-70'}`}>
              R$ {Number(meta.valor_total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} · {meta.parcelas_pagas as number}/{meta.total_parcelas as number} parcelas · {meta.status as string}
            </div>
            <button
              onClick={() => navigate(`/clientes/emprestimos?emprestimoId=${meta.emprestimo_id}`)}
              className={`text-[10px] underline flex items-center gap-1 mt-0.5 ${isMe ? 'text-white/60 hover:text-white/90' : 'opacity-60 hover:opacity-100'}`}
            >
              <ExternalLink className="w-2.5 h-2.5" /> Ver empréstimo
            </button>
          </div>
          <div className={`px-3 py-1 text-[10px] text-right ${isMe ? 'text-white/40' : 'text-muted-foreground'}`}>
            {formatTime(msg.created_at)}
          </div>
        </div>
      </div>
    );
  }

  // Texto padrão
  return (
    <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[75%] px-3.5 py-2 text-sm ${isMe ? sentRound : recvRound} ${isMe ? sentBubble : recvBubble}`}>
        <p className="whitespace-pre-wrap break-words">{msg.conteudo}</p>
        <span className={`text-[10px] block mt-1 ${isMe ? 'text-right text-white/40' : 'text-muted-foreground'}`}>
          {formatTime(msg.created_at)}
        </span>
      </div>
    </div>
  );
}

export function FloatingChat() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('contacts');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUserName, setSelectedUserName] = useState('');
  const [message, setMessage] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Atenção state
  const [atencaoTipo, setAtencaoTipo] = useState<'cliente' | 'emprestimo'>('cliente');
  const [atencaoItemId, setAtencaoItemId] = useState('');

  const meuId = user?.id;
  const isAdmin = canSendAtencao(user?.role);

  const { data: usuarios = [] } = useUsuariosChat(meuId);
  const { data: totalNaoLidas = 0 } = useNaoLidasChatInterno(meuId);
  const { data: naoLidasPorUser = {} } = useNaoLidasPorRemetente(meuId);
  const { data: mensagens = [] } = useMensagensInternas(meuId, selectedUserId ?? undefined);
  const enviar = useEnviarMensagemInterna();
  const marcarLidas = useMarcarLidasChatInterno();
  const enviarAudio = useEnviarAudioInterno();
  const enviarAtCliente = useEnviarAtencaoCliente();
  const enviarAtEmprestimo = useEnviarAtencaoEmprestimo();

  const { data: clientes = [] } = useClientes();
  const { data: emprestimos = [] } = useEmprestimos();

  const audio = useAudioRecorder();

  // Auto-scroll ao receber mensagens
  useEffect(() => {
    if (view === 'chat') {
      scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [mensagens, view]);

  // Marcar como lidas quando abre conversa
  useEffect(() => {
    if (view === 'chat' && meuId && selectedUserId && (naoLidasPorUser[selectedUserId] ?? 0) > 0) {
      marcarLidas.mutate({ meuId, deUserId: selectedUserId });
    }
  }, [view, selectedUserId, meuId, naoLidasPorUser]);

  const handleOpenChat = (userId: string, name: string) => {
    setSelectedUserId(userId);
    setSelectedUserName(name);
    setView('chat');
  };

  const handleBack = () => {
    setView('contacts');
    setSelectedUserId(null);
    setMessage('');
    audio.cancel();
  };

  const handleSend = async () => {
    if (!message.trim() || !meuId || !selectedUserId) return;
    try {
      await enviar.mutateAsync({
        de_user_id: meuId,
        para_user_id: selectedUserId,
        conteudo: message.trim(),
      });
      setMessage('');
    } catch (err) {
      console.error('Erro ao enviar mensagem interna:', err);
    }
  };

  const handleSendAudio = async () => {
    if (!audio.blob || !meuId || !selectedUserId) return;
    try {
      await enviarAudio.mutateAsync({
        deUserId: meuId,
        paraUserId: selectedUserId,
        blob: audio.blob,
        duracaoSeg: audio.duration,
      });
      audio.clear();
    } catch (err) {
      console.error('Erro ao enviar áudio:', err);
    }
  };

  const handleSendAtencao = async () => {
    if (!meuId || !selectedUserId || !atencaoItemId) return;
    try {
      if (atencaoTipo === 'cliente') {
        const cli = clientes.find((c) => c.id === atencaoItemId);
        if (!cli) return;
        await enviarAtCliente.mutateAsync({
          deUserId: meuId,
          paraUserId: selectedUserId,
          cliente: { id: cli.id, nome: cli.nome, status: cli.status, telefone: cli.telefone },
        });
      } else {
        const emp = emprestimos.find((e) => e.id === atencaoItemId);
        if (!emp) return;
        const cliNome = clientes.find((c) => c.id === emp.clienteId)?.nome ?? 'Cliente';
        await enviarAtEmprestimo.mutateAsync({
          deUserId: meuId,
          paraUserId: selectedUserId,
          emprestimo: {
            id: emp.id,
            cliente_nome: cliNome,
            valor_total: emp.valor,
            parcelas_pagas: emp.parcelasPagas,
            total_parcelas: emp.parcelas,
            status: emp.status,
          },
        });
      }
      setView('chat');
      setAtencaoItemId('');
    } catch (err) {
      console.error('Erro ao enviar atenção:', err);
    }
  };

  const formatTime = (ts: string) =>
    new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const isBusy = enviar.isPending || enviarAudio.isPending || enviarAtCliente.isPending || enviarAtEmprestimo.isPending;

  if (!user) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* Janela expandida */}
      {open && (
        <div className="w-96 h-[580px] rounded-2xl shadow-2xl border border-border/60 bg-slate-800 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-200">
          {/* Header */}
          <div className="px-4 py-3 border-b bg-primary text-primary-foreground flex items-center gap-2">
            {(view === 'chat' || view === 'atencao') && (
              <button
                onClick={() => (view === 'atencao' ? setView('chat') : handleBack())}
                className="hover:opacity-80 transition-opacity"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <span className="font-semibold text-sm flex-1 truncate">
              {view === 'contacts'
                ? 'Chat Interno'
                : view === 'atencao'
                  ? 'Enviar Atenção'
                  : selectedUserName}
            </span>
            <button onClick={() => setOpen(false)} className="hover:opacity-80 transition-opacity">
              <X className="w-4 h-4" />
            </button>
          </div>

          {view === 'contacts' ? (
            /* ── Lista de contatos ── */
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-0.5">
                {usuarios.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Nenhum usuário disponível
                  </p>
                ) : (
                  usuarios.map((u) => {
                    const naoLidas = naoLidasPorUser[u.id] ?? 0;
                    return (
                      <button
                        key={u.id}
                        onClick={() => handleOpenChat(u.id, u.name)}
                        className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-muted transition-colors flex items-center gap-3"
                      >
                        <div className="w-9 h-9 rounded-full bg-primary/20 text-primary flex items-center justify-center font-semibold text-sm shrink-0">
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-sm truncate">{u.name}</span>
                            {naoLidas > 0 && (
                              <Badge className="bg-red-500 text-white text-[10px] px-1.5 min-w-[20px] justify-center">
                                {naoLidas}
                              </Badge>
                            )}
                          </div>
                          <span className="text-[11px] text-muted-foreground">
                            {roleLabel[u.role] ?? u.role}
                          </span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </ScrollArea>

          ) : view === 'atencao' ? (
            /* ── Tela de atenção (admin/gerência) ── */
            <div className="flex-1 flex flex-col p-3 gap-3">
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={atencaoTipo === 'cliente' ? 'default' : 'outline'}
                  onClick={() => { setAtencaoTipo('cliente'); setAtencaoItemId(''); }}
                  className="flex-1 text-xs"
                >
                  <User className="w-3 h-3 mr-1" /> Cliente
                </Button>
                <Button
                  size="sm"
                  variant={atencaoTipo === 'emprestimo' ? 'default' : 'outline'}
                  onClick={() => { setAtencaoTipo('emprestimo'); setAtencaoItemId(''); }}
                  className="flex-1 text-xs"
                >
                  <Wallet className="w-3 h-3 mr-1" /> Empréstimo
                </Button>
              </div>

              {atencaoTipo === 'cliente' ? (
                <SearchableCombobox
                  value={atencaoItemId}
                  onChange={setAtencaoItemId}
                  placeholder="Selecione um cliente..."
                  items={clientes.map((c) => ({
                    id: c.id,
                    label: c.nome,
                    sub: [(c as any).cpf, c.telefone].filter(Boolean).join(' · '),
                  }))}
                />
              ) : (
                <SearchableCombobox
                  value={atencaoItemId}
                  onChange={setAtencaoItemId}
                  placeholder="Selecione um empréstimo..."
                  items={emprestimos.map((e) => {
                    const cli = clientes.find((c) => c.id === e.clienteId);
                    return {
                      id: e.id,
                      label: cli?.nome ?? 'Cliente',
                      sub: [(cli as any)?.cpf, `R$ ${Number(e.valor).toLocaleString('pt-BR')}`].filter(Boolean).join(' · '),
                    };
                  })}
                />
              )}

              {atencaoItemId && (
                <div className="rounded-lg border p-3 text-xs bg-muted/50 space-y-1">
                  {atencaoTipo === 'cliente' ? (() => {
                    const c = clientes.find((x) => x.id === atencaoItemId);
                    return c ? (
                      <>
                        <p className="font-semibold">{c.nome}</p>
                        <p>Status: {c.status}</p>
                        <p>Tel: {c.telefone}</p>
                      </>
                    ) : null;
                  })() : (() => {
                    const e = emprestimos.find((x) => x.id === atencaoItemId);
                    const cn = e ? clientes.find((c) => c.id === e.clienteId)?.nome : '';
                    return e ? (
                      <>
                        <p className="font-semibold">{cn}</p>
                        <p>Valor: R$ {Number(e.valor).toLocaleString('pt-BR')}</p>
                        <p>Parcelas: {e.parcelasPagas}/{e.parcelas}</p>
                        <p>Status: {e.status}</p>
                      </>
                    ) : null;
                  })()}
                </div>
              )}

              <Button
                className="mt-auto"
                disabled={!atencaoItemId || isBusy}
                onClick={handleSendAtencao}
              >
                {isBusy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <AlertTriangle className="w-4 h-4 mr-2" />}
                Enviar Atenção
              </Button>
            </div>

          ) : (
            /* ── Janela de conversa ── */
            <div className="flex flex-col flex-1 min-h-0">
              <ScrollArea className="flex-1 min-h-0 px-3 py-2">
                <div className="space-y-2">
                  {mensagens.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-8">
                      Nenhuma mensagem ainda. Diga olá!
                    </p>
                  ) : (
                    mensagens.map((msg) => (
                      <MsgBubble key={msg.id} msg={msg} isMe={msg.de_user_id === meuId} formatTime={formatTime} navigate={navigate} />
                    ))
                  )}
                  <div ref={scrollRef} />
                </div>
              </ScrollArea>

              {/* Input area */}
              <div className="p-2 border-t space-y-1.5 shrink-0">
                {/* Recording indicator */}
                {audio.isRecording && (
                  <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-xs text-red-400 flex-1">
                      Gravando... {formatDuration(audio.duration)}
                    </span>
                    <button onClick={audio.cancel} className="text-muted-foreground hover:text-red-400" title="Cancelar">
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button onClick={audio.stop} className="text-red-400 hover:text-red-300" title="Parar">
                      <Square className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* Recorded audio ready to send */}
                {audio.blob && !audio.isRecording && (
                  <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-1.5">
                    <Mic className="w-4 h-4 text-primary" />
                    <span className="text-xs flex-1">{formatDuration(audio.duration)}s gravado</span>
                    <button onClick={audio.clear} className="text-muted-foreground hover:text-red-400" title="Descartar">
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <Button size="sm" className="h-7 text-xs" onClick={handleSendAudio} disabled={enviarAudio.isPending}>
                      {enviarAudio.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3 mr-1" />}
                      Enviar
                    </Button>
                  </div>
                )}

                {/* Main input row */}
                {!audio.isRecording && !audio.blob && (
                  <div className="flex gap-1.5">
                    {isAdmin && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-9 w-9 shrink-0"
                        onClick={() => setView('atencao')}
                        title="Enviar atenção"
                      >
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9 shrink-0"
                      onClick={audio.start}
                      title="Gravar áudio"
                    >
                      <Mic className="w-4 h-4" />
                    </Button>
                    <Input
                      placeholder="Mensagem..."
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      className="flex-1 h-9 text-sm"
                      disabled={isBusy}
                    />
                    <Button
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      onClick={handleSend}
                      disabled={!message.trim() || isBusy}
                    >
                      {enviar.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Botão flutuante */}
      <button
        onClick={() => setOpen(!open)}
        className="w-24 h-24 rounded-full bg-black-800/20 text-primary-foreground hover:shadow-base transition-all duration-200 flex items-center justify-center hover:scale-105 active:scale-95 relative"
      >
        {open ? (
          <ChevronDown className="w-6 h-6" />
        ) : (
          <Lottie
            animationData={Chat}
            loop
            className="w-24 h-24"
          />
        )}
        {!open && totalNaoLidas > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1">
            {totalNaoLidas > 99 ? '99+' : totalNaoLidas}
          </span>
        )}
      </button>
    </div>
  );
}
