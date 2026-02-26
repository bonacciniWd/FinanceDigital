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
  Kanban,
  FileText,
  Settings,
  LogOut,
  Bell,
  Search,
  ChevronDown,
  Menu,
  X,
  Activity,
  Sun,
  Moon,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { useState } from 'react';
import logo from '../assets/logo.png';

export function MainLayout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const navigation = [
    {
      title: 'DASHBOARD',
      items: [
        { name: 'Visão Geral', href: '/dashboard', icon: LayoutDashboard, roles: ['admin', 'gerencia'] },
        { name: 'Financeiro', href: '/dashboard/financeiro', icon: LayoutDashboard, roles: ['admin', 'gerencia'] },
        { name: 'Cobrança', href: '/dashboard/cobranca', icon: LayoutDashboard, roles: ['admin', 'cobranca'] },
        { name: 'Comercial', href: '/dashboard/comercial', icon: LayoutDashboard, roles: ['admin', 'comercial'] },
      ],
    },
    {
      title: 'CLIENTES',
      items: [
        { name: 'Lista de Clientes', href: '/clientes', icon: Users, roles: ['admin', 'gerencia', 'comercial'] },
        { name: 'Análise de Crédito', href: '/clientes/analise', icon: Users, roles: ['admin', 'gerencia'] },
        { name: 'Empréstimos Ativos', href: '/clientes/emprestimos', icon: Users, roles: ['admin', 'gerencia'] },
        { name: 'Gestão de Parcelas', href: '/clientes/parcelas', icon: Users, roles: ['admin', 'gerencia'] },
        { name: 'Histórico', href: '/clientes/historico', icon: Users, roles: ['admin', 'gerencia'] },
      ],
    },
    {
      title: 'REDE DE INDICAÇÕES',
      items: [
        { name: 'Mapa da Rede', href: '/rede', icon: Network, roles: ['admin', 'gerencia'] },
        { name: 'Bônus e Comissões', href: '/rede/bonus', icon: Network, roles: ['admin', 'gerencia'] },
        { name: 'Grupos Bloqueados', href: '/rede/bloqueados', icon: Network, roles: ['admin', 'gerencia'] },
        { name: 'Indicar Novo', href: '/rede/indicar', icon: Network, roles: ['admin', 'comercial'] },
      ],
    },
    {
      title: 'COMUNICAÇÃO',
      items: [
        { name: 'Chat Geral', href: '/chat', icon: MessageSquare, roles: ['admin', 'gerencia', 'cobranca', 'comercial'] },
        { name: 'WhatsApp', href: '/whatsapp', icon: MessageSquare, roles: ['admin', 'gerencia', 'cobranca'] },
        { name: 'Fluxos de Chat', href: '/chat/fluxos', icon: MessageSquare, roles: ['admin', 'gerencia'] },
        { name: 'Templates', href: '/chat/templates', icon: MessageSquare, roles: ['admin', 'gerencia'] },
      ],
    },
    {
      title: 'KANBAN',
      items: [
        { name: 'Cobrança', href: '/kanban/cobranca', icon: Kanban, roles: ['admin', 'gerencia', 'cobranca'] },
        { name: 'Análise de Crédito', href: '/kanban/analise', icon: Kanban, roles: ['admin', 'gerencia'] },
        { name: 'Atendimento', href: '/kanban/atendimento', icon: Kanban, roles: ['admin', 'gerencia', 'comercial'] },
        { name: 'Visão Gerencial', href: '/kanban/gerencial', icon: Kanban, roles: ['admin', 'gerencia'] },
      ],
    },
    {
      title: 'RELATÓRIOS',
      items: [
        { name: 'Gerenciais', href: '/relatorios/gerenciais', icon: FileText, roles: ['admin', 'gerencia'] },
        { name: 'Operacionais', href: '/relatorios/operacionais', icon: FileText, roles: ['admin', 'gerencia'] },
        { name: 'Exportar Dados', href: '/relatorios/exportar', icon: FileText, roles: ['admin', 'gerencia'] },
      ],
    },
    {
      title: 'CONFIGURAÇÕES',
      items: [
        { name: 'Perfis de Acesso', href: '/configuracoes/perfis', icon: Settings, roles: ['admin'] },
        { name: 'Integrações', href: '/configuracoes/integracoes', icon: Settings, roles: ['admin'] },
        { name: 'Minha Conta', href: '/configuracoes/conta', icon: Settings, roles: ['admin', 'gerencia', 'cobranca', 'comercial'] },
      ],
    },
    {
      title: 'EQUIPE',
      items: [
        { name: 'Monitoramento', href: '/equipe/monitoramento', icon: Activity, roles: ['admin', 'gerencia'] },
        { name: 'Produtividade', href: '/equipe/produtividade', icon: Activity, roles: ['admin', 'gerencia'] },
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
    <div className="flex h-screen overflow-hidden bg-muted transition-colors duration-300">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'w-64' : 'w-0'
        } transition-all duration-300 bg-slate-900 text-sidebar-foreground flex flex-col overflow-hidden`}
      >
        {/* Logo */}
        <div className="p-4 border-b border-sidebar-border flex items-center justify-between">
          <div className="flex items-center gap-2">
           <img src={logo} alt="Logo" className="w-64 h-auto" />
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-6">
          {navigation.map((section) => {
            const visibleItems = section.items.filter((item) => canAccess(item.roles));
            if (visibleItems.length === 0) return null;

            return (
              <div key={section.title}>
                <h3 className="text-xs font-semibold text-sidebar-primary mb-2">
                  {section.title}
                </h3>
                <ul className="space-y-1">
                  {visibleItems.map((item) => (
                    <li key={item.name}>
                      <Link
                        to={item.href}
                        className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                          isActive(item.href)
                            ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                            : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                        }`}
                      >
                        <item.icon className="w-4 h-4" />
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
        <div className="p-4 border-t border-sidebar-border">
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground w-full transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Sair</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-card border-b border-border p-4 flex items-center justify-between transition-colors duration-300">
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
    </div>
  );
}