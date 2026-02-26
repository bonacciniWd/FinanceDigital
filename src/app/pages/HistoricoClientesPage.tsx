/**
 * @module HistoricoClientesPage
 * @description Histórico completo de atividades dos clientes.
 *
 * Timeline de eventos: empréstimos, pagamentos, atrasos,
 * renegociações e comunicações. Filtros por tipo de evento,
 * período e cliente específico.
 *
 * @route /clientes/historico
 * @access Protegido — todos os perfis autenticados
 * @see mockClientes, mockEmprestimos
 */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Search, FileText, Download, ArrowUpDown } from 'lucide-react';


interface HistoricoItem {
  id: string;
  clienteNome: string;
  tipo: 'pagamento' | 'emprestimo' | 'negociacao' | 'contato' | 'alteracao';
  descricao: string;
  valor?: number;
  data: string;
  usuario: string;
}

const mockHistorico: HistoricoItem[] = [
  { id: 'h1', clienteNome: 'João Silva', tipo: 'pagamento', descricao: 'Pagamento da parcela 5/12', valor: 500, data: '2026-02-15T14:30:00', usuario: 'Sistema' },
  { id: 'h2', clienteNome: 'Maria Santos', tipo: 'contato', descricao: 'Tentativa de contato via WhatsApp - sem resposta', data: '2026-02-14T10:20:00', usuario: 'Carlos Cobrador' },
  { id: 'h3', clienteNome: 'Pedro Oliveira', tipo: 'emprestimo', descricao: 'Novo empréstimo aprovado - 24 parcelas', valor: 8000, data: '2026-02-13T09:00:00', usuario: 'Maria Gerente' },
  { id: 'h4', clienteNome: 'Ana Costa', tipo: 'negociacao', descricao: 'Proposta de renegociação enviada - desconto 15%', valor: 2125, data: '2026-02-12T16:45:00', usuario: 'Carlos Cobrador' },
  { id: 'h5', clienteNome: 'Carlos Souza', tipo: 'contato', descricao: 'Ligação realizada - cliente promete pagamento para 25/02', data: '2026-02-11T11:30:00', usuario: 'Carlos Cobrador' },
  { id: 'h6', clienteNome: 'Fernanda Lima', tipo: 'pagamento', descricao: 'Pagamento da parcela 4/12', valor: 440, data: '2026-02-10T08:15:00', usuario: 'Sistema' },
  { id: 'h7', clienteNome: 'Roberto Alves', tipo: 'alteracao', descricao: 'Alteração de data de vencimento: dia 25 → dia 10', data: '2026-02-09T14:00:00', usuario: 'João Admin' },
  { id: 'h8', clienteNome: 'Patricia Gomes', tipo: 'contato', descricao: 'E-mail de cobrança automático enviado', data: '2026-02-08T07:00:00', usuario: 'Sistema' },
  { id: 'h9', clienteNome: 'Lucas Mendes', tipo: 'pagamento', descricao: 'Pagamento parcial da parcela', valor: 150, data: '2026-02-07T15:20:00', usuario: 'Sistema' },
  { id: 'h10', clienteNome: 'João Silva', tipo: 'pagamento', descricao: 'Pagamento da parcela 4/12', valor: 500, data: '2026-01-15T14:30:00', usuario: 'Sistema' },
];

export default function HistoricoClientesPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('todos');

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const getTipoBadge = (tipo: string) => {
    const configs: Record<string, { label: string; className: string }> = {
      pagamento: { label: 'Pagamento', className: 'bg-green-100 text-green-800' },
      emprestimo: { label: 'Empréstimo', className: 'bg-blue-100 text-blue-800' },
      negociacao: { label: 'Negociação', className: 'bg-purple-100 text-purple-800' },
      contato: { label: 'Contato', className: 'bg-yellow-100 text-yellow-800' },
      alteracao: { label: 'Alteração', className: 'bg-muted text-muted-foreground' },
    };
    const c = configs[tipo];
    return <Badge className={c.className}>{c.label}</Badge>;
  };

  const filtered = mockHistorico.filter(h => {
    const matchSearch = !searchTerm || h.clienteNome.toLowerCase().includes(searchTerm.toLowerCase());
    const matchTipo = filtroTipo === 'todos' || h.tipo === filtroTipo;
    return matchSearch && matchTipo;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Histórico de Clientes</h1>
          <p className="text-muted-foreground mt-1">Registro completo de todas as atividades</p>
        </div>
        <Button variant="outline"><Download className="w-4 h-4 mr-2" />Exportar</Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <Select value={filtroTipo} onValueChange={setFiltroTipo}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os tipos</SelectItem>
                <SelectItem value="pagamento">Pagamentos</SelectItem>
                <SelectItem value="emprestimo">Empréstimos</SelectItem>
                <SelectItem value="negociacao">Negociações</SelectItem>
                <SelectItem value="contato">Contatos</SelectItem>
                <SelectItem value="alteracao">Alterações</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex-1 min-w-64 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar por cliente..." className="pl-10" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-0">
            {filtered.map((item, index) => (
              <div key={item.id} className="flex gap-4 pb-6 relative">
                {index < filtered.length - 1 && (
                  <div className="absolute left-[19px] top-10 bottom-0 w-0.5 bg-border" />
                )}
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0 z-10">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 bg-muted/50 rounded-lg p-4 hover:bg-muted transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <span className="font-semibold">{item.clienteNome}</span>
                      <span className="mx-2">{getTipoBadge(item.tipo)}</span>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(item.data).toLocaleDateString('pt-BR')} {new Date(item.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{item.descricao}</p>
                  <div className="flex items-center justify-between mt-2">
                    {item.valor && <span className="text-sm font-medium text-green-600">{formatCurrency(item.valor)}</span>}
                    <span className="text-xs text-muted-foreground">por {item.usuario}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
