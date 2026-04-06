/**
 * @module DocsPage
 * @description Página de documentação / tutorial extraída do README.md.
 * Organizada como FAQ interativo com busca, categorias e liquid metal styling.
 * Servirá de base para FAQ dinâmico dentro da plataforma.
 * @route /docs
 * @access Público (mesma proteção IP da DownloadPage via Vercel middleware)
 */
import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useLocation } from 'react-router';
import {
  Search,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  BookOpen,
  Layers,
  CreditCard,
  Users,
  MessageCircle,
  Smartphone,
  ShieldCheck,
  BarChart3,
  Workflow,
  Network,
  Banknote,
  Bot,
  FileText,
} from 'lucide-react';

import docIcon from '../assets/doc.svg';

// ── Tipos ─────────────────────────────────────────
interface FaqItem {
  q: string;
  a: string;
}

interface DocSection {
  id: string;
  icon: typeof BookOpen;
  title: string;
  description: string;
  items: FaqItem[];
}

// ── Conteúdo extraído do README.md ────────────────
const DOCS: DocSection[] = [
  {
    id: 'arquitetura',
    icon: Layers,
    title: 'Arquitetura Geral',
    description: 'Visão geral do sistema, stack tecnológica e fluxo de dados.',
    items: [
      {
        q: 'Quais tecnologias o Fintech Digital usa?',
        a: 'React 18 com TypeScript 5, Vite 6, Tailwind CSS v4 para UI, Supabase (PostgreSQL 15) para banco de dados, autenticação e Realtime, e TanStack React Query para gerenciamento de estado do servidor.',
      },
      {
        q: 'Como funciona o fluxo de dados?',
        a: 'Página → Hook (useQuery/useMutation) → Service → supabase.from() → Adapter converte snake_case para camelCase → Componente renderiza os dados. Toda comunicação com o banco passa por políticas RLS (Row Level Security).',
      },
      {
        q: 'Quantas páginas e rotas existem?',
        a: '36 páginas distribuídas em 39 rotas. Inclui dashboards, Kanban, gestão de clientes, chat interno, editor de fluxos, pagamentos Pix e muito mais.',
      },
      {
        q: 'O que é RLS (Row Level Security)?',
        a: 'RLS é um sistema de segurança do PostgreSQL que garante que cada usuário só acesse dados permitidos para seu papel (admin, gerência, cobrança, comercial, cliente). As políticas são aplicadas automaticamente em toda consulta.',
      },
    ],
  },
  {
    id: 'navegacao',
    icon: BookOpen,
    title: 'Navegação e Perfis',
    description: 'Menu lateral, seções da sidebar e controle de acesso por papel.',
    items: [
      {
        q: 'Quais são os papéis de usuário?',
        a: 'Admin (acesso total), Gerência (dashboards + relatórios + equipe), Cobrança (kanban cobrança + parcelas + clientes), Comercial (kanban atendimento + clientes + indicações) e Cliente (área restrita do cliente).',
      },
      {
        q: 'Como funciona o menu lateral?',
        a: 'O menu é dividido em seções: Dashboard, Clientes, Rede de Indicações, Comunicação, Kanban, Relatórios, Configurações e Equipe. Cada seção mostra apenas os itens permitidos para o papel do usuário logado.',
      },
      {
        q: 'O que é a Área do Cliente?',
        a: 'É uma página especial (/cliente) acessível apenas por usuários com papel "cliente". Mostra dados pessoais, empréstimos ativos, parcelas a vencer e status do score. Não possui sidebar.',
      },
    ],
  },
  {
    id: 'emprestimos',
    icon: CreditCard,
    title: 'Empréstimos e Parcelas',
    description: 'Gestão completa de empréstimos, parcelas e pagamento.',
    items: [
      {
        q: 'Como criar um empréstimo?',
        a: 'Acesse Clientes → selecione um cliente → clique em "Novo Empréstimo". Preencha valor, número de parcelas, taxa de juros (mensal, semanal ou diário) e data do contrato. O sistema calcula automaticamente o valor de cada parcela.',
      },
      {
        q: 'Como registrar um pagamento de parcela?',
        a: 'No painel do empréstimo (aba Parcelas), clique em "Pagar" na parcela desejada. Informe a data do pagamento. Se houver atraso, juros e multa são calculados automaticamente (~0.033%/dia + 2% multa após 1 dia).',
      },
      {
        q: 'O que acontece quando todas as parcelas são pagas?',
        a: 'O empréstimo muda para status "quitado" automaticamente. Se o cliente não tiver outros empréstimos em atraso, seu status volta para "em_dia" e o score é atualizado.',
      },
      {
        q: 'Posso quitar um empréstimo antecipadamente?',
        a: 'Sim. No painel do empréstimo, use o botão "Quitar todas". O sistema calcula o valor total restante com os juros devidos até a data atual.',
      },
      {
        q: 'Quais tipos de juros são suportados?',
        a: 'Mensal, semanal e diário. A taxa é armazenada no período original sem conversão. Exemplo: 10% mensal, 2.5% semanal ou 0.33% diário.',
      },
    ],
  },
  {
    id: 'clientes',
    icon: Users,
    title: 'Gestão de Clientes',
    description: 'Cadastro, score interno, status e histórico de clientes.',
    items: [
      {
        q: 'Como funciona o Score Interno?',
        a: 'Cada cliente tem um score de 0 a 1000 (inicia em 500). Pagamentos em dia aumentam o score, atrasos diminuem. O score influencia o limite de crédito e a aprovação de novos empréstimos.',
      },
      {
        q: 'Quais são os status possíveis de um cliente?',
        a: '"em_dia" (pagamentos OK), "atrasado" (parcela vencida), "inadimplente" (atraso grave), "negativado" (restrição ativa) e "quitado" (sem pendências). O status é atualizado automaticamente com base nas parcelas.',
      },
      {
        q: 'Como funciona o limite de crédito?',
        a: 'Cada cliente tem um limite_credito e credito_utilizado. Novos empréstimos verificam se há saldo disponível. O limite pode ser ajustado manualmente por admin/gerência.',
      },
    ],
  },
  {
    id: 'rede',
    icon: Network,
    title: 'Rede de Indicações',
    description: 'Sistema de indicação com bônus, bloqueios solidários e visualização.',
    items: [
      {
        q: 'Como funciona a rede de indicações?',
        a: 'Cada cliente pode indicar outros através do campo "indicado_por". Isso cria uma rede hierárquica (árvore) rastreável. Indicadores acumulam bônus quando seus indicados pagam parcelas em dia.',
      },
      {
        q: 'O que é bloqueio solidário?',
        a: 'Quando um membro da rede se torna inadimplente ou é identificado como fraudulento, toda a rede pode ser bloqueada solidariamente. Tipos: inadimplência, fraude, manual ou auto_bloqueio.',
      },
      {
        q: 'Como visualizar a rede?',
        a: 'Acesse Rede → Indicações. Um canvas interativo (ReactFlow) mostra a hierarquia completa com filtros por status, busca por nome e indicadores visuais de risco.',
      },
      {
        q: 'Como indicar um novo cliente?',
        a: 'Acesse Rede → Indicar Novo. Um wizard de 3 etapas guia o cadastro: dados pessoais, vínculo com o indicador e confirmação. O indicador é automaticamente vinculado.',
      },
    ],
  },
  {
    id: 'chat',
    icon: MessageCircle,
    title: 'Chat Interno',
    description: 'Comunicação entre a equipe com mensagens de texto, áudio e deep links.',
    items: [
      {
        q: 'O que é o Chat Interno?',
        a: 'Um widget flutuante disponível em todas as páginas que permite comunicação em tempo real entre a equipe. Suporta texto, áudio gravado e cartões de atenção vinculados a clientes ou empréstimos.',
      },
      {
        q: 'O que são mensagens de "Atenção"?',
        a: 'Cartões especiais enviados pelo chat que linkam diretamente a um cliente ou empréstimo. Ao clicar, o usuário é redirecionado para a ficha do cliente/empréstimo correspondente via deep link.',
      },
      {
        q: 'Como gravar áudio?',
        a: 'Segure o botão de microfone no chat. A gravação usa MediaRecorder do navegador. No Safari, há tratamento especial para compatibilidade com WebKit. O áudio é salvo no Supabase Storage.',
      },
    ],
  },
  {
    id: 'whatsapp',
    icon: Smartphone,
    title: 'WhatsApp (Evolution API)',
    description: 'Instâncias, templates, envio de mensagens e webhook.',
    items: [
      {
        q: 'Como conectar o WhatsApp?',
        a: 'Acesse Configurações → Integrações → WhatsApp. Crie uma nova instância, escaneie o QR Code com o WhatsApp do número desejado. Quando o status mudar para "open", a instância está conectada.',
      },
      {
        q: 'Como enviar mensagens automáticas?',
        a: 'Configure templates em Comunicação → Templates. Use variáveis como {nome}, {valor}, {vencimento}, {link_pix}. As mensagens podem ser enviadas manualmente ou programadas via fluxos do chatbot.',
      },
      {
        q: 'O que é o Bot Auto-Reply?',
        a: 'Quando um cliente envia palavras-chave como "score", "meu score", "status" ou "meu status", o sistema responde automaticamente com o score ou status atual do cliente, buscando pelo telefone remetente.',
      },
      {
        q: 'Como funciona o webhook?',
        a: 'Messages recebidas via WhatsApp são processadas pela Edge Function webhook-whatsapp. Ela identifica o cliente pelo telefone, executa bots/fluxos configurados e cria tickets automáticos quando necessário.',
      },
    ],
  },
  {
    id: 'fluxos',
    icon: Workflow,
    title: 'Editor de Fluxos (Chatbot)',
    description: 'Editor visual drag-and-drop para fluxos automatizados do chatbot.',
    items: [
      {
        q: 'O que são fluxos?',
        a: 'Sequências automatizadas de ações que o chatbot executa quando recebe mensagens. Cada fluxo tem nós (trigger, mensagem, condição, ação, espera, finalizar) conectados visualmente.',
      },
      {
        q: 'Quais tipos de nó existem?',
        a: 'Trigger (gatilho por palavra-chave), Mensagem (envia texto/template), Condição (if/else baseado em score, status, etc.), Ação (atualizar dados, criar ticket), Espera (delay em minutos/horas) e Finalizar (encerra o fluxo).',
      },
      {
        q: 'Como criar um fluxo?',
        a: 'Acesse Comunicação → Fluxos → Novo Fluxo. O editor fullscreen abre com um canvas ReactFlow. Arraste nós, conecte-os e configure cada um. Salve e ative. O fluxo é armazenado em JSONB no banco.',
      },
    ],
  },
  {
    id: 'credito',
    icon: ShieldCheck,
    title: 'Verificação de Identidade',
    description: 'Fluxo completo de verificação para aprovação de crédito.',
    items: [
      {
        q: 'Como funciona a verificação de identidade?',
        a: 'O analista envia um magic link por e-mail (válido 48h). O cliente acessa o link e completa um wizard: grava um vídeo-selfie de 5-30 segundos e envia 2 fotos de documentos (frente e verso).',
      },
      {
        q: 'Quantas tentativas o cliente tem?',
        a: 'Máximo 3 tentativas por verificação. Após 3 falhas, o processo é bloqueado e precisa ser reiniciado pelo analista.',
      },
      {
        q: 'Como o analista aprova?',
        a: 'No Kanban Análise, o analista abre a "Análise Detalhada" com 3 abas: Dados (informações pessoais), Verificação (vídeo + documentos) e Histórico (logs). Ao aprovar, o sistema cria automaticamente o empréstimo e gera a cobrança Pix via Woovi.',
      },
    ],
  },
  {
    id: 'pagamentos',
    icon: Banknote,
    title: 'Pagamentos Pix (Woovi/OpenPix)',
    description: 'Cobranças, transações, QR Code e subcontas.',
    items: [
      {
        q: 'Como funciona a integração com Pix?',
        a: 'O sistema usa a API da Woovi (OpenPix) para criar cobranças Pix com QR Code. Quando o pagamento é confirmado via webhook, a parcela correspondente é automaticamente marcada como paga.',
      },
      {
        q: 'O que são subcontas Woovi?',
        a: 'Cada operação ou filial pode ter sua própria subconta com chave Pix dedicada. Valores recebidos podem ser distribuídos entre subcontas automaticamente. Saques são feitos via API.',
      },
      {
        q: 'Como gerar um Pix para negociação?',
        a: 'No Kanban Cobrança, abra a negociação do cliente. Informe o "Valor Acordado" e clique em "Gerar Pix (24h)". Um QR Code e link de pagamento são gerados com validade de 24 horas.',
      },
    ],
  },
  {
    id: 'kanban',
    icon: BarChart3,
    title: 'Kanban e Produtividade',
    description: 'Painéis visuais de trabalho por etapa e métricas da equipe.',
    items: [
      {
        q: 'Quais Kanbans existem?',
        a: 'Kanban Cobrança (etapas: contato_inicial → negociacao → acordo → pagamento → finalizado), Kanban Análise (fluxo de crédito), Kanban Atendimento (tickets comerciais) e Kanban Gerencial (visão consolidada).',
      },
      {
        q: 'Como funciona o auto-ticket?',
        a: 'Quando um cliente envia mensagem via WhatsApp e não há ticket aberto, o webhook cria automaticamente um ticket no Kanban Atendimento com os dados da conversa. A equipe comercial é notificada.',
      },
      {
        q: 'Como ver a produtividade da equipe?',
        a: 'Acesse Equipe → Produtividade. O dashboard mostra KPIs por funcionário, ranking com gradientes visuais, atividades reais do Kanban por papel e gráficos comparativos.',
      },
    ],
  },
];

