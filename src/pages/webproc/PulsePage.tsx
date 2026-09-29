import { useCallback, useMemo } from "react";
import { AlertCircle } from "lucide-react";
import { useWebProc } from "@/contexts/WebProcContext";
import { PulseFilters } from "@/components/pulse/PulseFilters";
import { PulseByClientTable } from "@/components/pulse/PulseByClientTable";
import { PulseByUserTable } from "@/components/pulse/PulseByUserTable";
import { PulseDrilldownTable } from "@/components/pulse/PulseDrilldownTable";
import { PulseDailyChart } from "@/components/pulse/PulseDailyChart";
import { PulseSummaryKpis } from "@/components/pulse/PulseSummaryKpis";
import { usePulseFilters } from "@/hooks/usePulseFilters";
import { usePulseByClientQuery } from "@/hooks/usePulseByClientQuery";
import { usePulseByUserQuery } from "@/hooks/usePulseByUserQuery";
import { usePulseDrilldownQuery } from "@/hooks/usePulseDrilldownQuery";
import { usePulseDailySeriesQuery } from "@/hooks/usePulseDailySeriesQuery";
import { usePulseSummaryQuery } from "@/hooks/usePulseSummaryQuery";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  formatPeriodRangeLabel,
  pulseTimezoneParenthetical,
} from "@/lib/pulse-dates";
import { sumRegisteredAggregateCounts } from "@/lib/pulse-participation";

