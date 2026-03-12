/**
 * @module DonutChart
 * @description Gráfico de rosca SVG para distribuições (substitui PieChart do recharts).
 * Mantém a estética limpa junto com LWC.
 */
interface Segment {
  name: string;
  value: number;
  color: string;
}

interface Props {
  data: Segment[];
  size?: number;
  showLegend?: boolean;
  formatValue?: (v: number) => string;
  centerLabel?: string;
  className?: string;
}

function polarToXY(cx: number, cy: number, r: number, angle: number) {
  return {
    x: cx + r * Math.cos(angle),
    y: cy + r * Math.sin(angle),
  };
}

function arcPath(cx: number, cy: number, r: number, ir: number, start: number, end: number, gap = 0.03) {
  const s = start + gap;
  const e = end - gap;
  if (e <= s) return '';
  const outer1 = polarToXY(cx, cy, r, s);
  const outer2 = polarToXY(cx, cy, r, e);
  const inner1 = polarToXY(cx, cy, ir, e);
  const inner2 = polarToXY(cx, cy, ir, s);
  const large = e - s > Math.PI ? 1 : 0;
  return [
    `M ${outer1.x} ${outer1.y}`,
    `A ${r} ${r} 0 ${large} 1 ${outer2.x} ${outer2.y}`,
    `L ${inner1.x} ${inner1.y}`,
    `A ${ir} ${ir} 0 ${large} 0 ${inner2.x} ${inner2.y}`,
    'Z',
  ].join(' ');
}

export function DonutChart({ data, size = 220, showLegend = true, formatValue, centerLabel, className }: Props) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) {
    return (
      <div className={`flex flex-col items-center justify-center ${className ?? ''}`} style={{ minHeight: size }}>
        <p className="text-sm text-muted-foreground">Sem dados</p>
      </div>
    );
  }

  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.38;
  const ir = size * 0.24;

  let angle = -Math.PI / 2;
  const segments = data
    .filter((d) => d.value > 0)
    .map((d) => {
      const slice = (d.value / total) * Math.PI * 2;
      const start = angle;
      angle += slice;
      return { ...d, path: arcPath(cx, cy, r, ir, start, angle) };
    });

  return (
    <div className={`flex flex-col items-center gap-4 ${className ?? ''}`}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size}>
          {segments.map((seg, i) => (
            <path key={i} d={seg.path} fill={seg.color} className="transition-opacity hover:opacity-80" />
          ))}
        </svg>
        {centerLabel && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
            style={{ fontSize: size * 0.08 }}
          >
            <span className="font-bold text-foreground leading-tight">{centerLabel}</span>
            <span className="text-muted-foreground text-xs">total</span>
          </div>
        )}
      </div>

      {showLegend && (
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5">
          {segments.map((seg) => (
            <div key={seg.name} className="flex items-center gap-1.5 text-xs">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
              <span className="text-muted-foreground">{seg.name}</span>
              <span className="font-semibold text-foreground">
                {formatValue ? formatValue(seg.value) : seg.value}
              </span>
              <span className="text-muted-foreground">({Math.round((seg.value / total) * 100)}%)</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
