/**
 * @module useZoom
 * @description Controle de zoom unificado entre Electron e Web.
 *
 * - **Electron**: usa `window.electronAPI.setZoomFactor` (webFrame.setZoomFactor),
 *   que é o método correto — não cria espaço vazio nem desalinha layouts.
 * - **Web**: usa `document.documentElement.style.zoom` (suportado em Chromium/
 *   Edge/Safari). É equivalente ao Ctrl+/Ctrl- do navegador.
 *
 * Persistência: localStorage `app:zoomFactor`.
 * Faixa: 0.6 → 1.6 em passos de 0.1 (igual ao Chrome).
 */
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'app:zoomFactor';
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 1.6;
const ZOOM_STEP = 0.1;
const ZOOM_DEFAULT_ELECTRON = 0.9;
const ZOOM_DEFAULT_WEB = 1.0;

const clamp = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));

interface ElectronZoomAPI {
  getZoomFactor?: () => number;
  setZoomFactor?: (factor: number) => number;
}

function getElectronAPI(): ElectronZoomAPI | null {
  const api = (window as unknown as { electronAPI?: ElectronZoomAPI }).electronAPI;
  return api && typeof api.setZoomFactor === 'function' ? api : null;
}

function readInitialZoom(isElectron: boolean): number {
  try {
    const saved = parseFloat(localStorage.getItem(STORAGE_KEY) ?? '');
    if (!isNaN(saved)) return clamp(saved);
  } catch { /* ignore */ }
  return isElectron ? ZOOM_DEFAULT_ELECTRON : ZOOM_DEFAULT_WEB;
}

function applyZoom(zoom: number, isElectron: boolean) {
  if (isElectron) {
    getElectronAPI()?.setZoomFactor?.(zoom);
  } else if (typeof document !== 'undefined') {
    // CSS zoom funciona em Chromium/Edge/Safari (web build roda nesses).
    (document.documentElement.style as CSSStyleDeclaration & { zoom?: string }).zoom = String(zoom);
  }
  try { localStorage.setItem(STORAGE_KEY, String(zoom)); } catch { /* ignore */ }
}

export function useZoom() {
  const isElectron = typeof window !== 'undefined' && !!getElectronAPI();
  const [zoom, setZoomState] = useState<number>(() => readInitialZoom(isElectron));

  // Aplica o zoom inicial uma vez ao montar (Electron já aplicou via preload,
  // mas garantimos consistência caso o preload tenha errado o storage).
  useEffect(() => {
    applyZoom(zoom, isElectron);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setZoom = useCallback((next: number) => {
    const z = clamp(next);
    applyZoom(z, isElectron);
    setZoomState(z);
  }, [isElectron]);

  const zoomIn = useCallback(() => setZoom(zoom + ZOOM_STEP), [zoom, setZoom]);
  const zoomOut = useCallback(() => setZoom(zoom - ZOOM_STEP), [zoom, setZoom]);
  const resetZoom = useCallback(() => setZoom(isElectron ? ZOOM_DEFAULT_ELECTRON : ZOOM_DEFAULT_WEB), [isElectron, setZoom]);

  return {
    zoom,
    zoomPct: Math.round(zoom * 100),
    canZoomIn: zoom < ZOOM_MAX - 0.001,
    canZoomOut: zoom > ZOOM_MIN + 0.001,
    zoomIn,
    zoomOut,
    resetZoom,
    isElectron,
  };
}
