import { webprocDb } from "@/integrations/supabase/webproc-client";
import type {
  PulseClientAggregate,
  PulseDailyPoint,
  PulseDrilldownParams,
  PulseDrilldownRow,
  PulseFilter,
  PulseMetricBasis,
  PulseSnapshotMode,
  PulseSummary,
  PulseUserAggregate,
} from "@/integrations/supabase/pulse-types";

function toStatusArray(status?: PulseFilter["status"]): string[] | undefined {
  if (!status?.length) return undefined;
  return status;
}

function baseArgs(filter: PulseFilter) {
  return {
    p_period_start: filter.periodStart,
    p_period_end: filter.periodEnd,
    p_created_by: filter.createdBy ?? undefined,
    p_status: toStatusArray(filter.status) ?? undefined,
    p_cliente_id: filter.clienteId ?? undefined,
  };
}

export async function fetchPulseSummary(
  filter: PulseFilter,
  snapshotMode: PulseSnapshotMode = "ALL_IN_SCOPE",
) {
  const { data, error } = await webprocDb().rpc("pulse_summary", {
    ...baseArgs(filter),
    p_snapshot_mode: snapshotMode,
  });

  return {
    summary: (data ?? null) as PulseSummary | null,
    error,
  };
}

export async function fetchPulseDailySeries(filter: PulseFilter) {
  const { data, error } = await webprocDb().rpc("pulse_daily_series", baseArgs(filter));

  return {
    points: (data ?? []) as PulseDailyPoint[],
    error,
  };
}

export async function fetchPulseByUser(filter: PulseFilter, metricBasis: PulseMetricBasis) {
  const { data, error } = await webprocDb().rpc("pulse_by_user", {
    p_metric_basis: metricBasis,
    ...baseArgs(filter),
  });

  return {
    rows: (data ?? []) as PulseUserAggregate[],
    error,
  };
}

export async function fetchPulseByClient(filter: PulseFilter, metricBasis: PulseMetricBasis) {
  const { data, error } = await webprocDb().rpc("pulse_by_client", {
    p_metric_basis: metricBasis,
    ...baseArgs(filter),
  });

  return {
    rows: (data ?? []) as PulseClientAggregate[],
    error,
  };
}

export async function fetchPulseDrilldown(params: PulseDrilldownParams) {
  const { lifecycleBasis = "REGISTERED", limit = 25, cursorCreatedAt, cursorIdProc, ...filter } =
    params;

  const { data, error } = await webprocDb().rpc("pulse_drilldown", {
    ...baseArgs(filter),
    p_lifecycle_basis: lifecycleBasis,
    p_limit: limit,
    p_cursor_created_at: cursorCreatedAt ?? undefined,
    p_cursor_id_proc: cursorIdProc ?? undefined,
  });

  return {
    rows: (data ?? []) as PulseDrilldownRow[],
    error,
  };
}
