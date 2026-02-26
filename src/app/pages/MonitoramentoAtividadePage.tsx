/**
 * @module MonitoramentoAtividadePage
 * @description Monitoramento em tempo real da atividade dos funcionários.
 *
 * Dashboard com status online/offline/ausente de cada membro da equipe,
 * tempo de sessão atual, horas trabalhadas (hoje/semana/mês) e timeline
 * de atividades recentes. Filtros por departamento e status.
 *
 * @route /equipe/monitoramento
 * @access Protegido — perfis admin, gerente
 * @see mockFuncionarios, SessaoAtividade
 */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Search, Clock, Activity, Monitor, Coffee, LogIn, LogOut, AlertTriangle } from 'lucide-react';
import { mockFuncionarios, type Funcionario } from '../lib/mockData';

function formatarHoras(minutos: number) {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
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

const sessoesHoje = [
  { funcionario: 'Carlos Lima', entrada: '08:02', saida: null, duracao: '6h 28min', status: 'ativo', ip: '192.168.1.45' },
  { funcionario: 'Maria Santos', entrada: '08:15', saida: null, duracao: '6h 15min', status: 'ativo', ip: '192.168.1.32' },
  { funcionario: 'Pedro Oliveira', entrada: '07:50', saida: '12:00', duracao: '4h 10min', status: 'pausa', ip: '192.168.1.78' },
  { funcionario: 'Fernanda Souza', entrada: '09:00', saida: null, duracao: '5h 30min', status: 'ativo', ip: '10.0.0.15' },
  { funcionario: 'Ricardo Alves', entrada: '08:30', saida: '11:45', duracao: '3h 15min', status: 'encerrado', ip: '192.168.1.91' },
];

const alertas = [
  { tipo: 'warning', funcionario: 'Pedro Oliveira', mensagem: 'Pausa acima de 2 horas', hora: '12:45' },
  { tipo: 'info', funcionario: 'Ricardo Alves', mensagem: 'Saiu antes do horário (11:45)', hora: '11:45' },
  { tipo: 'warning', funcionario: 'Fernanda Souza', mensagem: 'Nenhuma atividade nos últimos 30min', hora: '14:00' },
];

export default function MonitoramentoAtividadePage() {
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos');

  const funcionariosFiltrados = mockFuncionarios.filter(f => {
    const matchBusca = f.nome.toLowerCase().includes(busca.toLowerCase());
    const matchStatus = filtroStatus === 'todos' || f.status === filtroStatus;
    return matchBusca && matchStatus;
  });

  const onlineCount = mockFuncionarios.filter(f => f.status === 'online').length;
  const ausenteCount = mockFuncionarios.filter(f => f.status === 'ausente').length;
  const offlineCount = mockFuncionarios.filter(f => f.status === 'offline').length;

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

      <Tabs defaultValue="equipe">
        <TabsList>
          <TabsTrigger value="equipe">Equipe</TabsTrigger>
          <TabsTrigger value="sessoes">Sessões de Hoje</TabsTrigger>
          <TabsTrigger value="alertas">Alertas</TabsTrigger>
        </TabsList>

        <TabsContent value="equipe" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {funcionariosFiltrados.map(func => (
              <Card key={func.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center font-semibold text-primary">
                          {func.nome.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${getStatusColor(func.status)}`} />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{func.nome}</p>
                        <p className="text-xs text-muted-foreground capitalize">{func.cargo}</p>
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
        </TabsContent>

        <TabsContent value="sessoes" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 text-sm font-semibold">Funcionário</th>
                    <th className="text-center p-3 text-sm font-semibold">Entrada</th>
                    <th className="text-center p-3 text-sm font-semibold">Saída</th>
                    <th className="text-center p-3 text-sm font-semibold">Duração</th>
                    <th className="text-center p-3 text-sm font-semibold">Status</th>
                    <th className="text-center p-3 text-sm font-semibold">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {sessoesHoje.map((s, i) => (
                    <tr key={i} className="border-b hover:bg-muted/30">
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
                      <td className="p-3 text-sm text-center">
                        <Badge variant={s.status === 'ativo' ? 'default' : 'secondary'} className="text-xs">
                          {s.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-sm text-center font-mono text-muted-foreground">{s.ip}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alertas" className="mt-4">
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
