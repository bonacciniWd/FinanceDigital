/**
 * @module TemplatesMensagensPage
 * @description Gestão de templates de mensagens com suporte a gênero.
 *
 * CRUD de templates para WhatsApp e e-mail. Cada template possui
 * versão masculina (`mensagemMasculino`) e feminina (`mensagemFeminino`)
 * com variáveis dinâmicas ({nome}, {valor}, {vencimento}).
 * Pré-visualização em tempo real e categorização por tipo.
 *
 * @route /comunicacao/templates
 * @access Protegido — perfis admin, gerente
 * @see mockTemplatesWhatsApp
 */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Plus, Edit, Eye, Copy, MessageSquare } from 'lucide-react';
import { useTemplates } from '../hooks/useTemplates';
import type { TemplateWhatsApp } from '../lib/mockData';

export default function TemplatesMensagensPage() {
  const { data: templatesData = [] } = useTemplates();
  const [localTemplates, setLocalTemplates] = useState<TemplateWhatsApp[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateWhatsApp | null>(null);
  const [previewSexo, setPreviewSexo] = useState<'masculino' | 'feminino'>('masculino');
  const [modalNovo, setModalNovo] = useState(false);

  // Sync hook data to local state for in-page mutations
  if (!initialized && templatesData.length > 0) {
    setLocalTemplates(templatesData);
    setInitialized(true);
  }

  const templates = initialized ? localTemplates : templatesData;

  const getCategoryBadge = (cat: string) => {
    const configs: Record<string, { label: string; className: string }> = {
      cobranca: { label: 'Cobrança', className: 'bg-red-100 text-red-800' },
      boas_vindas: { label: 'Boas-vindas', className: 'bg-green-100 text-green-800' },
      lembrete: { label: 'Lembrete', className: 'bg-yellow-100 text-yellow-800' },
      negociacao: { label: 'Negociação', className: 'bg-purple-100 text-purple-800' },
    };
    const c = configs[cat];
    return <Badge className={c.className}>{c.label}</Badge>;
  };

  const previewMessage = (template: TemplateWhatsApp, sexo: 'masculino' | 'feminino') => {
    let msg = sexo === 'masculino' ? template.mensagemMasculino : template.mensagemFeminino;
    msg = msg.replace('{nome}', 'João Silva').replace('{valor}', 'R$ 500,00').replace('{data}', '15/03/2026').replace('{diasAtraso}', '45').replace('{desconto}', '20');
    return msg;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Templates de Mensagens</h1>
          <p className="text-muted-foreground mt-1">Mensagens personalizadas por sexo para WhatsApp e Chat</p>
        </div>
        <Button className="bg-primary hover:bg-primary/90" onClick={() => setModalNovo(true)}>
          <Plus className="w-4 h-4 mr-2" />Novo Template
        </Button>
      </div>

      {/* Info sobre personalização por sexo */}
      <Card className="border-secondary bg-secondary/5">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <MessageSquare className="w-5 h-5 text-secondary shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-primary">Templates com personalização por gênero</p>
              <p className="text-sm text-muted-foreground mt-1">
                Cada template possui duas versões: uma para clientes <strong>masculinos</strong> (Sr.) e outra para <strong>femininas</strong> (Sra.). 
                O sistema seleciona automaticamente a versão correta baseado no campo "Sexo" do cadastro do cliente.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Templates */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {templates.map(template => (
          <Card key={template.id} className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <CardTitle className="text-base">{template.nome}</CardTitle>
                    {getCategoryBadge(template.categoria)}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline" className="text-xs">Variáveis: {template.variaveis.join(', ')}</Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{template.ativo ? 'Ativo' : 'Inativo'}</span>
                  <Switch checked={template.ativo} />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <div className="p-3 bg-blue-50 rounded-lg">
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-xs font-medium text-blue-700">♂ Masculino</span>
                  </div>
                  <p className="text-sm text-blue-900">{template.mensagemMasculino}</p>
                </div>
                <div className="p-3 bg-pink-50 rounded-lg">
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-xs font-medium text-pink-700">♀ Feminino</span>
                  </div>
                  <p className="text-sm text-pink-900">{template.mensagemFeminino}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => setSelectedTemplate(template)}>
                  <Eye className="w-4 h-4 mr-1" />Preview
                </Button>
                <Button size="sm" variant="outline"><Edit className="w-4 h-4" /></Button>
                <Button size="sm" variant="outline"><Copy className="w-4 h-4" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Modal Preview */}
      <Dialog open={!!selectedTemplate} onOpenChange={() => setSelectedTemplate(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Preview: {selectedTemplate?.nome}</DialogTitle></DialogHeader>
          {selectedTemplate && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button size="sm" variant={previewSexo === 'masculino' ? 'default' : 'outline'} onClick={() => setPreviewSexo('masculino')}>
                  ♂ Masculino
                </Button>
                <Button size="sm" variant={previewSexo === 'feminino' ? 'default' : 'outline'} onClick={() => setPreviewSexo('feminino')}>
                  ♀ Feminino
                </Button>
              </div>
              {/* Simulação WhatsApp */}
              <div className="bg-muted rounded-lg p-4">
                <div className="flex justify-end">
                  <div className="bg-green-100 dark:bg-green-900/30 rounded-lg p-3 max-w-[85%] shadow-sm">
                    <p className="text-sm">{previewMessage(selectedTemplate, previewSexo)}</p>
                    <div className="flex items-center justify-end gap-1 mt-1">
                      <span className="text-[10px] text-muted-foreground">14:30</span>
                      <span className="text-blue-500 text-xs">✓✓</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal Novo Template */}
      <Dialog open={modalNovo} onOpenChange={setModalNovo}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Novo Template</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Nome do Template</Label>
                <Input placeholder="Ex: Cobrança 2ª via" />
              </div>
              <div>
                <Label>Categoria</Label>
                <Select>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cobranca">Cobrança</SelectItem>
                    <SelectItem value="boas_vindas">Boas-vindas</SelectItem>
                    <SelectItem value="lembrete">Lembrete</SelectItem>
                    <SelectItem value="negociacao">Negociação</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Mensagem Masculino (Sr.)</Label>
              <Textarea placeholder="Use {nome}, {valor}, {data} como variáveis..." rows={3} />
            </div>
            <div>
              <Label>Mensagem Feminino (Sra.)</Label>
              <Textarea placeholder="Use {nome}, {valor}, {data} como variáveis..." rows={3} />
            </div>
            <p className="text-xs text-muted-foreground">Variáveis disponíveis: {'{nome}'}, {'{valor}'}, {'{data}'}, {'{diasAtraso}'}, {'{desconto}'}</p>
            <div className="flex gap-3">
              <Button className="flex-1 bg-primary hover:bg-primary/90">Salvar Template</Button>
              <Button className="flex-1" variant="outline" onClick={() => setModalNovo(false)}>Cancelar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
