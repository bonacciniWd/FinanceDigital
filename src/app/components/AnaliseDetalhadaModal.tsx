/**
 * @module AnaliseDetalhadaModal
 * @description Modal detalhado para análise de crédito com verificação de identidade.
 *
 * Exibe dados da análise, vídeo do cliente, documentos enviados,
 * histórico de ações e controles para aprovar/recusar/solicitar retry.
 *
 * Regras de negócio:
 * - Analista não pode analisar a própria solicitação
 * - Máximo 3 retries por verificação
 * - Após 3 rejeições → análise auto-recusada
 */
import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Skeleton } from '../components/ui/skeleton';
import {
  CheckCircle,
  XCircle,
  RefreshCw,
  Video,
  FileImage,
  Clock,
  User,
  Shield,
  AlertTriangle,
  Send,
  Loader2,
  MapPin,
  Home,
  Users,
  Phone,
  X,
  ZoomIn,
  Briefcase,
} from 'lucide-react';
import { toast } from 'sonner';

import { useVerificationsByAnalise, useUpdateVerification, useCreateVerificationLog, useVerificationLogs } from '../hooks/useIdentityVerification';
import { useUpdateAnalise } from '../hooks/useAnaliseCredito';
import { useCliente } from '../hooks/useClientes';
import { useAuth } from '../contexts/AuthContext';
import { getSignedUrl } from '../services/identityVerificationService';
import { supabase } from '../lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import type { AnaliseCredito } from '../lib/view-types';

interface Props {
  analise: AnaliseCredito | null;
  open: boolean;
  onClose: () => void;
  onSendMagicLink?: (analiseId: string) => void;
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pendente', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  approved: { label: 'Aprovada', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  rejected: { label: 'Rejeitada', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  retry_needed: { label: 'Reenvio Necessário', className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export default function AnaliseDetalhadaModal({ analise, open, onClose, onSendMagicLink }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [rejectionReason, setRejectionReason] = useState('');
  const [retryPhrase, setRetryPhrase] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [showRetryForm, setShowRetryForm] = useState(false);
  const [approvingCredit, setApprovingCredit] = useState(false);
  const [videoSignedUrl, setVideoSignedUrl] = useState<string | null>(null);
  const [docFrontUrl, setDocFrontUrl] = useState<string | null>(null);
  const [docBackUrl, setDocBackUrl] = useState<string | null>(null);
  const [proofOfAddressUrl, setProofOfAddressUrl] = useState<string | null>(null);
  const [residenceVideoUrl, setResidenceVideoUrl] = useState<string | null>(null);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const { data: verifications, isLoading: loadingVerifications, error: verificationsError } = useVerificationsByAnalise(
    analise?.id
  );
  if (verificationsError) console.error('Erro ao carregar verificações:', verificationsError);
  const latestVerification = verifications?.[0];
  const { data: logs } = useVerificationLogs(latestVerification?.id);

  const updateVerification = useUpdateVerification();
  const createLog = useCreateVerificationLog();
  const updateAnalise = useUpdateAnalise();

  // Fetch client data to compare profissao
  const { data: clienteData } = useCliente(analise?.clienteId ?? undefined);

  // Profession mismatch detection
  const profissaoCadastro = clienteData?.profissao?.trim().toLowerCase() || '';
  const profissaoVerificacao = latestVerification?.profissaoInformada?.trim().toLowerCase() || '';
  const hasProfissaoMismatch = !!(
    profissaoCadastro &&
    profissaoVerificacao &&
    profissaoCadastro !== profissaoVerificacao
  );

