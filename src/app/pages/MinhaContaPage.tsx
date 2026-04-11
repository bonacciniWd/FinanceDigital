/**
 * @module MinhaContaPage
 * @description Página de configurações da conta do usuário logado.
 *
 * Edição de perfil (nome) real via Supabase, alteração de senha
 * via supabase.auth.updateUser, restrição de IP (allowed_ips no DB),
 * preferências de notificação persistidas em localStorage.
 *
 * @route /configuracoes/minha-conta
 * @access Protegido — todos os perfis
 */
import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { User, Bell, Shield, Save, Loader2, Plus, X, Globe, Wifi } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

/* ── role → label de exibição ───────────────────────────── */
const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  gerencia: 'Gerente',
  cobranca: 'Cobrador',
  comercial: 'Comercial',
};

/* ── fetch public IP ────────────────────────────────────── */
async function fetchPublicIp(): Promise<string> {
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    const data = await res.json();
    return data.ip;
  } catch {
    // Fallback API
    try {
      const res = await fetch('https://ifconfig.me/ip');
      return (await res.text()).trim();
    } catch {
      return '';
    }
  }
}

/* ── localStorage keys ──────────────────────────────────── */
const NOTIF_KEY = 'fd_notificacoes_prefs';
const SEC_KEY = 'fd_seguranca_prefs';

const DEFAULT_NOTIF = {
  emailCobranca: true,
  emailRelatorio: true,
  pushNovoCliente: true,
  pushInadimplencia: true,
  whatsappAlerta: false,
};

const DEFAULT_SEC = {
  twoFactor: false,
  sessaoMaxima: '8h',
};

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

/* ── simple IPv4 validation ─────────────────────────────── */
function isValidIpv4(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  return parts.every(p => {
    const n = Number(p);
    return Number.isInteger(n) && n >= 0 && n <= 255 && p === String(n);
  });
}

