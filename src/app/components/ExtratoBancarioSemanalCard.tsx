/**
 * Card de Extrato Bancário Semanal — gestão da feature CNAB 240 da EFI.
 *
 * Permite:
 *  - Ativar/desativar o cron semanal (segundas 10h BRT)
 *  - Selecionar a instância WhatsApp para envio
 *  - CRUD de destinatários (números que recebem o extrato + PDF)
 *  - Disparar execução manual ("Gerar e enviar agora")
 *  - Visualizar histórico de execuções com download do CNAB e PDF
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  FileText,
  Loader2,
  Plus,
  Power,
  Send,
  Trash2,
  Users,
  Download,
  FileDown,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Calendar,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';

import {
  useExtratosSemanais,
  useDestinatariosExtrato,
  useUpsertDestinatario,
  useDeleteDestinatario,
  useExtratoSemanalConfig,
  useUpdateExtratoSemanalConfig,
  useRunExtratoSemanal,
} from '../hooks/useExtratoSemanal';
import { getInstancias } from '../services/whatsappService';
import {
  getSignedUrl,
  ExtratoDestinatario,
  listEfiExtratoAgendamentos,
  createEfiExtratoAgendamento,
} from '../services/extratoSemanalService';

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  pendente: { label: 'Pendente', className: 'bg-zinc-500/10 text-zinc-700 dark:text-zinc-300' },
  baixado: { label: 'Baixado', className: 'bg-blue-500/10 text-blue-700 dark:text-blue-300' },
  processado: { label: 'Processado', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  enviado: { label: 'Enviado', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  falhou: { label: 'Falhou', className: 'bg-red-500/10 text-red-700 dark:text-red-300' },
};

function formatPhoneBr(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('55')) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  return raw;
}

export function ExtratoBancarioSemanalCard() {
  // ── Hooks de dados ───────────────────────────────────────────
  const { data: config } = useExtratoSemanalConfig();
  const { data: destinatarios = [], isLoading: loadingDest } = useDestinatariosExtrato();
  const { data: historico = [], isLoading: loadingHist } = useExtratosSemanais(20);
  const updateConfig = useUpdateExtratoSemanalConfig();
  const upsertDest = useUpsertDestinatario();
  const deleteDest = useDeleteDestinatario();
  const runExtrato = useRunExtratoSemanal();

  const { data: instancias = [] } = useQuery({
    queryKey: ['whatsapp_instancias_list'],
    queryFn: () => getInstancias(),
    staleTime: 60_000,
  });
  const instanciasConectadas = useMemo(
    () => instancias.filter((i) => i.status === 'open' || i.status === 'connected'),
    [instancias],
  );

  // ── Estado local: dialog destinatário ────────────────────────
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<ExtratoDestinatario | null>(null);
  const [formNome, setFormNome] = useState('');
  const [formTelefone, setFormTelefone] = useState('');
  const [formObs, setFormObs] = useState('');

  function openNew() {
    setEditing(null);
    setFormNome('');
    setFormTelefone('');
    setFormObs('');
    setShowDialog(true);
  }
  function openEdit(d: ExtratoDestinatario) {
    setEditing(d);
    setFormNome(d.nome);
    setFormTelefone(d.telefone);
    setFormObs(d.observacao ?? '');
    setShowDialog(true);
  }

  async function handleSaveDest() {
    if (!formNome.trim() || !formTelefone.replace(/\D/g, '')) {
      toast.error('Nome e telefone são obrigatórios.');
      return;
    }
    try {
      await upsertDest.mutateAsync({
        id: editing?.id,
        nome: formNome.trim(),
        telefone: formTelefone,
        observacao: formObs,
      });
      toast.success(editing ? 'Destinatário atualizado.' : 'Destinatário adicionado.');
      setShowDialog(false);
    } catch (err: any) {
      toast.error(err?.message ?? 'Erro ao salvar destinatário.');
    }
  }

  async function handleDeleteDest(d: ExtratoDestinatario) {
    if (!confirm(`Remover ${d.nome} (${formatPhoneBr(d.telefone)})?`)) return;
    try {
      await deleteDest.mutateAsync(d.id);
      toast.success('Destinatário removido.');
    } catch (err: any) {
      toast.error(err?.message ?? 'Erro ao remover destinatário.');
    }
  }

  async function handleToggleAtivo(d: ExtratoDestinatario) {
    try {
      await upsertDest.mutateAsync({
        id: d.id,
        nome: d.nome,
        telefone: d.telefone,
        ativo: !d.ativo,
        observacao: d.observacao,
      });
    } catch (err: any) {
      toast.error(err?.message ?? 'Erro ao atualizar destinatário.');
    }
  }

  async function handleToggleFeature(ativo: boolean) {
    if (ativo && !config?.instanciaWhatsappId) {
      toast.error('Selecione a instância WhatsApp antes de ativar.');
      return;
    }
    try {
      await updateConfig.mutateAsync({ ativo });
      toast.success(ativo ? 'Envio semanal ativado.' : 'Envio semanal desativado.');
    } catch (err: any) {
      toast.error(err?.message ?? 'Erro ao atualizar configuração.');
    }
  }

  async function handleSelectInstancia(id: string) {
    try {
      await updateConfig.mutateAsync({ instanciaWhatsappId: id });
      toast.success('Instância salva.');
    } catch (err: any) {
      toast.error(err?.message ?? 'Erro ao salvar instância.');
    }
  }

  async function handleRunNow() {
    if (destinatarios.filter((d) => d.ativo).length === 0) {
      toast.error('Adicione e ative ao menos um destinatário antes de gerar.');
      return;
    }
    if (!config?.instanciaWhatsappId) {
      toast.error('Selecione a instância WhatsApp para envio.');
      return;
    }
    if (
      !confirm(
        'Confirma a geração e envio do extrato agora?\n\n' +
          'A EFI cobra R$ 6,00 por arquivo CNAB 240 baixado. ' +
          'Se já houver execução para o período, ela será reaproveitada (sem novo custo).',
      )
    )
      return;
    try {
      const result = await runExtrato.mutateAsync({});
      if (result.skipped) {
        toast.info(`Execução pulada: ${result.reason ?? 'sem novidades'}`);
        return;
      }
      toast.success(
        `Extrato processado — ${result.movimentacoes_importadas ?? 0} lançamento(s), ` +
          `${result.enviados ?? 0} envio(s) WhatsApp.`,
      );
    } catch (err: any) {
      toast.error(err?.message ?? 'Falha ao gerar extrato.');
    }
  }

  async function handleDownloadFile(path: string | null, fallbackName: string) {
    if (!path) return;
    try {
      const url = await getSignedUrl(path);
      const a = document.createElement('a');
      a.href = url;
      a.download = path.split('/').pop() ?? fallbackName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err: any) {
      toast.error(err?.message ?? 'Erro ao baixar arquivo.');
    }
  }

  // Status feature
  const featureAtiva = config?.ativo === true;
  const algumDestAtivo = destinatarios.some((d) => d.ativo);

  // ── Estado: painel Agendamentos EFI ─────────────────────────
  const [showAgendamentos, setShowAgendamentos] = useState(false);
  const [agendamentos, setAgendamentos] = useState<unknown>(null);
  const [loadingAgendamentos, setLoadingAgendamentos] = useState(false);
  const [showCriarAgendamento, setShowCriarAgendamento] = useState(false);
  const [agendamentoJson, setAgendamentoJson] = useState(
    JSON.stringify(
      {
        periodicidade: 'semanal',
        dia_semana: 5,
        horario: '22:00',
      },
      null,
      2,
    ),
  );
  const [salvandoAgendamento, setSalvandoAgendamento] = useState(false);

  async function handleVerificarAgendamentos() {
    setLoadingAgendamentos(true);
    setShowAgendamentos(true);
    try {
      const result = await listEfiExtratoAgendamentos();
      setAgendamentos(result);
    } catch (err: any) {
      toast.error(err?.message ?? 'Erro ao buscar agendamentos EFI.');
      setAgendamentos({ error: err?.message });
    } finally {
      setLoadingAgendamentos(false);
    }
  }

  async function handleCriarAgendamento() {
    setSalvandoAgendamento(true);
    try {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(agendamentoJson);
      } catch {
        toast.error('JSON inválido — verifique a sintaxe.');
        return;
      }
      const result = await createEfiExtratoAgendamento(parsed);
      toast.success('Agendamento criado na EFI.');
      setShowCriarAgendamento(false);
      setAgendamentos(result);
      setShowAgendamentos(true);
    } catch (err: any) {
      toast.error(err?.message ?? 'Erro ao criar agendamento.');
    } finally {
      setSalvandoAgendamento(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            CNAB bancário (extrato oficial EFI)
            <Badge variant="outline" className="ml-1 text-[10px]">cron seg 10h</Badge>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Arquivo CNAB 240 oficial gerado pela EFI toda segunda às 10:00 BRT e enviado via WhatsApp.
            Complementar ao relatório semanal acima.
            <strong className="ml-1">A EFI cobra R$ 6,00 por arquivo gerado.</strong>
          </p>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* ── Configuração geral ─────────────────────── */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-sm flex items-center gap-2">
                <Power className="h-4 w-4" />
                Envio automático semanal
              </Label>
              <div className="flex items-center gap-3 p-3 border rounded-lg">
                <Switch
                  checked={featureAtiva}
                  onCheckedChange={handleToggleFeature}
                  disabled={updateConfig.isPending}
                />
                <span className="text-sm">
                  {featureAtiva ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                      Ativo — segundas 10:00 BRT
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Desativado</span>
                  )}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Instância WhatsApp para envio</Label>
              <Select
                value={config?.instanciaWhatsappId ?? ''}
                onValueChange={handleSelectInstancia}
                disabled={updateConfig.isPending}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a instância..." />
                </SelectTrigger>
                <SelectContent>
                  {instancias.length === 0 && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      Nenhuma instância cadastrada
                    </div>
                  )}
                  {instancias.map((inst) => (
                    <SelectItem key={inst.id} value={inst.id}>
                      <div className="flex items-center gap-2">
                        <span>{inst.instance_name}</span>
                        {(inst.status === 'open' || inst.status === 'connected') && (
                          <Badge variant="outline" className="text-[10px]">
                            conectada
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {instanciasConectadas.length === 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Nenhuma instância conectada — verifique em WhatsApp/Conexões.
                </p>
              )}
            </div>
          </div>

          {/* ── Pré-requisitos ─────────────────────────── */}
          <div className="rounded-lg border border-dashed p-3 space-y-1 text-xs">
            <p className="font-medium text-sm mb-2">Pré-requisitos:</p>
            <p className="flex items-center gap-2">
              {config?.instanciaWhatsappId ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
              )}
              Instância WhatsApp selecionada
            </p>
            <p className="flex items-center gap-2">
              {algumDestAtivo ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
              )}
              Pelo menos um destinatário ativo
            </p>
            <p className="flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 text-blue-500" />
              Recorrência semanal configurada no painel da EFI (
              <a
                href="https://app.sejaefi.com.br/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                app.sejaefi.com.br
              </a>{' '}
              → API → Extratos)
            </p>
          </div>

          {/* ── Agendamentos EFI ───────────────────────── */}
          <div className="border rounded-lg overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/40 transition-colors"
              onClick={() => {
                if (!showAgendamentos) handleVerificarAgendamentos();
                else setShowAgendamentos(false);
              }}
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                <Calendar className="h-4 w-4" />
                Agendamentos de geração EFI
                <Badge variant="outline" className="text-[10px]">
                  pré-requisito
                </Badge>
              </div>
              {showAgendamentos ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>

            {showAgendamentos && (
              <div className="px-4 pb-4 pt-1 space-y-3 border-t">
                <p className="text-xs text-muted-foreground">
                  A EFI só gera arquivos CNAB quando há um agendamento ativo. Se a lista estiver
                  vazia, crie um agendamento semanal para que os arquivos fiquem disponíveis toda
                  semana.
                </p>

                {loadingAgendamentos ? (
                  <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Buscando agendamentos...
                  </div>
                ) : (
                  <pre className="text-[11px] bg-muted rounded p-3 max-h-40 overflow-auto whitespace-pre-wrap break-all">
                    {JSON.stringify(agendamentos, null, 2)}
                  </pre>
                )}

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleVerificarAgendamentos}
                    disabled={loadingAgendamentos}
                  >
                    {loadingAgendamentos ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Atualizar
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setShowCriarAgendamento(true)}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Criar agendamento semanal
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* ── Destinatários ──────────────────────────── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                <h3 className="font-medium text-sm">Destinatários WhatsApp</h3>
                <Badge variant="secondary">{destinatarios.length}</Badge>
              </div>
              <Button size="sm" variant="outline" onClick={openNew}>
                <Plus className="h-4 w-4 mr-1" />
                Adicionar
              </Button>
            </div>

            {loadingDest ? (
              <div className="py-6 flex justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : destinatarios.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground border border-dashed rounded-lg">
                Nenhum destinatário cadastrado.
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]">Ativo</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Observação</TableHead>
                      <TableHead className="w-[100px] text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {destinatarios.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell>
                          <Switch
                            checked={d.ativo}
                            onCheckedChange={() => handleToggleAtivo(d)}
                            disabled={upsertDest.isPending}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{d.nome}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {formatPhoneBr(d.telefone)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {d.observacao ?? '—'}
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEdit(d)}
                            className="h-7 px-2"
                          >
                            Editar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteDest(d)}
                            className="h-7 px-2 text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* ── Disparo manual ─────────────────────────── */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/40">
            <div className="space-y-1">
              <p className="text-sm font-medium">Gerar e enviar agora</p>
              <p className="text-xs text-muted-foreground">
                Baixa o último arquivo CNAB disponível, gera PDF e envia para todos os destinatários
                ativos. Não cobra novamente se o período já foi processado.
              </p>
            </div>
            <Button onClick={handleRunNow} disabled={runExtrato.isPending}>
              {runExtrato.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Executar agora
            </Button>
          </div>

          {/* ── Histórico ──────────────────────────────── */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              <h3 className="font-medium text-sm">Histórico de execuções</h3>
            </div>

            {loadingHist ? (
              <div className="py-6 flex justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : historico.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground border border-dashed rounded-lg">
                Nenhuma execução registrada ainda.
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Período</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Lanç.</TableHead>
                      <TableHead className="text-right">Enviados</TableHead>
                      <TableHead>Origem</TableHead>
                      <TableHead className="text-right">Arquivos</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historico.map((h) => {
                      const status = STATUS_LABEL[h.status] ?? STATUS_LABEL.pendente;
                      return (
                        <TableRow key={h.id}>
                          <TableCell className="text-xs">
                            {format(new Date(h.periodoInicio + 'T00:00:00'), 'dd/MM', { locale: ptBR })}
                            {' — '}
                            {format(new Date(h.periodoFim + 'T00:00:00'), 'dd/MM/yyyy', {
                              locale: ptBR,
                            })}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={status.className}>
                              {status.label}
                            </Badge>
                            {h.erroMsg && (
                              <p className="text-[10px] text-red-600 mt-1 max-w-[200px] truncate">
                                {h.erroMsg}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            {h.movimentacoesImportadas}
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            {h.destinatariosEnviados}
                            {h.destinatariosFalharam > 0 && (
                              <span className="text-red-600 ml-1">
                                ({h.destinatariosFalharam} falhou)
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">
                              {h.triggerType === 'cron' ? 'Automático' : 'Manual'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right space-x-1">
                            {h.cnabPath && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2"
                                title="Baixar CNAB"
                                onClick={() => handleDownloadFile(h.cnabPath, 'extrato.txt')}
                              >
                                <Download className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {h.pdfPath && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2"
                                title="Baixar PDF"
                                onClick={() => handleDownloadFile(h.pdfPath, 'extrato.pdf')}
                              >
                                <FileDown className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Dialog: Criar agendamento EFI ──────────────── */}
      <Dialog open={showCriarAgendamento} onOpenChange={setShowCriarAgendamento}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Criar agendamento de extrato na EFI
            </DialogTitle>
            <DialogDescription>
              Edite o JSON abaixo com os campos aceitos pela EFI para agendar a geração semanal do
              CNAB 240. Os nomes dos campos podem variar — consulte o suporte EFI se necessário.
              O valor padrão usa sexta-feira às 22:00.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <textarea
              className="w-full h-48 rounded-md border bg-muted/30 p-3 font-mono text-xs resize-y focus:outline-none focus:ring-2 focus:ring-ring"
              value={agendamentoJson}
              onChange={(e) => setAgendamentoJson(e.target.value)}
              spellCheck={false}
            ></textarea>
            <p className="text-[11px] text-muted-foreground">
              Campos comuns: <code>periodicidade</code> (semanal/diario),{' '}
              <code>dia_semana</code> (1=seg … 7=dom), <code>horario</code> (HH:mm). Se a EFI
              retornar erro 422 com detalhes, ajuste os campos conforme indicado.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCriarAgendamento(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCriarAgendamento} disabled={salvandoAgendamento}>
              {salvandoAgendamento && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar agendamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Adicionar/Editar destinatário ──────── */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Editar destinatário' : 'Novo destinatário do extrato'}
            </DialogTitle>
            <DialogDescription>
              O número receberá o extrato bancário em PDF e o arquivo CNAB toda semana.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="dest-nome">Nome</Label>
              <Input
                id="dest-nome"
                value={formNome}
                onChange={(e) => setFormNome(e.target.value)}
                placeholder="Ex: Diretor Financeiro"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dest-tel">Telefone (com DDD)</Label>
              <Input
                id="dest-tel"
                value={formTelefone}
                onChange={(e) => setFormTelefone(e.target.value)}
                placeholder="(11) 98888-7777"
              />
              <p className="text-[11px] text-muted-foreground">
                DDI 55 é adicionado automaticamente quando ausente.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dest-obs">Observação (opcional)</Label>
              <Input
                id="dest-obs"
                value={formObs}
                onChange={(e) => setFormObs(e.target.value)}
                placeholder="Ex: Recebe relatórios contábeis"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveDest} disabled={upsertDest.isPending}>
              {upsertDest.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editing ? 'Salvar' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
