/**
 * @module ExportarDadosPage
 * @description Exportação de dados em massa do sistema.
 *
 * Seletor de entidade (clientes, empréstimos, parcelas, etc.),
 * escolha de campos via checkboxes, filtros avançados e formato
 * de saída (CSV, Excel, JSON). Prévia dos dados antes do download.
 *
 * @route /relatorios/exportar
 * @access Protegido — perfis admin, gerente
 */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Checkbox } from '../components/ui/checkbox';
import { Badge } from '../components/ui/badge';
import { Download, FileSpreadsheet, FileText, Calendar, Filter, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const relatoriosDisponiveis = [
  { id: 'clientes', label: 'Cadastro de Clientes', descricao: 'Dados completos dos clientes ativos', formato: ['xlsx', 'csv', 'pdf'] },
  { id: 'emprestimos', label: 'Empréstimos Ativos', descricao: 'Lista de todos os empréstimos com status', formato: ['xlsx', 'csv', 'pdf'] },
  { id: 'parcelas', label: 'Parcelas a Vencer', descricao: 'Parcelas com vencimento no período', formato: ['xlsx', 'csv'] },
  { id: 'inadimplentes', label: 'Clientes Inadimplentes', descricao: 'Clientes com parcelas atrasadas', formato: ['xlsx', 'csv', 'pdf'] },
  { id: 'fluxo_caixa', label: 'Fluxo de Caixa', descricao: 'Entradas e saídas do período', formato: ['xlsx', 'pdf'] },
  { id: 'comissoes', label: 'Comissões e Bônus', descricao: 'Comissões geradas por indicações', formato: ['xlsx', 'csv'] },
  { id: 'cobrancas', label: 'Histórico de Cobranças', descricao: 'Log de todas as ações de cobrança', formato: ['xlsx', 'csv'] },
  { id: 'indicacoes', label: 'Rede de Indicações', descricao: 'Indicadores e suas conversões', formato: ['xlsx', 'csv', 'pdf'] },
];

const historicoExportacoes = [
  { id: 1, relatorio: 'Empréstimos Ativos', formato: 'XLSX', data: '2025-07-09 14:30', usuario: 'Carlos Admin', tamanho: '2.4 MB' },
  { id: 2, relatorio: 'Inadimplentes', formato: 'PDF', data: '2025-07-09 10:15', usuario: 'Carlos Admin', tamanho: '1.1 MB' },
  { id: 3, relatorio: 'Fluxo de Caixa', formato: 'XLSX', data: '2025-07-08 16:45', usuario: 'Maria Gerente', tamanho: '3.2 MB' },
  { id: 4, relatorio: 'Cadastro de Clientes', formato: 'CSV', data: '2025-07-08 09:00', usuario: 'Carlos Admin', tamanho: '890 KB' },
];

export default function ExportarDadosPage() {
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [formato, setFormato] = useState('xlsx');
  const [periodo, setPeriodo] = useState('mes_atual');
  const [exportando, setExportando] = useState(false);

  const toggleRelatorio = (id: string) => {
    setSelecionados(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleExportar = () => {
    if (selecionados.length === 0) {
      toast.error('Selecione ao menos um relatório');
      return;
    }
    setExportando(true);
    setTimeout(() => {
      setExportando(false);
      toast.success(`${selecionados.length} relatório(s) exportado(s) com sucesso!`);
      setSelecionados([]);
    }, 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Exportar Dados</h1>
          <p className="text-muted-foreground mt-1">Exporte relatórios em diferentes formatos</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Seleção de relatórios */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Selecione os Relatórios</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {relatoriosDisponiveis.map(rel => (
                <div key={rel.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${selecionados.includes(rel.id) ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                  onClick={() => toggleRelatorio(rel.id)}
                >
                  <Checkbox checked={selecionados.includes(rel.id)} className="mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{rel.label}</span>
                      <div className="flex gap-1">
                        {rel.formato.map(f => (
                          <Badge key={f} variant="outline" className="text-[10px] px-1.5 py-0">{f.toUpperCase()}</Badge>
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{rel.descricao}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Configurações e ação */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Configurações</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Formato</label>
                <Select value={formato} onValueChange={setFormato}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="xlsx"><div className="flex items-center gap-2"><FileSpreadsheet className="w-4 h-4" /> Excel (.xlsx)</div></SelectItem>
                    <SelectItem value="csv"><div className="flex items-center gap-2"><FileText className="w-4 h-4" /> CSV (.csv)</div></SelectItem>
                    <SelectItem value="pdf"><div className="flex items-center gap-2"><FileText className="w-4 h-4" /> PDF (.pdf)</div></SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Período</label>
                <Select value={periodo} onValueChange={setPeriodo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mes_atual">Mês Atual</SelectItem>
                    <SelectItem value="mes_anterior">Mês Anterior</SelectItem>
                    <SelectItem value="trimestre">Último Trimestre</SelectItem>
                    <SelectItem value="semestre">Último Semestre</SelectItem>
                    <SelectItem value="ano">Ano Inteiro</SelectItem>
                    <SelectItem value="personalizado">Personalizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="pt-2">
                <p className="text-sm text-muted-foreground mb-3">
                  {selecionados.length} relatório(s) selecionado(s)
                </p>
                <Button onClick={handleExportar} disabled={exportando || selecionados.length === 0} className="w-full">
                  {exportando ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Exportando...</>
                  ) : (
                    <><Download className="w-4 h-4 mr-2" /> Exportar</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Exportações Recentes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {historicoExportacoes.map(exp => (
                <div key={exp.id} className="flex items-center justify-between p-2 rounded border">
                  <div>
                    <p className="text-xs font-medium">{exp.relatorio}</p>
                    <p className="text-[10px] text-muted-foreground">{exp.data} · {exp.tamanho}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px]">{exp.formato}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
