/**
 * @module PagamentosWooviPage
 * @description Página de gestão de pagamentos Pix — EFI Bank.
 * Exibe saldo, cobranças e transações EFI (cron + manuais).
 */
import { useState, useMemo, useEffect, useRef } from 'react';
import {
  QrCode,
  ArrowUpRight,
  ArrowDownLeft,
  Plus,
  Search,
  RefreshCw,
  Eye,
  Landmark,
  Send,
  Loader2,
  FileText,
  CalendarIcon,
  Banknote,
  DollarSign,
  ShieldAlert,
  Copy,
  ChevronRight,
  CreditCard,
  Receipt,
  Link2,
  CheckCircle2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Label } from '../components/ui/label';
import { Calendar } from '../components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../components/ui/popover';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PixQRCode } from '../components/PixQRCode';
import {
  useCobrancasWoovi,
  useTransacoesWoovi,
  useSaldoEfi,
  useCriarCobrancaEfi,
  useListarPixRecebidosEfi,
  useListarPixEnviadosEfi,
} from '../hooks/useWoovi';
import { useParcelas } from '../hooks/useParcelas';
import { useClientes } from '../hooks/useClientes';
import { useInstancias, useEnviarWhatsapp } from '../hooks/useWhatsapp';
import { useEmprestimos } from '../hooks/useEmprestimos';
import { useAnalises } from '../hooks/useAnaliseCredito';
import { useConfigSistema } from '../hooks/useConfigSistema';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { valorCorrigido } from '../lib/juros';
import type { Parcela } from '../lib/view-types';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const chargeStatusConfig: Record<string, { label: string; className: string }> = {
  ACTIVE: {
    label: 'Ativa',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  },
  COMPLETED: {
    label: 'Paga',
    className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  },
  EXPIRED: {
    label: 'Expirada',
    className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  },
  ERROR: {
    label: 'Erro',
    className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  },
};

const txStatusConfig: Record<string, { label: string; className: string }> = {
  PENDING: {
    label: 'Pendente',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  },
  CONFIRMED: {
    label: 'Confirmada',
    className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  },
  FAILED: {
    label: 'Falhou',
    className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  },
  REFUNDED: {
    label: 'Estornada',
    className: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  },
};

const txTypeLabels: Record<string, string> = {
  CHARGE: 'Recebimento',
  PAYMENT: 'Pagamento Pix',
  SPLIT: 'Split/Comissão',
  WITHDRAWAL: 'Saque',
};

/** Valor total corrigido de uma parcela (original + juros + multa - desconto) */
const parcelaTotal = (p: Parcela) =>
  valorCorrigido(p.valorOriginal, p.dataVencimento, p.juros, p.multa, p.desconto).total;

