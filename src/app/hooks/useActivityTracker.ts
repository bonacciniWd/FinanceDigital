/**
 * @module useActivityTracker
 * @description Rastreia atividade do usuário logado.
 *
 * Fluxo:
 *  1. mount  → ensureFuncionario → status='online' → iniciarSessao → heartbeat loop
 *  2. heartbeat (30 s) → atualiza ultima_atividade, horas, acoes, paginas
 *  3. visibilitychange → ausente/online
 *  4. logout (AuthContext) → finalizarSessaoAtiva + status='offline'
 *  5. unmount (navegação interna, HMR) → cleanup silencioso, NÃO offliniza
 *
 * beforeunload NÃO é usado — não é confiável cross-browser e causa race conditions.
 * A detecção de "sessão órfã" é feita no próximo login (iniciarSessao fecha órfãs).
 */
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { supabase } from '../lib/supabase';
import * as svc from '../services/funcionariosService';
import { useAuth } from '../contexts/AuthContext';

export function useActivityTracker(userId: string | undefined) {
  const { user } = useAuth();
  const userRef = useRef(user);
  userRef.current = user;

  const funcIdRef = useRef<string | null>(null);
  const sessaoIdRef = useRef<string | null>(null);
  const paginasRef = useRef<Set<string>>(new Set());
  const acoesRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const alive = useRef(false);
  const location = useLocation();

  // Track pages
  useEffect(() => {
    if (location.pathname) paginasRef.current.add(location.pathname);
  }, [location.pathname]);

  // Track clicks/keys
  useEffect(() => {
    const inc = () => { acoesRef.current += 1; };
    window.addEventListener('click', inc);
    window.addEventListener('keydown', inc);
    return () => { window.removeEventListener('click', inc); window.removeEventListener('keydown', inc); };
  }, []);

  useEffect(() => {
    if (!userId) return;
    alive.current = true;

    (async () => {
      try {
        // Espera 1.5s para o auto-refresh do Supabase renovar o JWT se necessário
        await new Promise((r) => setTimeout(r, 1500));
        if (!alive.current) return;

        // Verifica se a sessão está válida
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || !alive.current) return;

        const u = userRef.current;
        const func = await svc.ensureFuncionario(
          userId,
          u?.name ?? 'Usuário',
          u?.email ?? '',
          u?.role ?? 'comercial',
        );
        if (!alive.current || !func) return;
        funcIdRef.current = func.id;

        await svc.updateFuncionarioStatus(func.id, 'online').catch(() => {});
        if (!alive.current) return;

        const sessao = await svc.iniciarSessao(func.id).catch(() => null);
        if (!alive.current) return;
        if (sessao) sessaoIdRef.current = sessao.id;

        // First sync after 2 s, then every 30 s
        const beat = async () => {
          if (!alive.current || !funcIdRef.current) return;
          await svc.heartbeatFull(funcIdRef.current).catch(() => {});
          if (sessaoIdRef.current) {
            await svc.atualizarSessao(sessaoIdRef.current, acoesRef.current, Array.from(paginasRef.current)).catch(() => {});
          }
        };

        setTimeout(() => { if (alive.current) beat(); }, 2000);
        intervalRef.current = setInterval(beat, 30_000);
      } catch (e) {
        console.error('ActivityTracker init:', e);
      }
    })();

    const onVis = () => {
      if (!funcIdRef.current) return;
      svc.updateFuncionarioStatus(funcIdRef.current, document.hidden ? 'ausente' : 'online').catch(() => {});
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      alive.current = false;
      document.removeEventListener('visibilitychange', onVis);
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      // Don't mark offline here — that's logout's job.
      // Don't close session here — init closes orphans next login.
    };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps
}
