import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fetchPulseByUser } from "@/integrations/supabase/pulse-api";
import type { ConnectAccess } from "@/lib/connect-access";
import {
  pulseDraftToApiFilter,
  type PulseFilterDraft,
} from "@/hooks/usePulseFilters";

const REGISTERED_BASIS = "REGISTERED" as const;

export function usePulseByUserQuery(
  connectAccess: ConnectAccess,
  applied: PulseFilterDraft,
) {
  const actor =
    connectAccess.kind === "CLIENT" || connectAccess.kind === "ACTUS"
      ? connectAccess.kind
      : null;

  const filter = actor ? pulseDraftToApiFilter(applied, actor) : null;

  return useQuery({
    queryKey: ["pulse", "by-user", actor, applied] as const,
    queryFn: async () => {
      if (!filter) {
        throw new Error("Pulse indisponível para este perfil.");
      }
      const { rows, error } = await fetchPulseByUser(filter, REGISTERED_BASIS);
      if (error) {
        throw new Error(error.message ?? "Erro ao carregar distribuição por usuário.");
      }
      return rows;
    },
    enabled: actor != null,
    placeholderData: keepPreviousData,
  });
}
