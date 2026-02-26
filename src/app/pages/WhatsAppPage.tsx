/**
 * @module WhatsAppPage
 * @description Painel de integração com WhatsApp Business API.
 *
 * Gerencia conexão com a API, exibe conversas do WhatsApp,
 * permite envio de mensagens com templates personalizados
 * por gênero (masculino/feminino) e acompanha status de entrega.
 *
 * @route /comunicacao/whatsapp
 * @access Protegido — perfis admin, gerente, operador
 * @see mockTemplatesWhatsApp, mockMensagens
 */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { ScrollArea } from '../components/ui/scroll-area';
import { Send, Phone, CheckCheck, Clock, Search, Filter, Image, Paperclip, Smile } from 'lucide-react';
import { useClientes } from '../hooks/useClientes';
import { StatusBadge } from '../components/StatusBadge';

export default function WhatsAppPage() {
  const [selectedClientId, setSelectedClientId] = useState('2');
  const [message, setMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const { data: allClientes = [] } = useClientes();
  const selectedClient = allClientes.find(c => c.id === selectedClientId);

  const whatsappMessages = [
    { id: 'w1', remetente: 'sistema' as const, conteudo: 'Olá Maria, lembramos que seu boleto venceu há 45 dias. Entre em contato para negociarmos.', timestamp: '2026-02-20T09:15:00', status: 'entregue' },
    { id: 'w2', remetente: 'cliente' as const, conteudo: 'Oi, estou passando por dificuldades. Tem como parcelar?', timestamp: '2026-02-20T10:30:00', status: 'lida' },
    { id: 'w3', remetente: 'sistema' as const, conteudo: 'Claro! Podemos fazer um acordo. Qual valor mensal ficaria melhor para você?', timestamp: '2026-02-20T10:35:00', status: 'entregue' },
    { id: 'w4', remetente: 'cliente' as const, conteudo: 'Consigo pagar R$ 200 por mês', timestamp: '2026-02-21T14:20:00', status: 'lida' },
    { id: 'w5', remetente: 'sistema' as const, conteudo: 'Vou verificar com a gerência e te retorno em breve!', timestamp: '2026-02-21T14:25:00', status: 'enviado' },
  ];

  const filteredClients = allClientes.filter(c =>
    !searchTerm || c.nome.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">WhatsApp Business</h1>
        <p className="text-muted-foreground mt-1">Gerenciar conversas do WhatsApp</p>
      </div>

      <div className="grid grid-cols-12 gap-6 h-[calc(100vh-220px)]">
        {/* Lista de Conversas */}
        <div className="col-span-12 lg:col-span-4">
          <Card className="h-full flex flex-col">
            <div className="p-4 border-b space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">WhatsApp</h3>
                <Badge className="bg-green-500 text-white">Conectado</Badge>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Buscar conversa..." className="pl-10" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {filteredClients.slice(0, 8).map(cliente => (
                  <button
                    key={cliente.id}
                    onClick={() => setSelectedClientId(cliente.id)}
                    className={`w-full text-left p-3 rounded-lg transition-colors hover:bg-muted ${selectedClientId === cliente.id ? 'bg-muted' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-green-600 text-white rounded-full flex items-center justify-center font-semibold">
                        {cliente.nome.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium truncate">{cliente.nome}</span>
                          <span className="text-xs text-muted-foreground">14:25</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <CheckCheck className="w-3 h-3 text-blue-500 shrink-0" />
                          <span className="text-xs text-muted-foreground truncate">Última mensagem...</span>
                        </div>
                        <div className="mt-1"><StatusBadge status={cliente.status} /></div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </Card>
        </div>

        {/* Chat WhatsApp */}
        <div className="col-span-12 lg:col-span-8">
          <Card className="h-full flex flex-col">
            {/* Header */}
            <div className="p-4 border-b flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-600 text-white rounded-full flex items-center justify-center font-semibold">
                  {selectedClient?.nome.charAt(0)}
                </div>
                <div>
                  <div className="font-semibold">{selectedClient?.nome}</div>
                  <div className="text-xs text-muted-foreground">{selectedClient?.telefone}</div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline"><Phone className="w-4 h-4" /></Button>
                <Button size="sm" variant="outline"><Filter className="w-4 h-4" /></Button>
              </div>
            </div>

            {/* Mensagens - Estilo WhatsApp */}
            <ScrollArea className="flex-1 p-4" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23e5ddd5\' fill-opacity=\'0.15\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }}>
              <div className="space-y-3 max-w-2xl mx-auto">
                {whatsappMessages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.remetente === 'sistema' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-lg p-3 ${msg.remetente === 'sistema' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-card shadow-sm'}`}>
                      <p className="text-sm">{msg.conteudo}</p>
                      <div className="flex items-center justify-end gap-1 mt-1">
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {msg.remetente === 'sistema' && (
                          <CheckCheck className={`w-3 h-3 ${msg.status === 'lida' ? 'text-blue-500' : 'text-muted-foreground'}`} />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            {/* Input */}
            <div className="p-4 border-t bg-muted/50">
              <div className="flex items-center gap-2">
                <Button size="icon" variant="ghost"><Smile className="w-5 h-5" /></Button>
                <Button size="icon" variant="ghost"><Paperclip className="w-5 h-5" /></Button>
                <Input
                  placeholder="Digite uma mensagem..."
                  className="flex-1"
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && message && setMessage('')}
                />
                <Button size="icon" className="bg-green-600 hover:bg-green-700">
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
