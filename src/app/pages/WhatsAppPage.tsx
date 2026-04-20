/**
 * @module WhatsAppPage
 * @description Painel de integração com WhatsApp via Evolution API.
 *
 * Gerencia instâncias WhatsApp (criar, conectar via QR, desconectar),
 * exibe conversas reais do whatsapp_mensagens_log com Realtime,
 * e permite envio de mensagens via Edge Function send-whatsapp.
 *
 * @route /comunicacao/whatsapp
 * @access Protegido — perfis admin, gerência
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { ScrollArea } from '../components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog';
import {
  Send, Phone, CheckCheck, Clock, Search, Paperclip, Smile,
  Plus, Wifi, WifiOff, QrCode, RefreshCw, Trash2, Settings,
  MessageSquare, ArrowDownUp, AlertCircle, Loader2,
  Mic, Square, Image as ImageIcon, Video, FileText, Play, Download,
  Tag, UserPlus, X, User,
} from 'lucide-react';
import {
  useInstancias,
  useCriarInstancia,
  useConectarInstancia,
  useDesconectarInstancia,
  useDeletarInstancia,
  useConversasWhatsapp,
  useMensagensWhatsapp,
  useEnviarWhatsapp,
  useEstatisticasWhatsapp,
  useConfigurarWebhook,
  useSyncInstancias,
  useSetAsSystem,
} from '../hooks/useWhatsapp';
import { statusInstancia, conectarInstancia } from '../services/whatsappService';
import { supabase } from '../lib/supabase';
import { useClientes } from '../hooks/useClientes';
import {
  useEtiquetas,
  useConversaEtiquetas,
  useToggleConversaEtiqueta,
  useConversaClientes,
  useVincularCliente,
  useDesvincularCliente,
} from '../hooks/useEtiquetas';
import { useCreateTicket, useTicketsByCliente } from '../hooks/useTickets';
import { useAuth } from '../contexts/AuthContext';

// ── Conversor áudio → WAV 16 kHz mono (via Web Audio API) ─────────────
// Funciona com QUALQUER formato que o browser grave (WebM/Opus, OGG/Opus, MP4/AAC).
// A API de áudio decodifica para PCM float, OfflineAudioContext reamostre para
// 16 kHz mono, resultado é WAV PCM Int16 — formato universal para ffmpeg.
// Tamanho: ≈2 KB/s de áudio → 10 s = ~320 KB como base64. Sem risco de timeout.
async function audioToWav(blob: Blob): Promise<{ wavBlob: Blob; durationSec: number }> {
  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new AudioContext();
  let rawBuffer: AudioBuffer;
  try {
    rawBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  } finally {
    await audioCtx.close();
  }
  const durationSec = rawBuffer.duration;

  // Reamostragem para 16 kHz mono via OfflineAudioContext
  const targetRate = 16000;
  const targetFrames = Math.ceil(rawBuffer.duration * targetRate) || 1;
  const offCtx = new OfflineAudioContext(1, targetFrames, targetRate);
  const src = offCtx.createBufferSource();
  src.buffer = rawBuffer;
  src.connect(offCtx.destination);
  src.start(0);
  const resampled = await offCtx.startRendering();

  // Escrever WAV PCM Int16 com header RIFF
  const samples = resampled.getChannelData(0);
  const dataSize = samples.length * 2;
  const wavBuf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(wavBuf);
  const ws = (off: number, s: string) =>
    s.split('').forEach((c, i) => v.setUint8(off + i, c.charCodeAt(0)));
  ws(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true);
  ws(8, 'WAVE'); ws(12, 'fmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);  // PCM
  v.setUint16(22, 1, true);  // mono
  v.setUint32(24, targetRate, true);
  v.setUint32(28, targetRate * 2, true);  // byteRate
  v.setUint16(32, 2, true);  // blockAlign
  v.setUint16(34, 16, true); // bitsPerSample
  ws(36, 'data'); v.setUint32(40, dataSize, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return { wavBlob: new Blob([wavBuf], { type: 'audio/wav' }), durationSec };
}

// ── Upload de mídia para Supabase Storage ────────────────
// Faz upload de um Blob e retorna a URL pública. Usar URL em vez de base64
// garante compatibilidade com a Evolution API e reprodução sem chiado.
async function uploadMediaToStorage(blob: Blob, folder: string, filename: string): Promise<string> {
  const path = `${folder}/${Date.now()}-${filename}`;
  const { error } = await supabase.storage
    .from('whatsapp-media')
    .upload(path, blob, { contentType: blob.type, upsert: false });
  if (error) throw new Error(`Falha ao fazer upload: ${error.message}`);
  const { data } = supabase.storage.from('whatsapp-media').getPublicUrl(path);
  return data.publicUrl;
}

// ── Helpers de avatar ─────────────────────────────────────
const AVATAR_COLORS = [
  'bg-green-600', 'bg-blue-600', 'bg-purple-600', 'bg-orange-500',
  'bg-rose-600', 'bg-teal-600', 'bg-indigo-600', 'bg-amber-600',
];

function getAvatarColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(pushName: string | null, telefone: string): string {
  if (pushName?.trim()) {
    const parts = pushName.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : pushName.slice(0, 2).toUpperCase();
  }
  return telefone.replace(/\D/g, '').slice(-2);
}

function formatPhone(tel: string): string {
  const d = tel.replace(/\D/g, '');
  if (d.length === 13) return `+${d.slice(0,2)} (${d.slice(2,4)}) ${d.slice(4,9)}-${d.slice(9)}`;
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  return tel;
}



// ── Player de mensagem de voz ────────────────────────────
// Resolve o WebM sem Duration header usando o trick seekToEnd:
// seta currentTime=Infinity → browser escaneia até o fim e reporta duração real.
function VoicePlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = src;
    // Seek-to-end trick: força o browser a escanear o arquivo WebM inteiro
    // e calcular a duração real (WebM gravado pelo MediaRecorder não tem Duration no header).
    audio.preload = 'metadata';
    let durationFixed = false; // flag one-shot para não resetar currentTime durante playback

    const onLoaded = () => {
      if (audio.duration === Infinity || isNaN(audio.duration)) {
        audio.currentTime = 1e10; // seek para o fim → browser descobre duração
      } else {
        setDuration(audio.duration);
        durationFixed = true;
        setReady(true);
      }
    };
    const onTimeUpdate = () => {
      if (!durationFixed && audio.duration !== Infinity && !isNaN(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
        audio.currentTime = 0; // voltar ao início depois de descobrir a duração
        durationFixed = true;
        setReady(true);
      }
      setCurrent(audio.currentTime);
    };
    const onEnded = () => { setIsPlaying(false); setCurrent(0); };
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.load();
    return () => {
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
    };
  }, [src]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio || !ready) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      // play() retorna Promise — deve ser capturada ou o browser lança
      // "Unhandled Promise Rejection: AbortError" quando o elemento é
      // interrompido (ex: src muda, StrictMode double-mount, etc.)
      audio.play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }
  };

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (current / duration) * 100 : 0;

  return (
    <div className="flex items-center gap-2 min-w-[200px] max-w-[280px]">
      <audio ref={audioRef} className="hidden" />
      <button
        onClick={toggle}
        disabled={!ready}
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${
          ready
            ? 'bg-green-600 hover:bg-green-700 text-white'
            : 'bg-muted text-muted-foreground cursor-wait'
        }`}
      >
        {!ready ? (
          <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : isPlaying ? (
          <span className="flex gap-0.5">
            <span className="w-1 h-3.5 bg-current rounded" />
            <span className="w-1 h-3.5 bg-current rounded" />
          </span>
        ) : (
          <Play className="w-3.5 h-3.5 fill-current" />
        )}
      </button>
      <div className="flex-1 flex flex-col gap-1">
        <div
          className="w-full h-2 bg-black/10 dark:bg-white/20 rounded-full overflow-hidden cursor-pointer"
          onClick={(e) => {
            const audio = audioRef.current;
            if (!audio || !ready || !duration) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            audio.currentTime = pct * duration;
          }}
        >
          <div
            className="h-full bg-green-600 rounded-full transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-[10px] text-muted-foreground">
          {isPlaying || current > 0 ? fmt(current) : fmt(duration)}
        </span>
      </div>
    </div>
  );
}

// ── Componente de conteúdo de mensagem (renderiza mídia) ──
function MessageContent({ msg, onImageClick, localMediaUrls }: {
  msg: { tipo: string; conteudo: string | null; metadata: Record<string, unknown> };
  onImageClick?: (url: string) => void;
  localMediaUrls?: Map<string, string>;
}) {
  const meta = msg.metadata ?? {};
  const rawMediaUrl = typeof meta.media_url === 'string' ? meta.media_url : null;
  // Preferir blob URL local (sem latência, sem CORS, com duration correta) se disponível
  const mediaUrl = rawMediaUrl && localMediaUrls?.has(rawMediaUrl)
    ? localMediaUrls.get(rawMediaUrl)!
    : rawMediaUrl;
  const mimetype = typeof meta.media_mimetype === 'string' ? meta.media_mimetype : '';

  if (msg.tipo === 'image') {
    return (
      <div className="space-y-1">
        {mediaUrl ? (
          <button
            type="button"
            className="block w-full text-left"
            onClick={() => onImageClick?.(mediaUrl)}
          >
            <img
              src={mediaUrl}
              alt="Imagem"
              className="max-w-full min-w-[200px] rounded-lg max-h-96 object-cover cursor-zoom-in hover:opacity-90 transition-opacity"
              loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }}
            />
            <div className="hidden flex items-center gap-2 text-xs text-muted-foreground py-2">
              <ImageIcon className="w-4 h-4" /> Imagem não disponível
            </div>
          </button>
        ) : (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-black/5 dark:bg-white/5 rounded-lg p-3">
            <ImageIcon className="w-5 h-5 shrink-0" />
            <span>📷 Imagem</span>
          </div>
        )}
        {msg.conteudo && <p className="text-sm whitespace-pre-wrap break-words">{msg.conteudo}</p>}
      </div>
    );
  }

  if (msg.tipo === 'video') {
    return (
      <div className="space-y-1">
        {mediaUrl ? (
          <video
            controls
            preload="metadata"
            className="max-w-full rounded-lg max-h-64"
            onError={(e) => { (e.target as HTMLVideoElement).style.display = 'none'; (e.target as HTMLVideoElement).nextElementSibling?.classList.remove('hidden'); }}
          >
            <source src={mediaUrl} type={mimetype || 'video/mp4'} />
          </video>
        ) : (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-black/5 dark:bg-white/5 rounded-lg p-3">
            <Video className="w-5 h-5 shrink-0" />
            <span>🎬 Vídeo</span>
          </div>
        )}
        {msg.conteudo && <p className="text-sm whitespace-pre-wrap break-words">{msg.conteudo}</p>}
      </div>
    );
  }

  if (msg.tipo === 'audio') {
    return (
      <div>
        {mediaUrl
          ? <VoicePlayer src={mediaUrl} />
          : (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-black/5 dark:bg-white/5 rounded-lg p-3 min-w-[180px]">
              <Play className="w-5 h-5 shrink-0" />
              <span>🎵 Áudio</span>
            </div>
          )
        }
      </div>
    );
  }

  if (msg.tipo === 'document') {
    return (
      <div className="flex items-center gap-3 bg-black/5 dark:bg-white/5 rounded-lg p-3">
        <FileText className="w-8 h-8 text-blue-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{msg.conteudo || 'Documento'}</p>
          <p className="text-xs text-muted-foreground">{mimetype || 'Arquivo'}</p>
        </div>
        {mediaUrl && (
          <a href={mediaUrl} target="_blank" rel="noopener noreferrer" download>
            <Download className="w-5 h-5 text-muted-foreground hover:text-foreground transition-colors" />
          </a>
        )}
      </div>
    );
  }

  if (msg.tipo === 'sticker') {
    return mediaUrl ? (
      <img src={mediaUrl} alt="Sticker" className="max-w-[160px] max-h-[160px]" loading="lazy" />
    ) : (
      <span className="text-2xl">🏷️</span>
    );
  }

  // Texto padrão
  return msg.conteudo ? (
    <p className="text-sm whitespace-pre-wrap break-words">{msg.conteudo}</p>
  ) : null;
}

export default function WhatsAppPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedTelefone, setSelectedTelefone] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showTagMenu, setShowTagMenu] = useState(false);
  const [showClienteMenu, setShowClienteMenu] = useState(false);
  const [clienteSearchTerm, setClienteSearchTerm] = useState('');
  const [showNewInstance, setShowNewInstance] = useState(false);
  // Doc assignment to client profile
  const [docAssignOpen, setDocAssignOpen] = useState(false);
  const [docAssignMediaUrl, setDocAssignMediaUrl] = useState<string | null>(null);
  const [docAssignType, setDocAssignType] = useState<'documento_frente_url' | 'documento_verso_url' | 'comprovante_endereco_url'>('documento_frente_url');
  const [docAssignClienteId, setDocAssignClienteId] = useState<string | null>(null);
  const [docAssignSearch, setDocAssignSearch] = useState('');
  const [docAssignLoading, setDocAssignLoading] = useState(false);
  const [newInstanceForm, setNewInstanceForm] = useState({
    instance_name: '',
    evolution_url: '',
    evolution_global_apikey: '',
    departamento: 'geral',
    phone_number: '',
  });
  // QR Code Modal state
  const [qrModal, setQrModal] = useState<{
    open: boolean;
    instanciaId: string | null;
    qrCode: string | null;
    status: 'loading' | 'awaiting_scan' | 'connecting' | 'connected' | 'error';
    errorMsg?: string;
  }>({ open: false, instanciaId: null, qrCode: null, status: 'loading' });
  const [activeInstanciaId, setActiveInstanciaId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const qrPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Audio Recording ────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const recordingDurationRef = useRef(0); // ref para evitar stale closure no onstop
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  // useState (não useRef) para que React re-renderize MessageContent ao adicionar blob URLs.
  // storageUrl → blobUrl: o VoicePlayer usa blobUrl para seek correto sem Duration header WebM.
  const [localBlobUrls, setLocalBlobUrls] = useState<Map<string, string>>(new Map());
  // Rastrear blob URLs criados p/ revogar no unmount (evitar memory leak)
  const blobUrlsToRevokeRef = useRef<string[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // ── Image/File Upload ──────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Hooks ──────────────────────────────────────────────
  const { user } = useAuth();
  const isAdminOrGerencia = user?.role === 'admin' || user?.role === 'gerencia';
  // Admin/gerência vê todas as instâncias; demais veem só as próprias
  const { data: instancias = [], isLoading: loadingInstancias } = useInstancias(
    isAdminOrGerencia ? undefined : user?.id
  );
  const criarInstancia = useCriarInstancia();
  const conectar = useConectarInstancia();
  const desconectar = useDesconectarInstancia();
  const deletar = useDeletarInstancia();
  const enviar = useEnviarWhatsapp();
  const configurarWebhook = useConfigurarWebhook();
  const syncInstancias = useSyncInstancias();
  const setAsSystem = useSetAsSystem();

  // ── Etiquetas e clientes ──────────────────────────────
  const { data: allEtiquetas = [] } = useEtiquetas();
  const { data: conversaEtiquetas = [] } = useConversaEtiquetas(activeInstanciaId || undefined);
  const toggleEtiqueta = useToggleConversaEtiqueta();
  const { data: conversaClientes = [] } = useConversaClientes(activeInstanciaId || undefined);
  const vincularCliente = useVincularCliente();
  const desvincularCliente = useDesvincularCliente();
  const { data: allClientes = [] } = useClientes();
  const createTicket = useCreateTicket();

  // Cliente vinculado à conversa selecionada (para criar ticket)
  const linkedClienteId = conversaClientes.find((cc) => cc.telefone === selectedTelefone)?.cliente_id;
  const { data: ticketsDoCliente = [] } = useTicketsByCliente(linkedClienteId);
  const hasOpenTicket = ticketsDoCliente.some((t) => !['resolvido', 'cancelado'].includes(t.status));

  // Helpers para etiquetas/cliente da conversa selecionada
  const selectedTags = conversaEtiquetas.filter((ce) => ce.telefone === selectedTelefone);
  const selectedClienteLink = conversaClientes.find((cc) => cc.telefone === selectedTelefone);
  const getTagsForPhone = useCallback(
    (telefone: string) => conversaEtiquetas.filter((ce) => ce.telefone === telefone),
    [conversaEtiquetas]
  );

  // Selecionar primeira instância conectada automaticamente
  useEffect(() => {
    if (!activeInstanciaId && instancias.length > 0) {
      const conectada = instancias.find((i) => i.status === 'conectado' || i.status === 'conectada');
      setActiveInstanciaId(conectada?.id || instancias[0].id);
    }
  }, [instancias, activeInstanciaId]);

  // Deep-link: ?telefone=5511999999999 (vindo de ClientesPage ou outro)
  useEffect(() => {
    const telParam = searchParams.get('telefone');
    if (telParam && activeInstanciaId) {
      // Normalizar: remover formatação, manter apenas dígitos
      const normalized = telParam.replace(/\\D/g, '');
      if (normalized) {
        setSelectedTelefone(normalized);
        // Limpar param da URL para não re-trigger
        setSearchParams({}, { replace: true });
      }
    }
  }, [searchParams, activeInstanciaId, setSearchParams]);

  const { data: conversas = [], isLoading: loadingConversas } =
    useConversasWhatsapp(activeInstanciaId || undefined);

  // Info da conversa selecionada (para header do chat)
  const selectedConversaInfo = conversas.find((c) => c.telefone === selectedTelefone) ?? null;
  const { data: mensagens = [], isLoading: loadingMsgs } =
    useMensagensWhatsapp(selectedTelefone || undefined);
  const { data: stats } = useEstatisticasWhatsapp(activeInstanciaId || undefined);

  const activeInstancia = instancias.find((i) => i.id === activeInstanciaId);

  // ── Doc Assignment Handler ─────────────────────────────
  const handleDocAssign = useCallback(async () => {
    if (!docAssignClienteId || !docAssignMediaUrl) return;
    setDocAssignLoading(true);
    try {
      // Download media from URL
      const res = await fetch(docAssignMediaUrl);
      if (!res.ok) throw new Error('Falha ao baixar mídia');
      const blob = await res.blob();
      const ext = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg';
      const fileName = docAssignType === 'documento_frente_url' ? 'doc-frente'
        : docAssignType === 'documento_verso_url' ? 'doc-verso'
        : 'comprovante-endereco';
      const path = `${docAssignClienteId}/${fileName}.${ext}`;

      // Upload to client-documents bucket
      const { error: uploadErr } = await supabase.storage.from('client-documents').upload(path, blob, {
        cacheControl: '3600',
        upsert: true,
        contentType: blob.type,
      });
      if (uploadErr) throw uploadErr;

      // Update client record
      const { error: dbErr } = await (supabase.from('clientes') as any).update({ [docAssignType]: path }).eq('id', docAssignClienteId);
      if (dbErr) throw dbErr;

      const label = docAssignType === 'documento_frente_url' ? 'Doc. Frente'
        : docAssignType === 'documento_verso_url' ? 'Doc. Verso'
        : 'Comp. Endereço';
      const clienteNome = allClientes.find(c => c.id === docAssignClienteId)?.nome ?? '';
      toast.success(`${label} atribuído a ${clienteNome}`);
      setDocAssignOpen(false);
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
    } catch (err) {
      toast.error(`Erro: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDocAssignLoading(false);
    }
  }, [docAssignClienteId, docAssignMediaUrl, docAssignType, allClientes, queryClient]);

  const openDocAssign = useCallback((mediaUrl: string) => {
    setDocAssignMediaUrl(mediaUrl);
    setDocAssignClienteId(linkedClienteId ?? null);
    setDocAssignSearch('');
    setDocAssignType('documento_frente_url');
    setDocAssignOpen(true);
  }, [linkedClienteId]);

  // Auto-scroll ao receber nova mensagem
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens]);

  // Filtrar conversas (por telefone ou nome)
  const filteredConversas = conversas.filter(
    (c) => !searchTerm ||
      c.telefone.includes(searchTerm) ||
      (c.push_name && c.push_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // ── QR Polling — auto-check connection + auto-refresh QR ──
  const qrRefreshCounterRef = useRef(0);

  const startQrPolling = (instanciaId: string) => {
    stopQrPolling();
    qrRefreshCounterRef.current = 0;

    qrPollRef.current = setInterval(async () => {
      try {
        // Check connection status every 3s
        const result = await statusInstancia(instanciaId);
        if (result.status === 'conectado' || result.evolution_state === 'open') {
          setQrModal((prev) => ({ ...prev, status: 'connected' }));
          stopQrPolling();
          // Garantir webhook configurado na Evolution
          configurarWebhook.mutate(instanciaId);
          // Force React Query cache refresh so instance cards & chat update immediately
          queryClient.invalidateQueries({ queryKey: ['whatsapp-instancias'] });
          queryClient.invalidateQueries({ queryKey: ['whatsapp-conversas'] });
          queryClient.invalidateQueries({ queryKey: ['whatsapp-stats'] });
          toast.success('WhatsApp conectado com sucesso!');
          // Auto-close after 2s
          setTimeout(() => {
            setQrModal({ open: false, instanciaId: null, qrCode: null, status: 'loading' });
          }, 2000);
          return;
        }

        // Auto-refresh QR code every ~45s (15 ticks × 3s = 45s)
        qrRefreshCounterRef.current += 1;
        if (qrRefreshCounterRef.current >= 15) {
          qrRefreshCounterRef.current = 0;
          setQrModal((prev) => ({ ...prev, status: 'loading' }));
          const refreshed = await conectarInstancia(instanciaId);
          if (refreshed.qr_code) {
            setQrModal((prev) => ({
              ...prev,
              qrCode: refreshed.qr_code,
              status: 'awaiting_scan',
            }));
          }
        }
      } catch {
        // Ignore polling errors
      }
    }, 3000);
  };

  const stopQrPolling = () => {
    if (qrPollRef.current) {
      clearInterval(qrPollRef.current);
      qrPollRef.current = null;
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => stopQrPolling();
  }, []);

  const openQrModal = (instanciaId: string, qrCode: string | null) => {
    setQrModal({
      open: true,
      instanciaId,
      qrCode: qrCode,
      status: qrCode ? 'awaiting_scan' : 'loading',
    });
    if (qrCode) {
      startQrPolling(instanciaId);
    }
  };

  const closeQrModal = () => {
    stopQrPolling();
    setQrModal({ open: false, instanciaId: null, qrCode: null, status: 'loading' });
  };

  // ── Handlers ───────────────────────────────────────────
  const handleCriarInstancia = async () => {
    try {
      const result = await criarInstancia.mutateAsync({
        instance_name: newInstanceForm.instance_name,
        departamento: newInstanceForm.departamento,
        phone_number: newInstanceForm.phone_number || undefined,
        evolution_url: newInstanceForm.evolution_url || undefined,
        evolution_global_apikey: newInstanceForm.evolution_global_apikey || undefined,
      });
      setShowNewInstance(false);
      setNewInstanceForm({
        instance_name: '',
        evolution_url: '',
        evolution_global_apikey: '',
        departamento: 'geral',
        phone_number: '',
      });
      // Open QR modal
      if (result.instancia?.id) {
        openQrModal(result.instancia.id, result.qr_code);
      }
    } catch (err) {
      console.error('Erro ao criar instância:', err);
    }
  };

  const handleConectar = async (instanciaId: string) => {
    try {
      setQrModal({ open: true, instanciaId, qrCode: null, status: 'loading' });
      const result = await conectar.mutateAsync(instanciaId);
      if (result.already_connected) {
        // Já está conectada — mostrar sucesso e fechar modal
        setQrModal((prev) => ({ ...prev, status: 'connected' }));
        queryClient.invalidateQueries({ queryKey: ['whatsapp-instancias'] });
        queryClient.invalidateQueries({ queryKey: ['whatsapp-conversas'] });
        queryClient.invalidateQueries({ queryKey: ['whatsapp-stats'] });
        toast.success('Instância já está conectada!');
        setTimeout(() => {
          setQrModal({ open: false, instanciaId: null, qrCode: null, status: 'loading' });
        }, 1500);
      } else if (result.qr_code) {
        setQrModal((prev) => ({ ...prev, qrCode: result.qr_code, status: 'awaiting_scan' }));
        startQrPolling(instanciaId);
      } else {
        setQrModal((prev) => ({
          ...prev,
          status: 'error',
          errorMsg: 'QR Code não gerado. A instância pode já estar conectada ou a Evolution API não está acessível.',
        }));
      }
    } catch (err) {
      setQrModal((prev) => ({
        ...prev,
        status: 'error',
        errorMsg: err instanceof Error ? err.message : 'Erro ao conectar',
      }));
    }
  };

  const handleEnviar = async () => {
    if (!message.trim() || !selectedTelefone || !activeInstanciaId) return;
    // Usar o JID da conversa (já resolvido pelo backend em getConversas)
    const destino = selectedConversaInfo?.jid || selectedTelefone;
    try {
      const result = await enviar.mutateAsync({
        instancia_id: activeInstanciaId,
        telefone: destino,
        conteudo: message,
        tipo: 'text',
      });
      // Se a Edge Function retorna success:false (ex: @lid não existe no WhatsApp)
      if (result && typeof result === 'object' && 'success' in result && !result.success) {
        toast.error(result.error || 'Falha ao enviar mensagem');
        return;
      }
      setMessage('');
    } catch (err) {
      console.error('Erro ao enviar:', err);
      toast.error(err instanceof Error ? err.message : 'Erro ao enviar mensagem');
    }
  };

  // ── Audio Recording ────────────────────────────────────
  const startRecording = async () => {
    if (!selectedTelefone || !activeInstanciaId) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Preferir OGG/Opus ou WebM/Opus. Safari não suporta esses tipos e usa MP4/AAC
      // por padrão — o try/catch garante que o MediaRecorder sempre inicia, mesmo em Safari.
      const preferredTypes = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm'];
      const preferredMime = preferredTypes.find(t => MediaRecorder.isTypeSupported(t)) ?? '';
      let recorder: MediaRecorder;
      try {
        recorder = preferredMime
          ? new MediaRecorder(stream, { mimeType: preferredMime })
          : new MediaRecorder(stream); // Safari: usa padrão (audio/mp4)
      } catch {
        recorder = new MediaRecorder(stream); // fallback absoluto
      }
      const mediaRecorder = recorder;
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        // Usar o mimeType REAL do mediaRecorder (não o solicitado).
        // Safari ignora o mimeType solicitado e grava audio/mp4 (AAC).
        const recordedMime = mediaRecorder.mimeType || preferredMime || 'audio/webm';
        const rawBlob = new Blob(audioChunksRef.current, { type: recordedMime });
        stream.getTracks().forEach(track => track.stop());

        // Converter para WAV 16 kHz mono via Web Audio API:
        // • audioToWav() decodifica qualquer formato (WebM, OGG, MP4/AAC) para PCM
        // • Reamostrado para 16kHz mono → ~32 KB/s, sem risco de timeout
        // • WAV é o formato mais universal para ffmpeg da Evolution API
        let mediaBlob: Blob;
        let exactDuration = recordingDurationRef.current;
        try {
          const converted = await audioToWav(rawBlob);
          mediaBlob = converted.wavBlob;
          exactDuration = converted.durationSec;
        } catch (convertErr) {
          console.warn('[audio] audioToWav falhou, enviando raw:', convertErr);
          mediaBlob = rawBlob;
        }

        const localBlobUrl = URL.createObjectURL(mediaBlob);
        const destino = selectedConversaInfo?.jid || selectedTelefone;
        try {
          setIsUploadingMedia(true);
          toast.loading('Enviando áudio...', { id: 'audio-upload' });
          // Upload para Storage → edge function gera signed URL → Evolution API baixa o WAV
          const publicUrl = await uploadMediaToStorage(mediaBlob, 'audio', 'audio.wav');
          blobUrlsToRevokeRef.current.push(localBlobUrl);
          setLocalBlobUrls(prev => new Map(prev).set(publicUrl, localBlobUrl));
          const result = await enviar.mutateAsync({
            instancia_id: activeInstanciaId!,
            telefone: destino,
            conteudo: '🎵 Áudio',
            tipo: 'audio',
            media_url: publicUrl,
            audio_seconds: Math.round(exactDuration),
          });
          toast.dismiss('audio-upload');
          if (result && typeof result === 'object' && 'success' in result && !result.success) {
            toast.error(result.error || 'Falha ao enviar áudio');
          }
        } catch (err) {
          toast.dismiss('audio-upload');
          toast.error(err instanceof Error ? err.message : 'Erro ao enviar áudio');
          URL.revokeObjectURL(localBlobUrl);
        } finally {
          setIsUploadingMedia(false);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingDurationRef.current = 0;
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(t => t + 1);
        recordingDurationRef.current += 1;
      }, 1000);
    } catch {
      toast.error('Não foi possível acessar o microfone. Verifique as permissões do navegador.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      const stream = mediaRecorderRef.current.stream;
      stream?.getTracks().forEach(track => track.stop());
    }
    setIsRecording(false);
    recordingDurationRef.current = 0;
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };

  const formatRecordingTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // ── File Upload (images/documents) ─────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedTelefone || !activeInstanciaId) return;

    const destino = selectedConversaInfo?.jid || selectedTelefone;
    const isImage = file.type.startsWith('image/');
    const folder = isImage ? 'images' : 'documents';

    try {
      // Upload para Storage → URL pública (Evolution API busca diretamente por HTTP)
      setIsUploadingMedia(true);
      const publicUrl = await uploadMediaToStorage(file, folder, file.name);
      await enviar.mutateAsync({
        instancia_id: activeInstanciaId,
        telefone: destino,
        conteudo: file.name,
        tipo: isImage ? 'image' : 'document',
        media_url: publicUrl,
      });
      toast.success(`${isImage ? 'Imagem' : 'Documento'} enviado!`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao enviar arquivo');
    } finally {
      setIsUploadingMedia(false);
    }

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Cleanup on unmount — libera blob URLs para evitar memory leak
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      blobUrlsToRevokeRef.current.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
      conectado: { label: 'Conectada', className: 'bg-green-500 text-white', icon: <Wifi className="w-3 h-3" /> },
      conectada: { label: 'Conectada', className: 'bg-green-500 text-white', icon: <Wifi className="w-3 h-3" /> },
      desconectado: { label: 'Desconectada', className: 'bg-red-100 text-red-800', icon: <WifiOff className="w-3 h-3" /> },
      desconectada: { label: 'Desconectada', className: 'bg-red-100 text-red-800', icon: <WifiOff className="w-3 h-3" /> },
      qr_pendente: { label: 'Aguardando QR', className: 'bg-yellow-100 text-yellow-800', icon: <QrCode className="w-3 h-3" /> },
      aguardando_qr: { label: 'Aguardando QR', className: 'bg-yellow-100 text-yellow-800', icon: <QrCode className="w-3 h-3" /> },
      erro: { label: 'Erro', className: 'bg-red-500 text-white', icon: <AlertCircle className="w-3 h-3" /> },
    };
    const c = configs[status] || configs.desconectado;
    return (
      <Badge className={`${c.className} flex items-center gap-1`}>
        {c.icon} {c.label}
      </Badge>
    );
  };

  const getMsgStatusIcon = (status: string) => {
    if (status === 'lida') return <CheckCheck className="w-3 h-3 text-blue-500" />;
    if (status === 'entregue') return <CheckCheck className="w-3 h-3 text-muted-foreground" />;
    if (status === 'enviada') return <CheckCheck className="w-3 h-3 text-muted-foreground" />;
    if (status === 'falha') return <AlertCircle className="w-3 h-3 text-red-500" />;
    return <Clock className="w-3 h-3 text-muted-foreground" />;
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">WhatsApp Business</h1>
          <p className="text-muted-foreground mt-1">Gerenciar instâncias e conversas do WhatsApp</p>
        </div>
        <div className="flex gap-2">
          {isAdminOrGerencia && (
            <Button
              variant="outline"
              onClick={() => syncInstancias.mutate(undefined, {
                onSuccess: (res) => {
                  toast.success(`Sincronizadas: ${res.synced}/${res.total} instâncias com webhook configurado.`);
                },
                onError: (err) => toast.error(`Erro ao sincronizar: ${err instanceof Error ? err.message : String(err)}`),
              })}
              disabled={syncInstancias.isPending}
            >
              {syncInstancias.isPending
                ? <span className="w-4 h-4 mr-2 animate-spin border-2 border-current border-t-transparent rounded-full inline-block" />
                : <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>}
              Sincronizar
            </Button>
          )}
          <Dialog open={showNewInstance} onOpenChange={setShowNewInstance}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" />Nova Instância</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Nova Instância WhatsApp</DialogTitle>
              <DialogDescription>Configure a conexão com a Evolution API</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium">Nome da instância *</label>
                <Input
                  placeholder="ex: cobranca-01"
                  value={newInstanceForm.instance_name}
                  onChange={(e) => setNewInstanceForm({ ...newInstanceForm, instance_name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Departamento</label>
                  <select
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={newInstanceForm.departamento}
                    onChange={(e) => setNewInstanceForm({ ...newInstanceForm, departamento: e.target.value })}
                  >
                    <option value="geral">Geral</option>
                    <option value="cobranca">Cobrança</option>
                    <option value="comercial">Comercial</option>
                    <option value="atendimento">Atendimento</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Telefone (opcional)</label>
                  <Input
                    placeholder="5511999999999"
                    value={newInstanceForm.phone_number}
                    onChange={(e) => setNewInstanceForm({ ...newInstanceForm, phone_number: e.target.value })}
                  />
                </div>
              </div>
              <details className="rounded-md border p-3">
                <summary className="text-sm font-medium cursor-pointer flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  Configuração Evolution API (opcional)
                </summary>
                <p className="text-xs text-muted-foreground mt-2 mb-3">
                  Deixe em branco para usar os secrets configurados no Supabase (EVOLUTION_API_URL e EVOLUTION_API_KEY).
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground">URL da Evolution API</label>
                    <Input
                      placeholder="https://evo.seudominio.com"
                      value={newInstanceForm.evolution_url}
                      onChange={(e) => setNewInstanceForm({ ...newInstanceForm, evolution_url: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">API Key Global</label>
                    <Input
                      type="password"
                      placeholder="Chave da Evolution API"
                      value={newInstanceForm.evolution_global_apikey}
                      onChange={(e) => setNewInstanceForm({ ...newInstanceForm, evolution_global_apikey: e.target.value })}
                    />
                  </div>
                </div>
              </details>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNewInstance(false)}>Cancelar</Button>
              <Button
                onClick={handleCriarInstancia}
                disabled={criarInstancia.isPending || !newInstanceForm.instance_name}
              >
                {criarInstancia.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Criar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* QR Code Modal — Auto-check connection */}
      <Dialog open={qrModal.open} onOpenChange={(open) => { if (!open) closeQrModal(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {qrModal.status === 'connected' ? (
                <><Wifi className="w-5 h-5 text-green-500" />Conectado!</>
              ) : qrModal.status === 'error' ? (
                <><AlertCircle className="w-5 h-5 text-red-500" />Erro na Conexão</>
              ) : (
                <><QrCode className="w-5 h-5 text-primary" />Escaneie o QR Code</>
              )}
            </DialogTitle>
            <DialogDescription>
              {qrModal.status === 'connected'
                ? 'WhatsApp conectado com sucesso! Este modal fechará automaticamente.'
                : qrModal.status === 'error'
                ? qrModal.errorMsg || 'Erro ao gerar QR Code.'
                : 'Abra o WhatsApp → Dispositivos conectados → Conectar dispositivo'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center justify-center py-4 min-h-[300px]">
            {/* Loading */}
            {qrModal.status === 'loading' && (
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="w-12 h-12 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Gerando QR Code...</p>
              </div>
            )}

            {/* QR Code */}
            {qrModal.status === 'awaiting_scan' && qrModal.qrCode && (
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <img
                    src={qrModal.qrCode.startsWith('data:') ? qrModal.qrCode : `data:image/png;base64,${qrModal.qrCode}`}
                    alt="QR Code WhatsApp"
                    className="w-64 h-64 rounded-lg border-2 border-green-500"
                  />
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2">
                    <Badge className="bg-yellow-500 text-white animate-pulse flex items-center gap-1">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      Aguardando leitura...
                    </Badge>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground text-center mt-4 max-w-xs">
                  QR Code renova automaticamente a cada ~45 segundos. Status verificado a cada 3s.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => qrModal.instanciaId && handleConectar(qrModal.instanciaId)}
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  Gerar Novo QR Code
                </Button>
              </div>
            )}

            {/* Connected success */}
            {qrModal.status === 'connected' && (
              <div className="flex flex-col items-center gap-4">
                <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <CheckCheck className="w-10 h-10 text-green-500" />
                </div>
                <p className="text-lg font-semibold text-green-600">WhatsApp Conectado!</p>
                <p className="text-sm text-muted-foreground">Instância pronta para enviar e receber mensagens.</p>
              </div>
            )}

            {/* Error */}
            {qrModal.status === 'error' && (
              <div className="flex flex-col items-center gap-4">
                <div className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <AlertCircle className="w-10 h-10 text-red-500" />
                </div>
                <p className="text-sm text-muted-foreground text-center max-w-xs">
                  {qrModal.errorMsg || 'Não foi possível gerar o QR Code. Verifique se a Evolution API está acessível.'}
                </p>
                {qrModal.instanciaId && (
                  <Button
                    variant="outline"
                    onClick={() => handleConectar(qrModal.instanciaId!)}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />Tentar Novamente
                  </Button>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeQrModal}>
              {qrModal.status === 'connected' ? 'Fechar' : 'Cancelar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Instâncias */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 shrink-0">
        {loadingInstancias ? (
          <Card className="col-span-full"><CardContent className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></CardContent></Card>
        ) : instancias.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Phone className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="font-semibold text-lg mb-2">Nenhuma instância configurada</h3>
              <p className="text-muted-foreground mb-4">Crie uma instância para conectar um número WhatsApp</p>
              <Button onClick={() => setShowNewInstance(true)}><Plus className="w-4 h-4 mr-2" />Criar Instância</Button>
            </CardContent>
          </Card>
        ) : (
          instancias.map((inst) => (
            <Card
              key={inst.id}
              className={`cursor-pointer transition-all ${activeInstanciaId === inst.id ? 'ring-2 ring-primary' : 'hover:shadow-md'}`}
              onClick={() => setActiveInstanciaId(inst.id)}
            >
              <CardContent className="p-3">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h4 className="font-semibold text-sm flex items-center gap-1.5">
                      {inst.instance_name}
                      {inst.is_system && <Badge variant="outline" className="text-[9px] px-1 py-0 border-blue-400 text-blue-500">Sistema</Badge>}
                    </h4>
                    <p className="text-xs text-muted-foreground">{inst.departamento}</p>
                  </div>
                  {getStatusBadge(inst.status)}
                </div>
                {inst.phone_number && (
                  <p className="text-xs text-muted-foreground mb-2">{inst.phone_number}</p>
                )}
                <div className="flex gap-1">
                  {(inst.status === 'desconectado' || inst.status === 'desconectada') && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-xs"
                      onClick={(e) => { e.stopPropagation(); handleConectar(inst.id); }}
                      disabled={conectar.isPending}
                    >
                      {conectar.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <QrCode className="w-3 h-3 mr-1" />}
                      Conectar
                    </Button>
                  )}
                  {(inst.status === 'conectado' || inst.status === 'conectada') && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-xs"
                      onClick={(e) => { e.stopPropagation(); desconectar.mutate(inst.id); }}
                    >
                      <WifiOff className="w-3 h-3 mr-1" />Desconectar
                    </Button>
                  )}
                  {(inst.status === 'qr_pendente' || inst.status === 'aguardando_qr') && inst.qr_code && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-xs"
                      onClick={(e) => { e.stopPropagation(); openQrModal(inst.id, inst.qr_code); }}
                    >
                      <QrCode className="w-3 h-3 mr-1" />Ver QR
                    </Button>
                  )}
                  {isAdminOrGerencia && !inst.is_system && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs text-blue-600 hover:text-blue-700"
                      title="Definir como instância do sistema (cron, notificações)"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Definir "${inst.instance_name}" como instância do sistema?\n\nEla será usada para envios automáticos (cron, notificações, verificações).`)) {
                          setAsSystem.mutate(inst.id, {
                            onSuccess: () => toast.success(`"${inst.instance_name}" definida como instância do sistema`),
                            onError: (err) => toast.error(`Erro: ${(err as Error).message}`),
                          });
                        }
                      }}
                    >
                      <Settings className="w-3 h-3" />
                    </Button>
                  )}
                  {isAdminOrGerencia && !inst.is_system && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('Deletar instância?')) {
                          deletar.mutate(inst.id, {
                            onSuccess: () => toast.success('Instância deletada'),
                            onError: (err) => toast.error(`Erro ao deletar: ${(err as Error).message}`),
                          });
                        }
                      }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 shrink-0">
          <Card>
            <CardContent className="py-3 px-4 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Mensagens Enviadas</span>
              <span className="text-xl font-bold">{stats.total_enviadas}</span>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 px-4 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Mensagens Recebidas</span>
              <span className="text-xl font-bold text-green-600">{stats.total_recebidas}</span>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 px-4 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Falhas</span>
              <span className="text-xl font-bold text-red-600">{stats.total_falhas}</span>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Chat Area */}
      {activeInstancia && (
        <div className="grid grid-cols-12 gap-2" style={{ height: 'calc(100vh - 20rem)' }}>
          {/* Lista de Conversas */}
          <div className="col-span-12 lg:col-span-4 min-h-0">
            <Card className="h-full flex flex-col overflow-hidden">
              <div className="p-4 border-b space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">Conversas</h3>
                  <Badge variant="secondary" className="text-xs">{conversas.length}</Badge>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome ou telefone..."
                    className="pl-10 h-9 text-sm"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
              <ScrollArea className="flex-1">
                {loadingConversas ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredConversas.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground px-4">
                    <MessageSquare className="w-8 h-8 mb-2" />
                    <p className="text-sm">Nenhuma conversa ainda</p>
                    <p className="text-xs mt-1">As conversas aparecerão aqui quando mensagens forem enviadas ou recebidas</p>
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {filteredConversas.map((c) => (
                      <button
                        key={c.telefone}
                        onClick={() => setSelectedTelefone(c.telefone)}
                        className={`w-full text-left p-3 rounded-lg transition-colors hover:bg-muted ${selectedTelefone === c.telefone ? 'bg-muted' : ''}`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-10 h-10 ${getAvatarColor(c.telefone)} text-white rounded-full flex items-center justify-center text-sm font-semibold shrink-0`}>
                            {getInitials(c.push_name, c.telefone)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium text-sm truncate">
                                {c.push_name || formatPhone(c.telefone)}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {new Date(c.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            {c.push_name && (
                              <p className="text-[11px] text-muted-foreground truncate mb-0.5">{formatPhone(c.telefone)}</p>
                            )}
                            <div className="flex items-center gap-1">
                              {c.direcao === 'saida' && <CheckCheck className="w-3 h-3 text-blue-500 shrink-0" />}
                              <span className="text-xs text-muted-foreground truncate">
                                {c.ultima_msg || (c.direcao === 'entrada' ? '📎 Mídia' : c.ultima_msg)}
                              </span>
                            </div>
                            {/* Tag badges */}
                            {getTagsForPhone(c.telefone).length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {getTagsForPhone(c.telefone).map((ce) => (
                                  <span
                                    key={ce.id}
                                    className="text-[9px] leading-tight px-1.5 py-0.5 rounded-full text-white font-medium"
                                    style={{ backgroundColor: ce.etiqueta?.cor || '#6b7280' }}
                                  >
                                    {ce.etiqueta?.nome}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </Card>
          </div>

          {/* Chat */}
          <div className="col-span-12 lg:col-span-8 min-h-0">
            <Card className="h-full flex flex-col overflow-hidden">
              {!selectedTelefone ? (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                  <MessageSquare className="w-16 h-16 mb-4 opacity-30" />
                  <h3 className="font-semibold text-lg mb-1">Selecione uma conversa</h3>
                  <p className="text-sm">Ou envie uma nova mensagem pelo chat</p>
                </div>
              ) : (
                <>
                  {/* Header */}
                  <div className="p-4 border-b flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 ${getAvatarColor(selectedTelefone)} text-white rounded-full flex items-center justify-center font-semibold text-sm shrink-0`}>
                        {getInitials(selectedConversaInfo?.push_name ?? null, selectedTelefone)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold truncate">
                          {selectedConversaInfo?.push_name || formatPhone(selectedTelefone)}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {selectedConversaInfo?.push_name && `${formatPhone(selectedTelefone)} · `}via {activeInstancia.instance_name}
                        </div>
                        {/* Linked client + tags inline */}
                        <div className="flex flex-wrap items-center gap-1 mt-1">
                          {selectedClienteLink && (
                            <span className="inline-flex items-center gap-1 text-[10px] bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded-full font-medium">
                              <User className="w-2.5 h-2.5" />
                              {(() => {
                                const cli = allClientes.find((c) => c.id === selectedClienteLink.cliente_id);
                                return cli?.nome || 'Cliente';
                              })()}
                            </span>
                          )}
                          {selectedTags.map((ce) => (
                            <span
                              key={ce.id}
                              className="text-[10px] px-1.5 py-0.5 rounded-full text-white font-medium"
                              style={{ backgroundColor: ce.etiqueta?.cor || '#6b7280' }}
                            >
                              {ce.etiqueta?.nome}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    {/* Tag & Client buttons */}
                    <div className="flex items-center gap-1 shrink-0 relative">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Etiquetas"
                        onClick={() => { setShowTagMenu(!showTagMenu); setShowClienteMenu(false); }}
                      >
                        <Tag className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Vincular cliente"
                        onClick={() => { setShowClienteMenu(!showClienteMenu); setShowTagMenu(false); }}
                      >
                        <UserPlus className="w-4 h-4" />
                      </Button>

                      {/* Abrir ticket de atendimento */}
                      {linkedClienteId && !hasOpenTicket && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-blue-600 dark:text-blue-400"
                          title="Abrir ticket de atendimento"
                          disabled={createTicket.isPending}
                          onClick={() => {
                            if (!linkedClienteId) return;
                            createTicket.mutate({
                              cliente_id: linkedClienteId,
                              assunto: `Atendimento WhatsApp — ${selectedTelefone}`,
                              descricao: 'Ticket criado manualmente a partir da conversa WhatsApp.',
                              canal: 'whatsapp',
                              status: 'aberto',
                              prioridade: 'media',
                            }, {
                              onSuccess: () => toast.success('Ticket de atendimento criado!'),
                              onError: () => toast.error('Erro ao criar ticket.'),
                            });
                          }}
                        >
                          <MessageSquare className="w-4 h-4" />
                        </Button>
                      )}

                      {/* Tag dropdown */}
                      {showTagMenu && (
                        <div className="absolute right-0 top-10 z-50 w-56 bg-popover border rounded-lg shadow-lg p-2 space-y-1">
                          <div className="flex items-center justify-between px-2 pb-1 border-b mb-1">
                            <span className="text-xs font-semibold">Etiquetas</span>
                            <button onClick={() => setShowTagMenu(false)} className="text-muted-foreground hover:text-foreground">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          {allEtiquetas.map((etiq) => {
                            const isActive = selectedTags.some((t) => t.etiqueta_id === etiq.id);
                            return (
                              <button
                                key={etiq.id}
                                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors ${isActive ? 'bg-muted' : ''}`}
                                onClick={() => {
                                  if (!selectedTelefone || !activeInstanciaId) return;
                                  toggleEtiqueta.mutate({
                                    telefone: selectedTelefone,
                                    instancia_id: activeInstanciaId,
                                    etiqueta_id: etiq.id,
                                    action: isActive ? 'remove' : 'add',
                                  });
                                }}
                              >
                                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: etiq.cor }} />
                                <span className="flex-1 text-left truncate">{etiq.nome}</span>
                                {isActive && <CheckCheck className="w-3.5 h-3.5 text-primary shrink-0" />}
                              </button>
                            );
                          })}
                          {allEtiquetas.length === 0 && (
                            <p className="text-xs text-muted-foreground text-center py-2">Nenhuma etiqueta cadastrada</p>
                          )}
                        </div>
                      )}

                      {/* Client link dropdown */}
                      {showClienteMenu && (
                        <div className="absolute right-0 top-10 z-50 w-64 bg-popover border rounded-lg shadow-lg p-2">
                          <div className="flex items-center justify-between px-2 pb-1 border-b mb-1">
                            <span className="text-xs font-semibold">Vincular cliente</span>
                            <button onClick={() => setShowClienteMenu(false)} className="text-muted-foreground hover:text-foreground">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          {selectedClienteLink ? (
                            <div className="flex items-center justify-between px-2 py-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <User className="w-4 h-4 text-blue-500 shrink-0" />
                                <span className="text-sm truncate">
                                  {allClientes.find((c) => c.id === selectedClienteLink.cliente_id)?.nome || 'Cliente'}
                                </span>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-destructive hover:text-destructive"
                                onClick={() => {
                                  if (!selectedTelefone || !activeInstanciaId) return;
                                  desvincularCliente.mutate({
                                    telefone: selectedTelefone,
                                    instancia_id: activeInstanciaId,
                                  });
                                }}
                              >
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <>
                              <Input
                                placeholder="Buscar cliente..."
                                value={clienteSearchTerm}
                                onChange={(e) => setClienteSearchTerm(e.target.value)}
                                className="h-8 text-sm mb-1"
                              />
                              <ScrollArea className="max-h-40">
                                {allClientes
                                  .filter((c) => {
                                    if (!clienteSearchTerm) return true;
                                    const q = clienteSearchTerm.toLowerCase();
                                    return (
                                      c.nome?.toLowerCase().includes(q) ||
                                      c.telefone?.includes(q) ||
                                      c.cpf?.includes(q)
                                    );
                                  })
                                  .slice(0, 20)
                                  .map((c) => (
                                    <button
                                      key={c.id}
                                      className="w-full text-left px-2 py-1.5 text-sm hover:bg-muted rounded truncate"
                                      onClick={() => {
                                        if (!selectedTelefone || !activeInstanciaId) return;
                                        vincularCliente.mutate({
                                          telefone: selectedTelefone,
                                          instancia_id: activeInstanciaId,
                                          cliente_id: c.id,
                                        });
                                        setShowClienteMenu(false);
                                        setClienteSearchTerm('');
                                      }}
                                    >
                                      <span className="font-medium">{c.nome}</span>
                                      {c.telefone && (
                                        <span className="text-muted-foreground ml-1">· {c.telefone}</span>
                                      )}
                                    </button>
                                  ))}
                              </ScrollArea>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Mensagens — wrapper com overflow-hidden para conter o ScrollArea */}
                  <div className="flex-1 min-h-0 overflow-hidden bg-[#efeae2] dark:bg-[#0d1117]">
                    <ScrollArea className="h-full">
                      <div className="p-4">
                        {loadingMsgs ? (
                          <div className="flex items-center justify-center py-12">
                            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                          </div>
                        ) : mensagens.length === 0 ? (
                          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                            Nenhuma mensagem nesta conversa
                          </div>
                        ) : (
                          <div className="space-y-3 max-w-2xl mx-auto">
                            {mensagens.map((msg) => (
                              <div key={msg.id} className={`flex ${msg.direcao === 'saida' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[75%] rounded-2xl px-3 py-2 shadow-sm relative group ${
                                  msg.direcao === 'saida'
                                    ? 'bg-[#d9fdd3] dark:bg-[#005c4b] text-gray-800 dark:text-gray-100 rounded-tr-sm'
                                    : 'bg-white dark:bg-[#202c33] text-gray-800 dark:text-gray-100 rounded-tl-sm'
                                }`}>
                                  {/* Assign doc button for incoming image/document messages */}
                                  {msg.direcao === 'entrada' && (msg.tipo === 'image' || msg.tipo === 'document') && (() => {
                                    const m = (msg.metadata ?? {}) as Record<string, unknown>;
                                    const mUrl = typeof m.media_url === 'string' ? m.media_url : null;
                                    return mUrl ? (
                                      <button
                                        type="button"
                                        onClick={() => openDocAssign(mUrl)}
                                        className="absolute top-1 right-1 z-10 bg-blue-600 hover:bg-blue-700 text-white rounded-full p-1.5 shadow-lg transition-colors"
                                        title="Atribuir ao cliente"
                                      >
                                        <UserPlus className="h-4 w-4" />
                                      </button>
                                    ) : null;
                                  })()}
                                  <MessageContent
                                msg={{ tipo: msg.tipo, conteudo: msg.conteudo, metadata: (msg.metadata ?? {}) as Record<string, unknown> }}
                                onImageClick={setLightboxImg}
                                localMediaUrls={localBlobUrls}
                              />
                                  <div className="flex items-center justify-end gap-1 mt-0.5">
                                    <span className="text-[10px] text-gray-500 dark:text-gray-400">
                                      {new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                    {msg.direcao === 'saida' && getMsgStatusIcon(msg.status)}
                                  </div>
                                </div>
                              </div>
                            ))}
                            <div ref={scrollRef} />
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </div>

                  {/* Input */}
                  <div className="p-3 border-t bg-[#f0f2f5] dark:bg-[#202c33] space-y-2">
                    {/* Info banner (não-bloqueante) para contatos @lid */}
                    {(selectedConversaInfo?.jid || selectedTelefone)?.endsWith('@lid') && (
                      <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 rounded px-2.5 py-1.5">
                        <Phone className="w-3.5 h-3.5 shrink-0" />
                        <span>Contato com ID interno — o envio pode falhar. Use o celular se necessário.</span>
                      </div>
                    )}
                    {(activeInstancia.status !== 'conectado' && activeInstancia.status !== 'conectada') ? (
                      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-2">
                        <AlertCircle className="w-4 h-4" />
                        Instância desconectada. Conecte para enviar mensagens.
                      </div>
                    ) : isRecording ? (
                      <div className="flex items-center gap-3">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-red-500 shrink-0"
                          onClick={cancelRecording}
                        >
                          <Trash2 className="w-5 h-5" />
                        </Button>
                        <div className="flex-1 flex items-center gap-3 bg-white dark:bg-[#2a3942] rounded-full px-4 py-2">
                          <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                          <span className="text-sm font-medium text-red-500">{formatRecordingTime(recordingTime)}</span>
                          <span className="text-xs text-muted-foreground">Gravando...</span>
                        </div>
                        <Button
                          size="icon"
                          className="bg-green-600 hover:bg-green-700 rounded-full shrink-0"
                          onClick={stopRecording}
                        >
                          <Send className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        {/* File upload */}
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
                          className="hidden"
                          onChange={handleFileUpload}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={enviar.isPending || isUploadingMedia}
                        >
                          <Paperclip className="w-5 h-5" />
                        </Button>

                        <Input
                          placeholder="Digite uma mensagem..."
                          className="flex-1 bg-white dark:bg-[#2a3942] border-0 focus-visible:ring-1 rounded-full px-4"
                          value={message}
                          onChange={(e) => setMessage(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleEnviar();
                            }
                          }}
                          disabled={enviar.isPending || isUploadingMedia}
                        />

                        {message.trim() ? (
                          <Button
                            size="icon"
                            className="bg-green-600 hover:bg-green-700 rounded-full shrink-0"
                            onClick={handleEnviar}
                            disabled={enviar.isPending || isUploadingMedia || !message.trim()}
                          >
                            {(enviar.isPending || isUploadingMedia) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                          </Button>
                        ) : (
                          <Button
                            size="icon"
                            className="bg-green-600 hover:bg-green-700 rounded-full shrink-0"
                            onClick={startRecording}
                            disabled={enviar.isPending || isUploadingMedia}
                          >
                            <Mic className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* Lightbox */}
      <Dialog open={!!lightboxImg} onOpenChange={(open) => { if (!open) setLightboxImg(null); }}>
        <DialogContent className="max-w-4xl p-2 bg-black/90 border-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Visualizar imagem</DialogTitle>
          </DialogHeader>
          {lightboxImg && (
            <img
              src={lightboxImg}
              alt="Imagem ampliada"
              className="w-full h-auto max-h-[85vh] object-contain rounded-lg"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Doc Assignment Dialog */}
      <Dialog open={docAssignOpen} onOpenChange={setDocAssignOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Atribuir Documento ao Cliente</DialogTitle>
            <DialogDescription>Selecione o cliente e o tipo de documento para vincular esta mídia ao cadastro.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Preview */}
            {docAssignMediaUrl && (
              <img src={docAssignMediaUrl} alt="Mídia" className="w-full h-40 object-contain rounded-lg border bg-muted" />
            )}
            {/* Document type */}
            <div>
              <label className="text-sm font-medium mb-1 block">Tipo de Documento</label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={docAssignType}
                onChange={(e) => setDocAssignType(e.target.value as typeof docAssignType)}
              >
                <option value="documento_frente_url">Documento Frente (RG/CNH)</option>
                <option value="documento_verso_url">Documento Verso</option>
                <option value="comprovante_endereco_url">Comprovante de Endereço</option>
              </select>
            </div>
            {/* Client search */}
            <div>
              <label className="text-sm font-medium mb-1 block">Cliente</label>
              <Input
                placeholder="Buscar por nome, telefone ou CPF..."
                value={docAssignSearch}
                onChange={(e) => setDocAssignSearch(e.target.value)}
                className="mb-2"
              />
              <div className="max-h-40 overflow-y-auto border rounded-md">
                {allClientes
                  .filter(c => {
                    if (!docAssignSearch.trim()) return true;
                    const q = docAssignSearch.toLowerCase();
                    return c.nome.toLowerCase().includes(q) || c.telefone.includes(q) || (c.cpf && c.cpf.includes(q));
                  })
                  .slice(0, 15)
                  .map(c => (
                    <button
                      key={c.id}
                      type="button"
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center justify-between ${docAssignClienteId === c.id ? 'bg-accent' : ''}`}
                      onClick={() => setDocAssignClienteId(c.id)}
                    >
                      <span>{c.nome}</span>
                      <span className="text-xs text-muted-foreground">{c.telefone}</span>
                    </button>
                  ))
                }
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDocAssignOpen(false)}>Cancelar</Button>
            <Button onClick={handleDocAssign} disabled={!docAssignClienteId || docAssignLoading}>
              {docAssignLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Atribuir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
