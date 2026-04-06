/**
 * @module IpWhitelistPage
 * @description Gestão de IPs autorizados, tokens de emergência e sessões de uso do app desktop.
 * @route /configuracoes/ip-whitelist
 * @access Protegido — somente admin
 */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import { ScrollArea } from '../components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Shield,
  Plus,
  Trash2,
  Loader2,
  Copy,
  Key,
  Monitor,
  Clock,
  Globe,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import {
  useAllowedIps,
  useAddAllowedIp,
  useToggleAllowedIp,
  useDeleteAllowedIp,
  useEmergencyTokens,
  useCreateEmergencyToken,
  useAppUsageSessions,
} from '../hooks/useIpWhitelist';

export default function IpWhitelistPage() {
  const { user } = useAuth();
  const { data: ips = [], isLoading: loadingIps } = useAllowedIps();
  const { data: tokens = [], isLoading: loadingTokens } = useEmergencyTokens();
  const { data: sessions = [], isLoading: loadingSessions } = useAppUsageSessions();
  const addIp = useAddAllowedIp();
  const toggleIp = useToggleAllowedIp();
  const deleteIp = useDeleteAllowedIp();
  const createToken = useCreateEmergencyToken();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newIp, setNewIp] = useState('');
  const [newLabel, setNewLabel] = useState('');

  const handleAddIp = async () => {
    if (!newIp.trim() || !user) return;
    try {
      await addIp.mutateAsync({ ip_address: newIp.trim(), label: newLabel.trim(), added_by: user.id });
      toast.success('IP adicionado à whitelist');
      setShowAddDialog(false);
      setNewIp('');
      setNewLabel('');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleToggle = async (id: string, active: boolean) => {
    try {
      await toggleIp.mutateAsync({ id, active });
      toast.success(active ? 'IP ativado' : 'IP desativado');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remover este IP da whitelist?')) return;
    try {
      await deleteIp.mutateAsync(id);
      toast.success('IP removido');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleCreateToken = async () => {
    if (!user) return;
    try {
      const token = await createToken.mutateAsync(user.id);
      await navigator.clipboard.writeText(token.token);
      toast.success('Token gerado e copiado para a área de transferência!');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    toast.success('Token copiado!');
  };

  const formatDate = (ts: string) =>
    new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  const formatDuration = (sec: number | null) => {
    if (!sec || sec < 0) return '-';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return h > 0 ? `${h}h ${m}min` : `${m}min`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
          <Shield className="w-6 h-6" /> IP Whitelist & Controle de Acesso
        </h1>
        <p className="text-muted-foreground mt-1">
          Gerencie IPs autorizados para download do app desktop e monitoramento de uso.
        </p>
      </div>

      <Tabs defaultValue="ips" className="space-y-4">
        <TabsList>
          <TabsTrigger value="ips" className="gap-1.5">
            <Globe className="w-4 h-4" /> IPs Autorizados
          </TabsTrigger>
          <TabsTrigger value="tokens" className="gap-1.5">
            <Key className="w-4 h-4" /> Tokens Emergência
          </TabsTrigger>
          <TabsTrigger value="sessions" className="gap-1.5">
            <Monitor className="w-4 h-4" /> Sessões Desktop
          </TabsTrigger>
        </TabsList>

        {/* ── IPs Tab ───────────────────────────────────────── */}
        <TabsContent value="ips">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">IPs Autorizados</CardTitle>
              <Button size="sm" onClick={() => setShowAddDialog(true)}>
                <Plus className="w-4 h-4 mr-1" /> Adicionar IP
              </Button>
            </CardHeader>
            <CardContent>
              {loadingIps ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : ips.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Shield className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p>Nenhum IP cadastrado. Adicione IPs para proteger o acesso.</p>
                </div>
              ) : (
                <ScrollArea className="max-h-[500px]">
                  <div className="space-y-2">
                    {ips.map((ip) => (
                      <div
                        key={ip.id}
                        className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full ${ip.active ? 'bg-green-500' : 'bg-gray-400'}`} />
                          <div>
                            <span className="font-mono text-sm font-medium">{ip.ip_address}</span>
                            {ip.label && (
                              <span className="ml-2 text-xs text-muted-foreground">— {ip.label}</span>
                            )}
                            <div className="text-[11px] text-muted-foreground">
                              Adicionado em {formatDate(ip.created_at)}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={ip.active}
                            onCheckedChange={(checked) => handleToggle(ip.id, checked)}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(ip.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tokens Tab ────────────────────────────────────── */}
        <TabsContent value="tokens">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Tokens de Emergência</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Gere tokens únicos (válidos por 15 min) para registrar novos IPs quando o IP muda.
                </p>
              </div>
              <Button size="sm" onClick={handleCreateToken} disabled={createToken.isPending}>
                {createToken.isPending ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Key className="w-4 h-4 mr-1" />
                )}
                Gerar Token
              </Button>
            </CardHeader>
            <CardContent>
              {loadingTokens ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : tokens.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Key className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p>Nenhum token gerado ainda.</p>
                </div>
              ) : (
                <ScrollArea className="max-h-[500px]">
                  <div className="space-y-2">
                    {tokens.map((t) => {
                      const expired = new Date(t.expires_at) < new Date();
                      const used = !!t.used_at;
                      return (
                        <div
                          key={t.id}
                          className="flex items-center justify-between p-3 rounded-lg border bg-card"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <code className="text-xs font-mono truncate max-w-[300px]">
                                {t.token}
                              </code>
                              {!used && !expired && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => copyToken(t.token)}
                                >
                                  <Copy className="w-3 h-3" />
                                </Button>
                              )}
                            </div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              Criado em {formatDate(t.created_at)} · Expira em {formatDate(t.expires_at)}
                            </div>
                          </div>
                          <div>
                            {used ? (
                              <Badge className="bg-blue-500 text-white gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Usado ({t.used_by_ip})
                              </Badge>
                            ) : expired ? (
                              <Badge variant="secondary" className="gap-1">
                                <XCircle className="w-3 h-3" /> Expirado
                              </Badge>
                            ) : (
                              <Badge className="bg-green-500 text-white gap-1">
                                <Clock className="w-3 h-3" /> Ativo
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" /> Como usar
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>1. Gere um token acima (válido por 15 minutos)</p>
              <p>2. Envie o token ao funcionário com IP mudado</p>
              <p>3. O funcionário acessa a rota de emergência no app desktop ou via:</p>
              <code className="block bg-muted p-2 rounded text-xs">
                GET /emergency?token=SEU_TOKEN_AQUI
              </code>
              <p>4. O IP atual do funcionário é automaticamente adicionado à whitelist</p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Sessions Tab ──────────────────────────────────── */}
        <TabsContent value="sessions">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Sessões do App Desktop</CardTitle>
              <p className="text-sm text-muted-foreground">
                Monitoramento do tempo de uso do aplicativo por funcionário.
              </p>
            </CardHeader>
            <CardContent>
              {loadingSessions ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : sessions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Monitor className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p>Nenhuma sessão registrada ainda.</p>
                </div>
              ) : (
                <ScrollArea className="max-h-[500px]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground text-xs">
                        <th className="pb-2 font-medium">Funcionário</th>
                        <th className="pb-2 font-medium">IP</th>
                        <th className="pb-2 font-medium">Início</th>
                        <th className="pb-2 font-medium">Duração</th>
                        <th className="pb-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessions.map((s) => (
                        <tr key={s.id} className="border-b last:border-0">
                          <td className="py-2">
                            <div className="font-medium">{s.profiles?.name ?? '-'}</div>
                            <div className="text-[11px] text-muted-foreground">{s.profiles?.role}</div>
                          </td>
                          <td className="py-2 font-mono text-xs">{s.ip_address}</td>
                          <td className="py-2 text-xs">{formatDate(s.started_at)}</td>
                          <td className="py-2 text-xs font-medium">{formatDuration(s.duration_sec)}</td>
                          <td className="py-2">
                            {s.ended_at ? (
                              <Badge variant="secondary" className="text-[10px]">Encerrada</Badge>
                            ) : (
                              <Badge className="bg-green-500 text-white text-[10px]">Ativa</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Add IP Dialog ────────────────────────────────────── */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar IP à Whitelist</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Endereço IP</Label>
              <Input
                placeholder="192.168.1.100"
                value={newIp}
                onChange={(e) => setNewIp(e.target.value)}
              />
            </div>
            <div>
              <Label>Rótulo (opcional)</Label>
              <Input
                placeholder="Ex: Escritório SP, Home - João"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAddIp} disabled={!newIp.trim() || addIp.isPending}>
              {addIp.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
