/**
 * @module RelatoriosPage
 * @description Central de relatórios financeiros.
 *
 * Gerador de relatórios com templates pré-definidos:
 * inadimplência, receita, carteira e performance. Diálogo
 * de configuração com período, formato (PDF/Excel/CSV) e
 * opção de envio por e-mail. Download direto ou agendamento.
 *
 * @route /relatorios
 * @access Protegido — perfis admin, gerente
 */
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { FileText, Download, Mail, FileSpreadsheet } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { useState } from 'react';

interface Relatorio {
  id: string;
  titulo: string;
  descricao: string;
  icon: any;
}

const relatoriosGerenciais: Relatorio[] = [
  {
    id: 'fluxo-caixa',
    titulo: 'Fluxo de Caixa Mensal',
    descricao: 'Análise completa de entradas e saídas mensais',
    icon: FileText,
  },
  {
    id: 'inadimplencia',
    titulo: 'Inadimplência por Período',
    descricao: 'Relatório detalhado de inadimplência',
    icon: FileText,
  },
  {
    id: 'performance-rede',
    titulo: 'Performance da Rede',
    descricao: 'Análise de indicações e conversões',
    icon: FileText,
  },
  {
    id: 'comissoes',
    titulo: 'Comissões a Pagar',
    descricao: 'Bônus e comissões de indicadores',
    icon: FileText,
  },
  {
    id: 'clientes-inativos',
    titulo: 'Clientes Inativos',
    descricao: 'Lista de clientes sem movimentação',
    icon: FileText,
  },
  {
    id: 'analise-credito',
    titulo: 'Análise de Crédito',
    descricao: 'Relatório de aprovações e rejeições',
    icon: FileText,
  },
];

