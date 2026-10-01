import type { ProcessoStatus } from "@/integrations/supabase/webproc-types";
import {
  buildProcessosListSearchParams,
  PROCESSOS_LIST_DEFAULT_PAGE_SIZE,
  type ProcessosListFatalFilter,
} from "@/lib/webproc-processos-list-query";

export function pulseLinkToProcessosList(options?: {
  status?: ProcessoStatus | null;
  fatal?: ProcessosListFatalFilter;
}): string {
  const params = buildProcessosListSearchParams({
    page: 1,
    pageSize: PROCESSOS_LIST_DEFAULT_PAGE_SIZE,
    status: options?.status ?? null,
    fatal: options?.fatal ?? "todas",
    q: "",
    sort: "recent",
  });
  const qs = params.toString();
  return qs ? `/app/processos?${qs}` : "/app/processos";
}
