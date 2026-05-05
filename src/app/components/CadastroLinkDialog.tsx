/**
 * @module CadastroLinkDialog
 * @description Dialog para gerar link de cadastro/atualização cadastral.
 * Dois botões: Copiar link / Enviar via WhatsApp. Quando `clienteId` é passado,
 * gera um link de ATUALIZAÇÃO (vincula ao cliente). Sem clienteId, gera link
 * genérico para cadastro novo.
 */
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Loader2, Copy, Check, MessageSquare, Link as LinkIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clienteId?: string | null;
  clienteNome?: string;
  clienteTelefone?: string;
};

export function CadastroLinkDialog({
  open,
  onOpenChange,
  clienteId,
  clienteNome,
  clienteTelefone,
}: Props) {
  const [link, setLink] = useState<string | null>(null);
  const [loading, setLoading] = useState<'generate' | 'send' | null>(null);
  const [copied, setCopied] = useState(false);

  const reset = () => {
    setLink(null);
    setCopied(false);
    setLoading(null);
  };

  const callFn = async (sendWhatsapp: boolean) => {
    setLoading(sendWhatsapp ? 'send' : 'generate');
    try {
      const { data, error } = await supabase.functions.invoke('send-registration-link', {
        body: {
          cliente_id: clienteId ?? null,
          send_whatsapp: sendWhatsapp,
          telefone_destino: clienteTelefone,
          nome_destino: clienteNome,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? 'Falha desconhecida');
      setLink(data.link);
      if (sendWhatsapp) {
        if (data.sent) {
          toast.success('Link enviado por WhatsApp ✅');
        } else {
          toast.warning(data.warning ?? 'Link gerado, mas não foi possível enviar pelo WhatsApp.');
        }
      } else {
        toast.success('Link gerado. Use o botão ao lado para copiar.');
      }
    } catch (e: any) {
      toast.error(`Erro: ${e?.message ?? String(e)}`);
    } finally {
      setLoading(null);
    }
  };

  const handleCopy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success('Link copiado!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Não foi possível copiar.');
    }
  };

  const isUpdate = !!clienteId;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LinkIcon className="w-4 h-4" />
            {isUpdate ? 'Atualização de Cadastro' : 'Novo Cadastro de Cliente'}
          </DialogTitle>
          <DialogDescription>
            {isUpdate
              ? `Gere um link único para ${clienteNome ?? 'este cliente'} preencher/atualizar os próprios dados.`
              : 'Gere um link único para enviar a um lead. Ele preenche o cadastro pelo celular dele.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {!link ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => callFn(false)} disabled={loading !== null}>
                {loading === 'generate' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Copy className="w-4 h-4 mr-2" />}
                Gerar e copiar link
              </Button>
              <Button onClick={() => callFn(true)} disabled={loading !== null || (!clienteTelefone && isUpdate)}>
                {loading === 'send' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MessageSquare className="w-4 h-4 mr-2" />}
                Enviar via WhatsApp
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input value={link} readOnly className="font-mono text-xs" />
                <Button size="icon" variant="outline" onClick={handleCopy}>
                  {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Válido por 7 dias. Se já enviou por WhatsApp, basta aguardar o cliente preencher.
              </p>
              <Button variant="outline" size="sm" onClick={reset} className="w-full">
                Gerar outro link
              </Button>
            </div>
          )}

          {!clienteTelefone && isUpdate && !link && (
            <p className="text-xs text-amber-600">
              ⚠ Cliente sem telefone cadastrado — só é possível copiar o link manualmente.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
