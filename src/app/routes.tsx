import { createBrowserRouter, Navigate } from 'react-router';
import { MainLayout } from './components/MainLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import DashboardCobrancaPage from './pages/DashboardCobrancaPage';
import ClientesPage from './pages/ClientesPage';
import RedeIndicacoesPage from './pages/RedeIndicacoesPage';
import ChatPage from './pages/ChatPage';
import KanbanCobrancaPage from './pages/KanbanCobrancaPage';
import RelatoriosPage from './pages/RelatoriosPage';
import ClienteAreaPage from './pages/ClienteAreaPage';

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
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <MainLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        path: 'dashboard',
        element: <DashboardPage />,
      },
      {
        path: 'dashboard/cobranca',
        element: <DashboardCobrancaPage />,
      },
      {
        path: 'clientes',
        element: <ClientesPage />,
      },
      {
        path: 'rede',
        element: <RedeIndicacoesPage />,
      },
      {
        path: 'chat',
        element: <ChatPage />,
      },
      {
        path: 'kanban/cobranca',
        element: <KanbanCobrancaPage />,
      },
      {
        path: 'relatorios/gerenciais',
        element: <RelatoriosPage />,
      },
      // Placeholders para outras rotas
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