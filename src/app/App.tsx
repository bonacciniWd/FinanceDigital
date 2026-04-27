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
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ClienteModalProvider } from './contexts/ClienteModalContext';
import { Toaster } from './components/ui/sonner';
import { router } from './routes';
import { useSyncJurosConfig } from './hooks/useConfigSistema';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache "quente" por 5 min: enquanto fresh, NÃO refetcha em mount/focus.
      staleTime: 1000 * 60 * 5,
      // Mantém na memória 30 min após o último consumidor desmontar (evita refetch
      // ao navegar entre rotas e voltar).
      gcTime: 1000 * 60 * 30,
      retry: 1,
      // Desligado: refetch ao focar a janela era o maior gerador de tráfego —
      // qualquer Alt-Tab disparava todas as queries montadas. Mutações já
      // invalidam o que precisa ser invalidado.
      refetchOnWindowFocus: false,
      refetchOnReconnect: 'always',
    },
  },
});

// ── Persistência do cache em localStorage ─────────────────────────────────
// Sobrevive a F5 e restart do Electron. Hidrata na inicialização e re-valida
// em background o que estiver "stale". Mutações em andamento NÃO são
// persistidas (buster da app), apenas o resultado das queries.
const persister = createSyncStoragePersister({
  storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  key: 'fintech-flow-rq-cache',
  // Throttle de gravação: evita escrever no localStorage a cada query.
  throttleTime: 1500,
});

// Versão do cache: bump quando muda shape dos dados (adapters, RPCs) para
// invalidar caches antigos automaticamente em produção.
const CACHE_BUSTER = 'v1';

/** Sincroniza parâmetros configuráveis (juros) do banco → runtime da lib. */
function RuntimeConfigSync() {
  useSyncJurosConfig();
  return null;
}

export default function App() {
  return (
    <ThemeProvider>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: 1000 * 60 * 60 * 24, // 24h: descarta cache mais velho que isso
          buster: CACHE_BUSTER,
          dehydrateOptions: {
            // Não persistir queries com erro nem queries que não terminaram.
            shouldDehydrateQuery: (query) => query.state.status === 'success',
          },
        }}
      >
        <AuthProvider>
          <ClienteModalProvider>
            <RuntimeConfigSync />
            <RouterProvider router={router} />
            <Toaster />
          </ClienteModalProvider>
        </AuthProvider>
      </PersistQueryClientProvider>
    </ThemeProvider>
  );
}