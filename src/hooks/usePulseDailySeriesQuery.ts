import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fetchPulseDailySeries } from "@/integrations/supabase/pulse-api";
import type { ConnectAccess } from "@/lib/connect-access";
import {
  pulseDraftToApiFilter,
  type PulseFilterDraft,
} from "@/hooks/usePulseFilters";

export function usePulseDailySeriesQuery(
  connectAccess: ConnectAccess,
  applied: PulseFilterDraft,
) {
  const actor =
    connectAccess.kind === "CLIENT" || connectAccess.kind === "ACTUS"
      ? connectAccess.kind
      : null;

  const filter = actor ? pulseDraftToApiFilter(applied, actor) : null;

  return useQuery({
    queryKey: ["pulse", "daily-series", actor, applied] as const,
    queryFn: async () => {
      if (!filter) {
        throw new Error("Pulse indisponível para este perfil.");
      }
      const { points, error } = await fetchPulseDailySeries(filter);
      if (error) {
        throw new Error(error.message ?? "Erro ao carregar série diária Pulse.");
      }
      return points;
    },
    enabled: actor != null,
    placeholderData: keepPreviousData,
  });
}