// ── Variantes de animação ─────────────────────────
const fadeIn = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3 },
};

export default function DocsPage() {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());

  const toggleItem = (key: string) => {
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Filtrar docs pela busca
  const filteredDocs = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return DOCS;
    return DOCS.map((section) => ({
      ...section,
      items: section.items.filter(
        (item) =>
          item.q.toLowerCase().includes(term) ||
          item.a.toLowerCase().includes(term)
      ),
    })).filter((section) => section.items.length > 0);
  }, [search]);

  const visibleDocs = activeCategory
    ? filteredDocs.filter((s) => s.id === activeCategory)
    : filteredDocs;

  const totalResults = visibleDocs.reduce((sum, s) => sum + s.items.length, 0);

  const location = useLocation();
  const isEmbedded = location.pathname.startsWith('/ajuda');

  if (isEmbedded) {
    return (
      <div className="flex flex-col min-h-[calc(100vh-5rem)]">
        {/* Inline header with search */}
        <div className="flex items-center gap-4 mb-6">
          <div className="flex items-center gap-3 flex-1">
            <div className="w-10 h-10 rounded-xl liquid-metal-btn-active !border-0 flex items-center justify-center">
              <img src={docIcon} alt="Docs" className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Documentação</h1>
              <p className="text-xs text-muted-foreground">Tutorial & FAQ — Fintech Digital</p>
            </div>
          </div>

          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar na documentação..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-muted/50 border border-border text-sm placeholder-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all"
            />
          </div>
        </div>

        <div className="flex gap-8 flex-1">
          {/* Sidebar Categories */}
          <aside className="hidden lg:block w-56 flex-shrink-0 sticky top-24 self-start space-y-1 max-h-[calc(100vh-8rem)] overflow-y-auto">
            <button
              onClick={() => setActiveCategory(null)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                !activeCategory
                  ? 'liquid-metal-btn-active !border-0'
                  : 'liquid-metal-btn !border-0 text-muted-foreground hover:text-foreground'
              }`}
            >
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Todas ({totalResults})
              </div>
            </button>

            {DOCS.map((section) => {
              const count = filteredDocs.find((s) => s.id === section.id)?.items.length ?? 0;
              if (search && count === 0) return null;
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveCategory(activeCategory === section.id ? null : section.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    activeCategory === section.id
                      ? 'liquid-metal-btn-active !border-0'
                      : 'liquid-metal-btn !border-0 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <section.icon className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate flex-1">{section.title}</span>
                    <span className="text-xs text-muted-foreground">{count}</span>
                  </div>
                </button>
              );
            })}
          </aside>

          {/* Content */}
          <main className="flex-1 min-w-0 space-y-8">
            {search && (
              <p className="text-sm text-muted-foreground">
                {totalResults} resultado{totalResults !== 1 ? 's' : ''} para "<span className="text-primary">{search}</span>"
              </p>
            )}

            {visibleDocs.length === 0 && (
              <div className="text-center py-20">
                <Search className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                <p className="text-muted-foreground">Nenhum resultado encontrado</p>
                <p className="text-sm text-muted-foreground/60 mt-1">Tente buscar com outros termos</p>
              </div>
            )}

            {visibleDocs.map((section) => (
              <motion.div key={section.id} {...fadeIn}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl liquid-metal-btn !border-0 flex items-center justify-center">
                    <section.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">{section.title}</h2>
                    <p className="text-xs text-muted-foreground">{section.description}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  {section.items.map((item, idx) => {
                    const key = `${section.id}-${idx}`;
                    const isOpen = openItems.has(key);
                    return (
                      <div key={key} className="rounded-xl liquid-metal-btn !border-0 overflow-hidden">
                        <button
                          onClick={() => toggleItem(key)}
                          className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-muted/30 transition-colors"
                        >
                          <motion.div
                            animate={{ rotate: isOpen ? 90 : 0 }}
                            transition={{ duration: 0.2 }}
                          >
                            <ChevronRight className="w-4 h-4 text-primary flex-shrink-0" />
                          </motion.div>
                          <span className="text-sm font-medium flex-1">
                            {item.q}
                          </span>
                          {isOpen && (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          )}
                        </button>

                        <AnimatePresence>
                          {isOpen && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.25 }}
                            >
                              <div className="px-5 pb-4 pl-12">
                                <p className="text-sm text-muted-foreground leading-relaxed">
                                  {item.a}
                                </p>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            ))}
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-[#0a0a1a] via-[#0f0f1f] to-[#0a0a1a] text-white">
      {/* ── Header ─────────────────────────────── */}
      <div className="sticky top-0 z-30 backdrop-blur-xl bg-[#0a0a1a]/80 border-b border-white/[0.06]">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link
            to="/download"
            className="liquid-metal-btn !border-0 p-2 rounded-xl transition-all hover:scale-105"
          >
            <ArrowLeft className="w-5 h-5 text-slate-400" />
          </Link>

          <div className="flex items-center gap-3 flex-1">
            <div className="w-10 h-10 rounded-xl liquid-metal-btn-active !border-0 flex items-center justify-center">
              <img src={docIcon} alt="Docs" className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Documentação</h1>
              <p className="text-xs text-slate-500">Tutorial & FAQ — Fintech Digital</p>
            </div>
          </div>

          {/* Search */}
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar na documentação..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] backdrop-blur-md text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition-all"
            />
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 flex gap-8 flex-1">
        {/* ── Sidebar Categories ───────────────── */}
        <aside className="hidden lg:block w-56 flex-shrink-0 sticky top-24 self-start space-y-1 max-h-[calc(100vh-8rem)] overflow-y-auto">
          <button
            onClick={() => setActiveCategory(null)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              !activeCategory
                ? 'liquid-metal-btn-active !border-0 text-white'
                : 'liquid-metal-btn !border-0 text-slate-400 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Todas ({totalResults})
            </div>
          </button>

          {DOCS.map((section) => {
            const count = filteredDocs.find((s) => s.id === section.id)?.items.length ?? 0;
            if (search && count === 0) return null;
            return (
              <button
                key={section.id}
                onClick={() => setActiveCategory(activeCategory === section.id ? null : section.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeCategory === section.id
                    ? 'liquid-metal-btn-active !border-0 text-white'
                    : 'liquid-metal-btn !border-0 text-slate-400 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <section.icon className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate flex-1">{section.title}</span>
                  <span className="text-xs text-slate-600">{count}</span>
                </div>
              </button>
            );
          })}
        </aside>

        {/* ── Content ──────────────────────────── */}
        <main className="flex-1 min-w-0 space-y-8">
          {search && (
            <p className="text-sm text-slate-500">
              {totalResults} resultado{totalResults !== 1 ? 's' : ''} para "<span className="text-indigo-400">{search}</span>"
            </p>
          )}

          {visibleDocs.length === 0 && (
            <div className="text-center py-20">
              <Search className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400">Nenhum resultado encontrado</p>
              <p className="text-sm text-slate-600 mt-1">Tente buscar com outros termos</p>
            </div>
          )}

          {visibleDocs.map((section) => (
            <motion.div key={section.id} {...fadeIn}>
              {/* Section header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl liquid-metal-btn !border-0 flex items-center justify-center">
                  <section.icon className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">{section.title}</h2>
                  <p className="text-xs text-slate-500">{section.description}</p>
                </div>
              </div>

              {/* FAQ accordion */}
              <div className="space-y-2">
                {section.items.map((item, idx) => {
                  const key = `${section.id}-${idx}`;
                  const isOpen = openItems.has(key);
                  return (
                    <div key={key} className="rounded-xl liquid-metal-btn !border-0 overflow-hidden">
                      <button
                        onClick={() => toggleItem(key)}
                        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-white/[0.03] transition-colors"
                      >
                        <motion.div
                          animate={{ rotate: isOpen ? 90 : 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <ChevronRight className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                        </motion.div>
                        <span className="text-sm font-medium text-white flex-1">
                          {item.q}
                        </span>
                        {isOpen && (
                          <ChevronDown className="w-4 h-4 text-slate-500" />
                        )}
                      </button>

                      <AnimatePresence>
                        {isOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25 }}
                          >
                            <div className="px-5 pb-4 pl-12">
                              <p className="text-sm text-slate-400 leading-relaxed">
                                {item.a}
                              </p>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          ))}
        </main>
      </div>

      {/* ── Footer ─────────────────────────────── */}
      <div className="border-t border-white/[0.04] bg-white/[0.01]">
        <div className="max-w-5xl mx-auto px-6 py-8 text-center space-y-2">
          <p className="text-xs text-slate-600">
            Documentação gerada a partir do README.md do projeto — v0.0.1
          </p>
          <p className="text-xs text-slate-600">
            © {new Date().getFullYear()} Fintech Digital
          </p>
        </div>
      </div>
    </div>
  );
}
