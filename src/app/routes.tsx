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
import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router';
import { MainLayout } from './components/MainLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import Lottie from 'lottie-react';
import welcomeAnimation from './assets/animations/welcome.json';

// Lazy-loaded pages — code-splitting para reduzir bundle inicial e acelerar navegação
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const DashboardCobrancaPage = lazy(() => import('./pages/DashboardCobrancaPage'));
const DashboardFinanceiroPage = lazy(() => import('./pages/DashboardFinanceiroPage'));
const DashboardComercialPage = lazy(() => import('./pages/DashboardComercialPage'));
const ClientesPage = lazy(() => import('./pages/ClientesPage'));
const AnaliseCreditoPage = lazy(() => import('./pages/AnaliseCreditoPage'));
const EmprestimosAtivosPage = lazy(() => import('./pages/EmprestimosAtivosPage'));
const HistoricoClientesPage = lazy(() => import('./pages/HistoricoClientesPage'));
const GestaoParcelasPage = lazy(() => import('./pages/GestaoParcelasPage'));
const RedeIndicacoesPage = lazy(() => import('./pages/RedeIndicacoesPage'));
const BonusComissoesPage = lazy(() => import('./pages/BonusComissoesPage'));
const GruposBloqueadosPage = lazy(() => import('./pages/GruposBloqueadosPage'));
const IndicarNovoPage = lazy(() => import('./pages/IndicarNovoPage'));
const WhatsAppPage = lazy(() => import('./pages/WhatsAppPage'));
const FluxosChatPage = lazy(() => import('./pages/FluxosChatPage'));
const FluxoEditorPage = lazy(() => import('./pages/FluxoEditorPage'));
const TemplatesMensagensPage = lazy(() => import('./pages/TemplatesMensagensPage'));
const KanbanCobrancaPage = lazy(() => import('./pages/KanbanCobrancaPage'));
const KanbanAnalisePage = lazy(() => import('./pages/KanbanAnalisePage'));
const KanbanAtendimentoPage = lazy(() => import('./pages/KanbanAtendimentoPage'));
const KanbanGerencialPage = lazy(() => import('./pages/KanbanGerencialPage'));
const RelatoriosPage = lazy(() => import('./pages/RelatoriosPage'));
const RelatoriosOperacionaisPage = lazy(() => import('./pages/RelatoriosOperacionaisPage'));
const ExportarDadosPage = lazy(() => import('./pages/ExportarDadosPage'));
const PerfisAcessoPage = lazy(() => import('./pages/PerfisAcessoPage'));
const IntegracoesPage = lazy(() => import('./pages/IntegracoesPage'));
const MinhaContaPage = lazy(() => import('./pages/MinhaContaPage'));
const GerenciarUsuariosPage = lazy(() => import('./pages/GerenciarUsuariosPage'));
const MonitoramentoAtividadePage = lazy(() => import('./pages/MonitoramentoAtividadePage'));
const ProdutividadePage = lazy(() => import('./pages/ProdutividadePage'));
const ClienteAreaPage = lazy(() => import('./pages/ClienteAreaPage'));
const PagamentosWooviPage = lazy(() => import('./pages/PagamentosWooviPage'));
const PagamentosOrfaosPage = lazy(() => import('./pages/PagamentosOrfaosPage'));
const VerifyIdentityPage = lazy(() => import('./pages/VerifyIdentityPage'));
const IpWhitelistPage = lazy(() => import('./pages/IpWhitelistPage'));
const DownloadPage = lazy(() => import('./pages/DownloadPage'));
const DocsPage = lazy(() => import('./pages/DocsPage'));
const EmergencyTokenPage = lazy(() => import('./pages/EmergencyTokenPage'));
const ComissoesConfigPage = lazy(() => import('./pages/ComissoesConfigPage'));
const ConfigSistemaPage = lazy(() => import('./pages/ConfigSistemaPage'));
const RelatorioComissoesPage = lazy(() => import('./pages/RelatorioComissoesPage'));

