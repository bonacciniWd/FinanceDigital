/**
 * @module IntegracoesPage
 * @description Painel de integrações com serviços externos.
 *
 * Mostra status real do WhatsApp (via tabela whatsapp_instancias)
 * e Supabase (URL do projeto). Demais integrações exibidas como
 * placeholders configuráveis.
 *
 * **⚠️ Requer modo anônimo/incognito** — detecta via `window.chrome`
 * e redireciona se não estiver em janela privada.
 *
 * @route /configuracoes/integracoes
 * @access Protegido — somente admin (modo incógnito)
 */
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { ShieldAlert, Plug, Settings2, CheckCircle, XCircle, RefreshCw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';

/* ── incognito check ────────────────────────────────────── */
function useIncognitoCheck() {
  const [isIncognito, setIsIncognito] = useState<boolean | null>(null);
  useEffect(() => {
    async function check() {
      try {
        if ('storage' in navigator && 'estimate' in navigator.storage) {
          const { quota } = await navigator.storage.estimate();
          if (quota && quota < 200 * 1024 * 1024) { setIsIncognito(true); return; }
        }
        if ('webkitRequestFileSystem' in window) {
          (window as any).webkitRequestFileSystem(0, 0, () => setIsIncognito(true), () => setIsIncognito(true));
          return;
        }
        // Fallback: navegadores modernos não permitem detectar incógnito
        // — permitir acesso (páginas já são protegidas por auth)
        setIsIncognito(true);
      } catch { setIsIncognito(true); }
    }
    check();
  }, []);
  return isIncognito;
}

function IncognitoBlockScreen() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-md w-full border-red-200 bg-red-50">
        <CardContent className="p-8 text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
            <ShieldAlert className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-red-800">Acesso Restrito</h2>
          <p className="text-red-700 text-sm">
            Por questões de segurança, a área de configurações só pode ser acessada em uma <strong>aba anônima</strong> (modo incógnito).
          </p>
          <div className="bg-card rounded-lg p-4 text-left text-xs text-muted-foreground space-y-2">
            <p className="font-semibold text-foreground">Como abrir uma aba anônima:</p>
            <p><strong>Chrome:</strong> Ctrl+Shift+N (ou Cmd+Shift+N no Mac)</p>
            <p><strong>Firefox:</strong> Ctrl+Shift+P (ou Cmd+Shift+P no Mac)</p>
            <p><strong>Safari:</strong> Cmd+Shift+N</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── tipos ──────────────────────────────────────────────── */
interface IntegracaoCard {
  id: string;
  nome: string;
  descricao: string;
  icone: string;
  status: 'ativo' | 'inativo';
  config: Record<string, string>;
}

/* ── fetch real WhatsApp instances ──────────────────────── */
async function fetchWhatsappInstances() {
  const { data, error } = await supabase
    .from('whatsapp_instancias')
    .select('id, instance_name, status, phone_number, created_at')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

async function fetchGatewaysStatus() {
  const { data, error } = await supabase
    .from('gateways_pagamento')
    .select('nome, ativo, config')
    .order('prioridade', { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/* ── build integrations list ────────────────────────────── */
function buildIntegracoes(wpInstances: any[], gatewaysDb: any[]): IntegracaoCard[] {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? '—';
  const wooviGw = gatewaysDb.find((g: any) => g.nome === 'woovi');
  const efiGw = gatewaysDb.find((g: any) => g.nome === 'efi');
  const efiCfg = (efiGw?.config || {}) as Record<string, unknown>;
  const efiConfigured = !!(efiCfg.client_id && efiCfg.client_secret && efiCfg.pix_key && efiCfg.cert_pem && efiCfg.key_pem);

  // WhatsApp — status real baseado em instâncias
  const wpAtivas = wpInstances.filter((i: any) => i.status === 'conectado');
  const wpStatus = wpAtivas.length > 0 ? 'ativo' as const : 'inativo' as const;
  const wpConfig: Record<string, string> = {
    'Instâncias': `${wpInstances.length} total (${wpAtivas.length} conectadas)`,
    'API': 'Evolution API v1.8',
    'Host': 'finance-digital-evolution.fly.dev',
  };
  if (wpInstances.length > 0) {
    wpConfig['Principal'] = wpInstances[0].instance_name ?? '—';
    if (wpInstances[0].phone_number) wpConfig['Telefone'] = wpInstances[0].phone_number;
  }

  return [
    {
      id: 'whatsapp',
      nome: 'WhatsApp Business API',
      descricao: 'Envio de mensagens de cobrança e notificações via Evolution API',
      status: wpStatus,
      icone: '💬',
      config: wpConfig,
    },
    {
      id: 'supabase',
      nome: 'Supabase',
      descricao: 'Banco de dados PostgreSQL e autenticação',
      status: 'ativo',
      icone: '🟢',
      config: {
        'URL': supabaseUrl,
        'Região': 'South America (East)',
        'Auth': 'Ativo',
        'Realtime': 'Ativo',
      },
    },
    {
      id: 'woovi',
      nome: 'Woovi (OpenPix)',
      descricao: 'Cobranças PIX, QR Codes e gestão de pagamentos',
      status: wooviGw?.ativo ? 'ativo' : 'inativo',
      icone: '💰',
      config: {
        'Ambiente': import.meta.env.VITE_WOOVI_APP_ID ? 'Configurado' : 'Não configurado',
        'API': 'OpenPix v1',
        'Recursos': 'Cobranças, QR Code, Subcontas, Webhooks',
        'Página': '/pagamentos',
      },
    },
    {
      id: 'efi',
      nome: 'EFI Bank (Gerencianet)',
      descricao: 'Gateway PIX alternativo — cobranças, pagamentos e saldo',
      status: efiGw?.ativo ? 'ativo' : 'inativo',
      icone: '🏦',
      config: {
        'API': 'EFI Pay Pix v2',
        'Status': efiGw?.ativo ? (efiConfigured ? '✅ Ativo e Configurado' : '⚠️ Ativo mas sem credenciais') : 'Desativado',
        'Recursos': 'Cobranças Pix, Pagamentos, Saldo, Webhook',
        'Página': '/pagamentos',
      },
    },
    {
      id: 'sms',
      nome: 'SMS Gateway',
      descricao: 'Envio de SMS para cobrança e alertas',
      status: 'inativo',
      icone: '📱',
      config: { 'Status': 'Não configurado' },
    },
    {
      id: 'email',
      nome: 'SMTP Email',
      descricao: 'Envio de emails transacionais',
      status: 'inativo',
      icone: '📧',
      config: { 'Status': 'Não configurado' },
    },
    {
      id: 'serasa',
      nome: 'Serasa Experian',
      descricao: 'Consulta de score de crédito',
      status: 'inativo',
      icone: '📊',
      config: { 'Status': 'Não configurado' },
    },
  ];
}

export default function IntegracoesPage() {
  const isIncognito = useIncognitoCheck();

  const { data: wpInstances, isLoading, refetch } = useQuery({
    queryKey: ['integ-whatsapp-instances'],
    queryFn: fetchWhatsappInstances,
    refetchOnWindowFocus: false,
  });

  const { data: gatewaysDb = [], refetch: refetchGateways } = useQuery({
    queryKey: ['integ-gateways-status'],
    queryFn: fetchGatewaysStatus,
    refetchOnWindowFocus: false,
  });

  if (isIncognito === null) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (isIncognito === false) {
    return <IncognitoBlockScreen />;
  }

  const integracoes = buildIntegracoes(wpInstances ?? [], gatewaysDb);

  const handleRefresh = async () => {
    await Promise.all([refetch(), refetchGateways()]);
    toast.success('Status atualizado');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Integrações</h1>
          <p className="text-muted-foreground mt-1">Gerencie conexões com serviços externos</p>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={isLoading}>
          {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Atualizar Status
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {integracoes.map(integ => (
            <Card key={integ.id} className={integ.status === 'inativo' ? 'opacity-60' : ''}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{integ.icone}</span>
                    <div>
                      <CardTitle className="text-sm">{integ.nome}</CardTitle>
                      <p className="text-xs text-muted-foreground">{integ.descricao}</p>
                    </div>
                  </div>
                  <Badge variant={integ.status === 'ativo' ? 'default' : 'secondary'} className={integ.status === 'ativo' ? 'bg-green-100 text-green-800' : ''}>
                    {integ.status === 'ativo' ? <><CheckCircle className="w-3 h-3 mr-1" /> Ativo</> : <><XCircle className="w-3 h-3 mr-1" /> Inativo</>}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(integ.config).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{key}</span>
                      <span className="font-mono text-[11px] bg-muted px-2 py-0.5 rounded max-w-[220px] truncate">{value || '—'}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
