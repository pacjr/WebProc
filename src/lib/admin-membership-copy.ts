import type {
  AdminMembershipProvisioningState,
  ProvisionMembershipOutcome,
} from "@/integrations/supabase/admin-types";

export function membershipAccessSituationLabel(ativo: boolean): string {
  return ativo ? "Disponível" : "Indisponível";
}

export function membershipProvisioningLabel(
  state: AdminMembershipProvisioningState | string,
): string {
  switch (state) {
    case "PENDING_AUTH":
      return "Aguardando ativação";
    case "ACTIVE":
      return "Ativo";
    case "INACTIVE":
      return "Inativo";
    default:
      return "Desconhecido";
  }
}

export function canProvisionMembership(input: {
  ativo: boolean;
  provisioning_state: AdminMembershipProvisioningState | string;
}): boolean {
  return input.ativo && input.provisioning_state === "PENDING_AUTH";
}

export function provisionOutcomeMessage(outcome: ProvisionMembershipOutcome): string {
  switch (outcome) {
    case "INVITED_AND_LINKED":
      return "Convite de acesso enviado.";
    case "EXISTING_AUTH_LINKED":
      return "Acesso vinculado à conta existente.";
    case "ALREADY_LINKED":
      return "Este acesso já está vinculado.";
    default:
      return "Provisionamento concluído.";
  }
}