/* ══════════════════════════════════════════════════════════ */
export default function MinhaContaPage() {
  const { user, updateProfile } = useAuth();
  const [salvando, setSalvando] = useState(false);

  /* ── form state ─────────────────────────────────────── */
  const [nome, setNome] = useState(user?.name ?? '');
  const email = user?.email ?? '';
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');

  /* ── IP restriction state ───────────────────────────── */
  const [ipRestrito, setIpRestrito] = useState(false);
  const [allowedIps, setAllowedIps] = useState<string[]>([]);
  const [novoIp, setNovoIp] = useState('');
  const [meuIp, setMeuIp] = useState<string>('');
  const [loadingIp, setLoadingIp] = useState(true);

  const [notificacoes, setNotificacoes] = useState(() => loadJson(NOTIF_KEY, DEFAULT_NOTIF));
  const [seguranca, setSeguranca] = useState(() => loadJson(SEC_KEY, DEFAULT_SEC));

  /* ── load current IP + saved allowed_ips from profile ── */
  useEffect(() => {
    let cancelled = false;
    async function load() {
      // Fetch public IP
      const ip = await fetchPublicIp();
      if (!cancelled) setMeuIp(ip);

      // Fetch allowed_ips from profile
      if (user?.id) {
        const { data } = await (supabase as any)
          .from('profiles')
          .select('allowed_ips')
          .eq('id', user.id)
          .single();

        if (!cancelled && data) {
          const ips: string[] = data.allowed_ips ?? [];
          setAllowedIps(ips);
          setIpRestrito(ips.length > 0);
        }
      }
      if (!cancelled) setLoadingIp(false);
    }
    load();
    return () => { cancelled = true; };
  }, [user?.id]);

  /* ── persist prefs on change ─────────────────────── */
  useEffect(() => { localStorage.setItem(NOTIF_KEY, JSON.stringify(notificacoes)); }, [notificacoes]);
  useEffect(() => { localStorage.setItem(SEC_KEY, JSON.stringify(seguranca)); }, [seguranca]);

  /* ── IP management helpers ──────────────────────── */
  const addIp = useCallback((ip: string) => {
    const trimmed = ip.trim();
    if (!trimmed) return;
    if (!isValidIpv4(trimmed)) {
      toast.error('IP inválido. Use formato IPv4: ex. 192.168.1.1');
      return;
    }
    if (allowedIps.includes(trimmed)) {
      toast.error('IP já está na lista');
      return;
    }
    setAllowedIps(prev => [...prev, trimmed]);
    setNovoIp('');
  }, [allowedIps]);

  const removeIp = useCallback((ip: string) => {
    setAllowedIps(prev => prev.filter(i => i !== ip));
  }, []);

  const addMeuIp = useCallback(() => {
    if (meuIp && !allowedIps.includes(meuIp)) {
      setAllowedIps(prev => [...prev, meuIp]);
    }
  }, [meuIp, allowedIps]);

  /* ── toggle IP restriction ──────────────────────── */
  const handleToggleIpRestrito = (checked: boolean) => {
    setIpRestrito(checked);
    if (!checked) {
      // Desligar limpará os IPs ao salvar
    } else if (checked && allowedIps.length === 0 && meuIp) {
      // Auto-adiciona IP atual ao ligar
      setAllowedIps([meuIp]);
    }
  };

  /* ── real save ──────────────────────────────────── */
  const handleSalvar = async () => {
    setSalvando(true);
    try {
      // 1) Atualizar nome no profile (se mudou)
      if (nome && nome !== user?.name) {
        await updateProfile({ name: nome });
      }

      // 2) Salvar allowed_ips no banco
      const ipsToSave = ipRestrito ? allowedIps : null;

      // Validação: se ativou restrição, deve ter pelo menos 1 IP
      if (ipRestrito && allowedIps.length === 0) {
        toast.error('Adicione pelo menos 1 IP autorizado antes de ativar a restrição');
        setSalvando(false);
        return;
      }

      const { error: ipError } = await (supabase as any)
        .from('profiles')
        .update({ allowed_ips: ipsToSave, updated_at: new Date().toISOString() })
        .eq('id', user?.id);

      if (ipError) {
        toast.error(`Erro ao salvar IPs: ${ipError.message}`);
        setSalvando(false);
        return;
      }

      // 3) Alterar senha (se preenchida)
      if (novaSenha) {
        if (novaSenha.length < 6) {
          toast.error('A senha deve ter pelo menos 6 caracteres');
          setSalvando(false);
          return;
        }
        if (novaSenha !== confirmarSenha) {
          toast.error('As senhas não coincidem');
          setSalvando(false);
          return;
        }
        const { error } = await supabase.auth.updateUser({ password: novaSenha });
        if (error) {
          toast.error(`Erro ao alterar senha: ${error.message}`);
          setSalvando(false);
          return;
        }
        setNovaSenha('');
        setConfirmarSenha('');
      }

      toast.success('Configurações salvas com sucesso');
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  };

  const cargoLabel = ROLE_LABELS[user?.role ?? ''] ?? user?.role ?? '—';

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
              <Input value={nome} onChange={e => setNome(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Email</label>
              <Input value={email} disabled className="bg-muted" type="email" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Cargo</label>
              <div className="flex items-center gap-2">
                <Input value={cargoLabel} disabled className="bg-muted" />
                <Badge variant="outline" className="whitespace-nowrap">{user?.role}</Badge>
              </div>
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
              <label className="text-sm font-medium mb-1.5 block">Nova Senha</label>
              <Input type="password" placeholder="Mínimo 6 caracteres" value={novaSenha} onChange={e => setNovaSenha(e.target.value)} />
            </div>
            <div>
              <Input type="password" placeholder="Confirmar nova senha" value={confirmarSenha} onChange={e => setConfirmarSenha(e.target.value)} />
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
                    <SelectItem value="2h">30 minutos</SelectItem>
                    <SelectItem value="4h">1 hora</SelectItem>
                    <SelectItem value="2h">2 horas</SelectItem>
                    <SelectItem value="4h">4 horas</SelectItem>
                    <SelectItem value="8h">8 horas</SelectItem>
                    <SelectItem value="24h">24 horas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Restrição por IP */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><Globe className="w-4 h-4" /> Restrição por IP</CardTitle>
              <Switch checked={ipRestrito} onCheckedChange={handleToggleIpRestrito} />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Quando ativada, somente os IPs listados abaixo poderão fazer login nesta conta.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Meu IP atual */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
              <Wifi className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Seu IP atual</p>
                <p className="text-sm font-mono font-medium">
                  {loadingIp ? <Loader2 className="w-3 h-3 animate-spin inline" /> : meuIp || 'Não detectado'}
                </p>
              </div>
              {meuIp && !allowedIps.includes(meuIp) && ipRestrito && (
                <Button variant="outline" size="sm" onClick={addMeuIp}>
                  <Plus className="w-3 h-3 mr-1" /> Adicionar
                </Button>
              )}
              {meuIp && allowedIps.includes(meuIp) && (
                <Badge className="bg-green-100 text-green-800 text-[10px]">Autorizado</Badge>
              )}
            </div>

            {ipRestrito && (
              <>
                {/* Input para novo IP */}
                <div className="flex gap-2">
                  <Input
                    placeholder="Ex: 203.0.113.50"
                    value={novoIp}
                    onChange={e => setNovoIp(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addIp(novoIp); } }}
                    className="font-mono"
                  />
                  <Button variant="outline" onClick={() => addIp(novoIp)} disabled={!novoIp.trim()}>
                    <Plus className="w-4 h-4 mr-1" /> Adicionar IP
                  </Button>
                </div>

                {/* Lista de IPs */}
                {allowedIps.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">IPs autorizados ({allowedIps.length})</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {allowedIps.map(ip => (
                        <div key={ip} className="flex items-center justify-between px-3 py-2 border rounded-lg bg-card">
                          <span className="text-sm font-mono">{ip}</span>
                          <div className="flex items-center gap-1">
                            {ip === meuIp && <Badge variant="outline" className="text-[9px] px-1">atual</Badge>}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive hover:text-destructive"
                              onClick={() => removeIp(ip)}
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded-lg p-3">
                    Nenhum IP autorizado. Adicione pelo menos seu IP atual para não perder acesso à conta.
                  </p>
                )}
              </>
            )}

            {!ipRestrito && (
              <p className="text-xs text-muted-foreground">
                Restrição desativada — login permitido de qualquer IP.
              </p>
            )}
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
