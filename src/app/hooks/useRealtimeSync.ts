/**
 * @module useRealtimeSync
 * @description Supabase Realtime → React Query cache invalidation.
 *
 * Watches key tables for external changes (e.g. client submitting
 * identity verification from a link, or another session creating
 * an analysis) and invalidates the affected React Query caches so
 * the UI refreshes automatically — no manual F5 or app restart needed.
 *
 * Uses a single persistent WebSocket channel per session (mounted once
 * from MainLayout). Zero polling — zero extra HTTP requests.
 *
 * Tables watched (must be in supabase_realtime publication):
 *  - analises_credito   → invalidates ['analises-credito']
 */
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useRealtimeSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel('fd-realtime-sync')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'analises_credito' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['analises-credito'] });
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'analises_credito' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['analises-credito'] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
