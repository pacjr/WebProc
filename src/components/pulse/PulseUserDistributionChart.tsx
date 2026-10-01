import { useMemo } from "react";
import { AlertCircle } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { PulseUserAggregate } from "@/integrations/supabase/pulse-types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  formatRegisteredParticipation,
  sumRegisteredAggregateCounts,
} from "@/lib/pulse-participation";
import {
  operationalAnalyticsAccent,
  operationalCardShellClassName,
} from "@/lib/operational-visual-language";

const SLICE_COLORS = [
  "hsl(var(--primary))",
  "hsl(262 52% 47%)",
  "hsl(199 70% 36%)",
  "hsl(160 55% 32%)",
  "hsl(38 92% 40%)",
  "hsl(var(--muted-foreground) / 0.55)",
] as const;

const TOP_N = 5;

type SliceRow = {
  key: string;
  label: string;
  count: number;
  fill: string;
};

function buildDistributionSlices(
  rows: PulseUserAggregate[],
  isActus: boolean,
  clienteLabelById?: ReadonlyMap<number, string>,
): SliceRow[] {
  const sorted = [...rows].sort((a, b) => b.count - a.count);
  const top = sorted.slice(0, TOP_N);
  const rest = sorted.slice(TOP_N);
  const restCount = rest.reduce((sum, row) => sum + row.count, 0);

  const slices: SliceRow[] = top.map((row, index) => ({
    key: `${row.cliente_id}:${row.user_id}`,
    label: formatUserLegendLabel(row, isActus, clienteLabelById),
    count: row.count,
    fill: SLICE_COLORS[index % SLICE_COLORS.length],
  }));

  if (restCount > 0) {
    slices.push({
      key: "__outros__",
      label: `Outros (${rest.length} usuários)`,
      count: restCount,
      fill: SLICE_COLORS[5],
    });
  }

  return slices;
}

function formatUserLegendLabel(
  row: PulseUserAggregate,
  isActus: boolean,
  clienteLabelById?: ReadonlyMap<number, string>,
): string {
  const name = row.display_name?.trim() || "Usuário desconhecido";
  if (!isActus) {
    return row.membership_active ? name : `${name} (inativo)`;
  }
  const cliente =
    clienteLabelById?.get(row.cliente_id)?.trim() || `Cliente #${row.cliente_id}`;
  return `${name} · ${cliente}`;
}

interface PieTooltipProps {
  active?: boolean;
  payload?: { payload?: SliceRow }[];
}

function PieTooltipContent({ active, payload }: PieTooltipProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium">{row.label}</p>
      <p className="text-muted-foreground tabular-nums">Cadastros: {row.count}</p>
    </div>
  );
}

export function PulseUserDistributionChart({
  rows,
  isActus,
  clienteLabelById,
  isLoading,
  isFetching,
  isError,
  error,
  onRetry,
}: {
  rows: PulseUserAggregate[] | undefined;
  isActus: boolean;
  clienteLabelById?: ReadonlyMap<number, string>;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  const total = useMemo(() => sumRegisteredAggregateCounts(rows ?? []), [rows]);
  const slices = useMemo(
    () => buildDistributionSlices(rows ?? [], isActus, clienteLabelById),
    [rows, isActus, clienteLabelById],
  );

  return (
    <section aria-labelledby="pulse-distribution-heading">
      <div className={cn(operationalCardShellClassName, operationalAnalyticsAccent.topBorder)}>
        <div
          className={cn(
            "border-b border-border/70 px-4 py-3 sm:px-5",
            operationalAnalyticsAccent.headerTint,
          )}
        >
          <h2
            id="pulse-distribution-heading"
            className="font-serif text-base font-semibold text-foreground"
          >
            Distribuição por usuário
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Cadastros no período (escopo e filtros aplicados) — composição de carga, não
            avaliação de desempenho.
          </p>
          {isFetching ? (
            <p className="mt-1 text-xs text-muted-foreground" aria-live="polite">
              Atualizando…
            </p>
          ) : null}
        </div>

        <div className="px-4 py-4 sm:px-5">
          {isLoading && !rows ? (
            <Skeleton className="mx-auto h-[180px] w-full max-w-[220px]" />
          ) : isError ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Não foi possível carregar a distribuição</AlertTitle>
              <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span>{error?.message ?? "Erro desconhecido"}</span>
                <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                  Tentar novamente
                </Button>
              </AlertDescription>
            </Alert>
          ) : total === 0 ? (
            <p className="text-sm text-muted-foreground" role="status">
              Nenhum cadastro no período para distribuir.
            </p>
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <figure
                className="mx-auto h-[160px] w-full max-w-[200px] shrink-0 sm:mx-0"
                aria-label="Gráfico de distribuição de cadastros por usuário no período"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={slices}
                      dataKey="count"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      innerRadius={44}
                      outerRadius={72}
                      paddingAngle={1}
                      isAnimationActive={false}
                    >
                      {slices.map((slice) => (
                        <Cell key={slice.key} fill={slice.fill} stroke="hsl(var(--background))" />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltipContent />} />
                  </PieChart>
                </ResponsiveContainer>
              </figure>
              <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
                {slices.map((slice) => (
                  <li key={slice.key} className="flex items-start gap-2">
                    <span
                      className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: slice.fill }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-foreground">{slice.label}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {slice.count} · {formatRegisteredParticipation(slice.count, total)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
