/**
 * @module useChatInterno
 * @description React Query hooks para chat interno com Supabase Realtime.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import * as chatInternoService from '../services/chatInternoService';
import type { ChatInternoInsert } from '../lib/database.types';

const QK = 'chat-interno';

/** Listar usuários disponíveis para conversa */
export function useUsuariosChat(meuId: string | undefined) {
  return useQuery({
    queryKey: [QK, 'usuarios'],
    queryFn: () => chatInternoService.getUsuariosChat(meuId!),
    enabled: !!meuId,
  });
}

/** Mensagens entre mim e outro usuário — com Realtime */
export function useMensagensInternas(
  meuId: string | undefined,
  outroId: string | undefined
) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!meuId) return;
    const unsub = chatInternoService.subscribeToChatInterno(meuId, () => {
      qc.invalidateQueries({ queryKey: [QK, 'msgs'] });
      qc.invalidateQueries({ queryKey: [QK, 'nao-lidas'] });
    });
    return unsub;
  }, [meuId, qc]);

  return useQuery({
    queryKey: [QK, 'msgs', meuId, outroId],
    queryFn: () => chatInternoService.getMensagensEntreUsuarios(meuId!, outroId!),
    enabled: !!meuId && !!outroId,
    refetchInterval: 15000,
  });
}

/** Contagem total de não-lidas */
export function useNaoLidasChatInterno(meuId: string | undefined) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!meuId) return;
    const unsub = chatInternoService.subscribeToChatInterno(meuId, () => {
      qc.invalidateQueries({ queryKey: [QK, 'nao-lidas'] });
    });
    return unsub;
  }, [meuId, qc]);

  return useQuery({
    queryKey: [QK, 'nao-lidas', meuId],
    queryFn: () => chatInternoService.getContagemNaoLidas(meuId!),
    enabled: !!meuId,
    refetchInterval: 30000,
  });
}

/** Não-lidas agrupadas por remetente */
export function useNaoLidasPorRemetente(meuId: string | undefined) {
  return useQuery({
    queryKey: [QK, 'nao-lidas-por-remetente', meuId],
    queryFn: () => chatInternoService.getNaoLidasPorRemetente(meuId!),
    enabled: !!meuId,
    refetchInterval: 30000,
  });
}

/** Enviar mensagem interna */
export function useEnviarMensagemInterna() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ChatInternoInsert) =>
      chatInternoService.enviarMensagemInterna(data),
    onSuccess: (msg) => {
      qc.invalidateQueries({ queryKey: [QK, 'msgs'] });
      qc.invalidateQueries({ queryKey: [QK, 'nao-lidas'] });
    },
  });
}

/** Marcar como lidas */
export function useMarcarLidasChatInterno() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ meuId, deUserId }: { meuId: string; deUserId: string }) =>
      chatInternoService.marcarLidas(meuId, deUserId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QK, 'nao-lidas'] });
    },
  });
}

/** Enviar áudio gravado */
export function useEnviarAudioInterno() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { deUserId: string; paraUserId: string; blob: Blob; duracaoSeg: number }) =>
      chatInternoService.enviarAudio(data.deUserId, data.paraUserId, data.blob, data.duracaoSeg),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QK, 'msgs'] });
      qc.invalidateQueries({ queryKey: [QK, 'nao-lidas'] });
    },
  });
}

/** Enviar card de atenção — cliente */
export function useEnviarAtencaoCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      deUserId: string;
      paraUserId: string;
      cliente: { id: string; nome: string; status: string; telefone: string };
    }) => chatInternoService.enviarAtencaoCliente(data.deUserId, data.paraUserId, data.cliente),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QK, 'msgs'] });
      qc.invalidateQueries({ queryKey: [QK, 'nao-lidas'] });
    },
  });
}

/** Enviar card de atenção — empréstimo */
export function useEnviarAtencaoEmprestimo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      deUserId: string;
      paraUserId: string;
      emprestimo: {
        id: string;
        cliente_nome: string;
        valor_total: number;
        parcelas_pagas: number;
        total_parcelas: number;
        status: string;
      };
    }) => chatInternoService.enviarAtencaoEmprestimo(data.deUserId, data.paraUserId, data.emprestimo),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QK, 'msgs'] });
      qc.invalidateQueries({ queryKey: [QK, 'nao-lidas'] });
    },
  });
}
