/**
 * @module BrazilMap
 * @description Mapa interativo do Brasil para filtrar clientes por estado e cidade.
 * Renderiza o SVG br.svg inline com zoom/pan e painel de cidades.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { Search, ZoomIn, ZoomOut, RotateCcw, X } from 'lucide-react';

interface BrazilMapProps {
  selectedState: string;
  onSelectState: (uf: string) => void;
  selectedCity: string;
  onSelectCity: (city: string) => void;
  /** Contagem de clientes por UF (ex: { SP: 12, RJ: 5 }) */
  clientCountByState?: Record<string, number>;
  /** Contagem de clientes por cidade para o estado selecionado */
  clientCountByCity?: Record<string, number>;
  /** Lista de cidades com clientes no estado selecionado */
  citiesInState?: string[];
}

const SVG_ID_TO_UF: Record<string, string> = {
  BRAC: 'AC', BRAL: 'AL', BRAM: 'AM', BRAP: 'AP', BRBA: 'BA',
  BRCE: 'CE', BRDF: 'DF', BRES: 'ES', BRGO: 'GO', BRMA: 'MA',
  BRMG: 'MG', BRMS: 'MS', BRMT: 'MT', BRPA: 'PA', BRPB: 'PB',
  BRPE: 'PE', BRPI: 'PI', BRPR: 'PR', BRRJ: 'RJ', BRRN: 'RN',
  BRRO: 'RO', BRRR: 'RR', BRRS: 'RS', BRSC: 'SC', BRSE: 'SE',
  BRSP: 'SP', BRTO: 'TO',
};

