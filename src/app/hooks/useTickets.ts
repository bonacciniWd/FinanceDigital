/**
 * @module useTickets
 * @description React Query hooks para operações com tickets de atendimento.
 *
 * Hooks: useTickets, useTicketsByStatus, useTicket, useTicketsByCliente,
 * useCreateTicket, useUpdateTicket, useMoverTicket, useAtribuirTicket, useDeleteTicket
 *
 * @example
 * ```tsx
 * const { data: tickets } = useTickets();
 * const mover = useMoverTicket();
 * mover.mutate({ id: 'abc', status: 'em_atendimento' });
 * ```
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as ticketsService from '../services/ticketsService';
import { dbTicketToView } from '../lib/adapters';
import type { TicketAtendimentoInsert, TicketAtendimentoUpdate, TicketStatus } from '../lib/database.types';

const QUERY_KEY = 'tickets';

/** Buscar todos os tickets (opcionalmente filtrados por status) — retorna camelCase */
export function useTickets(status?: TicketStatus) {
  return useQuery({
    queryKey: [QUERY_KEY, { status }],
    queryFn: () => ticketsService.getTickets(status),
    select: (data) => data.map(dbTicketToView),
  });
}

/** Buscar tickets por status específico (para coluna do Kanban) */
export function useTicketsByStatus(status: TicketStatus) {
  return useQuery({
    queryKey: [QUERY_KEY, 'status', status],
    queryFn: () => ticketsService.getTicketsByStatus(status),
    select: (data) => data.map(dbTicketToView),
  });
}

/** Buscar um ticket por ID — retorna camelCase */
export function useTicket(id: string | undefined) {
  return useQuery({
    queryKey: [QUERY_KEY, id],
    queryFn: () => ticketsService.getTicketById(id!),
    enabled: !!id,
    select: (data) => (data ? dbTicketToView(data) : null),
  });
}

/** Buscar tickets de um cliente específico */
export function useTicketsByCliente(clienteId: string | undefined) {
  return useQuery({
    queryKey: [QUERY_KEY, 'cliente', clienteId],
    queryFn: () => ticketsService.getTicketsByCliente(clienteId!),
    enabled: !!clienteId,
    select: (data) => data.map(dbTicketToView),
  });
}

/** Buscar tickets atribuídos a um funcionário */
export function useTicketsByAtendente(atendenteId: string | undefined) {
  return useQuery({
    queryKey: [QUERY_KEY, 'atendente', atendenteId],
    queryFn: () => ticketsService.getTicketsByAtendente(atendenteId!),
    enabled: !!atendenteId,
    select: (data) => data.map(dbTicketToView),
  });
}

/** Criar novo ticket */
export function useCreateTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: TicketAtendimentoInsert) => ticketsService.createTicket(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}

/** Atualizar ticket (status, atendente, etc.) */
export function useUpdateTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: TicketAtendimentoUpdate }) =>
      ticketsService.updateTicket(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}

/** Mover ticket para outro status (drag-and-drop) */
export function useMoverTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: TicketStatus }) =>
      ticketsService.moverTicket(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}

/** Atribuir ticket a um atendente */
export function useAtribuirTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, atendenteId }: { id: string; atendenteId: string }) =>
      ticketsService.atribuirTicket(id, atendenteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}

/** Deletar ticket */
export function useDeleteTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ticketsService.deleteTicket(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}
