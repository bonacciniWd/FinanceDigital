/**
 * @module DashboardSkeleton
 * @description Skeleton de carregamento para páginas de dashboard.
 *
 * Mostra placeholders animados nos lugares dos KPIs, tabelas e gráficos
 * enquanto os dados (clientes, empréstimos, parcelas, etc.) ainda estão
 * sendo carregados. Evita o efeito de "tudo zerado" antes dos hooks
 * do React Query resolverem.
 */
import { Card, CardContent, CardHeader } from './ui/card';
import { Skeleton } from './ui/skeleton';

interface DashboardSkeletonProps {
  /** Número de cards de KPI no topo (default 4) */
  kpis?: number;
  /** Mostrar área de gráficos abaixo dos KPIs (default true) */
  showCharts?: boolean;
  /** Mostrar tabela/lista grande no fim (default true) */
  showTable?: boolean;
}

export function DashboardSkeleton({
  kpis = 4,
  showCharts = true,
  showTable = true,
}: DashboardSkeletonProps) {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: kpis }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-4 rounded" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-3 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      {showCharts && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabela */}
      {showTable && (
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-48" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
                <Skeleton className="h-8 w-24" />
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
