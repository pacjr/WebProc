import type { ProcessoStatus } from "@/integrations/supabase/webproc-types";

export type PulseMetricBasis = "REGISTERED" | "PROTOCOLLED" | "IMPORTED";

export type PulseSnapshotMode = "ALL_IN_SCOPE" | "REGISTERED_IN_PERIOD";

export interface PulseFilter {
  periodStart: string;
  periodEnd: string;
  createdBy?: string;
  status?: ProcessoStatus[];
  /** ACTUS analytical filter only — rejected for CLIENT callers at RPC layer. */
  clienteId?: number;
}

export interface PulseSummaryPeriod {
  start: string;
  end: string;
  timezone: "America/Sao_Paulo";
}

export interface PulseSummaryLifecycle {
  registered_count: number;
  protocolled_count: number;
  imported_count: number;
}

export type PulseStatusCounts = Partial<Record<ProcessoStatus, number>>;

export interface PulseSummary {
  scope_label: string;
  period: PulseSummaryPeriod;
  lifecycle_in_period: PulseSummaryLifecycle;
  snapshot: {
    mode: PulseSnapshotMode;
    status_counts: PulseStatusCounts;
  };
}

export interface PulseDailyPoint {
  business_date: string;
  registered_count: number;
  protocolled_count: number;
  imported_count: number;
}

export interface PulseUserAggregate {
  cliente_id: number;
  user_id: string;
  display_name: string;
  membership_active: boolean;
  count: number;
}

export interface PulseClientAggregate {
  cliente_id: number;
  cliente_nome: string;
  cliente_ativo: boolean;
  count: number;
}

export interface PulseDrilldownRow {
  id_proc: number;
  cliente_id: number;
  cliente_nome: string;
  created_at: string;
  pendente_at: string | null;
  importado_at: string | null;
  status: ProcessoStatus;
  created_by: string;
  author_display_name: string;
  author_membership_active: boolean;
  n_processo: string | null;
  exec_prov: string | null;
  reclamante: string | null;
  dt_fatal: string | null;
}

export interface PulseDrilldownParams extends PulseFilter {
  lifecycleBasis?: PulseMetricBasis;
  limit?: number;
  cursorCreatedAt?: string | null;
  cursorIdProc?: number | null;
}
