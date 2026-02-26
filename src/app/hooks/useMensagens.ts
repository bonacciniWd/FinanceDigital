/**
 * @module useMensagens
 * @description React Query hooks para chat/mensagens com Realtime.
 *
 * @example
 * ```tsx
 * const { data: msgs } = useMensagens(clienteId);
 * const enviar = useEnviarMensagem();
 * enviar.mutate({ cliente_id: 'xxx', remetente: 'sistema', conteudo: 'Olá!' });
 * ```
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import * as mensagensService from '../services/mensagensService';
import { dbMensagemToView } from '../lib/adapters';
import type { MensagemInsert } from '../lib/database.types';

const QUERY_KEY = 'mensagens';

/** Buscar mensagens de um cliente — retorna camelCase */
export function useMensagens(clienteId: string | undefined) {
  const queryClient = useQueryClient();

  // Realtime subscription
  useEffect(() => {
    if (!clienteId) return;

    const unsubscribe = mensagensService.subscribeToMensagens(
      clienteId,
      () => {
        queryClient.invalidateQueries({ queryKey: [QUERY_KEY, clienteId] });
      }
    );

    return unsubscribe;
  }, [clienteId, queryClient]);

  return useQuery({
    queryKey: [QUERY_KEY, clienteId],
    queryFn: () => mensagensService.getMensagensByCliente(clienteId!),
    enabled: !!clienteId,
    refetchInterval: 10000,
    select: (data) => data.map(dbMensagemToView),
  });
}

/** Buscar últimas mensagens (lista de conversas) — retorna camelCase */
export function useUltimasMensagens() {
  return useQuery({
    queryKey: [QUERY_KEY, 'ultimas'],
    queryFn: () => mensagensService.getUltimasMensagens(),
    select: (data) => data.map(dbMensagemToView),
  });
}

/** Contagem de mensagens não lidas — retorna camelCase */
export function useMensagensNaoLidas() {
  return useQuery({
    queryKey: [QUERY_KEY, 'nao-lidas'],
    queryFn: () => mensagensService.getMensagensNaoLidas(),
    refetchInterval: 30000,
    select: (data) => data.map(dbMensagemToView),
  });
}

/** Enviar mensagem */
export function useEnviarMensagem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: MensagemInsert) => mensagensService.enviarMensagem(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, variables.cliente_id] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, 'ultimas'] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, 'nao-lidas'] });
    },
  });
}

/** Marcar mensagens como lidas */
export function useMarcarComoLida() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (clienteId: string) => mensagensService.marcarComoLida(clienteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, 'nao-lidas'] });
    },
  });
}
