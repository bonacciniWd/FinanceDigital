/**
 * @module useWhatsapp
 * @description React Query hooks para WhatsApp — instâncias, mensagens e envio.
 *
 * @example
 * ```tsx
 * const { data: instancias } = useInstancias();
 * const criar = useCriarInstancia();
 * const enviar = useEnviarWhatsapp();
 * ```
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import * as whatsappService from '../services/whatsappService';
import type { EnviarMensagemParams } from '../services/whatsappService';

const INSTANCIAS_KEY = 'whatsapp-instancias';
const MENSAGENS_KEY = 'whatsapp-mensagens';
const CONVERSAS_KEY = 'whatsapp-conversas';
const STATS_KEY = 'whatsapp-stats';

// ══════════════════════════════════════════════════════════
// ── Instâncias ────────────────────────────────────────────
// ══════════════════════════════════════════════════════════

/** Listar instâncias WhatsApp. Se userId fornecido, filtra por created_by. */
export function useInstancias(userId?: string) {
  const queryClient = useQueryClient();

  // Realtime: atualizar quando status muda
  useEffect(() => {
    const unsubscribe = whatsappService.subscribeToInstancias(() => {
      queryClient.invalidateQueries({ queryKey: [INSTANCIAS_KEY] });
    });
    return unsubscribe;
  }, [queryClient]);

  return useQuery({
    queryKey: userId ? [INSTANCIAS_KEY, userId] : [INSTANCIAS_KEY],
    queryFn: () => userId
      ? whatsappService.getInstanciasByUser(userId)
      : whatsappService.getInstancias(),
    refetchInterval: 30000, // Polling a cada 30s como backup
  });
}

/** Buscar instância por ID */
export function useInstancia(id: string | undefined) {
  return useQuery({
    queryKey: [INSTANCIAS_KEY, id],
    queryFn: () => whatsappService.getInstanciaById(id!),
    enabled: !!id,
  });
}

/** Criar nova instância */
export function useCriarInstancia() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      instance_name: string;
      evolution_url?: string;
      evolution_global_apikey?: string;
      departamento?: string;
      phone_number?: string;
    }) => whatsappService.criarInstancia(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [INSTANCIAS_KEY] });
    },
  });
}

/** Conectar instância (gerar QR) */
export function useConectarInstancia() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (instanciaId: string) =>
      whatsappService.conectarInstancia(instanciaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [INSTANCIAS_KEY] });
    },
  });
}

/** Desconectar instância */
export function useDesconectarInstancia() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (instanciaId: string) =>
      whatsappService.desconectarInstancia(instanciaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [INSTANCIAS_KEY] });
    },
  });
}

/** Verificar status da instância */
export function useStatusInstancia() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (instanciaId: string) =>
      whatsappService.statusInstancia(instanciaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [INSTANCIAS_KEY] });
    },
  });
}

/** Deletar instância */
export function useDeletarInstancia() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (instanciaId: string) =>
      whatsappService.deletarInstancia(instanciaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [INSTANCIAS_KEY] });
      queryClient.invalidateQueries({ queryKey: [STATS_KEY] });
    },
  });
}

/** Reiniciar instância */
export function useReiniciarInstancia() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (instanciaId: string) =>
      whatsappService.reiniciarInstancia(instanciaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [INSTANCIAS_KEY] });
    },
  });
}

/** Configurar webhook */
export function useConfigurarWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (instanciaId: string) =>
      whatsappService.configurarWebhook(instanciaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [INSTANCIAS_KEY] });
    },
  });
}

/**
 * Sincroniza todas as instâncias do servidor Evolution (Fly.io) com o Supabase.
 * Upserta no banco e configura webhook automaticamente em cada uma.
 * Use após trocar de URL ou reiniciar o servidor.
 */
export function useSyncInstancias() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => whatsappService.syncAll(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [INSTANCIAS_KEY] });
    },
  });
}

// ══════════════════════════════════════════════════════════
// ── Mensagens / Conversas ─────────────────────────────────
// ══════════════════════════════════════════════════════════

/** Enviar mensagem WhatsApp */
export function useEnviarWhatsapp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: EnviarMensagemParams) =>
      whatsappService.enviarMensagem(params),
    onSuccess: (_, variables) => {
      // Strip JID suffix to match the bare phone query key
      const phone = variables.telefone.replace(/@.*$/, '').replace(/\D/g, '');
      queryClient.invalidateQueries({
        queryKey: [MENSAGENS_KEY, phone],
      });
      queryClient.invalidateQueries({ queryKey: [CONVERSAS_KEY] });
      queryClient.invalidateQueries({ queryKey: [STATS_KEY] });
    },
  });
}

/** Buscar mensagens de um telefone */
export function useMensagensWhatsapp(telefone: string | undefined) {
  const queryClient = useQueryClient();

  // Realtime: novas mensagens
  useEffect(() => {
    if (!telefone) return;

    const unsubscribe = whatsappService.subscribeToMensagens((msg) => {
      if (msg.telefone === telefone) {
        queryClient.invalidateQueries({
          queryKey: [MENSAGENS_KEY, telefone],
        });
      }
      // Sempre invalidar conversas quando qualquer mensagem chega
      queryClient.invalidateQueries({ queryKey: [CONVERSAS_KEY] });
      queryClient.invalidateQueries({ queryKey: [STATS_KEY] });
    });

    return unsubscribe;
  }, [telefone, queryClient]);

  return useQuery({
    queryKey: [MENSAGENS_KEY, telefone],
    queryFn: () => whatsappService.getMensagensByTelefone(telefone!),
    enabled: !!telefone,
    refetchInterval: 5000, // Polling a cada 5s como backup
  });
}

/** Listar conversas (agrupadas por telefone) */
export function useConversasWhatsapp(instanciaId?: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const unsubscribe = whatsappService.subscribeToMensagens(() => {
      queryClient.invalidateQueries({ queryKey: [CONVERSAS_KEY] });
    });
    return unsubscribe;
  }, [queryClient]);

  return useQuery({
    queryKey: [CONVERSAS_KEY, instanciaId],
    queryFn: () => whatsappService.getConversas(instanciaId),
    refetchInterval: 5000, // Polling a cada 5s como backup
  });
}

/** Estatísticas de mensagens */
export function useEstatisticasWhatsapp(instanciaId?: string) {
  return useQuery({
    queryKey: [STATS_KEY, instanciaId],
    queryFn: () => whatsappService.getEstatisticas(instanciaId),
    refetchInterval: 30000,
  });
}
