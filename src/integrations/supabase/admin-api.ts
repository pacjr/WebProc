import { supabase } from "@/integrations/supabase/client";
import { webprocDb } from "@/integrations/supabase/webproc-client";
import type {
  AdminCliente,
  AdminClientMembership,
  ProvisionMembershipSuccess,
} from "@/integrations/supabase/admin-types";

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

function firstMembershipRow(data: unknown): AdminClientMembership {
  const rows = data as AdminClientMembership[] | null;
  const row = rows?.[0];
  if (!row) {
    throw new Error("empty_admin_membership_response");
  }
  return row;
}

export async function fetchAdminClientMemberships(clienteId: number): Promise<{
  memberships: AdminClientMembership[];
  error: Error | null;
}> {
  const { data, error } = await webprocDb().rpc("admin_list_client_memberships", {
    p_cliente_id: clienteId,
  });

  if (error) {
    console.error("admin_list_client_memberships failed", error.message);
    return { memberships: [], error: new Error(error.message) };
  }

  return { memberships: (data ?? []) as AdminClientMembership[], error: null };
}

export async function adminCreateClientMembership(input: {
  clienteId: number;
  email: string;
  nome: string;
}): Promise<AdminClientMembership> {
  const { data, error } = await webprocDb().rpc("admin_create_client_membership", {
    p_cliente_id: input.clienteId,
    p_email: input.email.trim(),
    p_nome: input.nome.trim(),
  });

  if (error) {
    console.error("admin_create_client_membership failed", error.message);
    throw new Error(error.message);
  }

  return firstMembershipRow(data);
}

export async function adminUpdateClientMembership(input: {
  membershipId: number;
  nome: string;
}): Promise<AdminClientMembership> {
  const { data, error } = await webprocDb().rpc("admin_update_client_membership", {
    p_membership_id: input.membershipId,
    p_nome: input.nome.trim(),
  });

  if (error) {
    console.error("admin_update_client_membership failed", error.message);
    throw new Error(error.message);
  }

  return firstMembershipRow(data);
}

export async function adminSetClientMembershipActive(input: {
  membershipId: number;
  ativo: boolean;
}): Promise<AdminClientMembership> {
  const { data, error } = await webprocDb().rpc("admin_set_client_membership_active", {
    p_membership_id: input.membershipId,
    p_ativo: input.ativo,
  });

  if (error) {
    console.error("admin_set_client_membership_active failed", error.message);
    throw new Error(error.message);
  }

  return firstMembershipRow(data);
}

function isProvisionSuccess(data: unknown): data is ProvisionMembershipSuccess {
  if (!data || typeof data !== "object") return false;
  const row = data as Record<string, unknown>;
  return (
    row.success === true &&
    typeof row.membership_id === "number" &&
    typeof row.outcome === "string"
  );
}

function edgeErrorPayload(data: unknown): { code?: string; error?: string } | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  if (row.success === false) {
    return {
      code: typeof row.code === "string" ? row.code : undefined,
      error: typeof row.error === "string" ? row.error : undefined,
    };
  }
  return null;
}

async function edgeErrorPayloadFromResponse(
  response: unknown,
): Promise<{ code?: string; error?: string } | null> {
  if (!response || typeof response !== "object") return null;
  const maybeResponse = response as { json?: () => Promise<unknown>; clone?: () => Response };
  if (typeof maybeResponse.clone !== "function" || typeof maybeResponse.json !== "function") {
    return null;
  }
  try {
    const body = await maybeResponse.clone().json();
    return edgeErrorPayload(body);
  } catch {
    return null;
  }
}

/** Actus ADMIN provisioning orchestration (Edge Function authority for Auth). */
export async function provisionClientMembership(
  membershipId: number,
): Promise<ProvisionMembershipSuccess> {
  const { data, error, response } = await supabase.functions.invoke(
    "provision-client-membership",
    {
      body: { membership_id: membershipId },
    },
  );

  const payload =
    edgeErrorPayload(data) ?? (await edgeErrorPayloadFromResponse(response));
  if (payload) {
    const code = payload.code ?? payload.error ?? "provision_failed";
    console.error("provision-client-membership failed", code, payload.error);
    throw new Error(code);
  }

  if (error) {
    console.error("provision-client-membership transport error", error.message);
    throw new Error(error.message);
  }

  if (!isProvisionSuccess(data)) {
    throw new Error("invalid_provision_response");
  }

  return data;
}
