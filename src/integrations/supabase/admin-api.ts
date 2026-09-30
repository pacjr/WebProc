import { webprocDb } from "@/integrations/supabase/webproc-client";

/**
 * Actus ADMIN capability for navigation/gating (WP-04B.0).
 * Not authorization for admin mutations — admin_* RPCs enforce assert_actus_admin().
 */
export async function fetchActusAdminCapability(): Promise<boolean> {
  const { data, error } = await webprocDb().rpc("is_active_connect_actus_admin");

  if (error) {
    console.error("Erro ao resolver capacidade Actus ADMIN:", error);
    return false;
  }

  return data === true;
}
