/**
 * @module PagamentosWooviPage
 * @description Página principal de gestão de pagamentos Woovi (OpenPix).
 * Exibe saldo, cobranças, transações e subcontas com ações integradas.
 */
import { useState } from 'react';
import {
  Wallet,
  QrCode,
  ArrowUpRight,
  ArrowDownLeft,
  Users,
  Plus,
  Search,
  RefreshCw,
  Eye,
  Trash2,
  ExternalLink,
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
import { WooviSaldoCard } from '../components/WooviSaldoCard';
import { PixQRCode } from '../components/PixQRCode';
import {
  useCobrancasWoovi,
  useTransacoesWoovi,
  useSubcontasWoovi,
  useCriarCobrancaWoovi,
  useCancelarCobrancaWoovi,
  useCriarSubcontaWoovi,
} from '../hooks/useWoovi';
import { useClientes } from '../hooks/useClientes';
import { toast } from 'sonner';

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

export default function PagamentosWooviPage() {
  const [busca, setBusca] = useState('');
  const [chargeStatusFilter, setChargeStatusFilter] = useState<string>('');
  const [showNovaCobranca, setShowNovaCobranca] = useState(false);
  const [showNovaSubconta, setShowNovaSubconta] = useState(false);
  const [selectedCharge, setSelectedCharge] = useState<any>(null);

  // Form state — nova cobrança
  const [novaCobrancaClienteId, setNovaCobrancaClienteId] = useState('');
  const [novaCobrancaValor, setNovaCobrancaValor] = useState('');
  const [novaCobrancaDescricao, setNovaCobrancaDescricao] = useState('');

  // Form state — nova subconta
  const [novaSubNome, setNovaSubNome] = useState('');
  const [novaSubDocumento, setNovaSubDocumento] = useState('');
  const [novaSubPixKey, setNovaSubPixKey] = useState('');
  const [novaSubClienteId, setNovaSubClienteId] = useState('');

  // Hooks
  const { data: cobrancas = [], isLoading: loadingCharges } = useCobrancasWoovi(chargeStatusFilter || undefined);
  const { data: transacoes = [], isLoading: loadingTx } = useTransacoesWoovi();
  const { data: subcontas = [], isLoading: loadingSub } = useSubcontasWoovi();
  const { data: clientes = [] } = useClientes();

  const criarCobranca = useCriarCobrancaWoovi();
  const cancelarCobranca = useCancelarCobrancaWoovi();
  const criarSubconta = useCriarSubcontaWoovi();

  // Filtro de busca
  const filteredCharges = cobrancas.filter(
    (c) =>
      c.clienteNome.toLowerCase().includes(busca.toLowerCase()) ||
      c.wooviChargeId.toLowerCase().includes(busca.toLowerCase())
  );

  const filteredTx = transacoes.filter(
    (t) =>
      (t.descricao || '').toLowerCase().includes(busca.toLowerCase()) ||
      (t.destinatarioNome || '').toLowerCase().includes(busca.toLowerCase())
  );

  const handleCriarCobranca = async () => {
    if (!novaCobrancaClienteId || !novaCobrancaValor) {
      toast.error('Preencha cliente e valor');
      return;
    }

    const cliente = clientes.find((c) => c.id === novaCobrancaClienteId);
    try {
      await criarCobranca.mutateAsync({
        cliente_id: novaCobrancaClienteId,
        valor: parseFloat(novaCobrancaValor),
        descricao: novaCobrancaDescricao || undefined,
        cliente_nome: cliente?.nome,
        cliente_cpf: cliente?.cpf,
      });
      toast.success('Cobrança criada com sucesso!');
      setShowNovaCobranca(false);
      setNovaCobrancaClienteId('');
      setNovaCobrancaValor('');
      setNovaCobrancaDescricao('');
    } catch (err) {
      toast.error(`Erro ao criar cobrança: ${(err as Error).message}`);
    }
  };

  const handleCriarSubconta = async () => {
    if (!novaSubClienteId || !novaSubNome) {
      toast.error('Preencha cliente e nome');
      return;
    }

    try {
      await criarSubconta.mutateAsync({
        cliente_id: novaSubClienteId,
        nome: novaSubNome,
        documento: novaSubDocumento || undefined,
        pix_key: novaSubPixKey || undefined,
      });
      toast.success('Subconta criada com sucesso!');
      setShowNovaSubconta(false);
      setNovaSubNome('');
      setNovaSubDocumento('');
      setNovaSubPixKey('');
      setNovaSubClienteId('');
    } catch (err) {
      toast.error(`Erro ao criar subconta: ${(err as Error).message}`);
    }
  };

  const handleCancelarCobranca = async (chargeId: string) => {
    try {
      await cancelarCobranca.mutateAsync(chargeId);
      toast.success('Cobrança cancelada');
    } catch (err) {
      toast.error(`Erro: ${(err as Error).message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pagamentos Woovi</h1>
          <p className="text-sm text-muted-foreground">
            Gestão de cobranças Pix, pagamentos e subcontas
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowNovaCobranca(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nova Cobrança
          </Button>
        </div>
      </div>

      {/* Saldo Card */}
      <div className="grid gap-4 md:grid-cols-3">
        <WooviSaldoCard />

        {/* KPIs rápidos */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <ArrowDownLeft className="h-4 w-4 text-green-500" />
              Cobranças
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{cobrancas.length}</p>
            <div className="mt-2 flex gap-2 text-xs">
              <span className="text-amber-600 dark:text-amber-400">
                {cobrancas.filter((c) => c.status === 'ACTIVE').length} ativas
              </span>
              <span className="text-green-600 dark:text-green-400">
                {cobrancas.filter((c) => c.status === 'COMPLETED').length} pagas
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Users className="h-4 w-4 text-purple-500" />
              Subcontas Indicadores
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{subcontas.length}</p>
            <div className="mt-2 text-xs text-muted-foreground">
              Saldo total:{' '}
              {formatCurrency(subcontas.reduce((sum, s) => sum + s.saldo, 0))}
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
          </TabsTrigger>
          <TabsTrigger value="transacoes" className="flex items-center gap-2">
            <ArrowUpRight className="h-4 w-4" />
            Transações
          </TabsTrigger>
          <TabsTrigger value="subcontas" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Subcontas
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
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
                          <QrCode className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
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
                          {charge.status === 'ACTIVE' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-500"
                              onClick={() => handleCancelarCobranca(charge.wooviChargeId)}
                              title="Cancelar"
                            >
                              <Trash2 className="h-4 w-4" />
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

        {/* ── Tab: Subcontas ────────────────────────────── */}
        <TabsContent value="subcontas" className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setShowNovaSubconta(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Nova Subconta
            </Button>
          </div>

          {loadingSub ? (
            <p className="text-muted-foreground text-sm">Carregando...</p>
          ) : subcontas.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">
                  Nenhuma subconta cadastrada
                </p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => setShowNovaSubconta(true)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Criar primeira subconta
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {subcontas.map((sub) => (
                <Card key={sub.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{sub.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {sub.clienteNome} · {sub.documento || 'Sem CPF'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(sub.saldo)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Total recebido: {formatCurrency(sub.totalRecebido)}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Dialog: Nova Cobrança ──────────────────────── */}
      <Dialog open={showNovaCobranca} onOpenChange={setShowNovaCobranca}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Cobrança Pix</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Cliente</Label>
              <Select
                value={novaCobrancaClienteId}
                onValueChange={setNovaCobrancaClienteId}
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
            <div>
              <Label>Valor (R$)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0,00"
                value={novaCobrancaValor}
                onChange={(e) => setNovaCobrancaValor(e.target.value)}
              />
            </div>
            <div>
              <Label>Descrição (opcional)</Label>
              <Input
                placeholder="Ex: Parcela 3/12"
                value={novaCobrancaDescricao}
                onChange={(e) => setNovaCobrancaDescricao(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowNovaCobranca(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCriarCobranca}
              disabled={criarCobranca.isPending}
            >
              {criarCobranca.isPending ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <QrCode className="mr-2 h-4 w-4" />
              )}
              Gerar Cobrança
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Nova Subconta ──────────────────────── */}
      <Dialog open={showNovaSubconta} onOpenChange={setShowNovaSubconta}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Subconta Indicador</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Cliente (indicador)</Label>
              <Select
                value={novaSubClienteId}
                onValueChange={setNovaSubClienteId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clientes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nome da subconta</Label>
              <Input
                placeholder="Nome do indicador"
                value={novaSubNome}
                onChange={(e) => setNovaSubNome(e.target.value)}
              />
            </div>
            <div>
              <Label>CPF/CNPJ</Label>
              <Input
                placeholder="000.000.000-00"
                value={novaSubDocumento}
                onChange={(e) => setNovaSubDocumento(e.target.value)}
              />
            </div>
            <div>
              <Label>Chave Pix (opcional)</Label>
              <Input
                placeholder="Chave Pix para saques"
                value={novaSubPixKey}
                onChange={(e) => setNovaSubPixKey(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowNovaSubconta(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCriarSubconta}
              disabled={criarSubconta.isPending}
            >
              {criarSubconta.isPending ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Users className="mr-2 h-4 w-4" />
              )}
              Criar Subconta
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
