/**
 * @module ticketsService
 * @description Serviço CRUD para tickets de atendimento via Supabase.
 *
 * Sem mock data — todas as operações vão direto ao banco.
 * Usa JOINs com clientes e funcionarios para retornar nomes.
 *
 * @see database.types para tipagem completa
 */
import { supabase } from '../lib/supabase';
import type {
  TicketComCliente,
  TicketAtendimentoInsert,
  TicketAtendimentoUpdate,
  TicketStatus,
} from '../lib/database.types';

const TICKET_SELECT = `
  *,
  clientes:cliente_id ( nome, telefone, email ),
  funcionarios:atendente_id ( nome )
`;

// ── Queries ────────────────────────────────────────────────

/** Buscar todos os tickets, opcionalmente filtrados por status */
export async function getTickets(status?: TicketStatus): Promise<TicketComCliente[]> {
  let query = supabase
    .from('tickets_atendimento')
    .select(TICKET_SELECT)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as TicketComCliente[];
}

/** Buscar tickets por status (para colunas do Kanban) */
export async function getTicketsByStatus(status: TicketStatus): Promise<TicketComCliente[]> {
  const { data, error } = await supabase
    .from('tickets_atendimento')
    .select(TICKET_SELECT)
    .eq('status', status)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as TicketComCliente[];
}

/** Buscar ticket por ID */
export async function getTicketById(id: string): Promise<TicketComCliente | null> {
  const { data, error } = await supabase
    .from('tickets_atendimento')
    .select(TICKET_SELECT)
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as TicketComCliente;
}

/** Buscar tickets por cliente */
export async function getTicketsByCliente(clienteId: string): Promise<TicketComCliente[]> {
  const { data, error } = await supabase
    .from('tickets_atendimento')
    .select(TICKET_SELECT)
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as TicketComCliente[];
}

/** Buscar tickets atribuídos a um funcionário */
export async function getTicketsByAtendente(atendenteId: string): Promise<TicketComCliente[]> {
  const { data, error } = await supabase
    .from('tickets_atendimento')
    .select(TICKET_SELECT)
    .eq('atendente_id', atendenteId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as TicketComCliente[];
}

// ── Mutations ──────────────────────────────────────────────

/** Criar novo ticket */
export async function createTicket(ticket: TicketAtendimentoInsert): Promise<TicketComCliente> {
  const { data, error } = await supabase
    .from('tickets_atendimento')
    .insert(ticket)
    .select(TICKET_SELECT)
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as TicketComCliente;
}

/** Atualizar ticket (mudar status, atribuir atendente, etc.) */
export async function updateTicket(
  id: string,
  updates: TicketAtendimentoUpdate
): Promise<TicketComCliente> {
  // Se estiver marcando como resolvido, preencher resolvido_em
  if (updates.status === 'resolvido' && !updates.resolvido_em) {
    updates.resolvido_em = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('tickets_atendimento')
    .update(updates)
    .eq('id', id)
    .select(TICKET_SELECT)
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as TicketComCliente;
}

/** Mover ticket para outro status (drag-and-drop no Kanban) */
export async function moverTicket(id: string, novoStatus: TicketStatus): Promise<TicketComCliente> {
  return updateTicket(id, { status: novoStatus });
}

/** Atribuir ticket a um atendente */
export async function atribuirTicket(id: string, atendenteId: string): Promise<TicketComCliente> {
  return updateTicket(id, {
    atendente_id: atendenteId,
    status: 'em_atendimento',
  });
}

/** Deletar ticket */
export async function deleteTicket(id: string): Promise<void> {
  const { error } = await supabase
    .from('tickets_atendimento')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}
