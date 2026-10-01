import type { ComponentProps } from "react";
import type { PulseSummaryLifecycle } from "@/integrations/supabase/pulse-types";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  operationalAnalyticsAccent,
  operationalCardShellClassName,
  operationalCockpitMetricGridClassName,
} from "@/lib/operational-visual-language";
import { PulseDailyChart } from "@/components/pulse/PulseDailyChart";

function FlowMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border/80 bg-background/60 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold tabular-nums text-primary">{value}</p>
    </div>
  );
}

export function PulsePeriodFlowSection({
  lifecycle,
  timezone,
  isLoadingLifecycle,
  dailyChartProps,
}: {
  lifecycle: PulseSummaryLifecycle | undefined;
  timezone: string;
  isLoadingLifecycle: boolean;
  dailyChartProps: ComponentProps<typeof PulseDailyChart>;
}) {
  return (
    <section aria-labelledby="pulse-period-flow-heading">
      <div className={cn(operationalCardShellClassName, operationalAnalyticsAccent.topBorder)}>
        <div
          className={cn(
            "border-b border-border/70 px-4 py-3 sm:px-5",
            operationalAnalyticsAccent.headerTint,
          )}
        >
          <h2
            id="pulse-period-flow-heading"
            className="font-serif text-base font-semibold text-foreground"
          >
            Fluxo no período selecionado
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Eventos datados no intervalo aplicado ({timezone}) — volume e cadastros diários no
            período; não reflete a situação operacional atual acima.
          </p>
        </div>

        <div className="px-4 py-4 sm:px-5">
          {isLoadingLifecycle && !lifecycle ? (
            <Skeleton className="mb-4 h-16 w-full" />
          ) : lifecycle ? (
            <div className={cn(operationalCockpitMetricGridClassName, "sm:grid-cols-3")}>
              <FlowMetric label="Cadastradas" value={lifecycle.registered_count} />
              <FlowMetric label="Protocoladas" value={lifecycle.protocolled_count} />
              <FlowMetric label="Importadas" value={lifecycle.imported_count} />
            </div>
          ) : null}
        </div>

        <div className="border-t border-border/70 bg-muted/[0.12] px-4 py-4 sm:px-5">
          <PulseDailyChart
            {...dailyChartProps}
            embedded
            unifiedInPeriodFlow
          />
        </div>
      </div>
    </section>
  );
}
