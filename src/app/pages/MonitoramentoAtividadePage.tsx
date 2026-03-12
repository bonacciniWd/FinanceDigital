/**
 * @module MonitoramentoAtividadePage
 * @description Monitoramento em tempo real da atividade dos funcionários.
 *
 * Dashboard com status online/offline/ausente de cada membro da equipe,
 * sessões de hoje (dados reais de sessoes_atividade), e alertas
 * computados a partir de dados reais de sessão/funcionário.
 *
 * @route /equipe/monitoramento
 * @access Protegido — perfis admin, gerente
 */
import { useState, useMemo } from 'react';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Search, Monitor, Coffee, LogIn, LogOut, AlertTriangle, Loader2 } from 'lucide-react';
import { useFuncionarios, useAllSessoesHoje } from '../hooks/useFuncionarios';
import type { Funcionario } from '../lib/view-types';

function formatarHoras(valor: number) {
  const h = Math.floor(valor);
  const m = Math.round((valor - h) * 60);
  return `${h}h ${m.toString().padStart(2, '0')}min`;
}

function formatarMinutos(minutos: number) {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m}min`;
  return `${h}h ${m.toString().padStart(2, '0')}min`;
}

function getStatusColor(status: string) {
  switch (status) {
    case 'online': return 'bg-green-500';
    case 'ausente': return 'bg-yellow-500';
    case 'offline': return 'bg-muted-foreground';
    default: return 'bg-muted-foreground';
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'online': return <Badge className="bg-green-100 text-green-800">Online</Badge>;
    case 'ausente': return <Badge className="bg-yellow-100 text-yellow-800">Ausente</Badge>;
    case 'offline': return <Badge variant="secondary">Offline</Badge>;
    default: return <Badge variant="secondary">{status}</Badge>;
  }
}

function formatHora(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export default function MonitoramentoAtividadePage() {
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const { data: funcionarios = [], isLoading: loadingFunc } = useFuncionarios();
  const { data: sessoesRaw = [], isLoading: loadingSessoes } = useAllSessoesHoje();

  const funcionariosFiltrados = funcionarios.filter((f: Funcionario) => {
    const matchBusca = f.nome.toLowerCase().includes(busca.toLowerCase());
    const matchStatus = filtroStatus === 'todos' || f.status === filtroStatus;
    return matchBusca && matchStatus;
  });

  const onlineCount = funcionarios.filter((f: Funcionario) => f.status === 'online').length;
  const ausenteCount = funcionarios.filter((f: Funcionario) => f.status === 'ausente').length;
  const offlineCount = funcionarios.filter((f: Funcionario) => f.status === 'offline').length;

  // Transformar sessões brutas em dados para tabela
  const sessoesHoje = useMemo(() => {
    return sessoesRaw.map((s: any) => {
      const inicio = new Date(s.inicio);
      const fim = s.fim ? new Date(s.fim) : null;
      const agora = new Date();
      // Sempre calcular duração a partir de inicio→fim (ou inicio→agora se aberta)
      const fimReal = fim ?? agora;
      const duracaoMin = Math.max(0, Math.round((fimReal.getTime() - inicio.getTime()) / 60000));
      const nome = s.funcionarios?.nome ?? 'Desconhecido';

      let status = 'ativo';
      if (fim) status = 'encerrado';

      return {
        id: s.id,
        funcionario: nome,
        entrada: formatHora(s.inicio),
        saida: fim ? formatHora(s.fim) : null,
        duracao: formatarMinutos(duracaoMin),
        status,
        acoes: s.acoes ?? 0,
        paginas: s.paginas?.length ?? 0,
      };
    });
  }, [sessoesRaw]);

  // Gerar alertas a partir de dados reais
  const alertas = useMemo(() => {
    const result: Array<{ tipo: 'warning' | 'info'; funcionario: string; mensagem: string; hora: string }> = [];
    const agora = new Date();

    // Funcionários ausentes há mais de 30 min
    funcionarios.forEach((f: Funcionario) => {
      if (f.status === 'ausente' && f.ultimaAtividade) {
        const diff = Math.round((agora.getTime() - new Date(f.ultimaAtividade).getTime()) / 60000);
        if (diff > 30) {
          result.push({
            tipo: 'warning',
            funcionario: f.nome,
            mensagem: `Ausente há ${formatarMinutos(diff)}`,
            hora: formatHora(f.ultimaAtividade),
          });
        }
      }
    });

    // Sessões encerradas curtas (menos de 4h)
    sessoesRaw.forEach((s: any) => {
      if (s.fim) {
        const durMin = Math.max(0, Math.round((new Date(s.fim).getTime() - new Date(s.inicio).getTime()) / 60000));
        if (durMin < 240 && durMin > 0) {
          const nome = s.funcionarios?.nome ?? 'Desconhecido';
          result.push({
            tipo: 'info',
            funcionario: nome,
            mensagem: `Sessão curta: ${formatarMinutos(durMin)} (encerrada às ${formatHora(s.fim)})`,
            hora: formatHora(s.fim),
          });
        }
      }
    });

    // Online mas sem atividade recente (> 20 min)
    funcionarios.forEach((f: Funcionario) => {
      if (f.status === 'online' && f.ultimaAtividade) {
        const diff = Math.round((agora.getTime() - new Date(f.ultimaAtividade).getTime()) / 60000);
        if (diff > 20) {
          result.push({
            tipo: 'warning',
            funcionario: f.nome,
            mensagem: `Online mas sem atividade há ${formatarMinutos(diff)}`,
            hora: formatHora(f.ultimaAtividade),
          });
        }
      }
    });

    return result;
  }, [funcionarios, sessoesRaw]);

  const isLoading = loadingFunc || loadingSessoes;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Monitoramento de Atividade</h1>
          <p className="text-muted-foreground mt-1">Acompanhe login, atividade e horas da equipe em tempo real</p>
        </div>
      </div>

      {/* Status resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <Monitor className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{onlineCount}</p>
              <p className="text-xs text-muted-foreground">Online agora</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
              <Coffee className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{ausenteCount}</p>
              <p className="text-xs text-muted-foreground">Ausente</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center">
              <LogOut className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold">{offlineCount}</p>
              <p className="text-xs text-muted-foreground">Offline</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{alertas.length}</p>
              <p className="text-xs text-muted-foreground">Alertas hoje</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar funcionário..." className="pl-10" value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="online">Online</SelectItem>
            <SelectItem value="ausente">Ausente</SelectItem>
            <SelectItem value="offline">Offline</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <Tabs defaultValue="equipe">
          <TabsList>
            <TabsTrigger value="equipe">Equipe ({funcionarios.length})</TabsTrigger>
            <TabsTrigger value="sessoes">Sessões de Hoje ({sessoesHoje.length})</TabsTrigger>
            <TabsTrigger value="alertas">Alertas ({alertas.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="equipe" className="mt-4">
            {funcionariosFiltrados.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  Nenhum funcionário encontrado com esses filtros.
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {funcionariosFiltrados.map((func: Funcionario) => (
                  <Card key={func.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center font-semibold text-primary">
                              {func.nome.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                            </div>
                            <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${getStatusColor(func.status)}`} />
                          </div>
                          <div>
                            <p className="font-semibold text-sm">{func.nome}</p>
                            <p className="text-xs text-muted-foreground capitalize">{func.role}</p>
                          </div>
                        </div>
                        {getStatusBadge(func.status)}
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-muted/50 rounded p-2">
                          <p className="text-lg font-bold">{formatarHoras(func.horasHoje)}</p>
                          <p className="text-[10px] text-muted-foreground">Hoje</p>
                        </div>
                        <div className="bg-muted/50 rounded p-2">
                          <p className="text-lg font-bold">{formatarHoras(func.horasSemana)}</p>
                          <p className="text-[10px] text-muted-foreground">Semana</p>
                        </div>
                        <div className="bg-muted/50 rounded p-2">
                          <p className="text-lg font-bold">{formatarHoras(func.horasMes)}</p>
                          <p className="text-[10px] text-muted-foreground">Mês</p>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          Atividades hoje: <strong>{func.atividadesHoje}/{func.metaDiaria}</strong>
                        </span>
                        <div className="w-24 bg-muted rounded-full h-2">
                          <div
                            className={`rounded-full h-2 transition-all ${func.atividadesHoje >= func.metaDiaria ? 'bg-green-500' : 'bg-primary'}`}
                            style={{ width: `${Math.min((func.atividadesHoje / func.metaDiaria) * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="sessoes" className="mt-4">
            <Card>
              <CardContent className="p-0">
                {sessoesHoje.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    Nenhuma sessão registrada hoje.
                  </div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 text-sm font-semibold">Funcionário</th>
                        <th className="text-center p-3 text-sm font-semibold">Entrada</th>
                        <th className="text-center p-3 text-sm font-semibold">Saída</th>
                        <th className="text-center p-3 text-sm font-semibold">Duração</th>
                        <th className="text-center p-3 text-sm font-semibold">Ações</th>
                        <th className="text-center p-3 text-sm font-semibold">Páginas</th>
                        <th className="text-center p-3 text-sm font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessoesHoje.map((s) => (
                        <tr key={s.id} className="border-b hover:bg-muted/30">
                          <td className="p-3 text-sm font-medium">{s.funcionario}</td>
                          <td className="p-3 text-sm text-center">
                            <div className="flex items-center justify-center gap-1">
                              <LogIn className="w-3 h-3 text-green-600" /> {s.entrada}
                            </div>
                          </td>
                          <td className="p-3 text-sm text-center">
                            {s.saida ? (
                              <div className="flex items-center justify-center gap-1">
                                <LogOut className="w-3 h-3 text-red-600" /> {s.saida}
                              </div>
                            ) : '—'}
                          </td>
                          <td className="p-3 text-sm text-center font-mono">{s.duracao}</td>
                          <td className="p-3 text-sm text-center">{s.acoes}</td>
                          <td className="p-3 text-sm text-center">{s.paginas}</td>
                          <td className="p-3 text-sm text-center">
                            <Badge variant={s.status === 'ativo' ? 'default' : s.status === 'inativo' ? 'destructive' : 'secondary'} className="text-xs">
                              {s.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="alertas" className="mt-4">
            {alertas.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  Nenhum alerta no momento. Tudo funcionando normalmente.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {alertas.map((alerta, i) => (
                  <Card key={i} className={alerta.tipo === 'warning' ? 'border-yellow-200 bg-yellow-50' : 'border-blue-200 bg-blue-50'}>
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${alerta.tipo === 'warning' ? 'bg-yellow-100' : 'bg-blue-100'}`}>
                        <AlertTriangle className={`w-5 h-5 ${alerta.tipo === 'warning' ? 'text-yellow-600' : 'text-blue-600'}`} />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-sm">{alerta.funcionario}</p>
                        <p className="text-xs text-muted-foreground">{alerta.mensagem}</p>
                      </div>
                      <span className="text-xs text-muted-foreground">{alerta.hora}</span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
