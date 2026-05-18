/**
 * @module ClienteChatSidebar
 * @description Painel lateral exibido na WhatsAppPage quando uma conversa
 * está vinculada a um cliente. Mostra ficha resumida, situação financeira,
 * últimas parcelas e atalhos rápidos (abrir ficha, criar ticket, gerar PIX).
 *
 * Reaproveita hooks existentes — não duplica queries.
 */
import { useMemo } from 'react';
import {
  User, ExternalLink, FileText, Receipt, AlertTriangle, CheckCircle2,
  TrendingUp, Wallet, Gift, CalendarClock, Loader2, MessageSquare,
} from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { useParcelasByCliente } from '../hooks/useParcelas';
import { useEmprestimosByCliente } from '../hooks/useEmprestimos';
import { useClienteModal } from '../contexts/ClienteModalContext';
import type { Cliente } from '../lib/view-types';

interface Props {
  cliente: Cliente;
  /** Telefone atual da conversa — para passar de contexto à ficha do cliente. */
  telefone: string;
  /** Indica se já existe ticket aberto p/ esse cliente (oculta botão duplicado). */
  hasOpenTicket?: boolean;
  /** Callback para criar ticket — reaproveita lógica já existente na página. */
  onCriarTicket?: () => void;
  /** Loading da mutation de criar ticket. */
  isCreatingTicket?: boolean;
  /** Fechar painel. */
  onClose?: () => void;
}

const fmt = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtDate = (d: string | null | undefined) => {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('pt-BR');
  } catch {
    return '—';
  }
};

