/**
 * @module ConfigSistemaPage
 * @description Configurações globais do sistema — mensagens automáticas, cobranças, parâmetros.
 *
 * @route /configuracoes/sistema
 * @access Protegido — admin, gerencia
 */
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Label } from '../components/ui/label';
import { Input } from '../components/ui/input';
import { Switch } from '../components/ui/switch';
import { Skeleton } from '../components/ui/skeleton';
import { Settings2, MessageSquare, Receipt, Percent, AlertTriangle, Calculator, Handshake } from 'lucide-react';
import { toast } from 'sonner';
import { useConfigSistema, useUpdateConfig } from '../hooks/useConfigSistema';
import { JUROS_FIXO_DIA, JUROS_PERC_DIA, JUROS_LIMIAR } from '../lib/juros';

export default function ConfigSistemaPage() {
  const { data: config, isLoading, isError } = useConfigSistema();
  const updateConfig = useUpdateConfig();

  const handleToggle = (chave: string, valor: boolean) => {
    updateConfig.mutate(
      { chave, valor },
      {
        onSuccess: () => toast.success('Configuração atualizada'),
        onError: (err) => toast.error(`Erro: ${err.message}`),
      }
    );
  };

  const handleNumber = (chave: string, valor: string) => {
    const num = parseFloat(valor);
    if (isNaN(num) || num < 0) return;
    updateConfig.mutate(
      { chave, valor: num },
      {
        onSuccess: () => toast.success('Configuração atualizada'),
        onError: (err) => toast.error(`Erro: ${err.message}`),
      }
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (isError || !config) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertTriangle className="w-12 h-12 text-destructive mb-4" />
        <h2 className="text-xl font-semibold mb-2">Erro ao carregar configurações</h2>
        <p className="text-muted-foreground">Tente novamente mais tarde.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
          <Settings2 className="w-6 h-6" />
          Configurações do Sistema
        </h1>
        <p className="text-muted-foreground mt-1">
          Controle global de funcionalidades automáticas e parâmetros financeiros.
        </p>
      </div>

      {/* Mensagens automáticas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Mensagens Automáticas (WhatsApp)
          </CardTitle>
          <CardDescription>
            Controla o envio automático de mensagens via WhatsApp pelo sistema de notificações (cron de cobrança).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Notificações automáticas ativas</Label>
              <p className="text-xs text-muted-foreground">
                Lembretes de vencimento, cobranças e avisos enviados automaticamente.
              </p>
            </div>
            <Switch
              checked={config.mensagens_automaticas_ativas}
              onCheckedChange={(checked) => handleToggle('mensagens_automaticas_ativas', checked)}
              disabled={updateConfig.isPending}
            />
          </div>
        </CardContent>
      </Card>

      {/* Cobranças automáticas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="w-5 h-5" />
            Cobranças PIX Automáticas
          </CardTitle>
          <CardDescription>
            Geração automática de cobranças PIX com vencimento (QR Code) nas datas de vencimento das parcelas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Cobranças automáticas ativas</Label>
              <p className="text-xs text-muted-foreground">
                Cria cobrança PIX EFI com QR code e envia ao cliente automaticamente.
              </p>
            </div>
            <Switch
              checked={config.cobv_auto_ativa}
              onCheckedChange={(checked) => handleToggle('cobv_auto_ativa', checked)}
              disabled={updateConfig.isPending}
            />
          </div>
        </CardContent>
      </Card>

      {/* Parâmetros financeiros — PIX EFI */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Percent className="w-5 h-5" />
            Parâmetros Financeiros — PIX EFI
          </CardTitle>
          <CardDescription>
            Multa e juros aplicados automaticamente nas cobranças PIX com vencimento (EFI Bank).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="multa">Multa por atraso (%)</Label>
              <Input
                id="multa"
                type="number"
                step="0.1"
                min="0"
                max="100"
                defaultValue={config.multa_percentual}
                onBlur={(e) => handleNumber('multa_percentual', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Aplicada após o vencimento pela EFI.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="juros">Juros ao mês (%)</Label>
              <Input
                id="juros"
                type="number"
                step="0.1"
                min="0"
                max="100"
                defaultValue={config.juros_percentual}
                onBlur={(e) => handleNumber('juros_percentual', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Juros mensais aplicados pela EFI após o vencimento.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Parâmetros de Acordo / Renegociação */}
      <Card className="border-green-200 dark:border-green-900/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Handshake className="w-5 h-5 text-green-600" />
            Parâmetros de Acordo / Renegociação
          </CardTitle>
          <CardDescription>
            Configurações padrão para criação de acordos (bot e manual).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="acordo_entrada_percentual">Entrada mínima (%)</Label>
              <Input
                id="acordo_entrada_percentual"
                type="number"
                min={0}
                max={100}
                step={1}
                defaultValue={config?.acordo_entrada_percentual ?? 30}
                onBlur={(e) => handleNumber('acordo_entrada_percentual', e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">% do valor total exigido como entrada</p>
            </div>
            <div>
              <Label htmlFor="acordo_max_parcelas">Máximo de parcelas</Label>
              <Input
                id="acordo_max_parcelas"
                type="number"
                min={1}
                max={48}
                step={1}
                defaultValue={config?.acordo_max_parcelas ?? 12}
                onBlur={(e) => handleNumber('acordo_max_parcelas', e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">Limite de parcelas para renegociação</p>
            </div>
            <div>
              <Label htmlFor="acordo_desconto_juros_percentual">Desconto sobre juros (%)</Label>
              <Input
                id="acordo_desconto_juros_percentual"
                type="number"
                min={0}
                max={100}
                step={1}
                defaultValue={config?.acordo_desconto_juros_percentual ?? 0}
                onBlur={(e) => handleNumber('acordo_desconto_juros_percentual', e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">Desconto aplicado nos juros acumulados (0 = sem desconto)</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Juros automáticos por atraso (calculados no sistema) */}
      <Card className="border-amber-200 dark:border-amber-900/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-amber-600" />
            Juros Automáticos por Atraso
          </CardTitle>
          <CardDescription>
            Juros calculados automaticamente por dia sobre parcelas vencidas. Aplicados em empréstimos ativos e gestão de parcelas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900/30 p-4">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Dívida abaixo de R$ {JUROS_LIMIAR.toLocaleString('pt-BR')}</p>
              <p className="text-2xl font-bold text-amber-700 dark:text-amber-400 mt-1">R$ {JUROS_FIXO_DIA},00 <span className="text-sm font-normal">/ dia</span></p>
              <p className="text-xs text-muted-foreground mt-1">Valor fixo por dia de atraso</p>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900/30 p-4">
              <p className="text-sm font-semibold text-red-800 dark:text-red-300">Dívida a partir de R$ {JUROS_LIMIAR.toLocaleString('pt-BR')}</p>
              <p className="text-2xl font-bold text-red-700 dark:text-red-400 mt-1">{(JUROS_PERC_DIA * 100).toFixed(0)}% <span className="text-sm font-normal">/ dia</span></p>
              <p className="text-xs text-muted-foreground mt-1">Percentual do valor original por dia de atraso</p>
            </div>
          </div>
          <div className="mt-4 p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground">
            <p><strong>Nota:</strong> Juros são calculados automaticamente em tempo real sobre parcelas vencidas não pagas. Se um juros manual for atribuído à parcela, o cálculo automático não é aplicado. Para alterar as regras, edite o arquivo <code>src/app/lib/juros.ts</code>.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
