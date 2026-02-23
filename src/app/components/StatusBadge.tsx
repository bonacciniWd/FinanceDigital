import { Badge } from './ui/badge';

interface StatusBadgeProps {
  status: 'em_dia' | 'a_vencer' | 'vencido';
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = {
    em_dia: {
      label: 'EM DIA',
      className: 'bg-green-100 text-green-800 hover:bg-green-100',
      dot: 'bg-green-500',
    },
    a_vencer: {
      label: 'À VENCER',
      className: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100',
      dot: 'bg-yellow-500',
    },
    vencido: {
      label: 'VENCIDO',
      className: 'bg-red-100 text-red-800 hover:bg-red-100',
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
