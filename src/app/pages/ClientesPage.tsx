/**
 * @module ClientesPage
 * @description Listagem e gestão de clientes do sistema.
 *
 * Tabela paginada com busca, filtro por status e ordenação.
 * Permite cadastrar novo cliente (com campo sexo para mensagens
 * personalizadas), editar e visualizar detalhes. Exibe CPF,
 * telefone, limite de crédito e score interno de cada cliente.
 * Dados reais via Supabase com hooks React Query.
 *
 * @route /clientes
 * @access Protegido — todos os perfis autenticados
 */
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Search, Grid, List, Edit, History, Ban, Eye, Phone, Loader2, Plus } from 'lucide-react';
import { useClientes, useIndicados, useCreateCliente, useUpdateCliente } from '../hooks/useClientes';
import { useParcelasByCliente } from '../hooks/useParcelas';
import { StatusBadge } from '../components/StatusBadge';
import { toast } from 'sonner';
import type { Cliente } from '../lib/view-types';
import type { ClienteInsert, ClienteUpdate, Sexo } from '../lib/database.types';

type ViewMode = 'table' | 'cards';

type ClienteFormData = {
  nome: string;
  email: string;
  telefone: string;
  cpf: string;
  sexo: Sexo;
  vencimento: string;
  limiteCredito: string;
};

const EMPTY_FORM: ClienteFormData = {
  nome: '', email: '', telefone: '', cpf: '', sexo: 'masculino',
  vencimento: new Date().toISOString().slice(0, 10), limiteCredito: '0',
};

