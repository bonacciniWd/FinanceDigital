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
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Shield,
  RefreshCw,
  ExternalLink,
  Home,
  MapPin,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';

// Lottie animations
import animSelfie from '../assets/animations/id.json';
import animData from '../assets/animations/docs.json';
import animSent from '../assets/animations/sent.json';
import animWelcome from '../assets/animations/init.json';
import type { IdentityVerificationRow, VerificationLogInsert } from '../lib/database.types';

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
    title: 'Vídeo Selfie',
    description: 'Grave um vídeo lendo uma frase de verificação, olhando para a câmera.',
  },
  {
    animation: animData,
    title: 'Vídeo da Residência',
    description: 'Grave um vídeo da fachada da sua residência mostrando o número.',
  },
  {
    animation: animSent,
    title: 'Revisão e Envio',
    description: 'Revise seus vídeos, confirme a chave PIX e envie para análise. Leva apenas alguns minutos!',
  },
] as const;

type Step = 'loading' | 'intro' | 'video' | 'residence_video' | 'review' | 'submitted' | 'error' | 'expired';

interface ResidenceLocation {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  capturedAt: string;
}

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

  // Document state removed — docs moved to ClientesPage

  // PIX key state (kept for verification review)
  const [pixKey, setPixKey] = useState('');
  const [pixKeyType, setPixKeyType] = useState('cpf');
  const [pixKeyConfirmed, setPixKeyConfirmed] = useState(false);

  // Residence video state
  const [residenceVideoUrl, setResidenceVideoUrl] = useState<string | null>(null);
  const [isRecordingResidence, setIsRecordingResidence] = useState(false);
  const [residenceDuration, setResidenceDuration] = useState(0);
  const [residenceCountdown, setResidenceCountdown] = useState<number | null>(null);
  const [residenceCameraFailed, setResidenceCameraFailed] = useState(false);
  const [residenceCameraError, setResidenceCameraError] = useState('');
  const [residenceLocation, setResidenceLocation] = useState<ResidenceLocation | null>(null);
  const [capturingLocation, setCapturingLocation] = useState(false);
  const [residenceLocationError, setResidenceLocationError] = useState('');
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
        const { data, error: fetchError }: { data: IdentityVerificationRow | null; error: { message?: string } | null } = await ((supabase
          .from('identity_verifications' as any)
          .select('*')
          .eq('analise_id', analiseId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single() as unknown) as Promise<{ data: IdentityVerificationRow | null; error: { message?: string } | null }>);

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
    };
  }, [videoUrl, residenceVideoUrl]);

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

  // ── Document/address upload handlers removed — moved to ClientesPage ──

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
    if (residenceTimerRef.current) {
      clearInterval(residenceTimerRef.current);
      residenceTimerRef.current = null;
    }
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
    setResidenceLocation(null);
    setResidenceLocationError('');
    if (residenceStreamRef.current) {
      residenceStreamRef.current.getTracks().forEach((t) => t.stop());
      residenceStreamRef.current = null;
    }
  }, [residenceVideoUrl]);

  const captureResidenceLocation = useCallback(async (): Promise<ResidenceLocation | null> => {
    if (residenceLocation) return residenceLocation;

    if (!('geolocation' in navigator)) {
      const msg = 'Seu navegador não disponibiliza geolocalização. O analista fará a conferência apenas pelo vídeo e endereço cadastrado.';
      setResidenceLocationError(msg);
      return null;
    }

    setCapturingLocation(true);
    setResidenceLocationError('');

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const captured: ResidenceLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
            capturedAt: new Date().toISOString(),
          };
          setResidenceLocation(captured);
          setCapturingLocation(false);
          resolve(captured);
        },
        (geoError) => {
          const msg = geoError.code === geoError.PERMISSION_DENIED
            ? 'Permissão de localização negada. O envio continua, mas sem esse dado adicional para conferência do endereço.'
            : geoError.code === geoError.POSITION_UNAVAILABLE
              ? 'A localização não pôde ser determinada neste momento.'
              : 'A captura da localização expirou. Você pode tentar novamente na revisão.';
          setResidenceLocationError(msg);
          setCapturingLocation(false);
          resolve(null);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000,
        }
      );
    });
  }, [residenceLocation]);

  const handleAdvanceToReview = useCallback(async () => {
    await captureResidenceLocation();
    setStep('review');
  }, [captureResidenceLocation]);

  // ── Submit ───────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!verification
      || !uploadedPaths.video || !uploadedPaths.residenceVideo
      || !pixKey.trim() || !pixKeyConfirmed) return;

    setUploading(true);
    setUploadProgress(30);

    try {
      // Todos os arquivos já estão no storage (upload progressivo).
      // Apenas atualizar o registro no banco com os paths e dados.
      const { error: updateError }: { error: { message?: string } | null } = await ((supabase
        .from('identity_verifications' as any) as any)
        .update({
          video_url: uploadedPaths.video,
          residence_video_url: uploadedPaths.residenceVideo,
          status: 'pending' as const,
          updated_at: new Date().toISOString(),
        })
        .eq('id', verification.id) as Promise<{ error: { message?: string } | null }>);
      if (updateError) throw updateError;
      setUploadProgress(50);

      // Save PIX key to clientes table via analises_credito.cliente_id
      const { data: analise }: { data: { cliente_id: string | null } | null } = await ((supabase
        .from('analises_credito' as any)
        .select('cliente_id')
        .eq('id', verification.analise_id)
        .single() as unknown) as Promise<{ data: { cliente_id: string | null } | null }>);
      if (analise?.cliente_id) {
        await ((supabase
          .from('clientes' as any) as any)
          .update({ pix_key: pixKey.trim(), pix_key_type: pixKeyType })
          .eq('id', analise.cliente_id) as Promise<unknown>);
      }
      setUploadProgress(70);

      // Create audit log
      const logPayload: VerificationLogInsert = {
        verification_id: verification.id,
        analise_id: verification.analise_id,
        action: 'media_uploaded',
        performed_by: verification.user_id,
        details: {
          video_path: uploadedPaths.video,
          residence_video_path: uploadedPaths.residenceVideo,
          pix_key: pixKey.trim(),
          pix_key_type: pixKeyType,
          residence_location: residenceLocation ? {
            latitude: residenceLocation.latitude,
            longitude: residenceLocation.longitude,
            accuracy: residenceLocation.accuracy,
            captured_at: residenceLocation.capturedAt,
          } : null,
        },
      };
      await ((supabase.from('verification_logs' as any) as any).insert(logPayload) as Promise<unknown>);

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
          {['intro', 'video', 'residence_video', 'review'].map((s, i) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div
                className={`h-2 flex-1 rounded-full transition-colors ${
                  ['intro', 'video', 'residence_video', 'review'].indexOf(step) >= i
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
                    <Button className="flex-1" onClick={() => setStep('residence_video')} disabled={!uploadedPaths.video || uploadingFile === 'video'}>
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
                    <Button className="flex-1" onClick={handleAdvanceToReview} disabled={!uploadedPaths.residenceVideo || uploadingFile === 'residenceVideo' || capturingLocation}>
                      {uploadingFile === 'residenceVideo' ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enviando...</> : capturingLocation ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Localizando...</> : 'Próximo'}
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
                <Button variant="outline" className="flex-1" onClick={() => setStep('video')}>
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

              <div className="p-4 rounded-lg border border-sky-200 bg-sky-50 dark:bg-sky-950/20 space-y-3">
                <p className="text-sm font-medium flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Localização da Fachada
                </p>

                {capturingLocation ? (
                  <div className="flex items-center gap-2 text-sm text-sky-700 dark:text-sky-300">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Capturando localização para conferência do endereço...
                  </div>
                ) : residenceLocation ? (
                  <div className="space-y-1 text-sm text-sky-900 dark:text-sky-100">
                    <p>
                      Latitude {residenceLocation.latitude.toFixed(6)} · Longitude {residenceLocation.longitude.toFixed(6)}
                    </p>
                    <p className="text-xs text-sky-700 dark:text-sky-300">
                      Precisão aproximada: {residenceLocation.accuracy ? `${Math.round(residenceLocation.accuracy)} m` : 'não informada'} · capturada em {new Date(residenceLocation.capturedAt).toLocaleString('pt-BR')}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-sky-800 dark:text-sky-200">
                      Vamos tentar capturar sua localização junto com o vídeo da fachada para o analista comparar com o endereço cadastrado.
                    </p>
                    {residenceLocationError && (
                      <p className="text-xs text-amber-700 dark:text-amber-300">{residenceLocationError}</p>
                    )}
                    <Button variant="outline" size="sm" onClick={captureResidenceLocation} disabled={capturingLocation}>
                      <MapPin className="h-4 w-4 mr-2" />
                      Tentar capturar localização
                    </Button>
                  </div>
                )}
              </div>

              {/* PIX Key Confirmation */}
              <div className="p-4 rounded-lg border-2 border-amber-300 bg-amber-50 dark:bg-amber-950/30 space-y-3">
                <p className="text-sm font-medium flex items-center gap-2">💰 Chave PIX para Recebimento</p>
                <div className="space-y-3">
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
                  disabled={uploading || !pixKeyConfirmed || !pixKey.trim()}
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
