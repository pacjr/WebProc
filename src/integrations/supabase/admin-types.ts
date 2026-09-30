/** Row shape returned by webproc.admin_list_clientes(). */
export interface AdminCliente {
  id: number;
  codigo_cliente: number;
  nome: string;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

/** Derived provisioning state from admin membership RPCs (not a stored column). */
export type AdminMembershipProvisioningState =
  | "PENDING_AUTH"
  | "ACTIVE"
  | "INACTIVE";

/** Row shape returned by webproc admin membership RPCs. */
export interface AdminClientMembership {
  id: number;
  cliente_id: number;
  email: string;
  nome: string | null;
  user_id: string | null;
  ativo: boolean;
  provisioning_state: AdminMembershipProvisioningState;
  created_at: string;
  updated_at: string;
}

export type ProvisionMembershipOutcome =
  | "INVITED_AND_LINKED"
  | "EXISTING_AUTH_LINKED"
  | "ALREADY_LINKED";

export interface ProvisionMembershipSuccess {
  success: true;
  membership_id: number;
  outcome: ProvisionMembershipOutcome;
}
