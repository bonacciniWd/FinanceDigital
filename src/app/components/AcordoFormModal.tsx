/**
 * @module AcordoFormModal
 * @description Modal completo para configuração de acordo, com as MESMAS opções
 * disponíveis na criação de empréstimo (datas, valores, periodicidade,
 * valores individuais, dia útil, datas personalizadas).
 *
 * Usado em:
 * - KanbanCobrancaPage (negociação → "Configurar acordo")
 * - ClienteDetalhesModal (cobrança → "Criar acordo")
 * - EmprestimosAtivosPage (refinanciamento)
 *
 * Comportamento:
 * - Cria acordo formal via `useCriarAcordo`
 * - Congela parcelas originais (parcelas_originais_ids)
 * - Cria parcelas do acordo já com `acordo_id` vinculado
 * - Callback `onCriado(acordoId)` para o caller disparar fluxos extras
 *   (ex: enviar Pix da entrada via WhatsApp).
 */
import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Checkbox } from './ui/checkbox';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Calendar } from './ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { ptBR } from 'date-fns/locale/pt-BR';
import { HandshakeIcon, Loader2, Banknote, CalendarDays, X } from 'lucide-react';
import { toast } from 'sonner';

import { useCriarAcordo } from '../hooks/useAcordos';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useConfigSistema } from '../hooks/useConfigSistema';
import { useCriarCobvEfi } from '../hooks/useWoovi';
import { useEnviarWhatsapp, useInstancias } from '../hooks/useWhatsapp';

type Periodicidade = 'diario' | 'semanal' | 'quinzenal' | 'mensal' | 'personalizado';

interface Props {
  open: boolean;
  onClose: () => void;

  /** Cliente para quem o acordo é criado. */
  clienteId: string;
  clienteNome?: string;

  /** Valor da dívida atual sugerido (será editável no campo "Valor acordado"). */
  valorDividaSugerido: number;

  /**
   * IDs das parcelas originais que serão CONGELADAS ao criar o acordo.
   * Se não passado, o modal busca automaticamente parcelas pendentes/vencidas
   * do cliente (status pendente|vencida, congelada=false).
   */
  parcelasOriginaisIds?: string[];

  /**
   * ID do empréstimo "âncora" para registrar as parcelas do acordo.
   * Se não passado, o modal busca automaticamente o empréstimo da primeira
   * parcela vencida do cliente.
   */
  emprestimoId?: string;

  /** Card do kanban (opcional) — vincula o acordo via kanban_card_id. */
  kanbanCardId?: string | null;

  /** Origem do acordo (default 'manual'). Ex: 'kanban', 'modal-cliente', 'refinanciamento'. */
  origem?: string;

  /** Disparado após criação bem-sucedida com o ID do acordo e payload de resumo. */
  onCriado?: (info: { acordoId: string; valorEntrada: number; valorRestante: number; numParcelas: number; valorParcela: number }) => void;
}

