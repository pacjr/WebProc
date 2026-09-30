import { useQuery } from "@tanstack/react-query";
import { fetchAdminClientMemberships } from "@/integrations/supabase/admin-api";

export function adminClientMembershipsQueryKey(clienteId: number) {
  return ["admin", "client-memberships", clienteId] as const;
}

export function useAdminClientMembershipsQuery(
  clienteId: number | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey:
      clienteId === null
        ? (["admin", "client-memberships", "none"] as const)
        : adminClientMembershipsQueryKey(clienteId),
    queryFn: async () => {
      if (clienteId === null) {
        return [];
      }
      const { memberships, error } = await fetchAdminClientMemberships(clienteId);
      if (error) {
        throw error;
      }
      return memberships;
    },
    enabled: enabled && clienteId !== null,
    retry: 1,
  });
}
