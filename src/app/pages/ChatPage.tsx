/**
 * @module ChatPage
 * @description Interface de chat em tempo real para atendimento.
 *
 * Painel lateral com lista de conversas (filtro por status),
 * área principal de mensagens com envio de texto/anexos e
 * painel de informações do cliente selecionado.
 *
 * @route /comunicacao/chat
 * @access Protegido — todos os perfis autenticados
 * @see mockMensagens, mockClientes
 */
import { useState } from 'react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { ScrollArea } from '../components/ui/scroll-area';
import { Send, Paperclip, Circle, CheckCheck } from 'lucide-react';
import { useClientes } from '../hooks/useClientes';
import { useMensagens } from '../hooks/useMensagens';
import { StatusBadge } from '../components/StatusBadge';

export default function ChatPage() {
  const [selectedClientId, setSelectedClientId] = useState('1');
  const [message, setMessage] = useState('');

  const { data: allClientes = [] } = useClientes();
  const { data: allMensagens = [] } = useMensagens(selectedClientId);

  const selectedClient = allClientes.find((c) => c.id === selectedClientId);
  const clientMessages = allMensagens;

  const handleSendMessage = () => {
    if (message.trim()) {
      // Simular envio de mensagem
      console.log('Enviando mensagem:', message);
      setMessage('');
    }
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Chat em Tempo Real</h1>
        <p className="text-muted-foreground mt-1">
          Converse com seus clientes em tempo real
        </p>
      </div>

      <div className="grid grid-cols-12 gap-6 h-[calc(100vh-220px)]">
        {/* Lista de Conversas */}
        <div className="col-span-12 lg:col-span-4">
          <Card className="h-full flex flex-col">
            <div className="p-4 border-b">
              <h3 className="font-semibold mb-3">Conversas</h3>
              <Input placeholder="Buscar conversa..." />
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {allClientes.slice(0, 6).map((cliente) => {
                  const hasUnread = cliente.id === '1';
                  const lastMessage = allMensagens.find((m) => m.clienteId === cliente.id);

                  return (
                    <button
                      key={cliente.id}
                      onClick={() => setSelectedClientId(cliente.id)}
                      className={`w-full text-left p-3 rounded-lg transition-colors hover:bg-muted ${
                        selectedClientId === cliente.id ? 'bg-muted' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="relative">
                          <div className="w-10 h-10 bg-primary text-white rounded-full flex items-center justify-center font-semibold">
                            {cliente.nome.charAt(0)}
                          </div>
                          {hasUnread && (
                            <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <div className="font-medium truncate">{cliente.nome}</div>
                            <div className="text-xs text-muted-foreground">
                              {lastMessage ? formatTime(lastMessage.timestamp) : ''}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <StatusBadge status={cliente.status} />
                          </div>
                          {lastMessage && (
                            <div className="text-sm text-muted-foreground truncate mt-1">
                              {lastMessage.conteudo.substring(0, 40)}...
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </Card>
        </div>

        {/* Área de Chat */}
        <div className="col-span-12 lg:col-span-8">
          <Card className="h-full flex flex-col">
            {/* Header do Chat */}
            <div className="p-4 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary text-white rounded-full flex items-center justify-center font-semibold">
                    {selectedClient?.nome.charAt(0)}
                  </div>
                  <div>
                    <div className="font-semibold">{selectedClient?.nome}</div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={selectedClient?.status || 'em_dia'} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Mensagens */}
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {clientMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${
                      msg.remetente === 'sistema' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <div
                      className={`max-w-[70%] rounded-lg px-4 py-2 ${
                        msg.remetente === 'sistema'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted'
                      }`}
                    >
                      {msg.tipo === 'boleto' ? (
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-white/20 rounded flex items-center justify-center">
                            📄
                          </div>
                          <div>
                            <div className="font-medium text-sm">Boleto Gerado</div>
                            <div className="text-xs opacity-80">Clique para visualizar</div>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm">{msg.conteudo}</p>
                      )}
                      <div
                        className={`text-xs mt-1 flex items-center gap-1 ${
                          msg.remetente === 'sistema'
                            ? 'text-white/70 justify-end'
                            : 'text-muted-foreground'
                        }`}
                      >
                        <span>{formatTime(msg.timestamp)}</span>
                        {msg.remetente === 'sistema' && (
                          <CheckCheck className="w-3 h-3" />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            {/* Input de Mensagem */}
            <div className="p-4 border-t space-y-3">
              <div className="flex gap-2">
                <Select defaultValue="geral">
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Template" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="geral">Sem template</SelectItem>
                    <SelectItem value="cobranca">Cobrança</SelectItem>
                    <SelectItem value="oferta">Oferta</SelectItem>
                    <SelectItem value="lembrete">Lembrete</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="icon">
                  <Paperclip className="w-4 h-4" />
                </Button>
                <Input
                  placeholder="Digite sua mensagem..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  className="flex-1"
                />
                <Button
                  onClick={handleSendMessage}
                  className="bg-primary hover:bg-primary/90"
                >
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
