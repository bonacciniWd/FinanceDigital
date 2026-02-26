/**
 * @module MinhaContaPage
 * @description Página de configurações da conta do usuário logado.
 *
 * Edição de perfil (nome, e-mail, telefone), alteração de senha,
 * preferências de notificação e configurações de segurança (2FA).
 * Exibe badge com o papel atual do usuário.
 *
 * **⚠️ Requer modo anônimo/incognito** — detecta via `window.chrome`
 * e redireciona se não estiver em janela privada.
 *
 * @route /configuracoes/minha-conta
 * @access Protegido — todos os perfis (modo incógnito)
 */
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { ShieldAlert, User, Lock, Bell, Shield, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';

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

export default function MinhaContaPage() {
  const isIncognito = useIncognitoCheck();
  const { user } = useAuth();
  const [salvando, setSalvando] = useState(false);

  const [dados, setDados] = useState({
    nome: user?.name || 'Carlos Admin',
    email: user?.email || 'carlos@fintechflow.com',
    telefone: '(11) 99999-0001',
    cargo: 'Administrador',
  });

  const [notificacoes, setNotificacoes] = useState({
    emailCobranca: true,
    emailRelatorio: true,
    pushNovoCliente: true,
    pushInadimplencia: true,
    whatsappAlerta: false,
  });

  const [seguranca, setSeguranca] = useState({
    twoFactor: true,
    sessaoMaxima: '8h',
    ipRestrito: false,
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

  const handleSalvar = () => {
    setSalvando(true);
    setTimeout(() => {
      setSalvando(false);
      toast.success('Configurações salvas com sucesso');
    }, 1500);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Minha Conta</h1>
          <p className="text-muted-foreground mt-1">Gerencie seus dados pessoais e preferências</p>
        </div>
        <Button onClick={handleSalvar} disabled={salvando}>
          {salvando ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...</> : <><Save className="w-4 h-4 mr-2" /> Salvar Alterações</>}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Dados Pessoais */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><User className="w-4 h-4" /> Dados Pessoais</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Nome</label>
              <Input value={dados.nome} onChange={e => setDados({...dados, nome: e.target.value})} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Email</label>
              <Input value={dados.email} onChange={e => setDados({...dados, email: e.target.value})} type="email" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Telefone</label>
              <Input value={dados.telefone} onChange={e => setDados({...dados, telefone: e.target.value})} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Cargo</label>
              <Input value={dados.cargo} disabled className="bg-muted" />
            </div>
          </CardContent>
        </Card>

        {/* Segurança */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Shield className="w-4 h-4" /> Segurança</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Alterar Senha</label>
              <Input type="password" placeholder="Nova senha" />
            </div>
            <div>
              <Input type="password" placeholder="Confirmar nova senha" />
            </div>

            <div className="border-t pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Autenticação 2 Fatores</p>
                  <p className="text-xs text-muted-foreground">Exigir código ao fazer login</p>
                </div>
                <Switch checked={seguranca.twoFactor} onCheckedChange={v => setSeguranca({...seguranca, twoFactor: v})} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Sessão Máxima</p>
                  <p className="text-xs text-muted-foreground">Tempo antes de deslogar automaticamente</p>
                </div>
                <Select value={seguranca.sessaoMaxima} onValueChange={v => setSeguranca({...seguranca, sessaoMaxima: v})}>
                  <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2h">2 horas</SelectItem>
                    <SelectItem value="4h">4 horas</SelectItem>
                    <SelectItem value="8h">8 horas</SelectItem>
                    <SelectItem value="24h">24 horas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Restringir por IP</p>
                  <p className="text-xs text-muted-foreground">Só permitir login de IPs autorizados</p>
                </div>
                <Switch checked={seguranca.ipRestrito} onCheckedChange={v => setSeguranca({...seguranca, ipRestrito: v})} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notificações */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Bell className="w-4 h-4" /> Notificações</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { key: 'emailCobranca', label: 'Email de Cobrança', desc: 'Receber emails sobre ações de cobrança' },
                { key: 'emailRelatorio', label: 'Email de Relatório', desc: 'Relatório semanal por email' },
                { key: 'pushNovoCliente', label: 'Novo Cliente', desc: 'Push quando um novo cliente é cadastrado' },
                { key: 'pushInadimplencia', label: 'Inadimplência', desc: 'Alerta quando cliente atrasa' },
                { key: 'whatsappAlerta', label: 'WhatsApp Alertas', desc: 'Receber alertas importantes via WhatsApp' },
              ].map(n => (
                <div key={n.key} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="text-sm font-medium">{n.label}</p>
                    <p className="text-xs text-muted-foreground">{n.desc}</p>
                  </div>
                  <Switch
                    checked={(notificacoes as any)[n.key]}
                    onCheckedChange={v => setNotificacoes({...notificacoes, [n.key]: v})}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
