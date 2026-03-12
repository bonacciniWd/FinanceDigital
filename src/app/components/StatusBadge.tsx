/**
 * @module StatusBadge
 * @description Badge colorido para status de cliente/parcela.
 *
 * Mapeia os status `em_dia`, `a_vencer` e `vencido` para
 * cores (verde, amarelo, vermelho) com indicador circular.
 *
 * @param props.status - Status a exibir: 'em_dia' | 'a_vencer' | 'vencido'
 * @returns Badge estilizado com cor e label correspondente
 */
import { Badge } from './ui/badge';

interface StatusBadgeProps {
  status: 'em_dia' | 'a_vencer' | 'vencido';
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = {
    em_dia: {
      label: 'EM DIA',
      className: 'bg-emerald-100/80 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 hover:bg-emerald-100/80 dark:hover:bg-emerald-900/30',
      dot: 'bg-emerald-500',
    },
    a_vencer: {
      label: 'À VENCER',
      className: 'bg-amber-100/80 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 hover:bg-amber-100/80 dark:hover:bg-amber-900/30',
      dot: 'bg-amber-500',
    },
    vencido: {
      label: 'VENCIDO',
      className: 'bg-red-100/80 text-red-700 dark:bg-red-900/30 dark:text-red-300 hover:bg-red-100/80 dark:hover:bg-red-900/30',
      dot: 'bg-red-500',
    },
  };

  const { label, className, dot } = config[status];

  return (
    <Badge className={className}>
      <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${dot}`} />
      {label}
    </Badge>
  );
}
