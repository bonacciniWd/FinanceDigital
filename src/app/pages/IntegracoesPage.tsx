/**
 * @module IntegracoesPage
 * @description Painel de integrações com serviços externos.
 *
 * Configuração de APIs: WhatsApp Business, gateway de pagamento,
 * serviços de score de crédito, etc. Status de conexão,
 * testes de conectividade e logs de sincronização.
 *
 * **⚠️ Requer modo anônimo/incognito** — detecta via `window.chrome`
 * e redireciona se não estiver em janela privada.
 *
 * @route /configuracoes/integracoes
 * @access Protegido — somente admin (modo incógnito)
 */
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
import { Input } from '../components/ui/input';
import { ShieldAlert, Plug, Settings2, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

// Reusa a mesma detecção de incógnito
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
          (window as any).webkitRequestFileSystem(0, 0, () => setIsIncognito(false), () => setIsIncognito(true));
          return;
        }
        setIsIncognito(false);
      } catch { setIsIncognito(false); }
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

const integracoes = [
  { id: 'whatsapp', nome: 'WhatsApp Business API', descricao: 'Envio de mensagens de cobrança e notificações', status: 'ativo', icone: '💬',
    config: { apiKey: 'wba_****...3k2f', telefone: '+55 11 99999-0000', webhook: 'https://api.fintechflow.com/whatsapp/webhook' }},
  { id: 'supabase', nome: 'Supabase', descricao: 'Banco de dados e autenticação', status: 'ativo', icone: '🟢',
    config: { url: 'https://xgz...supabase.co', anonKey: 'eyJh****...', serviceRole: 'eyJh****...' }},
  { id: 'pix', nome: 'API PIX (Banco)', descricao: 'Geração de QR Codes e recebimentos', status: 'ativo', icone: '💰',
    config: { clientId: 'cli_****...Kw2', certPath: '/certs/pix_prod.pem' }},
  { id: 'sms', nome: 'SMS Gateway', descricao: 'Envio de SMS para cobrança e alertas', status: 'inativo', icone: '📱',
    config: { apiKey: '', provider: 'Zenvia' }},
  { id: 'email', nome: 'SMTP Email', descricao: 'Envio de emails transacionais', status: 'ativo', icone: '📧',
    config: { host: 'smtp.gmail.com', porta: '587', usuario: 'noreply@fintechflow.com' }},
  { id: 'serasa', nome: 'Serasa Experian', descricao: 'Consulta de score de crédito', status: 'inativo', icone: '📊',
    config: { apiKey: '', endpoint: 'https://api.serasa.com.br/v1' }},
];

export default function IntegracoesPage() {
  const isIncognito = useIncognitoCheck();

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Integrações</h1>
          <p className="text-muted-foreground mt-1">Gerencie conexões com serviços externos</p>
        </div>
        <Button variant="outline"><Plug className="w-4 h-4 mr-2" /> Nova Integração</Button>
      </div>

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
                    <span className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                    <span className="font-mono text-[11px] bg-muted px-2 py-0.5 rounded max-w-[200px] truncate">{value || '—'}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-4">
                <Button variant="outline" size="sm" className="flex-1"><Settings2 className="w-3 h-3 mr-1" /> Configurar</Button>
                <Button variant="outline" size="sm"><RefreshCw className="w-3 h-3" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
