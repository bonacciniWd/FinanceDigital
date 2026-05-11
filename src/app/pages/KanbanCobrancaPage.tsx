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
  ArrowUpDown,
  Download,
  Users,
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
import { useRegistrarPagamento, useParcelas } from '../hooks/useParcelas';
import { useCriarAcordo, useAcordos } from '../hooks/useAcordos';
import { useClientes } from '../hooks/useClientes';
import { useAdminUsers } from '../hooks/useAdminUsers';
import ComprovanteUploader from '../components/ComprovanteUploader';
import { useConfigSistema } from '../hooks/useConfigSistema';
import { supabase } from '../lib/supabase';
import { valorCorrigido } from '../lib/juros';
import { formatDateBR, todayISO, parseISODateLocal } from '../lib/date-utils';
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
  vence_hoje: 'a_vencer',
  vencido_n1: 'vencido',
  vencido_n2: 'vencido',
  vencido_n3: 'vencido',
};

const columnToEtapa = (colId: string): KanbanCobrancaEtapa =>
  VIRTUAL_ETAPA_MAP[colId] ?? (colId as KanbanCobrancaEtapa);

const COLUMNS: ColumnDef[] = [
  { id: 'vence_hoje',  title: 'VENCE HOJE',       dotColor: '#facc15' },
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
  const [busca, setBusca] = useState('');
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  // Menu "mover para" por card (id do card aberto)
  const [moveMenuCard, setMoveMenuCard] = useState<string | null>(null);
  // Sort por coluna (toggle asc/desc por dias de atraso/proximidade do vencimento)
  const [sortByCol, setSortByCol] = useState<Record<string, 'asc' | 'desc'>>({});

  // Chat dropdown state
  const [chatMenuCard, setChatMenuCard] = useState<string | null>(null);

  // Fechar menus ao clicar fora
  useEffect(() => {
    if (!chatMenuCard && !moveMenuCard) return;
    const close = () => { setChatMenuCard(null); setMoveMenuCard(null); };
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [chatMenuCard, moveMenuCard]);

  // Quitar modal state
  const [showQuitarModal, setShowQuitarModal] = useState(false);
  const [quitarEmpId, setQuitarEmpId] = useState<string | null>(null);
  const [quitarTipo, setQuitarTipo] = useState<'pix' | 'manual'>('pix');
  const [comprovanteFile, setComprovanteFile] = useState<File | null>(null);
  const [comprovantePreview, setComprovantePreview] = useState<string | null>(null);
  const [quitarLoading, setQuitarLoading] = useState(false);

  // Gerar PIX per parcela
  const [gerandoPixId, setGerandoPixId] = useState<string | null>(null);

  // ── Exportar contatos em lote (cobradores de rua) ──
  const [exportColId, setExportColId] = useState<string | null>(null);
  const [exportSelected, setExportSelected] = useState<Set<string>>(new Set());
  const [exportTargetPhone, setExportTargetPhone] = useState('');
  const [exportSending, setExportSending] = useState(false);

  const { data: allCards = [], isLoading, error, refetch } = useCardsCobranca();
  const { data: emprestimos = [] } = useEmprestimos();
  const { data: parcelasPendentes = [] } = useParcelas('pendente');
  const { data: parcelasVencidasList = [] } = useParcelas('vencida');
  const { data: instancias = [] } = useInstancias();
  const { data: clientes = [] } = useClientes();
  const isManager = user?.role === 'admin' || user?.role === 'gerencia';
  const { data: adminUsers = [] } = useAdminUsers();
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
  const { data: acordosAll = [] } = useAcordos();
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

  // Data de hoje em yyyy-mm-dd (timezone local) — usada para filtrar 'A vencer' = hoje
  const todayStr = useMemo(() => todayISO(), []);

  /**
   * Próximo vencimento FUTURO (>= hoje) e dias de atraso REAIS por cliente,
   * calculados a partir das parcelas pendentes/vencidas (fonte de verdade).
   */
  const parcelasInfoByCliente = useMemo(() => {
    const map = new Map<string, { proxVencFuturo: string | null; diasAtrasoReal: number; vencimentoMaisAntigo: string | null }>();
    const allParcelas = [...parcelasPendentes, ...parcelasVencidasList].filter((p) => !p.congelada);
    const byCliente = new Map<string, typeof allParcelas>();
    for (const p of allParcelas) {
      if (!byCliente.has(p.clienteId)) byCliente.set(p.clienteId, []);
      byCliente.get(p.clienteId)!.push(p);
    }
    for (const [cid, parts] of byCliente) {
      const datas = parts.map((p) => p.dataVencimento).filter(Boolean).sort();
      const futuras = datas.filter((d) => d >= todayStr);
      const passadas = datas.filter((d) => d < todayStr);
      const proxVencFuturo = futuras[0] ?? null;
      const vencimentoMaisAntigo = passadas[0] ?? null;
      let diasAtrasoReal = 0;
      if (vencimentoMaisAntigo) {
        const venc = parseISODateLocal(vencimentoMaisAntigo)!;
        const hoje = parseISODateLocal(todayStr)!;
        diasAtrasoReal = Math.max(0, Math.floor((hoje.getTime() - venc.getTime()) / 86400000));
      }
      map.set(cid, { proxVencFuturo, diasAtrasoReal, vencimentoMaisAntigo });
    }
    return map;
  }, [parcelasPendentes, parcelasVencidasList, todayStr]);

  const filteredCards = useMemo(() => {
    // Enriquece cada card com diasAtraso REAL (recalculado a partir de parcelas live).
    // Garante que o badge "8d" reflita a realidade mesmo se o sync da DB estiver atrasado.
    const enriched = allCards.map((c) => {
      const info = parcelasInfoByCliente.get(c.clienteId);
      if (!info) return c;
      return { ...c, diasAtraso: info.diasAtrasoReal };
    });
    if (!busca.trim()) return enriched;
    const lower = busca.toLowerCase();
    return enriched.filter(
      (c) =>
        c.clienteNome.toLowerCase().includes(lower) ||
        c.clienteEmail.toLowerCase().includes(lower) ||
        c.responsavelNome.toLowerCase().includes(lower)
    );
  }, [allCards, busca, parcelasInfoByCliente]);

  /** Próximo vencimento FUTURO entre os empréstimos ativos/inadimplentes do cliente (legado, mantido p/ filtro 'A vencer'). */
  const proximoVencDoCliente = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const [cid, info] of parcelasInfoByCliente) {
      map.set(cid, info.proxVencFuturo);
    }
    return map;
  }, [parcelasInfoByCliente]);

  const cardsByEtapa = useMemo(() => {
    const map: Record<string, KanbanCobrancaView[]> = {};
    // Estados "finais" não devem aparecer em vence_hoje mesmo que tenham parcelas pendentes
    const ETAPAS_FINAIS = new Set(['pago', 'perdido', 'arquivado', 'contatado', 'negociacao', 'acordo']);

    for (const col of COLUMNS) {
      let list: KanbanCobrancaView[];
      if (col.id === 'vence_hoje') {
        // PRÓXIMO vencimento (de qualquer parcela live) === hoje E o cliente NÃO
        // pode ter parcelas em atraso. Se tiver parcela vencida, ele aparece na
        // coluna correspondente aos dias de atraso (N1/N2/N3), não em "vence hoje".
        list = filteredCards.filter((c) => {
          if (ETAPAS_FINAIS.has(c.etapa)) return false;
          const info = parcelasInfoByCliente.get(c.clienteId);
          if (!info) return false;
          if (info.vencimentoMaisAntigo) return false; // tem parcela atrasada → outra coluna
          return info.proxVencFuturo === todayStr;
        });
      } else if (col.id === 'vencido_n1') {
        list = filteredCards.filter((c) => c.etapa === 'vencido' && c.diasAtraso >= 1 && c.diasAtraso <= 15);
      } else if (col.id === 'vencido_n2') {
        list = filteredCards.filter((c) => c.etapa === 'vencido' && c.diasAtraso >= 16 && c.diasAtraso <= 45);
      } else if (col.id === 'vencido_n3') {
        list = filteredCards.filter((c) => c.etapa === 'vencido' && c.diasAtraso >= 46 && c.diasAtraso <= 365);
      } else if (col.id === 'arquivado') {
        list = filteredCards.filter((c) => c.etapa === 'arquivado' || (c.etapa === 'vencido' && c.diasAtraso > 365));
      } else {
        list = filteredCards.filter((c) => c.etapa === col.id);
      }

      // Ordenação por coluna — default: 'desc' (mais atrasados primeiro)
      const dir = sortByCol[col.id] ?? 'desc';
      const sorted = [...list].sort((a, b) => {
        const diff = a.diasAtraso - b.diasAtraso;
        return dir === 'desc' ? -diff : diff;
      });
      map[col.id] = sorted;
    }
    return map;
  }, [filteredCards, proximoVencDoCliente, todayStr, sortByCol]);

  const toggleSortCol = (colId: string) =>
    setSortByCol((prev) => ({ ...prev, [colId]: (prev[colId] ?? 'desc') === 'desc' ? 'asc' : 'desc' }));

  const stats = useMemo(() => {
    // Exclui pago/perdido/arquivado E também os "vencidos" antigos (>365 dias)
    // que são exibidos na coluna ARQUIVADOS por regra de negócio.
    const cardsAtivos = allCards.filter((c) => {
      if (['pago', 'perdido', 'arquivado'].includes(c.etapa)) return false;
      if (c.etapa === 'vencido' && c.diasAtraso > 365) return false;
      return true;
    });
    const total = cardsAtivos.reduce((sum, c) => sum + c.valorDivida, 0);
    const negociacao = cardsAtivos
      .filter((c) => c.etapa === 'negociacao')
      .reduce((sum, c) => sum + c.valorDivida, 0);
    const acordos = cardsAtivos.filter((c) => c.etapa === 'acordo').length;
    const pagos = allCards.filter((c) => c.etapa === 'pago');
    const totalPagoCards = pagos.reduce((sum, c) => sum + c.valorDivida, 0);
    // Soma entrada paga de acordos ativos/quitados (não cancelados/quebrados).
    // valor_parcela das parcelas pagas do acordo também conta como recuperado.
    const totalEntradasAcordo = acordosAll
      .filter((a) => a.entrada_paga && (a.status === 'ativo' || a.status === 'quitado'))
      .reduce((sum, a) => sum + Number(a.valor_entrada ?? 0), 0);
    const totalPago = totalPagoCards + totalEntradasAcordo;
    const totalClientes = cardsAtivos.length;
    const totalNegociacao = cardsAtivos.filter((c) => c.etapa === 'negociacao').length;
    const taxaConversao = totalNegociacao > 0
      ? Math.round((acordos / totalNegociacao) * 100)
      : 0;
    return { total, negociacao, acordos, totalClientes, taxaConversao, totalPago };
  }, [allCards, acordosAll]);

  const handleDragStart = (e: React.DragEvent, cardId: string) => {
    // 'text/plain' garante compatibilidade ampla; 'cardId' mantido para compat.
    e.dataTransfer.setData('text/plain', cardId);
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
    const cardId = e.dataTransfer.getData('cardId') || e.dataTransfer.getData('text/plain');
    if (!cardId) return;

    const card = allCards.find((c) => c.id === cardId);
    if (!card) return;
    const novaEtapa = columnToEtapa(columnId);
    // Mesma etapa de DB (ex.: N1↔N2↔N3 todos são 'vencido'): apenas avisa.
    if (card.etapa === novaEtapa) {
      toast.info(`Card já está em ${COLUMNS.find((c) => c.id === columnId)?.title}`);
      return;
    }
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

  // ── Export: helpers ────────────────────────────────────────
  const clientesById = useMemo(() => {
    const m = new Map<string, typeof clientes[number]>();
    clientes.forEach((c) => m.set(c.id, c));
    return m;
  }, [clientes]);

  /** Telefone padrão do cobrador (a partir da instância dele). Admin/gerência cai em vazio. */
  const defaultCobradorPhone = useMemo(() => {
    if (!user?.id) return '';
    const minha = instancias.find((i) => i.created_by === user.id && i.phone_number);
    return minha?.phone_number ?? '';
  }, [instancias, user?.id]);

  /** Lista de cobradores disponíveis (admin/gerência podem ver todos com instância conectada+phone). */
  const cobradoresDisponiveis = useMemo(() => {
    if (!isManager) return [];
    // Mapa userId -> primeiro phone_number da instância dele (não-system, conectada)
    const phoneByUser = new Map<string, string>();
    for (const inst of instancias) {
      const isSys = (inst as any).is_system;
      if (isSys) continue;
      if (!inst.phone_number || !inst.created_by) continue;
      if (!phoneByUser.has(inst.created_by)) {
        phoneByUser.set(inst.created_by, inst.phone_number);
      }
    }
    return adminUsers
      .filter((u) => ['cobranca', 'admin', 'gerencia'].includes(u.role) && phoneByUser.has(u.id))
      .map((u) => ({ id: u.id, name: u.name, role: u.role, phone: phoneByUser.get(u.id)! }));
  }, [isManager, adminUsers, instancias]);

  const openExportModal = (colId: string) => {
    const cardsCol = cardsByEtapa[colId] ?? [];
    setExportColId(colId);
    setExportSelected(new Set(cardsCol.map((c) => c.id))); // todos selecionados por padrão
    setExportTargetPhone(defaultCobradorPhone);
  };

  const buildEnderecoCliente = (c: ReturnType<typeof clientesById.get>): string => {
    if (!c) return '—';
    const partes = [
      [c.rua, c.numero].filter(Boolean).join(', '),
      c.bairro,
      [c.cidade, c.estado].filter(Boolean).join(' - '),
      c.cep,
    ].filter(Boolean);
    return partes.join(' • ') || c.endereco || '—';
  };

  const buildExportMessage = (cardIds: string[]): string => {
    const allParcelas = [...parcelasPendentes, ...parcelasVencidasList].filter((p) => !p.congelada);
    const linhas: string[] = [
      '*📋 Lista de Cobrança — Casa da Moeda*',
      `_Gerado em ${formatDateBR(new Date().toISOString())}_`,
      '',
    ];
    let totalGeral = 0;
    cardIds.forEach((cid, idx) => {
      const card = allCards.find((c) => c.id === cid);
      if (!card) return;
      const cli = clientesById.get(card.clienteId);
      const psCli = allParcelas.filter((p) => p.clienteId === card.clienteId);
      const valorOriginal = psCli.reduce((s, p) => s + (p.valorOriginal || 0), 0);
      const juros = psCli.reduce((s, p) => s + (p.juros || 0), 0);
      const multa = psCli.reduce((s, p) => s + (p.multa || 0), 0);
      const valorAtraso = card.valorDivida || (valorOriginal + juros + multa);
      totalGeral += valorAtraso;
      linhas.push(`*${idx + 1}. ${card.clienteNome}*`);
      if (cli?.cpf) linhas.push(`   • CPF: ${cli.cpf}`);
      linhas.push(`   • Tel: ${card.clienteTelefone || cli?.telefone || '—'}`);
      linhas.push(`   • Endereço: ${buildEnderecoCliente(cli)}`);
      linhas.push(`   • Valor original: ${formatCurrency(valorOriginal)}`);
      linhas.push(`   • Juros/multa: ${formatCurrency(juros + multa)}`);
      linhas.push(`   • *Total em atraso: ${formatCurrency(valorAtraso)}*`);
      linhas.push(`   • Dias em atraso: ${card.diasAtraso}`);
      linhas.push('');
    });
    linhas.push(`*Total da rota: ${formatCurrency(totalGeral)}*`);
    linhas.push(`*Clientes: ${cardIds.length}*`);
    return linhas.join('\n');
  };

  const handleEnviarExport = async () => {
    if (!exportColId) return;
    if (exportSelected.size === 0) {
      toast.error('Selecione pelo menos um cliente');
      return;
    }
    const phoneDigits = normalizePhoneBR(exportTargetPhone);
    if (phoneDigits.length < 12) {
      toast.error('Telefone inválido — informe um número com DDD');
      return;
    }
    const sistema = instancias.find((i) => (i as any).is_system && i.status === 'conectado')
      ?? instanciasConectadas[0];
    if (!sistema) {
      toast.error('Nenhuma instância do sistema conectada');
      return;
    }
    setExportSending(true);
    try {
      const ids = Array.from(exportSelected);
      const mensagem = buildExportMessage(ids);
      await enviarWhatsapp.mutateAsync({
        instancia_id: sistema.id,
        telefone: phoneDigits,
        conteudo: mensagem,
        tipo: 'text',
      });
      toast.success(`Lista enviada para ${phoneDigits} (${ids.length} clientes)`);
      setExportColId(null);
      setExportSelected(new Set());
    } catch (err: any) {
      toast.error(`Erro ao enviar: ${err.message || ''}`);
    } finally {
      setExportSending(false);
    }
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

  // Abrir WhatsApp em janela interna (Electron) ou wa.me (web fallback)
  const handleWhatsappDireto = (telefone: string, mensagem?: string) => {
    const num = normalizePhoneBR(telefone);
    const api = (window as unknown as { electronAPI?: { openWhatsApp?: (p: string, m?: string) => Promise<boolean> } }).electronAPI;
    if (api?.openWhatsApp) {
      api.openWhatsApp(num, mensagem);
      return;
    }
    // Fallback navegador: usa web.whatsapp.com/send para forçar Web (não tenta abrir o app)
    const params = new URLSearchParams({ phone: num });
    if (mensagem) params.set('text', mensagem);
    window.open(`https://web.whatsapp.com/send?${params.toString()}`, '_blank');
  };

  /**
   * Monta mensagem de abertura de cobrança com detalhes da dívida do cliente.
   *
   * Prioriza o uso de **templates da página de Templates** (categoria `cobranca`)
   * para manter consistência com o cron automático e permitir customização sem
   * mexer no código. Se nenhum template casar com `diasAtraso`, faz fallback
   * para a mensagem detalhada hardcoded.
   *
   * Variáveis interpoladas: {nome}, {valor}, {data}, {numeroParcela},
   * {diasAtraso}, {totalParcelas}, {parcelasPagas}.
   */
  const montarMensagemCobranca = (card: KanbanCobrancaView): string => {
    const primeiroNome = (card.clienteNome || 'cliente').split(' ')[0];
    const empsCliente = (emprestimosByCliente.get(card.clienteId) ?? []).filter(
      (e) => e.status === 'ativo' || e.status === 'inadimplente',
    );
    const congelar = card.etapa === 'arquivado' || card.etapa === 'perdido';

    // Parcelas em aberto (pendente + vencida, não congeladas) do cliente
    const parcelasCliente = [...parcelasPendentes, ...parcelasVencidasList].filter(
      (p) => p.clienteId === card.clienteId && !p.congelada,
    );
    const vencidas = parcelasCliente
      .filter((p) => p.status === 'vencida' || p.dataVencimento < todayStr)
      .sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento));
    const futuras = parcelasCliente
      .filter((p) => p.status !== 'vencida' && p.dataVencimento >= todayStr)
      .sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento));

    // Totais corrigidos
    let totalVencido = 0;
    let totalJuros = 0;
    for (const p of vencidas) {
      const c = valorCorrigido(p.valorOriginal, p.dataVencimento, p.juros, p.multa, p.desconto, { congelarJuros: congelar });
      totalVencido += c.total;
      totalJuros += c.juros;
    }
    const totalFuturo = futuras.reduce((s, p) => s + p.valor, 0);
    const totalGeral = totalVencido + totalFuturo;

    // Data do contrato mais antigo
    const dataContrato = empsCliente
      .map((e) => e.dataContrato)
      .filter(Boolean)
      .sort()[0];

    // ── Tenta usar template da página Templates (categoria cobranca) ──
    // Seleciona o template cujo tipoNotificacao corresponde melhor aos diasAtraso atuais
    const dias = Math.max(0, card.diasAtraso || 0);
    const tipoAlvo: string | null = (() => {
      if (dias === 0 && futuras.length > 0) return 'lembrete_vespera';
      if (dias >= 30) return 'vencida_30dias';
      if (dias >= 15) return 'vencida_15dias';
      if (dias >= 7) return 'vencida_7dias';
      if (dias >= 3) return 'vencida_3dias';
      if (dias >= 1) return 'vencida_ontem';
      return null;
    })();

    const cliente = clientes.find((c) => c.id === card.clienteId);
    const sexo = (cliente?.sexo || 'masculino') as 'masculino' | 'feminino';
    const proxima = futuras[0] ?? vencidas[0];
    const valorReferencia = vencidas.length > 0 ? totalVencido : totalGeral;
    const empRef = empsCliente[0];

    const tpl = tipoAlvo
      ? templatesCobranca.find((t) => t.tipoNotificacao === tipoAlvo && t.ativo)
      : null;

    if (tpl) {
      const vars: Record<string, string> = {
        nome: primeiroNome,
        valor: valorReferencia.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        data: proxima ? formatDateBR(proxima.dataVencimento) : '',
        numeroParcela: String(proxima?.numero ?? ''),
        diasAtraso: String(dias),
        totalParcelas: String(empRef?.parcelas ?? ''),
        parcelasPagas: String(empRef?.parcelasPagas ?? ''),
      };
      const base = sexo === 'feminino' ? tpl.mensagemFeminino : tpl.mensagemMasculino;
      const msg = (base || '').replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
      if (msg.trim().length > 0) return msg;
    }

    // ── Fallback: mensagem detalhada hardcoded ──
    const linhas: string[] = [];
    linhas.push(`Olá, ${primeiroNome}! Aqui é da *Casa da Moeda* — Cobrança.`);
    linhas.push('');
    linhas.push('Estamos entrando em contato referente à sua dívida em aberto:');
    linhas.push('');

    if (dataContrato) {
      linhas.push(`📅 Empréstimo de ${formatDateBR(dataContrato)}`);
    }
    if (empsCliente.length > 0) {
      const totalContratado = empsCliente.reduce((s, e) => s + e.valor, 0);
      linhas.push(`💰 Valor contratado: ${formatCurrency(totalContratado)}`);
    }

    if (vencidas.length > 0) {
      linhas.push('');
      linhas.push(`⚠️ *Parcelas em atraso (${vencidas.length}):*`);
      for (const p of vencidas.slice(0, 6)) {
        const c = valorCorrigido(p.valorOriginal, p.dataVencimento, p.juros, p.multa, p.desconto, { congelarJuros: congelar });
        const diasP = c.dias > 0 ? ` · ${c.dias}d atraso` : '';
        linhas.push(`• Parc. ${p.numero} venc. ${formatDateBR(p.dataVencimento)} — ${formatCurrency(c.total)}${diasP}`);
      }
      if (vencidas.length > 6) linhas.push(`• …e mais ${vencidas.length - 6} parcela(s)`);
      if (totalJuros > 0) {
        linhas.push('');
        linhas.push(`Juros e correção aplicados: ${formatCurrency(totalJuros)}`);
      }
    }

    if (futuras.length > 0) {
      const prox = futuras[0];
      linhas.push('');
      linhas.push(`📆 Próximo vencimento: ${formatDateBR(prox.dataVencimento)} — ${formatCurrency(prox.valor)}`);
    }

    linhas.push('');
    linhas.push(`*Total a regularizar hoje: ${formatCurrency(totalGeral)}*`);
    linhas.push('');
    linhas.push('Podemos negociar agora? Estamos à disposição para fechar um acordo.');

    return linhas.join('\n');
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
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => toggleSortCol(column.id)}
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          title={`Ordenar por dias (${(sortByCol[column.id] ?? 'desc') === 'desc' ? 'maior→menor' : 'menor→maior'})`}
                          aria-label="Alternar ordenação"
                        >
                          <ArrowUpDown className="w-3.5 h-3.5" />
                        </button>
                        {(column.id === 'vencido_n1' || column.id === 'vencido_n2' || column.id === 'vencido_n3') && cards.length > 0 && (
                          <button
                            type="button"
                            onClick={() => openExportModal(column.id)}
                            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title="Exportar contatos para o cobrador via WhatsApp"
                            aria-label="Exportar contatos"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <Badge variant="secondary" className="font-semibold">{cards.length}</Badge>
                      </div>
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
                                // Próximo vencimento REAL: futuro mais próximo > vencimento mais antigo (atrasado)
                                const info = parcelasInfoByCliente.get(card.clienteId);
                                const proxVenc = info?.proxVencFuturo ?? info?.vencimentoMaisAntigo ?? null;
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
                                        <span className="font-medium text-foreground">{formatDateBR(proxVenc)}</span>
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
                                    <button className="w-full text-left px-3 py-2 text-xl hover:bg-slate-800 hover:text-green-600 rounded flex items-center gap-2" onClick={() => {
                                      setChatMenuCard(null);
                                      const msg = montarMensagemCobranca(card);
                                      const tel = encodeURIComponent(normalizePhoneBR(card.clienteTelefone));
                                      const txt = encodeURIComponent(msg);
                                      navigate(`/whatsapp?telefone=${tel}&mensagem=${txt}`);
                                    }}>
                                      <MessageSquare className="w-6 h-6 text-green-600" />
                                      <span>WhatsApp Business (sistema)</span>
                                    </button>
                                    <button className="w-full text-left px-3 py-2 text-xl hover:bg-slate-800 hover:text-green-600 rounded flex items-center gap-2" onClick={() => {
                                      setChatMenuCard(null);
                                      handleWhatsappDireto(card.clienteTelefone, montarMensagemCobranca(card));
                                    }}>
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
                              <Button
                                size="sm"
                                variant="default"
                                className="h-8 px-2"
                                title="Mover para outra coluna"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMoveMenuCard(moveMenuCard === card.id ? null : card.id);
                                }}
                              >
                                <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${moveMenuCard === card.id ? 'rotate-90' : ''}`} />
                              </Button>
                            </div>

                            {/* Mover para — inline, sem overflow clipping */}
                            {moveMenuCard === card.id && (
                              <div
                                className="mt-2 rounded-xl border border-border/60 bg-muted/50 backdrop-blur-sm p-1.5"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Mover para</div>
                                <div className="grid grid-cols-2 gap-1">
                                  {COLUMNS.filter((c) => c.id !== column.id).map((c) => (
                                    <button
                                      key={c.id}
                                      className="text-left px-2.5 py-2 text-sm hover:bg-background rounded-lg flex items-center gap-2 transition-colors duration-150 border border-transparent hover:border-border/40"
                                      onClick={() => {
                                        setMoveMenuCard(null);
                                        const novaEtapa = columnToEtapa(c.id);
                                        if (card.etapa === novaEtapa) {
                                          toast.info(`${card.clienteNome} já está em ${c.title}`);
                                          return;
                                        }
                                        moverCard.mutate(
                                          { id: card.id, etapa: novaEtapa },
                                          {
                                            onSuccess: () => toast.success(`Movido para ${c.title}`),
                                            onError: (err) => toast.error(`Erro ao mover: ${err.message}`),
                                          },
                                        );
                                      }}
                                    >
                                      <span
                                        className="kanban-status-dot shrink-0"
                                        style={{ background: c.dotColor, '--dot-color': c.dotColor } as React.CSSProperties}
                                      />
                                      <span className="truncate text-xs">{c.title}</span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                            {/* Contatado: exibir info do contato + botões confirmar/cancelar */}
                            {card.etapa === 'contatado' && (
                              <>
                                {card.observacao && (
                                  <div className="text-[10px] text-muted-foreground bg-blue-50 dark:bg-blue-900/20 rounded px-2 py-1 mt-1 truncate" title={card.observacao}>
                                    {card.observacao}
                                  </div>
                                )}
                                <div className="flex gap-1 pt-1">
                                  <Button size="sm" className="flex-1 h-7 text-xs bg-green-600 hover:bg-green-700 text-white" onClick={(e) => { e.stopPropagation(); openClienteModal(card.clienteId, { tab: 'cobranca' }); }}>
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

      {/* Modal de Detalhes removido — clique no nome abre ClienteDetalhesModal,
          movimentação manual é feita pelo botão ChevronRight (menu "Mover para"). */}

      {/* ── Modal Exportar Contatos para Cobrador (WhatsApp) ─── */}
      <Dialog
        open={!!exportColId}
        onOpenChange={(o) => {
          if (!o) {
            setExportColId(null);
            setExportSelected(new Set());
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="w-5 h-5" />
              Exportar contatos · {COLUMNS.find((c) => c.id === exportColId)?.title}
            </DialogTitle>
          </DialogHeader>
          {exportColId && (() => {
            const cardsCol = cardsByEtapa[exportColId] ?? [];
            const allSelected = cardsCol.length > 0 && cardsCol.every((c) => exportSelected.has(c.id));
            const toggleAll = () => {
              if (allSelected) setExportSelected(new Set());
              else setExportSelected(new Set(cardsCol.map((c) => c.id)));
            };
            const toggleOne = (id: string) => {
              const next = new Set(exportSelected);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              setExportSelected(next);
            };
            return (
              <div className="space-y-3 text-sm">
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  {cobradoresDisponiveis.length > 0 && (
                    <div>
                      <label className="text-xs font-medium block mb-1">Selecionar cobrador</label>
                      <Select
                        onValueChange={(uid) => {
                          const c = cobradoresDisponiveis.find((x) => x.id === uid);
                          if (c) setExportTargetPhone(c.phone);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Escolher cobrador da equipe..." />
                        </SelectTrigger>
                        <SelectContent>
                          {cobradoresDisponiveis.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name} <span className="text-muted-foreground">({c.role}) — {c.phone}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-medium block mb-1">Telefone do cobrador (com DDD)</label>
                    <Input
                      placeholder="Ex.: 47989279037"
                      value={exportTargetPhone}
                      onChange={(e) => setExportTargetPhone(e.target.value)}
                      disabled={exportSending}
                    />
                    {defaultCobradorPhone && (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Sugerido a partir da sua instância conectada: {defaultCobradorPhone}
                      </p>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                    <Send className="w-3 h-3" /> Envio será feito pela instância do <b>sistema</b> (is_system).
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    <Users className="w-3.5 h-3.5" />
                    {allSelected ? 'Desmarcar todos' : 'Selecionar todos'}
                  </button>
                  <span className="text-xs text-muted-foreground">
                    {exportSelected.size}/{cardsCol.length} selecionados
                  </span>
                </div>

                <div className="border rounded-lg divide-y max-h-[40vh] overflow-y-auto">
                  {cardsCol.map((card) => {
                    const cli = clientesById.get(card.clienteId);
                    const checked = exportSelected.has(card.id);
                    return (
                      <label
                        key={card.id}
                        className={`flex items-start gap-2 p-2 cursor-pointer hover:bg-muted/30 ${checked ? 'bg-blue-50 dark:bg-blue-950/30' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleOne(card.id)}
                          className="mt-0.5"
                          disabled={exportSending}
                        />
                        <div className="flex-1 min-w-0 text-xs">
                          <div className="font-medium truncate">{card.clienteNome}</div>
                          <div className="text-muted-foreground truncate">
                            {cli?.cpf || '—'} · {card.clienteTelefone || cli?.telefone || '—'}
                          </div>
                          <div className="text-muted-foreground truncate">
                            {buildEnderecoCliente(cli)}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-amber-700 dark:text-amber-400 font-medium">
                              {formatCurrency(card.valorDivida)}
                            </span>
                            <span className="text-muted-foreground">· {card.diasAtraso}d em atraso</span>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setExportColId(null)}
                    disabled={exportSending}
                  >
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleEnviarExport}
                    disabled={exportSending || exportSelected.size === 0 || !exportTargetPhone.trim()}
                  >
                    {exportSending ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5 mr-1" />
                    )}
                    Enviar lista ({exportSelected.size})
                  </Button>
                </div>
              </div>
            );
          })()}
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

            {(() => {
              const empData = emprestimos.find(e => e.id === quitarEmpId);
              const saldoEstimado = empData
                ? Math.max((empData.parcelas - (empData.parcelasPagas || 0)) * empData.valorParcela, 0)
                : 0;
              return (
                <ComprovanteUploader
                  parcela={{ valor: saldoEstimado }}
                  submitting={quitarLoading}
                  onCancel={() => setShowQuitarModal(false)}
                  confirmLabel="Confirmar Quitação"
                  onConfirm={async ({ file, ocr, ocrAvaliacao, confirmDivergencia }) => {
                    if (!quitarEmpId) return;
                    setQuitarLoading(true);
                    try {
                      const ext = file.name.split('.').pop() || 'jpg';
                      const path = `comprovantes/${quitarEmpId}/${Date.now()}.${ext}`;
                      const { error: upErr } = await supabase.storage
                        .from('whatsapp-media')
                        .upload(path, file, { contentType: file.type });
                      if (upErr) throw new Error(`Upload falhou: ${upErr.message}`);

                      const { data: urlData } = supabase.storage.from('whatsapp-media').getPublicUrl(path);
                      const comprovanteUrl = urlData.publicUrl;

                      const hoje = new Date().toISOString().split('T')[0];
                      const { data: parcelasPendentes } = await (supabase
                        .from('parcelas') as any)
                        .select('id')
                        .eq('emprestimo_id', quitarEmpId)
                        .in('status', ['pendente', 'vencida']);

                      const ocrStatus = ocr
                        ? (ocrAvaliacao?.aprovado ? 'auto_aprovado' : confirmDivergencia ? 'divergencia' : 'manual')
                        : 'sem_ocr';

                      for (const p of parcelasPendentes ?? []) {
                        const updateData: ParcelaUpdate & Record<string, unknown> = {
                          status: 'paga',
                          data_pagamento: hoje,
                          pagamento_tipo: 'manual',
                          comprovante_url: comprovanteUrl,
                          confirmado_por: user?.id,
                          confirmado_em: new Date().toISOString(),
                          comprovante_valor_ocr: ocr?.valor ?? null,
                          comprovante_data_ocr: ocr?.data ?? null,
                          comprovante_chave_ocr: ocr?.chavePix ?? null,
                          comprovante_ocr_score: ocr?.confidenceMedia ?? null,
                          comprovante_ocr_status: ocrStatus,
                        };
                        await (supabase.from('parcelas') as any).update(updateData).eq('id', p.id);
                      }

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
                />
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
