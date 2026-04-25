/**
 * @module ComprovanteUploader
 * @description Componente reutilizável para upload de comprovante de pagamento PIX
 *  com OCR opcional (Tesseract.js) que valida valor, data e chave Pix
 *  contra a parcela esperada.
 *
 * Uso:
 * ```tsx
 * <ComprovanteUploader
 *   parcela={{ valor, juros, multa, desconto }}
 *   onConfirm={async ({ file, ocr, confirmDivergencia }) => {
 *     // upload + update
 *   }}
 *   submitting={loading}
 * />
 * ```
 */
import { useEffect, useState } from 'react';
import { Upload, X, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { Alert, AlertDescription } from './ui/alert';
import { useConfigSistema } from '../hooks/useConfigSistema';
import { ocrComprovante, avaliarConciliacao, type OcrResultado } from '../lib/ocr';

export interface ComprovantePayload {
  file: File;
  ocr: OcrResultado | null;
  ocrAvaliacao: { aprovado: boolean; diferencaPct: number; motivos: string[] } | null;
  confirmDivergencia: boolean;
}

interface ParcelaInfo {
  valor: number;
  juros?: number;
  multa?: number;
  desconto?: number;
}

interface Props {
  parcela: ParcelaInfo;
  onConfirm: (payload: ComprovantePayload) => Promise<void> | void;
  onCancel?: () => void;
  submitting?: boolean;
  confirmLabel?: string;
  /** Arquivo inicial pré-carregado (ex.: imagem vinda do WhatsApp). Quando fornecido, dispensa o seletor de upload. */
  initialFile?: File | null;
}

export default function ComprovanteUploader({
  parcela,
  onConfirm,
  onCancel,
  submitting = false,
  confirmLabel = 'Confirmar Pagamento',
  initialFile = null,
}: Props) {
  const { data: config } = useConfigSistema();
  const ocrCfg = (config?.ocr_comprovantes ?? {}) as {
    enabled?: boolean;
    auto_approve_threshold_pct?: number;
    require_dual_confirm_on_mismatch?: boolean;
  };
  const ocrEnabled = ocrCfg.enabled !== false;
  const threshold = typeof ocrCfg.auto_approve_threshold_pct === 'number' ? ocrCfg.auto_approve_threshold_pct : 10;
  const requireDual = ocrCfg.require_dual_confirm_on_mismatch !== false;

  const [file, setFile] = useState<File | null>(initialFile);
  const [preview, setPreview] = useState<string | null>(initialFile ? URL.createObjectURL(initialFile) : null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrResult, setOcrResult] = useState<OcrResultado | null>(null);
  const [ocrErro, setOcrErro] = useState<string | null>(null);
  const [confirmDivergencia, setConfirmDivergencia] = useState(false);

  // Disparar OCR ao selecionar arquivo
  useEffect(() => {
    let cancelado = false;
    if (!file || !ocrEnabled) return;
    setOcrLoading(true);
    setOcrErro(null);
    setOcrResult(null);
    ocrComprovante(file)
      .then((r) => {
        if (!cancelado) setOcrResult(r);
      })
      .catch((err) => {
        if (!cancelado) setOcrErro(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelado) setOcrLoading(false);
      });
    return () => {
      cancelado = true;
    };
  }, [file, ocrEnabled]);

  const avaliacao = ocrResult ? avaliarConciliacao(ocrResult, parcela, threshold) : null;
  const bloqueado =
    !!file &&
    requireDual &&
    ocrEnabled &&
    avaliacao !== null &&
    !avaliacao.aprovado &&
    !confirmDivergencia;

  const handleSubmit = async () => {
    if (!file) return;
    await onConfirm({
      file,
      ocr: ocrResult,
      ocrAvaliacao: avaliacao,
      confirmDivergencia,
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs mb-2 block">Comprovante de pagamento (imagem)</Label>
        {preview && file ? (
          <div className="relative rounded-lg overflow-hidden border">
            <img src={preview} alt="Comprovante" className="w-full h-48 object-contain bg-muted" />
            <button
              type="button"
              onClick={() => {
                setFile(null);
                setPreview(null);
                setOcrResult(null);
                setOcrErro(null);
                setConfirmDivergencia(false);
              }}
              className="absolute top-2 right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <label className="flex flex-col items-center gap-2 p-6 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
            <Upload className="h-8 w-8 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Clique para selecionar o comprovante</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setFile(f);
                const reader = new FileReader();
                reader.onload = (ev) => setPreview(ev.target?.result as string);
                reader.readAsDataURL(f);
              }}
            />
          </label>
        )}
      </div>

      {/* OCR feedback */}
      {ocrEnabled && file && ocrLoading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />
          Analisando comprovante (OCR)...
        </div>
      )}

      {ocrEnabled && ocrErro && (
        <Alert variant="destructive">
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription className="text-xs">OCR falhou: {ocrErro}. Você pode confirmar manualmente.</AlertDescription>
        </Alert>
      )}

      {ocrResult && avaliacao?.aprovado && (
        <Alert className="border-emerald-500/40 bg-emerald-500/10">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <AlertDescription className="text-xs">
            <strong>OCR validado.</strong>{' '}
            Valor: R$ {ocrResult.valor?.toFixed(2)} · Diferença: {avaliacao.diferencaPct.toFixed(2)}%
            {ocrResult.data && <> · Data: {ocrResult.data}</>}
            {ocrResult.chavePix && <> · Chave: {ocrResult.chavePix}</>}
          </AlertDescription>
        </Alert>
      )}

      {ocrResult && avaliacao && !avaliacao.aprovado && (
        <Alert variant="destructive">
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription className="text-xs space-y-2">
            <div><strong>Divergência detectada no OCR:</strong></div>
            <ul className="list-disc list-inside">
              {avaliacao.motivos.map((m, i) => <li key={i}>{m}</li>)}
            </ul>
            {requireDual && (
              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                <Checkbox
                  checked={confirmDivergencia}
                  onCheckedChange={(v) => setConfirmDivergencia(!!v)}
                />
                <span>Confirmo o pagamento mesmo com divergência (sob minha responsabilidade)</span>
              </label>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex gap-3 justify-end pt-2">
        {onCancel && (
          <Button variant="outline" onClick={onCancel} disabled={submitting}>Cancelar</Button>
        )}
        <Button
          className="bg-green-600 hover:bg-green-700"
          disabled={!file || submitting || ocrLoading || bloqueado}
          onClick={handleSubmit}
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}
