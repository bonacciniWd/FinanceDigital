/**
 * @module GastosInternosPage
 * @description Configuração de gastos internos (admin only).
 *  - Cadastro de categorias com nome + termo (palavra-chave para casar com saídas do extrato)
 *  - Configuração de gateways de pagamento (EFI/Woovi)
 *  - Listagem de gastos internos detectados automaticamente
 *
 * @route /configuracoes/gastos-internos
 * @access Protegido — somente admin / gerencia
 */
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '../components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { Switch } from '../components/ui/switch';
import {
  Tags,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Wallet,
  KeyRound,
  CheckCircle,
  AlertCircle,
  Copy,
  Upload,
  Receipt,
  Play,
} from 'lucide-react';
import { toast } from 'sonner';
import { useGateways } from '../hooks/useComissoes';
import { supabase, supabaseUrl, supabaseAnonKey } from '../lib/supabase';
import type { GatewayPagamentoView } from '../lib/view-types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

interface CategoriaGasto {
  id: string;
  nome: string;
  termo: string;
  cor: string | null;
  ativo: boolean;
  observacao: string | null;
  created_at: string;
}

interface GastoInterno {
  id: string;
  categoria_id: string;
  e2e_id: string | null;
  valor: number;
  horario: string;
  chave_favorecido: string | null;
  nome_favorecido: string | null;
  descricao: string | null;
  match_origem: 'auto' | 'manual';
  categoria?: { nome: string; cor: string | null } | null;
}

