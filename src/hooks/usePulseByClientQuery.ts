import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fetchPulseByClient } from "@/integrations/supabase/pulse-api";
import type { ConnectAccess } from "@/lib/connect-access";
import {
  pulseDraftToApiFilter,
  type PulseFilterDraft,
} from "@/hooks/usePulseFilters";

const REGISTERED_BASIS = "REGISTERED" as const;

export function usePulseByClientQuery(
  connectAccess: ConnectAccess,
  applied: PulseFilterDraft,
) {
  const isActus = connectAccess.kind === "ACTUS";
  const filter = isActus ? pulseDraftToApiFilter(applied, "ACTUS") : null;

  return useQuery({
    queryKey: ["pulse", "by-client", "ACTUS", applied] as const,
    queryFn: async () => {
      if (!filter) {
        throw new Error("Distribuição por cliente indisponível para este perfil.");
      }
      const { rows, error } = await fetchPulseByClient(filter, REGISTERED_BASIS);
      if (error) {
        throw new Error(error.message ?? "Erro ao carregar distribuição por cliente.");
      }
      return rows;
    },
    enabled: isActus,
    placeholderData: keepPreviousData,
  });
}
