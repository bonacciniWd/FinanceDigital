/**
 * @module ipWhitelistService
 * @description CRUD para tabela allowed_ips + emergency_tokens + app_usage_sessions.
 */
import { supabase } from '../lib/supabase';

// ── Types ──────────────────────────────────────────────────
export interface AllowedIp {
  id: string;
  ip_address: string;
  label: string | null;
  added_by: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EmergencyToken {
  id: string;
  token: string;
  created_by: string | null;
  used_by_ip: string | null;
  used_at: string | null;
  expires_at: string;
  created_at: string;
}

export interface AppUsageSession {
  id: string;
  user_id: string;
  ip_address: string;
  machine_id: string | null;
  started_at: string;
  ended_at: string | null;
  last_ping_at: string;
  duration_sec: number | null;
  profiles?: { name: string; email: string; role: string };
}

// ── Allowed IPs ────────────────────────────────────────────

export async function getAllowedIps(): Promise<AllowedIp[]> {
  const { data, error } = await supabase
    .from('allowed_ips')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as AllowedIp[];
}

export async function addAllowedIp(ip_address: string, label: string, added_by: string): Promise<AllowedIp> {
  const { data, error } = await supabase
    .from('allowed_ips')
    .insert({ ip_address, label, added_by } as any)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as AllowedIp;
}

export async function toggleAllowedIp(id: string, active: boolean): Promise<void> {
  const { error } = await (supabase.from('allowed_ips') as any)
    .update({ active, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteAllowedIp(id: string): Promise<void> {
  const { error } = await supabase.from('allowed_ips').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Emergency Tokens ───────────────────────────────────────

export async function getEmergencyTokens(): Promise<EmergencyToken[]> {
  const { data, error } = await supabase
    .from('emergency_tokens')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as EmergencyToken[];
}

export async function createEmergencyToken(created_by: string): Promise<EmergencyToken> {
  const { data, error } = await supabase
    .from('emergency_tokens')
    .insert({ created_by } as any)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as EmergencyToken;
}

// ── App Usage Sessions ─────────────────────────────────────

export async function getAppUsageSessions(limit = 100): Promise<AppUsageSession[]> {
  const { data, error } = await supabase
    .from('app_usage_sessions')
    .select('*, profiles!app_usage_sessions_user_id_fkey(name, email, role)')
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as AppUsageSession[];
}

export async function startUsageSession(user_id: string, ip_address: string, machine_id?: string): Promise<string> {
  const { data, error } = await supabase
    .from('app_usage_sessions')
    .insert({ user_id, ip_address, machine_id } as any)
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

export async function pingUsageSession(sessionId: string): Promise<void> {
  const { error } = await (supabase.from('app_usage_sessions') as any)
    .update({ last_ping_at: new Date().toISOString() })
    .eq('id', sessionId);
  if (error) throw new Error(error.message);
}

export async function endUsageSession(sessionId: string): Promise<void> {
  const { error } = await (supabase.from('app_usage_sessions') as any)
    .update({ ended_at: new Date().toISOString() })
    .eq('id', sessionId);
  if (error) throw new Error(error.message);
}
