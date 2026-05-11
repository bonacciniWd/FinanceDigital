/**
 * @module PeriodoSelector
 * @description Filtro de período reutilizável: presets rápidos + range custom.
 *
 * Presets: Hoje, 7d, 30d, Mês atual, Mês anterior, Trimestre.
 * Custom: dois date pickers (Início/Fim).
 *
 * Uso:
 *   const [periodo, setPeriodo] = useState<PeriodoRange>(() => getPresetRange('30d'));
 *   <PeriodoSelector value={periodo} onChange={setPeriodo} />
 */
import { useState } from 'react';
import { CalendarIcon } from 'lucide-react';
import {
  startOfDay,
  endOfDay,
  subDays,
  startOfMonth,
  endOfMonth,
  subMonths,
  startOfQuarter,
  endOfQuarter,
  format,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Calendar } from './ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

export type PeriodoPreset =
  | 'hoje'
  | '7d'
  | '30d'
  | 'mes-atual'
  | 'mes-anterior'
  | 'trimestre'
  | 'custom';

export interface PeriodoRange {
  from: Date;
  to: Date;
  preset: PeriodoPreset;
}

export function getPresetRange(preset: PeriodoPreset, ref: Date = new Date()): PeriodoRange {
  switch (preset) {
    case 'hoje':
      return { from: startOfDay(ref), to: endOfDay(ref), preset };
    case '7d':
      return { from: startOfDay(subDays(ref, 6)), to: endOfDay(ref), preset };
    case '30d':
      return { from: startOfDay(subDays(ref, 29)), to: endOfDay(ref), preset };
    case 'mes-atual':
      return { from: startOfMonth(ref), to: endOfDay(ref), preset };
    case 'mes-anterior': {
      const prev = subMonths(ref, 1);
      return { from: startOfMonth(prev), to: endOfMonth(prev), preset };
    }
    case 'trimestre':
      return { from: startOfQuarter(ref), to: endOfQuarter(ref), preset };
    case 'custom':
    default:
      return { from: startOfDay(subDays(ref, 29)), to: endOfDay(ref), preset: 'custom' };
  }
}

const PRESETS: { value: Exclude<PeriodoPreset, 'custom'>; label: string }[] = [
  { value: 'hoje', label: 'Hoje' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: 'mes-atual', label: 'Mês atual' },
  { value: 'mes-anterior', label: 'Mês anterior' },
  { value: 'trimestre', label: 'Trimestre' },
];

interface PeriodoSelectorProps {
  value: PeriodoRange;
  onChange: (range: PeriodoRange) => void;
  className?: string;
  compact?: boolean;
}

export function PeriodoSelector({
  value,
  onChange,
  className = '',
  compact = false,
}: PeriodoSelectorProps) {
  const [openCustom, setOpenCustom] = useState(false);

  const handlePreset = (p: Exclude<PeriodoPreset, 'custom'>) => {
    onChange(getPresetRange(p));
    setOpenCustom(false);
  };

  const handleCustomFrom = (d?: Date) => {
    if (!d) return;
    onChange({ from: startOfDay(d), to: value.to, preset: 'custom' });
  };
  const handleCustomTo = (d?: Date) => {
    if (!d) return;
    onChange({ from: value.from, to: endOfDay(d), preset: 'custom' });
  };

  return (
    <div className={`flex flex-wrap items-end gap-2 ${className}`}>
      <div className="flex flex-wrap gap-1">
        {PRESETS.map((p) => (
          <Button
            key={p.value}
            size={compact ? 'sm' : 'default'}
            variant={value.preset === p.value ? 'default' : 'outline'}
            onClick={() => handlePreset(p.value)}
            className={compact ? 'h-8 text-xs px-2.5' : ''}
          >
            {p.label}
          </Button>
        ))}
        <Button
          size={compact ? 'sm' : 'default'}
          variant={value.preset === 'custom' ? 'default' : 'outline'}
          onClick={() => setOpenCustom((v) => !v)}
          className={compact ? 'h-8 text-xs px-2.5' : ''}
        >
          <CalendarIcon className="mr-1 h-3.5 w-3.5" />
          Custom
        </Button>
      </div>

      {(openCustom || value.preset === 'custom') && (
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Início</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size={compact ? 'sm' : 'default'}
                  className={`justify-start text-left font-normal ${compact ? 'h-8 text-xs' : 'w-[160px]'}`}
                >
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {format(value.from, 'dd/MM/yyyy', { locale: ptBR })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={value.from}
                  onSelect={handleCustomFrom}
                  locale={ptBR}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Fim</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size={compact ? 'sm' : 'default'}
                  className={`justify-start text-left font-normal ${compact ? 'h-8 text-xs' : 'w-[160px]'}`}
                >
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {format(value.to, 'dd/MM/yyyy', { locale: ptBR })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={value.to}
                  onSelect={handleCustomTo}
                  locale={ptBR}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      )}
    </div>
  );
}