export default function GastosInternosPage() {
  const qc = useQueryClient();
  const { data: gateways = [], isLoading: loadingGateways } = useGateways();

  // ── Categorias ───────────────────────────
  const [categorias, setCategorias] = useState<CategoriaGasto[]>([]);
  const [loadingCats, setLoadingCats] = useState(true);
  const [showCatDialog, setShowCatDialog] = useState(false);
  const [editCat, setEditCat] = useState<CategoriaGasto | null>(null);
  const [catForm, setCatForm] = useState({
    nome: '',
    termo: '',
    cor: '#f97316',
    ativo: true,
    observacao: '',
  });

  // ── Gastos detectados ───────────────────────
  const [gastos, setGastos] = useState<GastoInterno[]>([]);
  const [loadingGastos, setLoadingGastos] = useState(true);

  // ── Cron manual ─────────────────────────────
  const [runningCron, setRunningCron] = useState(false);

  async function carregarCategorias() {
    setLoadingCats(true);
    const { data, error } = await supabase
      .from('categorias_gastos')
      .select('*')
      .order('nome', { ascending: true });
    if (error) toast.error('Erro ao carregar categorias: ' + error.message);
    else setCategorias((data as CategoriaGasto[]) || []);
    setLoadingCats(false);
  }

  async function carregarGastos() {
    setLoadingGastos(true);
    const { data, error } = await supabase
      .from('gastos_internos')
      .select('*, categoria:categorias_gastos(nome, cor)')
      .order('horario', { ascending: false })
      .limit(100);
    if (error) toast.error('Erro ao carregar gastos: ' + error.message);
    else setGastos((data as unknown as GastoInterno[]) || []);
    setLoadingGastos(false);
  }

  useEffect(() => {
    carregarCategorias();
    carregarGastos();
  }, []);

  function openCreateCat() {
    setEditCat(null);
    setCatForm({ nome: '', termo: '', cor: '#f97316', ativo: true, observacao: '' });
    setShowCatDialog(true);
  }

  function openEditCat(c: CategoriaGasto) {
    setEditCat(c);
    setCatForm({
      nome: c.nome,
      termo: c.termo,
      cor: c.cor || '#f97316',
      ativo: c.ativo,
      observacao: c.observacao || '',
    });
    setShowCatDialog(true);
  }

  async function saveCat() {
    if (!catForm.nome.trim() || !catForm.termo.trim()) {
      toast.error('Nome e termo são obrigatórios');
      return;
    }
    const payload = {
      nome: catForm.nome.trim(),
      termo: catForm.termo.trim(),
      cor: catForm.cor,
      ativo: catForm.ativo,
      observacao: catForm.observacao.trim() || null,
    };
    if (editCat) {
      const { error } = await supabase
        .from('categorias_gastos')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', editCat.id);
      if (error) return toast.error('Erro: ' + error.message);
      toast.success('Categoria atualizada');
    } else {
      const { error } = await supabase.from('categorias_gastos').insert(payload);
      if (error) return toast.error('Erro: ' + error.message);
      toast.success('Categoria criada');
    }
    setShowCatDialog(false);
    carregarCategorias();
  }

  async function removeCat(id: string) {
    if (!confirm('Remover esta categoria? Gastos já vinculados a ela serão preservados.')) return;
    const { error } = await supabase.from('categorias_gastos').delete().eq('id', id);
    if (error) {
      if (error.message.includes('foreign')) {
        toast.error('Não é possível remover: existem gastos vinculados. Desative em vez de remover.');
      } else {
        toast.error('Erro: ' + error.message);
      }
      return;
    }
    toast.success('Categoria removida');
    carregarCategorias();
  }

  async function toggleCatAtivo(c: CategoriaGasto) {
    const { error } = await supabase
      .from('categorias_gastos')
      .update({ ativo: !c.ativo, updated_at: new Date().toISOString() })
      .eq('id', c.id);
    if (error) return toast.error('Erro: ' + error.message);
    carregarCategorias();
  }

  // ── Cron manual: dispara edge function ─────
  async function rodarCronManual() {
    setRunningCron(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) throw new Error('Sessão expirada');
      const resp = await fetch(`${supabaseUrl}/functions/v1/cron-saidas-orfas?hours=72`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: supabaseAnonKey,
        },
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) throw new Error(data.error || `HTTP ${resp.status}`);
      toast.success(
        `Cron executado: ${data.fetched} saídas analisadas · ${data.desembolso_auto} desembolsos · ${data.gasto_auto} gastos · ${data.orfas_inseridas} órfãs`,
        { duration: 8000 },
      );
      carregarGastos();
    } catch (err: unknown) {
      toast.error('Erro: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setRunningCron(false);
    }
  }

  // ── Gateways (mantido) ─────────────────
  const [showGatewayConfig, setShowGatewayConfig] = useState(false);
  const [configGateway, setConfigGateway] = useState<GatewayPagamentoView | null>(null);
  const [gwConfig, setGwConfig] = useState({
    client_id: '',
    client_secret: '',
    pix_key: '',
    cert_pem: '',
    key_pem: '',
    sandbox: false,
  });
  const [savingGw, setSavingGw] = useState(false);

  async function patchGateway(id: string, updates: Record<string, unknown>) {
    const session = (await supabase.auth.getSession()).data.session;
    if (!session) throw new Error('Sessão expirada. Faça login novamente.');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    const resp = await fetch(`${supabaseUrl}/rest/v1/gateways_pagamento?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${session.access_token}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(updates),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Erro ${resp.status}: ${text}`);
    }
    qc.invalidateQueries({ queryKey: ['gateways-pagamento'] });
  }

  async function handleToggleGateway(gw: GatewayPagamentoView) {
    try {
      await patchGateway(gw.id, { ativo: !gw.ativo });
      toast.success(`Gateway ${gw.label} ${!gw.ativo ? 'ativado' : 'desativado'}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao atualizar gateway');
    }
  }

  function openGatewayConfig(gw: GatewayPagamentoView) {
    setConfigGateway(gw);
    const cfg = (gw.config || {}) as Record<string, unknown>;
    setGwConfig({
      client_id: (cfg.client_id as string) || '',
      client_secret: (cfg.client_secret as string) || '',
      pix_key: (cfg.pix_key as string) || '',
      cert_pem: (cfg.cert_pem as string) || '',
      key_pem: (cfg.key_pem as string) || '',
      sandbox: cfg.sandbox === true,
    });
    setShowGatewayConfig(true);
  }

  async function handleSaveGatewayConfig() {
    if (!configGateway) return;
    if (configGateway.nome === 'efi') {
      if (!gwConfig.client_id.trim() || !gwConfig.client_secret.trim() || !gwConfig.pix_key.trim()) {
        toast.error('Client ID, Client Secret e Chave PIX são obrigatórios');
        return;
      }
      if (!gwConfig.cert_pem.trim() || !gwConfig.key_pem.trim()) {
        toast.error('Certificado PEM e Chave Privada PEM são obrigatórios');
        return;
      }
      if (!gwConfig.cert_pem.trim().includes('-----BEGIN CERTIFICATE-----')) {
        toast.error('O Certificado PEM deve começar com -----BEGIN CERTIFICATE-----');
        return;
      }
      if (!gwConfig.key_pem.trim().includes('-----BEGIN')) {
        toast.error('A Chave Privada PEM deve começar com -----BEGIN PRIVATE KEY-----');
        return;
      }
    }
    setSavingGw(true);
    try {
      await patchGateway(configGateway.id, {
        config: {
          client_id: gwConfig.client_id.trim(),
          client_secret: gwConfig.client_secret.trim(),
          pix_key: gwConfig.pix_key.trim(),
          cert_pem: gwConfig.cert_pem.trim(),
          key_pem: gwConfig.key_pem.trim(),
          sandbox: gwConfig.sandbox,
        },
      });
      toast.success(`Credenciais do ${configGateway.label} salvas com sucesso`);
      setShowGatewayConfig(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('AbortError')) toast.error('Timeout (15s). Verifique sua conexão.');
      else toast.error(msg);
    } finally {
      setSavingGw(false);
    }
  }

  function isGatewayConfigured(gw: GatewayPagamentoView): boolean {
    if (gw.nome === 'efi') {
      const cfg = (gw.config || {}) as Record<string, unknown>;
      return !!(cfg.client_id && cfg.client_secret && cfg.pix_key && cfg.cert_pem && cfg.key_pem);
    }
    return Object.keys(gw.config || {}).length > 0;
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast.success('Copiado');
  }

  // ── Totais ─────
  const totais = useMemo(() => {
    const total = gastos.reduce((s, g) => s + Number(g.valor || 0), 0);
    const auto = gastos.filter((g) => g.match_origem === 'auto').length;
    const manual = gastos.filter((g) => g.match_origem === 'manual').length;
    return { total, auto, manual, count: gastos.length };
  }, [gastos]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Receipt className="h-6 w-6" />
            Gastos Internos
          </h1>
          <p className="text-muted-foreground mt-1">
            Cadastre categorias com palavras-chave; o sistema cruza com o extrato PIX e classifica saídas automaticamente.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={rodarCronManual} disabled={runningCron}>
            {runningCron ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Rodar conciliação agora
          </Button>
          <Button onClick={openCreateCat}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Categoria
          </Button>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground mb-1">Total classificado</p>
            <p className="text-xl font-bold text-red-600">{fmtBRL(totais.total)}</p>
            <p className="text-xs text-muted-foreground">{totais.count} gasto(s)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground mb-1">Detectados automaticamente</p>
            <p className="text-xl font-bold">{totais.auto}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground mb-1">Vinculados manualmente</p>
            <p className="text-xl font-bold">{totais.manual}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground mb-1">Categorias ativas</p>
            <p className="text-xl font-bold">{categorias.filter((c) => c.ativo).length} / {categorias.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Categorias */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tags className="h-5 w-5" />
            Categorias de Gastos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingCats ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : categorias.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhuma categoria cadastrada. Crie uma para começar a classificar gastos.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Termo (palavra-chave)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categorias.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block h-3 w-3 rounded-full"
                          style={{ backgroundColor: c.cor || '#f97316' }}
                        />
                        <div>
                          <p className="font-medium">{c.nome}</p>
                          {c.observacao && (
                            <p className="text-xs text-muted-foreground">{c.observacao}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{c.termo}</code>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch checked={c.ativo} onCheckedChange={() => toggleCatAtivo(c)} />
                        <Badge variant={c.ativo ? 'default' : 'secondary'}>
                          {c.ativo ? 'Ativa' : 'Inativa'}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openEditCat(c)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => removeCat(c.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Gastos detectados */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Últimos gastos detectados
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingGastos ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : gastos.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">
              Nenhum gasto detectado ainda. Cadastre categorias e rode a conciliação.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Favorecido</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gastos.slice(0, 50).map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="text-xs">
                      {format(new Date(g.horario), 'dd/MM HH:mm', { locale: ptBR })}
                    </TableCell>
                    <TableCell className="text-sm">
                      <p className="font-medium">{g.nome_favorecido || '—'}</p>
                      {g.chave_favorecido && (
                        <p className="text-xs text-muted-foreground font-mono truncate max-w-xs">
                          {g.chave_favorecido}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        style={{
                          borderColor: g.categoria?.cor || '#f97316',
                          color: g.categoria?.cor || '#f97316',
                        }}
                      >
                        {g.categoria?.nome || '—'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          g.match_origem === 'auto'
                            ? 'bg-green-50 text-green-700 border-green-200'
                            : 'bg-blue-50 text-blue-700 border-blue-200'
                        }
                      >
                        {g.match_origem === 'auto' ? 'Auto' : 'Manual'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-red-600">
                      − {fmtBRL(Number(g.valor))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Gateways */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Gateways de Pagamento
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingGateways ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              {gateways.map((gw) => (
                <div key={gw.id} className="p-4 border rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{gw.label}</p>
                      <p className="text-sm text-muted-foreground">
                        Código: {gw.nome} · Prioridade: {gw.prioridade}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {isGatewayConfigured(gw) ? (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          <CheckCircle className="w-3 h-3 mr-1" /> Configurado
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                          <AlertCircle className="w-3 h-3 mr-1" /> Não configurado
                        </Badge>
                      )}
                      <Badge variant={gw.ativo ? 'default' : 'secondary'}>
                        {gw.ativo ? 'Ativo' : 'Inativo'}
                      </Badge>
                      <Switch checked={gw.ativo} onCheckedChange={() => handleToggleGateway(gw)} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => openGatewayConfig(gw)}>
                      <KeyRound className="h-4 w-4 mr-2" />
                      Configurar Credenciais
                    </Button>
                    {gw.nome === 'efi' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs text-muted-foreground"
                        onClick={() =>
                          copyToClipboard(`${supabaseUrl}/functions/v1/webhook-efi`)
                        }
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copiar URL Webhook
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog Categoria */}
      <Dialog open={showCatDialog} onOpenChange={setShowCatDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editCat ? 'Editar Categoria' : 'Nova Categoria de Gasto'}</DialogTitle>
            <DialogDescription>
              O termo é usado para casar (substring, case-insensitive) com o nome do favorecido ou chave PIX nas saídas do extrato.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input
                placeholder="Ex: Aluguel escritório"
                value={catForm.nome}
                onChange={(e) => setCatForm((f) => ({ ...f, nome: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Termo (palavra-chave) *</Label>
              <Input
                placeholder="Ex: imobiliária xpto"
                value={catForm.termo}
                onChange={(e) => setCatForm((f) => ({ ...f, termo: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Será comparado com <code>nome_favorecido</code> + <code>chave_favorecido</code>.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cor</Label>
                <Input
                  type="color"
                  value={catForm.cor}
                  onChange={(e) => setCatForm((f) => ({ ...f, cor: e.target.value }))}
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <div className="flex items-center gap-2 h-10">
                  <Switch
                    checked={catForm.ativo}
                    onCheckedChange={(v) => setCatForm((f) => ({ ...f, ativo: v }))}
                  />
                  <span className="text-sm">{catForm.ativo ? 'Ativa' : 'Inativa'}</span>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Observação (opcional)</Label>
              <Textarea
                placeholder="Notas internas..."
                value={catForm.observacao}
                onChange={(e) => setCatForm((f) => ({ ...f, observacao: e.target.value }))}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCatDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={saveCat}>{editCat ? 'Salvar' : 'Criar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Gateway */}
      <Dialog open={showGatewayConfig} onOpenChange={setShowGatewayConfig}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              Configurar {configGateway?.label || 'Gateway'}
            </DialogTitle>
            <DialogDescription>
              Insira as credenciais da API para habilitar o gateway de pagamento.
            </DialogDescription>
          </DialogHeader>

          {configGateway?.nome === 'efi' && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Client ID *</Label>
                <Input
                  value={gwConfig.client_id}
                  onChange={(e) => setGwConfig((f) => ({ ...f, client_id: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Client Secret *</Label>
                <Input
                  type="password"
                  value={gwConfig.client_secret}
                  onChange={(e) => setGwConfig((f) => ({ ...f, client_secret: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Chave PIX *</Label>
                <Input
                  value={gwConfig.pix_key}
                  onChange={(e) => setGwConfig((f) => ({ ...f, pix_key: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Certificado PEM *</Label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => document.getElementById('efi-cert-file')?.click()}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {gwConfig.cert_pem ? 'cert.pem carregado ✓' : 'Selecionar arquivo cert.pem'}
                  </Button>
                  <input
                    id="efi-cert-file"
                    type="file"
                    accept=".pem,.crt,.cer"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        setGwConfig((f) => ({ ...f, cert_pem: reader.result as string }));
                        toast.success('Certificado PEM carregado');
                      };
                      reader.readAsText(file);
                      e.target.value = '';
                    }}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Chave Privada PEM *</Label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => document.getElementById('efi-key-file')?.click()}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {gwConfig.key_pem ? 'key.pem carregado ✓' : 'Selecionar arquivo key.pem'}
                  </Button>
                  <input
                    id="efi-key-file"
                    type="file"
                    accept=".pem,.key"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        setGwConfig((f) => ({ ...f, key_pem: reader.result as string }));
                        toast.success('Chave Privada PEM carregada');
                      };
                      reader.readAsText(file);
                      e.target.value = '';
                    }}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/50">
                <Label>Modo Sandbox</Label>
                <Switch
                  checked={gwConfig.sandbox}
                  onCheckedChange={(v) => setGwConfig((f) => ({ ...f, sandbox: v }))}
                />
              </div>
            </div>
          )}

          {configGateway?.nome === 'woovi' && (
            <div className="p-3 border rounded-lg bg-muted/50 text-sm">
              <p>
                O gateway Woovi é configurado via variável de ambiente{' '}
                <code className="text-xs bg-muted px-1 rounded">VITE_WOOVI_APP_ID</code>.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGatewayConfig(false)}>
              Cancelar
            </Button>
            {configGateway?.nome === 'efi' && (
              <Button onClick={handleSaveGatewayConfig} disabled={savingGw}>
                {savingGw && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar Credenciais
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
