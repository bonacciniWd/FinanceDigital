/**
 * @module useDesktopIpGuard
 * @description Hook that checks IP whitelist via Electron IPC on desktop app startup.
 * Falls back to web-based check when running in browser.
 */
import { useState, useEffect, useCallback } from 'react';
import { startUsageSession, pingUsageSession, endUsageSession } from '../services/ipWhitelistService';

declare global {
  interface Window {
    electronAPI?: {
      checkIpWhitelist: (supabaseUrl: string, supabaseKey: string) => Promise<{ allowed: boolean; ip: string; checked_at: string }>;
      getCurrentIp: () => Promise<string>;
      getMachineId: () => Promise<string>;
      encryptAndSave: (name: string, data: string) => Promise<string>;
      loadAndDecrypt: (name: string) => Promise<string>;
      deleteEncrypted: (name: string) => Promise<void>;
    };
  }
}

const isElectron = () => typeof window !== 'undefined' && !!window.electronAPI;

interface IpGuardState {
  checking: boolean;
  allowed: boolean | null;
  ip: string | null;
  error: string | null;
}

export function useDesktopIpGuard(userId?: string) {
  const [state, setState] = useState<IpGuardState>({
    checking: true,
    allowed: null,
    ip: null,
    error: null,
  });
  const [sessionId, setSessionId] = useState<string | null>(null);

  const checkIp = useCallback(async () => {
    setState((s) => ({ ...s, checking: true, error: null }));

    try {
      if (isElectron()) {
        // Desktop: use Electron IPC
        const result = await window.electronAPI!.checkIpWhitelist(
          import.meta.env.VITE_SUPABASE_URL,
          import.meta.env.VITE_SUPABASE_ANON_KEY,
        );

        setState({
          checking: false,
          allowed: result.allowed,
          ip: result.ip,
          error: result.allowed ? null : 'IP não autorizado',
        });

        // Start usage session if allowed
        if (result.allowed && userId) {
          const machineId = await window.electronAPI!.getMachineId();
          const sid = await startUsageSession(userId, result.ip, machineId);
          setSessionId(sid);
        }
      } else {
        // Browser fallback: call edge function directly
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

        const res = await fetch(`${supabaseUrl}/functions/v1/check-ip`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({}),
        });

        const data = await res.json();
        setState({
          checking: false,
          allowed: data.allowed === true,
          ip: data.ip,
          error: data.allowed ? null : 'IP não autorizado',
        });
      }
    } catch (err) {
      setState({
        checking: false,
        allowed: false,
        ip: null,
        error: (err as Error).message,
      });
    }
  }, [userId]);

  // Check on mount
  useEffect(() => {
    checkIp();
  }, [checkIp]);

  // Ping session every 60s while active
  useEffect(() => {
    if (!sessionId) return;
    const interval = setInterval(() => {
      pingUsageSession(sessionId).catch(() => {});
    }, 60_000);
    return () => {
      clearInterval(interval);
      endUsageSession(sessionId).catch(() => {});
    };
  }, [sessionId]);

  return { ...state, recheck: checkIp };
}
