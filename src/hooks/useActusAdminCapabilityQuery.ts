import { useQuery } from "@tanstack/react-query";
import { fetchActusAdminCapability } from "@/integrations/supabase/admin-api";
import type { ConnectAccess } from "@/lib/connect-access";

export function useActusAdminCapabilityQuery(
  connectAccess: ConnectAccess,
  userId: string | undefined,
) {
  const isActus = connectAccess.kind === "ACTUS";

  return useQuery({
    queryKey: ["actus", "admin-capability", userId ?? "none"] as const,
    queryFn: fetchActusAdminCapability,
    enabled: isActus && Boolean(userId),
    staleTime: 0,
    refetchOnMount: "always",
    retry: 1,
  });
}
