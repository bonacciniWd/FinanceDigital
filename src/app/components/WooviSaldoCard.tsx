/**
 * @module WooviSaldoCard
 * @description Card que exibe o saldo da conta principal Woovi em tempo real.
 * Atualiza automaticamente via polling (60s).
 */
import { RefreshCw, Wallet, TrendingUp, TrendingDown, ArrowRightLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Skeleton } from './ui/skeleton';
import { useWooviDashboardStats } from '../hooks/useWoovi';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function WooviSaldoCard() {
  const { data: stats, isLoading, refetch, isFetching } = useWooviDashboardStats();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Wallet className="h-4 w-4" />
            Saldo Woovi
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-36" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Wallet className="h-4 w-4 text-emerald-500" />
          Conta Woovi
        </CardTitle>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Saldo principal */}
        <div>
          <p className="text-xs text-muted-foreground">Saldo disponível</p>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {formatCurrency(stats?.saldoConta ?? 0)}
          </p>
        </div>

        {/* Métricas */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-3.5 w-3.5 text-green-500" />
            <div>
              <p className="text-xs text-muted-foreground">Recebido</p>
              <p className="text-sm font-semibold">
                {formatCurrency(stats?.totalRecebido ?? 0)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <TrendingDown className="h-3.5 w-3.5 text-red-500" />
            <div>
              <p className="text-xs text-muted-foreground">Transferido</p>
              <p className="text-sm font-semibold">
                {formatCurrency(stats?.totalTransferido ?? 0)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ArrowRightLeft className="h-3.5 w-3.5 text-blue-500" />
            <div>
              <p className="text-xs text-muted-foreground">Splits</p>
              <p className="text-sm font-semibold">
                {formatCurrency(stats?.totalSplit ?? 0)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Wallet className="h-3.5 w-3.5 text-purple-500" />
            <div>
              <p className="text-xs text-muted-foreground">Subcontas</p>
              <p className="text-sm font-semibold">{stats?.totalSubcontas ?? 0}</p>
            </div>
          </div>
        </div>

        {/* Cobranças */}
        <div className="border-t pt-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Cobranças ativas</span>
            <span className="font-medium text-amber-600 dark:text-amber-400">
              {stats?.chargesActive ?? 0}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs mt-1">
            <span className="text-muted-foreground">Cobranças pagas</span>
            <span className="font-medium text-green-600 dark:text-green-400">
              {stats?.chargesCompleted ?? 0}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