  // Auto-reject when profession mismatch is detected
  const autoRejectedRef = useRef(false);
  useEffect(() => {
    if (!hasProfissaoMismatch || autoRejectedRef.current) return;
    if (!latestVerification || !analise || !user) return;
    if (analise.status === 'recusado' || analise.status === 'aprovado') return;
    if (latestVerification.status === 'rejected') return;

    autoRejectedRef.current = true;

    // Auto-reject verification
    updateVerification.mutate(
      {
        id: latestVerification.id,
        updates: {
          status: 'rejected',
          analyzed_by: user.id,
          analyzed_at: new Date().toISOString(),
          rejection_reason: `Profissão divergente — Cadastro: "${clienteData?.profissao}", Verificação: "${latestVerification.profissaoInformada}"`,
        },
      },
      {
        onSuccess: () => {
          createLog.mutate({
            verification_id: latestVerification.id,
            analise_id: analise.id,
            action: 'profession_mismatch_auto_rejected',
            performed_by: user.id,
            details: {
              profissao_cadastro: clienteData?.profissao,
              profissao_verificacao: latestVerification.profissaoInformada,
            },
          });
          // Also reject the credit analysis
          updateAnalise.mutate(
            {
              id: analise.id,
              updates: {
                status: 'recusado',
                motivo: `Profissão divergente — Cadastro: "${clienteData?.profissao}", Verificação: "${latestVerification.profissaoInformada}"`,
              },
            },
            {
              onSuccess: () => {
                queryClient.invalidateQueries({ queryKey: ['analises-credito'] });
                toast.error('Análise RECUSADA automaticamente — profissão informada na verificação difere do cadastro.');
              },
            }
          );
        },
      }
    );
  }, [hasProfissaoMismatch, latestVerification, analise, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const isSelfAnalysis = user?.id === latestVerification?.userId;
  const hasMedia = !!(latestVerification?.videoUrl);
  const canReview = !isSelfAnalysis && hasMedia && latestVerification?.status === 'pending';

  // Load signed URLs for media
  const loadMedia = async () => {
    if (!latestVerification) return;
    setLoadingMedia(true);
    try {
      if (latestVerification.videoUrl) {
        const url = await getSignedUrl(latestVerification.videoUrl);
        setVideoSignedUrl(url);
      }
      if (latestVerification.documentFrontUrl) {
        const url = await getSignedUrl(latestVerification.documentFrontUrl);
        setDocFrontUrl(url);
      }
      if (latestVerification.documentBackUrl) {
        const url = await getSignedUrl(latestVerification.documentBackUrl);
        setDocBackUrl(url);
      }
      if (latestVerification.proofOfAddressUrl) {
        const url = await getSignedUrl(latestVerification.proofOfAddressUrl);
        setProofOfAddressUrl(url);
      }
      if (latestVerification.residenceVideoUrl) {
        const url = await getSignedUrl(latestVerification.residenceVideoUrl);
        setResidenceVideoUrl(url);
      }
    } catch {
      toast.error('Erro ao carregar mídias');
    } finally {
      setLoadingMedia(false);
    }
  };

  // Approve verification → call approve-credit edge function to create emprestimo + parcelas
  const handleApprove = async () => {
    if (!latestVerification || !analise || !user) return;
    setApprovingCredit(true);

    try {
      // 1. Aprovar verificação de identidade
      await new Promise<void>((resolve, reject) => {
        updateVerification.mutate(
          {
            id: latestVerification.id,
            updates: {
              status: 'approved',
              analyzed_by: user.id,
              analyzed_at: new Date().toISOString(),
            },
          },
          { onSuccess: () => resolve(), onError: reject }
        );
      });

      // Log
      createLog.mutate({
        verification_id: latestVerification.id,
        analise_id: analise.id,
        action: 'verification_approved',
        performed_by: user.id,
        details: { approved_by_name: user.email },
      });

      // 2. Chamar approve-credit para criar empréstimo + parcelas + PIX + WhatsApp
      // pix_key é lido automaticamente da tabela clientes pelo backend
      const { data, error } = await supabase.functions.invoke('approve-credit', {
        body: {
          analise_id: analise.id,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Erro na aprovação do crédito');

      // 3. Invalidar caches relevantes
      queryClient.invalidateQueries({ queryKey: ['analises-credito'] });
      queryClient.invalidateQueries({ queryKey: ['emprestimos'] });
      queryClient.invalidateQueries({ queryKey: ['parcelas'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['clientes'] });

      toast.success(`Crédito aprovado! Empréstimo criado com ${data.parcelas_geradas} parcela(s).`);
      onClose();
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setApprovingCredit(false);
    }
  };

  // Reject verification
  const handleReject = () => {
    if (!latestVerification || !analise || !user || !rejectionReason.trim()) return;

    const newRetryCount = latestVerification.retryCount + 1;
    const autoReject = newRetryCount >= 3;

    updateVerification.mutate(
      {
        id: latestVerification.id,
        updates: {
          status: autoReject ? 'rejected' : 'retry_needed',
          analyzed_by: user.id,
          analyzed_at: new Date().toISOString(),
          rejection_reason: rejectionReason,
          requires_retry: !autoReject,
          retry_count: newRetryCount,
        },
      },
      {
        onSuccess: () => {
          createLog.mutate({
            verification_id: latestVerification.id,
            analise_id: analise.id,
            action: autoReject ? 'verification_final_rejected' : 'verification_rejected',
            performed_by: user.id,
            details: {
              reason: rejectionReason,
              retry_count: newRetryCount,
              auto_reject: autoReject,
            },
          });

          if (autoReject) {
            updateAnalise.mutate(
              { id: analise.id, updates: { status: 'recusado', motivo: 'Verificação de identidade rejeitada 3 vezes.' } },
              {
                onSuccess: () => {
                  toast.error('Verificação rejeitada. Limite de tentativas atingido — análise recusada automaticamente.');
                  onClose();
                },
              }
            );
          } else {
            // Enviar novo link via WhatsApp automaticamente
            if (onSendMagicLink) {
              onSendMagicLink(analise.id);
            }
            toast.info(`Verificação rejeitada. Novo link enviado ao cliente (${newRetryCount}/3).`);
            setShowRejectForm(false);
            setRejectionReason('');
          }
        },
        onError: (err) => toast.error(`Erro: ${err.message}`),
      }
    );
  };

  // Request retry with new phrase
  const handleRetry = () => {
    if (!latestVerification || !analise || !user || !retryPhrase.trim()) return;

    updateVerification.mutate(
      {
        id: latestVerification.id,
        updates: {
          status: 'retry_needed',
          analyzed_by: user.id,
          analyzed_at: new Date().toISOString(),
          requires_retry: true,
          retry_phrase: retryPhrase,
          // Clear old media
          video_url: null,
          document_front_url: null,
          document_back_url: null,
          proof_of_address_url: null,
          residence_video_url: null,
        },
      },
      {
        onSuccess: () => {
          createLog.mutate({
            verification_id: latestVerification.id,
            analise_id: analise.id,
            action: 'retry_requested',
            performed_by: user.id,
            details: { new_phrase: retryPhrase },
          });
          // Enviar novo link via WhatsApp automaticamente
          if (onSendMagicLink) {
            onSendMagicLink(analise.id);
          }
          toast.info('Reenvio solicitado. Novo link sendo enviado via WhatsApp.');
          setShowRetryForm(false);
          setRetryPhrase('');
        },
        onError: (err) => toast.error(`Erro: ${err.message}`),
      }
    );
  };

  if (!analise) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="min-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {analise.clienteNome}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="dados" onValueChange={(v) => v === 'verificacao' && !videoSignedUrl && loadMedia()}>
          <TabsList className="w-full">
            <TabsTrigger value="dados" className="flex-1">Dados</TabsTrigger>
            <TabsTrigger value="verificacao" className="flex-1">
              Verificação
              {latestVerification && (
                <Badge className={`ml-2 text-[10px] ${STATUS_LABELS[latestVerification.status]?.className ?? ''}`}>
                  {STATUS_LABELS[latestVerification.status]?.label ?? latestVerification.status}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="historico" className="flex-1">Histórico</TabsTrigger>
          </TabsList>

          {/* Tab: Dados da Análise */}
          <TabsContent value="dados" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-sm text-muted-foreground">CPF</span>
                <p className="font-medium">{analise.cpf}</p>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Valor Solicitado</span>
                <p className="font-medium">{formatCurrency(analise.valorSolicitado)}</p>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Renda Mensal</span>
                <p className="font-medium">{formatCurrency(analise.rendaMensal)}</p>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Comprometimento</span>
                <p className="font-medium">
                  {((analise.valorSolicitado / 12) / analise.rendaMensal * 100).toFixed(1)}%
                </p>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Score Serasa</span>
                <p className={`font-bold text-lg ${analise.scoreSerasa >= 700 ? 'text-green-600' : analise.scoreSerasa >= 500 ? 'text-yellow-600' : 'text-red-600'}`}>
                  {analise.scoreSerasa}
                </p>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Score Interno</span>
                <p className={`font-bold text-lg ${analise.scoreInterno >= 700 ? 'text-green-600' : analise.scoreInterno >= 500 ? 'text-yellow-600' : 'text-red-600'}`}>
                  {analise.scoreInterno}
                </p>
              </div>
            </div>

            {analise.motivo && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                <p className="text-sm text-red-800 dark:text-red-400">
                  <strong>Motivo:</strong> {analise.motivo}
                </p>
              </div>
            )}

            {/* Send magic link button */}
            {(analise.status === 'pendente' || analise.status === 'em_analise') && onSendMagicLink && (
              (!latestVerification || latestVerification.status === 'retry_needed' || !latestVerification.videoUrl) && (
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => onSendMagicLink(analise.id)}
                >
                  <Send className="h-4 w-4 mr-2" />
                  {latestVerification?.status === 'retry_needed' ? 'Reenviar Link de Verificação' : 'Enviar Link de Verificação'}
                </Button>
              )
            )}

            {/* Quick actions */}
            {(analise.status === 'pendente' || analise.status === 'em_analise') && (
              <div className="flex gap-3 pt-2">
                <Button
                  className="flex-1 bg-green-600 hover:bg-green-700"
                  onClick={handleApprove}
                  disabled={approvingCredit || updateVerification.isPending || !canReview}
                >
                  {approvingCredit ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                  {approvingCredit ? 'Aprovando...' : 'Aprovar'}
                </Button>
                <Button
                  className="flex-1"
                  variant="destructive"
                  onClick={() => setShowRejectForm(true)}
                  disabled={updateVerification.isPending || !canReview}
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Rejeitar
                </Button>
              </div>
            )}

            {isSelfAnalysis && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Você não pode analisar a própria solicitação.
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>

          {/* Tab: Verificação de Identidade */}
          <TabsContent value="verificacao" className="space-y-4">
            {loadingVerifications ? (
              <div className="space-y-3">
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : !latestVerification ? (
              <div className="text-center py-8">
                <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">Nenhuma verificação de identidade solicitada.</p>
                {onSendMagicLink && (analise.status === 'pendente' || analise.status === 'em_analise') && (
                  <Button variant="outline" className="mt-4" onClick={() => onSendMagicLink(analise.id)}>
                    <Send className="h-4 w-4 mr-2" />
                    Enviar Link de Verificação
                  </Button>
                )}
              </div>
            ) : (
              <>
                {/* Verification info */}
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <Shield className="h-5 w-5 text-primary shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      Status:{' '}
                      <Badge className={STATUS_LABELS[latestVerification.status]?.className ?? ''}>
                        {STATUS_LABELS[latestVerification.status]?.label ?? latestVerification.status}
                      </Badge>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Frase: &ldquo;{latestVerification.retryPhrase ?? latestVerification.verificationPhrase}&rdquo;
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Tentativa {latestVerification.retryCount + 1}/3
                    </p>
                  </div>
                </div>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                  {/* Reenviar link quando status é retry_needed */}
                  {latestVerification.status === 'retry_needed' && onSendMagicLink && (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => onSendMagicLink(analise.id)}
                    >
                      <Send className="h-4 w-4 mr-2" />
                      Reenviar Link de Verificação via WhatsApp
                    </Button>
                  )}

                  {/* Video */}
                  {loadingMedia ? (
                    <Skeleton className="h-64 w-full rounded-lg" />
                  ) : videoSignedUrl ? (
                    <div>
                      <p className="text-sm font-medium mb-2 flex items-center gap-2">
                        <Video className="h-4 w-4" /> Vídeo de Verificação
                      </p>
                      <video
                        className="w-96 rounded-lg bg-black"
                        src={videoSignedUrl}
                        controls
                        playsInline
                      />
                    </div>
                  ) : latestVerification.videoUrl ? (
                    <Button variant="outline" onClick={loadMedia} disabled={loadingMedia}>
                      {loadingMedia ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Video className="h-4 w-4 mr-2" />}
                      Carregar Vídeo
                    </Button>
                  ) : (
                    <div className="text-center py-4 bg-muted/30 rounded-lg">
                      <Video className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Vídeo ainda não enviado</p>
                    </div>
                  )}

                  {/* Residence Video */}
                  {loadingMedia && latestVerification.residenceVideoUrl ? (
                    <Skeleton className="h-48 w-full rounded-lg" />
                  ) : residenceVideoUrl ? (
                    <div>
                      <p className="text-sm font-medium mb-2 flex items-center gap-2">
                        <Home className="h-4 w-4" /> Vídeo da Fachada
                      </p>
                      <video
                        className="w-96 rounded-lg bg-black"
                        src={residenceVideoUrl}
                        controls
                        playsInline
                      />
                    </div>
                  ) : latestVerification.residenceVideoUrl && !loadingMedia ? (
                    <Button variant="outline" onClick={loadMedia} disabled={loadingMedia}>
                      <Home className="h-4 w-4 mr-2" />
                      Carregar Vídeo da Fachada
                    </Button>
                  ) : null}

              </div>

                {/* Documents side by side */}
                {(docFrontUrl || docBackUrl) ? (
                  <div>
                    <p className="text-sm font-medium mb-2 flex items-center gap-2">
                      <FileImage className="h-4 w-4" /> Documentos
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {docFrontUrl && (
                        <div className="cursor-pointer group" onClick={() => setLightboxUrl(docFrontUrl)}>
                          <p className="text-xs text-muted-foreground mb-1">Frente</p>
                          <div className="relative">
                            <img src={docFrontUrl} alt="Frente do documento" className="rounded-lg border w-full h-48 object-contain bg-muted" />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg flex items-center justify-center">
                              <ZoomIn className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          </div>
                        </div>
                      )}
                      {docBackUrl && (
                        <div className="cursor-pointer group" onClick={() => setLightboxUrl(docBackUrl)}>
                          <p className="text-xs text-muted-foreground mb-1">Verso</p>
                          <div className="relative">
                            <img src={docBackUrl} alt="Verso do documento" className="rounded-lg border w-full h-48 object-contain bg-muted" />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg flex items-center justify-center">
                              <ZoomIn className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : latestVerification.documentFrontUrl && !loadingMedia ? (
                  <Button variant="outline" onClick={loadMedia} disabled={loadingMedia}>
                    <FileImage className="h-4 w-4 mr-2" />
                    Carregar Documentos
                  </Button>
                ) : null}

                {/* Proof of Address */}
                {proofOfAddressUrl ? (
                  <div>
                    <p className="text-sm font-medium mb-2 flex items-center gap-2">
                      <MapPin className="h-4 w-4" /> Comprovante de Endereço
                    </p>
                    <div className="cursor-pointer group" onClick={() => setLightboxUrl(proofOfAddressUrl)}>
                      <div className="relative">
                        <img src={proofOfAddressUrl} alt="Comprovante de endereço" className="rounded-lg border w-full h-48 object-contain bg-muted" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg flex items-center justify-center">
                          <ZoomIn className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : latestVerification.proofOfAddressUrl && !loadingMedia ? (
                  <Button variant="outline" onClick={loadMedia} disabled={loadingMedia}>
                    <MapPin className="h-4 w-4 mr-2" />
                    Carregar Comprovante
                  </Button>
                ) : null}

                {/* Client Address */}
                {latestVerification.clientAddress && (
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-sm font-medium flex items-center gap-2 mb-1">
                      <MapPin className="h-4 w-4" /> Endereço Informado
                    </p>
                    <p className="text-sm text-muted-foreground">{latestVerification.clientAddress}</p>
                  </div>
                )}

                {/* Profissão Informada vs Cadastro */}
                {latestVerification.profissaoInformada && (
                  <div className={`p-3 rounded-lg border ${hasProfissaoMismatch ? 'bg-red-50 dark:bg-red-950/20 border-red-300 dark:border-red-800' : 'bg-muted/50'}`}>
                    <p className="text-sm font-medium flex items-center gap-2 mb-2">
                      <Briefcase className="h-4 w-4" /> Profissão
                    </p>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">No cadastro:</span>
                        <p className="font-medium">{clienteData?.profissao || '(não informada)'}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Na verificação:</span>
                        <p className="font-medium">{latestVerification.profissaoInformada}</p>
                      </div>
                    </div>
                    {hasProfissaoMismatch && (
                      <Alert variant="destructive" className="mt-3">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          <strong>DIVERGÊNCIA DETECTADA:</strong> A profissão informada na verificação é diferente da cadastrada. A análise foi <strong>recusada automaticamente</strong>.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}

                {/* Reference Contacts */}
                {latestVerification.referenceContacts && latestVerification.referenceContacts.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2 flex items-center gap-2">
                      <Users className="h-4 w-4" /> Contatos de Referência
                    </p>
                    <div className="space-y-2">
                      {latestVerification.referenceContacts.map((contact: { name: string; phone: string; relationship: string }, idx: number) => (
                        <div key={idx} className="flex items-center justify-between p-3 rounded-lg border">
                          <div>
                            <p className="text-sm font-medium">{contact.name}</p>
                            <p className="text-xs text-muted-foreground">{contact.relationship} — {contact.phone}</p>
                          </div>
                          <a
                            href={`https://wa.me/55${contact.phone.replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-green-600 hover:bg-green-700 text-white text-xs font-medium transition-colors"
                          >
                            <Phone className="h-3 w-3" />
                            WhatsApp
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {latestVerification.rejectionReason && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Último motivo de rejeição:</strong> {latestVerification.rejectionReason}
                    </AlertDescription>
                  </Alert>
                )}

                {/* Action buttons */}
                {canReview && (
                  <div className="flex gap-2 pt-2">
                    <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={handleApprove} disabled={approvingCredit || updateVerification.isPending}>
                      {approvingCredit ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                      {approvingCredit ? 'Aprovando...' : 'Aprovar'}
                    </Button>
                    <Button className="flex-1" variant="destructive" onClick={() => { setShowRejectForm(true); setShowRetryForm(false); }} disabled={updateVerification.isPending}>
                      <XCircle className="h-4 w-4 mr-2" />
                      Rejeitar
                    </Button>
                    {latestVerification.retryCount < 2 && (
                      <Button className="flex-1" variant="outline" onClick={() => { setShowRetryForm(true); setShowRejectForm(false); }} disabled={updateVerification.isPending}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Solicitar Reenvio
                      </Button>
                    )}
                  </div>
                )}

                {/* Reject form */}
                {showRejectForm && (
                  <div className="p-4 border rounded-lg space-y-3">
                    <Label>Motivo da Rejeição *</Label>
                    <Textarea
                      placeholder="Descreva o motivo da rejeição..."
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      rows={3}
                    />
                    {latestVerification.retryCount >= 2 && (
                      <Alert>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          Esta é a 3ª rejeição. A análise será <strong>automaticamente recusada</strong>.
                        </AlertDescription>
                      </Alert>
                    )}
                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1" onClick={() => setShowRejectForm(false)}>Cancelar</Button>
                      <Button variant="destructive" className="flex-1" onClick={handleReject} disabled={!rejectionReason.trim() || updateVerification.isPending}>
                        Confirmar Rejeição
                      </Button>
                    </div>
                  </div>
                )}

                {/* Retry form */}
                {showRetryForm && (
                  <div className="p-4 border rounded-lg space-y-3">
                    <Label>Nova Frase de Verificação *</Label>
                    <Textarea
                      placeholder="Digite a nova frase que o cliente deve ler no vídeo..."
                      value={retryPhrase}
                      onChange={(e) => setRetryPhrase(e.target.value)}
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1" onClick={() => setShowRetryForm(false)}>Cancelar</Button>
                      <Button className="flex-1" onClick={handleRetry} disabled={!retryPhrase.trim() || updateVerification.isPending}>
                        Solicitar Reenvio
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* Tab: Histórico */}
          <TabsContent value="historico" className="space-y-3">
            {!logs || logs.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Nenhum registro de atividade.</p>
            ) : (
              <div className="space-y-2">
                {logs.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium">{formatLogAction(log.action)}</p>
                      {log.details && Object.keys(log.details).length > 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatLogDetails(log.details)}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(log.createdAt).toLocaleString('pt-BR')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Lightbox */}
        {lightboxUrl && (
          <div
            className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"
            onClick={() => setLightboxUrl(null)}
          >
            <button
              className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors"
              onClick={() => setLightboxUrl(null)}
            >
              <X className="h-6 w-6" />
            </button>
            <img
              src={lightboxUrl}
              alt="Documento ampliado"
              className="max-w-full max-h-[90vh] object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function formatLogAction(action: string): string {
  const map: Record<string, string> = {
    magic_link_sent: 'Link mágico enviado',
    media_uploaded: 'Vídeo e documentos enviados',
    verification_approved: 'Verificação aprovada',
    verification_rejected: 'Verificação rejeitada',
    verification_final_rejected: 'Verificação rejeitada (limite atingido)',
    retry_requested: 'Reenvio solicitado',
  };
  return map[action] ?? action;
}

function formatLogDetails(details: Record<string, unknown>): string {
  if (details.reason) return `Motivo: ${details.reason}`;
  if (details.new_phrase) return `Nova frase: "${details.new_phrase}"`;
  if (details.retry_count) return `Tentativa ${details.retry_count}/3`;
  return '';
}