export default function PagamentosWooviPage() {
  const [busca, setBusca] = useState('');
  const [chargeStatusFilter, setChargeStatusFilter] = useState<string>('');
  const [showNovaCobranca, setShowNovaCobranca] = useState(false);
  const [selectedCharge, setSelectedCharge] = useState<any>(null);
  const [selectedChargeDetail, setSelectedChargeDetail] = useState<any>(null);
  const [criandoCobranca, setCriandoCobranca] = useState(false);

  // Form state — nova cobrança (parcela-based)
  const [novaCobrancaClienteId, setNovaCobrancaClienteId] = useState('');
  const [novaCobrancaParcelaId, setNovaCobrancaParcelaId] = useState('');
  const [novaCobrancaValorAjustado, setNovaCobrancaValorAjustado] = useState('');

  // Hooks
  const { data: cobrancas = [], isLoading: loadingCharges } = useCobrancasWoovi(chargeStatusFilter || undefined);
  const { data: transacoes = [], isLoading: loadingTx } = useTransacoesWoovi();
  const { data: allParcelas = [] } = useParcelas();
  const { data: clientes = [] } = useClientes();
  const { data: instancias = [] } = useInstancias();
  const { data: emprestimos = [] } = useEmprestimos();
  const { data: analises = [] } = useAnalises();
  const { data: configSistema } = useConfigSistema();
  const { user } = useAuth();
  const enviarWhatsapp = useEnviarWhatsapp();

  const criarCobrancaEfi = useCriarCobrancaEfi();
  const { data: efiBalanceData } = useSaldoEfi();

  // ── Desembolso manual (migrado de AnaliseCreditoPage) ─────────
  const isAdminGerencia = user?.role === 'admin' || user?.role === 'gerencia';
  const [markingDesembolso, setMarkingDesembolso] = useState<string | null>(null);
  const autoConfirmedRef = useRef<Set<string>>(new Set());

  const handleMarcarDesembolsado = async (emprestimoId: string) => {
    setMarkingDesembolso(emprestimoId);
    try {
      const { error } = await (supabase.from('emprestimos') as any)
        .update({ desembolsado: true, desembolsado_em: new Date().toISOString(), desembolsado_por: user?.id })
        .eq('id', emprestimoId);
      if (error) throw error;
      toast.success('Empréstimo marcado como desembolsado!');
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setMarkingDesembolso(null);
    }
  };

  const emprestimosAprovados = useMemo(() => {
    if (!analises || !emprestimos.length) return [];
    const analisesAprovadas = new Set(analises.filter((a) => a.status === 'aprovado').map((a) => a.id));
    const clienteById = new Map(clientes.map((c) => [c.id, c]));
    return emprestimos
      .filter((e) => e.analiseId && analisesAprovadas.has(e.analiseId))
      .map((e) => {
        const analise = analises.find((a) => a.id === e.analiseId);
        const cliente = clienteById.get(e.clienteId);
        return {
          ...e,
          clienteNome: analise?.clienteNome ?? e.clienteNome ?? '',
          pixKey: cliente?.pix_key ?? null,
          pixKeyType: cliente?.pix_key_type ?? null,
          clienteCpf: cliente?.cpf ?? null,
          clienteTelefone: cliente?.telefone ?? null,
        };
      });
  }, [analises, emprestimos, clientes]);

  const aguardandoEnvio = emprestimosAprovados.filter((e) => !e.desembolsado);
  const jaEnviados = emprestimosAprovados.filter((e) => e.desembolsado);
  const emprestimosSkipVerification = emprestimosAprovados.filter((e) => e.skipVerification);
  const controleDesembolsoAtivo = configSistema?.controle_desembolso_ativo !== false;
  const totalAguardandoEnvio = aguardandoEnvio.reduce((sum, e) => sum + e.valor, 0);
  const totalJaEnviado = jaEnviados.reduce((sum, e) => sum + e.valor, 0);

  // ── Filtro de período global ────────────────────────────
  const [dateFrom, setDateFrom] = useState<Date>(subDays(new Date(), 30));
  const [dateTo, setDateTo] = useState<Date>(new Date());
  const [extratoTipoFilter, setExtratoTipoFilter] = useState<string>('TODAS');

  // Computed period boundaries (reused across all filters)
  const periodoInicio = startOfDay(dateFrom);
  const periodoFim = endOfDay(dateTo);

  // ISO strings for EFI API hooks
  const extratoInicio = format(periodoInicio, "yyyy-MM-dd'T'HH:mm:ss'Z'");
  const extratoFim = format(periodoFim, "yyyy-MM-dd'T'HH:mm:ss'Z'");

  const { data: pixRecebidos, isLoading: loadingRecebidos, refetch: refetchRecebidos } =
    useListarPixRecebidosEfi(extratoInicio, extratoFim);
  const { data: pixEnviados, isLoading: loadingEnviados, refetch: refetchEnviados } =
    useListarPixEnviadosEfi(extratoInicio, extratoFim);

  const loadingExtrato = loadingRecebidos || loadingEnviados;

  // Merge received + sent Pix into a single sorted timeline
  type ExtratoItem = {
    id: string;
    direction: 'entrada' | 'saida';
    valor: number;
    horario: string;
    e2eId: string;
    nome: string;
    descricao: string;
    status: string;
  };

  const extratoItems = useMemo<ExtratoItem[]>(() => {
    const items: ExtratoItem[] = [];

    // EFI returns `horario` as an object { solicitacao, liquidacao } for both received and sent Pix
    const extractDate = (h: any): string => {
      if (typeof h === 'string') return h;
      if (h && typeof h === 'object') return h.solicitacao || h.liquidacao || '';
      return '';
    };

    // Received Pix (from GET /v2/pix response)
    const recebidosList = pixRecebidos?.pix || [];
    if (Array.isArray(recebidosList)) {
      for (const p of recebidosList) {
        items.push({
          id: p.endToEndId || p.txid || crypto.randomUUID(),
          direction: 'entrada',
          valor: parseFloat(p.valor || '0'),
          horario: extractDate(p.horario) || p.criacao || '',
          e2eId: p.endToEndId || '',
          nome: p.pagador?.nome || p.pagador?.identificacao?.nome || p.infoPagador || '',
          descricao: p.txid || '',
          status: p.status || 'CONFIRMED',
        });
      }
    }

    // Sent Pix (from GET /v2/gn/pix/enviados response)
    const enviadosList = pixEnviados?.pix || [];
    if (Array.isArray(enviadosList)) {
      for (const p of enviadosList) {
        items.push({
          id: p.endToEndId || p.idEnvio || crypto.randomUUID(),
          direction: 'saida',
          valor: parseFloat(p.valor || '0'),
          horario: extractDate(p.horario) || p.solicitacao || '',
          e2eId: p.endToEndId || '',
          nome: p.favorecido?.identificacao?.nome || p.favorecido?.nome || '',
          descricao: p.favorecido?.chave || '',
          status: p.status || 'REALIZADO',
        });
      }
    }

    // Sort newest first
    items.sort((a, b) => new Date(b.horario).getTime() - new Date(a.horario).getTime());
    return items;
  }, [pixRecebidos, pixEnviados]);

  // Merge COMPLETED EFI charges from DB (bot + manual) into extrato, deduplicating
  const extratoItemsMerged = useMemo<ExtratoItem[]>(() => {
    const items = [...extratoItems];

    // Build a set of known txids/e2eIds to avoid duplicates
    const knownIds = new Set<string>();
    for (const item of items) {
      if (item.e2eId) knownIds.add(item.e2eId);
      if (item.descricao) knownIds.add(item.descricao); // txid is stored in descricao
      if (item.id) knownIds.add(item.id);
    }

    // Add COMPLETED EFI charges from DB that aren't already in the EFI API response
    const completedCharges = cobrancas.filter(
      (c) => c.gateway === 'efi' && c.status === 'COMPLETED'
    );

    const fromDate = periodoInicio.getTime();
    const toDate = periodoFim.getTime();

    for (const charge of completedCharges) {
      const chargeDate = new Date(charge.paidAt || charge.createdAt).getTime();
      // Only include if within the selected date range
      if (chargeDate < fromDate || chargeDate > toDate) continue;

      // Skip if already present (by txid match)
      const txid = charge.wooviTxid || charge.wooviChargeId || '';
      if (txid && knownIds.has(txid)) continue;

      items.push({
        id: charge.id,
        direction: 'entrada',
        valor: charge.valor,
        horario: charge.paidAt || charge.createdAt,
        e2eId: txid,
        nome: charge.clienteNome || '',
        descricao: `Cobrança PIX${charge.clienteNome ? ` — ${charge.clienteNome}` : ''}`,
        status: 'CONFIRMED',
      });
      knownIds.add(txid);
    }

    items.sort((a, b) => new Date(b.horario).getTime() - new Date(a.horario).getTime());
    return items;
  }, [extratoItems, cobrancas, dateFrom, dateTo, periodoInicio, periodoFim]);

  // Filtered extrato
  const extratoFiltered = useMemo(() => {
    if (extratoTipoFilter === 'ENTRADAS') return extratoItemsMerged.filter(i => i.direction === 'entrada');
    if (extratoTipoFilter === 'SAIDAS') return extratoItemsMerged.filter(i => i.direction === 'saida');
    return extratoItemsMerged;
  }, [extratoItemsMerged, extratoTipoFilter]);

  // Period totals
  const extratoTotals = useMemo(() => {
    const entradas = extratoItemsMerged.filter(i => i.direction === 'entrada').reduce((s, i) => s + i.valor, 0);
    const saidas = extratoItemsMerged.filter(i => i.direction === 'saida').reduce((s, i) => s + i.valor, 0);
    return { entradas, saidas, saldo: entradas - saidas };
  }, [extratoItemsMerged]);

  // ── Auto-match desembolso: cruza saídas do extrato com aguardandoEnvio ──
  // Normaliza chave PIX (remove formatação CPF/telefone, lowercase) p/ comparação robusta
  const normalizePixKey = (k: string | null | undefined): string => {
    if (!k) return '';
    const trimmed = String(k).trim().toLowerCase();
    if (trimmed.includes('@')) return trimmed; // e-mail mantém formato
    return trimmed.replace(/[^a-z0-9]/g, ''); // CPF/telefone/random → só alfanumérico
  };

  // Map: emprestimoId → ExtratoItem (saída) que casa (mesma chave + valor)
  const extratoMatchByEmprestimo = useMemo(() => {
    const map = new Map<string, ExtratoItem>();
    if (!aguardandoEnvio.length) return map;
    const saidas = extratoItemsMerged.filter((i) => i.direction === 'saida');
    if (!saidas.length) return map;
    const usados = new Set<string>();
    for (const emp of aguardandoEnvio) {
      if (!emp.pixKey) continue;
      const empKey = normalizePixKey(emp.pixKey);
      if (!empKey) continue;
      const match = saidas.find(
        (s) =>
          !usados.has(s.id) &&
          normalizePixKey(s.descricao) === empKey &&
          Math.abs(s.valor - emp.valor) < 0.01,
      );
      if (match) {
        map.set(emp.id, match);
        usados.add(match.id);
      }
    }
    return map;
  }, [aguardandoEnvio, extratoItemsMerged]);

  // Auto-confirma desembolso quando há match no extrato (uma vez por empréstimo)
  useEffect(() => {
    if (!extratoMatchByEmprestimo.size) return;
    for (const [empId, match] of extratoMatchByEmprestimo.entries()) {
      if (autoConfirmedRef.current.has(empId)) continue;
      autoConfirmedRef.current.add(empId);
      const emp = aguardandoEnvio.find((e) => e.id === empId);
      const nome = emp?.clienteNome ?? 'cliente';
      handleMarcarDesembolsado(empId).then(() => {
        toast.success(
          `Desembolso de ${nome} auto-confirmado pelo extrato (${match.e2eId.slice(0, 12)}…)`,
        );
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extratoMatchByEmprestimo]);

  // Estado para modal de detalhes de item do extrato
  const [selectedExtratoItem, setSelectedExtratoItem] = useState<ExtratoItem | null>(null);
  const [vincularBusca, setVincularBusca] = useState('');

  // Limpa busca quando o modal fecha/troca de item
  useEffect(() => {
    setVincularBusca('');
  }, [selectedExtratoItem?.id]);

  // Parcelas pendentes/vencidas do cliente selecionado
  const parcelasDoCliente = useMemo(() => {
    if (!novaCobrancaClienteId) return [];
    return allParcelas
      .filter(p => p.clienteId === novaCobrancaClienteId && (p.status === 'pendente' || p.status === 'vencida'))
      .sort((a, b) => a.numero - b.numero);
  }, [allParcelas, novaCobrancaClienteId]);

  // When parcela is selected, auto-fill the value
  const parcelaSelecionada = useMemo(() => {
    if (!novaCobrancaParcelaId) return null;
    return parcelasDoCliente.find(p => p.id === novaCobrancaParcelaId) ?? null;
  }, [parcelasDoCliente, novaCobrancaParcelaId]);

  const valorCalculado = useMemo(() => {
    if (!parcelaSelecionada) return 0;
    return parcelaTotal(parcelaSelecionada);
  }, [parcelaSelecionada]);

  const valorFinal = novaCobrancaValorAjustado
    ? parseFloat(novaCobrancaValorAjustado)
    : valorCalculado;

  // Existing EFI charges lookup (for duplicate check)
  const chargesAtivas = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const c of cobrancas) {
      if (c.gateway === 'efi' && c.status === 'ACTIVE' && c.parcelaId) {
        map.set(c.parcelaId, true);
      }
    }
    return map;
  }, [cobrancas]);

  // Show only EFI charges (filtered by date range + busca)
  const filteredCharges = useMemo(() => {
    const from = periodoInicio.getTime();
    const to = periodoFim.getTime();
    return cobrancas.filter((c) => {
      const isEfi = c.gateway === 'efi';
      const matchBusca = c.clienteNome.toLowerCase().includes(busca.toLowerCase()) ||
        c.wooviChargeId.toLowerCase().includes(busca.toLowerCase());
      const d = new Date(c.createdAt).getTime();
      return isEfi && matchBusca && d >= from && d <= to;
    });
  }, [cobrancas, busca, periodoInicio, periodoFim]);

  // Show only EFI transactions (filtered by date range + busca)
  const filteredTx = useMemo(() => {
    const from = periodoInicio.getTime();
    const to = periodoFim.getTime();
    return transacoes.filter((t) => {
      const isEfi = t.gateway === 'efi';
      const matchBusca = (t.descricao || '').toLowerCase().includes(busca.toLowerCase()) ||
        (t.destinatarioNome || '').toLowerCase().includes(busca.toLowerCase());
      const d = new Date(t.createdAt).getTime();
      return isEfi && matchBusca && d >= from && d <= to;
    });
  }, [transacoes, busca, periodoInicio, periodoFim]);

  // KPIs — only EFI, filtered by date range
  const kpis = useMemo(() => {
    const from = periodoInicio.getTime();
    const to = periodoFim.getTime();
    const inRange = (dt: string) => { const t = new Date(dt).getTime(); return t >= from && t <= to; };
    const efiCharges = cobrancas.filter(c => c.gateway === 'efi' && inRange(c.createdAt));
    const efiTx = transacoes.filter(t => t.gateway === 'efi' && inRange(t.createdAt));
    return {
      total: efiCharges.length,
      ativas: efiCharges.filter(c => c.status === 'ACTIVE').length,
      pagas: efiCharges.filter(c => c.status === 'COMPLETED').length,
      expiradas: efiCharges.filter(c => c.status === 'EXPIRED').length,
      totalTx: efiTx.length,
    };
  }, [cobrancas, transacoes, periodoInicio, periodoFim]);

  const resetNovaCobForm = () => {
    setNovaCobrancaClienteId('');
    setNovaCobrancaParcelaId('');
    setNovaCobrancaValorAjustado('');
  };

  const handleCriarCobranca = async () => {
    if (!novaCobrancaClienteId || !novaCobrancaParcelaId || !parcelaSelecionada) {
      toast.error('Selecione cliente e parcela');
      return;
    }
    if (valorFinal <= 0) {
      toast.error('Valor deve ser maior que zero');
      return;
    }
    // Duplicate check
    if (chargesAtivas.has(novaCobrancaParcelaId)) {
      toast.error('Já existe uma cobrança ATIVA para esta parcela. Aguarde a expiração ou cancele a anterior.');
      return;
    }

    setCriandoCobranca(true);
    const cliente = clientes.find((c) => c.id === novaCobrancaClienteId);
    try {
      const result = await criarCobrancaEfi.mutateAsync({
        parcela_id: novaCobrancaParcelaId,
        emprestimo_id: parcelaSelecionada.emprestimoId,
        cliente_id: novaCobrancaClienteId,
        valor: valorFinal,
        descricao: `Parcela ${parcelaSelecionada.numero} - ${parcelaSelecionada.clienteNome}`,
        cliente_nome: cliente?.nome,
        cliente_cpf: cliente?.cpf,
      });

      const charge = (result as any)?.charge;
      const brCode = charge?.br_code || '';
      const qrImage = charge?.qr_code_image || '';

      if (!brCode && !qrImage) {
        toast.warning('Cobrança registrada na EFI, mas QR Code não foi gerado.');
      } else {
        // Send via WhatsApp if possible
        const instSistema = instancias.find(i => ['conectado', 'conectada', 'open', 'connected'].includes(i.status?.toLowerCase?.() || i.status));
        if (instSistema && cliente?.telefone && brCode) {
          const phone = cliente.telefone.replace(/\D/g, '').length <= 11
            ? '55' + cliente.telefone.replace(/\D/g, '')
            : cliente.telefone.replace(/\D/g, '');
          const msg = `💰 *Cobrança PIX - Parcela ${parcelaSelecionada.numero}*\n\nOlá ${parcelaSelecionada.clienteNome}!\n\nValor: *${formatCurrency(valorFinal)}*\nVencimento: ${new Date(parcelaSelecionada.dataVencimento).toLocaleDateString('pt-BR')}\n\n📱 Copie o código PIX abaixo e cole no app do seu banco:\n\n${brCode}\n\n_CasaDaMoeda_`;
          await enviarWhatsapp.mutateAsync({ instancia_id: instSistema.id, telefone: phone, conteudo: msg });
          if (qrImage) {
            const base64Data = qrImage.replace(/^data:image\/\w+;base64,/, '');
            await enviarWhatsapp.mutateAsync({ instancia_id: instSistema.id, telefone: phone, conteudo: `QR Code - Parcela ${parcelaSelecionada.numero}`, tipo: 'image', media_base64: base64Data });
          }
          toast.success('Cobrança PIX gerada e enviada ao cliente via WhatsApp!');
        } else if (!instSistema) {
          toast.success('Cobrança PIX gerada! Nenhuma instância WhatsApp conectada.');
        } else if (!cliente?.telefone) {
          toast.success('Cobrança PIX gerada! Cliente sem telefone cadastrado.');
        } else {
          toast.success('Cobrança PIX gerada!');
        }
      }

      setShowNovaCobranca(false);
      resetNovaCobForm();
    } catch (err) {
      toast.error(`Erro ao criar cobrança: ${(err as Error).message}`);
    } finally {
      setCriandoCobranca(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pagamentos Pix</h1>
          <p className="text-sm text-muted-foreground">
            Cobranças e pagamentos Pix — EFI Bank
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowNovaCobranca(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nova Cobrança
          </Button>
        </div>
      </div>

      {/* Filtro de período global */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Início</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-[178px] justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(dateFrom, 'dd/MM/yyyy', { locale: ptBR })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dateFrom}
                onSelect={(d) => d && setDateFrom(d)}
                locale={ptBR}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Fim</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-[178px] justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(dateTo, 'dd/MM/yyyy', { locale: ptBR })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dateTo}
                onSelect={(d) => d && setDateTo(d)}
                locale={ptBR}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
        <Button
          variant="outline"
          onClick={() => { refetchRecebidos(); refetchEnviados(); }}
          disabled={loadingExtrato}
        >
          {loadingExtrato ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Atualizar
        </Button>
      </div>

      {/* Saldo + KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* EFI Saldo Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Landmark className="h-4 w-4 text-orange-500" />
              Conta EFI Bank
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div>
              <p className="text-xs text-muted-foreground">Saldo disponível</p>
              <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                {efiBalanceData?.balance?.saldo != null
                  ? formatCurrency(parseFloat(efiBalanceData.balance.saldo))
                  : '—'}
              </p>
              {efiBalanceData?.message && (
                <p className="text-xs text-muted-foreground mt-1">{efiBalanceData.message}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Entradas */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <ArrowDownLeft className="h-4 w-4 text-green-500" />
              Entradas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
              {formatCurrency(extratoTotals.entradas)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {extratoItemsMerged.filter(i => i.direction === 'entrada').length} recebimento(s) no período
            </p>
          </CardContent>
        </Card>

        {/* Saídas */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <ArrowUpRight className="h-4 w-4 text-red-500" />
              Saídas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">
              {formatCurrency(extratoTotals.saidas)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {extratoItemsMerged.filter(i => i.direction === 'saida').length} envio(s) no período
            </p>
          </CardContent>
        </Card>

        {/* Cobranças */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <QrCode className="h-4 w-4 text-orange-500" />
              Cobranças
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{kpis.total}</p>
            <div className="mt-2 flex gap-3 text-xs">
              <span className="text-amber-600 dark:text-amber-400">
                {kpis.ativas} ativas
              </span>
              <span className="text-green-600 dark:text-green-400">
                {kpis.pagas} pagas
              </span>
              <span className="text-red-600 dark:text-red-400">
                {kpis.expiradas} expiradas
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Busca */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente, ID da cobrança..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="cobrancas">
        <TabsList>
          <TabsTrigger value="cobrancas" className="flex items-center gap-2">
            <QrCode className="h-4 w-4" />
            Cobranças
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{filteredCharges.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="transacoes" className="flex items-center gap-2">
            <ArrowUpRight className="h-4 w-4" />
            Transações
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{filteredTx.length}</Badge>
          </TabsTrigger>
          {isAdminGerencia && controleDesembolsoAtivo && (
            <TabsTrigger value="desembolsos" className="flex items-center gap-2">
              <Banknote className="h-4 w-4" />
              Desembolsos
              {aguardandoEnvio.length > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">{aguardandoEnvio.length}</Badge>
              )}
            </TabsTrigger>
          )}
          <TabsTrigger value="extratos" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Extratos
          </TabsTrigger>
        </TabsList>

        {/* ── Tab: Cobranças ────────────────────────────── */}
        <TabsContent value="cobrancas" className="space-y-4">
          <div className="flex gap-2">
            <Select value={chargeStatusFilter || 'ALL'} onValueChange={(v) => setChargeStatusFilter(v === 'ALL' ? '' : v)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todas</SelectItem>
                <SelectItem value="ACTIVE">Ativas</SelectItem>
                <SelectItem value="COMPLETED">Pagas</SelectItem>
                <SelectItem value="EXPIRED">Expiradas</SelectItem>
              </SelectContent>
            </Select>
          </div>
§
          {loadingCharges ? (
            <p className="text-muted-foreground text-sm">Carregando...</p>
          ) : filteredCharges.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <QrCode className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">Nenhuma cobrança encontrada</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {filteredCharges.map((charge) => {
                const cfg = chargeStatusConfig[charge.status] || chargeStatusConfig.ERROR;
                const parcela = charge.parcelaId
                  ? allParcelas.find((p) => p.id === charge.parcelaId)
                  : null;
                return (
                  <Card
                    key={charge.id}
                    className="p-4 cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => setSelectedChargeDetail(charge)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 dark:bg-orange-900/20">
                          <Landmark className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                        </div>
                        <div>
                          <p className="font-medium">{charge.clienteNome || 'Cliente'}</p>
                          <p className="text-xs text-muted-foreground">
                            {charge.wooviChargeId.slice(0, 8)}... · {formatDate(charge.createdAt)}
                          </p>
                          {parcela && (
                            <p className="text-xs text-muted-foreground">
                              Parcela {parcela.numero} · venc. {new Date(parcela.dataVencimento).toLocaleDateString('pt-BR')}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="font-semibold">{formatCurrency(charge.valor)}</p>
                          <Badge className={cfg.className}>{cfg.label}</Badge>
                        </div>
                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                          {charge.status === 'ACTIVE' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setSelectedCharge(charge)}
                              title="Ver QR Code"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Ver detalhes">
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Tab: Transações ───────────────────────────── */}
        <TabsContent value="transacoes" className="space-y-4">
          {loadingTx ? (
            <p className="text-muted-foreground text-sm">Carregando...</p>
          ) : filteredTx.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <ArrowUpRight className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">Nenhuma transação encontrada</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {filteredTx.map((tx) => {
                const txCfg = txStatusConfig[tx.status] || txStatusConfig.PENDING;
                const isIncoming = tx.tipo === 'CHARGE';
                return (
                  <Card key={tx.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                            isIncoming
                              ? 'bg-green-50 dark:bg-green-900/20'
                              : 'bg-red-50 dark:bg-red-900/20'
                          }`}
                        >
                          {isIncoming ? (
                            <ArrowDownLeft className="h-5 w-5 text-green-600 dark:text-green-400" />
                          ) : (
                            <ArrowUpRight className="h-5 w-5 text-red-600 dark:text-red-400" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium">
                            {txTypeLabels[tx.tipo] || tx.tipo}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {tx.descricao || tx.destinatarioNome || '—'} · {formatDate(tx.createdAt)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p
                          className={`font-semibold ${
                            isIncoming ? 'text-green-600 dark:text-green-400' : ''
                          }`}
                        >
                          {isIncoming ? '+' : '-'} {formatCurrency(tx.valor)}
                        </p>
                        <Badge className={txCfg.className}>{txCfg.label}</Badge>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Tab: Desembolsos (admin/gerência) ─────────── */}
        {isAdminGerencia && controleDesembolsoAtivo && (
          <TabsContent value="desembolsos" className="space-y-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <Banknote className="w-5 h-5 text-primary" />
                  <h3 className="font-semibold">Controle de Desembolso</h3>
                  <Badge variant="outline" className="ml-auto">{aguardandoEnvio.length} aguardando</Badge>
                  <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400">{jaEnviados.length} enviados</Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                    <p className="text-xs text-muted-foreground">Valor pendente de envio</p>
                    <p className="text-lg font-semibold text-amber-700 dark:text-amber-400">{formatCurrency(totalAguardandoEnvio)}</p>
                  </div>
                  <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3">
                    <p className="text-xs text-muted-foreground">Valor já desembolsado</p>
                    <p className="text-lg font-semibold text-green-700 dark:text-green-400">{formatCurrency(totalJaEnviado)}</p>
                  </div>
                </div>

                {configSistema?.desembolso_automatico_ativo === false && (
                  <div className="mb-4 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 text-sm text-blue-700 dark:text-blue-300">
                    O desembolso automático está desligado. Aprovações novas entram aqui para envio manual e conferência do que já foi pago.
                  </div>
                )}

                {emprestimosSkipVerification.length > 0 && user?.role === 'admin' && (
                  <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <ShieldAlert className="h-4 w-4 text-red-600" />
                      <p className="text-sm font-medium text-red-700 dark:text-red-400">
                        Empréstimos sem verificação de identidade ({emprestimosSkipVerification.length})
                      </p>
                    </div>
                    <p className="text-[11px] text-muted-foreground mb-2">
                      Estes empréstimos foram auto-aprovados pelo criador sem o fluxo de vídeo-selfie/documentos. Acompanhe de perto.
                    </p>
                    <div className="space-y-1">
                      {emprestimosSkipVerification.slice(0, 10).map((e) => (
                        <div key={e.id} className="flex items-center justify-between text-xs p-2 rounded bg-red-500/5">
                          <span className="font-medium">{e.clienteNome}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">{formatCurrency(e.valor)}</span>
                            <Badge variant="outline" className="text-[10px] h-4 px-1">{e.status}</Badge>
                            <span className="text-muted-foreground">{e.aprovadoEm ? new Date(e.aprovadoEm).toLocaleDateString('pt-BR') : '—'}</span>
                          </div>
                        </div>
                      ))}
                      {emprestimosSkipVerification.length > 10 && (
                        <p className="text-[11px] text-muted-foreground text-center pt-1">... e mais {emprestimosSkipVerification.length - 10}</p>
                      )}
                    </div>
                  </div>
                )}

                {aguardandoEnvio.length > 0 ? (
                  <div className="mb-4">
                    <p className="text-sm font-medium text-amber-600 dark:text-amber-400 mb-2">⏳ Aguardando Envio do Dinheiro</p>
                    <div className="space-y-2">
                      {aguardandoEnvio.map((e) => {
                        const pixLabel = e.pixKeyType
                          ? `${e.pixKeyType.toUpperCase()}: ${e.pixKey}`
                          : e.pixKey ?? '';
                        const matchExtrato = extratoMatchByEmprestimo.get(e.id);
                        return (
                          <div key={e.id} className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 space-y-2">
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium">{e.clienteNome}</span>
                                {e.skipVerification && (
                                  <Badge variant="outline" className="text-[10px] h-4 px-1 bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-400">sem verificação</Badge>
                                )}
                                {matchExtrato && (
                                  <Badge variant="outline" className="text-[10px] h-4 px-1 bg-green-500/10 text-green-700 border-green-500/30 dark:text-green-400">
                                    ✓ Detectado no extrato — confirmando…
                                  </Badge>
                                )}
                                <span className="text-muted-foreground text-sm">{formatCurrency(e.valor)}</span>
                                <span className="text-muted-foreground text-xs">{new Date(e.dataContrato).toLocaleDateString('pt-BR')}</span>
                              </div>
                              <Button
                                size="sm"
                                className="bg-green-600 hover:bg-green-700 text-white"
                                onClick={() => handleMarcarDesembolsado(e.id)}
                                disabled={markingDesembolso === e.id}
                              >
                                <DollarSign className="w-4 h-4 mr-1" />
                                {markingDesembolso === e.id ? 'Marcando...' : 'Marcar Enviado'}
                              </Button>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap text-xs bg-background/60 rounded border border-amber-500/20 px-2 py-1.5">
                              {e.pixKey ? (
                                <>
                                  <span className="text-muted-foreground">PIX:</span>
                                  <span className="font-mono font-medium truncate max-w-xs">{pixLabel}</span>
                                  <button
                                    type="button"
                                    className="inline-flex items-center gap-1 text-primary hover:text-primary/80"
                                    onClick={() => {
                                      navigator.clipboard.writeText(e.pixKey ?? '');
                                      toast.success('Chave PIX copiada!');
                                    }}
                                    title="Copiar chave PIX"
                                  >
                                    <Copy className="w-3 h-3" />
                                    copiar
                                  </button>
                                  <span className="text-muted-foreground">•</span>
                                  <button
                                    type="button"
                                    className="inline-flex items-center gap-1 text-primary hover:text-primary/80"
                                    onClick={() => {
                                      navigator.clipboard.writeText(e.valor.toFixed(2).replace('.', ','));
                                      toast.success('Valor copiado!');
                                    }}
                                    title="Copiar valor"
                                  >
                                    <Copy className="w-3 h-3" />
                                    valor
                                  </button>
                                </>
                              ) : (
                                <span className="text-red-600 dark:text-red-400">⚠️ Cliente sem PIX cadastrada — cadastre na ficha do cliente antes de enviar.</span>
                              )}
                              {e.clienteCpf && (
                                <>
                                  <span className="text-muted-foreground ml-auto">CPF: <span className="font-mono">{e.clienteCpf}</span></span>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-6">Nenhum empréstimo aguardando desembolso.</p>
                )}

                {jaEnviados.length > 0 && (
                  <details className="group">
                    <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                      ✅ Já enviados ({jaEnviados.length})
                    </summary>
                    <div className="mt-2 space-y-1">
                      {jaEnviados.map((e) => (
                        <div key={e.id} className="flex items-center justify-between p-2 rounded bg-green-500/5 text-sm">
                          <span className="flex items-center gap-2">
                            {e.clienteNome} — {formatCurrency(e.valor)}
                            {e.skipVerification && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1 bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-400">sem verificação</Badge>
                            )}
                          </span>
                          <span className="text-xs text-muted-foreground">{e.desembolsadoEm ? new Date(e.desembolsadoEm).toLocaleDateString('pt-BR') : '—'}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* ── Tab: Extratos ─────────────────────────────── */}
        <TabsContent value="extratos" className="space-y-4">
          {/* Filtro tipo */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Tipo</Label>
              <Select value={extratoTipoFilter} onValueChange={setExtratoTipoFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODAS">Todas</SelectItem>
                  <SelectItem value="ENTRADAS">Entradas</SelectItem>
                  <SelectItem value="SAIDAS">Saídas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Resumo do período */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground mb-1">Entradas no período</p>
                <p className="text-xl font-bold text-green-600 dark:text-green-400">
                  {formatCurrency(extratoTotals.entradas)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {extratoItemsMerged.filter(i => i.direction === 'entrada').length} recebimento(s)
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground mb-1">Saídas no período</p>
                <p className="text-xl font-bold text-red-600 dark:text-red-400">
                  {formatCurrency(extratoTotals.saidas)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {extratoItemsMerged.filter(i => i.direction === 'saida').length} envio(s)
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground mb-1">Saldo do período</p>
                <p className={`text-xl font-bold ${extratoTotals.saldo >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {extratoTotals.saldo >= 0 ? '+' : ''}{formatCurrency(extratoTotals.saldo)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {format(dateFrom, 'dd/MM', { locale: ptBR })} — {format(dateTo, 'dd/MM', { locale: ptBR })}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Lista de lançamentos */}
          {loadingExtrato ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Consultando extratos EFI...</span>
            </div>
          ) : extratoFiltered.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">Nenhum lançamento no período selecionado</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Ajuste as datas e clique em Consultar
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-2">
              {extratoFiltered.map((item) => {
                const isEntrada = item.direction === 'entrada';
                return (
                  <Card
                    key={item.id}
                    className="p-4 cursor-pointer transition-colors hover:bg-muted/40"
                    onClick={() => setSelectedExtratoItem(item)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                            isEntrada
                              ? 'bg-green-50 dark:bg-green-900/20'
                              : 'bg-red-50 dark:bg-red-900/20'
                          }`}
                        >
                          {isEntrada ? (
                            <ArrowDownLeft className="h-5 w-5 text-green-600 dark:text-green-400" />
                          ) : (
                            <ArrowUpRight className="h-5 w-5 text-red-600 dark:text-red-400" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-sm">
                            {isEntrada ? 'Pix Recebido' : 'Pix Enviado'}
                            {item.nome ? ` — ${item.nome}` : ''}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {item.horario ? formatDate(item.horario) : '—'}
                            {item.e2eId ? ` · ${item.e2eId.slice(0, 20)}...` : ''}
                          </p>
                          {item.descricao && (
                            <p className="text-xs text-muted-foreground mt-0.5">{item.descricao}</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p
                          className={`font-semibold ${
                            isEntrada
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {isEntrada ? '+' : '-'} {formatCurrency(item.valor)}
                        </p>
                        <Badge
                          className={
                            isEntrada
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                          }
                        >
                          {isEntrada ? 'Entrada' : 'Saída'}
                        </Badge>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

      </Tabs>

      {/* ── Dialog: Nova Cobrança ──────────────────────── */}
      <Dialog open={showNovaCobranca} onOpenChange={(open) => { setShowNovaCobranca(open); if (!open) resetNovaCobForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Cobrança Pix — EFI Bank</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* 1. Selecionar Cliente */}
            <div>
              <Label>Cliente</Label>
              <Select
                value={novaCobrancaClienteId}
                onValueChange={(v) => {
                  setNovaCobrancaClienteId(v);
                  setNovaCobrancaParcelaId('');
                  setNovaCobrancaValorAjustado('');
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clientes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome} — {c.cpf || c.telefone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 2. Selecionar Parcela */}
            {novaCobrancaClienteId && (
              <div>
                <Label>Parcela a cobrar</Label>
                {parcelasDoCliente.length === 0 ? (
                  <p className="text-sm text-muted-foreground mt-1">
                    Nenhuma parcela pendente/vencida para este cliente.
                  </p>
                ) : (
                  <Select
                    value={novaCobrancaParcelaId}
                    onValueChange={(v) => {
                      setNovaCobrancaParcelaId(v);
                      setNovaCobrancaValorAjustado('');
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar parcela" />
                    </SelectTrigger>
                    <SelectContent>
                      {parcelasDoCliente.map((p) => {
                        const total = parcelaTotal(p);
                        const hasCharge = chargesAtivas.has(p.id);
                        return (
                          <SelectItem key={p.id} value={p.id} disabled={hasCharge}>
                            Parcela {p.numero} — {formatCurrency(total)} — Venc: {new Date(p.dataVencimento).toLocaleDateString('pt-BR')}
                            {p.status === 'vencida' ? ' ⚠️ Vencida' : ''}
                            {hasCharge ? ' (cobrança ativa)' : ''}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {/* 3. Valor calculado + juros breakdown */}
            {parcelaSelecionada && (
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Valor original:</span>
                  <span>{formatCurrency(parcelaSelecionada.valorOriginal)}</span>
                </div>
                {parcelaSelecionada.status === 'vencida' && (() => {
                  const corr = valorCorrigido(
                    parcelaSelecionada.valorOriginal,
                    parcelaSelecionada.dataVencimento,
                    parcelaSelecionada.juros,
                    parcelaSelecionada.multa,
                    parcelaSelecionada.desconto,
                  );
                  return corr.juros > 0 ? (
                    <div className="flex justify-between text-sm text-red-600 dark:text-red-400">
                      <span>Juros/multa atraso:</span>
                      <span>+ {formatCurrency(corr.juros)}</span>
                    </div>
                  ) : null;
                })()}
                <div className="flex justify-between text-sm font-semibold border-t pt-2">
                  <span>Valor calculado:</span>
                  <span>{formatCurrency(valorCalculado)}</span>
                </div>
              </div>
            )}

            {/* 4. Ajustar valor manualmente */}
            {parcelaSelecionada && (
              <div>
                <Label>Ajustar valor manualmente (opcional)</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder={formatCurrency(valorCalculado)}
                  value={novaCobrancaValorAjustado}
                  onChange={(e) => setNovaCobrancaValorAjustado(e.target.value)}
                />
                {novaCobrancaValorAjustado && parseFloat(novaCobrancaValorAjustado) !== valorCalculado && (
                  <p className="text-xs text-amber-600 mt-1">
                    Valor ajustado: {formatCurrency(parseFloat(novaCobrancaValorAjustado))} (calculado era {formatCurrency(valorCalculado)})
                  </p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setShowNovaCobranca(false); resetNovaCobForm(); }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCriarCobranca}
              disabled={criandoCobranca || !novaCobrancaParcelaId}
            >
              {criandoCobranca ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Gerar e Enviar Cobrança
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Detalhes do Item do Extrato ──────── */}
      <Dialog open={!!selectedExtratoItem} onOpenChange={() => setSelectedExtratoItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedExtratoItem?.direction === 'entrada' ? (
                <ArrowDownLeft className="h-5 w-5 text-green-600 dark:text-green-400" />
              ) : (
                <ArrowUpRight className="h-5 w-5 text-red-600 dark:text-red-400" />
              )}
              Detalhes do Lançamento
            </DialogTitle>
          </DialogHeader>
          {selectedExtratoItem && (() => {
            const item = selectedExtratoItem;
            const isEntrada = item.direction === 'entrada';
            // Tenta vincular saída com empréstimo (match por pixKey + valor)
            const empVinculado = !isEntrada
              ? emprestimosAprovados.find(
                  (e) =>
                    e.pixKey &&
                    normalizePixKey(e.pixKey) === normalizePixKey(item.descricao) &&
                    Math.abs(e.valor - item.valor) < 0.01,
                )
              : null;
            // Para entrada, tenta achar cobrança EFI completed com mesmo txid/e2eId
            const cobrVinculada = isEntrada
              ? cobrancas.find(
                  (c) =>
                    c.gateway === 'efi' &&
                    c.status === 'COMPLETED' &&
                    (c.wooviChargeId === item.descricao ||
                      c.wooviChargeId === item.e2eId ||
                      (c as any).e2eId === item.e2eId),
                )
              : null;
            return (
              <div className="space-y-4">
                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-center gap-2 mb-1">
                    {isEntrada ? (
                      <ArrowDownLeft className="h-4 w-4 text-green-600" />
                    ) : (
                      <ArrowUpRight className="h-4 w-4 text-red-600" />
                    )}
                    <span className="text-sm font-semibold">
                      {isEntrada ? 'Pix Recebido' : 'Pix Enviado'}
                    </span>
                    <Badge
                      className={`ml-auto ${
                        isEntrada
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                      }`}
                    >
                      {isEntrada ? 'Entrada' : 'Saída'}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5 text-sm">
                    <span className="text-muted-foreground">Valor:</span>
                    <span
                      className={`font-semibold ${
                        isEntrada
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {isEntrada ? '+' : '-'} {formatCurrency(item.valor)}
                    </span>
                    <span className="text-muted-foreground">Data/Hora:</span>
                    <span>{item.horario ? formatDate(item.horario) : '—'}</span>
                    <span className="text-muted-foreground">
                      {isEntrada ? 'Pagador:' : 'Favorecido:'}
                    </span>
                    <span className="font-medium">{item.nome || '—'}</span>
                    <span className="text-muted-foreground">
                      {isEntrada ? 'TxID:' : 'Chave PIX:'}
                    </span>
                    <span className="font-mono text-xs break-all">{item.descricao || '—'}</span>
                    <span className="text-muted-foreground">End-to-End:</span>
                    <span className="font-mono text-xs break-all">{item.e2eId || '—'}</span>
                    <span className="text-muted-foreground">Status:</span>
                    <span className="text-xs uppercase">{item.status || '—'}</span>
                  </div>
                  {(item.descricao || item.e2eId) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full mt-2"
                      onClick={() => {
                        navigator.clipboard.writeText(item.e2eId || item.descricao);
                        toast.success('ID copiado!');
                      }}
                    >
                      <Copy className="w-3 h-3 mr-2" />
                      Copiar End-to-End ID
                    </Button>
                  )}
                </div>

                {empVinculado && (
                  <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4 space-y-2">
                    <div className="flex items-center gap-2 mb-1">
                      <Banknote className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-semibold">Empréstimo vinculado</span>
                      <Badge
                        className={`ml-auto text-xs ${
                          empVinculado.desembolsado
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                        }`}
                      >
                        {empVinculado.desembolsado ? 'desembolsado' : 'aguardando'}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1 text-sm">
                      <span className="text-muted-foreground">Cliente:</span>
                      <span className="font-medium">{empVinculado.clienteNome}</span>
                      <span className="text-muted-foreground">Valor:</span>
                      <span>{formatCurrency(empVinculado.valor)}</span>
                      <span className="text-muted-foreground">Contrato:</span>
                      <span>
                        {new Date(empVinculado.dataContrato).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                  </div>
                )}

                {/* ── Vincular saída manualmente a um empréstimo ── */}
                {!isEntrada && !empVinculado && isAdminGerencia && controleDesembolsoAtivo && (() => {
                  const buscaNorm = vincularBusca.trim().toLowerCase();
                  const candidatos = aguardandoEnvio
                    .map((e) => ({
                      emp: e,
                      diff: Math.abs(e.valor - item.valor),
                      sameKey:
                        !!e.pixKey && normalizePixKey(e.pixKey) === normalizePixKey(item.descricao),
                    }))
                    .filter(({ emp, sameKey, diff }) => {
                      if (buscaNorm) {
                        return (
                          (emp.clienteNome || '').toLowerCase().includes(buscaNorm) ||
                          (emp.clienteCpf || '').toLowerCase().includes(buscaNorm) ||
                          (emp.pixKey || '').toLowerCase().includes(buscaNorm)
                        );
                      }
                      // Sem busca: sugere apenas com valor próximo (±R$10) ou mesma chave
                      return sameKey || diff <= 10;
                    })
                    .sort((a, b) => {
                      if (a.sameKey !== b.sameKey) return a.sameKey ? -1 : 1;
                      return a.diff - b.diff;
                    })
                    .slice(0, 30);

                  return (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Link2 className="h-4 w-4 text-amber-600" />
                        <span className="text-sm font-semibold">Vincular a um empréstimo</span>
                        <Badge variant="outline" className="ml-auto text-[10px]">
                          {aguardandoEnvio.length} aguardando
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Não houve match automático. Escolha um empréstimo abaixo para confirmar este Pix como o desembolso dele.
                      </p>
                      <Input
                        placeholder="Buscar por nome, CPF ou chave PIX..."
                        value={vincularBusca}
                        onChange={(ev) => setVincularBusca(ev.target.value)}
                        className="h-8 text-sm"
                      />
                      <div className="max-h-64 overflow-y-auto rounded border bg-background/60 divide-y">
                        {candidatos.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-4">
                            {buscaNorm
                              ? 'Nenhum empréstimo encontrado.'
                              : 'Nenhum candidato com valor próximo. Use a busca acima.'}
                          </p>
                        ) : (
                          candidatos.map(({ emp, diff, sameKey }) => (
                            <div
                              key={emp.id}
                              className="flex items-center justify-between gap-2 p-2 text-xs hover:bg-muted/40"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-medium truncate">{emp.clienteNome}</span>
                                  {sameKey && (
                                    <Badge className="h-4 text-[9px] px-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                      mesma chave
                                    </Badge>
                                  )}
                                  {diff < 0.01 && (
                                    <Badge className="h-4 text-[9px] px-1 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                                      mesmo valor
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-muted-foreground truncate">
                                  {formatCurrency(emp.valor)}
                                  {diff >= 0.01 && (
                                    <span className="text-amber-600 dark:text-amber-400 ml-1">
                                      (Δ {formatCurrency(diff)})
                                    </span>
                                  )}
                                  {emp.pixKey && (
                                    <span className="ml-2 font-mono">· {emp.pixKey}</span>
                                  )}
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px]"
                                disabled={markingDesembolso === emp.id}
                                onClick={async () => {
                                  // Marca como já processado para não disparar auto-confirm de novo
                                  autoConfirmedRef.current.add(emp.id);
                                  await handleMarcarDesembolsado(emp.id);
                                  setSelectedExtratoItem(null);
                                }}
                              >
                                {markingDesembolso === emp.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <>
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    Vincular
                                  </>
                                )}
                              </Button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })()}

                {cobrVinculada && (
                  <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4 space-y-2">
                    <div className="flex items-center gap-2 mb-1">
                      <QrCode className="h-4 w-4 text-orange-500" />
                      <span className="text-sm font-semibold">Cobrança vinculada</span>
                      <Badge className="ml-auto bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                        Paga
                      </Badge>
                    </div>
                    <div className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1 text-sm">
                      <span className="text-muted-foreground">Cliente:</span>
                      <span className="font-medium">{cobrVinculada.clienteNome || '—'}</span>
                      <span className="text-muted-foreground">Valor:</span>
                      <span>{formatCurrency(cobrVinculada.valor)}</span>
                      <span className="text-muted-foreground">Emitida em:</span>
                      <span>{formatDate(cobrVinculada.createdAt)}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full mt-1"
                      onClick={() => {
                        setSelectedExtratoItem(null);
                        setSelectedChargeDetail(cobrVinculada);
                      }}
                    >
                      <Eye className="w-3 h-3 mr-2" />
                      Ver detalhes da cobrança
                    </Button>
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Detalhes da Cobrança ─────────────── */}
      <Dialog open={!!selectedChargeDetail} onOpenChange={() => setSelectedChargeDetail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-orange-500" />
              Detalhes da Cobrança
            </DialogTitle>
          </DialogHeader>
          {selectedChargeDetail && (() => {
            const charge = selectedChargeDetail;
            const cfg = chargeStatusConfig[charge.status] || chargeStatusConfig.ERROR;
            const parcela = charge.parcelaId
              ? allParcelas.find((p) => p.id === charge.parcelaId)
              : null;
            const emprestimo = charge.emprestimoId
              ? emprestimos.find((e) => e.id === charge.emprestimoId)
              : parcela?.emprestimoId
              ? emprestimos.find((e) => e.id === parcela.emprestimoId)
              : null;
            const corr = parcela
              ? valorCorrigido(parcela.valorOriginal, parcela.dataVencimento, parcela.juros, parcela.multa, parcela.desconto)
              : null;
            return (
              <div className="space-y-4">
                {/* ── Cobrança ── */}
                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-center gap-2 mb-1">
                    <QrCode className="h-4 w-4 text-orange-500" />
                    <span className="text-sm font-semibold">Cobrança Pix</span>
                    <Badge className={`ml-auto ${cfg.className}`}>{cfg.label}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <span className="text-muted-foreground">Cliente:</span>
                    <span className="font-medium">{charge.clienteNome || '—'}</span>
                    <span className="text-muted-foreground">Valor:</span>
                    <span className="font-semibold text-orange-600 dark:text-orange-400">{formatCurrency(charge.valor)}</span>
                    <span className="text-muted-foreground">Emitida em:</span>
                    <span>{formatDate(charge.createdAt)}</span>
                    {charge.paidAt && (
                      <>
                        <span className="text-muted-foreground">Pago em:</span>
                        <span className="text-green-600 dark:text-green-400">{formatDate(charge.paidAt)}</span>
                      </>
                    )}
                    {charge.expirationDate && charge.status === 'ACTIVE' && (
                      <>
                        <span className="text-muted-foreground">Expira em:</span>
                        <span className="text-amber-600 dark:text-amber-400">{formatDate(charge.expirationDate)}</span>
                      </>
                    )}
                    <span className="text-muted-foreground">ID:</span>
                    <span className="font-mono text-xs text-muted-foreground truncate">{charge.wooviChargeId}</span>
                    <span className="text-muted-foreground">Gateway:</span>
                    <span className="uppercase text-xs">{charge.gateway}</span>
                  </div>
                  {charge.status === 'ACTIVE' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full mt-2"
                      onClick={() => { setSelectedChargeDetail(null); setSelectedCharge(charge); }}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Ver QR Code
                    </Button>
                  )}
                </div>

                {/* ── Parcela ── */}
                {parcela ? (
                  <div className="rounded-lg border p-4 space-y-2">
                    <div className="flex items-center gap-2 mb-1">
                      <CreditCard className="h-4 w-4 text-blue-500" />
                      <span className="text-sm font-semibold">Parcela #{parcela.numero}</span>
                      <Badge
                        className={`ml-auto text-xs ${
                          parcela.status === 'paga'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                            : parcela.status === 'vencida'
                            ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                        }`}
                      >
                        {parcela.status}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                      <span className="text-muted-foreground">Valor original:</span>
                      <span>{formatCurrency(parcela.valorOriginal)}</span>
                      <span className="text-muted-foreground">Vencimento:</span>
                      <span>{new Date(parcela.dataVencimento).toLocaleDateString('pt-BR')}</span>
                      {corr && corr.juros > 0 && (
                        <>
                          <span className="text-muted-foreground">Juros/multa:</span>
                          <span className="text-red-600 dark:text-red-400">+ {formatCurrency(corr.juros)}</span>
                          <span className="text-muted-foreground font-semibold">Total corrigido:</span>
                          <span className="font-semibold">{formatCurrency(corr.total)}</span>
                        </>
                      )}
                      {parcela.dataPagamento && (
                        <>
                          <span className="text-muted-foreground">Pago em:</span>
                          <span className="text-green-600 dark:text-green-400">{new Date(parcela.dataPagamento).toLocaleDateString('pt-BR')}</span>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed p-3 text-center">
                    <p className="text-xs text-muted-foreground">Cobrança sem parcela vinculada</p>
                  </div>
                )}

                {/* ── Empréstimo ── */}
                {emprestimo ? (
                  <div className="rounded-lg border p-4 space-y-2">
                    <div className="flex items-center gap-2 mb-1">
                      <Banknote className="h-4 w-4 text-green-500" />
                      <span className="text-sm font-semibold">Empréstimo</span>
                      <Badge
                        className={`ml-auto text-xs ${
                          emprestimo.status === 'ativo'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                            : emprestimo.status === 'inadimplente'
                            ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                            : emprestimo.status === 'quitado'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
                        }`}
                      >
                        {emprestimo.status}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                      <span className="text-muted-foreground">Valor total:</span>
                      <span className="font-semibold">{formatCurrency(emprestimo.valor)}</span>
                      <span className="text-muted-foreground">Parcelas:</span>
                      <span>{emprestimo.parcelasPagas}/{emprestimo.parcelas} pagas</span>
                      <span className="text-muted-foreground">Valor parcela:</span>
                      <span>{formatCurrency(emprestimo.valorParcela)}</span>
                      <span className="text-muted-foreground">Taxa de juros:</span>
                      <span>{emprestimo.taxaJuros}% {emprestimo.tipoJuros === 'mensal' ? 'a.m.' : emprestimo.tipoJuros === 'semanal' ? 'a.s.' : 'a.d.'}</span>
                      <span className="text-muted-foreground">Contrato:</span>
                      <span>{new Date(emprestimo.dataContrato).toLocaleDateString('pt-BR')}</span>
                      <span className="text-muted-foreground">Próx. vencimento:</span>
                      <span>{new Date(emprestimo.proximoVencimento).toLocaleDateString('pt-BR')}</span>
                    </div>
                    {/* Barra de progresso das parcelas */}
                    <div className="mt-2">
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>Progresso</span>
                        <span>{Math.round((emprestimo.parcelasPagas / emprestimo.parcelas) * 100)}%</span>
                      </div>
                      <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full transition-all"
                          style={{ width: `${Math.round((emprestimo.parcelasPagas / emprestimo.parcelas) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ) : charge.emprestimoId ? (
                  <div className="rounded-lg border border-dashed p-3 text-center">
                    <p className="text-xs text-muted-foreground">Empréstimo não encontrado localmente</p>
                  </div>
                ) : null}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Ver QR Code da Cobrança ───────────── */}
      <Dialog
        open={!!selectedCharge}
        onOpenChange={() => setSelectedCharge(null)}
      >
        <DialogContent className="max-w-sm">
          {selectedCharge && (
            <PixQRCode
              brCode={selectedCharge.brCode}
              qrCodeImage={selectedCharge.qrCodeImage}
              paymentLink={selectedCharge.paymentLink}
              valor={selectedCharge.valor}
              expirationDate={selectedCharge.expirationDate}
              status={selectedCharge.status}
              descricao={selectedCharge.clienteNome}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
