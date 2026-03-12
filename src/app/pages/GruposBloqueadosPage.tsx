/**
 * @module GruposBloqueadosPage
 * @description Gestão de grupos e indicadores bloqueados.
 *
 * Lista redes bloqueadas por inadimplência ou fraude,
 * mostra membros afetados, permite bloquear/desbloquear e
 * visualizar redes em risco. Dados via useBloqueiosRede, useMembrosRede
 * e useBloquearRede.
 *
 * @route /rede/grupos-bloqueados
 * @access Protegido — perfis admin, gerente
 */
import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../components/ui/dialog';
import {
  AlertTriangle,
  Ban,
  MessageSquare,
  Unlock,
  Search,
  Users,
  Clock,
  DollarSign,
  Shield,
  ShieldAlert,
  Lock,
} from 'lucide-react';
import {
  useMembrosRede,
  useBloqueiosRede,
  useDesbloquearRede,
  useBloquearRede,
} from '../hooks/useRedeIndicacoes';
import type { MembroRede, BloqueioRedeView } from '../lib/view-types';

type TabType = 'bloqueados' | 'em-risco';

export default function GruposBloqueadosPage() {
  const { data: allMembros = [], isLoading: loadingMembros } = useMembrosRede();
  const { data: allBloqueios = [], isLoading: loadingBloqueios } = useBloqueiosRede();
  const desbloquearMutation = useDesbloquearRede();
  const bloquearMutation = useBloquearRede();

  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('bloqueados');
  const [confirmDesbloqueio, setConfirmDesbloqueio] = useState<BloqueioRedeView | null>(null);
  const [showBloquearDialog, setShowBloquearDialog] = useState(false);
  const [bloquearForm, setBloquearForm] = useState({
    redeId: '',
    causadoPor: '',
    motivo: '' as 'inadimplencia' | 'fraude' | 'manual' | '',
    descricao: '',
  });

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  // Active blocks only
  const bloqueiosAtivos = useMemo(
    () => allBloqueios.filter((b) => b.ativo),
    [allBloqueios],
  );

  // Build redes from members
  const todasRedes = useMemo(() => {
    const map = new Map<
      string,
      {
        redeId: string;
        membros: MembroRede[];
        lider: MembroRede | undefined;
        totalDevido: number;
        totalCarteira: number;
        inadimplentes: MembroRede[];
        emDia: number;
        aVencer: number;
      }
    >();

    for (const m of allMembros) {
      if (!map.has(m.redeId)) {
        map.set(m.redeId, {
          redeId: m.redeId,
          membros: [],
          lider: undefined,
          totalDevido: 0,
          totalCarteira: 0,
          inadimplentes: [],
          emDia: 0,
          aVencer: 0,
        });
      }
      const rede = map.get(m.redeId)!;
      rede.membros.push(m);
      rede.totalCarteira += m.clienteValor;
      if (m.nivel === 1) rede.lider = m;
      if (m.clienteStatus === 'vencido') {
        rede.inadimplentes.push(m);
        rede.totalDevido += m.clienteValor;
      } else if (m.clienteStatus === 'em_dia') {
        rede.emDia++;
      } else if (m.clienteStatus === 'a_vencer') {
        rede.aVencer++;
      }
    }

    return Array.from(map.values());
  }, [allMembros]);

  // Group bloqueios by redeId
  const redesBloqueadas = useMemo(() => {
    const bloqueadasIds = new Set(bloqueiosAtivos.map((b) => b.redeId));
    return todasRedes
      .filter((r) => bloqueadasIds.has(r.redeId))
      .map((r) => ({
        ...r,
        bloqueios: bloqueiosAtivos.filter((b) => b.redeId === r.redeId),
        diasBloqueio: Math.max(
          ...bloqueiosAtivos
            .filter((b) => b.redeId === r.redeId)
            .map((b) => Math.floor((Date.now() - new Date(b.bloqueadoEm).getTime()) / 86400000)),
          0,
        ),
      }));
  }, [todasRedes, bloqueiosAtivos]);

  // Em risco: redes não bloqueadas com inadimplentes
  const redesEmRisco = useMemo(() => {
    const bloqueadasIds = new Set(bloqueiosAtivos.map((b) => b.redeId));
    return todasRedes.filter((r) => !bloqueadasIds.has(r.redeId) && r.inadimplentes.length > 0);
  }, [todasRedes, bloqueiosAtivos]);

  // Search filter
  const filteredBloqueadas = useMemo(() => {
    if (!search.trim()) return redesBloqueadas;
    const q = search.toLowerCase();
    return redesBloqueadas.filter(
      (r) =>
        r.redeId.toLowerCase().includes(q) ||
        r.lider?.clienteNome.toLowerCase().includes(q) ||
        r.membros.some((m) => m.clienteNome.toLowerCase().includes(q)),
    );
  }, [redesBloqueadas, search]);

  const filteredEmRisco = useMemo(() => {
    if (!search.trim()) return redesEmRisco;
    const q = search.toLowerCase();
    return redesEmRisco.filter(
      (r) =>
        r.redeId.toLowerCase().includes(q) ||
        r.lider?.clienteNome.toLowerCase().includes(q) ||
        r.membros.some((m) => m.clienteNome.toLowerCase().includes(q)),
    );
  }, [redesEmRisco, search]);

  // Global metrics
  const totalMembrosAfetados = redesBloqueadas.reduce((sum, r) => sum + r.membros.length, 0);
  const totalValorDevido = redesBloqueadas.reduce((sum, r) => sum + r.totalDevido, 0);
  const mediaDiasBloqueio =
    redesBloqueadas.length > 0
      ? Math.round(redesBloqueadas.reduce((sum, r) => sum + r.diasBloqueio, 0) / redesBloqueadas.length)
      : 0;

  const handleDesbloquear = async (b: BloqueioRedeView) => {
    try {
      await desbloquearMutation.mutateAsync({ bloqueioId: b.id, redeId: b.redeId });
      setConfirmDesbloqueio(null);
    } catch {
      // error handled by hook
    }
  };

  const handleBloquear = async () => {
    if (!bloquearForm.redeId || !bloquearForm.motivo) return;
    try {
      await bloquearMutation.mutateAsync({
        redeId: bloquearForm.redeId,
        causadoPor: bloquearForm.causadoPor || bloquearForm.redeId,
        motivo: bloquearForm.descricao || bloquearForm.motivo,
      });
      setShowBloquearDialog(false);
      setBloquearForm({ redeId: '', causadoPor: '', motivo: '', descricao: '' });
      setActiveTab('bloqueados');
    } catch {
      // error handled by hook
    }
  };

  const openBloquearDialog = (redeId: string, causadoPor?: string) => {
    setBloquearForm({
      redeId,
      causadoPor: causadoPor || '',
      motivo: 'inadimplencia',
      descricao: '',
    });
    setShowBloquearDialog(true);
  };

  const isLoading = loadingMembros || loadingBloqueios;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Grupos Bloqueados</h1>
          <p className="text-muted-foreground mt-1">Redes com bloqueio solidário e redes em risco</p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar rede ou cliente..."
            className="pl-10"
          />
        </div>
      </div>

      {/* Alert */}
      {(redesBloqueadas.length > 0 || redesEmRisco.length > 0) && (
        <div className="flex items-start gap-3 p-4 bg-red-50/60 dark:bg-red-950/20 border border-red-200/60 dark:border-red-800/30 rounded-xl backdrop-blur-sm">
          <div className="w-9 h-9 rounded-lg bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-500" strokeWidth={1.8} />
          </div>
          <div className="text-sm text-red-800 dark:text-red-300 pt-1.5">
            {redesBloqueadas.length > 0 && (
              <span>
                <strong>{redesBloqueadas.length}</strong> rede(s) bloqueada(s) ({totalMembrosAfetados} membros afetados).{' '}
              </span>
            )}
            {redesEmRisco.length > 0 && (
              <span>
                <strong>{redesEmRisco.length}</strong> rede(s) em risco com inadimplentes.
              </span>
            )}
          </div>
        </div>
      )}

      {/* Cards métricas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Redes Bloqueadas</CardTitle>
            <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <Ban className="w-4 h-4 text-red-500" strokeWidth={1.8} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">{redesBloqueadas.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Em Risco</CardTitle>
            <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <ShieldAlert className="w-4 h-4 text-amber-500" strokeWidth={1.8} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{redesEmRisco.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Valor Total Devido</CardTitle>
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-muted-foreground" strokeWidth={1.8} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalValorDevido)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Média Dias Bloqueio</CardTitle>
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
              <Clock className="w-4 h-4 text-muted-foreground" strokeWidth={1.8} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mediaDiasBloqueio} dias</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveTab('bloqueados')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'bloqueados'
              ? 'border-red-500 text-red-600'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Ban className="w-4 h-4 inline mr-1.5" />
          Bloqueados ({redesBloqueadas.length})
        </button>
        <button
          onClick={() => setActiveTab('em-risco')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'em-risco'
              ? 'border-amber-500 text-amber-600'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <ShieldAlert className="w-4 h-4 inline mr-1.5" />
          Em Risco ({redesEmRisco.length})
        </button>
      </div>

      {/* ── Tab: Bloqueados ─────────────────────────────────── */}
      {activeTab === 'bloqueados' && (
        <>
          {filteredBloqueadas.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Shield className="w-16 h-16 mb-4 opacity-30" />
                <p className="text-lg font-medium">
                  {search ? 'Nenhuma rede encontrada' : 'Nenhuma rede bloqueada'}
                </p>
                <p className="text-sm">
                  {search
                    ? 'Ajuste a busca para encontrar resultados'
                    : 'Todas as redes estão operando normalmente'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {filteredBloqueadas.map((rede) => (
                <Card key={rede.redeId} className="border-red-200/60 dark:border-red-800/30 border overflow-hidden">
                  <div className="h-1 bg-gradient-to-r from-red-500 via-red-400 to-rose-500" />
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-red-100/80 dark:bg-red-900/30 rounded-xl flex items-center justify-center">
                          <Ban className="w-6 h-6 text-red-500" strokeWidth={1.8} />
                        </div>
                        <div>
                          <CardTitle>Rede {rede.lider?.clienteNome ?? rede.redeId}</CardTitle>
                          <p className="text-sm text-muted-foreground mt-1">
                            Bloqueada há {rede.diasBloqueio} dias · {rede.membros.length} membros
                          </p>
                        </div>
                      </div>
                      <Badge className="bg-red-100/80 text-red-700 dark:bg-red-900/30 dark:text-red-300 border border-red-200/60 dark:border-red-800/30 hover:bg-red-100/80 dark:hover:bg-red-900/30">BLOQUEADO</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {rede.bloqueios.map((b) => (
                      <div key={b.id} className="p-4 bg-red-50/60 dark:bg-red-950/20 rounded-xl border border-red-100/60 dark:border-red-800/20">
                        <p className="text-sm font-medium text-red-800 dark:text-red-300">
                          Motivo:{' '}
                          {b.motivo === 'inadimplencia'
                            ? 'Inadimplência'
                            : b.motivo === 'fraude'
                            ? 'Fraude'
                            : b.motivo === 'manual'
                            ? 'Manual'
                            : b.motivo}
                        </p>
                        <p className="text-sm text-red-700 dark:text-red-400 mt-1">
                          Causador: <strong>{b.causadorNome}</strong>
                        </p>
                        {b.descricao && <p className="text-sm text-red-600 dark:text-red-400 mt-1">{b.descricao}</p>}
                        <p className="text-xs text-red-500 dark:text-red-500 mt-2">
                          Desde: {new Date(b.bloqueadoEm).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                    ))}

                    <div>
                      <h4 className="text-sm font-semibold mb-3">Membros Afetados</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {rede.membros.map((membro) => {
                          const isInadimplente = membro.clienteStatus === 'vencido';
                          const isLider = membro.nivel === 1;
                          return (
                            <div
                              key={membro.id}
                              className={`p-3 rounded-lg text-center ${
                                isInadimplente ? 'bg-red-100 dark:bg-red-950/40' : 'bg-muted'
                              }`}
                            >
                              <div
                                className={`w-8 h-8 rounded-full mx-auto flex items-center justify-center font-semibold text-sm mb-1 text-white ${
                                  isInadimplente
                                    ? 'bg-red-600'
                                    : isLider
                                    ? 'bg-primary'
                                    : 'bg-muted-foreground'
                                }`}
                              >
                                {membro.clienteNome.charAt(0)}
                              </div>
                              <div className="text-sm font-medium truncate">{membro.clienteNome}</div>
                              <div className="text-xs text-muted-foreground">
                                N{membro.nivel} · {formatCurrency(membro.clienteValor)}
                              </div>
                              {isLider && (
                                <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 text-xs mt-1">Líder</Badge>
                              )}
                              {isInadimplente && (
                                <Badge className="bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300 text-xs mt-1">Inadimplente</Badge>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-muted rounded-lg text-sm">
                      <span className="text-muted-foreground">Valor total devido na rede:</span>
                      <span className="font-bold text-red-600 dark:text-red-400">{formatCurrency(rede.totalDevido)}</span>
                    </div>

                    <div className="flex gap-3">
                      <Button
                        className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                        onClick={() => setConfirmDesbloqueio(rede.bloqueios[0])}
                      >
                        <Unlock className="w-4 h-4 mr-2" strokeWidth={1.8} />
                        Desbloquear Rede
                      </Button>
                      <Button variant="outline">
                        <MessageSquare className="w-4 h-4 mr-2" strokeWidth={1.8} />
                        Contatar Inadimplente
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Tab: Em Risco ──────────────────────────────────── */}
      {activeTab === 'em-risco' && (
        <>
          {filteredEmRisco.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Shield className="w-16 h-16 mb-4 opacity-30" />
                <p className="text-lg font-medium">
                  {search ? 'Nenhuma rede encontrada' : 'Nenhuma rede em risco'}
                </p>
                <p className="text-sm">
                  {search
                    ? 'Ajuste a busca para encontrar resultados'
                    : 'Todas as redes estão sem inadimplentes'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredEmRisco.map((rede) => (
                <Card key={rede.redeId} className="border-amber-200/60 dark:border-amber-800/30 border overflow-hidden">
                  <div className="h-1 bg-gradient-to-r from-amber-500 via-yellow-400 to-orange-400" />
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-amber-100/80 dark:bg-amber-900/30 rounded-xl flex items-center justify-center">
                          <ShieldAlert className="w-6 h-6 text-amber-500" strokeWidth={1.8} />
                        </div>
                        <div>
                          <CardTitle>Rede {rede.lider?.clienteNome ?? rede.redeId}</CardTitle>
                          <p className="text-sm text-muted-foreground mt-1">
                            {rede.membros.length} membros · {rede.inadimplentes.length} inadimplente(s)
                          </p>
                        </div>
                      </div>
                      <Badge className="bg-amber-100/80 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/30 hover:bg-amber-100/80 dark:hover:bg-amber-900/30">EM RISCO</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Inadimplentes destaque */}
                    <div className="p-4 bg-amber-50/60 dark:bg-amber-950/20 rounded-xl border border-amber-100/60 dark:border-amber-800/20">
                      <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-2">
                        <AlertTriangle className="w-4 h-4 inline mr-1" strokeWidth={1.8} />
                        Inadimplentes nesta rede
                      </h4>
                      <div className="space-y-2">
                        {rede.inadimplentes.map((m) => (
                          <div key={m.id} className="flex items-center justify-between text-sm p-2 bg-white dark:bg-card rounded">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center text-xs font-bold">
                                {m.clienteNome.charAt(0)}
                              </div>
                              <span className="font-medium text-foreground">{m.clienteNome}</span>
                              <span className="text-xs text-muted-foreground">(Nível {m.nivel})</span>
                            </div>
                            <span className="font-semibold text-red-600 dark:text-red-400">{formatCurrency(m.clienteValor)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Status members */}
                    <div className="grid grid-cols-3 gap-3 text-center text-sm">
                      <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/20 rounded-xl border border-emerald-100/60 dark:border-emerald-800/20">
                        <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{rede.emDia}</div>
                        <div className="text-xs text-muted-foreground">Em dia</div>
                      </div>
                      <div className="p-3 bg-yellow-50/60 dark:bg-yellow-950/20 rounded-xl border border-yellow-100/60 dark:border-yellow-800/20">
                        <div className="text-lg font-bold text-yellow-600 dark:text-yellow-400">{rede.aVencer}</div>
                        <div className="text-xs text-muted-foreground">À vencer</div>
                      </div>
                      <div className="p-3 bg-red-50/60 dark:bg-red-950/20 rounded-xl border border-red-100/60 dark:border-red-800/20">
                        <div className="text-lg font-bold text-red-600 dark:text-red-400">{rede.inadimplentes.length}</div>
                        <div className="text-xs text-muted-foreground">Vencidos</div>
                      </div>
                    </div>

                    {/* Valor */}
                    <div className="flex items-center justify-between p-3 bg-muted rounded-lg text-sm">
                      <span className="text-muted-foreground">Valor em risco:</span>
                      <span className="font-bold text-amber-600 dark:text-amber-400">{formatCurrency(rede.totalDevido)}</span>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3">
                      <Button
                        variant="destructive"
                        onClick={() =>
                          openBloquearDialog(rede.redeId, rede.inadimplentes[0]?.clienteId)
                        }
                      >
                        <Lock className="w-4 h-4 mr-2" />
                        Bloquear Rede
                      </Button>
                      <Button variant="outline">
                        <MessageSquare className="w-4 h-4 mr-2" />
                        Notificar Rede
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Confirm desbloqueio dialog */}
      <Dialog open={!!confirmDesbloqueio} onOpenChange={() => setConfirmDesbloqueio(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Desbloqueio</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja desbloquear a rede{' '}
              <strong>{confirmDesbloqueio?.redeId}</strong>? Todos os membros serão reativados.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDesbloqueio(null)}>
              Cancelar
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
              onClick={() => confirmDesbloqueio && handleDesbloquear(confirmDesbloqueio)}
              disabled={desbloquearMutation.isPending}
            >
              {desbloquearMutation.isPending ? 'Desbloqueando...' : 'Confirmar Desbloqueio'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bloquear rede dialog */}
      <Dialog open={showBloquearDialog} onOpenChange={setShowBloquearDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bloquear Rede</DialogTitle>
            <DialogDescription>
              O bloqueio solidário afeta todos os membros da rede. Preencha o motivo abaixo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Rede</Label>
              <Input value={bloquearForm.redeId} disabled className="bg-muted" />
            </div>
            <div>
              <Label>Motivo *</Label>
              <Select
                value={bloquearForm.motivo}
                onValueChange={(v) =>
                  setBloquearForm({ ...bloquearForm, motivo: v as 'inadimplencia' | 'fraude' | 'manual' })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o motivo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inadimplencia">Inadimplência</SelectItem>
                  <SelectItem value="fraude">Fraude</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Descrição (opcional)</Label>
              <Textarea
                value={bloquearForm.descricao}
                onChange={(e) => setBloquearForm({ ...bloquearForm, descricao: e.target.value })}
                placeholder="Descreva o motivo do bloqueio..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBloquearDialog(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleBloquear}
              disabled={!bloquearForm.motivo || bloquearMutation.isPending}
            >
              <Lock className="w-4 h-4 mr-2" />
              {bloquearMutation.isPending ? 'Bloqueando...' : 'Confirmar Bloqueio'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
