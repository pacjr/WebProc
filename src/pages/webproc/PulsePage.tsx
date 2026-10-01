import { useCallback, useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import { useWebProc } from "@/contexts/WebProcContext";
import { PulseFilters } from "@/components/pulse/PulseFilters";
import { PulseByClientTable } from "@/components/pulse/PulseByClientTable";
import { PulsePageHeader } from "@/components/pulse/PulsePageHeader";
import { PulseAttentionStrip } from "@/components/pulse/PulseAttentionStrip";
import { PulseCurrentSituation } from "@/components/pulse/PulseCurrentSituation";
import { PulsePeriodFlowSection } from "@/components/pulse/PulsePeriodFlowSection";
import { PulseUserDistributionChart } from "@/components/pulse/PulseUserDistributionChart";
import { PulseExploreSection } from "@/components/pulse/PulseExploreSection";
import { usePulseFilters } from "@/hooks/usePulseFilters";
import { usePulseByClientQuery } from "@/hooks/usePulseByClientQuery";
import { usePulseByUserQuery } from "@/hooks/usePulseByUserQuery";
import { usePulseDrilldownQuery } from "@/hooks/usePulseDrilldownQuery";
import { usePulseDailySeriesQuery } from "@/hooks/usePulseDailySeriesQuery";
import { usePulseSummaryQuery } from "@/hooks/usePulseSummaryQuery";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { sumRegisteredAggregateCounts } from "@/lib/pulse-participation";
import { protocoloWorkspaceClassName } from "@/lib/operational-visual-language";

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

  const [drilldownOpen, setDrilldownOpen] = useState(false);

  const summaryQuery = usePulseSummaryQuery(connectAccess, applied);
  const dailySeriesQuery = usePulseDailySeriesQuery(connectAccess, applied);
  const byUserQuery = usePulseByUserQuery(connectAccess, applied);
  const byClientQuery = usePulseByClientQuery(connectAccess, applied);
  const drilldownQuery = usePulseDrilldownQuery(connectAccess, applied, {
    enabled: drilldownOpen,
  });

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
    (drilldownOpen && drilldownQuery.isFetching && !drilldownQuery.isFetchingNextPage);

  const drilldownRefetching =
    drilldownQuery.isFetching && !drilldownQuery.isLoading && !drilldownQuery.isFetchingNextPage;

  const scopeHint = useMemo(() => {
    if (isClient && membership) {
      return membership.cliente.nome;
    }
    if (isActus && applied.clienteId != null) {
      return "Cliente filtrado na supervisão (analítico)";
    }
    if (isActus) {
      return "Supervisão Actus — todos os clientes visíveis";
    }
    return null;
  }, [isClient, isActus, membership, applied.clienteId]);

  const actusClienteScopeNote = useMemo(() => {
    if (!isActus || applied.clienteId == null) return null;
    return "Os atalhos para Protocolos abrem a grade operacional no escopo Actus completo — o filtro de cliente do Pulse não tem parâmetro equivalente na lista até uma entrega futura da grade.";
  }, [isActus, applied.clienteId]);

  const summary = summaryQuery.data;
  const fatalToday = summary?.snapshot.fatal_today_count ?? 0;
  const fatalOverdue = summary?.snapshot.fatal_overdue_count ?? 0;

  return (
    <div className={protocoloWorkspaceClassName}>
      <PulsePageHeader
        periodStart={applied.periodStart}
        periodEnd={applied.periodEnd}
        scopeHint={scopeHint}
      />

      <PulseFilters
        isActus={isActus}
        draft={draft}
        applyError={applyError}
        isApplying={isApplying}
        clientMembershipClienteId={isClient ? membership?.clienteId : undefined}
        onPreset={setPreset}
        onPeriodRange={setPeriodRange}
        onClienteId={setClienteId}
        onCreatedBy={setCreatedBy}
        onToggleStatus={toggleStatus}
        onClearStatuses={clearStatuses}
        onApply={handleApply}
      />

      {summaryQuery.isError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Não foi possível carregar o resumo operacional</AlertTitle>
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
      ) : (
        <PulseAttentionStrip
          fatalOverdue={fatalOverdue}
          fatalToday={fatalToday}
          actusClienteScopeNote={actusClienteScopeNote}
        />
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
        <div className="order-1 lg:order-1">
          <PulseCurrentSituation
            statusCounts={summary?.snapshot.status_counts}
            isLoading={summaryQuery.isLoading}
          />
        </div>
        <div className="order-3 lg:order-2">
          <PulseUserDistributionChart
            rows={byUserQuery.data}
            isActus={isActus}
            clienteLabelById={
              isActus && byUserRegisteredTotal > 0 && actusClienteLabelContext !== "ready"
                ? undefined
                : isActus
                  ? clienteLabelById
                  : undefined
            }
            isLoading={byUserQuery.isLoading}
            isFetching={byUserQuery.isFetching}
            isError={byUserQuery.isError}
            error={byUserQuery.error instanceof Error ? byUserQuery.error : null}
            onRetry={() => void byUserQuery.refetch()}
          />
        </div>
        <div className="order-2 lg:order-3 lg:col-span-2">
          <PulsePeriodFlowSection
            lifecycle={summary?.lifecycle_in_period}
            timezone={summary?.period.timezone ?? "America/Sao_Paulo"}
            isLoadingLifecycle={summaryQuery.isLoading}
            dailyChartProps={{
              points: dailySeriesQuery.data,
              isLoading: dailySeriesQuery.isLoading,
              isFetching: dailySeriesQuery.isFetching,
              isError: dailySeriesQuery.isError,
              error:
                dailySeriesQuery.error instanceof Error ? dailySeriesQuery.error : null,
              onRetry: () => void dailySeriesQuery.refetch(),
            }}
          />
        </div>
      </div>

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

      <PulseExploreSection
        onDrilldownOpenChange={setDrilldownOpen}
        drilldownProps={{
          rows: drilldownRefetching ? [] : drilldownRows,
          isActus,
          isLoading: drilldownQuery.isLoading,
          isRefetching: drilldownRefetching,
          isError: drilldownQuery.isError,
          error: drilldownQuery.error instanceof Error ? drilldownQuery.error : null,
          onRetry: () => void drilldownQuery.refetch(),
          hasNextPage: drilldownQuery.hasNextPage ?? false,
          isFetchingNextPage: drilldownQuery.isFetchingNextPage,
          isFetchNextPageError: drilldownQuery.isFetchNextPageError,
          fetchNextPageError:
            drilldownQuery.isFetchNextPageError && drilldownQuery.error instanceof Error
              ? drilldownQuery.error
              : null,
          onLoadMore: () => void drilldownQuery.fetchNextPage(),
          onRetryLoadMore: () => void drilldownQuery.fetchNextPage(),
        }}
      />
    </div>
  );
}
