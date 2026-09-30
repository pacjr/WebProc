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

function firstClienteRow(data: unknown): AdminCliente {
  const rows = data as AdminCliente[] | null;
  const row = rows?.[0];
  if (!row) {
    throw new Error("empty_admin_cliente_response");
  }
  return row;
}

export async function adminCreateCliente(
  codigoCliente: number,
  nome: string,
): Promise<AdminCliente> {
  const { data, error } = await webprocDb().rpc("admin_create_cliente", {
    p_codigo_cliente: codigoCliente,
    p_nome: nome.trim(),
  });

  if (error) {
    console.error("admin_create_cliente failed", error.message);
    throw new Error(error.message);
  }

  return firstClienteRow(data);
}

export async function adminUpdateCliente(input: {
  clienteId: number;
  nome?: string;
  ativo?: boolean;
}): Promise<AdminCliente> {
  const { data, error } = await webprocDb().rpc("admin_update_cliente", {
    p_cliente_id: input.clienteId,
    p_nome: input.nome ?? undefined,
    p_ativo: input.ativo ?? undefined,
  });

  if (error) {
    console.error("admin_update_cliente failed", error.message);
    throw new Error(error.message);
  }

  return firstClienteRow(data);
}
