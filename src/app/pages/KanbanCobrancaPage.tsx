/**
 * @module KanbanCobrancaPage
 * @description Kanban de cobrança com dados reais do Supabase.
 *
 * Board com colunas: A Vencer, Vencido, Contatado, Negociação, Acordo, Pago.
 * Cards exibem cliente, valor, dias de atraso e responsável.
 * Drag-and-drop muda etapa via mutation. Modal com ações de contato.
 * Sem dados mock — usa useCardsCobranca, useMoverCardCobranca, useRegistrarContato.
 *
 * @route /kanban/cobranca
 * @access Protegido — perfis admin, gerência, cobrança
 */
import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import {
  MessageSquare,
  Phone,
  HandshakeIcon,
  Archive,
  ChevronRight,
  Search,
  Loader2,
  AlertCircle,
  UserCheck,
  Banknote,
  AlertOctagon,
  CheckCircle2,
  RefreshCw,
  Send,
  ExternalLink,
  CheckCheck,
  XCircle,
  FileText,
  Upload,
  QrCode,
  Image,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useCardsCobranca,
  useMoverCardCobranca,
  useRegistrarContato,
  useUpdateCardCobranca,
  useSyncCobrancas,
} from '../hooks/useKanbanCobranca';
import { useEmprestimos, useUpdateEmprestimo, useQuitarEmprestimo } from '../hooks/useEmprestimos';
import { useInstancias, useEnviarWhatsapp } from '../hooks/useWhatsapp';
import { useTemplatesByCategoria } from '../hooks/useTemplates';
import { useCriarCobrancaWoovi, useCriarCobvEfi } from '../hooks/useWoovi';
import { useRegistrarPagamento } from '../hooks/useParcelas';
import { useCriarAcordo } from '../hooks/useAcordos';
import { useConfigSistema } from '../hooks/useConfigSistema';
import { supabase } from '../lib/supabase';
import { valorCorrigido } from '../lib/juros';
import { useAuth } from '../contexts/AuthContext';
import { useClienteModal } from '../contexts/ClienteModalContext';
import type { ParcelaUpdate } from '../lib/database.types';
import type { KanbanCobrancaView, Emprestimo } from '../lib/view-types';
import type { KanbanCobrancaEtapa } from '../lib/database.types';

interface ColumnDef {
  id: string;
  title: string;
  dotColor: string;
}

/** Virtual column IDs → real DB etapa */
const VIRTUAL_ETAPA_MAP: Record<string, KanbanCobrancaEtapa> = {
  vencido_n1: 'vencido',
  vencido_n2: 'vencido',
  vencido_n3: 'vencido',
};

const columnToEtapa = (colId: string): KanbanCobrancaEtapa =>
  VIRTUAL_ETAPA_MAP[colId] ?? (colId as KanbanCobrancaEtapa);

const COLUMNS: ColumnDef[] = [
  { id: 'a_vencer',    title: 'A VENCER',         dotColor: '#eab308' },
  { id: 'vencido_n1',  title: 'N1 · 1-15 dias',   dotColor: '#f97316' },
  { id: 'vencido_n2',  title: 'N2 · 16-45 dias',  dotColor: '#ef4444' },
  { id: 'vencido_n3',  title: 'N3 · 46+ dias',     dotColor: '#991b1b' },
  { id: 'arquivado',   title: 'ARQUIVADOS',       dotColor: '#64748b' },
  { id: 'contatado',   title: 'CONTATADO',         dotColor: '#3b82f6' },
  { id: 'negociacao',  title: 'NEGOCIAÇÃO',        dotColor: '#f97316' },
  { id: 'acordo',      title: 'ACORDOS',           dotColor: '#22c55e' },
  { id: 'pago',        title: 'PAGOS',             dotColor: '#10b981' },
];

