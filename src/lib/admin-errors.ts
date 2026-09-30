/** Maps webproc admin RPC domain exceptions to PT-BR product copy. */
export function mapAdminRpcMessage(raw: string | undefined | null): string {
  const msg = (raw ?? "").toLowerCase();

  if (msg.includes("not_actus_admin") || msg.includes("not_authenticated")) {
    return "Você não tem permissão para esta ação.";
  }
  if (msg.includes("codigo_cliente_conflict")) {
    return "Já existe um cliente com este código.";
  }
  if (msg.includes("invalid_codigo_cliente")) {
    return "Informe um código de cliente válido.";
  }
  if (msg.includes("invalid_cliente_nome")) {
    return "Informe um nome de cliente válido.";
  }
  if (msg.includes("cliente_not_found")) {
    return "Cliente não encontrado.";
  }
  if (msg.includes("invalid_update_payload")) {
    return "Não foi possível aplicar a alteração solicitada.";
  }
  if (msg.includes("membership_not_found")) {
    return "Acesso não encontrado.";
  }
  if (msg.includes("membership_inactive")) {
    return "Este acesso está indisponível para provisionamento.";
  }
  if (msg.includes("membership_email_conflict")) {
    return "Já existe um acesso ativo com este e-mail neste cliente.";
  }
  if (msg.includes("active_membership_other_client")) {
    return "Esta pessoa já possui um acesso ativo em outro cliente.";
  }
  if (msg.includes("invalid_membership_nome")) {
    return "Informe um nome válido para o acesso.";
  }
  if (msg.includes("invalid_email")) {
    return "Informe um e-mail válido.";
  }
  if (msg.includes("client_inactive")) {
    return "O cliente está inativo. Reative o cliente antes de provisionar acessos.";
  }
  if (msg.includes("actus_identity_conflict")) {
    return "Este e-mail pertence a um usuário Actus e não pode receber acesso de cliente.";
  }
  if (msg.includes("auth_email_mismatch")) {
    return "A conta de autenticação não corresponde ao e-mail deste acesso.";
  }
  if (msg.includes("membership_already_linked")) {
    return "Este acesso já está vinculado a outra conta.";
  }
  if (msg.includes("auth_rate_limited")) {
    return "Muitas tentativas em sequência. Aguarde alguns minutos e tente novamente.";
  }
  if (msg.includes("auth_invite_failed")) {
    return "Não foi possível enviar o convite de acesso. Tente novamente.";
  }
  if (msg.includes("auth_admin_error")) {
    return "Não foi possível concluir a operação de autenticação. Tente novamente.";
  }
  if (msg.includes("link_failed_after_auth")) {
    return "A conta foi preparada, mas o vínculo falhou. Tente provisionar novamente ou contate o suporte.";
  }
  if (msg.includes("auth_db_reconciliation_required")) {
    return "Há uma inconsistência entre autenticação e cadastro. Tente novamente ou contate o suporte.";
  }
  if (msg.includes("database_error")) {
    return "Erro temporário no servidor. Tente novamente.";
  }
  if (msg.includes("invite_redirect_missing")) {
    return "Configuração de convite incompleta. Contate o suporte.";
  }
  if (msg.includes("invalid_provision_response")) {
    return "Resposta inesperada do provisionamento. Tente novamente.";
  }

  return "Não foi possível concluir a operação. Tente novamente.";
}

export function toAdminUserMessage(error: unknown): string {
  if (error instanceof Error) {
    return mapAdminRpcMessage(error.message);
  }
  return mapAdminRpcMessage(String(error));
}