function StatusBadge({ status }: { status: Cliente['status'] }) {
  const map = {
    em_dia: { label: 'Em dia', cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300', Icon: CheckCircle2 },
    a_vencer: { label: 'A vencer', cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300', Icon: CalendarClock },
    vencido: { label: 'Vencido', cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300', Icon: AlertTriangle },
  } as const;
  const it = map[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${it.cls}`}>
      <it.Icon className="w-3 h-3" />
      {it.label}
    </span>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const faixa = score >= 800 ? 'Excelente' : score >= 600 ? 'Bom' : score >= 400 ? 'Regular' : 'Baixo';
  const cls = score >= 800
    ? 'text-green-700 dark:text-green-300'
    : score >= 600
    ? 'text-blue-700 dark:text-blue-300'
    : score >= 400
    ? 'text-yellow-700 dark:text-yellow-300'
    : 'text-red-700 dark:text-red-300';
  return (
    <div className={`flex items-baseline gap-1 ${cls}`}>
      <span className="text-lg font-bold">{score}</span>
      <span className="text-[10px] uppercase tracking-wide opacity-80">{faixa}</span>
    </div>
  );
}

export default function ClienteChatSidebar({
  cliente,
  hasOpenTicket,
  onCriarTicket,
  isCreatingTicket,
  onClose,
}: Props) {
  const { openClienteModal } = useClienteModal();
  const { data: parcelas = [], isLoading: loadingParcelas } = useParcelasByCliente(cliente.id);
  const { data: emprestimos = [] } = useEmprestimosByCliente(cliente.id);

  const disponivel = (cliente.limiteCredito || 0) - (cliente.creditoUtilizado || 0);
  const emprestimoAtivo = useMemo(
    () => emprestimos.find((e) => e.status === 'ativo') ?? emprestimos.find((e) => e.status === 'inadimplente'),
    [emprestimos],
  );

  const parcelasOrdenadas = useMemo(
    () => [...parcelas].sort((a, b) => new Date(a.dataVencimento).getTime() - new Date(b.dataVencimento).getTime()),
    [parcelas],
  );
  const vencidas = parcelasOrdenadas.filter((p) => p.status === 'vencida');
  const pendentes = parcelasOrdenadas.filter((p) => p.status === 'pendente');
  const ultimasPagas = parcelasOrdenadas
    .filter((p) => p.status === 'paga')
    .slice(-3)
    .reverse();
  const proximaParcela = pendentes[0] ?? vencidas[0];

  return (
    <div className="flex flex-col h-full bg-card border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <User className="w-4 h-4 text-muted-foreground shrink-0" />
            <button
              onClick={() => openClienteModal(cliente.id)}
              className="font-semibold text-sm truncate hover:underline text-left"
              title="Abrir ficha do cliente"
            >
              {cliente.nome}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={cliente.status} />
            {(cliente.diasAtraso ?? 0) > 0 && (
              <span className="text-[11px] font-medium text-red-600 dark:text-red-400">
                {cliente.diasAtraso} dia{cliente.diasAtraso === 1 ? '' : 's'} em atraso
              </span>
            )}
          </div>
          {cliente.cpf && (
            <div className="text-[11px] text-muted-foreground mt-1">CPF: {cliente.cpf}</div>
          )}
        </div>
        {onClose && (
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose} title="Fechar painel">
            ×
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Score */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" />
              Score interno
            </span>
            <ScoreBadge score={cliente.scoreInterno ?? 0} />
          </div>

          {/* Crédito */}
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5" />
              Crédito
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <span className="text-muted-foreground">Limite</span>
              <span className="text-right">{fmt(cliente.limiteCredito || 0)}</span>
              <span className="text-muted-foreground">Utilizado</span>
              <span className="text-right">{fmt(cliente.creditoUtilizado || 0)}</span>
              <span className="text-muted-foreground font-medium">Disponível</span>
              <span className="text-right font-semibold text-green-600 dark:text-green-400">
                {fmt(disponivel)}
              </span>
              {cliente.bonusAcumulado != null && cliente.bonusAcumulado > 0 && (
                <>
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Gift className="w-3 h-3" /> Bônus
                  </span>
                  <span className="text-right">{fmt(cliente.bonusAcumulado)}</span>
                </>
              )}
            </div>
          </div>

          {/* Empréstimo / parcela atual */}
          {emprestimoAtivo && (
            <div className="space-y-1.5 border-t pt-3">
              <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5" />
                Empréstimo ativo
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <span className="text-muted-foreground">Valor</span>
                <span className="text-right">{fmt(emprestimoAtivo.valor)}</span>
                <span className="text-muted-foreground">Parcelas</span>
                <span className="text-right">
                  {emprestimoAtivo.parcelasPagas}/{emprestimoAtivo.parcelas}
                </span>
                {proximaParcela && (
                  <>
                    <span className="text-muted-foreground">Próxima</span>
                    <span className="text-right">
                      #{proximaParcela.numero} · {fmtDate(proximaParcela.dataVencimento)}
                    </span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Vencidas */}
          {vencidas.length > 0 && (
            <div className="space-y-1.5 border-t pt-3">
              <div className="text-xs font-semibold text-red-600 dark:text-red-400 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                Parcelas vencidas ({vencidas.length})
              </div>
              <div className="space-y-1">
                {vencidas.slice(0, 4).map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-xs">
                    <span>#{p.numero} · {fmtDate(p.dataVencimento)}</span>
                    <span className="font-medium text-red-600 dark:text-red-400">{fmt(p.valor)}</span>
                  </div>
                ))}
                {vencidas.length > 4 && (
                  <div className="text-[10px] text-muted-foreground">
                    +{vencidas.length - 4} parcela(s)
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Últimos pagamentos */}
          {ultimasPagas.length > 0 && (
            <div className="space-y-1.5 border-t pt-3">
              <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                Últimos pagamentos
              </div>
              <div className="space-y-1">
                {ultimasPagas.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-xs">
                    <span>#{p.numero} · {fmtDate(p.dataPagamento ?? p.dataVencimento)}</span>
                    <span className="text-green-600 dark:text-green-400">{fmt(p.valor)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {loadingParcelas && (
            <div className="flex items-center justify-center py-2">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Atalhos */}
      <div className="border-t p-3 space-y-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start text-xs h-8"
          onClick={() => openClienteModal(cliente.id, { tab: 'dados' })}
        >
          <ExternalLink className="w-3.5 h-3.5 mr-2" />
          Abrir ficha completa
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start text-xs h-8"
          onClick={() => openClienteModal(cliente.id, { tab: 'emprestimos' })}
        >
          <Receipt className="w-3.5 h-3.5 mr-2" />
          Ver empréstimos
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start text-xs h-8"
          onClick={() => openClienteModal(cliente.id, { tab: 'cobranca' })}
        >
          <FileText className="w-3.5 h-3.5 mr-2" />
          Cobrança / gerar PIX
        </Button>
        {onCriarTicket && !hasOpenTicket && (
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start text-xs h-8 text-blue-600 dark:text-blue-400"
            disabled={isCreatingTicket}
            onClick={onCriarTicket}
          >
            <MessageSquare className="w-3.5 h-3.5 mr-2" />
            {isCreatingTicket ? 'Criando…' : 'Abrir ticket de atendimento'}
          </Button>
        )}
      </div>
    </div>
  );
}
