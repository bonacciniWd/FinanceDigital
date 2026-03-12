/**
 * @module LWCChart
 * @description Wrapper React para TradingView Lightweight Charts v5.
 * Suporta séries do tipo: line, area, histogram.
 * Responsivo via ResizeObserver. Reage à troca dark/light via MutationObserver.
 */
import { useEffect, useRef } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineSeries,
  AreaSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
} from 'lightweight-charts';

export interface LWCSeriesDef {
  label: string;
  data: Array<{ time: string; value: number; color?: string }>;
  color: string;
  type?: 'line' | 'area' | 'histogram';
  priceScaleId?: string;
  lineWidth?: number;
}

interface Props {
  series: LWCSeriesDef[];
  height?: number;
  formatValue?: (v: number) => string;
  className?: string;
  emptyText?: string;
}

function buildChart(container: HTMLDivElement, height: number, formatValue?: (v: number) => string) {
  const dark = document.documentElement.classList.contains('dark');
  return createChart(container, {
    width: container.clientWidth,
    height,
    layout: {
      background: { type: ColorType.Solid, color: 'transparent' },
      textColor: dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)',
      fontSize: 11,
      fontFamily: 'Inter, system-ui, sans-serif',
    },
    grid: {
      vertLines: { color: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
      horzLines: { color: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
    },
    crosshair: { mode: CrosshairMode.Magnet },
    leftPriceScale: { borderVisible: false, visible: true },
    rightPriceScale: { borderVisible: false, visible: false },
    timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true, timeVisible: false },
    localization: formatValue ? { priceFormatter: formatValue } : undefined,
    handleScale: false,
    handleScroll: false,
  });
}

// ── Time normalization ─────────────────────────────────────
// LWC requires dates in 'YYYY-MM-DD' format.
// We accept any label string and map it to a proper date sequence.
const MONTH_PT: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

function buildTimeMap(labels: string[]): Map<string, string> {
  const unique = [...new Set(labels)];
  const map = new Map<string, string>();

  for (const label of unique) {
    // Already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(label)) { map.set(label, label); continue; }

    // DD/MM or DD/MM/YYYY
    const dmMatch = label.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
    if (dmMatch) {
      const year = dmMatch[3] ?? String(new Date().getFullYear());
      const m = dmMatch[2].padStart(2, '0');
      const d = dmMatch[1].padStart(2, '0');
      map.set(label, `${year}-${m}-${d}`);
      continue;
    }

    // "Jan 2025" or "Janeiro 2025"
    const myrMatch = label.match(/^([A-Za-záéíóôãõçÁ]+)\s+(\d{4})$/);
    if (myrMatch) {
      const mo = MONTH_PT[myrMatch[1].toLowerCase().slice(0, 3)];
      if (mo) {
        map.set(label, `${myrMatch[2]}-${String(mo).padStart(2, '0')}-01`);
        continue;
      }
    }
    // Otherwise: will be handled below by sequential fallback
  }

  // Fallback: assign sequential monthly dates for unmapped labels
  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() - unique.length + 1);

  let idx = 0;
  for (const label of unique) {
    if (!map.has(label)) {
      const d = new Date(base);
      d.setMonth(d.getMonth() + idx);
      map.set(label, d.toISOString().slice(0, 10));
    }
    idx++;
  }

  return map;
}

function addSeriesFromDef(chart: IChartApi, def: LWCSeriesDef, formatValue?: (v: number) => string): ISeriesApi<SeriesType> {
  const priceFormat = formatValue
    ? { type: 'custom' as const, formatter: formatValue, minMove: 0.1 }
    : { type: 'price' as const, precision: 1, minMove: 0.1 };
  const base = {
    priceScaleId: def.priceScaleId ?? 'left',
    lastValueVisible: false,
    priceLineVisible: false,
    priceFormat,
  };
  if (def.type === 'area') {
    return chart.addSeries(AreaSeries, {
      ...base,
      lineColor: def.color,
      topColor: def.color + '55',
      bottomColor: def.color + '00',
      lineWidth: (def.lineWidth ?? 2) as 1 | 2 | 3 | 4,
    });
  }
  if (def.type === 'histogram') {
    return chart.addSeries(HistogramSeries, {
      ...base,
      color: def.color,
    });
  }
  // default: line
  return chart.addSeries(LineSeries, {
    ...base,
    color: def.color,
    lineWidth: (def.lineWidth ?? 2) as 1 | 2 | 3 | 4,
  });
}

/**
 * Add all series to a chart, protecting against duplicate / non-ascending
 * time values that LWC forbids. When a series has duplicate times after
 * label normalisation (e.g. "Mar" spans two calendar years), we fall back
 * to strictly-ascending sequential monthly dates based on array index so
 * the chart never crashes.
 */
function applySeriesData(
  chart: IChartApi,
  seriesList: LWCSeriesDef[],
  timeMap: Map<string, string>,
  formatValue?: (v: number) => string,
) {
  for (const def of seriesList) {
    if (def.data.length === 0) continue;
    const s = addSeriesFromDef(chart, def, formatValue);

    let mapped = def.data.map((d) => ({ ...d, time: timeMap.get(d.time) ?? d.time }));

    // Detect duplicate times — happens when month-only labels wrap a calendar year
    const timeSet = new Set(mapped.map((d) => d.time));
    if (timeSet.size < mapped.length) {
      // Sequential monthly fallback: anchor the last point at the current month
      const base = new Date();
      base.setDate(1);
      base.setMonth(base.getMonth() - mapped.length + 1);
      mapped = mapped.map((d, i) => {
        const dt = new Date(base);
        dt.setMonth(dt.getMonth() + i);
        return { ...d, time: dt.toISOString().slice(0, 10) };
      });
    }

    s.setData(mapped.sort((a, b) => a.time.localeCompare(b.time)) as any);
  }
}

export function LWCChart({ series, height = 300, formatValue, className, emptyText }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const allEmpty = series.every((s) => s.data.length === 0);
    if (allEmpty) return;

    // Build a unified time map across all series
    const allLabels = series.flatMap((s) => s.data.map((d) => d.time));
    const timeMap = buildTimeMap(allLabels);

    let chart = buildChart(el, height, formatValue);
    chartRef.current = chart;

    applySeriesData(chart, series, timeMap, formatValue);
    chart.timeScale().fitContent();

    // Resize observer
    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth });
      chart.timeScale().fitContent();
    });
    ro.observe(el);

    // Dark mode observer — rebuild chart on theme toggle
    const mo = new MutationObserver(() => {
      chart.remove();
      chart = buildChart(el, height, formatValue);
      chartRef.current = chart;
      applySeriesData(chart, series, timeMap, formatValue);
      chart.timeScale().fitContent();
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      ro.disconnect();
      mo.disconnect();
      chart.remove();
    };
  }, [series, height, formatValue]);

  const allEmpty = series.every((s) => s.data.length === 0);
  if (allEmpty) {
    return (
      <div
        className={`flex items-center justify-center text-sm text-muted-foreground ${className ?? ''}`}
        style={{ height }}
      >
        {emptyText ?? 'Sem dados para exibir'}
      </div>
    );
  }

  return <div ref={containerRef} style={{ height }} className={className} />;
}
