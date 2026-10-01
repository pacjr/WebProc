import type { ProcessoStatus } from "@/integrations/supabase/webproc-types";
import { getBusinessDateToday } from "@/integrations/supabase/webproc-validation";

export const PROCESSOS_LIST_PAGE_SIZES = [10, 20, 50] as const;
export type ProcessosListPageSize = (typeof PROCESSOS_LIST_PAGE_SIZES)[number];

export const PROCESSOS_LIST_DEFAULT_PAGE_SIZE: ProcessosListPageSize = 20;

export type ProcessosListFatalFilter = "todas" | "hoje" | "vencidas" | "futuras";

export type ProcessosListSort = "recent" | "dt_fatal";

export type ProcessosListQuery = {
  page: number;
  pageSize: ProcessosListPageSize;
  status: ProcessoStatus | null;
  fatal: ProcessosListFatalFilter;
  q: string;
  sort: ProcessosListSort;
};

const STATUS_VALUES: ProcessoStatus[] = [
  "EM_PREENCHIMENTO",
  "PENDENTE",
  "IMPORTADO",
  "CONCLUIDO",
  "CANCELADO",
];

function parsePageSize(raw: string | null): ProcessosListPageSize {
  const n = Number(raw);
  if (n === 10 || n === 20 || n === 50) {
    return n;
  }
  return PROCESSOS_LIST_DEFAULT_PAGE_SIZE;
}

function parseStatus(raw: string | null): ProcessoStatus | null {
  if (!raw || raw === "todos") {
    return null;
  }
  return STATUS_VALUES.includes(raw as ProcessoStatus) ? (raw as ProcessoStatus) : null;
}

function parseFatal(raw: string | null): ProcessosListFatalFilter {
  if (raw === "hoje" || raw === "vencidas" || raw === "futuras") {
    return raw;
  }
  return "todas";
}

function parseSort(raw: string | null): ProcessosListSort {
  return raw === "dt_fatal" ? "dt_fatal" : "recent";
}

export function parseProcessosListSearchParams(
  params: URLSearchParams,
): ProcessosListQuery {
  const pageRaw = Number(params.get("page") ?? "1");
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.trunc(pageRaw) : 1;

  return {
    page,
    pageSize: parsePageSize(params.get("pageSize")),
    status: parseStatus(params.get("status")),
    fatal: parseFatal(params.get("fatal")),
    q: (params.get("q") ?? "").trim(),
    sort: parseSort(params.get("sort")),
  };
}

export function buildProcessosListSearchParams(
  query: ProcessosListQuery,
): URLSearchParams {
  const params = new URLSearchParams();

  if (query.page !== 1) {
    params.set("page", String(query.page));
  }
  if (query.pageSize !== PROCESSOS_LIST_DEFAULT_PAGE_SIZE) {
    params.set("pageSize", String(query.pageSize));
  }
  if (query.status) {
    params.set("status", query.status);
  }
  if (query.fatal !== "todas") {
    params.set("fatal", query.fatal);
  }
  if (query.q) {
    params.set("q", query.q);
  }
  if (query.sort !== "recent") {
    params.set("sort", query.sort);
  }

  return params;
}

export function processosListQueryHasFilters(query: ProcessosListQuery): boolean {
  return Boolean(
    query.status || query.fatal !== "todas" || query.q.length > 0 || query.sort !== "recent",
  );
}

export function computePageCount(total: number, pageSize: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.ceil(total / pageSize);
}

export function formatProcessosPageRange(
  page: number,
  pageSize: number,
  total: number,
): string {
  if (total <= 0) {
    return "0 protocolos";
  }
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return `${from}–${to} de ${total} protocolo${total === 1 ? "" : "s"}`;
}

/** Business-day bounds for dt_fatal filters (America/Sao_Paulo, -03:00 storage convention). */
export function businessDayStartIso(dateYmd: string): string {
  return `${dateYmd}T00:00:00-03:00`;
}

export function nextBusinessDayYmd(dateYmd: string): string {
  const [year, month, day] = dateYmd.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + 1));
  return utc.toISOString().slice(0, 10);
}

export function getDtFatalFilterBounds(fatal: ProcessosListFatalFilter) {
  const today = getBusinessDateToday();
  const start = businessDayStartIso(today);
  const endExclusive = businessDayStartIso(nextBusinessDayYmd(today));
  return { today, start, endExclusive };
}

export function escapePostgrestIlikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}
