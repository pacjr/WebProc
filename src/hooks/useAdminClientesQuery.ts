import { useQuery } from "@tanstack/react-query";
import { fetchAdminClientes } from "@/integrations/supabase/admin-api";

export function useAdminClientesQuery(adminCapabilityConfirmed: boolean) {
  return useQuery({
    queryKey: ["admin", "clientes"] as const,
    queryFn: async () => {
      const { clientes, error } = await fetchAdminClientes();
      if (error) {
        throw error;
      }
      return clientes;
    },
    enabled: adminCapabilityConfirmed,
    retry: 1,
  });
}