export default function KanbanCobrancaPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { openClienteModal } = useClienteModal();
  const [selectedCard, setSelectedCard] = useState<KanbanCobrancaView | null>(null);
  const [busca, setBusca] = useState('');
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [contatoObs, setContatoObs] = useState('');

  // Chat dropdown state
  const [chatMenuCard, setChatMenuCard] = useState<string | null>(null);

  // Negociação modal state
  const [showNegociacao, setShowNegociacao] = useState(false);
  const [negociacaoCard, setNegociacaoCard] = useState<KanbanCobrancaView | null>(null);
  const [negMsg, setNegMsg] = useState('');
  const [negInstanciaId, setNegInstanciaId] = useState('');
  const [negTemplateId, setNegTemplateId] = useState('');
  const [negValorAcordado, setNegValorAcordado] = useState('');
  const [negCobrancaCriada, setNegCobrancaCriada] = useState<{
    paymentLink?: string;
    qrCodeImage?: string;
    brCode?: string;
    correlationID?: string;
  } | null>(null);

  // Acordo form state (dentro do modal de negociação)
  const [acordoNumParcelas, setAcordoNumParcelas] = useState('3');
  const [acordoDiaPagamento, setAcordoDiaPagamento] = useState('10');
  const [acordoEntradaPct, setAcordoEntradaPct] = useState('30');

  // Quitar modal state
  const [showQuitarModal, setShowQuitarModal] = useState(false);
  const [quitarEmpId, setQuitarEmpId] = useState<string | null>(null);
  const [quitarTipo, setQuitarTipo] = useState<'pix' | 'manual'>('pix');
  const [comprovanteFile, setComprovanteFile] = useState<File | null>(null);
  const [comprovantePreview, setComprovantePreview] = useState<string | null>(null);
  const [quitarLoading, setQuitarLoading] = useState(false);

  // Gerar PIX per parcela
  const [gerandoPixId, setGerandoPixId] = useState<string | null>(null);

  const { data: allCards = [], isLoading, error, refetch } = useCardsCobranca();
  const { data: emprestimos = [] } = useEmprestimos();
  const { data: instancias = [] } = useInstancias();
  const { data: templatesCobranca = [] } = useTemplatesByCategoria('cobranca');
  const { data: templatesNegociacao = [] } = useTemplatesByCategoria('negociacao');
  const { data: templatesLembrete = [] } = useTemplatesByCategoria('lembrete');
  const moverCard = useMoverCardCobranca();
  const registrarContato = useRegistrarContato();
  const updateCard = useUpdateCardCobranca();
  const updateEmprestimo = useUpdateEmprestimo();
  const quitarEmprestimo = useQuitarEmprestimo();
  const syncCobrancas = useSyncCobrancas();
  const enviarWhatsapp = useEnviarWhatsapp();
  const criarCobrancaWoovi = useCriarCobrancaWoovi();
  const criarCobvEfi = useCriarCobvEfi();
  const registrarPagamento = useRegistrarPagamento();
  const criarAcordo = useCriarAcordo();
  const { data: configSistema } = useConfigSistema();

  const instanciasConectadas = useMemo(
    () => instancias.filter((i) => i.status === 'conectado'),
    [instancias]
  );

  const allTemplates = useMemo(
    () => [...templatesCobranca, ...templatesNegociacao, ...templatesLembrete],
    [templatesCobranca, templatesNegociacao, templatesLembrete]
  );

  // Sync automático na montagem (uma vez)
  const syncedRef = useRef(false);
  useEffect(() => {
    if (syncedRef.current) return;
    syncedRef.current = true;
    syncCobrancas.mutate(undefined, {
      onSuccess: (result) => {
        if (result.created > 0 || result.removed > 0) {
          refetch();
        }
      },
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSyncManual = () => {
    syncCobrancas.mutate(undefined, {
      onSuccess: (result) => {
        refetch();
        const parts: string[] = [];
        if (result.created > 0) parts.push(`${result.created} criado(s)`);
        if (result.updated > 0) parts.push(`${result.updated} atualizado(s)`);
        if (result.removed > 0) parts.push(`${result.removed} removido(s)`);
        toast.success(parts.length > 0 ? `Sincronizado: ${parts.join(', ')}` : 'Tudo sincronizado — sem alterações');
      },
      onError: (err) => toast.error(`Erro ao sincronizar: ${err.message}`),
    });
  };

  // Empréstimos agrupados por clienteId
  const emprestimosByCliente = useMemo(() => {
    const map = new Map<string, Emprestimo[]>();
    for (const emp of emprestimos) {
      const list = map.get(emp.clienteId) || [];
      list.push(emp);
      map.set(emp.clienteId, list);
    }
    return map;
  }, [emprestimos]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  /** Normaliza telefone brasileiro: garante DDI 55 */
  const normalizePhoneBR = (tel: string) => {
    const digits = tel.replace(/\D/g, '');
    if (digits.length >= 10 && digits.length <= 11 && !digits.startsWith('55')) {
      return '55' + digits;
    }
    return digits;
  };

  const filteredCards = useMemo(() => {
    if (!busca.trim()) return allCards;
    const lower = busca.toLowerCase();
    return allCards.filter(
      (c) =>
        c.clienteNome.toLowerCase().includes(lower) ||
        c.clienteEmail.toLowerCase().includes(lower) ||
        c.responsavelNome.toLowerCase().includes(lower)
    );
  }, [allCards, busca]);

  const cardsByEtapa = useMemo(() => {
    const map: Record<string, KanbanCobrancaView[]> = {};
    for (const col of COLUMNS) {
      if (col.id === 'vencido_n1') {
        map[col.id] = filteredCards.filter((c) => c.etapa === 'vencido' && c.diasAtraso >= 1 && c.diasAtraso <= 15);
      } else if (col.id === 'vencido_n2') {
        map[col.id] = filteredCards.filter((c) => c.etapa === 'vencido' && c.diasAtraso >= 16 && c.diasAtraso <= 45);
      } else if (col.id === 'vencido_n3') {
        map[col.id] = filteredCards.filter((c) => c.etapa === 'vencido' && c.diasAtraso >= 46 && c.diasAtraso <= 365);
      } else if (col.id === 'arquivado') {
        map[col.id] = filteredCards.filter((c) => c.etapa === 'arquivado' || (c.etapa === 'vencido' && c.diasAtraso > 365));
      } else {
        map[col.id] = filteredCards.filter((c) => c.etapa === col.id);
      }
    }
    return map;
  }, [filteredCards]);

  const stats = useMemo(() => {
    const cardsAtivos = allCards.filter((c) => !['pago', 'perdido', 'arquivado'].includes(c.etapa));
    const total = cardsAtivos.reduce((sum, c) => sum + c.valorDivida, 0);
    const negociacao = cardsAtivos
      .filter((c) => c.etapa === 'negociacao')
      .reduce((sum, c) => sum + c.valorDivida, 0);
    const acordos = cardsAtivos.filter((c) => c.etapa === 'acordo').length;
    const pagos = allCards.filter((c) => c.etapa === 'pago');
    const totalPago = pagos.reduce((sum, c) => sum + c.valorDivida, 0);
    const totalClientes = cardsAtivos.length;
    const totalNegociacao = cardsAtivos.filter((c) => c.etapa === 'negociacao').length;
    const taxaConversao = totalNegociacao > 0
      ? Math.round((acordos / totalNegociacao) * 100)
      : 0;
    return { total, negociacao, acordos, totalClientes, taxaConversao, totalPago };
  }, [allCards]);

  const handleDragStart = (e: React.DragEvent, cardId: string) => {
    e.dataTransfer.setData('cardId', cardId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColumn(columnId);
  };

  const handleDrop = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    setDragOverColumn(null);
    const cardId = e.dataTransfer.getData('cardId');
    if (!cardId) return;

    const card = allCards.find((c) => c.id === cardId);
    const novaEtapa = columnToEtapa(columnId);
    if (!card || card.etapa === novaEtapa) return;
    moverCard.mutate(
      { id: cardId, etapa: novaEtapa },
      {
        onSuccess: () => {
          toast.success(`Card movido para ${COLUMNS.find((c) => c.id === columnId)?.title}`);
          // Sync: ao mover para "pago", abrir modal de comprovante
          if (novaEtapa === 'pago') {
            const clienteEmps = emprestimosByCliente.get(card.clienteId) ?? [];
            const ativoEmp = clienteEmps.find((e) => e.status === 'ativo' || e.status === 'inadimplente');
            if (ativoEmp) {
              setQuitarEmpId(ativoEmp.id);
              setQuitarTipo('manual');
              setComprovanteFile(null);
              setComprovantePreview(null);
              setShowQuitarModal(true);
            }
          }
          // Sync: ao mover para "vencido", marcar empréstimos ativos como inadimplente
          if (novaEtapa === 'vencido') {
            const clienteEmps = emprestimosByCliente.get(card.clienteId) ?? [];
            const ativos = clienteEmps.filter((e) => e.status === 'ativo');
            for (const emp of ativos) {
              updateEmprestimo.mutate({ id: emp.id, data: { status: 'inadimplente' } });
            }
          }
        },
        onError: (err) => toast.error(`Erro ao mover: ${err.message}`),
      }
    );
  };

  const handleRegistrarContato = () => {
    if (!selectedCard) return;
    registrarContato.mutate(
      { id: selectedCard.id, observacao: contatoObs || undefined },
      {
        onSuccess: () => {
          toast.success('Contato registrado com sucesso');
          setContatoObs('');
          setSelectedCard(null);
        },
        onError: (err) => toast.error(`Erro: ${err.message}`),
      }
    );
  };

  const handleArquivarCard = (card: KanbanCobrancaView) => {
    updateCard.mutate(
      {
        id: card.id,
        updates: {
          etapa: 'arquivado',
          observacao: card.observacao || `Arquivado manualmente por ${user?.name || 'Sistema'}`,
        },
      },
      {
        onSuccess: () => toast.success(`${card.clienteNome} movido para Arquivados`),
        onError: (err) => toast.error(`Erro ao arquivar: ${err.message}`),
      }
    );
  };

  // Enviar mensagem via WhatsApp Business e mover card para contatado
  const handleEnviarWhatsappCobranca = (card: KanbanCobrancaView, instanciaId: string, mensagem: string) => {
    if (!mensagem.trim()) { toast.error('Escreva ou selecione uma mensagem'); return; }
    enviarWhatsapp.mutate(
      { instancia_id: instanciaId, telefone: normalizePhoneBR(card.clienteTelefone), conteudo: mensagem },
      {
        onSuccess: () => {
          const inst = instancias.find((i) => i.id === instanciaId);
          const obs = `Mensagem enviada via ${inst?.instance_name || 'WhatsApp'} por ${user?.name || 'Sistema'}`;
          // Mover para contatado + registrar contato
          updateCard.mutate({ id: card.id, updates: {
            etapa: 'contatado',
            tentativas_contato: card.tentativasContato + 1,
            ultimo_contato: new Date().toISOString(),
            observacao: obs,
          }});
          toast.success('Mensagem enviada e card movido para Contatado');
          setShowNegociacao(false);
          setNegociacaoCard(null);
          setNegMsg('');
          setNegCobrancaCriada(null);
          setSelectedCard(null);
        },
        onError: (err) => toast.error(`Erro ao enviar: ${err.message}`),
      }
    );
  };

  // Abrir WhatsApp direto (app/web) com mensagem
  const handleWhatsappDireto = (telefone: string, mensagem?: string) => {
    const num = normalizePhoneBR(telefone);
    const url = mensagem
      ? `https://wa.me/${num}?text=${encodeURIComponent(mensagem)}`
      : `https://wa.me/${num}`;
    window.open(url, '_blank');
  };

  // Abrir modal de negociação
  const handleAbrirNegociacao = (card: KanbanCobrancaView) => {
    setNegociacaoCard(card);
    setNegMsg('');
    setNegTemplateId('');
    setNegInstanciaId(instanciasConectadas[0]?.id || '');
    setNegValorAcordado(String(card.valorDivida));
    setNegCobrancaCriada(null);
    setAcordoEntradaPct(String(configSistema?.acordo_entrada_percentual ?? 30));
    setAcordoNumParcelas('3');
    setAcordoDiaPagamento('10');
    setShowNegociacao(true);
  };

  // Aplicar template à mensagem de negociação
  const handleAplicarTemplate = (templateId: string, card: KanbanCobrancaView) => {
    setNegTemplateId(templateId);
    const tpl = allTemplates.find((t) => t.id === templateId);
    if (!tpl) return;
    let msg = tpl.mensagemMasculino;
    // Substituir variáveis
    msg = msg.replace(/\{nome\}/gi, card.clienteNome);
    msg = msg.replace(/\{valor\}/gi, formatCurrency(card.valorDivida));
    msg = msg.replace(/\{dias_atraso\}/gi, String(card.diasAtraso));
    msg = msg.replace(/\{valor_acordado\}/gi, negValorAcordado ? formatCurrency(Number(negValorAcordado)) : formatCurrency(card.valorDivida));
    if (negCobrancaCriada?.paymentLink) {
      msg = msg.replace(/\{link_pix\}/gi, negCobrancaCriada.paymentLink);
    }
    setNegMsg(msg);
  };

  // Gerar cobrança Pix via Woovi
  const handleGerarPix = (card: KanbanCobrancaView) => {
    const valor = Number(negValorAcordado);
    if (!valor || valor <= 0) { toast.error('Informe o valor acordado'); return; }

    // Buscar empréstimo ativo do cliente para vincular
    const emps = emprestimosByCliente.get(card.clienteId) ?? [];
    const ativoEmp = emps.find((e) => e.status === 'ativo' || e.status === 'inadimplente');

    criarCobrancaWoovi.mutate(
      {
        cliente_id: card.clienteId,
        emprestimo_id: ativoEmp?.id,
        valor,
        descricao: `Negociação - ${card.clienteNome}`,
        cliente_nome: card.clienteNome,
        expiration_minutes: 1440, // 24h = 1 dia
      },
      {
        onSuccess: (result) => {
          const woovi = (result as Record<string, unknown>).woovi as {
            paymentLinkUrl?: string;
            qrCodeImage?: string;
            brCode?: string;
            correlationID?: string;
          } | undefined;
          setNegCobrancaCriada({
            paymentLink: woovi?.paymentLinkUrl,
            qrCodeImage: woovi?.qrCodeImage,
            brCode: woovi?.brCode,
            correlationID: woovi?.correlationID,
          });
          // Atualizar mensagem com link do Pix se template já foi aplicado
          if (negMsg && woovi?.paymentLinkUrl) {
            setNegMsg((prev) => prev.replace(/\{link_pix\}/gi, woovi.paymentLinkUrl!));
          }
          toast.success('Cobrança Pix gerada com sucesso! Válida por 24h.');
        },
        onError: (err) => toast.error(`Erro ao gerar Pix: ${err.message}`),
      }
    );
  };

  /**
   * Fechar Acordo com Pix: gera cobrança Woovi + envia WhatsApp + move card para "acordo".
   * Fluxo completo em um clique.
   */
  const handleFecharAcordoComPix = (card: KanbanCobrancaView) => {
    const valor = Number(negValorAcordado);
    if (!valor || valor <= 0) { toast.error('Informe o valor acordado'); return; }
    if (!negInstanciaId) { toast.error('Selecione uma instância WhatsApp'); return; }

    const emps = emprestimosByCliente.get(card.clienteId) ?? [];
    const ativoEmp = emps.find((e) => e.status === 'ativo' || e.status === 'inadimplente');

    toast.loading('Gerando cobrança Pix e enviando via WhatsApp...', { id: 'acordo-pix' });

    criarCobrancaWoovi.mutate(
      {
        cliente_id: card.clienteId,
        emprestimo_id: ativoEmp?.id,
        valor,
        descricao: `Acordo - ${card.clienteNome}`,
        cliente_nome: card.clienteNome,
        expiration_minutes: 1440,
      },
      {
        onSuccess: (result) => {
          const woovi = (result as Record<string, unknown>).woovi as {
            paymentLinkUrl?: string;
            qrCodeImage?: string;
            brCode?: string;
            correlationID?: string;
          } | undefined;

          setNegCobrancaCriada({
            paymentLink: woovi?.paymentLinkUrl,
            qrCodeImage: woovi?.qrCodeImage,
            brCode: woovi?.brCode,
            correlationID: woovi?.correlationID,
          });

          // Montar mensagem: usa template aplicado ou monta mensagem padrão
          let mensagemFinal = negMsg.trim();
          if (!mensagemFinal) {
            mensagemFinal = `Olá ${card.clienteNome}! 🤝\n\nFechamos um acordo no valor de ${formatCurrency(valor)}.\n\nSegue o link para pagamento via Pix (válido por 24h):\n${woovi?.paymentLinkUrl || '(link indisponível)'}\n\nApós o pagamento, seu status será atualizado automaticamente.\n\nQualquer dúvida, estamos à disposição!`;
          } else {
            // Substituir {link_pix} se ainda estava como variável
            if (woovi?.paymentLinkUrl) {
              mensagemFinal = mensagemFinal.replace(/\{link_pix\}/gi, woovi.paymentLinkUrl);
            }
            // Substituir {valor_acordado} caso ainda esteja presente
            mensagemFinal = mensagemFinal.replace(/\{valor_acordado\}/gi, formatCurrency(valor));
          }

          // Enviar via WhatsApp Business
          enviarWhatsapp.mutate(
            { instancia_id: negInstanciaId, telefone: normalizePhoneBR(card.clienteTelefone), conteudo: mensagemFinal },
            {
              onSuccess: async () => {
                const inst = instancias.find((i) => i.id === negInstanciaId);
                const nParcelas = Number(acordoNumParcelas) || 3;
                const diaPag = Number(acordoDiaPagamento) || 10;
                const pctEntrada = Number(acordoEntradaPct) || 30;
                const valorEntradaCalc = Math.round(valor * (pctEntrada / 100) * 100) / 100;
                const restante = Math.round((valor - valorEntradaCalc) * 100) / 100;
                const valorParcAcordo = Math.round((restante / nParcelas) * 100) / 100;

                // Buscar parcelas vencidas do cliente para congelar
                const { data: parcelasCliente } = await supabase
                  .from('parcelas')
                  .select('id, emprestimo_id, valor, valor_original, data_vencimento, status')
                  .eq('cliente_id', card.clienteId)
                  .in('status', ['pendente', 'vencida'])
                  .eq('congelada', false) as { data: Array<{ id: string; emprestimo_id: string; valor: number; valor_original: number; data_vencimento: string; status: string }> | null };

                const vencidasIds = (parcelasCliente ?? []).map((p) => p.id);
                const empId = (parcelasCliente ?? []).find((p) => p.emprestimo_id)?.emprestimo_id;

                // Gerar datas das parcelas do acordo
                const datasAcordo: string[] = [];
                const agora = new Date();
                let mesInicio = agora.getMonth() + 1;
                let anoInicio = agora.getFullYear();
                if (mesInicio > 11) { mesInicio = 0; anoInicio++; }
                for (let i = 0; i < nParcelas; i++) {
                  let mes = mesInicio + i;
                  let ano = anoInicio;
                  if (mes > 11) { mes -= 12; ano++; }
                  datasAcordo.push(new Date(ano, mes, Math.min(diaPag, 28)).toISOString().split('T')[0]);
                }

                const obs = `Acordo fechado: ${formatCurrency(valor)} · Entrada: ${formatCurrency(valorEntradaCalc)} (${pctEntrada}%) · ${nParcelas}x ${formatCurrency(valorParcAcordo)} dia ${diaPag} · via ${inst?.instance_name || 'WhatsApp'} por ${user?.name || 'Sistema'}`;

                // Criar acordo formal no banco
                if (empId && vencidasIds.length > 0) {
                  criarAcordo.mutate({
                    acordo: {
                      cliente_id: card.clienteId,
                      kanban_card_id: card.id,
                      criado_por: user?.id || null,
                      origem: 'manual',
                      valor_divida_original: valor,
                      valor_entrada: valorEntradaCalc,
                      entrada_percentual: pctEntrada,
                      valor_restante: restante,
                      num_parcelas: nParcelas,
                      valor_parcela: valorParcAcordo,
                      dia_pagamento: diaPag,
                      data_primeira_parcela: datasAcordo[0] || null,
                      parcelas_originais_ids: vencidasIds,
                      observacao: obs,
                    },
                    parcelasAcordo: datasAcordo.map((d, i) => ({
                      emprestimo_id: empId,
                      cliente_id: card.clienteId,
                      numero: i + 1,
                      valor: valorParcAcordo,
                      valor_original: valorParcAcordo,
                      data_vencimento: d,
                    })),
                  });
                }

                // Mover card para "acordo"
                updateCard.mutate({ id: card.id, updates: {
                  etapa: 'acordo',
                  tentativas_contato: card.tentativasContato + 1,
                  ultimo_contato: new Date().toISOString(),
                  observacao: obs,
                }});
                toast.success('Acordo fechado! Pix gerado e enviado via WhatsApp.', { id: 'acordo-pix' });
                setShowNegociacao(false);
                setNegociacaoCard(null);
                setNegMsg('');
                setNegCobrancaCriada(null);
                setSelectedCard(null);
              },
              onError: (err) => {
                toast.error(`Pix gerado, mas erro ao enviar WhatsApp: ${err.message}`, { id: 'acordo-pix' });
              },
            }
          );
        },
        onError: (err) => {
          toast.error(`Erro ao gerar Pix: ${err.message}`, { id: 'acordo-pix' });
        },
      }
    );
  };

  // Confirmar contato (contatado → acordo)
  const handleConfirmarContato = (card: KanbanCobrancaView) => {
    moverCard.mutate(
      { id: card.id, etapa: 'acordo' },
      {
        onSuccess: () => toast.success(`${card.clienteNome} movido para Acordos`),
        onError: (err) => toast.error(`Erro: ${err.message}`),
      }
    );
  };

  // Cancelar contato (contatado → vencido de volta)
  const handleCancelarContato = (card: KanbanCobrancaView) => {
    moverCard.mutate(
      { id: card.id, etapa: 'vencido' },
      {
        onSuccess: () => toast.success(`${card.clienteNome} retornou para Vencidos`),
        onError: (err) => toast.error(`Erro: ${err.message}`),
      }
    );
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <p className="text-destructive font-medium">Erro ao carregar dados</p>
          <p className="text-sm text-muted-foreground mt-1">{(error as Error).message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Kanban - Cobrança</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie o fluxo de cobrança visualmente — arraste os cards entre colunas
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar cliente..." className="pl-10" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <Button variant="outline" size="sm" onClick={handleSyncManual} disabled={syncCobrancas.isPending}>
            {syncCobrancas.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Sincronizar
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="ml-3 text-muted-foreground">Carregando pipeline...</span>
        </div>
        
      ) : (
        <>
          {/* Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total em Cobrança</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{formatCurrency(stats.total)}</div>
            <p className="text-xs text-muted-foreground mt-1">{stats.totalClientes} clientes</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Em Negociação</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{formatCurrency(stats.negociacao)}</div>
            <p className="text-xs text-muted-foreground mt-1">{allCards.filter((c) => c.etapa === 'negociacao').length} clientes</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Acordos Fechados</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.acordos}</div>
            <p className="text-xs text-muted-foreground mt-1">Recuperado: {formatCurrency(stats.totalPago)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Taxa de Conversão</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{stats.taxaConversao}%</div>
            <p className="text-xs text-muted-foreground mt-1">negociação → acordo</p>
          </CardContent>
        </Card>
      </div>
          {/* Board: altura limitada ao viewport, scroll horizontal visivel na base
              da tela; cada coluna tem scroll vertical interno. */}
          <div
            className="flex gap-4 pb-6 overflow-x-auto overflow-y-hidden"
            style={{ height: 'calc(100vh - 260px)', minHeight: '400px' }}
          >
          {COLUMNS.map((column) => {
            const cards = cardsByEtapa[column.id] || [];
            const isOver = dragOverColumn === column.id;
            return (
              <div key={column.id} className="flex-shrink-0 w-[500px] h-full flex flex-col">
                <Card
                  className={`liquid-metal-column ${isOver ? 'dragging-over' : ''} flex flex-col h-full overflow-hidden`}
                  style={{ '--kanban-col-color': `${column.dotColor}88` } as React.CSSProperties}
                  onDragOver={(e) => handleDragOver(e, column.id)}
                  onDragLeave={() => setDragOverColumn(null)}
                  onDrop={(e) => handleDrop(e, column.id)}
                >
                  <CardHeader className="pb-3 shrink-0">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <span className="kanban-status-dot" style={{ background: column.dotColor, '--dot-color': column.dotColor } as React.CSSProperties} />
                        {column.title}
                      </CardTitle>
                      <Badge variant="secondary" className="font-semibold">{cards.length}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 overflow-y-auto flex-1 min-h-0">
                    {cards.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4 italic">Nenhum card nesta etapa</p>
                    )}
                    {cards.map((card) => (
                      <Card
                        key={card.id}
                        className="liquid-metal-card cursor-grab active:cursor-grabbing"
                        draggable
                        onDragStart={(e) => handleDragStart(e, card.id)}
                        onClick={() => setSelectedCard(card)}
                      >
                        <CardContent className="p-4">
                          <div className="space-y-2">
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <button
                                  type="button"
                                  className="font-semibold text-sm text-foreground truncate text-left hover:text-primary hover:underline focus:outline-none"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openClienteModal(card.clienteId);
                                  }}
                                  title="Abrir detalhes do cliente"
                                >
                                  {card.clienteNome}
                                </button>
                                <div className="text-xs text-muted-foreground mt-0.5 truncate">{card.clienteTelefone}</div>
                              </div>
                              {card.diasAtraso > 0 && (
                                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 ml-1 shrink-0">
                                  {card.diasAtraso}d
                                </Badge>
                              )}
                            </div>
                            <div className="space-y-1 text-xs">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Valor:</span>
                                <span className="font-semibold text-foreground">{formatCurrency(card.valorDivida)}</span>
                              </div>
                              {(() => {
                                const emps = emprestimosByCliente.get(card.clienteId) ?? [];
                                const ativos = emps.filter((e) => e.status === 'ativo' || e.status === 'inadimplente');
                                if (ativos.length === 0) return null;
                                const totalParcelas = ativos.reduce((s, e) => s + e.parcelas, 0);
                                const totalPagas = ativos.reduce((s, e) => s + e.parcelasPagas, 0);
                                const proxVenc = ativos
                                  .map((e) => e.proximoVencimento)
                                  .filter(Boolean)
                                  .sort()[0];
                                return (
                                  <>
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">Empréstimos:</span>
                                      <span className="font-medium text-foreground">{ativos.length}x · {formatCurrency(ativos.reduce((s, e) => s + e.valor, 0))}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">Parcelas:</span>
                                      <span className="font-medium text-foreground">{totalPagas}/{totalParcelas}</span>
                                    </div>
                                    {proxVenc && (
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">Próx. venc.:</span>
                                        <span className="font-medium text-foreground">{new Date(proxVenc).toLocaleDateString('pt-BR')}</span>
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                              {card.tentativasContato > 0 && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Contatos:</span>
                                  <span className="font-medium text-foreground">{card.tentativasContato}x</span>
                                </div>
                              )}
                              {card.ultimoContato && (() => {
                                const dataStr = new Date(card.ultimoContato).toLocaleDateString('pt-BR');
                                const userMatch = card.observacao?.match(/por (.+)$/);
                                return (
                                  <div className="flex items-center gap-1 mt-1 text-[10px]">
                                    <UserCheck className="w-3 h-3 text-muted-foreground shrink-0" />
                                    <span className="text-muted-foreground truncate">
                                      {dataStr}{userMatch ? ` — ${userMatch[1]}` : ''}
                                    </span>
                                  </div>
                                );
                              })()}
                              {!card.ultimoContato && card.responsavelNome !== 'Não atribuído' && (
                                <div className="flex items-center gap-1 mt-1 text-[10px]">
                                  <UserCheck className="w-3 h-3 text-muted-foreground shrink-0" />
                                  <span className="text-muted-foreground">{card.responsavelNome}</span>
                                </div>
                              )}
                            </div>
                            <div className="flex gap-1 pt-2 relative">
                              <div className="flex-1 relative">
                                <Button size="sm" variant="secondary" className="flex-1 w-full h-8 text-xs" onClick={(e) => { e.stopPropagation(); setChatMenuCard(chatMenuCard === card.id ? null : card.id); }}>
                                  <MessageSquare className="w-3 h-3 mr-1" />Chat
                                </Button>
                                {chatMenuCard === card.id && (
                                  <div className="absolute bottom-full text-black left-0 mb-1 bg-white/80 border border-border rounded-lg shadow-lg z-50 w-96 p-1" onClick={(e) => e.stopPropagation()}>
                                    <button className="w-full text-left px-3 py-2 text-xl hover:bg-slate-800 hover:text-green-600 rounded flex items-center gap-2" onClick={() => { setChatMenuCard(null); navigate(`/whatsapp?telefone=${encodeURIComponent(normalizePhoneBR(card.clienteTelefone))}`); }}>
                                      <MessageSquare className="w-6 h-6 text-green-600" />
                                      <span>WhatsApp Business (sistema)</span>
                                    </button>
                                    <button className="w-full text-left px-3 py-2 text-xl hover:bg-slate-800 hover:text-green-600 rounded flex items-center gap-2" onClick={() => { setChatMenuCard(null); handleWhatsappDireto(card.clienteTelefone); }}>
                                      <ExternalLink className="w-6 h-6 text-blue-600" />
                                      <span>WhatsApp App / Web</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                              {column.id === 'vencido_n3' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 px-2"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleArquivarCard(card);
                                  }}
                                  title="Arquivar cliente"
                                >
                                  <Archive className="w-4 h-4" />
                                </Button>
                              )}
                              <Button size="sm" variant="default" className="h-8 px-2" onClick={(e) => { e.stopPropagation(); setSelectedCard(card); }}>
                                <ChevronRight className="w-4 h-4" />
                              </Button>
                            </div>
                            {/* Contatado: exibir info do contato + botões confirmar/cancelar */}
                            {card.etapa === 'contatado' && (
                              <>
                                {card.observacao && (
                                  <div className="text-[10px] text-muted-foreground bg-blue-50 dark:bg-blue-900/20 rounded px-2 py-1 mt-1 truncate" title={card.observacao}>
                                    {card.observacao}
                                  </div>
                                )}
                                <div className="flex gap-1 pt-1">
                                  <Button size="sm" className="flex-1 h-7 text-xs bg-green-600 hover:bg-green-700 text-white" onClick={(e) => { e.stopPropagation(); handleAbrirNegociacao(card); }}>
                                    <HandshakeIcon className="w-3 h-3 mr-1" />Acordo + Pix
                                  </Button>
                                  <Button size="sm" variant="destructive" className="flex-1 h-7 text-xs" onClick={(e) => { e.stopPropagation(); handleCancelarContato(card); }}>
                                    <XCircle className="w-3 h-3 mr-1" />Vencido
                                  </Button>
                                </div>
                              </>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </CardContent>
                </Card>
              </div>
            );
          })}
          </div>
        </>
      )}

      {/* Modal de Detalhes */}
      <Dialog open={!!selectedCard} onOpenChange={() => { setSelectedCard(null); setContatoObs(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="w-12 h-12 bg-primary text-white rounded-full flex items-center justify-center font-semibold text-lg">
                {selectedCard?.clienteNome.charAt(0)}
              </div>
              <div>
                <div className="text-foreground">{selectedCard?.clienteNome}</div>
                <div className="text-sm text-muted-foreground font-normal">
                  {selectedCard ? formatCurrency(selectedCard.valorDivida) : ''}
                </div>
              </div>
            </DialogTitle>
          </DialogHeader>
          {selectedCard && (
            <div className="space-y-4">
              {selectedCard.diasAtraso > 0 && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                  <div className="text-sm font-medium text-red-800 dark:text-red-300">
                    Vencido há {selectedCard.diasAtraso} dias
                  </div>
                </div>
              )}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Etapa:</span>
                  <Badge>{(() => {
                    if (selectedCard.etapa === 'vencido') {
                      if (selectedCard.diasAtraso <= 15) return 'N1 · 1-15 dias';
                      if (selectedCard.diasAtraso <= 45) return 'N2 · 16-45 dias';
                      return 'N3 · 46+ dias';
                    }
                    return COLUMNS.find((c) => c.id === selectedCard.etapa)?.title ?? selectedCard.etapa;
                  })()}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Responsável:</span>
                  <span className="font-medium text-foreground">{selectedCard.responsavelNome}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Contatos:</span>
                  <span className="font-medium text-foreground">{selectedCard.tentativasContato}x</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Telefone:</span>
                  <span className="font-medium text-foreground">{selectedCard.clienteTelefone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email:</span>
                  <span className="font-medium text-foreground">{selectedCard.clienteEmail}</span>
                </div>
                {selectedCard.observacao && (
                  <div className="mt-2 p-2 bg-muted rounded text-xs text-muted-foreground">
                    <strong>Obs.:</strong> {selectedCard.observacao}
                  </div>
                )}
              </div>
              {/* ── Empréstimos do Cliente ─────────────────────── */}
              {(() => {
                const emps = emprestimosByCliente.get(selectedCard.clienteId) ?? [];
                if (emps.length === 0) return null;
                const statusBadge = (s: string) => {
                  const m: Record<string, { label: string; cls: string }> = {
                    ativo: { label: 'Ativo', cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
                    quitado: { label: 'Quitado', cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
                    inadimplente: { label: 'Inadimplente', cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
                  };
                  const c = m[s] || { label: s, cls: '' };
                  return <Badge className={c.cls}>{c.label}</Badge>;
                };
                return (
                  <div className="space-y-2 border-t pt-3">
                    <div className="flex items-center gap-2">
                      <Banknote className="w-4 h-4 text-muted-foreground" />
                      <label className="text-sm font-medium text-foreground">Empréstimos ({emps.length})</label>
                    </div>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {emps.map((emp) => (
                        <div key={emp.id} className="bg-muted/50 rounded-lg p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-foreground">{formatCurrency(emp.valor)}</span>
                            {statusBadge(emp.status)}
                          </div>
                          <div className="grid grid-cols-2 gap-1 text-xs">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Parcelas:</span>
                              <span className="font-medium">{emp.parcelasPagas}/{emp.parcelas}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Juros:</span>
                              <span className="font-medium">{emp.taxaJuros}% {emp.tipoJuros === 'mensal' ? 'a.m.' : emp.tipoJuros === 'semanal' ? 'a.s.' : 'a.d.'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Parcela:</span>
                              <span className="font-medium">{formatCurrency(emp.valorParcela)}</span>
                            </div>
                            <div className="flex justify-between">  
                              <span className="text-muted-foreground">Venc.:</span>
                              <span className="font-medium">{new Date(emp.proximoVencimento).toLocaleDateString('pt-BR')}</span>
                            </div>
                          </div>
                          {(emp.status === 'ativo' || emp.status === 'inadimplente') && (
                            <div className="flex gap-1 pt-1">
                              {emp.status === 'ativo' && (
                                <Button size="sm" variant="outline" className="flex-1 h-7 text-xs text-red-600 border-red-200 hover:bg-red-50" onClick={() => {
                                  updateEmprestimo.mutate({ id: emp.id, data: { status: 'inadimplente' } }, {
                                    onSuccess: () => toast.success('Empréstimo marcado como inadimplente'),
                                    onError: (err) => toast.error(`Erro: ${err.message}`),
                                  });
                                }}>
                                  <AlertOctagon className="w-3 h-3 mr-1" />Inadimplente
                                </Button>
                              )}
                              <Button size="sm" variant="outline" className="flex-1 h-7 text-xs text-green-600 border-green-200 hover:bg-green-50" onClick={() => {
                                setQuitarEmpId(emp.id);
                                setQuitarTipo('manual');
                                setComprovanteFile(null);
                                setComprovantePreview(null);
                                setShowQuitarModal(true);
                              }}>
                                <CheckCircle2 className="w-3 h-3 mr-1" />Confirmar Pag.
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* ── Envio Rápido via Templates ──────────────── */}
              {allTemplates.length > 0 && instanciasConectadas.length > 0 && (
                <div className="space-y-2 border-t pt-3">
                  <label className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Send className="w-4 h-4 text-muted-foreground" />
                    Envio Rápido
                  </label>
                  {instanciasConectadas.length > 1 && (
                    <Select
                      value={negInstanciaId || instanciasConectadas[0]?.id}
                      onValueChange={setNegInstanciaId}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Instância WhatsApp" />
                      </SelectTrigger>
                      <SelectContent>
                        {instanciasConectadas.map((inst) => (
                          <SelectItem key={inst.id} value={inst.id}>
                            {inst.instance_name} ({inst.phone_number || 'sem número'})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <div className="grid grid-cols-1 gap-1.5 max-h-40 overflow-y-auto">
                    {allTemplates.map((tpl) => {
                      const catColors: Record<string, string> = {
                        cobranca: 'text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-900/20',
                        lembrete: 'text-amber-600 border-amber-200 hover:bg-amber-50 dark:hover:bg-amber-900/20',
                        negociacao: 'text-orange-600 border-orange-200 hover:bg-orange-50 dark:hover:bg-orange-900/20',
                      };
                      return (
                        <Button
                          key={tpl.id}
                          size="sm"
                          variant="outline"
                          className={`h-auto py-1.5 px-2 text-xs justify-start ${catColors[tpl.categoria] || ''}`}
                          disabled={enviarWhatsapp.isPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            // Preencher variáveis do template
                            let msg = tpl.mensagemMasculino;
                            msg = msg.replace(/\{nome\}/gi, selectedCard.clienteNome);
                            msg = msg.replace(/\{valor\}/gi, formatCurrency(selectedCard.valorDivida));
                            msg = msg.replace(/\{dias_atraso\}/gi, String(selectedCard.diasAtraso));
                            const instId = negInstanciaId || instanciasConectadas[0]?.id;
                            if (!instId) { toast.error('Nenhuma instância conectada'); return; }
                            handleEnviarWhatsappCobranca(selectedCard, instId, msg);
                          }}
                        >
                          <Badge variant="outline" className="text-[9px] px-1 mr-1.5 shrink-0">{tpl.categoria}</Badge>
                          <span className="truncate">{tpl.nome}</span>
                          <Send className="w-3 h-3 ml-auto shrink-0 opacity-50" />
                        </Button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Clique para enviar automaticamente via WhatsApp e mover para Contatado
                  </p>
                </div>
              )}

              <div className="space-y-2 border-t pt-3">
                <label className="text-sm font-medium text-foreground">Registrar contato</label>
                <Textarea placeholder="Observação sobre o contato..." value={contatoObs} onChange={(e) => setContatoObs(e.target.value)} rows={2} />
                <Button size="sm" onClick={handleRegistrarContato} disabled={registrarContato.isPending} className="w-full">
                  {registrarContato.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Phone className="w-4 h-4 mr-2" />}
                  Registrar Contato
                </Button>
              </div>
              <div className="flex gap-2 pt-2">
                <Button className="flex-1" variant="outline" onClick={() => navigate(`/whatsapp?telefone=${encodeURIComponent(normalizePhoneBR(selectedCard.clienteTelefone))}`)}><MessageSquare className="w-4 h-4 mr-2" />Chat</Button>
                <Button className="flex-1" variant="outline" onClick={() => window.open(`tel:${selectedCard.clienteTelefone}`, '_self')}><Phone className="w-4 h-4 mr-2" />Ligar</Button>
                <Button className="flex-1 bg-secondary hover:bg-secondary/90" onClick={() => {
                  handleAbrirNegociacao(selectedCard);
                  setSelectedCard(null);
                }}>
                  <HandshakeIcon className="w-4 h-4 mr-2" />Negociar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Modal Confirmar Pagamento (com comprovante) ─── */}
      <Dialog open={showQuitarModal} onOpenChange={(open) => { if (!open) { setShowQuitarModal(false); setQuitarEmpId(null); setComprovanteFile(null); setComprovantePreview(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              Confirmar Pagamento Manual
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Anexe o comprovante de pagamento (imagem) para confirmar a quitação. O comprovante ficará disponível para consulta.
            </p>

            {/* Upload comprovante */}
            {comprovantePreview ? (
              <div className="relative rounded-lg overflow-hidden border">
                <img src={comprovantePreview} alt="Comprovante" className="w-full h-48 object-contain bg-muted" />
                <button
                  onClick={() => { setComprovanteFile(null); setComprovantePreview(null); }}
                  className="absolute top-2 right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                >
                  <XCircle className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center gap-2 p-6 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
                <Upload className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Clique para anexar comprovante</span>
                <span className="text-xs text-muted-foreground">JPG, PNG ou WebP</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setComprovanteFile(file);
                      setComprovantePreview(URL.createObjectURL(file));
                    }
                  }}
                />
              </label>
            )}

            <div className="flex gap-3">
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                disabled={!comprovanteFile || quitarLoading}
                onClick={async () => {
                  if (!quitarEmpId || !comprovanteFile) return;
                  setQuitarLoading(true);
                  try {
                    // Upload comprovante to Supabase storage
                    const ext = comprovanteFile.name.split('.').pop() || 'jpg';
                    const path = `comprovantes/${quitarEmpId}/${Date.now()}.${ext}`;
                    const { error: upErr } = await supabase.storage
                      .from('whatsapp-media')
                      .upload(path, comprovanteFile, { contentType: comprovanteFile.type });
                    if (upErr) throw new Error(`Upload falhou: ${upErr.message}`);

                    const { data: urlData } = supabase.storage.from('whatsapp-media').getPublicUrl(path);
                    const comprovanteUrl = urlData.publicUrl;

                    // Registrar pagamento em todas as parcelas pendentes do empréstimo
                    const hoje = new Date().toISOString().split('T')[0];
                    const { data: parcelasPendentes } = await (supabase
                      .from('parcelas') as any)
                      .select('id')
                      .eq('emprestimo_id', quitarEmpId)
                      .in('status', ['pendente', 'vencida']);

                    for (const p of parcelasPendentes ?? []) {
                      const updateData: ParcelaUpdate = {
                        status: 'paga',
                        data_pagamento: hoje,
                        pagamento_tipo: 'manual',
                        comprovante_url: comprovanteUrl,
                        confirmado_por: user?.id,
                        confirmado_em: new Date().toISOString(),
                      };
                      await (supabase.from('parcelas') as any).update(updateData).eq('id', p.id);
                    }

                    // Quitar empréstimo
                    const empData = emprestimos.find(e => e.id === quitarEmpId);
                    if (empData) {
                      quitarEmprestimo.mutate({ id: quitarEmpId, totalParcelas: empData.parcelas });
                    }

                    toast.success('Pagamento confirmado com comprovante!');
                    setShowQuitarModal(false);
                    setQuitarEmpId(null);
                    setComprovanteFile(null);
                    setComprovantePreview(null);
                  } catch (err) {
                    toast.error(`Erro: ${err instanceof Error ? err.message : 'Falha ao confirmar pagamento'}`);
                  } finally {
                    setQuitarLoading(false);
                  }
                }}
              >
                {quitarLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                Confirmar Quitação
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setShowQuitarModal(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modal de Negociação ─────────────────────────── */}
      <Dialog open={showNegociacao} onOpenChange={(open) => { if (!open) { setShowNegociacao(false); setNegociacaoCard(null); setNegCobrancaCriada(null); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <HandshakeIcon className="w-6 h-6 text-orange-500" />
              <div>
                <div className="text-foreground">Negociação — {negociacaoCard?.clienteNome}</div>
                <div className="text-sm text-muted-foreground font-normal">
                  Dívida: {negociacaoCard ? formatCurrency(negociacaoCard.valorDivida) : ''} · {negociacaoCard?.diasAtraso || 0} dias em atraso
                </div>
              </div>
            </DialogTitle>
          </DialogHeader>
          {negociacaoCard && (
            <div className="space-y-4">
              {/* ── Valor Acordado + Gerar Pix ─────────────── */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Banknote className="w-4 h-4 text-muted-foreground" />
                  Valor Acordado (R$)
                </label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0,00"
                    value={negValorAcordado}
                    onChange={(e) => setNegValorAcordado(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    disabled={criarCobrancaWoovi.isPending || !negValorAcordado || Number(negValorAcordado) <= 0}
                    onClick={() => handleGerarPix(negociacaoCard)}
                    className="whitespace-nowrap"
                  >
                    {criarCobrancaWoovi.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Banknote className="w-4 h-4 mr-2" />}
                    Gerar Pix (24h)
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Gera cobrança Pix via Woovi com expiração de 24h. Ao pagar, o sistema atualiza automaticamente.
                </p>
              </div>

              {/* ── Parâmetros do Acordo ── */}
              <div className="space-y-2 rounded-lg border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20 p-3">
                <p className="text-sm font-medium flex items-center gap-2">
                  <HandshakeIcon className="w-4 h-4 text-green-600" />
                  Parâmetros do Acordo
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Entrada (%)</label>
                    <Input type="number" min="0" max="100" step="1"
                      value={acordoEntradaPct}
                      onChange={(e) => setAcordoEntradaPct(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Parcelas</label>
                    <Input type="number" min="1" max="48" step="1"
                      value={acordoNumParcelas}
                      onChange={(e) => setAcordoNumParcelas(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Dia pgto</label>
                    <Input type="number" min="1" max="28" step="1"
                      value={acordoDiaPagamento}
                      onChange={(e) => setAcordoDiaPagamento(e.target.value)}
                    />
                  </div>
                </div>
                {negValorAcordado && Number(negValorAcordado) > 0 && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Entrada: <strong>{formatCurrency(Number(negValorAcordado) * Number(acordoEntradaPct) / 100)}</strong> · Restante: <strong>{(Number(acordoNumParcelas) || 1)}x {formatCurrency((Number(negValorAcordado) - Number(negValorAcordado) * Number(acordoEntradaPct) / 100) / (Number(acordoNumParcelas) || 1))}</strong> todo dia <strong>{acordoDiaPagamento}</strong>
                  </div>
                )}
              </div>

              {/* ── Cobrança Pix Gerada ────────────────────── */}
              {negCobrancaCriada && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 space-y-3">
                  <div className="text-sm font-medium text-green-800 dark:text-green-300 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    Cobrança Pix gerada — expira em 24h
                  </div>
                  {negCobrancaCriada.qrCodeImage && (
                    <div className="flex justify-center">
                      <img src={negCobrancaCriada.qrCodeImage} alt="QR Code Pix" className="w-40 h-40 rounded" />
                    </div>
                  )}
                  {negCobrancaCriada.paymentLink && (
                    <div className="flex gap-2">
                      <Input value={negCobrancaCriada.paymentLink} readOnly className="text-xs flex-1" />
                      <Button size="sm" variant="outline" onClick={() => {
                        navigator.clipboard.writeText(negCobrancaCriada.paymentLink!);
                        toast.success('Link copiado!');
                      }}>
                        Copiar
                      </Button>
                    </div>
                  )}
                  {negCobrancaCriada.brCode && (
                    <Button size="sm" variant="ghost" className="w-full text-xs" onClick={() => {
                      navigator.clipboard.writeText(negCobrancaCriada.brCode!);
                      toast.success('Código Pix Copia e Cola copiado!');
                    }}>
                      Copiar código Pix Copia e Cola
                    </Button>
                  )}
                </div>
              )}

              {/* Template selector */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  Template de Mensagem
                </label>
                <Select value={negTemplateId} onValueChange={(v) => handleAplicarTemplate(v, negociacaoCard)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {allTemplates.length === 0 && (
                      <SelectItem value="_none" disabled>Nenhum template cadastrado</SelectItem>
                    )}
                    {allTemplates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        <span className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] px-1">{t.categoria}</Badge>
                          {t.nome}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">
                  Variáveis: {'{nome}'}, {'{valor}'}, {'{dias_atraso}'}, {'{valor_acordado}'}, {'{link_pix}'}
                </p>
              </div>

              {/* Mensagem */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Mensagem</label>
                <Textarea
                  rows={5}
                  placeholder="Escreva a mensagem de negociação ou selecione um template acima..."
                  value={negMsg}
                  onChange={(e) => setNegMsg(e.target.value)}
                />
              </div>

              {/* Instância selector */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Enviar via instância</label>
                {instanciasConectadas.length === 0 ? (
                  <p className="text-xs text-red-500">Nenhuma instância WhatsApp conectada</p>
                ) : (
                  <Select value={negInstanciaId} onValueChange={setNegInstanciaId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar instância..." />
                    </SelectTrigger>
                    <SelectContent>
                      {instanciasConectadas.map((inst) => (
                        <SelectItem key={inst.id} value={inst.id}>
                          {inst.instance_name} ({inst.phone_number || 'sem número'})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Ações */}
              <div className="space-y-2 pt-2">
                {/* ── Ação principal: Fechar Acordo + Pix + WhatsApp ── */}
                <Button
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                  disabled={criarCobrancaWoovi.isPending || enviarWhatsapp.isPending || !negInstanciaId || !negValorAcordado || Number(negValorAcordado) <= 0}
                  onClick={() => handleFecharAcordoComPix(negociacaoCard)}
                >
                  {(criarCobrancaWoovi.isPending || enviarWhatsapp.isPending) ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCheck className="w-4 h-4 mr-2" />}
                  Fechar Acordo — Gerar Pix + Enviar WhatsApp
                </Button>
                <p className="text-[10px] text-muted-foreground text-center">
                  Gera cobrança Pix (24h), envia mensagem com link ao cliente e move o card para Acordos
                </p>

                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                  <div className="relative flex justify-center text-xs"><span className="bg-background px-2 text-muted-foreground">ou envie manualmente</span></div>
                </div>

                {/* ── Ações manuais ── */}
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    variant="outline"
                    disabled={enviarWhatsapp.isPending || !negInstanciaId || !negMsg.trim()}
                    onClick={() => handleEnviarWhatsappCobranca(negociacaoCard, negInstanciaId, negMsg)}
                  >
                    {enviarWhatsapp.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                    Enviar Mensagem
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      handleWhatsappDireto(negociacaoCard.clienteTelefone, negMsg);
                      const obs = `Mensagem enviada via WhatsApp app/web por ${user?.name || 'Sistema'}`;
                      updateCard.mutate({ id: negociacaoCard.id, updates: {
                        etapa: 'contatado',
                        tentativas_contato: negociacaoCard.tentativasContato + 1,
                        ultimo_contato: new Date().toISOString(),
                        observacao: obs,
                      }});
                      toast.success('WhatsApp aberto — card movido para Contatado');
                      setShowNegociacao(false);
                      setNegociacaoCard(null);
                      setNegCobrancaCriada(null);
                    }}
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />App/Web
                  </Button>
                </div>
              </div>

              {/* Mover para negociação sem enviar */}
              <Button
                variant="ghost"
                className="w-full text-muted-foreground text-xs"
                onClick={() => {
                  updateCard.mutate({ id: negociacaoCard.id, updates: { etapa: 'negociacao' } }, {
                    onSuccess: () => {
                      toast.success('Card movido para Negociação');
                      setShowNegociacao(false);
                      setNegociacaoCard(null);
                    },
                  });
                }}
              >
                Apenas mover para Negociação (sem enviar mensagem)
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
