/**
 * @module MainLayout
 * @description Layout principal com sidebar de navegação e header.
 *
 * Renderiza sidebar colapsável com 8 seções de navegação
 * (Dashboard, Clientes, Rede, Comunicação, Kanban, Relatórios,
 * Configurações, Equipe), header com busca global e avatar do
 * usuário, e área de conteúdo via `<Outlet />`.
 *
 * Controle de acesso (RBAC) via função `canAccess()` que filtra
 * itens de menu com base no papel do usuário logado.
 *
 * @see AuthContext para dados do usuário logado
 */
import { Link, useLocation, Outlet, useNavigate } from 'react-router';
import {
  LayoutDashboard,
  Users,
  Network,
  MessageSquare,
  FileText,
  Settings,
  LogOut,
  Bell,
  Volume2,
  VolumeX,
  Search,
  ChevronDown,
  Menu,
  X,
  Sun,
  Moon,
  TrendingUp,
  Receipt,
  BarChart3,
  UserSearch,
  CreditCard,
  Wallet,
  ClipboardList,
  History,
  Share2,
  Gift,
  ShieldBan,
  UserPlus,
  Bot,
  Workflow,
  FileCode,
  Shield,
  Columns3,
  Scale,
  Headset,
  Eye,
  FileBarChart,
  FileSpreadsheet,
  Download,
  KeyRound,
  UserCog,
  Plug,
  UserCircle,
  Monitor,
  Gauge,
  QrCode,
  AlertTriangle,
  Percent,
  Settings2,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useActivityTracker } from '../hooks/useActivityTracker';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { useState, useEffect, useRef } from 'react';
import { AnimatedBackground } from './AnimatedBackground';
import { FloatingChat } from './FloatingChat';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import alarmeSound from '../assets/sounds/alarme.mp3';

