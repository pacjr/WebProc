import { Link } from "react-router-dom";
import type { PulseStatusCounts } from "@/integrations/supabase/pulse-types";
import type { ProcessoStatus } from "@/integrations/supabase/webproc-types";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { pulseLinkToProcessosList } from "@/lib/pulse-processos-links";
import {
  operationalAccentByRole,
  operationalCardShellClassName,
  operationalCockpitMetricGridClassName,
} from "@/lib/operational-visual-language";
import {
  PROCESSO_STATUS_LABELS,
  PROCESSO_STATUS_ORDER,
} from "@/lib/webproc-status-labels";

const PRIORITY_STATUSES: ProcessoStatus[] = ["EM_PREENCHIMENTO", "PENDENTE"];

function SituationMetric({
  status,
  value,
}: {
  status: ProcessoStatus;
  value: number;
}) {
  const label = PROCESSO_STATUS_LABELS[status];
  const to = pulseLinkToProcessosList({ status });

  return (
    <Link
      to={to}
      className={cn(
        "rounded-md border border-border/80 bg-background/80 px-3 py-2 transition-colors",
        "hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold tabular-nums text-foreground">{value}</p>
    </Link>
  );
}

function StaticMetric({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-md border border-border/80 bg-background/80 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      {hint ? <p className="sr-only">{hint}</p> : null}
      <p className="text-xl font-bold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

export function PulseCurrentSituation({
  statusCounts,
  isLoading,
}: {
  statusCounts: PulseStatusCounts | undefined;
  isLoading: boolean;
}) {
  const accent = operationalAccentByRole.prazos;
  const counts = statusCounts ?? {};

  const total = PROCESSO_STATUS_ORDER.reduce(
    (sum, status) => sum + (counts[status] ?? 0),
    0,
  );

  const secondaryStatuses = PROCESSO_STATUS_ORDER.filter(
    (s) => !PRIORITY_STATUSES.includes(s),
  );

  return (
    <section
      aria-labelledby="pulse-current-situation-heading"
      className={cn(operationalCardShellClassName, accent.topBorder)}
    >
      <div className={cn("border-b border-border/70 px-4 py-3 sm:px-5", accent.headerTint)}>
        <h2
          id="pulse-current-situation-heading"
          className={cn("font-serif text-base font-semibold", accent.titleAccent)}
        >
          Situação operacional atual
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Estado corrente no escopo visível — independente do período dos filtros.{" "}
          <span className="text-foreground/80">
            “Total no escopo” não é o mesmo que “Cadastradas” no fluxo do período.
          </span>
        </p>
      </div>
      <div className="space-y-3 px-4 py-4 sm:px-5">
        {isLoading && !statusCounts ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            <div className={operationalCockpitMetricGridClassName}>
              {PRIORITY_STATUSES.map((status) => (
                <SituationMetric
                  key={status}
                  status={status}
                  value={counts[status] ?? 0}
                />
              ))}
              <StaticMetric
                label="Total no escopo"
                value={total}
                hint="Contagem atual por status no escopo; não soma cadastros do período selecionado."
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {secondaryStatuses.map((status) => (
                <Link
                  key={status}
                  to={pulseLinkToProcessosList({ status })}
                  className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-muted/20 px-2.5 py-1 text-xs hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="text-muted-foreground">{PROCESSO_STATUS_LABELS[status]}</span>
                  <span className="font-semibold tabular-nums">{counts[status] ?? 0}</span>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
