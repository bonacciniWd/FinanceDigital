import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Search, Grid, List, MessageSquare, Edit, History, Ban, Eye } from 'lucide-react';
import { mockClientes } from '../lib/mockData';
import { StatusBadge } from '../components/StatusBadge';

type ViewMode = 'table' | 'cards';

export default function ClientesPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [selectedClient, setSelectedClient] = useState<any>(null);

  const filteredClientes = mockClientes.filter((cliente) => {
    const matchesSearch = cliente.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cliente.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'todos' || cliente.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('pt-BR');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Lista de Clientes</h1>
          <p className="text-muted-foreground mt-1">
            {filteredClientes.length} cliente(s) encontrado(s)
          </p>
        </div>
        <Button className="bg-[#0A2472] hover:bg-[#1A3A9F]">
          Novo Cliente
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="em_dia">Em dia</SelectItem>
                <SelectItem value="a_vencer">À vencer</SelectItem>
                <SelectItem value="vencido">Vencidos</SelectItem>
              </SelectContent>
            </Select>

            <Select defaultValue="todos">
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Data" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as datas</SelectItem>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="90">Últimos 90 dias</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex-1 min-w-64">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou email..."
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant={viewMode === 'table' ? 'default' : 'outline'}
                size="icon"
                onClick={() => setViewMode('table')}
              >
                <List className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === 'cards' ? 'default' : 'outline'}
                size="icon"
                onClick={() => setViewMode('cards')}
              >
                <Grid className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Visualização em Tabela */}
      {viewMode === 'table' && (
        <Card>
          <CardContent className="pt-6">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium">Cliente</th>
                    <th className="text-left py-3 px-4 font-medium">Status</th>
                    <th className="text-left py-3 px-4 font-medium">Valor</th>
                    <th className="text-left py-3 px-4 font-medium">Vencimento</th>
                    <th className="text-left py-3 px-4 font-medium">Score</th>
                    <th className="text-left py-3 px-4 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClientes.map((cliente) => (
                    <tr key={cliente.id} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-4">
                        <div>
                          <div className="font-medium">{cliente.nome}</div>
                          <div className="text-sm text-muted-foreground flex items-center gap-2">
                            📧 {cliente.email}
                          </div>
                          <div className="text-sm text-muted-foreground flex items-center gap-2">
                            📱 {cliente.telefone}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge status={cliente.status} />
                      </td>
                      <td className="py-3 px-4 font-medium">
                        {formatCurrency(cliente.valor)}
                      </td>
                      <td className="py-3 px-4">{formatDate(cliente.vencimento)}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                            <div
                              className="h-full bg-[#2EC4B6]"
                              style={{ width: `${(cliente.scoreInterno / 1000) * 100}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium w-12">
                            {cliente.scoreInterno}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" title="Chat">
                            <MessageSquare className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Ver detalhes"
                            onClick={() => setSelectedClient(cliente)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" title="Editar">
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" title="Histórico">
                            <History className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Visualização em Cards */}
      {viewMode === 'cards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredClientes.map((cliente) => (
            <Card key={cliente.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-primary text-white rounded-full flex items-center justify-center font-semibold text-lg">
                      {cliente.nome.charAt(0)}
                    </div>
                    <div>
                      <CardTitle className="text-base">{cliente.nome}</CardTitle>
                      <p className="text-sm text-muted-foreground">{cliente.email}</p>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status:</span>
                  <StatusBadge status={cliente.status} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Valor:</span>
                  <span className="font-medium">{formatCurrency(cliente.valor)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Vencimento:</span>
                  <span className="font-medium">{formatDate(cliente.vencimento)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Score:</span>
                  <span className="font-medium">{cliente.scoreInterno}/1000</span>
                </div>
                {cliente.indicou && cliente.indicou.length > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Indicações:</span>
                    <Badge variant="secondary">{cliente.indicou.length}</Badge>
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" size="sm" className="flex-1">
                    <MessageSquare className="w-4 h-4 mr-1" />
                    Chat
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => setSelectedClient(cliente)}
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    Ver
                  </Button>
                  <Button variant="outline" size="sm">
                    <Edit className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal de Detalhes */}
      <Dialog open={!!selectedClient} onOpenChange={() => setSelectedClient(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="w-12 h-12 bg-primary text-white rounded-full flex items-center justify-center font-semibold text-lg">
                {selectedClient?.nome.charAt(0)}
              </div>
              <div>
                <div>{selectedClient?.nome}</div>
                <div className="text-sm text-muted-foreground font-normal">
                  {selectedClient?.email} • {selectedClient?.telefone}
                </div>
              </div>
            </DialogTitle>
          </DialogHeader>

          {selectedClient && (
            <div className="space-y-6">
              <div>
                <h3 className="font-medium mb-3">📊 Informações Financeiras</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Limite:</span>
                    <div className="font-medium">{formatCurrency(selectedClient.limiteCredito)}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Utilizado:</span>
                    <div className="font-medium">{formatCurrency(selectedClient.creditoUtilizado)}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Disponível:</span>
                    <div className="font-medium text-green-600">
                      {formatCurrency(selectedClient.limiteCredito - selectedClient.creditoUtilizado)}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Score Interno:</span>
                    <div className="font-medium">{selectedClient.scoreInterno}/1000</div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-medium mb-3">📅 Histórico de Pagamentos</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm py-2 border-b">
                    <span>• 15/05/2026 - Parcela 5/12</span>
                    <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Pago</Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm py-2 border-b">
                    <span>• 15/04/2026 - Parcela 4/12</span>
                    <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Pago</Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm py-2 border-b">
                    <span>• 15/03/2026 - Parcela 3/12</span>
                    <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Pago</Badge>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-medium mb-3">🕸️ Rede de Indicações</h3>
                <div className="text-sm space-y-1">
                  <p>
                    <span className="text-muted-foreground">Indicou:</span>{' '}
                    <span className="font-medium">
                      {selectedClient.indicou?.length || 0} pessoa(s)
                    </span>
                  </p>
                  {selectedClient.indicadoPor && (
                    <p>
                      <span className="text-muted-foreground">Indicado por:</span>{' '}
                      <span className="font-medium">
                        {mockClientes.find((c) => c.id === selectedClient.indicadoPor)?.nome}
                      </span>
                    </p>
                  )}
                  <p>
                    <span className="text-muted-foreground">Bônus acumulado:</span>{' '}
                    <span className="font-medium text-green-600">
                      {formatCurrency(selectedClient.bonusAcumulado)}
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <Button className="flex-1 bg-[#0A2472] hover:bg-[#1A3A9F]">
                  <Edit className="w-4 h-4 mr-2" />
                  Editar
                </Button>
                <Button variant="outline" className="flex-1">
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Chat
                </Button>
                <Button variant="destructive" className="flex-1">
                  <Ban className="w-4 h-4 mr-2" />
                  Bloquear
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
