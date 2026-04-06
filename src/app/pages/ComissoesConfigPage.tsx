/**
 * @module ComissoesConfigPage
 * @description Página de configuração de comissões por agente (admin only).
 * Permite definir % de venda e % de cobrança para cada agente.
 * 
 * @route /configuracoes/comissoes
 * @access Protegido — somente admin
 */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
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
  Percent,
  UserPlus,
  Pencil,
  Trash2,
  Loader2,
  Settings2,
  Wallet,
  KeyRound,
  CheckCircle,
  AlertCircle,
  Copy,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useAgentesComissoes,
  useCriarAgenteComissao,
  useAtualizarAgenteComissao,
  useRemoverAgenteComissao,
  useGateways,
} from '../hooks/useComissoes';
import { useAdminUsers } from '../hooks/useAdminUsers';
import { supabase, supabaseUrl, supabaseAnonKey } from '../lib/supabase';
import type { AgenteComissaoView, GatewayPagamentoView } from '../lib/view-types';

export default function ComissoesConfigPage() {
  const { data: agentes = [], isLoading: loadingAgentes } = useAgentesComissoes();
  const { data: users = [] } = useAdminUsers();
  const { data: gateways = [], isLoading: loadingGateways } = useGateways();

  const criarMutation = useCriarAgenteComissao();
  const atualizarMutation = useAtualizarAgenteComissao();
  const removerMutation = useRemoverAgenteComissao();
  const qc = useQueryClient();

  /** PATCH direto no Supabase REST — evita bug de .update() travando com JSONB grande */
  async function patchGateway(id: string, updates: Record<string, unknown>) {
    const session = (await supabase.auth.getSession()).data.session;
    if (!session) throw new Error('Sessão expirada. Faça login novamente.');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    const resp = await fetch(`${supabaseUrl}/rest/v1/gateways_pagamento?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${session.access_token}`,
        'Prefer': 'return=minimal',
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

  const [showDialog, setShowDialog] = useState(false);
  const [editItem, setEditItem] = useState<AgenteComissaoView | null>(null);
  const [formData, setFormData] = useState({
    agenteId: '',
    percentualVenda: '0',
    percentualCobranca: '0',
    percentualGerencia: '0',
  });

  // Gateway config dialog
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

  // Agentes que ainda não têm comissão configurada
  const agentesConfigurados = new Set(agentes.map(a => a.agenteId));
  const agentesDisponiveis = users.filter(
    (u: any) => !agentesConfigurados.has(u.id) && ['comercial', 'cobranca', 'gerencia'].includes(u.role)
  );

  function openCreate() {
    setEditItem(null);
    setFormData({ agenteId: '', percentualVenda: '0', percentualCobranca: '0', percentualGerencia: '0' });
    setShowDialog(true);
  }

  function openEdit(a: AgenteComissaoView) {
    setEditItem(a);
    setFormData({
      agenteId: a.agenteId,
      percentualVenda: String(a.percentualVenda),
      percentualCobranca: String(a.percentualCobranca),
      percentualGerencia: String(a.percentualGerencia),
    });
    setShowDialog(true);
  }

  async function handleSave() {
    const pv = parseFloat(formData.percentualVenda);
    const pc = parseFloat(formData.percentualCobranca);
    const pg = parseFloat(formData.percentualGerencia);

    if (isNaN(pv) || pv < 0 || pv > 100 || isNaN(pc) || pc < 0 || pc > 100 || isNaN(pg) || pg < 0 || pg > 100) {
      toast.error('Percentuais devem estar entre 0 e 100');
      return;
    }

    try {
      if (editItem) {
        await atualizarMutation.mutateAsync({
          id: editItem.id,
          updates: { percentual_venda: pv, percentual_cobranca: pc, percentual_gerencia: pg },
        });
        toast.success('Comissão atualizada');
      } else {
        if (!formData.agenteId) {
          toast.error('Selecione um agente');
          return;
        }
        await criarMutation.mutateAsync({
          agente_id: formData.agenteId,
          percentual_venda: pv,
          percentual_cobranca: pc,
          percentual_gerencia: pg,
        });
        toast.success('Comissão configurada');
      }
      setShowDialog(false);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover configuração de comissão deste agente?')) return;
    try {
      await removerMutation.mutateAsync(id);
      toast.success('Configuração removida');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao remover');
    }
  }

  async function handleToggleGateway(gw: GatewayPagamentoView) {
    try {
      await patchGateway(gw.id, { ativo: !gw.ativo });
      toast.success(`Gateway ${gw.label} ${!gw.ativo ? 'ativado' : 'desativado'}`);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar gateway');
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

    // Validação para EFI
    if (configGateway.nome === 'efi') {
      if (!gwConfig.client_id.trim() || !gwConfig.client_secret.trim() || !gwConfig.pix_key.trim()) {
        toast.error('Client ID, Client Secret e Chave PIX são obrigatórios');
        return;
      }
      if (!gwConfig.cert_pem.trim() || !gwConfig.key_pem.trim()) {
        toast.error('Certificado PEM e Chave Privada PEM são obrigatórios');
        return;
      }
      // Validação básica do formato PEM
      if (!gwConfig.cert_pem.trim().includes('-----BEGIN CERTIFICATE-----')) {
        toast.error('O Certificado PEM deve começar com -----BEGIN CERTIFICATE-----');
        return;
      }
      if (!gwConfig.key_pem.trim().includes('-----BEGIN')) {
        toast.error('A Chave Privada PEM deve começar com -----BEGIN PRIVATE KEY----- ou -----BEGIN RSA PRIVATE KEY-----');
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
    } catch (err: any) {
      if (err.name === 'AbortError') {
        toast.error('Timeout: Supabase não respondeu em 15s. Verifique sua conexão.');
      } else {
        toast.error(err.message || 'Erro ao salvar credenciais');
      }
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
    toast.success('Copiado para a área de transferência');
  }

  const isSaving = criarMutation.isPending || atualizarMutation.isPending;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings2 className="h-6 w-6" />
            Configuração de Comissões
          </h1>
          <p className="text-muted-foreground mt-1">
            Defina os percentuais de comissão por agente e gerencie gateways de pagamento.
          </p>
        </div>
        <Button onClick={openCreate} disabled={agentesDisponiveis.length === 0}>
          <UserPlus className="h-4 w-4 mr-2" />
          Novo Agente
        </Button>
      </div>

      {/* Tabela de Agentes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Percent className="h-5 w-5" />
            Comissões por Agente
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingAgentes ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : agentes.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhuma comissão configurada. Adicione um agente para começar.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agente</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">% Venda</TableHead>
                  <TableHead className="text-right">% Cobrança</TableHead>
                  <TableHead className="text-right">% Gerência</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agentes.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{a.agenteNome || '—'}</p>
                        <p className="text-xs text-muted-foreground">{a.agenteEmail}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{a.agenteRole}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {a.percentualVenda.toFixed(2)}%
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {a.percentualCobranca.toFixed(2)}%
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {a.percentualGerencia.toFixed(2)}%
                    </TableCell>
                    <TableCell>
                      <Badge variant={a.ativo ? 'default' : 'secondary'}>
                        {a.ativo ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(a)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => handleDelete(a.id)}
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

      {/* Gateways de Pagamento */}
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
                <div
                  key={gw.id}
                  className="p-4 border rounded-lg space-y-3"
                >
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
                      <Switch
                        checked={gw.ativo}
                        onCheckedChange={() => handleToggleGateway(gw)}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openGatewayConfig(gw)}
                    >
                      <KeyRound className="h-4 w-4 mr-2" />
                      Configurar Credenciais
                    </Button>
                    {gw.nome === 'efi' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs text-muted-foreground"
                        onClick={() => copyToClipboard(`https://ctvihcpojodsntoelfck.supabase.co/functions/v1/webhook-efi`)}
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

      {/* Dialog — Criar / Editar comissão */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editItem ? 'Editar Comissão' : 'Nova Configuração de Comissão'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {!editItem && (
              <div className="space-y-2">
                <Label>Agente</Label>
                <Select
                  value={formData.agenteId}
                  onValueChange={(v) => setFormData((f) => ({ ...f, agenteId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um agente" />
                  </SelectTrigger>
                  <SelectContent>
                    {agentesDisponiveis.map((u: any) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name || u.email} ({u.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>% Comissão Venda</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={formData.percentualVenda}
                  onChange={(e) =>
                    setFormData((f) => ({ ...f, percentualVenda: e.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Sobre o valor da parcela liquidada (vendedor)
                </p>
              </div>
              <div className="space-y-2">
                <Label>% Comissão Cobrança</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={formData.percentualCobranca}
                  onChange={(e) =>
                    setFormData((f) => ({ ...f, percentualCobranca: e.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Sobre o valor da parcela liquidada (cobrador)
                </p>
              </div>
              <div className="space-y-2">
                <Label>% Comissão Gerência</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={formData.percentualGerencia}
                  onChange={(e) =>
                    setFormData((f) => ({ ...f, percentualGerencia: e.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Sobre o valor da parcela liquidada (gerente)
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editItem ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog — Configurar Credenciais do Gateway */}
      <Dialog open={showGatewayConfig} onOpenChange={setShowGatewayConfig}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              Configurar {configGateway?.label || 'Gateway'}
            </DialogTitle>
            <DialogDescription>
              Insira as credenciais da API para habilitar o gateway de pagamento.
              {configGateway?.nome === 'efi' && ' Obtenha suas credenciais no painel da EFI Bank (Gerencianet).'}
            </DialogDescription>
          </DialogHeader>

          {configGateway?.nome === 'efi' && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="efi-client-id">Client ID *</Label>
                <Input
                  id="efi-client-id"
                  placeholder="Client_Id_xxxxxxxxxxxxxxx"
                  value={gwConfig.client_id}
                  onChange={(e) => setGwConfig((f) => ({ ...f, client_id: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  Encontrado em: EFI Bank → API → Aplicações → Detalhes
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="efi-client-secret">Client Secret *</Label>
                <Input
                  id="efi-client-secret"
                  type="password"
                  placeholder="Client_Secret_xxxxxxxxxxxxxxx"
                  value={gwConfig.client_secret}
                  onChange={(e) => setGwConfig((f) => ({ ...f, client_secret: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  Encontrado junto ao Client ID na mesma aplicação
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="efi-pix-key">Chave PIX *</Label>
                <Input
                  id="efi-pix-key"
                  placeholder="sua-chave-pix@email.com ou CPF/CNPJ"
                  value={gwConfig.pix_key}
                  onChange={(e) => setGwConfig((f) => ({ ...f, pix_key: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  Chave Pix cadastrada na sua conta EFI (email, CPF, CNPJ, telefone ou aleatória)
                </p>
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
                        const text = reader.result as string;
                        setGwConfig((f) => ({ ...f, cert_pem: text }));
                        toast.success('Certificado PEM carregado');
                      };
                      reader.readAsText(file);
                      e.target.value = '';
                    }}
                  />
                  {gwConfig.cert_pem && (
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 shrink-0">
                      <CheckCircle className="w-3 h-3 mr-1" /> OK
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Arquivo .pem extraído do .p12: <code className="bg-muted px-1 rounded">openssl pkcs12 -in cert.p12 -out cert.pem -clcerts -nokeys -password pass:</code>
                </p>
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
                        const text = reader.result as string;
                        setGwConfig((f) => ({ ...f, key_pem: text }));
                        toast.success('Chave Privada PEM carregada');
                      };
                      reader.readAsText(file);
                      e.target.value = '';
                    }}
                  />
                  {gwConfig.key_pem && (
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 shrink-0">
                      <CheckCircle className="w-3 h-3 mr-1" /> OK
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Arquivo .pem extraído do .p12: <code className="bg-muted px-1 rounded">openssl pkcs12 -in cert.p12 -out key.pem -nocerts -nodes -password pass:</code>
                </p>
              </div>

              <div className="p-3 border rounded-lg bg-amber-50 dark:bg-amber-950/30 text-xs space-y-1">
                <p className="font-semibold text-amber-800 dark:text-amber-200">Como converter o certificado .p12 para PEM:</p>
                <ol className="list-decimal list-inside space-y-1 text-amber-700 dark:text-amber-300">
                  <li>Baixe o certificado .p12 do painel EFI Bank (API → Aplicações)</li>
                  <li>Extrair certificado: <code className="bg-white dark:bg-gray-900 px-1 rounded">openssl pkcs12 -in cert.p12 -out cert.pem -clcerts -nokeys</code></li>
                  <li>Extrair chave privada: <code className="bg-white dark:bg-gray-900 px-1 rounded">openssl pkcs12 -in cert.p12 -out key.pem -nocerts -nodes</code></li>
                  <li>Faça upload dos arquivos .pem nos botões acima</li>
                </ol>
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/50">
                <div>
                  <Label htmlFor="efi-sandbox">Modo Sandbox (Teste)</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Ative para usar o ambiente de homologação da EFI
                  </p>
                </div>
                <Switch
                  id="efi-sandbox"
                  checked={gwConfig.sandbox}
                  onCheckedChange={(v) => setGwConfig((f) => ({ ...f, sandbox: v }))}
                />
              </div>

              <div className="p-3 border rounded-lg bg-blue-50 dark:bg-blue-950/30 text-xs space-y-1">
                <p className="font-semibold text-blue-800 dark:text-blue-200">URL do Webhook (configure na EFI):</p>
                <div className="flex items-center gap-2">
                  <code className="bg-white dark:bg-gray-900 px-2 py-1 rounded border text-[11px] flex-1 break-all">
                    https://ctvihcpojodsntoelfck.supabase.co/functions/v1/webhook-efi
                  </code>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0"
                    onClick={() => copyToClipboard('https://ctvihcpojodsntoelfck.supabase.co/functions/v1/webhook-efi')}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {configGateway?.nome === 'woovi' && (
            <div className="space-y-4 py-2">
              <div className="p-3 border rounded-lg bg-muted/50 text-sm">
                <p>O gateway Woovi é configurado via variáveis de ambiente:</p>
                <code className="block mt-2 text-xs bg-muted px-2 py-1 rounded">VITE_WOOVI_APP_ID</code>
                <p className="text-xs text-muted-foreground mt-2">
                  Defina no arquivo <code>.env</code> ou nas variáveis de ambiente do deploy.
                </p>
              </div>
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
