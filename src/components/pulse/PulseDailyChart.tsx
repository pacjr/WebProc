import { useMemo, useState } from "react";
import { AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PulseDailyPoint } from "@/integrations/supabase/pulse-types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatBusinessDateLabel,
  formatBusinessDateShort,
} from "@/lib/pulse-dates";

function sumRegistered(points: PulseDailyPoint[]): number {
  return points.reduce((total, point) => total + (point.registered_count ?? 0), 0);
}

function xAxisTickInterval(pointCount: number): number {
  if (pointCount <= 7) return 0;
  if (pointCount <= 14) return 1;
  if (pointCount <= 31) return 2;
  if (pointCount <= 60) return 4;
  return Math.max(0, Math.floor(pointCount / 12) - 1);
}

interface DailyTooltipProps {
  active?: boolean;
  payload?: { value?: number; payload?: PulseDailyPoint }[];
}

function DailyTooltip({ active, payload }: DailyTooltipProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium text-popover-foreground">
        {formatBusinessDateLabel(row.business_date)}
      </p>
      <p className="text-muted-foreground">
        Cadastradas: {row.registered_count ?? 0}
      </p>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <Card className="shadow-card">
      <CardHeader className="p-4 sm:p-6">
        <Skeleton className="h-5 w-64" />
        <Skeleton className="mt-2 h-4 w-full max-w-xl" />
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0">
        <Skeleton className="h-[280px] w-full sm:h-[320px]" />
      </CardContent>
    </Card>
  );
}

function DailyChartBody({
  chartData,
  totalRegistered,
  tickInterval,
  isFetching,
  tableOpen,
  setTableOpen,
  compactHeight = false,
}: {
  chartData: PulseDailyPoint[];
  totalRegistered: number;
  tickInterval: number;
  isFetching: boolean;
  tableOpen: boolean;
  setTableOpen: (open: boolean) => void;
  compactHeight?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">
          Cadastros por dia no período aplicado
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Cada barra representa quantas demandas foram cadastradas (data de criação) naquele dia
          civil em America/Sao_Paulo — não mede produtividade de conclusão ou protocolo.
        </p>
        {isFetching ? (
          <p className="text-xs text-muted-foreground mt-1" aria-live="polite">
            Atualizando série…
          </p>
        ) : null}
      </div>

      {totalRegistered === 0 ? (
        <p className="text-sm text-muted-foreground" role="status">
          Nenhuma demanda cadastrada neste período.
        </p>
      ) : null}

      <figure
        className={
          compactHeight
            ? "w-full min-w-0 h-[220px] sm:h-[240px]"
            : "w-full min-w-0 h-[280px] sm:h-[320px]"
        }
        aria-label="Gráfico de barras: demandas cadastradas por dia no período aplicado"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 4, left: 0, bottom: 4 }}>
            <CartesianGrid
              stroke="hsl(var(--border))"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="business_date"
              tickFormatter={formatBusinessDateShort}
              interval={tickInterval}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              axisLine={{ stroke: "hsl(var(--border))" }}
              tickLine={{ stroke: "hsl(var(--border))" }}
            />
            <YAxis
              allowDecimals={false}
              width={36}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              axisLine={{ stroke: "hsl(var(--border))" }}
              tickLine={{ stroke: "hsl(var(--border))" }}
            />
            <Tooltip
              cursor={{ fill: "hsl(var(--muted) / 0.35)" }}
              content={<DailyTooltip />}
            />
            <Bar
              dataKey="registered_count"
              fill="hsl(var(--primary))"
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </figure>

      <Collapsible open={tableOpen} onOpenChange={setTableOpen}>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-2 px-0 text-muted-foreground hover:text-foreground"
          >
            {tableOpen ? (
              <ChevronUp className="h-4 w-4" aria-hidden />
            ) : (
              <ChevronDown className="h-4 w-4" aria-hidden />
            )}
            Ver dados
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <div className="max-h-64 overflow-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Data</TableHead>
                  <TableHead scope="col" className="text-right">
                    Demandas cadastradas
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {chartData.map((row) => (
                  <TableRow key={row.business_date}>
                    <TableCell>{formatBusinessDateLabel(row.business_date)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.registered_count ?? 0}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

export function PulseDailyChart({
  points,
  isLoading,
  isFetching,
  isError,
  error,
  onRetry,
  embedded = false,
  unifiedInPeriodFlow = false,
}: {
  points: PulseDailyPoint[] | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
  onRetry: () => void;
  /** When true, omit outer page section heading (nested in period flow). */
  embedded?: boolean;
  /** When true with embedded, render chart body only (inside parent period-flow card). */
  unifiedInPeriodFlow?: boolean;
}) {
  const [tableOpen, setTableOpen] = useState(false);

  const chartData = useMemo(() => points ?? [], [points]);
  const totalRegistered = useMemo(() => sumRegistered(chartData), [chartData]);
  const tickInterval = useMemo(
    () => xAxisTickInterval(chartData.length),
    [chartData.length],
  );

  if (isLoading && !points) {
    if (unifiedInPeriodFlow) {
      return <Skeleton className="h-[220px] w-full sm:h-[240px]" />;
    }
    return embedded ? (
      <Card className="shadow-card">
        <CardContent className="p-4 sm:p-6">
          <Skeleton className="h-[220px] w-full" />
        </CardContent>
      </Card>
    ) : (
      <ChartSkeleton />
    );
  }

  if (isError) {
    return (
      <section aria-labelledby={embedded ? undefined : "pulse-daily-heading"}>
        {embedded && !unifiedInPeriodFlow ? null : embedded ? null : (
          <h2 id="pulse-daily-heading" className="mb-4 text-lg font-semibold">
            Demandas cadastradas por dia
          </h2>
        )}
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Não foi possível carregar a série diária</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{error?.message ?? "Erro desconhecido"}</span>
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      </section>
    );
  }

  if (!points) {
    return null;
  }

  const body = (
    <DailyChartBody
      chartData={chartData}
      totalRegistered={totalRegistered}
      tickInterval={tickInterval}
      isFetching={isFetching}
      tableOpen={tableOpen}
      setTableOpen={setTableOpen}
      compactHeight={unifiedInPeriodFlow}
    />
  );

  if (unifiedInPeriodFlow) {
    return body;
  }

  const chartCard = (
    <Card className="shadow-card">
      <CardContent className="p-4 sm:p-6">{body}</CardContent>
    </Card>
  );

  if (embedded) {
    return chartCard;
  }

  return (
    <section aria-labelledby="pulse-daily-heading">
      <h2 id="pulse-daily-heading" className="mb-4 text-lg font-semibold">
        Demandas cadastradas por dia
      </h2>
      {chartCard}
    </section>
  );
}
