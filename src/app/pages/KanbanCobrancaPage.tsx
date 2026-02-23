import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { MessageSquare, Phone, HandshakeIcon, ChevronRight } from 'lucide-react';
import { mockClientes } from '../lib/mockData';

interface KanbanColumn {
  id: string;
  title: string;
  color: string;
  count: number;
}

const columns: KanbanColumn[] = [
  { id: 'a_vencer', title: 'A VENCER', color: 'bg-yellow-100 border-yellow-300', count: 12 },
  { id: 'vencidos', title: 'VENCIDOS', color: 'bg-red-100 border-red-300', count: 28 },
  { id: 'negociacao', title: 'NEGOCIAÇÃO', color: 'bg-orange-100 border-orange-300', count: 15 },
  { id: 'acordos', title: 'ACORDOS', color: 'bg-green-100 border-green-300', count: 7 },
];

export default function KanbanCobrancaPage() {
  const [selectedClient, setSelectedClient] = useState<any>(null);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  // Organizar clientes por coluna
  const getClientsByColumn = (columnId: string) => {
    if (columnId === 'a_vencer') {
      return mockClientes.filter((c) => c.status === 'a_vencer').slice(0, 3);
    } else if (columnId === 'vencidos') {
      return mockClientes.filter((c) => c.status === 'vencido').slice(0, 3);
    } else if (columnId === 'negociacao') {
      return mockClientes.filter((c) => c.status === 'vencido').slice(3, 5);
    } else if (columnId === 'acordos') {
      return mockClientes.filter((c) => c.status === 'em_dia').slice(0, 2);
    }
    return [];
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'a_vencer':
        return '🟡';
      case 'vencido':
        return '🔴';
      case 'negociacao':
        return '🟠';
      case 'acordos':
        return '🟢';
      default:
        return '⚪';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Kanban - Cobrança</h1>
        <p className="text-muted-foreground mt-1">
          Gerencie o fluxo de cobrança visualmente
        </p>
      </div>

      {/* Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((column) => (
          <div key={column.id} className="flex-shrink-0 w-80">
            <Card className={`${column.color} border-2`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold">
                    {column.title}
                  </CardTitle>
                  <Badge variant="secondary" className="font-semibold">
                    {column.count}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {getClientsByColumn(column.id).map((cliente) => (
                  <Card
                    key={cliente.id}
                    className="bg-white hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => setSelectedClient(cliente)}
                  >
                    <CardContent className="p-4">
                      <div className="space-y-2">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="font-semibold text-sm">{cliente.nome}</div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {cliente.email}
                            </div>
                          </div>
                          <span className="text-lg">
                            {getStatusIcon(column.id)}
                          </span>
                        </div>

                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Valor:</span>
                            <span className="font-semibold">
                              {formatCurrency(cliente.valor)}
                            </span>
                          </div>

                          {cliente.diasAtraso ? (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Atraso:</span>
                              <span className="font-semibold text-red-600">
                                {cliente.diasAtraso} dias
                              </span>
                            </div>
                          ) : (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Vence:</span>
                              <span className="font-semibold">
                                {new Date(cliente.vencimento).toLocaleDateString('pt-BR', {
                                  day: '2-digit',
                                  month: '2-digit',
                                })}
                              </span>
                            </div>
                          )}

                          {cliente.ultimoContato && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Último contato:</span>
                              <span className="font-medium">{cliente.ultimoContato}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex gap-1 pt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 h-8 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                            }}
                          >
                            <MessageSquare className="w-3 h-3 mr-1" />
                            Chat
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-2"
                            onClick={(e) => {
                              e.stopPropagation();
                            }}
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {/* Ver mais */}
                {column.count > 3 && (
                  <Button variant="ghost" className="w-full text-xs" size="sm">
                    Ver mais {column.count - 3} cliente(s)
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        ))}
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total em Cobrança
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(324500)}</div>
            <p className="text-xs text-muted-foreground mt-1">62 clientes</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Em Negociação
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(67500)}</div>
            <p className="text-xs text-muted-foreground mt-1">15 clientes</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Acordos Fechados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">7</div>
            <p className="text-xs text-muted-foreground mt-1">neste mês</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Taxa de Conversão
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">32%</div>
            <p className="text-xs text-muted-foreground mt-1">negociação → acordo</p>
          </CardContent>
        </Card>
      </div>

      {/* Modal de Detalhes */}
      <Dialog open={!!selectedClient} onOpenChange={() => setSelectedClient(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="w-12 h-12 bg-primary text-white rounded-full flex items-center justify-center font-semibold text-lg">
                {selectedClient?.nome.charAt(0)}
              </div>
              <div>
                <div>{selectedClient?.nome}</div>
                <div className="text-sm text-muted-foreground font-normal">
                  {formatCurrency(selectedClient?.valor || 0)}
                </div>
              </div>
            </DialogTitle>
          </DialogHeader>

          {selectedClient && (
            <div className="space-y-4">
              {selectedClient.diasAtraso && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="text-sm font-medium text-red-800">
                    Vencido há {selectedClient.diasAtraso} dias
                  </div>
                </div>
              )}

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Último contato:</span>
                  <span className="font-medium">
                    {selectedClient.ultimoContato || 'Nenhum'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Telefone:</span>
                  <span className="font-medium">{selectedClient.telefone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email:</span>
                  <span className="font-medium">{selectedClient.email}</span>
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Button className="flex-1" variant="outline">
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Chat
                </Button>
                <Button className="flex-1" variant="outline">
                  <Phone className="w-4 h-4 mr-2" />
                  Ligar
                </Button>
                <Button className="flex-1 bg-[#2EC4B6] hover:bg-[#2EC4B6]/90">
                  <HandshakeIcon className="w-4 h-4 mr-2" />
                  Proposta
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
