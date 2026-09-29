import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchActiveClientMemberships,
  fetchActusConnectAuthorization,
} from "@/integrations/supabase/webproc-api";
import type { WebProcMembership } from "@/integrations/supabase/webproc-types";

export type ConnectAccess =
  | { kind: "AUTHENTICATION_REQUIRED" }
  | { kind: "ACTUS" }
  | { kind: "CLIENT"; membership: WebProcMembership }
  | { kind: "CLIENT_SELECTION_REQUIRED"; memberships: WebProcMembership[] }
  | { kind: "UNAUTHORIZED" };

export function resolveConnectAccessFromFacts(input: {
  isActus: boolean;
  memberships: WebProcMembership[];
}): ConnectAccess {
  if (input.isActus) {
    return { kind: "ACTUS" };
  }

  if (input.memberships.length === 1) {
    return { kind: "CLIENT", membership: input.memberships[0]! };
  }

  if (input.memberships.length > 1) {
    return { kind: "CLIENT_SELECTION_REQUIRED", memberships: input.memberships };
  }

  return { kind: "UNAUTHORIZED" };
}

/** Resolves Connect authorization for the current Supabase session (parallel Actus + client lookups). */
export async function resolveConnectAccess(): Promise<{
  user: User | null;
  access: ConnectAccess;
}> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { user: null, access: { kind: "AUTHENTICATION_REQUIRED" } };
  }

  const [actusResult, membershipsResult] = await Promise.all([
    fetchActusConnectAuthorization(),
    fetchActiveClientMemberships(user.id),
  ]);

  if (actusResult.error) {
    console.error("Erro ao resolver autorização Actus:", actusResult.error);
  }

  if (membershipsResult.error) {
    console.error("Erro ao resolver memberships cliente:", membershipsResult.error);
  }

  const access = resolveConnectAccessFromFacts({
    isActus: actusResult.isActus,
    memberships: membershipsResult.memberships,
  });

  return { user, access };
}

export function getClientMembership(access: ConnectAccess): WebProcMembership | null {
  return access.kind === "CLIENT" ? access.membership : null;
}

export function isClientActor(access: ConnectAccess): boolean {
  return access.kind === "CLIENT";
}

export function isActusActor(access: ConnectAccess): boolean {
  return access.kind === "ACTUS";
}

export function canEnterProtectedApp(access: ConnectAccess): boolean {
  return access.kind === "ACTUS" || access.kind === "CLIENT";
}