export function MainLayout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [silencioso, setSilencioso] = useState(() => localStorage.getItem('fd-silencioso') === 'true');
  const silenciosoRef = useRef(silencioso);

  // Rastreia atividade do usuário logado (online/offline, sessão, heartbeat)
  useActivityTracker(user?.id);

  // Manter ref sincronizada com estado silencioso
  useEffect(() => {
    silenciosoRef.current = silencioso;
    localStorage.setItem('fd-silencioso', String(silencioso));
  }, [silencioso]);

  // ── Realtime: alerta análise com pendências (admin/gerencia) ──
  const alarmeRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    if (!user || (user.role !== 'admin' && user.role !== 'gerencia')) return;

    const channel = supabase
      .channel('analise-pendencia-alert')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'analises_credito' },
        async (payload) => {
          const analise = payload.new as { id: string; cliente_nome: string; cpf: string; valor_solicitado: number; cliente_id: string | null };
          const valor = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(analise.valor_solicitado);

          // Verificar pendências
          let pendencias = 0;
          try {
            let result;
            if (analise.cliente_id) {
              const { data } = await supabase.rpc('verificar_pendencias_cliente_id', { p_cliente_id: analise.cliente_id });
              result = data;
            } else if (analise.cpf) {
              const { data } = await supabase.rpc('verificar_pendencias_cliente', { p_cpf: analise.cpf });
              result = data;
            }
            if (result?.tem_pendencia) pendencias = result.total_emprestimos_pendentes;
          } catch { /* RPC indisponível — continua sem info de pendências */ }

          // Tocar alarme (respeita modo silencioso)
          if (!silenciosoRef.current) {
            try {
              if (!alarmeRef.current) alarmeRef.current = new Audio(alarmeSound);
              alarmeRef.current.currentTime = 0;
              alarmeRef.current.play();
            } catch { /* autoplay blocked */ }
          }

          // Toast
          if (pendencias > 0) {
            toast.warning(
              `⚠️ Nova análise: ${analise.cliente_nome} (${valor}) — cliente possui ${pendencias} empréstimo(s) ativo(s)!`,
              { duration: 15000, id: `analise-${analise.id}` }
            );
          } else {
            toast.info(
              `Nova análise de crédito criada: ${analise.cliente_nome} (${valor})`,
              { duration: 8000, id: `analise-${analise.id}` }
            );
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const navigation = [
    {
      title: 'DASHBOARD',
      items: [
        { name: 'Visão Geral', href: '/dashboard', icon: LayoutDashboard, roles: ['admin', 'gerencia'] },
        { name: 'Financeiro', href: '/dashboard/financeiro', icon: TrendingUp, roles: ['admin', 'gerencia'] },
        { name: 'Cobrança', href: '/dashboard/cobranca', icon: Receipt, roles: ['admin', 'cobranca'] },
        { name: 'Comercial', href: '/dashboard/comercial', icon: BarChart3, roles: ['admin', 'comercial'] },
      ],
    },
    {
      title: 'CLIENTES',
      items: [
        { name: 'Lista de Clientes', href: '/clientes', icon: UserSearch, roles: ['admin', 'gerencia', 'comercial'] },
        { name: 'Análise de Crédito', href: '/clientes/analise', icon: CreditCard, roles: ['admin', 'gerencia'] },
        { name: 'Empréstimos Ativos', href: '/clientes/emprestimos', icon: Wallet, roles: ['admin', 'gerencia'] },
        { name: 'Gestão de Parcelas', href: '/clientes/parcelas', icon: ClipboardList, roles: ['admin', 'gerencia'] },
        { name: 'Histórico', href: '/clientes/historico', icon: History, roles: ['admin', 'gerencia'] },
      ],
    },
    {
      title: 'PAGAMENTOS',
      items: [
        { name: 'Pagamentos Pix', href: '/pagamentos', icon: QrCode, roles: ['admin', 'gerencia'] },
        { name: 'Pagamentos Órfãos', href: '/pagamentos/orfaos', icon: AlertTriangle, roles: ['admin', 'gerencia', 'cobranca'] },
      ],
    },
    {
      title: 'REDE DE INDICAÇÕES',
      items: [
        { name: 'Mapa da Rede', href: '/rede', icon: Share2, roles: ['admin', 'gerencia'] },
        { name: 'Bônus e Comissões', href: '/rede/bonus', icon: Gift, roles: ['admin', 'gerencia'] },
        { name: 'Grupos Bloqueados', href: '/rede/bloqueados', icon: ShieldBan, roles: ['admin', 'gerencia'] },
        { name: 'Indicar Novo', href: '/rede/indicar', icon: UserPlus, roles: ['admin', 'comercial'] },
      ],
    },
    {
      title: 'COMUNICAÇÃO',
      items: [
        { name: 'WhatsApp', href: '/whatsapp', icon: MessageSquare, roles: ['admin', 'gerencia', 'cobranca'] },
        { name: 'Fluxos de Chat', href: '/chat/fluxos', icon: Workflow, roles: ['admin', 'gerencia'] },
        { name: 'Templates', href: '/chat/templates', icon: FileCode, roles: ['admin', 'gerencia'] },
      ],
    },
    {
      title: 'KANBAN',
      items: [
        { name: 'Cobrança', href: '/kanban/cobranca', icon: Columns3, roles: ['admin', 'gerencia', 'cobranca'] },
        { name: 'Análise de Crédito', href: '/kanban/analise', icon: Scale, roles: ['admin', 'gerencia'] },
        { name: 'Atendimento', href: '/kanban/atendimento', icon: Headset, roles: ['admin', 'gerencia', 'comercial'] },
        { name: 'Visão Gerencial', href: '/kanban/gerencial', icon: Eye, roles: ['admin', 'gerencia'] },
      ],
    },
    {
      title: 'RELATÓRIOS',
      items: [
        { name: 'Gerenciais', href: '/relatorios/gerenciais', icon: FileBarChart, roles: ['admin', 'gerencia'] },
        { name: 'Operacionais', href: '/relatorios/operacionais', icon: FileSpreadsheet, roles: ['admin', 'gerencia'] },
        { name: 'Comissões', href: '/relatorios/comissoes', icon: Percent, roles: ['admin', 'gerencia'] },
        { name: 'Exportar Dados', href: '/relatorios/exportar', icon: Download, roles: ['admin', 'gerencia'] },
      ],
    },
    {
      title: 'CONFIGURAÇÕES',
      items: [
        { name: 'Perfis de Acesso', href: '/configuracoes/perfis', icon: KeyRound, roles: ['admin'] },
        { name: 'Gerenciar Usuários', href: '/configuracoes/usuarios', icon: UserCog, roles: ['admin'] },
        { name: 'Integrações', href: '/configuracoes/integracoes', icon: Plug, roles: ['admin'] },
        { name: 'Comissões', href: '/configuracoes/comissoes', icon: Percent, roles: ['admin'] },
        { name: 'IP Whitelist', href: '/configuracoes/ip-whitelist', icon: Shield, roles: ['admin'] },
        { name: 'Sistema', href: '/configuracoes/sistema', icon: Settings2, roles: ['admin', 'gerencia'] },
        { name: 'Minha Conta', href: '/configuracoes/conta', icon: UserCircle, roles: ['admin', 'gerencia', 'cobranca', 'comercial'] },
      ],
    },
    {
      title: 'EQUIPE',
      items: [
        { name: 'Monitoramento', href: '/equipe/monitoramento', icon: Monitor, roles: ['admin', 'gerencia'] },
        { name: 'Produtividade', href: '/equipe/produtividade', icon: Gauge, roles: ['admin', 'gerencia'] },
      ],
    },
    {
      title: 'AJUDA',
      items: [
        { name: 'Documentação', href: '/ajuda/docs', icon: FileText, roles: ['admin', 'gerencia', 'cobranca', 'comercial'] },
      ],
    },
  ];

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return location.pathname === href;
    }
    return location.pathname.startsWith(href);
  };

  const canAccess = (roles: string[]) => {
    return user && roles.includes(user.role);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen overflow-hidden transition-colors duration-300">
      <AnimatedBackground />
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'w-64' : 'w-0'
        } transition-all duration-300 glass-sidebar text-sidebar-foreground flex flex-col overflow-hidden relative z-10`}
      >
        {/* Logo */}
        <div className="p-5 border-b border-sidebar-border/50 flex items-center justify-between">
          <div className="flex text-3xl items-center">
            <span className="animated-logo ml-2 flex flex-col leading-tight"><span className="font-bold">FINTECH</span></span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5 sidebar-scrollbar">
          {navigation.map((section) => {
            const visibleItems = section.items.filter((item) => canAccess(item.roles));
            if (visibleItems.length === 0) return null;

            return (
              <div key={section.title}>
                <h3 className="text-[10px] font-semibold text-sidebar-primary/80 uppercase tracking-widest mb-2 px-3">
                  {section.title}
                </h3>
                <ul className="space-y-0.5">
                  {visibleItems.map((item) => (
                    <li key={item.name}>
                      <Link
                        to={item.href}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-200 ${
                          isActive(item.href)
                            ? 'liquid-metal-btn-active text-sidebar-primary-foreground'
                            : 'liquid-metal-btn text-sidebar-foreground/60 hover:text-sidebar-foreground'
                        }`}
                      >
                        <item.icon className="w-4 h-4 shrink-0" strokeWidth={isActive(item.href) ? 2.2 : 1.8} />
                        <span>{item.name}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="p-3 border-t border-sidebar-border/50">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium text-sidebar-foreground/50 hover:text-red-400 w-full transition-all duration-200 liquid-metal-logout"
          >
            <LogOut className="w-4 h-4" strokeWidth={1.8} />
            <span>Sair</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden relative z-10">
        {/* Header */}
        <header className="glass-header p-4 flex items-center justify-between transition-colors duration-300">
          <div className="flex items-center gap-4 flex-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>

            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Busca global..."
                className="pl-10"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </Button>

            <Button variant="ghost" size="icon" className="relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSilencioso(!silencioso)}
              title={silencioso ? 'Ativar sons de notificação' : 'Modo silencioso'}
            >
              {silencioso ? <VolumeX className="w-5 h-5 text-muted-foreground" /> : <Volume2 className="w-5 h-5" />}
            </Button>

            <div className="flex items-center gap-2 cursor-pointer hover:bg-muted px-3 py-2 rounded-md transition-colors">
              <div className="w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center font-semibold">
                {user?.name.charAt(0)}
              </div>
              <div className="text-sm">
                <div className="font-medium">{user?.name}</div>
                <div className="text-xs text-muted-foreground capitalize">{user?.role}</div>
              </div>
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>

      {/* Chat Interno Flutuante */}
      <FloatingChat />
    </div>
  );
}