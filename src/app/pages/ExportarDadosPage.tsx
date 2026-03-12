/**
 * @module ExportarDadosPage
 * @description Exportação de dados em massa — gera CSV real do Supabase.
 *
 * Seletor de entidade (clientes, empréstimos, parcelas, etc.),
 * escolha de campos via checkboxes, filtros avançados e formato
 * de saída (CSV). Gera e faz download de um CSV real com dados
 * do Supabase.
 *
 * @route /relatorios/exportar
 * @access Protegido — perfis admin, gerente
 */
import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Checkbox } from '../components/ui/checkbox';
import { Badge } from '../components/ui/badge';
import { Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import * as clientesService from '../services/clientesService';
import * as emprestimosService from '../services/emprestimosService';
import * as parcelasService from '../services/parcelasService';
import * as kanbanService from '../services/kanbanCobrancaService';
import { getMembrosRede } from '../services/redeIndicacoesService';
import { dbClienteToView } from '../lib/adapters';
import { dbEmprestimoToView } from '../lib/adapters';
import { dbParcelaToView } from '../lib/adapters';
import { dbKanbanCobrancaToView } from '../lib/adapters';
import { dbRedeIndicacaoToView } from '../lib/adapters';

const relatoriosDisponiveis = [
  { id: 'clientes', label: 'Cadastro de Clientes', descricao: 'Dados completos dos clientes ativos', formato: ['csv'] },
  { id: 'emprestimos', label: 'Empréstimos Ativos', descricao: 'Lista de todos os empréstimos com status', formato: ['csv'] },
  { id: 'parcelas', label: 'Parcelas a Vencer', descricao: 'Parcelas com vencimento no período', formato: ['csv'] },
  { id: 'inadimplentes', label: 'Clientes Inadimplentes', descricao: 'Clientes com parcelas atrasadas', formato: ['csv'] },
  { id: 'fluxo_caixa', label: 'Fluxo de Caixa', descricao: 'Parcelas pagas (entradas) do período', formato: ['csv'] },
  { id: 'comissoes', label: 'Comissões e Bônus', descricao: 'Clientes com bônus acumulado por indicações', formato: ['csv'] },
  { id: 'cobrancas', label: 'Pipeline de Cobrança', descricao: 'Todos os cards do kanban de cobrança', formato: ['csv'] },
  { id: 'indicacoes', label: 'Rede de Indicações', descricao: 'Indicadores e suas informações', formato: ['csv'] },
];

/** Gera e faz download de um CSV (BOM UTF-8 p/ Excel) */
function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const csvContent = [headers, ...rows]
    .map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Filtra dados por período */
function filtrarPorData<T>(items: T[], campo: keyof T, periodo: string): T[] {
  const now = new Date();
  let desde: Date;
  switch (periodo) {
    case 'mes_atual':
      desde = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'mes_anterior':
      desde = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      break;
    case 'trimestre':
      desde = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      break;
    case 'semestre':
      desde = new Date(now.getFullYear(), now.getMonth() - 6, 1);
      break;
    case 'ano':
      desde = new Date(now.getFullYear(), 0, 1);
      break;
    default:
      return items;
  }
  return items.filter((item) => {
    const val = item[campo];
    if (!val) return true;
    return new Date(val as string) >= desde;
  });
}

export default function ExportarDadosPage() {
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [formato, setFormato] = useState('csv');
  const [periodo, setPeriodo] = useState('mes_atual');
  const [exportando, setExportando] = useState(false);
  const [exportacoesRecentes, setExportacoesRecentes] = useState<
    { relatorio: string; formato: string; data: string; registros: number }[]
  >([]);

  const toggleRelatorio = (id: string) => {
    setSelecionados((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const exportarUm = useCallback(
    async (id: string): Promise<{ nome: string; registros: number }> => {
      const agora = new Date().toISOString().slice(0, 10);

      switch (id) {
        case 'clientes': {
          const raw = await clientesService.getClientes();
          const data = raw.map(dbClienteToView);
          downloadCsv(`clientes_${agora}.csv`, [
            'Nome', 'Email', 'Telefone', 'CPF', 'Status', 'Valor', 'Vencimento',
            'Dias Atraso', 'Score Interno', 'Limite Crédito', 'Bônus Acumulado',
          ], data.map((c) => [
            c.nome, c.email, c.telefone, c.cpf ?? '', c.status,
            String(c.valor), c.vencimento, String(c.diasAtraso ?? 0),
            String(c.scoreInterno), String(c.limiteCredito), String(c.bonusAcumulado),
          ]));
          return { nome: 'Cadastro de Clientes', registros: data.length };
        }

        case 'emprestimos': {
          const raw = await emprestimosService.getEmprestimos();
          const data = raw.map(dbEmprestimoToView);
          downloadCsv(`emprestimos_${agora}.csv`, [
            'Cliente', 'Valor', 'Parcelas', 'Parcelas Pagas', 'Valor Parcela',
            'Taxa Juros', 'Data Contrato', 'Próx. Vencimento', 'Status',
          ], data.map((e) => [
            e.clienteNome ?? '', String(e.valor), String(e.parcelas),
            String(e.parcelasPagas), String(e.valorParcela), String(e.taxaJuros),
            e.dataContrato, e.proximoVencimento, e.status,
          ]));
          return { nome: 'Empréstimos', registros: data.length };
        }

        case 'parcelas': {
          const raw = await parcelasService.getParcelas('pendente');
          const data = filtrarPorData(raw.map(dbParcelaToView), 'dataVencimento', periodo);
          downloadCsv(`parcelas_a_vencer_${agora}.csv`, [
            'Cliente', 'Nº', 'Valor', 'Valor Original', 'Data Vencimento',
            'Juros', 'Multa', 'Desconto', 'Status',
          ], data.map((p) => [
            p.clienteNome, String(p.numero), String(p.valor),
            String(p.valorOriginal), p.dataVencimento, String(p.juros),
            String(p.multa), String(p.desconto), p.status,
          ]));
          return { nome: 'Parcelas a Vencer', registros: data.length };
        }

        case 'inadimplentes': {
          const raw = await clientesService.getClientes('vencido');
          const data = raw.map(dbClienteToView);
          downloadCsv(`inadimplentes_${agora}.csv`, [
            'Nome', 'Telefone', 'Email', 'CPF', 'Valor em Atraso',
            'Dias Atraso', 'Último Contato',
          ], data.map((c) => [
            c.nome, c.telefone, c.email, c.cpf ?? '', String(c.valor),
            String(c.diasAtraso ?? 0), c.ultimoContato ?? '',
          ]));
          return { nome: 'Inadimplentes', registros: data.length };
        }

        case 'fluxo_caixa': {
          const raw = await parcelasService.getParcelas('paga');
          const data = filtrarPorData(raw.map(dbParcelaToView), 'dataPagamento', periodo);
          downloadCsv(`fluxo_caixa_${agora}.csv`, [
            'Cliente', 'Nº Parcela', 'Valor Pago', 'Data Pagamento',
            'Juros', 'Multa', 'Desconto',
          ], data.map((p) => [
            p.clienteNome, String(p.numero), String(p.valor),
            p.dataPagamento ?? '', String(p.juros), String(p.multa),
            String(p.desconto),
          ]));
          return { nome: 'Fluxo de Caixa', registros: data.length };
        }

        case 'comissoes': {
          const raw = await clientesService.getClientes();
          const data = raw.map(dbClienteToView).filter((c) => c.bonusAcumulado > 0);
          downloadCsv(`comissoes_bonus_${agora}.csv`, [
            'Nome', 'Email', 'Telefone', 'Bônus Acumulado', 'Status',
            'Indicados',
          ], data.map((c) => [
            c.nome, c.email, c.telefone, String(c.bonusAcumulado),
            c.status, String(c.indicou?.length ?? 0),
          ]));
          return { nome: 'Comissões e Bônus', registros: data.length };
        }

        case 'cobrancas': {
          const raw = await kanbanService.getCardsCobranca();
          const data = raw.map(dbKanbanCobrancaToView);
          downloadCsv(`cobrancas_${agora}.csv`, [
            'Cliente', 'Telefone', 'Etapa', 'Valor Dívida', 'Dias Atraso',
            'Tentativas Contato', 'Último Contato', 'Responsável', 'Observação',
          ], data.map((c) => [
            c.clienteNome, c.clienteTelefone, c.etapa, String(c.valorDivida),
            String(c.diasAtraso), String(c.tentativasContato),
            c.ultimoContato ?? '', c.responsavelNome, c.observacao ?? '',
          ]));
          return { nome: 'Pipeline de Cobrança', registros: data.length };
        }

        case 'indicacoes': {
          const raw = await getMembrosRede();
          const data = raw.map(dbRedeIndicacaoToView);
          downloadCsv(`indicacoes_${agora}.csv`, [
            'Nome', 'Email', 'Telefone', 'Rede', 'Nível', 'Status',
            'Valor', 'Bônus Acumulado', 'Score',
          ], data.map((m) => [
            m.clienteNome, m.clienteEmail, m.clienteTelefone,
            m.redeId, String(m.nivel), m.status, String(m.clienteValor),
            String(m.clienteBonusAcumulado), String(m.clienteScoreInterno),
          ]));
          return { nome: 'Rede de Indicações', registros: data.length };
        }

        default:
          throw new Error(`Tipo de relatório desconhecido: ${id}`);
      }
    },
    [periodo]
  );

  const handleExportar = async () => {
    if (selecionados.length === 0) {
      toast.error('Selecione ao menos um relatório');
      return;
    }
    setExportando(true);
    try {
      const resultados: { relatorio: string; formato: string; data: string; registros: number }[] = [];
      for (const id of selecionados) {
        const resultado = await exportarUm(id);
        resultados.push({
          relatorio: resultado.nome,
          formato: 'CSV',
          data: new Date().toLocaleString('pt-BR'),
          registros: resultado.registros,
        });
      }
      setExportacoesRecentes((prev) => [...resultados, ...prev].slice(0, 10));
      toast.success(
        `${selecionados.length} relatório(s) exportado(s) com sucesso!`
      );
      setSelecionados([]);
    } catch (err: any) {
      toast.error(`Erro ao exportar: ${err.message}`);
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Exportar Dados</h1>
          <p className="text-muted-foreground mt-1">
            Exporte relatórios em CSV com dados reais do sistema
          </p>
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
              {relatoriosDisponiveis.map((rel) => (
                <div
                  key={rel.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selecionados.includes(rel.id)
                      ? 'border-primary bg-primary/5'
                      : 'hover:bg-muted/50'
                  }`}
                  onClick={() => toggleRelatorio(rel.id)}
                >
                  <Checkbox
                    checked={selecionados.includes(rel.id)}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{rel.label}</span>
                      <div className="flex gap-1">
                        {rel.formato.map((f) => (
                          <Badge
                            key={f}
                            variant="outline"
                            className="text-[10px] px-1.5 py-0"
                          >
                            {f.toUpperCase()}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {rel.descricao}
                    </p>
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
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="csv">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4" /> CSV (.csv)
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Período</label>
                <Select value={periodo} onValueChange={setPeriodo}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mes_atual">Mês Atual</SelectItem>
                    <SelectItem value="mes_anterior">Mês Anterior</SelectItem>
                    <SelectItem value="trimestre">Último Trimestre</SelectItem>
                    <SelectItem value="semestre">Último Semestre</SelectItem>
                    <SelectItem value="ano">Ano Inteiro</SelectItem>
                    <SelectItem value="tudo">Todos os dados</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="pt-2">
                <p className="text-sm text-muted-foreground mb-3">
                  {selecionados.length} relatório(s) selecionado(s)
                </p>
                <Button
                  onClick={handleExportar}
                  disabled={exportando || selecionados.length === 0}
                  className="w-full"
                >
                  {exportando ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Exportando...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" /> Exportar
                    </>
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
              {exportacoesRecentes.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">
                  Nenhuma exportação realizada nesta sessão
                </p>
              ) : (
                exportacoesRecentes.map((exp, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-2 rounded border"
                  >
                    <div>
                      <p className="text-xs font-medium">{exp.relatorio}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {exp.data} · {exp.registros} registros
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {exp.formato}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