export default function ClientesPage() {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [selectedClient, setSelectedClient] = useState<Cliente | null>(null);

  // Create / Edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ClienteFormData>(EMPTY_FORM);

  const { data: clientes = [], isLoading } = useClientes();
  const { data: indicados = [] } = useIndicados(selectedClient?.id);
  const { data: parcelasCliente = [], isLoading: loadingParcelas } = useParcelasByCliente(selectedClient?.id);
  const createCliente = useCreateCliente();
  const updateCliente = useUpdateCliente();

  const isSaving = createCliente.isPending || updateCliente.isPending;

  const filteredClientes = clientes.filter((cliente) => {
    const matchesSearch = cliente.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cliente.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'todos' || cliente.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const openCreateModal = useCallback(() => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }, []);

  const openEditModal = useCallback((c: Cliente) => {
    setEditingId(c.id);
    setForm({
      nome: c.nome,
      email: c.email,
      telefone: c.telefone,
      cpf: c.cpf || '',
      sexo: c.sexo,
      vencimento: c.vencimento.slice(0, 10),
      limiteCredito: String(c.limiteCredito),
    });
    setSelectedClient(null);
    setModalOpen(true);
  }, []);

  const handleSave = useCallback(() => {
    if (!form.nome || !form.email || !form.telefone) {
      toast.error('Preencha nome, email e telefone');
      return;
    }
    if (editingId) {
      const updates: ClienteUpdate = {
        nome: form.nome,
        email: form.email,
        telefone: form.telefone,
        cpf: form.cpf || null,
        sexo: form.sexo,
        vencimento: form.vencimento,
        limite_credito: Number(form.limiteCredito) || 0,
      };
      updateCliente.mutate(
        { id: editingId, data: updates },
        {
          onSuccess: () => { toast.success('Cliente atualizado'); setModalOpen(false); },
          onError: (err) => toast.error(`Erro: ${err.message}`),
        },
      );
    } else {
      const payload: ClienteInsert = {
        nome: form.nome,
        email: form.email,
        telefone: form.telefone,
        cpf: form.cpf || null,
        sexo: form.sexo,
        vencimento: form.vencimento,
        limite_credito: Number(form.limiteCredito) || 0,
      };
      createCliente.mutate(payload, {
        onSuccess: () => { toast.success('Cliente criado'); setModalOpen(false); setForm(EMPTY_FORM); },
        onError: (err) => toast.error(`Erro: ${err.message}`),
      });
    }
  }, [form, editingId, createCliente, updateCliente]);

  const handleBloquear = useCallback((c: Cliente) => {
    const novoStatus = c.status === 'vencido' ? 'em_dia' : 'vencido';
    updateCliente.mutate(
      { id: c.id, data: { status: novoStatus } },
      {
        onSuccess: () => {
          toast.success(novoStatus === 'vencido' ? 'Cliente bloqueado' : 'Cliente desbloqueado');
          setSelectedClient(null);
        },
        onError: (err) => toast.error(`Erro: ${err.message}`),
      },
    );
  }, [updateCliente]);

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
            {isLoading ? 'Carregando...' : `${filteredClientes.length} cliente(s) encontrado(s)`}
          </p>
        </div>
        <Button className="bg-primary hover:bg-primary/90" onClick={openCreateModal}>
          <Plus className="w-4 h-4 mr-2" />Novo Cliente
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
                              className="h-full bg-secondary"
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
                          <Button
                            variant="ghost"
                            size="sm"
                            title="WhatsApp"
                            className="text-green-600 hover:text-green-700 hover:bg-green-50"
                            onClick={() => navigate(`/whatsapp?telefone=${encodeURIComponent(cliente.telefone)}`)}
                          >
                            <Phone className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Ver detalhes"
                            onClick={() => setSelectedClient(cliente)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" title="Editar" onClick={() => openEditModal(cliente)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" title="Histórico" onClick={() => navigate('/clientes/historico')}>
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
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-green-600 border-green-200 hover:bg-green-50 hover:text-green-700"
                    onClick={() => navigate(`/whatsapp?telefone=${encodeURIComponent(cliente.telefone)}`)}
                  >
                    <Phone className="w-4 h-4 mr-1" />
                    WhatsApp
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
                  <Button variant="outline" size="sm" onClick={() => openEditModal(cliente)}>
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
                {loadingParcelas ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : parcelasCliente.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma parcela registrada.</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {parcelasCliente.map((p) => {
                      const statusColor = p.status === 'paga'
                        ? 'bg-green-100 text-green-800 hover:bg-green-100'
                        : p.status === 'vencida'
                        ? 'bg-red-100 text-red-800 hover:bg-red-100'
                        : 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100';
                      const statusLabel = p.status === 'paga' ? 'Pago' : p.status === 'vencida' ? 'Vencida' : 'Pendente';
                      return (
                        <div key={p.id} className="flex items-center justify-between text-sm py-2 border-b">
                          <span>• {formatDate(p.dataVencimento)} - Parcela {p.numero} - {formatCurrency(p.valor)}</span>
                          <Badge className={statusColor}>{statusLabel}</Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <h3 className="font-medium mb-3">🕸️ Rede de Indicações</h3>
                <div className="text-sm space-y-1">
                  <p>
                    <span className="text-muted-foreground">Indicou:</span>{' '}
                    <span className="font-medium">
                      {indicados.length} pessoa(s)
                    </span>
                  </p>
                  {indicados.length > 0 && (
                    <div className="ml-4 mt-1 space-y-1">
                      {indicados.map((ind: any) => (
                        <p key={ind.id} className="text-xs text-muted-foreground">
                          • {ind.nome}
                        </p>
                      ))}
                    </div>
                  )}
                  {selectedClient.indicadoPor && (
                    <p>
                      <span className="text-muted-foreground">Indicado por:</span>{' '}
                      <span className="font-medium">
                        {clientes.find((c) => c.id === selectedClient.indicadoPor)?.nome ?? 'N/A'}
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
                <Button className="flex-1 bg-primary hover:bg-primary/90" onClick={() => openEditModal(selectedClient!)}>
                  <Edit className="w-4 h-4 mr-2" />
                  Editar
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 text-green-600 border-green-200 hover:bg-green-50"
                  onClick={() => {
                    setSelectedClient(null);
                    navigate(`/whatsapp?telefone=${encodeURIComponent(selectedClient!.telefone)}`);
                  }}
                >
                  <Phone className="w-4 h-4 mr-2" />
                  WhatsApp
                </Button>
                <Button variant="destructive" className="flex-1" onClick={() => handleBloquear(selectedClient!)}>
                  <Ban className="w-4 h-4 mr-2" />
                  {selectedClient!.status === 'vencido' ? 'Desbloquear' : 'Bloquear'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* Modal Criar / Editar Cliente */}
      <Dialog open={modalOpen} onOpenChange={(open) => { if (!open) { setModalOpen(false); setEditingId(null); setForm(EMPTY_FORM); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingId ? 'Editar Cliente' : 'Novo Cliente'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Nome *</Label>
                <Input value={form.nome} onChange={(e) => setForm(p => ({ ...p, nome: e.target.value }))} placeholder="Nome completo" />
              </div>
              <div>
                <Label>Email *</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))} placeholder="email@exemplo.com" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Telefone *</Label>
                <Input value={form.telefone} onChange={(e) => setForm(p => ({ ...p, telefone: e.target.value }))} placeholder="5511999999999" />
              </div>
              <div>
                <Label>CPF</Label>
                <Input value={form.cpf} onChange={(e) => setForm(p => ({ ...p, cpf: e.target.value }))} placeholder="000.000.000-00" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Sexo</Label>
                <Select value={form.sexo} onValueChange={(v) => setForm(p => ({ ...p, sexo: v as Sexo }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="masculino">Masculino</SelectItem>
                    <SelectItem value="feminino">Feminino</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Vencimento</Label>
                <Input type="date" value={form.vencimento} onChange={(e) => setForm(p => ({ ...p, vencimento: e.target.value }))} />
              </div>
              <div>
                <Label>Limite Crédito</Label>
                <Input type="number" value={form.limiteCredito} onChange={(e) => setForm(p => ({ ...p, limiteCredito: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button className="flex-1 bg-primary hover:bg-primary/90" onClick={handleSave} disabled={isSaving || !form.nome || !form.email || !form.telefone}>
                {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingId ? 'Atualizar' : 'Criar Cliente'}
              </Button>
              <Button className="flex-1" variant="outline" onClick={() => { setModalOpen(false); setEditingId(null); setForm(EMPTY_FORM); }}>
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