const PageFallback = () => (
  <div className="flex items-center justify-center h-full min-h-[40vh]">
    <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
  </div>
);
const lz = (node: React.ReactNode) => <Suspense fallback={<PageFallback />}>{node}</Suspense>;

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
        {lz(<ClienteAreaPage />)}
      </ProtectedRoute>
    ),
  },
  // Editor de fluxo — fullscreen, sem sidebar
  {
    path: '/chat/fluxos/:id/editor',
    element: (
      <ProtectedRoute>
        {lz(<FluxoEditorPage />)}
      </ProtectedRoute>
    ),
  },
  // Verificação de identidade — standalone, acesso via magic link
  {
    path: '/verify-identity',
    element: lz(<VerifyIdentityPage />),
  },
  // Download page — protegida por IP whitelist via Vercel middleware
  {
    path: '/download',
    element: lz(<DownloadPage />),
  },
  // Docs page — FAQ e tutorial extraído do README
  {
    path: '/docs',
    element: lz(<DocsPage />),
  },
  // Emergency token — rota secreta para registrar IP dinâmico
  {
    path: '/emergency',
    element: lz(<EmergencyTokenPage />),
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
      { path: 'dashboard', element: lz(<DashboardPage />) },
      { path: 'dashboard/financeiro', element: lz(<DashboardFinanceiroPage />) },
      { path: 'dashboard/cobranca', element: lz(<DashboardCobrancaPage />) },
      { path: 'dashboard/comercial', element: lz(<DashboardComercialPage />) },

      // Clientes
      { path: 'clientes', element: lz(<ClientesPage />) },
      { path: 'clientes/analise', element: lz(<AnaliseCreditoPage />) },
      { path: 'clientes/emprestimos', element: lz(<EmprestimosAtivosPage />) },
      { path: 'clientes/historico', element: lz(<HistoricoClientesPage />) },
      { path: 'clientes/parcelas', element: lz(<GestaoParcelasPage />) },

      // Pagamentos / Woovi
      { path: 'pagamentos', element: lz(<PagamentosWooviPage />) },
      { path: 'pagamentos/orfaos', element: lz(<PagamentosOrfaosPage />) },

      // Rede de Indicações
      { path: 'rede', element: lz(<RedeIndicacoesPage />) },
      { path: 'rede/bonus', element: lz(<BonusComissoesPage />) },
      { path: 'rede/bloqueados', element: lz(<GruposBloqueadosPage />) },
      { path: 'rede/indicar', element: lz(<IndicarNovoPage />) },

      // Comunicação
      { path: 'whatsapp', element: lz(<WhatsAppPage />) },
      { path: 'chat/fluxos', element: lz(<FluxosChatPage />) },
      { path: 'chat/templates', element: lz(<TemplatesMensagensPage />) },

      // Kanban
      { path: 'kanban/cobranca', element: lz(<KanbanCobrancaPage />) },
      { path: 'kanban/analise', element: lz(<KanbanAnalisePage />) },
      { path: 'kanban/atendimento', element: lz(<KanbanAtendimentoPage />) },
      { path: 'kanban/gerencial', element: lz(<KanbanGerencialPage />) },

      // Relatórios
      { path: 'relatorios/gerenciais', element: lz(<RelatoriosPage />) },
      { path: 'relatorios/operacionais', element: lz(<RelatoriosOperacionaisPage />) },
      { path: 'relatorios/comissoes', element: lz(<RelatorioComissoesPage />) },
      { path: 'relatorios/exportar', element: lz(<ExportarDadosPage />) },

      // Configurações
      { path: 'configuracoes/perfis', element: lz(<PerfisAcessoPage />) },
      { path: 'configuracoes/usuarios', element: lz(<GerenciarUsuariosPage />) },
      { path: 'configuracoes/comissoes', element: lz(<ComissoesConfigPage />) },
      { path: 'configuracoes/integracoes', element: lz(<IntegracoesPage />) },
      { path: 'configuracoes/ip-whitelist', element: lz(<IpWhitelistPage />) },
      { path: 'configuracoes/sistema', element: lz(<ConfigSistemaPage />) },
      { path: 'configuracoes/conta', element: lz(<MinhaContaPage />) },

      // Equipe
      { path: 'equipe/monitoramento', element: lz(<MonitoramentoAtividadePage />) },
      { path: 'equipe/produtividade', element: lz(<ProdutividadePage />) },

      // Ajuda
      { path: 'ajuda/docs', element: lz(<DocsPage />) },

      // Fallback
      {
        path: '*',
        element: (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <h2 className="text-2xl font-semibold mb-2">Pagina em Desenvolvimento...</h2>
              <Lottie animationData={welcomeAnimation}  width={150} height={150} loop={true} />
            </div>
          </div>
        ),
      },
    ],
  },
]);