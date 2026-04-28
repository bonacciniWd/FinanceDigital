// @refresh reset
// @refresh reset
/**
 * @module ClienteModalContext
 * @description Provider global para o ClienteDetalhesModal unificado.
 *
 * Permite abrir o modal de detalhes do cliente de qualquer tela:
 *
 * ```tsx
 * const { openClienteModal } = useClienteModal();
 * <span onClick={() => openClienteModal(clienteId)}>{cliente.nome}</span>
 * ```
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import ClienteDetalhesModal from '../components/ClienteDetalhesModal';

export type ClienteModalTab = 'dados' | 'emprestimos' | 'cobranca' | 'whatsapp' | 'historico';

interface OpenOptions {
  /** Aba inicial ao abrir (padrão: 'dados') */
  tab?: ClienteModalTab;
}

interface ClienteModalContextValue {
  clienteId: string | null;
  tab: ClienteModalTab;
  openClienteModal: (clienteId: string, opts?: OpenOptions) => void;
  closeClienteModal: () => void;
  setTab: (tab: ClienteModalTab) => void;
}

const ClienteModalContext = createContext<ClienteModalContextValue | null>(null);

export function ClienteModalProvider({ children }: { children: ReactNode }) {
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [tab, setTab] = useState<ClienteModalTab>('dados');

  const openClienteModal = useCallback((id: string, opts?: OpenOptions) => {
    setClienteId(id);
    setTab(opts?.tab ?? 'dados');
  }, []);

  const closeClienteModal = useCallback(() => {
    setClienteId(null);
  }, []);

  const value = useMemo<ClienteModalContextValue>(
    () => ({ clienteId, tab, openClienteModal, closeClienteModal, setTab }),
    [clienteId, tab, openClienteModal, closeClienteModal],
  );

  return (
    <ClienteModalContext.Provider value={value}>
      {children}
      <ClienteDetalhesModal
        clienteId={clienteId}
        tab={tab}
        onTabChange={setTab}
        onClose={closeClienteModal}
      />
    </ClienteModalContext.Provider>
  );
}

export function useClienteModal(): ClienteModalContextValue {
  const ctx = useContext(ClienteModalContext);
  if (!ctx) {
    throw new Error('useClienteModal deve ser usado dentro de <ClienteModalProvider>');
  }
  return ctx;
}
