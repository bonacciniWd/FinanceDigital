/**
 * @module CameraCapture
 * @description Captura de imagem via câmera (getUserMedia + canvas snapshot).
 * Não permite upload de arquivo — apenas captura ao vivo.
 *
 * Mobile: usa getUserMedia com facingMode 'environment' (câmera traseira).
 * Desktop: usa webcam via getUserMedia.
 * Fallback: se getUserMedia falhar em mobile, usa <input capture="environment">.
 *
 * Returns File (JPEG from canvas) + blob preview URL via onCapture callback.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent } from './ui/dialog';
import { Button } from './ui/button';
import { Camera, RotateCcw, Check, X, Loader2 } from 'lucide-react';

type Props = {
  label: string;
  previewUrl: string | null;
  isExistingDoc?: boolean;
  onCapture: (file: File, preview: string, capturedViaStream: boolean) => void;
  onRemove: () => void;
  disabled?: boolean;
};

type Stage = 'idle' | 'requesting' | 'streaming' | 'preview' | 'error';

const isMobileDevice = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

export function CameraCapture({
  label,
  previewUrl,
  isExistingDoc = false,
  onCapture,
  onRemove,
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>('idle');
  const [errMsg, setErrMsg] = useState('');
  const [snapUrl, setSnapUrl] = useState<string | null>(null);
  const [snapBlob, setSnapBlob] = useState<Blob | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    setStage('requesting');
    setErrMsg('');
    setSnapUrl(null);
    setSnapBlob(null);

    // mediaDevices only available in secure contexts (HTTPS / localhost)
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrMsg(
        isMobileDevice()
          ? 'Acesso à câmera não disponível pelo navegador. Use a câmera nativa abaixo.'
          : 'Câmera não disponível. Verifique se a página está em HTTPS e se o navegador é moderno.',
      );
      setStage('error');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {/* ignore autoplay policy */});
      }
      setStage('streaming');
    } catch (e: any) {
      const name = (e?.name ?? '') as string;
      if (name === 'NotAllowedError') {
        setErrMsg('Permissão negada. Libere o acesso à câmera nas configurações do navegador e tente novamente.');
      } else if (name === 'NotFoundError') {
        setErrMsg('Nenhuma câmera encontrada neste dispositivo.');
      } else if (name === 'NotReadableError') {
        setErrMsg('A câmera está sendo usada por outro aplicativo. Feche-o e tente novamente.');
      } else {
        setErrMsg(`Não foi possível abrir a câmera: ${e?.message ?? String(e)}`);
      }
      setStage('error');
    }
  }, []);

  const takeSnapshot = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        stopStream();
        setSnapBlob(blob);
        const url = URL.createObjectURL(blob);
        setSnapUrl(url);
        setStage('preview');
      },
      'image/jpeg',
      0.92,
    );
  }, [stopStream]);

  const confirmPhoto = useCallback(() => {
    if (!snapBlob || !snapUrl) return;
    const file = new File([snapBlob], `doc_${Date.now()}.jpg`, { type: 'image/jpeg' });
    onCapture(file, snapUrl, true); // capturedViaStream = true
    setOpen(false);
    setStage('idle');
    setSnapUrl(null);
    setSnapBlob(null);
  }, [snapBlob, snapUrl, onCapture]);

  const retake = useCallback(() => {
    if (snapUrl) URL.revokeObjectURL(snapUrl);
    setSnapUrl(null);
    setSnapBlob(null);
    startCamera();
  }, [snapUrl, startCamera]);

  const handleClose = useCallback(() => {
    stopStream();
    if (snapUrl) URL.revokeObjectURL(snapUrl);
    setSnapUrl(null);
    setSnapBlob(null);
    setStage('idle');
    setOpen(false);
  }, [stopStream, snapUrl]);

  // Native camera fallback (for mobile when getUserMedia fails)
  const handleNativeCapture = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      onCapture(file, url, false); // capturedViaStream = false (native camera input)
      setOpen(false);
      setStage('idle');
    },
    [onCapture],
  );

  // Start camera when dialog opens
  useEffect(() => {
    if (open && stage === 'idle') startCamera();
  }, [open, stage, startCamera]);

  // Cleanup on unmount
  useEffect(() => () => { stopStream(); }, [stopStream]);

  return (
    <div>
      <p className="text-xs font-medium mb-1 text-muted-foreground">{label}</p>

      {previewUrl ? (
        /* New capture (blob URL) */
        <div className="relative aspect-[4/3] rounded border bg-muted overflow-hidden">
          <img src={previewUrl} alt={label} className="w-full h-full object-cover" />
          <button
            type="button"
            disabled={disabled}
            onClick={onRemove}
            className="absolute top-1 right-1 bg-background/80 rounded-full p-1 hover:bg-destructive hover:text-destructive-foreground transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setOpen(true)}
            className="absolute bottom-1 right-1 bg-background/80 rounded-full p-1 hover:bg-primary hover:text-primary-foreground transition-colors"
            title="Tirar nova foto"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>
      ) : isExistingDoc ? (
        /* Existing doc in storage (private bucket — can't show image as anon) */
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(true)}
          className="aspect-[4/3] w-full flex flex-col items-center justify-center border-2 border-dashed border-green-400 rounded hover:bg-green-50 transition-colors text-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Check className="w-7 h-7 mb-1" />
          <span className="text-xs font-medium">Documento já enviado</span>
          <span className="text-[10px] opacity-70 mt-0.5">Toque para atualizar</span>
        </button>
      ) : (
        /* No doc yet */
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(true)}
          className="aspect-[4/3] w-full flex flex-col items-center justify-center border-2 border-dashed rounded hover:bg-muted/50 transition-colors text-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Camera className="w-6 h-6 mb-1" />
          <span className="text-xs">Abrir câmera</span>
        </button>
      )}

      <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
        <DialogContent className="sm:max-w-lg p-0 overflow-hidden gap-0">
          {/* Camera/Preview area */}
          <div className="relative bg-black min-h-[280px] flex items-center justify-center">
            {/* Live stream */}
            <video
              ref={videoRef}
              playsInline
              muted
              className={`w-full ${stage === 'streaming' ? 'block' : 'hidden'}`}
              style={{ maxHeight: '65vh', objectFit: 'cover' }}
            />

            {/* Snapshot preview */}
            {stage === 'preview' && snapUrl && (
              <img
                src={snapUrl}
                alt="preview"
                className="w-full"
                style={{ maxHeight: '65vh', objectFit: 'contain' }}
              />
            )}

            {/* Requesting */}
            {stage === 'requesting' && (
              <div className="flex flex-col items-center gap-3 text-white py-12">
                <Loader2 className="w-10 h-10 animate-spin" />
                <span className="text-sm">Abrindo câmera…</span>
              </div>
            )}

            {/* Error */}
            {stage === 'error' && (
              <div className="flex flex-col items-center gap-4 text-white py-8 px-6 text-center">
                <Camera className="w-10 h-10 opacity-60" />
                <p className="text-sm">{errMsg}</p>
                <Button variant="secondary" size="sm" onClick={startCamera}>
                  Tentar novamente
                </Button>
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleNativeCapture}
                  />
                  <span className="text-xs underline opacity-80">
                    Usar câmera nativa do dispositivo
                  </span>
                </label>
              </div>
            )}

            <canvas ref={canvasRef} className="hidden" />

            {/* Shutter button overlay on streaming */}
            {stage === 'streaming' && (
              <div className="absolute bottom-3 left-0 right-0 flex justify-center">
                <button
                  type="button"
                  onClick={takeSnapshot}
                  className="w-16 h-16 rounded-full bg-white border-4 border-primary shadow-lg hover:scale-105 transition-transform flex items-center justify-center"
                  title="Tirar foto"
                >
                  <Camera className="w-7 h-7 text-primary" />
                </button>
              </div>
            )}
          </div>

          {/* Controls bar */}
          <div className="flex gap-2 p-3 bg-background border-t">
            {stage === 'streaming' && (
              <Button variant="outline" className="flex-1" onClick={handleClose}>
                Cancelar
              </Button>
            )}

            {stage === 'preview' && (
              <>
                <Button className="flex-1" onClick={confirmPhoto}>
                  <Check className="w-4 h-4 mr-2" /> Usar esta foto
                </Button>
                <Button variant="outline" onClick={retake}>
                  <RotateCcw className="w-4 h-4 mr-2" /> Tirar novamente
                </Button>
              </>
            )}

            {(stage === 'requesting' || stage === 'error') && (
              <Button variant="outline" className="flex-1" onClick={handleClose}>
                Cancelar
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
