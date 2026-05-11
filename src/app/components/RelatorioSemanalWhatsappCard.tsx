/**
 * Card de envio do Relatório Semanal por WhatsApp.
 *
 * - CRUD de destinatários (`relatorio_semanal_destinatarios`)
 * - Disparo manual via edge function `cron-relatorio-semanal-whatsapp`
 * - Histórico dos últimos envios
 *
 * O texto enviado é a mensagem formatada produzida em `montarMensagemRelatorioSemanal`
 * (mesmos dados da aba Comissões + KPIs do período).
 */
import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { Plus, Trash2, Loader2, Send, Users, History, MessageSquareText } from 'lucide-react';

import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Badge } from './ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

import {
  useRelatorioDestinatarios,
  useUpsertRelatorioDestinatario,
  useDeleteRelatorioDestinatario,
  useEnviarRelatorioSemanal,
  useRelatorioEnvios,
} from '../hooks/useComissoesSemanais';
import { montarMensagemRelatorioSemanal, type DadosRelatorioSemanal } from '../lib/relatorio-semanal-mensagem';

interface Props {
  dados: DadosRelatorioSemanal;
  /**
   * Callback opcional para gerar o PDF executivo (mesmo do botão "Exportar Relatório PDF"),
   * fazer upload no Storage e retornar a URL pública. O WhatsApp recebe o texto e logo abaixo
   * o PDF como documento, na mesma conversa.
   */
  gerarPdfBase64?: () => Promise<{ url: string; filename: string } | null>;
}

export function RelatorioSemanalWhatsappCard({ dados, gerarPdfBase64 }: Props) {
  const { data: destinatarios = [], isLoading } = useRelatorioDestinatarios();
  const { data: envios = [] } = useRelatorioEnvios(5);
  const upsert = useUpsertRelatorioDestinatario();
  const remove = useDeleteRelatorioDestinatario();
  const enviar = useEnviarRelatorioSemanal();

  const [showAdd, setShowAdd] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [form, setForm] = useState({ nome: '', telefone: '', ativo: true });

  const mensagem = useMemo(() => montarMensagemRelatorioSemanal(dados), [dados]);
  const ativos = destinatarios.filter((d) => d.ativo);

  async function addDest() {
    if (!form.nome.trim() || !form.telefone.trim()) {
      toast.error('Nome e telefone são obrigatórios');
      return;
    }
    try {
      await upsert.mutateAsync({ ...form });
      toast.success('Destinatário adicionado');
      setForm({ nome: '', telefone: '', ativo: true });
      setShowAdd(false);
    } catch (err: any) {
      toast.error('Erro: ' + (err?.message || 'desconhecido'));
    }
  }

  async function removeDest(id: string, nome: string) {
    if (!confirm(`Remover "${nome}"?`)) return;
    try {
      await remove.mutateAsync(id);
      toast.success('Removido');
    } catch (err: any) {
      toast.error('Erro: ' + (err?.message || 'desconhecido'));
    }
  }

  async function dispararEnvio() {
    if (ativos.length === 0) {
      toast.error('Cadastre ao menos um destinatário ativo');
      return;
    }
    try {
      // Gera PDF (se a página forneceu callback) — mesmo PDF do botão "Exportar Relatório PDF"
      let pdfUrl: string | undefined;
      let pdfFilename: string | undefined;
      if (gerarPdfBase64) {
        try {
          const r = await gerarPdfBase64();
          if (r) {
            pdfUrl = r.url;
            pdfFilename = r.filename;
          }
        } catch (err: any) {
          toast.error('Falha ao gerar PDF: ' + (err?.message || 'desconhecido'));
          return;
        }
      }

      const r = await enviar.mutateAsync({
        periodoInicio: dados.periodoInicio,
        periodoFim: dados.periodoFim,
        mensagem,
        totalEntradas: dados.totalEntradas,
        totalSaidas: dados.totalSaidas,
        totalComissoes: dados.comissoes.reduce((s, c) => s + c.valorCalculado, 0),
        pdfUrl,
        pdfFilename,
      });
      toast.success(
        `Enviado para ${r.enviados} destinatário(s)${r.falhas > 0 ? ` (${r.falhas} falhas)` : ''}${pdfUrl ? ' — com PDF anexo' : ''}.`,
      );
    } catch (err: any) {
      toast.error('Erro: ' + (err?.message || 'desconhecido'));
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquareText className="h-4 w-4 text-emerald-600" />
              Relatório semanal · Financeiro {gerarPdfBase64 ? '(texto + PDF)' : '(texto)'}
              <Badge variant="outline" className="ml-1 text-[10px]">manual + cron dom 10h</Badge>
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              KPIs financeiros (entradas, saídas, comissões){gerarPdfBase64 ? ' + PDF executivo anexo' : ''}. Envio sob demanda pelo botão abaixo, ou automaticamente todo <strong>domingo às 10:00 BRT</strong> (cron envia somente o texto).
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowPreview(true)}>
              <MessageSquareText className="mr-2 h-4 w-4" />
              Pré-visualizar
            </Button>
            <Button size="sm" onClick={dispararEnvio} disabled={enviar.isPending || ativos.length === 0}>
              {enviar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Enviar agora ({ativos.length})
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Destinatários */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4" /> Destinatários
            </h4>
            <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}>
              <Plus className="mr-1 h-4 w-4" /> Adicionar
            </Button>
          </div>
          {isLoading ? (
            <p className="text-xs text-muted-foreground">Carregando...</p>
          ) : destinatarios.length === 0 ? (
            <p className="rounded border border-dashed p-3 text-xs text-muted-foreground">
              Nenhum destinatário cadastrado. Adicione números no formato 55DDDNNNNNNNNN (somente dígitos).
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {destinatarios.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.nome}</TableCell>
                    <TableCell className="font-mono text-xs">{d.telefone}</TableCell>
                    <TableCell>
                      {d.ativo ? <Badge variant="default">ativo</Badge> : <Badge variant="outline">inativo</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => removeDest(d.id, d.nome)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Histórico */}
        {envios.length > 0 && (
          <div>
            <h4 className="mb-2 text-sm font-semibold flex items-center gap-2">
              <History className="h-4 w-4" /> Últimos envios
            </h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead className="text-right">Total comissões</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {envios.map((e: any) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs">{format(new Date(e.created_at), 'dd/MM HH:mm', { locale: ptBR })}</TableCell>
                    <TableCell className="text-xs">
                      {format(new Date(e.periodo_inicio + 'T12:00'), 'dd/MM', { locale: ptBR })}–
                      {format(new Date(e.periodo_fim + 'T12:00'), 'dd/MM', { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      <Badge variant={e.origem === 'cron' ? 'default' : 'outline'}>{e.origem}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(e.total_comissoes ?? 0))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Dialog: adicionar destinatário */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo destinatário</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </div>
            <div>
              <Label>Telefone (somente dígitos, com DDI)</Label>
              <Input
                value={form.telefone}
                onChange={(e) => setForm({ ...form, telefone: e.target.value.replace(/\D/g, '') })}
                placeholder="5511999998888"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
              <Label>Ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancelar</Button>
            <Button onClick={addDest} disabled={upsert.isPending}>
              {upsert.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: pré-visualização da mensagem */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Pré-visualização — Mensagem WhatsApp</DialogTitle>
          </DialogHeader>
          <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded bg-muted p-3 font-mono text-xs">
            {mensagem}
          </pre>
          <DialogFooter>
            <Button onClick={() => setShowPreview(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
