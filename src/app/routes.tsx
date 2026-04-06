/**
 * @module routes
 * @description Configuração central de rotas do FintechFlow (React Router 7).
 *
 * Define 28 rotas protegidas + login público + wildcard fallback.
 * Todas as rotas protegidas são envolvidas por `<ProtectedRoute>`
 * e renderizadas dentro de `<MainLayout>` (sidebar + header).
 *
 * Seções: Dashboard (4), Clientes (5), Rede (4), Comunicação (4),
 * Kanban (4), Relatórios (3), Configurações (3), Equipe (2) + Área Cliente.
 *
 * @exports router - Instância de `createBrowserRouter`
 */
import { createBrowserRouter, Navigate } from 'react-router';
import { MainLayout } from './components/MainLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import DashboardCobrancaPage from './pages/DashboardCobrancaPage';
import DashboardFinanceiroPage from './pages/DashboardFinanceiroPage';
import DashboardComercialPage from './pages/DashboardComercialPage';
import ClientesPage from './pages/ClientesPage';
import AnaliseCreditoPage from './pages/AnaliseCreditoPage';
import EmprestimosAtivosPage from './pages/EmprestimosAtivosPage';
import HistoricoClientesPage from './pages/HistoricoClientesPage';
import GestaoParcelasPage from './pages/GestaoParcelasPage';
import RedeIndicacoesPage from './pages/RedeIndicacoesPage';
import BonusComissoesPage from './pages/BonusComissoesPage';
import GruposBloqueadosPage from './pages/GruposBloqueadosPage';
import IndicarNovoPage from './pages/IndicarNovoPage';
import WhatsAppPage from './pages/WhatsAppPage';
import FluxosChatPage from './pages/FluxosChatPage';
import FluxoEditorPage from './pages/FluxoEditorPage';
import TemplatesMensagensPage from './pages/TemplatesMensagensPage';
import KanbanCobrancaPage from './pages/KanbanCobrancaPage';
import KanbanAnalisePage from './pages/KanbanAnalisePage';
import KanbanAtendimentoPage from './pages/KanbanAtendimentoPage';
import KanbanGerencialPage from './pages/KanbanGerencialPage';
import RelatoriosPage from './pages/RelatoriosPage';
import RelatoriosOperacionaisPage from './pages/RelatoriosOperacionaisPage';
import ExportarDadosPage from './pages/ExportarDadosPage';
import PerfisAcessoPage from './pages/PerfisAcessoPage';
import IntegracoesPage from './pages/IntegracoesPage';
import MinhaContaPage from './pages/MinhaContaPage';
import GerenciarUsuariosPage from './pages/GerenciarUsuariosPage';
import MonitoramentoAtividadePage from './pages/MonitoramentoAtividadePage';
import ProdutividadePage from './pages/ProdutividadePage';
import ClienteAreaPage from './pages/ClienteAreaPage';
import PagamentosWooviPage from './pages/PagamentosWooviPage';
import VerifyIdentityPage from './pages/VerifyIdentityPage';
import IpWhitelistPage from './pages/IpWhitelistPage';
import DownloadPage from './pages/DownloadPage';
import DocsPage from './pages/DocsPage';
import EmergencyTokenPage from './pages/EmergencyTokenPage';
import ComissoesConfigPage from './pages/ComissoesConfigPage';
import ConfigSistemaPage from './pages/ConfigSistemaPage';
import RelatorioComissoesPage from './pages/RelatorioComissoesPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate to="/login" replace />,
  },
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/cliente',
    element: (
      <ProtectedRoute>
        <ClienteAreaPage />
      </ProtectedRoute>
    ),
  },
  // Editor de fluxo — fullscreen, sem sidebar
  {
    path: '/chat/fluxos/:id/editor',
    element: (
      <ProtectedRoute>
        <FluxoEditorPage />
      </ProtectedRoute>
    ),
  },
  // Verificação de identidade — standalone, acesso via magic link
  {
    path: '/verify-identity',
    element: <VerifyIdentityPage />,
  },
  // Download page — protegida por IP whitelist via Vercel middleware
  {
    path: '/download',
    element: <DownloadPage />,
  },
  // Docs page — FAQ e tutorial extraído do README
  {
    path: '/docs',
    element: <DocsPage />,
  },
  // Emergency token — rota secreta para registrar IP dinâmico
  {
    path: '/emergency',
    element: <EmergencyTokenPage />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <MainLayout />
      </ProtectedRoute>
    ),
    children: [
      // Dashboard
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'dashboard/financeiro', element: <DashboardFinanceiroPage /> },
      { path: 'dashboard/cobranca', element: <DashboardCobrancaPage /> },
      { path: 'dashboard/comercial', element: <DashboardComercialPage /> },

      // Clientes
      { path: 'clientes', element: <ClientesPage /> },
      { path: 'clientes/analise', element: <AnaliseCreditoPage /> },
      { path: 'clientes/emprestimos', element: <EmprestimosAtivosPage /> },
      { path: 'clientes/historico', element: <HistoricoClientesPage /> },
      { path: 'clientes/parcelas', element: <GestaoParcelasPage /> },

      // Pagamentos / Woovi
      { path: 'pagamentos', element: <PagamentosWooviPage /> },

      // Rede de Indicações
      { path: 'rede', element: <RedeIndicacoesPage /> },
      { path: 'rede/bonus', element: <BonusComissoesPage /> },
      { path: 'rede/bloqueados', element: <GruposBloqueadosPage /> },
      { path: 'rede/indicar', element: <IndicarNovoPage /> },

      // Comunicação
      { path: 'whatsapp', element: <WhatsAppPage /> },
      { path: 'chat/fluxos', element: <FluxosChatPage /> },
      { path: 'chat/templates', element: <TemplatesMensagensPage /> },

      // Kanban
      { path: 'kanban/cobranca', element: <KanbanCobrancaPage /> },
      { path: 'kanban/analise', element: <KanbanAnalisePage /> },
      { path: 'kanban/atendimento', element: <KanbanAtendimentoPage /> },
      { path: 'kanban/gerencial', element: <KanbanGerencialPage /> },

      // Relatórios
      { path: 'relatorios/gerenciais', element: <RelatoriosPage /> },
      { path: 'relatorios/operacionais', element: <RelatoriosOperacionaisPage /> },
      { path: 'relatorios/comissoes', element: <RelatorioComissoesPage /> },
      { path: 'relatorios/exportar', element: <ExportarDadosPage /> },

      // Configurações
      { path: 'configuracoes/perfis', element: <PerfisAcessoPage /> },
      { path: 'configuracoes/usuarios', element: <GerenciarUsuariosPage /> },
      { path: 'configuracoes/comissoes', element: <ComissoesConfigPage /> },
      { path: 'configuracoes/integracoes', element: <IntegracoesPage /> },
      { path: 'configuracoes/ip-whitelist', element: <IpWhitelistPage /> },
      { path: 'configuracoes/sistema', element: <ConfigSistemaPage /> },
      { path: 'configuracoes/conta', element: <MinhaContaPage /> },

      // Equipe
      { path: 'equipe/monitoramento', element: <MonitoramentoAtividadePage /> },
      { path: 'equipe/produtividade', element: <ProdutividadePage /> },

      // Ajuda
      { path: 'ajuda/docs', element: <DocsPage /> },

      // Fallback
      {
        path: '*',
        element: (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <h2 className="text-2xl font-semibold mb-2">Página em Desenvolvimento</h2>
              <p className="text-muted-foreground">
                Esta funcionalidade será implementada em breve.
              </p>
            </div>
          </div>
        ),
      },
    ],
  },
]);