import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchPulseDrilldown } from "@/integrations/supabase/pulse-api";
import type { PulseDrilldownRow } from "@/integrations/supabase/pulse-types";
import type { ConnectAccess } from "@/lib/connect-access";
import {
  pulseDraftToApiFilter,
  type PulseFilterDraft,
} from "@/hooks/usePulseFilters";

export const PULSE_DRILLDOWN_PAGE_SIZE = 25;

export type PulseDrilldownCursor = {
  cursorCreatedAt: string;
  cursorIdProc: number;
};

export function usePulseDrilldownQuery(
  connectAccess: ConnectAccess,
  applied: PulseFilterDraft,
) {
  const actor =
    connectAccess.kind === "CLIENT" || connectAccess.kind === "ACTUS"
      ? connectAccess.kind
      : null;

  const filter = actor ? pulseDraftToApiFilter(applied, actor) : null;

  return useInfiniteQuery({
    queryKey: ["pulse", "drilldown", actor, applied] as const,
    enabled: actor != null,
    initialPageParam: null as PulseDrilldownCursor | null,
    queryFn: async ({ pageParam }) => {
      if (!filter) {
        throw new Error("Pulse indisponível para este perfil.");
      }
      const { rows, error } = await fetchPulseDrilldown({
        ...filter,
        lifecycleBasis: "REGISTERED",
        limit: PULSE_DRILLDOWN_PAGE_SIZE,
        cursorCreatedAt: pageParam?.cursorCreatedAt ?? null,
        cursorIdProc: pageParam?.cursorIdProc ?? null,
      });
      if (error) {
        throw new Error(error.message ?? "Erro ao carregar demandas Pulse.");
      }
      return rows as PulseDrilldownRow[];
    },
    getNextPageParam: (lastPage): PulseDrilldownCursor | undefined => {
      if (lastPage.length < PULSE_DRILLDOWN_PAGE_SIZE) {
        return undefined;
      }
      const last = lastPage[lastPage.length - 1];
      if (!last) return undefined;
      return {
        cursorCreatedAt: last.created_at,
        cursorIdProc: last.id_proc,
      };
    },
  });
}
