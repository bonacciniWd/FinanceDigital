/**
 * @module VerifyIdentityPage
 * @description Página pública de verificação de identidade para análise de crédito.
 *
 * O cliente acessa via magic link, grava um vídeo lendo uma frase de verificação
 * e faz upload dos documentos (CNH ou RG frente/verso).
 *
 * @route /verify-identity/:token
 * @access Público (via magic link) — autenticação é feita automaticamente pelo Supabase
 *
 * Regras de negócio:
 * - Vídeo: mínimo 5s, máximo 30s
 * - Documentos: máximo 5MB cada, JPG/PNG/WebP
 * - Máximo 3 tentativas por cliente
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import Lottie from 'lottie-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import {
  Video,
  Camera,
  Upload,
  CheckCircle2,
  AlertTriangle,
  FileImage,
  X,
  Loader2,
  Shield,
  RefreshCw,
  ExternalLink,
  MapPin,
  Home,
  Users,
  User,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';

// Lottie animations
import animSelfie from '../assets/animations/id.json';
import animData from '../assets/animations/docs.json';
import animSent from '../assets/animations/sent.json';
import animWelcome from '../assets/animations/init.json';
import type { IdentityVerificationRow, ReferenceContact } from '../lib/database.types';

const MIN_VIDEO_DURATION = 5;
const MAX_VIDEO_DURATION = 30;
const MAX_DOC_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const VIDEO_MIME_TYPES = ['video/webm;codecs=vp9', 'video/webm', 'video/mp4'];

// Slides do tutorial multi-step
const INTRO_SLIDES = [
  {
    animation: animWelcome,
    title: 'Verificação de Identidade',
    description: 'Vamos guiar você em um processo rápido e seguro para validar sua identidade e liberar sua análise de crédito.',
  },
  {
    animation: animSelfie,
    title: 'Vídeo Selfie e Documentos',
    description: 'Grave um vídeo lendo uma frase de verificação e envie fotos da frente e verso do seu documento (CNH ou RG).',
  },
  {
    animation: animData,
    title: 'Endereço e Referências',
    description: 'Envie comprovante de endereço, informe seu endereço completo e 3 contatos de referência familiar.',
  },
  {
    animation: animSent,
    title: 'Revisão e Envio',
    description: 'Por fim, grave um vídeo da fachada da sua residência, revise tudo e envie para análise. Leva apenas alguns minutos!',
  },
] as const;

type Step = 'loading' | 'intro' | 'video' | 'documents' | 'proof_address' | 'address_refs' | 'residence_video' | 'review' | 'submitted' | 'error' | 'expired';

// Detectar navegador in-app (WhatsApp, Instagram, Facebook, etc.)
function isInAppBrowser(): boolean {
  const ua = navigator.userAgent || '';
  return /FBAN|FBAV|Instagram|WhatsApp|Line\/|Snapchat|Twitter|MicroMessenger/i.test(ua);
}

// Gerar link para abrir no navegador nativo
function getOpenInBrowserUrl(): string {
  const url = window.location.href;
  const ua = navigator.userAgent || '';
  // Android: intent scheme para abrir no Chrome
  if (/android/i.test(ua)) {
    return `intent://${url.replace(/^https?:\/\//, '')}#Intent;scheme=https;package=com.android.chrome;end`;
  }
  // iOS: não há scheme confiável, retorna a própria URL para copiar
  return url;
}

function getSupportedMimeType(): string {
  for (const mime of VIDEO_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return 'video/webm';
}

export default function VerifyIdentityPage() {
  const [searchParams] = useSearchParams();
  // Suportar analise_id como query param ou hash param (WhatsApp pode quebrar URLs)
  const analiseId = searchParams.get('analise_id')
    || new URLSearchParams(window.location.hash.replace('#', '?')).get('analise_id')
    || null;

  const [step, setStep] = useState<Step>('loading');
  const [verification, setVerification] = useState<IdentityVerificationRow | null>(null);
  const [error, setError] = useState('');
  const [introSlide, setIntroSlide] = useState(0);

  // Video state
  const [isRecording, setIsRecording] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [showPhrase, setShowPhrase] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [cameraFailed, setCameraFailed] = useState(false);
  const [cameraError, setCameraError] = useState<string>('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Document state
  const [docFrontPreview, setDocFrontPreview] = useState<string | null>(null);
  const [docBackPreview, setDocBackPreview] = useState<string | null>(null);

  // Proof of address state
  const [proofOfAddressPreview, setProofOfAddressPreview] = useState<string | null>(null);

  // Address & reference contacts state
  const [addrRua, setAddrRua] = useState('');
  const [addrNumero, setAddrNumero] = useState('');
  const [addrBairro, setAddrBairro] = useState('');
  const [addrEstado, setAddrEstado] = useState('');
  const [addrCidade, setAddrCidade] = useState('');
  const [addrCep, setAddrCep] = useState('');
  const [cidadesLista, setCidadesLista] = useState<string[]>([]);
  const [cidadesLoading, setCidadesLoading] = useState(false);
  const [cidadeSearch, setCidadeSearch] = useState('');

  const ESTADOS_BR = [
    'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
    'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
  ] as const;

  useEffect(() => {
    if (!addrEstado) { setCidadesLista([]); setAddrCidade(''); return; }
    let cancelled = false;
    setCidadesLoading(true);
    setAddrCidade('');
    setCidadeSearch('');
    fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${addrEstado}/municipios?orderBy=nome`)
      .then(r => r.json())
      .then((data: Array<{ nome: string }>) => {
        if (!cancelled) setCidadesLista(data.map(m => m.nome));
      })
      .catch(() => { if (!cancelled) setCidadesLista([]); })
      .finally(() => { if (!cancelled) setCidadesLoading(false); });
    return () => { cancelled = true; };
  }, [addrEstado]);

  const cidadesFiltradas = cidadeSearch
    ? cidadesLista.filter(c => c.toLowerCase().includes(cidadeSearch.toLowerCase()))
    : cidadesLista;

  const formatCep = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 8);
    return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
  };

  const clientAddress = [addrRua.trim(), addrNumero.trim(), addrBairro.trim(), addrCidade.trim(), addrEstado, addrCep.trim()]
    .filter(Boolean)
    .join(', ');
  const addressFilled = addrRua.trim() && addrNumero.trim() && addrBairro.trim() && addrEstado && addrCidade && addrCep.replace(/\D/g, '').length === 8;
  const [clientProfissao, setClientProfissao] = useState('');
  const [pixKey, setPixKey] = useState('');
  const [pixKeyType, setPixKeyType] = useState('cpf');
  const [pixKeyConfirmed, setPixKeyConfirmed] = useState(false);
  const [referenceContacts, setReferenceContacts] = useState<ReferenceContact[]>([
    { name: '', phone: '', relationship: '' },
    { name: '', phone: '', relationship: '' },
    { name: '', phone: '', relationship: '' },
  ]);

  // Residence video state
  const [residenceVideoUrl, setResidenceVideoUrl] = useState<string | null>(null);
  const [isRecordingResidence, setIsRecordingResidence] = useState(false);
  const [residenceDuration, setResidenceDuration] = useState(0);
  const [residenceCountdown, setResidenceCountdown] = useState<number | null>(null);
  const [residenceCameraFailed, setResidenceCameraFailed] = useState(false);
  const [residenceCameraError, setResidenceCameraError] = useState('');
  const residenceVideoRef = useRef<HTMLVideoElement>(null);
  const residencePreviewRef = useRef<HTMLVideoElement>(null);
  const residenceMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const residenceChunksRef = useRef<Blob[]>([]);
  const residenceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const residenceStreamRef = useRef<MediaStream | null>(null);

  // Upload state — progressive: cada arquivo é enviado ao ser capturado
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadingFile, setUploadingFile] = useState<string | null>(null);

  // Paths de arquivos já enviados ao storage
  const [uploadedPaths, setUploadedPaths] = useState<{
    video?: string;
    docFront?: string;
    docBack?: string;
    proofOfAddress?: string;
    residenceVideo?: string;
  }>({});

  // Load verification data
  useEffect(() => {
    async function loadVerification() {
      if (!analiseId) {
        console.error('[VerifyIdentity] analise_id ausente na URL:', window.location.href);
        setStep('error');
        setError('Link de verificação inválido. Verifique o link recebido por WhatsApp.');
        return;
      }

      try {
        console.log('[VerifyIdentity] Carregando verificação para analise_id:', analiseId);
        // Página pública: cliente acessa via link do WhatsApp, sem sessão Supabase.
        // O analise_id (UUID) no link é o fator de autenticação.
        const { data, error: fetchError } = await supabase
          .from('identity_verifications')
          .select('*')
          .eq('analise_id', analiseId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (fetchError || !data) {
          console.error('[VerifyIdentity] Erro ao buscar verificação:', fetchError);
          setStep('error');
          setError('Verificação não encontrada. Solicite um novo link.');
          return;
        }

        console.log('[VerifyIdentity] Status:', data.status, '| Retry:', data.retry_count, '| Video:', !!data.video_url);

        // Check expiration
        if (data.magic_link_expires_at && new Date(data.magic_link_expires_at) < new Date()) {
          setStep('expired');
          return;
        }

        // Check if already completed
        if (data.status === 'approved') {
          setStep('submitted');
          setVerification(data);
          return;
        }

        // Check retry limit
        if (data.retry_count >= 3 && data.status === 'rejected') {
          setStep('error');
          setError('Limite de tentativas excedido. Sua análise foi encerrada.');
          return;
        }

        setVerification(data);
        setStep('intro');
      } catch {
        setStep('error');
        setError('Erro ao carregar verificação. Tente novamente mais tarde.');
      }
    }

    loadVerification();
  }, [analiseId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (residenceStreamRef.current) {
        residenceStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (timerRef.current) clearInterval(timerRef.current);
      if (residenceTimerRef.current) clearInterval(residenceTimerRef.current);
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      if (residenceVideoUrl) URL.revokeObjectURL(residenceVideoUrl);
      if (docFrontPreview) URL.revokeObjectURL(docFrontPreview);
      if (docBackPreview) URL.revokeObjectURL(docBackPreview);
      if (proofOfAddressPreview) URL.revokeObjectURL(proofOfAddressPreview);
    };
  }, [videoUrl, residenceVideoUrl, docFrontPreview, docBackPreview, proofOfAddressPreview]);

  // ── Upload progressivo: envia cada arquivo ao storage imediatamente ──
  // Safari iOS faz GC agressivo de Blob backing-data (WebKitBlobResource error 1).
  // Solução: ler o blob inteiro para ArrayBuffer ANTES de chamar upload —
  // ArrayBuffer vive no heap JS e não é sujeito ao blob GC do WebKit.
  // Retry com backoff: redes móveis podem falhar no meio do upload.
  const uploadToStorage = useCallback(async (fileName: string, data: Blob | File, key: keyof typeof uploadedPaths) => {
    if (!verification) return;
    setUploadingFile(key);
    try {
      // 1. Materializar dados em ArrayBuffer (imune ao WebKit blob GC)
      const contentType = data.type || 'application/octet-stream';
      const buffer = await data.arrayBuffer();
      console.log(`[VerifyIdentity] Buffer materializado: ${key} (${(buffer.byteLength / 1024).toFixed(0)} KB)`);

      const basePath = `${verification.analise_id}/${verification.id}`;
      const filePath = `${basePath}/${fileName}`;

      // 2. Upload com retry (máx 3 tentativas, backoff exponencial)
      const MAX_RETRIES = 3;
      let lastError: unknown = null;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const { error: uploadError } = await supabase.storage
          .from('identity-verification')
          .upload(filePath, buffer, {
            cacheControl: '3600',
            upsert: true,
            contentType,
          });

        if (!uploadError) {
          console.log(`[VerifyIdentity] Upload ok: ${key} → ${filePath} (tentativa ${attempt})`);
          lastError = null;
          break;
        }

        // "resource already exists" = upload anterior já completou — sucesso
        const isDuplicate = uploadError.message?.toLowerCase().includes('already exists')
          || uploadError.message?.toLowerCase().includes('duplicate');
        if (isDuplicate) {
          console.log(`[VerifyIdentity] Arquivo já existe, retomando: ${key} → ${filePath}`);
          lastError = null;
          break;
        }

        lastError = uploadError;
        console.warn(`[VerifyIdentity] Upload tentativa ${attempt}/${MAX_RETRIES} falhou (${key}):`, uploadError.message);

        if (attempt < MAX_RETRIES) {
          // Backoff: 2s, 4s
          const delay = attempt * 2000;
          toast.info(`Reenviando ${key}... tentativa ${attempt + 1}/${MAX_RETRIES}`);
          await new Promise((r) => setTimeout(r, delay));
        }
      }

      if (lastError) throw lastError;
      setUploadedPaths((prev) => ({ ...prev, [key]: filePath }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[VerifyIdentity] Upload falhou (${key}):`, err);
      toast.error(`Erro ao enviar ${key}: ${msg}`);
      throw err;
    } finally {
      setUploadingFile(null);
    }
  }, [verification]);

  // ── Video Recording ──────────────────────────────────────

  // Iniciar gravação: getUserMedia chamado IMEDIATAMENTE no gesto do usuário
  // (Safari iOS bloqueia getUserMedia se não for resultado direto de um tap)
  // Fluxo: tap → abrir câmera → countdown com preview → iniciar MediaRecorder → mostrar frase
  const startRecordingWithCountdown = useCallback(async () => {
    setCameraFailed(false);
    setCameraError('');

    // Verificar pré-requisitos — mediaDevices só existe em HTTPS/localhost
    const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost';
    const hasMediaDevices = typeof navigator !== 'undefined'
      && typeof navigator.mediaDevices !== 'undefined'
      && typeof navigator.mediaDevices.getUserMedia === 'function';

    if (!isSecure || !hasMediaDevices) {
      setCameraFailed(true);
      setCameraError(
        !isSecure
          ? `A câmera só funciona em HTTPS. Você está acessando via ${window.location.protocol}//${window.location.host}. Acesse pelo link oficial enviado no WhatsApp.`
          : 'Seu navegador não suporta acesso à câmera. Atualize para Safari 14.5+ ou use o Chrome.'
      );
      return;
    }

    // 1. Abrir câmera AGORA (contexto de gesto do usuário)
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: true,
      });
    } catch (err: unknown) {
      console.error('Camera error:', err);
      setCameraFailed(true);
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setCameraError('Permissão de câmera negada. Você precisa liberar o acesso nas configurações.');
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setCameraError('Nenhuma câmera encontrada no dispositivo.');
      } else if (name === 'NotReadableError' || name === 'TrackStartError') {
        setCameraError('A câmera está sendo usada por outro app. Feche outros apps e tente novamente.');
      } else if (name === 'OverconstrainedError') {
        setCameraError('Configuração de câmera incompatível. Tente novamente.');
      } else {
        setCameraError(`Erro ao acessar a câmera: ${name || (err instanceof Error ? err.message : 'desconhecido')}`);
      }
      return;
    }

    streamRef.current = stream;

    // 2. Mostrar preview da câmera durante o countdown
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }

    // Limpar vídeo anterior
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
      setVideoUrl(null);
    }
    setUploadedPaths((prev) => ({ ...prev, video: undefined }));
    setVideoDuration(0);

    // 3. Countdown aleatório (3-5s) anti-fraude
    const countdownDuration = 3 + Math.floor(Math.random() * 3);
    setCountdown(countdownDuration);

    let remaining = countdownDuration;
    const countdownInterval = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(countdownInterval);
        setCountdown(null);

        // 4. Iniciar gravação (stream já está aberto)
        const mimeType = getSupportedMimeType();
        const recorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = recorder;
        chunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.onstop = async () => {
          const blob = new Blob(chunksRef.current, { type: mimeType.split(';')[0] });
          chunksRef.current = []; // Liberar memória dos chunks
          const url = URL.createObjectURL(blob);
          setVideoUrl(url);
          setIsRecording(false);
          stream.getTracks().forEach((t) => t.stop());
          if (videoRef.current) videoRef.current.srcObject = null;
          if (timerRef.current) clearInterval(timerRef.current);
          // Upload progressivo — uploadToStorage lê para ArrayBuffer antes de enviar
          const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
          try { await uploadToStorage(`video.${ext}`, blob, 'video'); } catch { /* toast já exibido */ }
        };

        recorder.start(250);
        setIsRecording(true);
        setShowPhrase(true);

        // Timer de duração
        const startTime = Date.now();
        timerRef.current = setInterval(() => {
          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          setVideoDuration(elapsed);
          if (elapsed >= MAX_VIDEO_DURATION) {
            recorder.stop();
          }
        }, 500);
      } else {
        setCountdown(remaining);
      }
    }, 1000);
  }, [videoUrl, uploadToStorage]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const retakeVideo = useCallback(() => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setUploadedPaths((prev) => ({ ...prev, video: undefined }));
    setVideoUrl(null);
    setVideoDuration(0);
    setShowPhrase(false);
    setCameraFailed(false);
    setCameraError('');
    // Garantir que stream anterior foi parado
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, [videoUrl]);

  // ── Document Upload ──────────────────────────────────────

  const handleDocUpload = useCallback(async (side: 'front' | 'back', file: File) => {
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      toast.error('Formato não aceito. Use JPG, PNG ou WebP.');
      return;
    }
    if (file.size > MAX_DOC_SIZE) {
      toast.error('Arquivo muito grande. Máximo 5MB.');
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    if (side === 'front') {
      if (docFrontPreview) URL.revokeObjectURL(docFrontPreview);
      setDocFrontPreview(previewUrl);
    } else {
      if (docBackPreview) URL.revokeObjectURL(docBackPreview);
      setDocBackPreview(previewUrl);
    }
    // Upload progressivo
    const ext = file.name.split('.').pop() ?? 'jpg';
    const key = side === 'front' ? 'docFront' : 'docBack';
    try { await uploadToStorage(`doc-${side}.${ext}`, file, key); } catch { /* toast já exibido */ }
  }, [docFrontPreview, docBackPreview, uploadToStorage]);

  const removeDoc = useCallback((side: 'front' | 'back') => {
    if (side === 'front') {
      if (docFrontPreview) URL.revokeObjectURL(docFrontPreview);
      setUploadedPaths((prev) => ({ ...prev, docFront: undefined }));
      setDocFrontPreview(null);
    } else {
      if (docBackPreview) URL.revokeObjectURL(docBackPreview);
      setUploadedPaths((prev) => ({ ...prev, docBack: undefined }));
      setDocBackPreview(null);
    }
  }, [docFrontPreview, docBackPreview]);

  // ── Proof of Address Upload ──────────────────────────────

  const handleProofOfAddressUpload = useCallback(async (file: File) => {
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      toast.error('Formato não aceito. Use JPG, PNG ou WebP.');
      return;
    }
    if (file.size > MAX_DOC_SIZE) {
      toast.error('Arquivo muito grande. Máximo 5MB.');
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    if (proofOfAddressPreview) URL.revokeObjectURL(proofOfAddressPreview);
    setProofOfAddressPreview(previewUrl);
    // Upload progressivo
    const ext = file.name.split('.').pop() ?? 'jpg';
    try { await uploadToStorage(`proof-of-address.${ext}`, file, 'proofOfAddress'); } catch { /* toast já exibido */ }
  }, [proofOfAddressPreview, uploadToStorage]);

  const removeProofOfAddress = useCallback(() => {
    if (proofOfAddressPreview) URL.revokeObjectURL(proofOfAddressPreview);
    setUploadedPaths((prev) => ({ ...prev, proofOfAddress: undefined }));
    setProofOfAddressPreview(null);
  }, [proofOfAddressPreview]);

  // ── Reference Contact Helpers ────────────────────────────

  const updateContact = useCallback((index: number, field: keyof ReferenceContact, value: string) => {
    setReferenceContacts((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }, []);

  const allContactsFilled = referenceContacts.every((c) => c.name.trim() && c.phone.trim() && c.relationship.trim());

  // ── Residence Video Recording ────────────────────────────

  const startResidenceRecording = useCallback(async () => {
    setResidenceCameraFailed(false);
    setResidenceCameraError('');

    const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost';
    const hasMediaDevices = typeof navigator !== 'undefined'
      && typeof navigator.mediaDevices !== 'undefined'
      && typeof navigator.mediaDevices.getUserMedia === 'function';

    if (!isSecure || !hasMediaDevices) {
      setResidenceCameraFailed(true);
      setResidenceCameraError(
        !isSecure
          ? `A câmera só funciona em HTTPS. Acesse pelo link oficial enviado no WhatsApp.`
          : 'Seu navegador não suporta acesso à câmera.'
      );
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: true,
      });
    } catch (err: unknown) {
      console.error('Residence camera error:', err);
      setResidenceCameraFailed(true);
      const name = err instanceof DOMException ? err.name : '';
      setResidenceCameraError(`Erro ao acessar a câmera: ${name || 'desconhecido'}`);
      return;
    }

    residenceStreamRef.current = stream;

    if (residenceVideoRef.current) {
      residenceVideoRef.current.srcObject = stream;
      residenceVideoRef.current.play().catch(() => {});
    }

    if (residenceVideoUrl) {
      URL.revokeObjectURL(residenceVideoUrl);
      setResidenceVideoUrl(null);
    }
    setUploadedPaths((prev) => ({ ...prev, residenceVideo: undefined }));
    setResidenceDuration(0);

    const countdownDuration = 3;
    setResidenceCountdown(countdownDuration);

    let remaining = countdownDuration;
    const countdownInterval = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(countdownInterval);
        setResidenceCountdown(null);

        const mimeType = getSupportedMimeType();
        const recorder = new MediaRecorder(stream, { mimeType });
        residenceMediaRecorderRef.current = recorder;
        residenceChunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) residenceChunksRef.current.push(e.data);
        };

        recorder.onstop = async () => {
          const blob = new Blob(residenceChunksRef.current, { type: mimeType.split(';')[0] });
          residenceChunksRef.current = []; // Liberar memória dos chunks
          const url = URL.createObjectURL(blob);
          setResidenceVideoUrl(url);
          setIsRecordingResidence(false);
          stream.getTracks().forEach((t) => t.stop());
          if (residenceVideoRef.current) residenceVideoRef.current.srcObject = null;
          if (residenceTimerRef.current) clearInterval(residenceTimerRef.current);
          // Upload progressivo — uploadToStorage lê para ArrayBuffer antes de enviar
          const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
          try { await uploadToStorage(`residence-video.${ext}`, blob, 'residenceVideo'); } catch { /* toast já exibido */ }
        };

        recorder.start(250);
        setIsRecordingResidence(true);

        const startTime = Date.now();
        residenceTimerRef.current = setInterval(() => {
          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          setResidenceDuration(elapsed);
          if (elapsed >= MAX_VIDEO_DURATION) {
            recorder.stop();
          }
        }, 500);
      } else {
        setResidenceCountdown(remaining);
      }
    }, 1000);
  }, [residenceVideoUrl, uploadToStorage]);

  const stopResidenceRecording = useCallback(() => {
    if (residenceMediaRecorderRef.current?.state === 'recording') {
      residenceMediaRecorderRef.current.stop();
    }
  }, []);

  const retakeResidenceVideo = useCallback(() => {
    if (residenceVideoUrl) URL.revokeObjectURL(residenceVideoUrl);
    setUploadedPaths((prev) => ({ ...prev, residenceVideo: undefined }));
    setResidenceVideoUrl(null);
    setResidenceDuration(0);
    setResidenceCameraFailed(false);
    setResidenceCameraError('');
    if (residenceStreamRef.current) {
      residenceStreamRef.current.getTracks().forEach((t) => t.stop());
      residenceStreamRef.current = null;
    }
  }, [residenceVideoUrl]);

  // ── Submit ───────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!verification
      || !uploadedPaths.video || !uploadedPaths.docFront || !uploadedPaths.docBack
      || !uploadedPaths.proofOfAddress || !uploadedPaths.residenceVideo
      || !addressFilled || !clientProfissao.trim() || !allContactsFilled
      || !pixKey.trim() || !pixKeyConfirmed) return;

    setUploading(true);
    setUploadProgress(30);

    try {
      // Todos os arquivos já estão no storage (upload progressivo).
      // Apenas atualizar o registro no banco com os paths e dados.
      const { error: updateError } = await supabase
        .from('identity_verifications')
        .update({
          video_url: uploadedPaths.video,
          document_front_url: uploadedPaths.docFront,
          document_back_url: uploadedPaths.docBack,
          proof_of_address_url: uploadedPaths.proofOfAddress,
          residence_video_url: uploadedPaths.residenceVideo,
          client_address: clientAddress.trim(),
          profissao_informada: clientProfissao.trim(),
          reference_contacts: referenceContacts.map((c) => ({
            name: c.name.trim(),
            phone: c.phone.trim(),
            relationship: c.relationship.trim(),
          })),
          status: 'pending' as const,
          updated_at: new Date().toISOString(),
        })
        .eq('id', verification.id);
      if (updateError) throw updateError;
      setUploadProgress(50);

      // Save PIX key to clientes table via analises_credito.cliente_id
      const { data: analise } = await supabase
        .from('analises_credito')
        .select('cliente_id')
        .eq('id', verification.analise_id)
        .single();
      if (analise?.cliente_id) {
        await supabase
          .from('clientes')
          .update({ pix_key: pixKey.trim(), pix_key_type: pixKeyType })
          .eq('id', analise.cliente_id);
      }
      setUploadProgress(70);

      // Create audit log
      await supabase.from('verification_logs').insert({
        verification_id: verification.id,
        analise_id: verification.analise_id,
        action: 'media_uploaded',
        performed_by: verification.user_id,
        details: {
          video_path: uploadedPaths.video,
          doc_front_path: uploadedPaths.docFront,
          doc_back_path: uploadedPaths.docBack,
          proof_of_address_path: uploadedPaths.proofOfAddress,
          residence_video_path: uploadedPaths.residenceVideo,
          client_address: clientAddress.trim(),
          profissao_informada: clientProfissao.trim(),
          reference_contacts_count: referenceContacts.length,
          pix_key: pixKey.trim(),
          pix_key_type: pixKeyType,
        },
      });

      setUploadProgress(100);
      setStep('submitted');
      toast.success('Verificação enviada com sucesso!');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Erro ao enviar verificação: ${msg}`);
      console.error('[VerifyIdentity] Submit error:', err);
    } finally {
      setUploading(false);
    }
  };

  // ── Render Helpers ───────────────────────────────────────

  const phrase = verification?.retry_phrase ?? verification?.verification_phrase ?? '';

  if (step === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-2" />
            <CardTitle>Erro na Verificação</CardTitle>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === 'expired') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <AlertTriangle className="h-12 w-12 text-orange-500 mx-auto mb-2" />
            <CardTitle>Link Expirado</CardTitle>
            <CardDescription>
              O link de verificação expirou. Solicite um novo link ao seu analista de crédito.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (step === 'submitted') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-2" />
            <CardTitle>Verificação Enviada!</CardTitle>
            <CardDescription>
              Seus documentos e vídeo foram recebidos com sucesso. Você será notificado
              quando a análise for concluída.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Shield className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-lg font-semibold">Verificação de Identidade</h1>
            <p className="text-sm text-muted-foreground">Análise de Crédito</p>
          </div>
          {verification && verification.retry_count > 0 && (
            <Badge variant="outline" className="ml-auto">
              Tentativa {verification.retry_count + 1}/3
            </Badge>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Step indicator */}
        <div className="flex items-center gap-2">
          {['intro', 'video', 'documents', 'proof_address', 'address_refs', 'residence_video', 'review'].map((s, i) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div
                className={`h-2 flex-1 rounded-full transition-colors ${
                  ['intro', 'video', 'documents', 'proof_address', 'address_refs', 'residence_video', 'review'].indexOf(step) >= i
                    ? 'bg-primary'
                    : 'bg-muted'
                }`}
              />
            </div>
          ))}
        </div>

        {/* Step: Intro — Multi-step tutorial com Lottie */}
        {step === 'intro' && (
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              {/* Lottie animation */}
              <div className="flex items-center justify-center bg-gradient-to-b from-primary/5 to-transparent pt-8 pb-4 px-4">
                <Lottie
                  key={introSlide}
                  animationData={INTRO_SLIDES[introSlide].animation}
                  loop
                  className="w-72 h-72"
                />
              </div>

              {/* Slide indicators */}
              <div className="flex items-center justify-center gap-2 py-3">
                {INTRO_SLIDES.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setIntroSlide(i)}
                    className={`h-2 rounded-full transition-all duration-300 ${
                      i === introSlide ? 'w-6 bg-primary' : 'w-2 bg-muted-foreground/30'
                    }`}
                  />
                ))}
              </div>

              {/* Text content */}
              <div className="px-6 pb-2 text-center min-h-[120px] flex flex-col justify-center">
                <h2 className="text-xl font-semibold mb-2">{INTRO_SLIDES[introSlide].title}</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {INTRO_SLIDES[introSlide].description}
                </p>
              </div>

              {/* Rejection reason */}
              {verification && verification.rejection_reason && (
                <div className="px-6 pb-2">
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Motivo da rejeição anterior:</strong> {verification.rejection_reason}
                    </AlertDescription>
                  </Alert>
                </div>
              )}

              {/* In-app browser warning */}
              {isInAppBrowser() && (
                <div className="px-6 pb-2">
                  <Alert className="border-orange-300 bg-orange-50 dark:bg-orange-950/30">
                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                    <AlertDescription className="text-orange-800 dark:text-orange-300 text-sm">
                      Detectamos que você está em um navegador interno (WhatsApp, etc.).
                      Para gravar o vídeo, abra no <strong>Safari</strong> ou <strong>Chrome</strong>.
                      {/android/i.test(navigator.userAgent) ? (
                        <Button
                          variant="link"
                          size="sm"
                          className="px-1 text-orange-700"
                          onClick={() => window.location.href = getOpenInBrowserUrl()}
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Abrir no Chrome
                        </Button>
                      ) : (
                        <> Toque nos <strong>⋯</strong> no topo e escolha &ldquo;Abrir no Safari&rdquo;.</>
                      )}
                    </AlertDescription>
                  </Alert>
                </div>
              )}

              {/* Navigation */}
              <div className="px-6 pb-6 pt-2 flex gap-3">
                {introSlide > 0 && (
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setIntroSlide((s) => s - 1)}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Voltar
                  </Button>
                )}
                {introSlide < INTRO_SLIDES.length - 1 ? (
                  <Button
                    className="flex-1"
                    onClick={() => setIntroSlide((s) => s + 1)}
                  >
                    Próximo
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                ) : (
                  <Button className="flex-1" onClick={() => setStep('video')}>
                    Começar Verificação
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step: Video Recording */}
        {step === 'video' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Video className="h-5 w-5" />
                Gravação de Vídeo
              </CardTitle>
              <CardDescription>
                Leia a frase abaixo em voz alta, olhando para a câmera.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Verification phrase - só aparece quando está gravando */}
              {showPhrase && isRecording ? (
                <div className="p-4 rounded-lg bg-primary/10 border border-primary/20 animate-in fade-in">
                  <p className="text-sm text-muted-foreground mb-1">Leia em voz alta:</p>
                  <p className="text-lg font-medium">&ldquo;{phrase}&rdquo;</p>
                </div>
              ) : showPhrase && videoUrl ? (
                <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                  <p className="text-sm text-muted-foreground mb-1">Frase que você leu:</p>
                  <p className="text-lg font-medium">&ldquo;{phrase}&rdquo;</p>
                </div>
              ) : countdown !== null ? (
                <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-center">
                  <p className="text-sm text-amber-800 dark:text-amber-300 mb-2">
                    Prepare-se! A gravação começa em:
                  </p>
                  <p className="text-4xl font-bold text-amber-600 dark:text-amber-400">{countdown}</p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-2">
                    A frase aparecerá quando a gravação iniciar
                  </p>
                </div>
              ) : (
                <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  <p className="text-sm text-amber-800 dark:text-amber-300">
                    🔒 A frase de verificação será exibida apenas durante a gravação.
                    Você precisará lê-la em voz alta olhando para a câmera.
                  </p>
                </div>
              )}

              {/* Camera preview / recorded video */}
              <div className="relative aspect-[9/16] max-h-[70vh] mx-auto bg-black rounded-lg overflow-hidden">
                {!videoUrl && (
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover"
                    style={{ transform: 'scaleX(-1)' }}
                    muted
                    playsInline
                  />
                )}
                {videoUrl && (
                  <>
                    <video
                      ref={previewRef}
                      className="w-full h-full object-cover pointer-events-none"
                      style={{ transform: 'scaleX(-1)' }}
                      src={videoUrl}
                      playsInline
                      loop
                      autoPlay
                    />
                    <button
                      className="absolute inset-0 flex items-center justify-center"
                      onClick={() => {
                        const v = previewRef.current;
                        if (!v) return;
                        if (v.paused) {
                          v.play();
                        } else {
                          v.pause();
                        }
                      }}
                    >
                      <span className="sr-only">Play/Pause</span>
                    </button>
                  </>
                )}
                {isRecording && (
                  <div className="absolute top-3 left-3 flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-white text-sm font-medium bg-black/50 px-2 py-0.5 rounded">
                      {videoDuration}s / {MAX_VIDEO_DURATION}s
                    </span>
                  </div>
                )}
                {!isRecording && !videoUrl && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Camera className="h-12 w-12 text-white/50" />
                  </div>
                )}
              </div>

              {/* Controls */}
              <div className="flex gap-2">
                {!isRecording && !videoUrl && countdown === null && (
                  <Button className="flex-1" onClick={startRecordingWithCountdown}>
                    <Camera className="h-4 w-4 mr-2" />
                    {cameraFailed ? 'Tentar Novamente' : 'Iniciar Gravação'}
                  </Button>
                )}
                {countdown !== null && (
                  <Button className="flex-1" disabled>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Gravação em {countdown}...
                  </Button>
                )}
                {isRecording && (
                  <Button
                    className="flex-1"
                    variant={videoDuration >= MIN_VIDEO_DURATION ? 'default' : 'secondary'}
                    onClick={stopRecording}
                    disabled={videoDuration < MIN_VIDEO_DURATION}
                  >
                    {videoDuration < MIN_VIDEO_DURATION
                      ? `Aguarde... (mín. ${MIN_VIDEO_DURATION}s)`
                      : 'Parar Gravação'}
                  </Button>
                )}
                {videoUrl && (
                  <>
                    <Button variant="outline" className="flex-1" onClick={retakeVideo} disabled={uploadingFile === 'video'}>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Regravar
                    </Button>
                    <Button className="flex-1" onClick={() => setStep('documents')} disabled={!uploadedPaths.video || uploadingFile === 'video'}>
                      {uploadingFile === 'video' ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enviando...</> : 'Próximo'}
                    </Button>
                  </>
                )}
              </div>

              {/* Alerta: câmera falhou */}
              {cameraFailed && (
                <Alert variant="destructive" className="mt-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="space-y-3">
                    <p className="font-medium">{cameraError || 'Não foi possível acessar a câmera.'}</p>

                    {isInAppBrowser() ? (
                      <div className="space-y-2">
                        <p className="text-sm">
                          Você está em um navegador interno. Abra este link no Safari ou Chrome:
                        </p>
                        {/android/i.test(navigator.userAgent) ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={() => window.location.href = getOpenInBrowserUrl()}
                          >
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Abrir no Chrome
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={() => {
                              navigator.clipboard.writeText(window.location.href);
                              toast.success('Link copiado! Cole no Safari ou Chrome.');
                            }}
                          >
                            Copiar Link
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2 text-sm">
                        <p className="font-medium">Como liberar a câmera:</p>
                        {/iPhone|iPad/i.test(navigator.userAgent) ? (
                          <ol className="list-decimal list-inside space-y-1 text-xs">
                            <li>Abra <strong>Ajustes</strong> do iPhone</li>
                            <li>Role até <strong>Safari</strong> (ou o navegador que está usando)</li>
                            <li>Toque em <strong>Câmera</strong></li>
                            <li>Selecione <strong>Permitir</strong></li>
                            <li>Volte aqui e toque em <strong>Tentar Novamente</strong></li>
                          </ol>
                        ) : /android/i.test(navigator.userAgent) ? (
                          <ol className="list-decimal list-inside space-y-1 text-xs">
                            <li>Toque no <strong>cadeado 🔒</strong> na barra de endereço</li>
                            <li>Toque em <strong>Permissões</strong></li>
                            <li>Ative <strong>Câmera</strong> e <strong>Microfone</strong></li>
                            <li>Recarregue a página</li>
                          </ol>
                        ) : (
                          <p className="text-xs">
                            Verifique as permissões de câmera e microfone nas configurações do navegador.
                          </p>
                        )}
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step: Document Upload */}
        {step === 'documents' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileImage className="h-5 w-5" />
                Documentos
              </CardTitle>
              <CardDescription>
                Envie foto da frente e do verso do seu documento (CNH ou RG).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Front */}
              <div>
                <p className="text-sm font-medium mb-2">Frente do Documento</p>
                {docFrontPreview ? (
                  <div className="relative rounded-lg overflow-hidden border">
                    <img src={docFrontPreview} alt="Frente" className="w-full h-48 object-contain bg-muted" />
                    <button
                      onClick={() => removeDoc('front')}
                      className="absolute top-2 right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center gap-2 p-6 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Clique para selecionar</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleDocUpload('front', file);
                      }}
                    />
                  </label>
                )}
              </div>

              {/* Back */}
              <div>
                <p className="text-sm font-medium mb-2">Verso do Documento</p>
                {docBackPreview ? (
                  <div className="relative rounded-lg overflow-hidden border">
                    <img src={docBackPreview} alt="Verso" className="w-full h-48 object-contain bg-muted" />
                    <button
                      onClick={() => removeDoc('back')}
                      className="absolute top-2 right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center gap-2 p-6 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Clique para selecionar</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleDocUpload('back', file);
                      }}
                    />
                  </label>
                )}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep('video')}>
                  Voltar
                </Button>
                <Button
                  className="flex-1"
                  disabled={!uploadedPaths.docFront || !uploadedPaths.docBack || !!uploadingFile}
                  onClick={() => setStep('proof_address')}
                >
                  {uploadingFile === 'docFront' || uploadingFile === 'docBack' ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enviando...</> : 'Próximo'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step: Proof of Address */}
        {step === 'proof_address' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Comprovante de Endereço
              </CardTitle>
              <CardDescription>
                Envie uma foto do comprovante de endereço <strong>no seu nome</strong> e atualizado.
                Exemplos: conta de luz, água, telefone, internet ou correspondência bancária.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {proofOfAddressPreview ? (
                <div className="relative rounded-lg overflow-hidden border">
                  <img src={proofOfAddressPreview} alt="Comprovante de Endereço" className="w-full h-64 object-contain bg-muted" />
                  <button
                    onClick={removeProofOfAddress}
                    className="absolute top-2 right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center gap-2 p-8 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Clique para selecionar o comprovante</span>
                  <span className="text-xs text-muted-foreground">JPG, PNG ou WebP — Máximo 5MB</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleProofOfAddressUpload(file);
                    }}
                  />
                </label>
              )}

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep('documents')}>
                  Voltar
                </Button>
                <Button
                  className="flex-1"
                  disabled={!uploadedPaths.proofOfAddress || uploadingFile === 'proofOfAddress'}
                  onClick={() => setStep('address_refs')}
                >
                  {uploadingFile === 'proofOfAddress' ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enviando...</> : 'Próximo'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step: Address + Reference Contacts */}
        {step === 'address_refs' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Endereço e Referências
              </CardTitle>
              <CardDescription>
                Informe seu endereço completo e 3 contatos de referência familiar.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Profissão */}
              <div className="space-y-2">
                <Label htmlFor="profissao" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Profissão
                </Label>
                <Input
                  id="profissao"
                  placeholder="Informe sua profissão (ex: Engenheiro, Médico, Autônomo...)"
                  value={clientProfissao}
                  onChange={(e) => setClientProfissao(e.target.value)}
                />
              </div>

              {/* Address */}
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Endereço Completo
                </Label>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <Label htmlFor="addr-rua" className="text-xs">Rua / Logradouro</Label>
                    <Input id="addr-rua" placeholder="Ex: Rua das Flores" value={addrRua} onChange={(e) => setAddrRua(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="addr-numero" className="text-xs">Número</Label>
                    <Input id="addr-numero" placeholder="123" value={addrNumero} onChange={(e) => setAddrNumero(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label htmlFor="addr-bairro" className="text-xs">Bairro</Label>
                    <Input id="addr-bairro" placeholder="Centro" value={addrBairro} onChange={(e) => setAddrBairro(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="addr-cep" className="text-xs">CEP</Label>
                    <Input id="addr-cep" placeholder="00000-000" value={addrCep} onChange={(e) => setAddrCep(formatCep(e.target.value))} inputMode="numeric" />
                  </div>
                  <div>
                    <Label className="text-xs">Estado</Label>
                    <Select value={addrEstado} onValueChange={setAddrEstado}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="UF" />
                      </SelectTrigger>
                      <SelectContent>
                        {ESTADOS_BR.map(uf => (
                          <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Cidade</Label>
                  {!addrEstado ? (
                    <Input placeholder="Selecione o estado primeiro" disabled className="h-9" />
                  ) : cidadesLoading ? (
                    <Input placeholder="Carregando cidades..." disabled className="h-9" />
                  ) : (
                    <Select value={addrCidade} onValueChange={setAddrCidade}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Selecione a cidade" />
                      </SelectTrigger>
                      <SelectContent>
                        <div className="px-2 pb-2 pt-1 sticky top-0 bg-popover">
                          <Input
                            placeholder="Buscar cidade..."
                            className="h-7 text-xs"
                            value={cidadeSearch}
                            onChange={(e) => setCidadeSearch(e.target.value)}
                            autoFocus
                          />
                        </div>
                        {cidadesFiltradas.length === 0 && (
                          <p className="text-xs text-muted-foreground text-center py-2">Nenhuma cidade encontrada</p>
                        )}
                        {cidadesFiltradas.map(cidade => (
                          <SelectItem key={cidade} value={cidade}>{cidade}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              {/* Reference contacts */}
              <div className="space-y-4">
                <Label className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Contatos de Referência (3 familiares)
                </Label>
                {referenceContacts.map((contact, idx) => (
                  <div key={idx} className="p-4 rounded-lg border space-y-3">
                    <p className="text-sm font-medium text-muted-foreground">Referência {idx + 1}</p>
                    <div className="grid grid-cols-1 gap-3">
                      <Input
                        placeholder="Nome completo"
                        value={contact.name}
                        onChange={(e) => updateContact(idx, 'name', e.target.value)}
                      />
                      <Input
                        placeholder="Telefone com DDD (ex: 11999999999)"
                        value={contact.phone}
                        onChange={(e) => updateContact(idx, 'phone', e.target.value)}
                        type="tel"
                      />
                      <Input
                        placeholder="Parentesco (ex: Mãe, Pai, Irmão)"
                        value={contact.relationship}
                        onChange={(e) => updateContact(idx, 'relationship', e.target.value)}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* PIX Key */}
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  💰 Chave PIX para Recebimento
                </Label>
                <p className="text-xs text-muted-foreground">
                  Informe sua chave PIX. É para ela que o valor aprovado será enviado automaticamente.
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Tipo da Chave</Label>
                    <Select value={pixKeyType} onValueChange={setPixKeyType}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cpf">CPF</SelectItem>
                        <SelectItem value="cnpj">CNPJ</SelectItem>
                        <SelectItem value="email">E-mail</SelectItem>
                        <SelectItem value="phone">Telefone</SelectItem>
                        <SelectItem value="random">Aleatória</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Chave PIX</Label>
                    <Input
                      placeholder={
                        pixKeyType === 'cpf' ? '000.000.000-00' :
                        pixKeyType === 'cnpj' ? '00.000.000/0000-00' :
                        pixKeyType === 'email' ? 'seu@email.com' :
                        pixKeyType === 'phone' ? '+5511999999999' :
                        'Chave aleatória'
                      }
                      value={pixKey}
                      onChange={(e) => setPixKey(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep('proof_address')}>
                  Voltar
                </Button>
                <Button
                  className="flex-1"
                  disabled={!addressFilled || !clientProfissao.trim() || !allContactsFilled || !pixKey.trim()}
                  onClick={() => setStep('residence_video')}
                >
                  Próximo
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step: Residence Video */}
        {step === 'residence_video' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Home className="h-5 w-5" />
                Vídeo da Fachada
              </CardTitle>
              <CardDescription>
                Grave um vídeo da frente da sua residência, mostrando claramente a fachada e o número.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {clientAddress && (
                <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                  <p className="text-sm text-muted-foreground mb-1">Endereço informado:</p>
                  <p className="text-sm font-medium">{clientAddress}</p>
                </div>
              )}

              <div className="relative aspect-[9/16] max-h-[70vh] mx-auto bg-black rounded-lg overflow-hidden">
                {!residenceVideoUrl && (
                  <video
                    ref={residenceVideoRef}
                    className="w-full h-full object-cover"
                    muted
                    playsInline
                  />
                )}
                {residenceVideoUrl && (
                  <>
                    <video
                      ref={residencePreviewRef}
                      className="w-full h-full object-cover pointer-events-none"
                      src={residenceVideoUrl}
                      playsInline
                      loop
                      autoPlay
                    />
                    <button
                      className="absolute inset-0 flex items-center justify-center"
                      onClick={() => {
                        const v = residencePreviewRef.current;
                        if (!v) return;
                        if (v.paused) v.play();
                        else v.pause();
                      }}
                    >
                      <span className="sr-only">Play/Pause</span>
                    </button>
                  </>
                )}
                {isRecordingResidence && (
                  <div className="absolute top-3 left-3 flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-white text-sm font-medium bg-black/50 px-2 py-0.5 rounded">
                      {residenceDuration}s / {MAX_VIDEO_DURATION}s
                    </span>
                  </div>
                )}
                {!isRecordingResidence && !residenceVideoUrl && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Home className="h-12 w-12 text-white/50" />
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                {!isRecordingResidence && !residenceVideoUrl && residenceCountdown === null && (
                  <Button className="flex-1" onClick={startResidenceRecording}>
                    <Camera className="h-4 w-4 mr-2" />
                    {residenceCameraFailed ? 'Tentar Novamente' : 'Iniciar Gravação'}
                  </Button>
                )}
                {residenceCountdown !== null && (
                  <Button className="flex-1" disabled>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Gravação em {residenceCountdown}...
                  </Button>
                )}
                {isRecordingResidence && (
                  <Button
                    className="flex-1"
                    variant={residenceDuration >= MIN_VIDEO_DURATION ? 'default' : 'secondary'}
                    onClick={stopResidenceRecording}
                    disabled={residenceDuration < MIN_VIDEO_DURATION}
                  >
                    {residenceDuration < MIN_VIDEO_DURATION
                      ? `Aguarde... (mín. ${MIN_VIDEO_DURATION}s)`
                      : 'Parar Gravação'}
                  </Button>
                )}
                {residenceVideoUrl && (
                  <>
                    <Button variant="outline" className="flex-1" onClick={retakeResidenceVideo} disabled={uploadingFile === 'residenceVideo'}>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Regravar
                    </Button>
                    <Button className="flex-1" onClick={() => setStep('review')} disabled={!uploadedPaths.residenceVideo || uploadingFile === 'residenceVideo'}>
                      {uploadingFile === 'residenceVideo' ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enviando...</> : 'Próximo'}
                    </Button>
                  </>
                )}
              </div>

              {residenceCameraFailed && (
                <Alert variant="destructive" className="mt-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <p className="font-medium">{residenceCameraError || 'Não foi possível acessar a câmera.'}</p>
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep('address_refs')}>
                  Voltar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step: Review */}
        {step === 'review' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" />
                Revisão
              </CardTitle>
              <CardDescription>
                Confira os dados antes de enviar.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Video preview */}
              <div>
                <p className="text-sm font-medium mb-2">Vídeo Selfie ({videoDuration}s)</p>
                {videoUrl && (
                  <video
                    className="w-full rounded-lg"
                    src={videoUrl}
                    controls
                    playsInline
                  />
                )}
              </div>

              {/* Document previews */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-sm font-medium mb-2">Doc. Frente</p>
                  {docFrontPreview && (
                    <img src={docFrontPreview} alt="Frente" className="w-full h-32 object-contain rounded-lg border bg-muted" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">Doc. Verso</p>
                  {docBackPreview && (
                    <img src={docBackPreview} alt="Verso" className="w-full h-32 object-contain rounded-lg border bg-muted" />
                  )}
                </div>
              </div>

              {/* Proof of address */}
              <div>
                <p className="text-sm font-medium mb-2">Comprovante de Endereço</p>
                {proofOfAddressPreview && (
                  <img src={proofOfAddressPreview} alt="Comprovante" className="w-full h-48 object-contain rounded-lg border bg-muted" />
                )}
              </div>

              {/* Address */}
              <div>
                <p className="text-sm font-medium mb-1">Endereço</p>
                <p className="text-sm text-muted-foreground">{clientAddress}</p>
              </div>

              {/* Reference contacts */}
              <div>
                <p className="text-sm font-medium mb-2">Contatos de Referência</p>
                <div className="space-y-2">
                  {referenceContacts.map((c, i) => (
                    <div key={i} className="p-2 rounded bg-muted/50 text-sm">
                      <span className="font-medium">{c.name}</span>
                      <span className="text-muted-foreground"> — {c.relationship}</span>
                      <span className="text-muted-foreground ml-2">({c.phone})</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Residence video */}
              <div>
                <p className="text-sm font-medium mb-2">Vídeo da Fachada ({residenceDuration}s)</p>
                {residenceVideoUrl && (
                  <video
                    className="w-full rounded-lg"
                    src={residenceVideoUrl}
                    controls
                    playsInline
                  />
                )}
              </div>

              {/* PIX Key Confirmation */}
              <div className="p-4 rounded-lg border-2 border-amber-300 bg-amber-50 dark:bg-amber-950/30 space-y-3">
                <p className="text-sm font-medium flex items-center gap-2">💰 Chave PIX para Recebimento</p>
                <div className="text-sm space-y-1">
                  <p><span className="text-muted-foreground">Tipo:</span> <span className="font-medium">{
                    pixKeyType === 'cpf' ? 'CPF' :
                    pixKeyType === 'cnpj' ? 'CNPJ' :
                    pixKeyType === 'email' ? 'E-mail' :
                    pixKeyType === 'phone' ? 'Telefone' : 'Aleatória'
                  }</span></p>
                  <p><span className="text-muted-foreground">Chave:</span> <span className="font-medium">{pixKey}</span></p>
                </div>
                <label className="flex items-start gap-3 cursor-pointer pt-2 border-t border-amber-200 dark:border-amber-800">
                  <input
                    type="checkbox"
                    checked={pixKeyConfirmed}
                    onChange={(e) => setPixKeyConfirmed(e.target.checked)}
                    className="mt-0.5 h-5 w-5 rounded border-amber-400 text-primary accent-primary"
                  />
                  <span className="text-sm font-medium text-amber-900 dark:text-amber-200">
                    Confirmo que minha chave PIX acima está correta e que o valor aprovado deverá ser enviado
                    para esta chave. Estou ciente de que não será possível alterar após o envio.
                  </span>
                </label>
              </div>

              {uploading && (
                <div className="space-y-2">
                  <Progress value={uploadProgress} />
                  <p className="text-sm text-muted-foreground text-center">
                    Enviando... {uploadProgress}%
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setStep('residence_video')}
                  disabled={uploading}
                >
                  Voltar
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleSubmit}
                  disabled={uploading || !pixKeyConfirmed}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    'Enviar Verificação'
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