export default function BrazilMap({
  selectedState, onSelectState,
  selectedCity, onSelectCity,
  clientCountByState = {},
  clientCountByCity = {},
  citiesInState = [],
}: BrazilMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgContent, setSvgContent] = useState<string>('');
  const [hoveredState, setHoveredState] = useState<string>('');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const [citySearch, setCitySearch] = useState('');

  // Load SVG
  useEffect(() => {
    fetch(new URL('../../app/assets/br.svg', import.meta.url).href)
      .then(r => r.text())
      .then(text => {
        const svgMatch = text.match(/<svg[\s\S]*<\/svg>/i);
        if (svgMatch) setSvgContent(svgMatch[0]);
      })
      .catch(() => {});
  }, []);

  // Zoom handlers
  const handleZoomIn = useCallback(() => setZoom(z => Math.min(z + 0.3, 4)), []);
  const handleZoomOut = useCallback(() => setZoom(z => Math.max(z - 0.3, 0.5)), []);
  const handleReset = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, []);

  // Mouse wheel zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom(z => {
        const delta = e.deltaY > 0 ? -0.15 : 0.15;
        return Math.min(Math.max(z + delta, 0.5), 4);
      });
    };
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  // Pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsPanning(true);
    panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    setPan({
      x: panStart.current.panX + (e.clientX - panStart.current.x),
      y: panStart.current.panY + (e.clientY - panStart.current.y),
    });
  }, [isPanning]);

  const handleMouseUp = useCallback(() => setIsPanning(false), []);

  // Attach click/hover handlers to state paths
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !svgContent) return;

    const svgEl = container.querySelector('svg');
    if (!svgEl) return;

    svgEl.setAttribute('width', '100%');
    svgEl.setAttribute('height', '100%');
    svgEl.style.maxHeight = '520px';

    const paths = svgEl.querySelectorAll('path[id]');
    paths.forEach(path => {
      const el = path as SVGPathElement;
      const svgId = el.getAttribute('id') ?? '';
      const uf = SVG_ID_TO_UF[svgId];
      if (!uf) return;

      el.style.cursor = 'pointer';
      el.style.transition = 'fill 0.2s, stroke 0.2s';

      const count = clientCountByState[uf] ?? 0;
      if (uf === selectedState) {
        el.style.fill = '#6366f1';
        el.style.stroke = '#a855f7';
        el.style.strokeWidth = '1.5';
      } else if (count > 0) {
        el.style.fill = '#818cf8';
        el.style.stroke = '#ede9fe';
        el.style.strokeWidth = '0.5';
      } else {
        el.style.fill = '#c4b5fd';
        el.style.stroke = '#ede9fe';
        el.style.strokeWidth = '0.5';
      }

      const handleClick = () => {
        onSelectState(uf === selectedState ? '' : uf);
        onSelectCity('');
        setCitySearch('');
      };
      const handleEnter = () => {
        setHoveredState(uf);
        if (uf !== selectedState) el.style.fill = '#a855f7';
      };
      const handleLeave = () => {
        setHoveredState('');
        if (uf === selectedState) {
          el.style.fill = '#6366f1';
        } else if (count > 0) {
          el.style.fill = '#818cf8';
        } else {
          el.style.fill = '#c4b5fd';
        }
      };

      el.addEventListener('click', handleClick);
      el.addEventListener('mouseenter', handleEnter);
      el.addEventListener('mouseleave', handleLeave);

      (el as any).__cleanup = () => {
        el.removeEventListener('click', handleClick);
        el.removeEventListener('mouseenter', handleEnter);
        el.removeEventListener('mouseleave', handleLeave);
      };
    });

    return () => {
      paths.forEach(path => {
        (path as any).__cleanup?.();
      });
    };
  }, [svgContent, selectedState, clientCountByState, onSelectState, onSelectCity]);

  const hoveredCount = hoveredState ? (clientCountByState[hoveredState] ?? 0) : 0;

  const filteredCities = citySearch
    ? citiesInState.filter(c => c.toLowerCase().includes(citySearch.toLowerCase()))
    : citiesInState;

  return (
    <div className="relative flex gap-4" style={{ minHeight: 400 }}>
      {/* Map area */}
      <div className="flex-1 relative overflow-hidden rounded-lg border bg-muted/30">
        {/* Zoom controls */}
        <div className="absolute top-3 left-3 z-10 flex flex-col gap-1">
          <button
            onClick={handleZoomIn}
            className="w-8 h-8 rounded-md bg-background/90 border shadow-sm flex items-center justify-center hover:bg-accent transition-colors"
            title="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={handleZoomOut}
            className="w-8 h-8 rounded-md bg-background/90 border shadow-sm flex items-center justify-center hover:bg-accent transition-colors"
            title="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleReset}
            className="w-8 h-8 rounded-md bg-background/90 border shadow-sm flex items-center justify-center hover:bg-accent transition-colors"
            title="Resetar zoom"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Hover tooltip */}
        {hoveredState && (
          <div className="absolute top-3 right-3 z-10 bg-popover border rounded-md px-3 py-1.5 text-sm shadow-md pointer-events-none">
            <span className="font-medium">{hoveredState}</span>
            <span className="text-muted-foreground ml-2">{hoveredCount} cliente(s)</span>
          </div>
        )}

        {/* SVG with zoom/pan */}
        <div
          ref={containerRef}
          dangerouslySetInnerHTML={{ __html: svgContent }}
          className="w-full h-full cursor-grab active:cursor-grabbing"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            transition: isPanning ? 'none' : 'transform 0.2s ease',
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />

        {/* Zoom indicator */}
        {zoom !== 1 && (
          <div className="absolute bottom-3 left-3 z-10 text-xs text-muted-foreground bg-background/80 rounded px-2 py-0.5">
            {Math.round(zoom * 100)}%
          </div>
        )}
      </div>

      {/* City filter panel — appears when a state is selected */}
      {selectedState && (
        <div className="w-64 shrink-0 border rounded-lg bg-background flex flex-col overflow-hidden">
          <div className="px-3 py-2.5 border-b bg-muted/50 flex items-center justify-between">
            <span className="text-sm font-medium">
              📍 {selectedState} — Cidades
            </span>
            <button
              onClick={() => { onSelectState(''); onSelectCity(''); setCitySearch(''); }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-3 py-2 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar cidade..."
                value={citySearch}
                onChange={e => setCitySearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[420px]">
            <button
              onClick={() => onSelectCity('')}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center justify-between ${
                !selectedCity ? 'bg-primary/10 text-primary font-medium' : ''
              }`}
            >
              <span>Todas as cidades</span>
              <span className="text-xs text-muted-foreground">
                {clientCountByState[selectedState] ?? 0}
              </span>
            </button>

            {filteredCities.length === 0 ? (
              <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                {citiesInState.length === 0 ? 'Nenhum cliente neste estado' : 'Nenhuma cidade encontrada'}
              </div>
            ) : (
              filteredCities.map(city => {
                const count = clientCountByCity[city] ?? 0;
                return (
                  <button
                    key={city}
                    onClick={() => onSelectCity(city === selectedCity ? '' : city)}
                    className={`w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors flex items-center justify-between ${
                      city === selectedCity ? 'bg-primary/10 text-primary font-medium' : ''
                    }`}
                  >
                    <span className="truncate">{city}</span>
                    <span className="text-xs text-muted-foreground ml-2 shrink-0">{count}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Bottom bar */}
      {(selectedState || selectedCity) && (
        <div className="absolute -bottom-7 left-0 right-0 text-center text-sm text-muted-foreground">
          Filtrando por:{' '}
          <span className="font-medium text-primary">{selectedState}</span>
          {selectedCity && (
            <> → <span className="font-medium text-primary">{selectedCity}</span></>
          )}
          <button
            className="ml-2 text-xs underline hover:text-primary"
            onClick={() => { onSelectState(''); onSelectCity(''); setCitySearch(''); }}
          >
            Limpar
          </button>
        </div>
      )}
    </div>
  );
}
