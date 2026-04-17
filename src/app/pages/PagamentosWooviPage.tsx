/**
 * @module PagamentosWooviPage
 * @description Página de gestão de pagamentos Pix — EFI Bank.
 * Exibe saldo, cobranças e transações EFI (cron + manuais).
 */
import { useState, useMemo } from 'react';
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
  const enviarWhatsapp = useEnviarWhatsapp();

  const criarCobrancaEfi = useCriarCobrancaEfi();
  const { data: efiBalanceData } = useSaldoEfi();

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
          const msg = `💰 *Cobrança PIX - Parcela ${parcelaSelecionada.numero}*\n\nOlá ${parcelaSelecionada.clienteNome}!\n\nValor: *${formatCurrency(valorFinal)}*\nVencimento: ${new Date(parcelaSelecionada.dataVencimento).toLocaleDateString('pt-BR')}\n\n📱 Copie o código PIX abaixo e cole no app do seu banco:\n\n${brCode}\n\n_FinanceDigital_`;
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
                return (
                  <Card key={charge.id} className="p-4">
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
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="font-semibold">{formatCurrency(charge.valor)}</p>
                          <Badge className={cfg.className}>{cfg.label}</Badge>
                        </div>
                        <div className="flex gap-1">
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
                  <Card key={item.id} className="p-4">
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
                  return corr.jurosValor > 0 ? (
                    <div className="flex justify-between text-sm text-red-600 dark:text-red-400">
                      <span>Juros/multa atraso:</span>
                      <span>+ {formatCurrency(corr.jurosValor)}</span>
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
