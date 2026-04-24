/**
 * @module App
 * @description Componente raiz da aplicação FintechFlow.
 *
 * Monta os providers globais:
 * 1. `ThemeProvider` — tema claro/escuro
 * 2. `QueryClientProvider` — cache e fetching (React Query)
 * 3. `AuthProvider` — autenticação (Supabase ou mock)
 * 4. `RouterProvider` — roteamento com 28+ rotas
 * 5. `Toaster` (Sonner) — notificações toast globais
 */
import { RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ClienteModalProvider } from './contexts/ClienteModalContext';
import { Toaster } from './components/ui/sonner';
import { router } from './routes';
import { useSyncJurosConfig } from './hooks/useConfigSistema';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2, // 2 min
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

/** Sincroniza parâmetros configuráveis (juros) do banco → runtime da lib. */
function RuntimeConfigSync() {
  useSyncJurosConfig();
  return null;
}

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ClienteModalProvider>
            <RuntimeConfigSync />
            <RouterProvider router={router} />
            <Toaster />
          </ClienteModalProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}