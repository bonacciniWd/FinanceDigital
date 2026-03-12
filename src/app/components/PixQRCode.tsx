/**
 * @module PixQRCode
 * @description Componente que exibe QR Code Pix para pagamento de cobrança.
 * Mostra o QR Code, código copia-e-cola e link de pagamento.
 */
import { useState } from 'react';
import { Copy, Check, ExternalLink, QrCode, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';

interface PixQRCodeProps {
  /** Pix copia-e-cola (BRCode) */
  brCode: string | null;
  /** URL da imagem do QR Code */
  qrCodeImage: string | null;
  /** Link de pagamento */
  paymentLink: string | null;
  /** Valor da cobrança em R$ */
  valor: number;
  /** Data de expiração */
  expirationDate?: string | null;
  /** Status da cobrança */
  status: 'ACTIVE' | 'COMPLETED' | 'EXPIRED' | 'ERROR';
  /** Descrição/nome do cliente */
  descricao?: string;
}

const statusConfig = {
  ACTIVE: {
    label: 'Aguardando pagamento',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  },
  COMPLETED: {
    label: 'Pago',
    className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  },
  EXPIRED: {
    label: 'Expirado',
    className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  },
  ERROR: {
    label: 'Erro',
    className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  },
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function PixQRCode({
  brCode,
  qrCodeImage,
  paymentLink,
  valor,
  expirationDate,
  status,
  descricao,
}: PixQRCodeProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!brCode) return;
    await navigator.clipboard.writeText(brCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const config = statusConfig[status] || statusConfig.ERROR;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <QrCode className="h-4 w-4 text-emerald-500" />
            Pagamento Pix
          </CardTitle>
          <Badge className={config.className}>{config.label}</Badge>
        </div>
        {descricao && (
          <p className="text-xs text-muted-foreground">{descricao}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Valor */}
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Valor</p>
          <p className="text-2xl font-bold">{formatCurrency(valor)}</p>
        </div>

        {/* QR Code */}
        {status === 'ACTIVE' && qrCodeImage && (
          <div className="flex justify-center">
            <img
              src={qrCodeImage}
              alt="QR Code Pix"
              className="h-48 w-48 rounded-lg border bg-white p-2"
            />
          </div>
        )}

        {status === 'COMPLETED' && (
          <div className="flex flex-col items-center gap-2 py-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <Check className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <p className="font-medium text-green-600 dark:text-green-400">
              Pagamento confirmado!
            </p>
          </div>
        )}

        {status === 'EXPIRED' && (
          <div className="flex flex-col items-center gap-2 py-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
              <Clock className="h-8 w-8 text-red-600 dark:text-red-400" />
            </div>
            <p className="font-medium text-red-600 dark:text-red-400">
              Cobrança expirada
            </p>
          </div>
        )}

        {/* Pix Copia e Cola */}
        {status === 'ACTIVE' && brCode && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Pix Copia e Cola
            </p>
            <div className="flex gap-2">
              <code className="flex-1 rounded-md border bg-muted/50 px-3 py-2 text-xs break-all font-mono max-h-20 overflow-y-auto">
                {brCode}
              </code>
              <Button
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={handleCopy}
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Link de pagamento */}
        {status === 'ACTIVE' && paymentLink && (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => window.open(paymentLink, '_blank', 'noopener,noreferrer')}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Abrir link de pagamento
          </Button>
        )}

        {/* Expiração */}
        {status === 'ACTIVE' && expirationDate && (
          <p className="text-center text-xs text-muted-foreground">
            Expira em{' '}
            {new Date(expirationDate).toLocaleString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
