/**
 * @module useIpWhitelist
 * @description React Query hooks for IP whitelist management.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as svc from '../services/ipWhitelistService';

const QK = 'ip-whitelist';

// ── Allowed IPs ────────────────────────────────────────────

export function useAllowedIps() {
  return useQuery({
    queryKey: [QK, 'ips'],
    queryFn: svc.getAllowedIps,
  });
}

export function useAddAllowedIp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { ip_address: string; label: string; added_by: string }) =>
      svc.addAllowedIp(data.ip_address, data.label, data.added_by),
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK, 'ips'] }),
  });
}

export function useToggleAllowedIp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: string; active: boolean }) =>
      svc.toggleAllowedIp(data.id, data.active),
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK, 'ips'] }),
  });
}

export function useDeleteAllowedIp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => svc.deleteAllowedIp(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK, 'ips'] }),
  });
}

// ── Emergency Tokens ───────────────────────────────────────

export function useEmergencyTokens() {
  return useQuery({
    queryKey: [QK, 'tokens'],
    queryFn: svc.getEmergencyTokens,
  });
}

export function useCreateEmergencyToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (created_by: string) => svc.createEmergencyToken(created_by),
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK, 'tokens'] }),
  });
}

// ── App Usage Sessions ─────────────────────────────────────

export function useAppUsageSessions(limit = 100) {
  return useQuery({
    queryKey: [QK, 'sessions', limit],
    queryFn: () => svc.getAppUsageSessions(limit),
  });
}
