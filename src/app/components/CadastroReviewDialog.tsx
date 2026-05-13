/**
 * @module CadastroReviewDialog
 * @description Dialog de revisão e aprovação de cadastros preenchidos via link público.
 *
 * Mostra todos os cadastros com submission_status='pendente_revisao'.
 * Para cada um, exibe dados do cliente, análise EXIF dos documentos e
 * botões de Aprovar / Rejeitar.
 *
 * Os documentos são exibidos via URLs assinadas (signed URLs) — bucket privado.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from './ui/dialog';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Textarea } from './ui/textarea';
import { Separator } from './ui/separator';
import { ScrollArea } from './ui/scroll-area';
import { Loader2, CheckCircle2, XCircle, ChevronRight, ChevronDown, Eye, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// ── Types ────────────────────────────────────────────────────
type DocMeta = {
  flags: string[];
  score: number;
  label: string;
  source: string;
};

type Metadata = {
  user_agent?: string;
  submitted_at?: string;
  doc_frente?: DocMeta;
  doc_verso?: DocMeta;
  comprovante?: DocMeta;
};

type Submission = {
  id: string;
  used_at: string;
  submission_status: string;
  review_notes: string | null;
  reviewed_at: string | null;
  metadata: Metadata | null;
  used_cliente_id: string | null;
  cliente_id: string | null; // original (link for update vs new)
};

type ClienteRow = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string;
  cpf: string | null;
  profissao: string | null;
  renda_mensal: number | null;
  rua: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  documento_frente_url: string | null;
  documento_verso_url: string | null;
  comprovante_endereco_url: string | null;
};

// ── Helpers ──────────────────────────────────────────────────
function scoreColor(score: number): string {
  if (score === 0) return 'bg-green-500 text-white font-semibold';
  if (score === 1) return 'bg-amber-400 text-amber-950 font-semibold';
  if (score === 2) return 'bg-orange-500 text-white font-semibold';
  return 'bg-red-600 text-white font-semibold';
}

function scoreIcon(score: number) {
  if (score === 0) return '✓';
  if (score <= 1) return '⚠';
  return '✕';
}

function DocMetaBadge({ meta, label }: { meta: DocMeta | undefined; label: string }) {
  if (!meta) return null;
  const hasSuspect = meta.score > 0;
  return (
    <div className={`text-xs rounded p-2 ${hasSuspect ? 'bg-amber-50 dark:bg-amber-950/40 border border-amber-400 dark:border-amber-600' : 'bg-muted'}`}>
      <p className="font-medium mb-0.5">{label}: <span className={scoreColor(meta.score).split(' ').join(' rounded px-1')}>{scoreIcon(meta.score)} {meta.label}</span></p>
      {meta.flags.length > 0 && (
        <ul className="space-y-0.5 mt-1">
          {meta.flags.map((f) => (
            <li key={f} className="font-mono text-[10px] text-muted-foreground">{f}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Document preview (signed URL) ────────────────────────────
function DocPreview({ path, label }: { path: string | null; label: string }) {
  const { data: url, isLoading } = useQuery({
    queryKey: ['signed_url_thumb', path],
    queryFn: async () => {
      if (!path) return null;
      const { data } = await supabase.storage
        .from('client-documents')
        .createSignedUrl(path, 3600, {
          // Thumbnail 400px — corta ~90% do egress de imagens grandes (HEIC/JPEG).
          transform: { width: 400, resize: 'contain', quality: 70 },
        });
      return data?.signedUrl ?? null;
    },
    enabled: !!path,
    staleTime: 50 * 60 * 1000, // 50 minutes
  });

  // Original (lazy): só carregado quando o user clica para abrir em nova aba.
  const [wantFull, setWantFull] = useState(false);
  const { data: urlFull } = useQuery({
    queryKey: ['signed_url_full', path],
    queryFn: async () => {
      if (!path) return null;
      const { data } = await supabase.storage
        .from('client-documents')
        .createSignedUrl(path, 3600);
      return data?.signedUrl ?? null;
    },
    enabled: !!path && wantFull,
    staleTime: 50 * 60 * 1000,
  });

  if (!path) return (
    <div className="aspect-[4/3] flex items-center justify-center bg-muted rounded border text-xs text-muted-foreground">
      Não enviado
    </div>
  );

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      {isLoading ? (
        <div className="aspect-[4/3] flex items-center justify-center bg-muted rounded border">
          <Loader2 className="w-4 h-4 animate-spin" />
        </div>
      ) : url ? (
        <a
          href={urlFull ?? url}
          target="_blank"
          rel="noopener noreferrer"
          onMouseEnter={() => setWantFull(true)}
          onFocus={() => setWantFull(true)}
          onClick={() => setWantFull(true)}
        >
          <img src={url} alt={label} className="aspect-[4/3] w-full object-cover rounded border hover:opacity-90 transition-opacity" />
        </a>
      ) : (
        <div className="aspect-[4/3] flex items-center justify-center bg-muted rounded border text-xs text-muted-foreground">
          Erro ao carregar
        </div>
      )}
    </div>
  );
}

// ── Submission detail ────────────────────────────────────────
function SubmissionDetail({
  submission,
  onApproved,
  onRejected,
}: {
  submission: Submission;
  onApproved: () => void;
  onRejected: () => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);

  const { data: cliente, isLoading: loadingCliente } = useQuery<ClienteRow | null>({
    queryKey: ['cliente_review', submission.used_cliente_id],
    queryFn: async () => {
      if (!submission.used_cliente_id) return null;
      const { data, error } = await supabase
        .from('clientes')
        .select('id, nome, email, telefone, cpf, profissao, renda_mensal, rua, numero, bairro, cidade, estado, cep, documento_frente_url, documento_verso_url, comprovante_endereco_url')
        .eq('id', submission.used_cliente_id)
        .maybeSingle();
      if (error) throw error;
      return data as ClienteRow | null;
    },
    enabled: !!submission.used_cliente_id,
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('cadastro_links')
        .update({
          submission_status: 'aprovado',
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', submission.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cadastro_pendentes'] });
      queryClient.invalidateQueries({ queryKey: ['cadastro_pendentes_count'] });
      toast.success('Cadastro aprovado!');
      onApproved();
    },
    onError: (e: any) => toast.error(`Erro: ${e?.message ?? String(e)}`),
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      if (!rejectReason.trim()) throw new Error('Informe o motivo da rejeição');
      const { error } = await supabase
        .from('cadastro_links')
        .update({
          submission_status: 'rejeitado',
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
          review_notes: rejectReason.trim(),
        })
        .eq('id', submission.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cadastro_pendentes'] });
      queryClient.invalidateQueries({ queryKey: ['cadastro_pendentes_count'] });
      toast.success('Cadastro rejeitado.');
      onRejected();
    },
    onError: (e: any) => toast.error(`Erro: ${e?.message ?? String(e)}`),
  });

  const meta = submission.metadata;
  const maxScore = Math.max(
    meta?.doc_frente?.score ?? 0,
    meta?.doc_verso?.score ?? 0,
    meta?.comprovante?.score ?? 0,
  );

  if (loadingCliente) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Client data */}
      {cliente && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <div><span className="text-muted-foreground">Nome: </span>{cliente.nome}</div>
          <div><span className="text-muted-foreground">CPF: </span>{cliente.cpf ?? '—'}</div>
          <div><span className="text-muted-foreground">Telefone: </span>{cliente.telefone}</div>
          <div><span className="text-muted-foreground">Email: </span>{cliente.email ?? '—'}</div>
          <div><span className="text-muted-foreground">Profissão: </span>{cliente.profissao ?? '—'}</div>
          <div>
            <span className="text-muted-foreground">Renda: </span>
            {cliente.renda_mensal
              ? `R$ ${Number(cliente.renda_mensal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
              : '—'}
          </div>
          <div className="col-span-2">
            <span className="text-muted-foreground">Endereço: </span>
            {[cliente.rua, cliente.numero, cliente.bairro, cliente.cidade, cliente.estado].filter(Boolean).join(', ') || '—'}
          </div>
        </div>
      )}

      <Separator />

      {/* Documents */}
      <div>
        <p className="text-sm font-medium mb-2">Documentos enviados</p>
        <div className="grid grid-cols-3 gap-3">
          <DocPreview path={cliente?.documento_frente_url ?? null} label="Frente" />
          <DocPreview path={cliente?.documento_verso_url ?? null} label="Verso" />
          <DocPreview path={cliente?.comprovante_endereco_url ?? null} label="Comprovante" />
        </div>
      </div>

      <Separator />

      {/* EXIF / tamper analysis */}
      <div>
        <p className="text-sm font-medium mb-2 flex items-center gap-2">
          Análise de metadados
          {maxScore > 0 && (
            <span className="inline-flex items-center gap-1 text-amber-600 text-xs">
              <AlertTriangle className="w-3 h-3" /> Atenção: possível adulteração
            </span>
          )}
        </p>
        <div className="space-y-1.5">
          <DocMetaBadge meta={meta?.doc_frente} label="Frente" />
          <DocMetaBadge meta={meta?.doc_verso} label="Verso" />
          <DocMetaBadge meta={meta?.comprovante} label="Comprovante" />
        </div>
        {meta?.user_agent && (
          <p className="text-[10px] text-muted-foreground mt-2 truncate">
            User-agent: {meta.user_agent}
          </p>
        )}
      </div>

      <Separator />

      {/* Actions */}
      {!showRejectForm ? (
        <div className="flex gap-2">
          <Button
            className="flex-1"
            onClick={() => approveMutation.mutate()}
            disabled={approveMutation.isPending || rejectMutation.isPending}
          >
            {approveMutation.isPending
              ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
              : <CheckCircle2 className="w-4 h-4 mr-2" />
            }
            Aprovar
          </Button>
          <Button
            variant="outline"
            className="flex-1 border-destructive text-destructive hover:bg-destructive/10"
            onClick={() => setShowRejectForm(true)}
            disabled={approveMutation.isPending || rejectMutation.isPending}
          >
            <XCircle className="w-4 h-4 mr-2" /> Rejeitar
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-medium">Motivo da rejeição</p>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Informe o motivo para o cliente..."
            rows={3}
          />
          <div className="flex gap-2">
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => rejectMutation.mutate()}
              disabled={rejectMutation.isPending}
            >
              {rejectMutation.isPending
                ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
                : <XCircle className="w-4 h-4 mr-2" />
              }
              Confirmar rejeição
            </Button>
            <Button variant="outline" onClick={() => setShowRejectForm(false)}>Cancelar</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Submission list item ──────────────────────────────────────
function SubmissionItem({
  submission,
  isOpen,
  onToggle,
}: {
  submission: Submission;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const meta = submission.metadata;
  const maxScore = Math.max(
    meta?.doc_frente?.score ?? 0,
    meta?.doc_verso?.score ?? 0,
    meta?.comprovante?.score ?? 0,
  );
  const isUpdate = !!submission.cliente_id;

  return (
    <div className="border rounded-md overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          {isOpen ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">
              {submission.used_cliente_id ? (
                <ClienteName clienteId={submission.used_cliente_id} />
              ) : (
                <span className="text-muted-foreground">Cliente desconhecido</span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {submission.used_at
                ? format(new Date(submission.used_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                : '—'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {isUpdate && <Badge variant="outline" className="text-[10px] py-0">Atualização</Badge>}
          {maxScore > 0 && (
            <Badge
              style={maxScore >= 3
                ? { background: '#dc2626', color: '#fff', borderColor: '#b91c1c' }
                : maxScore >= 2
                ? { background: '#f97316', color: '#fff', borderColor: '#ea580c' }
                : { background: '#d97706', color: '#fff', borderColor: '#b45309' }}
              className="text-xs px-2 py-0.5 font-bold tracking-wide"
            >
              ⚠ {maxScore >= 3 ? 'Adulterado' : maxScore === 2 ? 'Suspeito' : 'Atenção'}
            </Badge>
          )}
        </div>
      </button>

      {isOpen && (
        <div className="border-t p-4 bg-background">
          <SubmissionDetail
            submission={submission}
            onApproved={onToggle}
            onRejected={onToggle}
          />
        </div>
      )}
    </div>
  );
}

// Small helper: load just the name
function ClienteName({ clienteId }: { clienteId: string }) {
  const { data } = useQuery({
    queryKey: ['cliente_nome', clienteId],
    queryFn: async () => {
      const { data } = await supabase.from('clientes').select('nome').eq('id', clienteId).maybeSingle();
      return data?.nome ?? 'Cliente';
    },
    staleTime: 5 * 60 * 1000,
  });
  return <>{data ?? <Loader2 className="w-3 h-3 inline animate-spin" />}</>;
}

// ── Main dialog ──────────────────────────────────────────────
type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

export function CadastroReviewDialog({ open, onOpenChange }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: submissions = [], isLoading } = useQuery<Submission[]>({
    queryKey: ['cadastro_pendentes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cadastro_links')
        .select('id, used_at, submission_status, review_notes, reviewed_at, metadata, used_cliente_id, cliente_id')
        .eq('submission_status', 'pendente_revisao')
        .order('used_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Submission[];
    },
    enabled: open,
    refetchInterval: open ? 30000 : false,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl h-[85vh] overflow-y-scroll flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            Revisão de Cadastros
            {submissions.length > 0 && (
              <Badge className="ml-1">{submissions.length} pendente{submissions.length !== 1 ? 's' : ''}</Badge>
            )}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Analise os documentos e metadados antes de aprovar ou rejeitar cada cadastro.
          </p>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : submissions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <CheckCircle2 className="w-12 h-12 mb-3 text-green-500" />
              <p className="font-medium">Nenhum cadastro pendente</p>
              <p className="text-sm">Todos os cadastros foram revisados.</p>
            </div>
          ) : (
            <div className="space-y-2 pb-4">
              {submissions.map((s) => (
                <SubmissionItem
                  key={s.id}
                  submission={s}
                  isOpen={openId === s.id}
                  onToggle={() => setOpenId(openId === s.id ? null : s.id)}
                />
              ))}
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Exported hook: count of pending submissions (for badge in nav) */
export function usePendingCadastrosCount() {
  return useQuery<number>({
    queryKey: ['cadastro_pendentes_count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('cadastro_links')
        .select('id', { count: 'exact', head: true })
        .eq('submission_status', 'pendente_revisao');
      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval: 60000, // refresh every minute
  });
}
