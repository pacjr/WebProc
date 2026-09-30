import { webprocDb } from "@/integrations/supabase/webproc-client";
import type { AdminCliente } from "@/integrations/supabase/admin-types";

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

/** Authoritative client list for Actus ADMIN (webproc.admin_list_clientes). */
export async function fetchAdminClientes(): Promise<{
  clientes: AdminCliente[];
  error: Error | null;
}> {
  const { data, error } = await webprocDb().rpc("admin_list_clientes");

  if (error) {
    console.error("Erro ao listar clientes (admin):", error);
    return { clientes: [], error: new Error(error.message) };
  }

  return { clientes: (data ?? []) as AdminCliente[], error: null };
}
