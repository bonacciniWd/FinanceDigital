/**
 * @module KanbanAtendimentoPage
 * @description Kanban de atendimento ao cliente.
 *
 * Board com colunas: Aguardando, Em Atendimento, Follow-up,
 * Resolvido. Cards exibem cliente, canal (chat/WhatsApp/telefone)
 * e tempo de espera. Integração visual com canais de comunicação.
 *
 * @route /kanban/atendimento
 * @access Protegido — todos os perfis autenticados
 */
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Search, MessageSquare, Phone, Clock } from 'lucide-react';
import { Input } from '../components/ui/input';

const columns = [
  { id: 'aguardando', title: 'AGUARDANDO', color: 'bg-blue-100 text-slate-900 border-blue-300', items: [
    { id: 1, nome: 'João Silva', assunto: 'Dúvida sobre parcela', canal: 'Chat', tempo: '5min' },
    { id: 2, nome: 'Pedro Oliveira', assunto: 'Solicita 2ª via boleto', canal: 'WhatsApp', tempo: '12min' },
    { id: 3, nome: 'Fernanda Lima', assunto: 'Antecipação de parcelas', canal: 'Chat', tempo: '2min' },
  ]},
  { id: 'em_atendimento', title: 'EM ATENDIMENTO', color: 'bg-yellow-100 text-slate-900 border-yellow-300', items: [
    { id: 4, nome: 'Roberto Alves', assunto: 'Renegociação de dívida', canal: 'Telefone', tempo: '25min' },
    { id: 5, nome: 'Paulo Mendes', assunto: 'Alteração de data', canal: 'Chat', tempo: '8min' },
  ]},
  { id: 'aguardando_cliente', title: 'AGUARDANDO CLIENTE', color: 'bg-orange-100 text-slate-900 border-orange-300', items: [
    { id: 6, nome: 'Maria Santos', assunto: 'Envio de documentos', canal: 'WhatsApp', tempo: '2h' },
  ]},
  { id: 'resolvido', title: 'RESOLVIDO', color: 'bg-green-100 text-slate-900 border-green-300', items: [
    { id: 7, nome: 'Ana Costa', assunto: 'Informação sobre juros', canal: 'Chat', tempo: '3min' },
    { id: 8, nome: 'Lucas Mendes', assunto: 'Comprovante de pagamento', canal: 'WhatsApp', tempo: '15min' },
  ]},
];

export default function KanbanAtendimentoPage() {
  const getCanalIcon = (canal: string) => {
    switch (canal) {
      case 'Chat': return <MessageSquare className="w-3 h-3" />;
      case 'WhatsApp': return <Phone className="w-3 h-3" />;
      case 'Telefone': return <Phone className="w-3 h-3" />;
      default: return <MessageSquare className="w-3 h-3" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Kanban - Atendimento</h1>
          <p className="text-muted-foreground mt-1">Gerencie o fluxo de atendimento ao cliente</p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar..." className="pl-10" />
        </div>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map(col => (
          <div key={col.id} className="flex-shrink-0 w-80">
            <Card className={`${col.color} border-2`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold">{col.title}</CardTitle>
                  <Badge variant="secondary" className="font-semibold">{col.items.length}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {col.items.map(item => (
                  <Card key={item.id} className="bg-card hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="font-semibold text-sm">{item.nome}</div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3" />{item.tempo}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">{item.assunto}</p>
                      <div className="flex items-center gap-1">
                        {getCanalIcon(item.canal)}
                        <span className="text-xs">{item.canal}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}
