import type { PulseSummary, PulseStatusCounts } from "@/integrations/supabase/pulse-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function sumStatusCounts(counts: PulseStatusCounts): number {
  return Object.values(counts).reduce<number>((total, value) => total + (value ?? 0), 0);
}

function KpiCard({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: number;
  hint?: string;
  className?: string;
}) {
  return (
    <Card className={cn("shadow-card", className)}>
      <CardHeader className="pb-2 p-4 sm:p-6">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 p-4 sm:p-6 sm:pt-0">
        <p className="text-2xl sm:text-3xl font-bold tabular-nums text-primary">{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function KpiSkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <Card key={index}>
          <CardHeader className="p-4 sm:p-6">
            <Skeleton className="h-4 w-32" />
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            <Skeleton className="h-8 w-20" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function PulseSummaryKpis({
  summary,
  isLoading,
  isFetching,
}: {
  summary: PulseSummary | undefined;
  isLoading: boolean;
  isFetching: boolean;
}) {
  if (isLoading && !summary) {
    return <KpiSkeletonGrid />;
  }

  if (!summary) {
    return null;
  }

  const lifecycle = summary.lifecycle_in_period;
  const snapshot = summary.snapshot.status_counts ?? {};
  const totalScope = sumStatusCounts(snapshot);
  const pendentes = snapshot.PENDENTE ?? 0;
  const concluidas = snapshot.CONCLUIDO ?? 0;
  const fatalToday = summary.snapshot.fatal_today_count ?? 0;
  const fatalOverdue = summary.snapshot.fatal_overdue_count ?? 0;

  return (
    <div
      className="space-y-6"
      aria-busy={isFetching}
      aria-live="polite"
    >
      {isFetching ? (
        <p className="text-xs text-muted-foreground">Atualizando indicadores…</p>
      ) : null}

      <section aria-labelledby="pulse-lifecycle-heading">
        <h2 id="pulse-lifecycle-heading" className="mb-3 text-sm font-semibold text-foreground">
          Eventos no período
        </h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Contagens por data do evento no período selecionado (fuso {summary.period.timezone}).
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard label="Cadastradas no período" value={lifecycle.registered_count} />
          <KpiCard label="Protocoladas no período" value={lifecycle.protocolled_count} />
          <KpiCard label="Importadas no período" value={lifecycle.imported_count} />
        </div>
      </section>

      <section aria-labelledby="pulse-snapshot-heading">
        <h2 id="pulse-snapshot-heading" className="mb-3 text-sm font-semibold text-foreground">
          Situação atual no escopo
        </h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Distribuição pela situação atual das demandas visíveis (não são eventos do período).
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard label="Total no escopo" value={totalScope} />
          <KpiCard label="Pendentes" value={pendentes} />
          <KpiCard label="Concluídas" value={concluidas} />
          <KpiCard
            label="Data Fatal hoje"
            value={fatalToday}
            hint="Protocolos em preenchimento ou pendente com Data Fatal hoje (escopo atual)."
          />
          <KpiCard
            label="Data Fatal vencida"
            value={fatalOverdue}
            hint="Protocolos em preenchimento ou pendente com Data Fatal anterior a hoje."
          />
        </div>
      </section>
    </div>
  );
}
