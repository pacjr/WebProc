import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fetchPulseSummary } from "@/integrations/supabase/pulse-api";
import type { ConnectAccess } from "@/lib/connect-access";
import {
  pulseDraftToApiFilter,
  type PulseFilterDraft,
} from "@/hooks/usePulseFilters";

export function usePulseSummaryQuery(
  connectAccess: ConnectAccess,
  applied: PulseFilterDraft,
) {
  const actor =
    connectAccess.kind === "CLIENT" || connectAccess.kind === "ACTUS"
      ? connectAccess.kind
      : null;

  const filter = actor ? pulseDraftToApiFilter(applied, actor) : null;

  return useQuery({
    queryKey: ["pulse", "summary", actor, applied] as const,
    queryFn: async () => {
      if (!filter) {
        throw new Error("Pulse indisponível para este perfil.");
      }
      const { summary, error } = await fetchPulseSummary(filter);
      if (error) {
        throw new Error(error.message ?? "Erro ao carregar resumo Pulse.");
      }
      if (!summary) {
        throw new Error("Resposta vazia do resumo Pulse.");
      }
      return summary;
    },
    enabled: actor != null,
    placeholderData: keepPreviousData,
  });
}