export default function RelatoriosPage() {
  const [previewRelatorio, setPreviewRelatorio] = useState<string | null>(null);

  const handleGerarRelatorio = (id: string) => {
    setPreviewRelatorio(id);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Relatórios</h1>
        <p className="text-muted-foreground mt-1">
          Gere e exporte relatórios gerenciais e operacionais
        </p>
      </div>

      {/* Relatórios Gerenciais */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Relatórios Gerenciais</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {relatoriosGerenciais.map((relatorio) => (
            <Card
              key={relatorio.id}
              className="hover:shadow-lg transition-shadow cursor-pointer"
            >
              <CardHeader>
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <relatorio.icon className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-base">{relatorio.titulo}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      {relatorio.descricao}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Button
                  className="w-full bg-primary hover:bg-primary/90"
                  onClick={() => handleGerarRelatorio(relatorio.id)}
                >
                  Gerar Relatório
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Relatórios Rápidos */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Relatórios Rápidos</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Clientes por Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Em dia:</span>
                  <span className="font-semibold">845</span>
                </div>
                <div className="flex justify-between">
                  <span>À vencer:</span>
                  <span className="font-semibold">312</span>
                </div>
                <div className="flex justify-between">
                  <span>Vencidos:</span>
                  <span className="font-semibold text-red-600">88</span>
                </div>
              </div>
              <Button variant="outline" size="sm" className="w-full mt-3">
                <Download className="w-3 h-3 mr-1" />
                Exportar
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Valores por Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Em dia:</span>
                  <span className="font-semibold">{formatCurrency(920990)}</span>
                </div>
                <div className="flex justify-between">
                  <span>À vencer:</span>
                  <span className="font-semibold">{formatCurrency(156400)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Vencidos:</span>
                  <span className="font-semibold text-red-600">
                    {formatCurrency(324500)}
                  </span>
                </div>
              </div>
              <Button variant="outline" size="sm" className="w-full mt-3">
                <Download className="w-3 h-3 mr-1" />
                Exportar
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Top 5 Devedores
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span>Carlos Souza</span>
                  <span className="font-semibold">{formatCurrency(12000)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Patricia Gomes</span>
                  <span className="font-semibold">{formatCurrency(5500)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Fernanda Lima</span>
                  <span className="font-semibold">{formatCurrency(4500)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Maria Santos</span>
                  <span className="font-semibold">{formatCurrency(3200)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Lucas Mendes</span>
                  <span className="font-semibold">{formatCurrency(2200)}</span>
                </div>
              </div>
              <Button variant="outline" size="sm" className="w-full mt-3">
                <Download className="w-3 h-3 mr-1" />
                Exportar
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Indicações do Mês
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Total:</span>
                  <span className="font-semibold">47</span>
                </div>
                <div className="flex justify-between">
                  <span>Convertidas:</span>
                  <span className="font-semibold">32</span>
                </div>
                <div className="flex justify-between">
                  <span>Taxa:</span>
                  <span className="font-semibold text-green-600">68%</span>
                </div>
              </div>
              <Button variant="outline" size="sm" className="w-full mt-3">
                <Download className="w-3 h-3 mr-1" />
                Exportar
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Modal de Preview */}
      <Dialog open={!!previewRelatorio} onOpenChange={() => setPreviewRelatorio(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {relatoriosGerenciais.find((r) => r.id === previewRelatorio)?.titulo}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Preview do Relatório */}
            {previewRelatorio === 'inadimplencia' && (
              <div className="space-y-4">
                <div className="bg-muted p-4 rounded-lg">
                  <h3 className="font-semibold mb-2">
                    RELATÓRIO DE INADIMPLÊNCIA - JUNHO/2026
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Período: 01/06/2026 a 23/06/2026
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Gerado em: 23/06/2026 14:30
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-muted p-3 rounded">
                      <div className="text-sm text-muted-foreground">Total de clientes</div>
                      <div className="text-xl font-bold">1.245</div>
                    </div>
                    <div className="bg-muted p-3 rounded">
                      <div className="text-sm text-muted-foreground">Inadimplentes</div>
                      <div className="text-xl font-bold text-red-600">88 (7,2%)</div>
                    </div>
                    <div className="bg-muted p-3 rounded">
                      <div className="text-sm text-muted-foreground">
                        Valor total em atraso
                      </div>
                      <div className="text-xl font-bold">{formatCurrency(324500)}</div>
                    </div>
                    <div className="bg-muted p-3 rounded">
                      <div className="text-sm text-muted-foreground">
                        Média de dias em atraso
                      </div>
                      <div className="text-xl font-bold">45 dias</div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">Top 5 devedores:</h4>
                    <ol className="space-y-1 text-sm">
                      <li>1. Carlos Souza - {formatCurrency(12000)} (76 dias)</li>
                      <li>2. Patricia Gomes - {formatCurrency(5500)} (120 dias)</li>
                      <li>3. Maria Santos - {formatCurrency(3200)} (45 dias)</li>
                      <li>4. Roberto Alves - {formatCurrency(1800)} (23 dias)</li>
                      <li>5. Lucas Mendes - {formatCurrency(2200)} (15 dias)</li>
                    </ol>
                  </div>
                </div>
              </div>
            )}

            {/* Outros relatórios teriam previews diferentes */}
            {previewRelatorio && previewRelatorio !== 'inadimplencia' && (
              <div className="bg-muted p-8 rounded-lg text-center">
                <FileText className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  Preview do relatório{' '}
                  {relatoriosGerenciais.find((r) => r.id === previewRelatorio)?.titulo}
                </p>
              </div>
            )}

            {/* Botões de Ação */}
            <div className="flex gap-2 pt-4 border-t">
              <Button className="flex-1 bg-primary hover:bg-primary/90">
                <Download className="w-4 h-4 mr-2" />
                Exportar PDF
              </Button>
              <Button variant="outline" className="flex-1">
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Exportar Excel
              </Button>
              <Button variant="outline" className="flex-1">
                <Mail className="w-4 h-4 mr-2" />
                Enviar por E-mail
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