export default function PulsePage() {
  const { connectAccess, membership } = useWebProc();
  const isActus = connectAccess.kind === "ACTUS";
  const isClient = connectAccess.kind === "CLIENT";

  const {
    draft,
    applied,
    applyError,
    setPreset,
    setPeriodRange,
    setClienteId,
    setCreatedBy,
    toggleStatus,
    clearStatuses,
    applyFilters,
  } = usePulseFilters();

  const summaryQuery = usePulseSummaryQuery(connectAccess, applied);
  const dailySeriesQuery = usePulseDailySeriesQuery(connectAccess, applied);
  const byUserQuery = usePulseByUserQuery(connectAccess, applied);
  const byClientQuery = usePulseByClientQuery(connectAccess, applied);
  const drilldownQuery = usePulseDrilldownQuery(connectAccess, applied);

  const drilldownRows = useMemo(
    () => drilldownQuery.data?.pages.flat() ?? [],
    [drilldownQuery.data?.pages],
  );

  const clienteLabelById = useMemo(() => {
    const map = new Map<number, string>();
    for (const row of byClientQuery.data ?? []) {
      const nome = row.cliente_nome?.trim();
      if (nome) {
        map.set(row.cliente_id, nome);
      }
    }
    return map;
  }, [byClientQuery.data]);

  const byUserRegisteredTotal = useMemo(
    () => sumRegisteredAggregateCounts(byUserQuery.data ?? []),
    [byUserQuery.data],
  );

  const actusClienteLabelContext = useMemo((): "loading" | "ready" | "unavailable" | null => {
    if (!isActus) return null;
    if (byClientQuery.isError) return "unavailable";
    if (byClientQuery.data !== undefined) return "ready";
    if (byClientQuery.isLoading || byClientQuery.isFetching) return "loading";
    return "ready";
  }, [
    isActus,
    byClientQuery.data,
    byClientQuery.isError,
    byClientQuery.isLoading,
    byClientQuery.isFetching,
  ]);

  const handleApply = useCallback(() => {
    applyFilters();
  }, [applyFilters]);

  const isApplying =
    summaryQuery.isFetching ||
    dailySeriesQuery.isFetching ||
    byUserQuery.isFetching ||
    (isActus && byClientQuery.isFetching) ||
    (drilldownQuery.isFetching && !drilldownQuery.isFetchingNextPage);

  const drilldownRefetching =
    drilldownQuery.isFetching && !drilldownQuery.isLoading && !drilldownQuery.isFetchingNextPage;

  const periodLabel = formatPeriodRangeLabel(applied.periodStart, applied.periodEnd);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-serif text-2xl sm:text-3xl font-bold text-primary">ACTUS PULSE</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
          Visibilidade analítica sobre as demandas do Actus Connect no seu escopo autorizado —
          métricas e tendências determinísticas, sem substituir a lista operacional de processos.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Período aplicado: {`${periodLabel} ${pulseTimezoneParenthetical()}`}
          {isClient && membership ? ` · ${membership.cliente.nome}` : null}
          {isActus && applied.clienteId != null ? " · Cliente filtrado na supervisão" : null}
        </p>
      </header>

      <PulseFilters
        isActus={isActus}
        draft={draft}
        applyError={applyError}
        isApplying={isApplying}
        clientMembershipClienteId={
          isClient ? membership?.clienteId : undefined
        }
        onPreset={setPreset}
        onPeriodRange={setPeriodRange}
        onClienteId={setClienteId}
        onCreatedBy={setCreatedBy}
        onToggleStatus={toggleStatus}
        onClearStatuses={clearStatuses}
        onApply={handleApply}
      />

      <section aria-labelledby="pulse-summary-heading">
        <h2 id="pulse-summary-heading" className="mb-4 text-lg font-semibold">
          Indicadores
        </h2>

        {summaryQuery.isError ? (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Não foi possível carregar o resumo</AlertTitle>
            <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>
                {summaryQuery.error instanceof Error
                  ? summaryQuery.error.message
                  : "Erro desconhecido"}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void summaryQuery.refetch()}
              >
                Tentar novamente
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        <PulseSummaryKpis
          summary={summaryQuery.data}
          isLoading={summaryQuery.isLoading}
          isFetching={summaryQuery.isFetching}
        />
      </section>

      <PulseDailyChart
        points={dailySeriesQuery.data}
        isLoading={dailySeriesQuery.isLoading}
        isFetching={dailySeriesQuery.isFetching}
        isError={dailySeriesQuery.isError}
        error={
          dailySeriesQuery.error instanceof Error ? dailySeriesQuery.error : null
        }
        onRetry={() => void dailySeriesQuery.refetch()}
      />

      <PulseByUserTable
        rows={byUserQuery.data}
        isActus={isActus}
        clienteLabelById={isActus ? clienteLabelById : undefined}
        actusClienteLabelContext={
          isActus && byUserRegisteredTotal > 0 ? actusClienteLabelContext : null
        }
        isLoading={byUserQuery.isLoading}
        isFetching={byUserQuery.isFetching}
        isError={byUserQuery.isError}
        error={byUserQuery.error instanceof Error ? byUserQuery.error : null}
        onRetry={() => void byUserQuery.refetch()}
      />

      {isActus ? (
        <PulseByClientTable
          rows={byClientQuery.data}
          isLoading={byClientQuery.isLoading}
          isFetching={byClientQuery.isFetching}
          isError={byClientQuery.isError}
          error={byClientQuery.error instanceof Error ? byClientQuery.error : null}
          onRetry={() => void byClientQuery.refetch()}
        />
      ) : null}

      <PulseDrilldownTable
        rows={drilldownRefetching ? [] : drilldownRows}
        isActus={isActus}
        isLoading={drilldownQuery.isLoading}
        isRefetching={drilldownRefetching}
        isError={drilldownQuery.isError}
        error={drilldownQuery.error instanceof Error ? drilldownQuery.error : null}
        onRetry={() => void drilldownQuery.refetch()}
        hasNextPage={drilldownQuery.hasNextPage ?? false}
        isFetchingNextPage={drilldownQuery.isFetchingNextPage}
        isFetchNextPageError={drilldownQuery.isFetchNextPageError}
        fetchNextPageError={
          drilldownQuery.isFetchNextPageError && drilldownQuery.error instanceof Error
            ? drilldownQuery.error
            : null
        }
        onLoadMore={() => void drilldownQuery.fetchNextPage()}
        onRetryLoadMore={() => void drilldownQuery.fetchNextPage()}
      />
    </div>
  );
}