/* ── Helpers ───────────────────────────────────────────────── */

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const formatBRL = (v: string) => {
  const num = v.replace(/\D/g, '');
  if (!num) return '';
  const cents = parseInt(num);
  return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const parseBRL = (v: string) => {
  const num = (v || '').replace(/\./g, '').replace(',', '.');
  return parseFloat(num) || 0;
};

const toIsoDate = (d: Date) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

/** Avança um Date para o próximo dia útil (segunda-sexta) caso caia em fim de semana. */
const proximoDiaUtil = (d: Date): Date => {
  const out = new Date(d);
  while (out.getDay() === 0 || out.getDay() === 6) {
    out.setDate(out.getDate() + 1);
  }
  return out;
};

/**
 * Gera as datas de vencimento das parcelas do acordo conforme periodicidade.
 * Regras espelham o gerador de empréstimos (AnaliseCreditoPage / approve-credit).
 */
function gerarDatasAcordo(params: {
  numParcelas: number;
  periodicidade: Periodicidade;
  diaPagamento?: number;
  intervaloDias?: number;
  datasPersonalizadas?: Date[];
  diaUtil: boolean;
  inicio: Date;
}): string[] {
  const { numParcelas, periodicidade, diaPagamento, intervaloDias, datasPersonalizadas, diaUtil, inicio } = params;
  const out: Date[] = [];

  if (periodicidade === 'personalizado' && datasPersonalizadas && datasPersonalizadas.length > 0) {
    // Datas explicitas — pegar primeiras N ordenadas
    const sorted = [...datasPersonalizadas].sort((a, b) => a.getTime() - b.getTime()).slice(0, numParcelas);
    sorted.forEach((d) => out.push(new Date(d)));
  } else if (periodicidade === 'personalizado' && intervaloDias && intervaloDias > 0) {
    const base = new Date(inicio);
    base.setDate(base.getDate() + intervaloDias);
    for (let i = 0; i < numParcelas; i++) {
      out.push(new Date(base.getFullYear(), base.getMonth(), base.getDate() + i * intervaloDias));
    }
  } else if (periodicidade === 'diario') {
    const base = new Date(inicio);
    base.setDate(base.getDate() + 1);
    for (let i = 0; i < numParcelas; i++) {
      out.push(new Date(base.getFullYear(), base.getMonth(), base.getDate() + i));
    }
  } else if (periodicidade === 'semanal') {
    // diaPagamento = 0..6 (0=domingo). Encontrar próxima ocorrência.
    const base = new Date(inicio);
    const targetDow = ((diaPagamento ?? base.getDay()) % 7 + 7) % 7;
    const diff = (targetDow - base.getDay() + 7) % 7 || 7;
    base.setDate(base.getDate() + diff);
    for (let i = 0; i < numParcelas; i++) {
      out.push(new Date(base.getFullYear(), base.getMonth(), base.getDate() + i * 7));
    }
  } else if (periodicidade === 'quinzenal') {
    const dia = Math.min(diaPagamento ?? 15, 28);
    const base = new Date(inicio);
    base.setDate(dia);
    if (base <= inicio) base.setDate(base.getDate() + 15);
    for (let i = 0; i < numParcelas; i++) {
      out.push(new Date(base.getFullYear(), base.getMonth(), base.getDate() + i * 15));
    }
  } else {
    // Mensal (default)
    const dia = Math.min(diaPagamento ?? (inicio.getDate() || 10), 28);
    let mes = inicio.getMonth() + 1;
    let ano = inicio.getFullYear();
    for (let i = 0; i < numParcelas; i++) {
      let m = mes + i;
      let y = ano;
      while (m > 11) { m -= 12; y++; }
      out.push(new Date(y, m, dia));
    }
  }

  return out.map((d) => (diaUtil ? proximoDiaUtil(d) : d)).map(toIsoDate);
}

/* ── Component ─────────────────────────────────────────────── */

export default function AcordoFormModal({
  open,
  onClose,
  clienteId,
  clienteNome,
  valorDividaSugerido,
  parcelasOriginaisIds,
  emprestimoId,
  kanbanCardId,
  origem = 'manual',
  onCriado,
}: Props) {
  const { user } = useAuth();
  const criarAcordo = useCriarAcordo();
  const criarCobvEfi = useCriarCobvEfi();
  const enviarWhatsapp = useEnviarWhatsapp();
  const { data: instancias = [] } = useInstancias();
  const { data: configSistema } = useConfigSistema();

  // ── Form state ──────────────────────────────────────────
  const [valorAcordado, setValorAcordado] = useState('');
  const [entradaModo, setEntradaModo] = useState<'pct' | 'valor'>('pct');
  const [entradaPct, setEntradaPct] = useState('30');
  const [entradaValor, setEntradaValor] = useState('0');
  const [numParcelas, setNumParcelas] = useState('3');
  const [periodicidade, setPeriodicidade] = useState<Periodicidade>('mensal');
  const [diaPagamento, setDiaPagamento] = useState('10');
  const [intervaloDias, setIntervaloDias] = useState('');
  const [datasPersonalizadas, setDatasPersonalizadas] = useState<Date[]>([]);
  const [diaUtil, setDiaUtil] = useState(false);
  const [valoresParcelas, setValoresParcelas] = useState<string[]>([]);
  const [observacao, setObservacao] = useState('');
  const [gerarPixEntrada, setGerarPixEntrada] = useState(true);

  // Reset ao abrir
  useEffect(() => {
    if (!open) return;
    setValorAcordado(valorDividaSugerido > 0
      ? valorDividaSugerido.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : '');
    setEntradaModo('pct');
    setEntradaPct(String(configSistema?.acordo_entrada_percentual ?? 30));
    setEntradaValor('0');
    setNumParcelas('3');
    setPeriodicidade('mensal');
    setDiaPagamento('10');
    setIntervaloDias('');
    setDatasPersonalizadas([]);
    setDiaUtil(false);
    setValoresParcelas([]);
    setObservacao('');
    setGerarPixEntrada(true);
  }, [open, valorDividaSugerido, configSistema?.acordo_entrada_percentual]);

  // ── Cálculos derivados ──────────────────────────────────
  const valor = parseBRL(valorAcordado);
  const nP = Math.max(1, parseInt(numParcelas) || 1);

  const valorEntrada = useMemo(() => {
    if (entradaModo === 'valor') {
      return Math.min(valor, Math.max(0, Math.round((parseFloat(entradaValor) || 0) * 100) / 100));
    }
    const pct = Math.max(0, Math.min(100, parseFloat(entradaPct) || 0));
    return Math.round(valor * (pct / 100) * 100) / 100;
  }, [entradaModo, entradaPct, entradaValor, valor]);

  const valorRestante = Math.max(0, Math.round((valor - valorEntrada) * 100) / 100);

  const valoresIndividuais = useMemo(() => {
    const baseParc = nP > 0 ? Math.round((valorRestante / nP) * 100) / 100 : 0;
    if (valoresParcelas.length === 0) {
      return Array.from({ length: nP }, () => baseParc);
    }
    return Array.from({ length: nP }, (_, i) => parseBRL(valoresParcelas[i] ?? '') || baseParc);
  }, [valoresParcelas, nP, valorRestante]);

  const valorParcelaPadrao = nP > 0 ? Math.round((valorRestante / nP) * 100) / 100 : 0;

  const datasGeradas = useMemo(() => {
    return gerarDatasAcordo({
      numParcelas: nP,
      periodicidade,
      diaPagamento: diaPagamento ? parseInt(diaPagamento) : undefined,
      intervaloDias: intervaloDias ? parseInt(intervaloDias) : undefined,
      datasPersonalizadas,
      diaUtil,
      inicio: new Date(),
    });
  }, [nP, periodicidade, diaPagamento, intervaloDias, datasPersonalizadas, diaUtil]);

  // ── Submit ──────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (valor <= 0) { toast.error('Informe o valor acordado'); return; }
    if (valorRestante < 0) { toast.error('Entrada não pode ser maior que o valor acordado'); return; }
    if (datasGeradas.length !== nP) { toast.error('Não foi possível gerar as datas — revise periodicidade'); return; }

    setSubmitting(true);
    try {
      // 1. Resolver parcelas originais e empréstimo âncora
      let resolvedParcelasIds = parcelasOriginaisIds ?? [];
      let resolvedEmpId = emprestimoId ?? '';

      if (resolvedParcelasIds.length === 0 || !resolvedEmpId) {
        const { data, error } = await supabase
          .from('parcelas')
          .select('id, emprestimo_id')
          .eq('cliente_id', clienteId)
          .in('status', ['pendente', 'vencida'])
          .eq('congelada', false);
        if (error) throw new Error(error.message);
        const rows = (data ?? []) as Array<{ id: string; emprestimo_id: string }>;
        if (resolvedParcelasIds.length === 0) {
          resolvedParcelasIds = rows.map((r) => r.id);
        }
        if (!resolvedEmpId) {
          resolvedEmpId = rows[0]?.emprestimo_id ?? '';
        }
      }

      if (!resolvedEmpId) {
        toast.error('Não há empréstimo ativo para vincular o acordo');
        return;
      }

      // 2. Montar parcelas do acordo
      const parcelasAcordo = datasGeradas.map((dataIso, i) => ({
        emprestimo_id: resolvedEmpId,
        cliente_id: clienteId,
        numero: i + 1,
        valor: valoresIndividuais[i] ?? valorParcelaPadrao,
        valor_original: valoresIndividuais[i] ?? valorParcelaPadrao,
        data_vencimento: dataIso,
      }));

      const obs = (observacao.trim() || `Acordo ${origem}: ${formatCurrency(valor)} · Entrada ${formatCurrency(valorEntrada)} (${entradaModo === 'pct' ? `${entradaPct}%` : 'R$ fixo'}) · ${nP}x${periodicidade === 'mensal' ? '' : ` (${periodicidade})`} · por ${user?.name || 'Sistema'}`);

      const result = await criarAcordo.mutateAsync({
        acordo: {
          cliente_id: clienteId,
          kanban_card_id: kanbanCardId ?? null,
          criado_por: user?.id ?? null,
          origem,
          valor_divida_original: valor,
          valor_entrada: valorEntrada,
          entrada_percentual: entradaModo === 'pct' ? Number(entradaPct) || 0 : Math.round((valorEntrada / valor) * 10000) / 100,
          valor_restante: valorRestante,
          num_parcelas: nP,
          valor_parcela: valorParcelaPadrao,
          dia_pagamento: parseInt(diaPagamento) || new Date(datasGeradas[0]).getDate() || 10,
          data_primeira_parcela: datasGeradas[0] ?? null,
          parcelas_originais_ids: resolvedParcelasIds,
          observacao: obs,
        },
        parcelasAcordo,
      });

      const acordoId = (result as any)?.id as string | undefined;
      toast.success(`Acordo criado: ${formatCurrency(valor)} em ${nP}x`);

      // 3. Gerar Pix da entrada via EFI + enviar WhatsApp (opcional)
      if (gerarPixEntrada && acordoId && valorEntrada > 0) {
        try {
          // Buscar dados do cliente (telefone + cpf + nome)
          const { data: cli } = await supabase
            .from('clientes')
            .select('nome, telefone, cpf')
            .eq('id', clienteId)
            .maybeSingle<{ nome: string; telefone: string | null; cpf: string | null }>();
          const nome = cli?.nome || clienteNome || 'Cliente';
          const cpf = cli?.cpf || undefined;
          const telefone = cli?.telefone || '';
          // Vencimento: amanhã (entrada deve ser paga rápido)
          const venc = new Date();
          venc.setDate(venc.getDate() + 1);
          const vencIso = toIsoDate(venc);
          const cobv = await criarCobvEfi.mutateAsync({
            cliente_id: clienteId,
            valor: valorEntrada,
            descricao: `Entrada acordo - ${nome}`.substring(0, 140),
            cliente_nome: nome,
            cliente_cpf: cpf,
            data_vencimento: vencIso,
          });
          const charge = (cobv as any)?.charge;
          const chargeRowId = charge?.id as string | undefined;
          const brCode = (charge?.br_code as string | undefined) || '';
          const qrImage = (charge?.qr_code_image as string | undefined) || '';
          // Linkar entrada_charge_id no acordo
          if (chargeRowId) {
            await supabase
              .from('acordos')
              .update({ entrada_charge_id: chargeRowId } as never)
              .eq('id', acordoId);
          }
          // Enviar via WhatsApp na instância principal (is_system) ou primeira conectada
          const instSistema = (instancias as any[]).find((i) => i.is_system && ['conectado', 'conectada', 'open', 'connected'].includes((i.status || '').toLowerCase()))
            || (instancias as any[]).find((i) => ['conectado', 'conectada', 'open', 'connected'].includes((i.status || '').toLowerCase()));
          if (instSistema && telefone && brCode) {
            const phoneDigits = telefone.replace(/\D/g, '');
            const phone = phoneDigits.length <= 11 ? '55' + phoneDigits : phoneDigits;
            const msg = `🤝 *Acordo confirmado*\n\nOlá ${nome}!\n\nSeu acordo foi formalizado:\n• Valor total: *${formatCurrency(valor)}*\n• Entrada: *${formatCurrency(valorEntrada)}*\n• Parcelas restantes: *${nP}x ${formatCurrency(valorParcelaPadrao)}*\n\n💰 *Pague a entrada via Pix* (vencimento ${venc.toLocaleDateString('pt-BR')}):\n\n${brCode}\n\n_Após a confirmação do pagamento, suas parcelas serão atualizadas automaticamente._`;
            await enviarWhatsapp.mutateAsync({
              instancia_id: instSistema.id,
              telefone: phone,
              conteudo: msg,
              cliente_id: clienteId,
            });
            if (qrImage) {
              const base64Data = qrImage.replace(/^data:image\/\w+;base64,/, '');
              await enviarWhatsapp.mutateAsync({
                instancia_id: instSistema.id,
                telefone: phone,
                conteudo: 'QR Code da entrada do acordo',
                tipo: 'image',
                media_base64: base64Data,
                cliente_id: clienteId,
              });
            }
            toast.success('Pix da entrada gerado e enviado por WhatsApp');
          } else if (!instSistema) {
            toast.warning('Pix gerado, mas não há instância WhatsApp principal conectada');
          } else if (!telefone) {
            toast.warning('Pix gerado, mas cliente sem telefone cadastrado');
          } else {
            toast.success('Pix da entrada gerado');
          }
        } catch (pixErr) {
          console.error('[AcordoFormModal] Erro ao gerar/enviar Pix da entrada:', pixErr);
          toast.error(`Acordo criado, mas falhou ao gerar Pix da entrada: ${(pixErr as Error).message}`);
        }
      }

      onCriado?.({
        acordoId: acordoId ?? '',
        valorEntrada,
        valorRestante,
        numParcelas: nP,
        valorParcela: valorParcelaPadrao,
      });
      onClose();
    } catch (err) {
      toast.error(`Erro ao criar acordo: ${(err as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ──────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !submitting) onClose(); }}>
      <DialogContent className="min-w-[720px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HandshakeIcon className="w-5 h-5 text-green-600" />
            Configurar Acordo {clienteNome ? `— ${clienteNome}` : ''}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Valor acordado */}
          <div>
            <Label htmlFor="acordo-valor" className="text-sm font-medium flex items-center gap-2">
              <Banknote className="w-4 h-4 text-muted-foreground" /> Valor acordado *
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm">R$</span>
              <Input
                id="acordo-valor"
                className="pl-10"
                placeholder="0,00"
                value={valorAcordado}
                onChange={(e) => setValorAcordado(formatBRL(e.target.value))}
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Sugerido: {formatCurrency(valorDividaSugerido)} (dívida atual)
            </p>
          </div>

          {/* Entrada */}
          <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Entrada</p>
              <div className="flex items-center gap-1 text-xs">
                <button
                  type="button"
                  onClick={() => setEntradaModo('pct')}
                  className={`px-2 py-0.5 rounded transition-colors ${entradaModo === 'pct' ? 'bg-green-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}
                >
                  %
                </button>
                <button
                  type="button"
                  onClick={() => setEntradaModo('valor')}
                  className={`px-2 py-0.5 rounded transition-colors ${entradaModo === 'valor' ? 'bg-green-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}
                >
                  R$
                </button>
              </div>
            </div>
            {entradaModo === 'pct' ? (
              <Input
                type="number"
                min={0}
                max={100}
                step={1}
                value={entradaPct}
                onChange={(e) => setEntradaPct(e.target.value)}
                placeholder="30"
              />
            ) : (
              <Input
                type="number"
                min={0}
                step={0.01}
                value={entradaValor}
                onChange={(e) => setEntradaValor(e.target.value)}
                placeholder="0,00"
              />
            )}
            <p className="text-xs text-muted-foreground">
              Entrada: <strong>{formatCurrency(valorEntrada)}</strong> · Restante: <strong>{formatCurrency(valorRestante)}</strong>
            </p>
          </div>

          {/* Configuração das parcelas */}
          <div className="border-t pt-4">
            <p className="text-sm font-medium text-muted-foreground mb-3">Parcelas do acordo</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label htmlFor="acordo-nparc">Nº parcelas *</Label>
                <Input
                  id="acordo-nparc"
                  type="number"
                  min={1}
                  max={60}
                  value={numParcelas}
                  onChange={(e) => setNumParcelas(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="acordo-periodicidade">Periodicidade</Label>
                <Select
                  value={periodicidade}
                  onValueChange={(v) => {
                    setPeriodicidade(v as Periodicidade);
                    setDiaPagamento('');
                    setIntervaloDias('');
                    setDatasPersonalizadas([]);
                  }}
                >
                  <SelectTrigger id="acordo-periodicidade"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="diario">Diário</SelectItem>
                    <SelectItem value="semanal">Semanal</SelectItem>
                    <SelectItem value="quinzenal">Quinzenal</SelectItem>
                    <SelectItem value="mensal">Mensal</SelectItem>
                    <SelectItem value="personalizado">Personalizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="acordo-valor-parcela">Valor parcela (auto)</Label>
                <Input
                  id="acordo-valor-parcela"
                  value={formatCurrency(valorParcelaPadrao)}
                  readOnly
                  className="bg-muted/50"
                />
              </div>
            </div>

            {/* Campos dinâmicos por periodicidade */}
            {periodicidade === 'semanal' && (
              <div className="mt-3">
                <Label htmlFor="acordo-dia-semana">Dia da semana</Label>
                <Select value={diaPagamento} onValueChange={setDiaPagamento}>
                  <SelectTrigger id="acordo-dia-semana"><SelectValue placeholder="Escolha..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Segunda-feira</SelectItem>
                    <SelectItem value="2">Terça-feira</SelectItem>
                    <SelectItem value="3">Quarta-feira</SelectItem>
                    <SelectItem value="4">Quinta-feira</SelectItem>
                    <SelectItem value="5">Sexta-feira</SelectItem>
                    <SelectItem value="6">Sábado</SelectItem>
                    <SelectItem value="0">Domingo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {(periodicidade === 'quinzenal' || periodicidade === 'mensal') && (
              <div className="mt-3">
                <Label htmlFor="acordo-dia-mes">Dia do mês</Label>
                <Input
                  id="acordo-dia-mes"
                  type="number"
                  min={1}
                  max={periodicidade === 'mensal' ? 28 : 28}
                  value={diaPagamento}
                  onChange={(e) => setDiaPagamento(e.target.value)}
                  placeholder={periodicidade === 'mensal' ? '1 a 28' : '1 a 28'}
                />
              </div>
            )}

            {periodicidade === 'personalizado' && (
              <div className="mt-3 space-y-3">
                <div>
                  <Label htmlFor="acordo-intervalo">Intervalo entre parcelas (dias)</Label>
                  <Input
                    id="acordo-intervalo"
                    type="number"
                    min={1}
                    max={365}
                    value={intervaloDias}
                    onChange={(e) => setIntervaloDias(e.target.value)}
                    placeholder="Ex: 23"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">Vazio se for usar datas específicas abaixo</p>
                </div>
                <div>
                  <Label>Datas específicas de vencimento</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal mt-1">
                        <CalendarDays className="mr-2 h-4 w-4" />
                        {datasPersonalizadas.length > 0
                          ? `${datasPersonalizadas.length} data(s) selecionada(s)`
                          : 'Selecione as datas...'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="multiple"
                        selected={datasPersonalizadas}
                        onSelect={(dates) => setDatasPersonalizadas(dates || [])}
                        disabled={{ before: new Date() }}
                        locale={ptBR}
                      />
                    </PopoverContent>
                  </Popover>
                  {datasPersonalizadas.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {[...datasPersonalizadas]
                        .sort((a, b) => a.getTime() - b.getTime())
                        .map((date, i) => (
                          <Badge key={i} variant="secondary" className="text-xs gap-1">
                            {date.toLocaleDateString('pt-BR')}
                            <X
                              className="h-3 w-3 cursor-pointer"
                              onClick={() => setDatasPersonalizadas(datasPersonalizadas.filter((_, idx) => idx !== i))}
                            />
                          </Badge>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Dia útil */}
            {periodicidade !== 'diario' && (
              <div className="flex items-center gap-2 mt-3">
                <Checkbox
                  id="acordo-dia-util"
                  checked={diaUtil}
                  onCheckedChange={(v) => setDiaUtil(!!v)}
                />
                <Label htmlFor="acordo-dia-util" className="text-sm font-normal cursor-pointer">
                  Considerar apenas dias úteis (ajusta para o próximo dia útil)
                </Label>
              </div>
            )}

            {/* Valores individuais */}
            {nP > 0 && nP <= 60 && (
              <div className="mt-4 p-3 rounded-lg border border-dashed">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Valores individuais por parcela <span className="font-normal">(opcional)</span>
                  </p>
                  <button
                    type="button"
                    className="text-[11px] text-muted-foreground hover:text-foreground underline"
                    onClick={() => setValoresParcelas([])}
                  >
                    Resetar
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {Array.from({ length: nP }).map((_, i) => {
                    const v = valoresParcelas[i] ?? (valorParcelaPadrao > 0 ? valorParcelaPadrao.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
                    return (
                      <div key={i}>
                        <Label className="text-[11px]">Parcela {i + 1}</Label>
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                          <Input
                            className="pl-8 h-8 text-sm"
                            placeholder="0,00"
                            value={v}
                            onChange={(e) => {
                              const arr = Array.from({ length: nP }, (_, j) => valoresParcelas[j] ?? '');
                              arr[i] = formatBRL(e.target.value);
                              setValoresParcelas(arr);
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Preview datas geradas */}
            {datasGeradas.length > 0 && (
              <div className="mt-3 text-xs text-muted-foreground">
                <span className="font-medium">Vencimentos:</span>{' '}
                {datasGeradas.slice(0, 6).map((d) => new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')).join(' · ')}
                {datasGeradas.length > 6 ? ` · +${datasGeradas.length - 6} mais` : ''}
              </div>
            )}
          </div>

          {/* Observação */}
          <div>
            <Label htmlFor="acordo-obs">Observação (opcional)</Label>
            <Textarea
              id="acordo-obs"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
              placeholder="Detalhes do acordo, condições especiais..."
            />
          </div>

          {/* Resumo */}
          <div className="bg-muted/40 rounded-lg p-3 text-sm space-y-1">
            <div className="flex justify-between"><span>Valor acordado:</span><strong>{formatCurrency(valor)}</strong></div>
            <div className="flex justify-between"><span>Entrada:</span><strong>{formatCurrency(valorEntrada)}</strong></div>
            <div className="flex justify-between"><span>Restante ({nP}x):</span><strong>{nP}x {formatCurrency(valorParcelaPadrao)}</strong></div>
            <div className="flex justify-between text-xs text-muted-foreground"><span>Periodicidade:</span><span>{periodicidade}{diaUtil ? ' · dias úteis' : ''}</span></div>
          </div>

          {/* Pix entrada + WhatsApp */}
          <div className="flex items-start gap-2 p-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
            <Checkbox
              id="acordo-pix-entrada"
              checked={gerarPixEntrada}
              onCheckedChange={(v) => setGerarPixEntrada(!!v)}
              className="mt-0.5"
            />
            <div className="flex-1">
              <Label htmlFor="acordo-pix-entrada" className="text-sm font-medium cursor-pointer">
                Gerar Pix da entrada e enviar por WhatsApp
              </Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Cria cobrança Pix EFI ({formatCurrency(valorEntrada)}, vence amanhã) e envia ao cliente pela instância principal.
              </p>
            </div>
          </div>

          {/* Ações */}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={submitting}>
              Cancelar
            </Button>
            <Button
              className="flex-1 bg-green-600 hover:bg-green-700"
              onClick={handleSubmit}
              disabled={submitting || valor <= 0 || nP < 1}
            >
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <HandshakeIcon className="w-4 h-4 mr-2" />}
              Criar acordo
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
