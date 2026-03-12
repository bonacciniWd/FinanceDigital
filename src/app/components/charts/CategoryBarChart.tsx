/**
 * @module BarChart
 * @description Gráfico de barras CSS para dados categóricos (substitui BarChart do recharts).
 * Suporta barras agrupadas e horizontais. Combina esteticamente com LWCChart.
 */

interface BarSeries {
  label: string;
  color: string;
  dataKey: string;
}

interface BarItem {
  [key: string]: string | number;
}

interface BarChartProps {
  data: BarItem[];
  series: BarSeries[];
  labelKey?: string;
  layout?: 'vertical' | 'horizontal';
  height?: number;
  formatValue?: (v: number) => string;
  className?: string;
  emptyText?: string;
}

export function CategoryBarChart({
  data,
  series,
  labelKey = 'label',
  layout = 'vertical',
  height = 300,
  formatValue,
  className,
  emptyText,
}: BarChartProps) {
  if (data.length === 0) {
    return (
      <div
        className={`flex items-center justify-center text-sm text-muted-foreground ${className ?? ''}`}
        style={{ height }}
      >
        {emptyText ?? 'Sem dados para exibir'}
      </div>
    );
  }

  const allValues = data.flatMap((row) => series.map((s) => Number(row[s.dataKey] ?? 0)));
  const maxVal = Math.max(...allValues, 1);
  const fmt = formatValue ?? ((v: number) => String(v));

  if (layout === 'horizontal') {
    return (
      <div className={`flex flex-col gap-2 py-2 ${className ?? ''}`} style={{ minHeight: height }}>
        {data.map((row, ri) => (
          <div key={ri} className="flex items-center gap-3 text-sm">
            <span className="w-28 shrink-0 text-right text-xs text-muted-foreground truncate">
              {String(row[labelKey] ?? '')}
            </span>
            <div className="flex-1 flex flex-col gap-1">
              {series.map((s) => {
                const val = Number(row[s.dataKey] ?? 0);
                const pct = (val / maxVal) * 100;
                return (
                  <div key={s.dataKey} className="flex items-center gap-2">
                    <div className="flex-1 bg-muted rounded-full h-5 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                        style={{ width: `${pct}%`, backgroundColor: s.color, minWidth: val > 0 ? '1.5rem' : 0 }}
                      >
                        {val > 0 && (
                          <span className="text-[10px] font-semibold text-white">{fmt(val)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {/* Legend */}
        {series.length > 1 && (
          <div className="flex gap-4 justify-center mt-2 flex-wrap">
            {series.map((s) => (
              <div key={s.dataKey} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
                {s.label}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Vertical grouped bars
  const barGroupWidth = `${Math.min(100 / data.length - 2, 14)}%`;

  return (
    <div className={`flex flex-col ${className ?? ''}`} style={{ height }}>
      <div className="flex-1 flex items-end gap-1 px-2 pb-1">
        {data.map((row, ri) => (
          <div key={ri} className="flex-1 flex flex-col items-center gap-0.5">
            <div className="w-full flex items-end justify-center gap-0.5" style={{ height: height - 48 }}>
              {series.map((s) => {
                const val = Number(row[s.dataKey] ?? 0);
                const pct = (val / maxVal) * 100;
                return (
                  <div
                    key={s.dataKey}
                    title={`${s.label}: ${fmt(val)}`}
                    className="flex-1 rounded-t-sm transition-all duration-500 group relative cursor-default"
                    style={{
                      height: `${pct}%`,
                      backgroundColor: s.color,
                      maxWidth: series.length === 1 ? '80%' : undefined,
                      minHeight: val > 0 ? '2px' : 0,
                    }}
                  >
                    {/* Tooltip on hover */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-popover border text-popover-foreground text-[10px] rounded px-1.5 py-0.5 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10 shadow-sm">
                      {fmt(val)}
                    </div>
                  </div>
                );
              })}
            </div>
            <span className="text-[10px] text-muted-foreground text-center truncate w-full">
              {String(row[labelKey] ?? '')}
            </span>
          </div>
        ))}
      </div>
      {/* Legend */}
      {series.length > 1 && (
        <div className="flex gap-4 justify-center mt-1 flex-wrap">
          {series.map((s) => (
            <div key={s.dataKey} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
              {s.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
