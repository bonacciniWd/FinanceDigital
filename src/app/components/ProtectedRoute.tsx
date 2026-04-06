/**
 * @module ProtectedRoute
 * @description Guarda de rota que redireciona usuários não autenticados.
 *
 * Envolve rotas protegidas. Exibe spinner enquanto auth inicializa.
 * Se `isAuthenticated` for false após carregamento, redireciona
 * para `/login` preservando a URL de origem em
 * `location.state.from` para redirect pós-login.
 *
 * @example
 * ```tsx
 * <ProtectedRoute><DashboardPage /></ProtectedRoute>
 * ```
 */
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../contexts/AuthContext';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading, ipBlockedMsg } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-muted">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated || ipBlockedMsg) {
    return <Navigate to="/login" state={{ from: location, ipError: ipBlockedMsg || undefined }} replace />;
  }

  return <>{children}</>;
}
