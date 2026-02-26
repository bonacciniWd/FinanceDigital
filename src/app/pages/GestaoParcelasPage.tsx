/**
 * @module GestaoParcelasPage
 * @description Gestão avançada de parcelas com operações em lote.
 *
 * Funcionalidades principais:
 * - **Quitar em lote**: selecionar múltiplas parcelas e liquidar
 * - **Editar série**: alterar datas de vencimento ou valores de
 *   várias parcelas simultaneamente
 * - **Excluir em lote**: cancelar parcelas selecionadas
 *
 * Tabela com seleção via checkbox, filtros por status (pendente,
 * paga, atrasada, cancelada) e busca por cliente/empréstimo.
 *
 * @route /clientes/gestao-parcelas
 * @access Protegido — perfis admin, gerente, operador
 * @see mockParcelas, mockEmprestimos
 */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Checkbox } from '../components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Search, CheckCircle, Edit, Trash2, DollarSign, Calendar, AlertTriangle } from 'lucide-react';
import { useParcelas } from '../hooks/useParcelas';
import type { Parcela } from '../lib/mockData';

export default function GestaoParcelasPage() {
  const { data: parcelasData = [], isLoading } = useParcelas();
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [modalQuitacao, setModalQuitacao] = useState(false);
  const [modalEdicao, setModalEdicao] = useState(false);
  const [modalExclusao, setModalExclusao] = useState(false);
  const [novoValor, setNovoValor] = useState('');
  const [novoDia, setNovoDia] = useState('');

  // Sync hook data into local state for in-page mutations
  if (!initialized && parcelasData.length > 0) {
    setParcelas(parcelasData);
    setInitialized(true);
  }

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { label: string; className: string }> = {
      pendente: { label: 'Pendente', className: 'bg-yellow-100 text-yellow-800' },
      paga: { label: 'Paga', className: 'bg-green-100 text-green-800' },
      vencida: { label: 'Vencida', className: 'bg-red-100 text-red-800' },
      cancelada: { label: 'Cancelada', className: 'bg-muted text-muted-foreground' },
    };
    const c = configs[status];
    return <Badge className={c.className}>{c.label}</Badge>;
  };

  const filtered = parcelas.filter(p => {
    const matchSearch = !searchTerm || p.clienteNome.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = filtroStatus === 'todos' || p.status === filtroStatus;
    return matchSearch && matchStatus;
  });

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map(p => p.id));
    }
  };

  const selectedParcelas = parcelas.filter(p => selectedIds.includes(p.id));
  const totalSelecionado = selectedParcelas.reduce((acc, p) => acc + p.valor, 0);

  const handleQuitarLote = () => {
    setParcelas(prev => prev.map(p =>
      selectedIds.includes(p.id) ? { ...p, status: 'paga' as const, dataPagamento: new Date().toISOString().split('T')[0] } : p
    ));
    setSelectedIds([]);
    setModalQuitacao(false);
  };

  const handleEditarLote = () => {
    setParcelas(prev => prev.map(p => {
      if (!selectedIds.includes(p.id)) return p;
      const updated = { ...p };
      if (novoValor) updated.valor = parseFloat(novoValor);
      if (novoDia) {
        const date = new Date(p.dataVencimento);
        date.setDate(parseInt(novoDia));
        updated.dataVencimento = date.toISOString().split('T')[0];
      }
      return updated;
    }));
    setSelectedIds([]);
    setModalEdicao(false);
    setNovoValor('');
    setNovoDia('');
  };

  const handleExcluirLote = () => {
    setParcelas(prev => prev.map(p =>
      selectedIds.includes(p.id) ? { ...p, status: 'cancelada' as const } : p
    ));
    setSelectedIds([]);
    setModalExclusao(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Gestão de Parcelas</h1>
          <p className="text-muted-foreground mt-1">Quitação, edição e exclusão em lote</p>
        </div>
      </div>

      {/* Ações em Lote */}
      {selectedIds.length > 0 && (
        <Card className="border-primary bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold text-primary">{selectedIds.length} parcela(s) selecionada(s)</span>
                <span className="ml-4 text-sm text-muted-foreground">Total: {formatCurrency(totalSelecionado)}</span>
              </div>
              <div className="flex gap-3">
                <Button className="bg-green-600 hover:bg-green-700" onClick={() => setModalQuitacao(true)}>
                  <CheckCircle className="w-4 h-4 mr-2" />Quitar em Lote
                </Button>
                <Button variant="outline" onClick={() => setModalEdicao(true)}>
                  <Edit className="w-4 h-4 mr-2" />Editar Série
                </Button>
                <Button variant="destructive" onClick={() => setModalExclusao(true)}>
                  <Trash2 className="w-4 h-4 mr-2" />Excluir em Lote
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="vencida">Vencida</SelectItem>
                <SelectItem value="paga">Paga</SelectItem>
                <SelectItem value="cancelada">Cancelada</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex-1 min-w-64 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar por cliente..." className="pl-10" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 w-10">
                    <Checkbox checked={selectedIds.length === filtered.length && filtered.length > 0} onCheckedChange={toggleAll} />
                  </th>
                  <th className="text-left py-3 font-medium text-muted-foreground">Cliente</th>
                  <th className="text-center py-3 font-medium text-muted-foreground">Nº</th>
                  <th className="text-right py-3 font-medium text-muted-foreground">Valor Original</th>
                  <th className="text-right py-3 font-medium text-muted-foreground">Juros/Multa</th>
                  <th className="text-right py-3 font-medium text-muted-foreground">Valor Total</th>
                  <th className="text-center py-3 font-medium text-muted-foreground">Vencimento</th>
                  <th className="text-center py-3 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className={`border-b hover:bg-muted/50 ${selectedIds.includes(p.id) ? 'bg-blue-50' : ''}`}>
                    <td className="py-3">
                      <Checkbox checked={selectedIds.includes(p.id)} onCheckedChange={() => toggleSelect(p.id)} />
                    </td>
                    <td className="py-3 font-medium">{p.clienteNome}</td>
                    <td className="py-3 text-center">{p.numero}</td>
                    <td className="py-3 text-right">{formatCurrency(p.valorOriginal)}</td>
                    <td className="py-3 text-right text-red-600">
                      {p.juros + p.multa > 0 ? `+${formatCurrency(p.juros + p.multa)}` : '-'}
                    </td>
                    <td className="py-3 text-right font-bold">{formatCurrency(p.valor)}</td>
                    <td className="py-3 text-center">{new Date(p.dataVencimento).toLocaleDateString('pt-BR')}</td>
                    <td className="py-3 text-center">{getStatusBadge(p.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Modal Quitação em Lote */}
      <Dialog open={modalQuitacao} onOpenChange={setModalQuitacao}>
        <DialogContent>
          <DialogHeader><DialogTitle>Quitar Parcelas em Lote</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-5 h-5 text-green-600" />
                <span className="font-semibold text-green-800">Resumo da Quitação</span>
              </div>
              <p className="text-sm text-green-700">{selectedIds.length} parcela(s) selecionada(s)</p>
              <p className="text-2xl font-bold text-green-800 mt-2">{formatCurrency(totalSelecionado)}</p>
            </div>
            <div className="space-y-2">
              {selectedParcelas.map(p => (
                <div key={p.id} className="flex justify-between text-sm py-2 border-b">
                  <span>{p.clienteNome} - Parcela {p.numero}</span>
                  <span className="font-medium">{formatCurrency(p.valor)}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={handleQuitarLote}>Confirmar Quitação</Button>
              <Button className="flex-1" variant="outline" onClick={() => setModalQuitacao(false)}>Cancelar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Edição em Lote */}
      <Dialog open={modalEdicao} onOpenChange={setModalEdicao}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Série de Parcelas</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-700">Editando {selectedIds.length} parcela(s)</p>
              <p className="text-xs text-blue-600 mt-1">Deixe em branco os campos que não deseja alterar</p>
            </div>
            <div className="space-y-3">
              <div>
                <Label>Novo valor da parcela (R$)</Label>
                <Input type="number" placeholder="Ex: 500.00" value={novoValor} onChange={e => setNovoValor(e.target.value)} />
              </div>
              <div>
                <Label>Novo dia do mês para vencimento</Label>
                <Select value={novoDia} onValueChange={setNovoDia}>
                  <SelectTrigger><SelectValue placeholder="Selecione o dia" /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                      <SelectItem key={d} value={String(d)}>Dia {d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-3">
              <Button className="flex-1 bg-primary hover:bg-primary/90" onClick={handleEditarLote}>Aplicar Alterações</Button>
              <Button className="flex-1" variant="outline" onClick={() => setModalEdicao(false)}>Cancelar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Exclusão em Lote */}
      <Dialog open={modalExclusao} onOpenChange={setModalExclusao}>
        <DialogContent>
          <DialogHeader><DialogTitle>Excluir Parcelas em Lote</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-red-50 rounded-lg border border-red-200">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <span className="font-semibold text-red-800">Atenção!</span>
              </div>
              <p className="text-sm text-red-700">Você está prestes a cancelar {selectedIds.length} parcela(s).</p>
              <p className="text-sm text-red-700 mt-1">Valor total: {formatCurrency(totalSelecionado)}</p>
              <p className="text-sm text-red-600 font-medium mt-2">Esta ação não pode ser desfeita.</p>
            </div>
            <div className="space-y-2">
              {selectedParcelas.map(p => (
                <div key={p.id} className="flex justify-between text-sm py-2 border-b">
                  <span>{p.clienteNome} - Parcela {p.numero}</span>
                  <span className="font-medium">{formatCurrency(p.valor)}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <Button className="flex-1" variant="destructive" onClick={handleExcluirLote}>Confirmar Exclusão</Button>
              <Button className="flex-1" variant="outline" onClick={() => setModalExclusao(false)}>Cancelar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
