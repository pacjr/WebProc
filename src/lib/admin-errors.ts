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

  return "Não foi possível concluir a operação. Tente novamente.";
}

export function toAdminUserMessage(error: unknown): string {
  if (error instanceof Error) {
    return mapAdminRpcMessage(error.message);
  }
  return mapAdminRpcMessage(String(error));
}
