const DOCUMENT_EDGE_ERROR_MESSAGES: Record<string, string> = {
  invalid_extension: "Tipo de arquivo não suportado. Use PDF, Word, Excel ou CSV.",
  invalid_content_type: "Tipo de arquivo não suportado. Use PDF, Word, Excel ou CSV.",
  content_type_mismatch: "A extensão do arquivo não corresponde ao tipo informado.",
  file_too_large: "O arquivo excede o tamanho máximo permitido.",
  invalid_size: "Tamanho de arquivo inválido.",
  invalid_filename: "Nome de arquivo inválido.",
  invalid_id_proc: "Protocolo inválido para anexar documento.",
  membership_required: "Vínculo ativo com o cliente é necessário.",
  not_process_creator: "Somente o autor original pode anexar documentos.",
  invalid_status_for_document_mutation:
    "Documentos só podem ser alterados enquanto o protocolo está em preenchimento.",
  capability_secret_missing:
    "Upload de arquivos temporariamente indisponível. Contate o suporte.",
  r2_config_missing: "Armazenamento de arquivos temporariamente indisponível. Contate o suporte.",
  size_mismatch: "Falha ao validar o arquivo enviado. Tente anexar novamente.",
  empty_object: "O arquivo enviado está vazio.",
  invalid_capability: "A sessão de upload expirou. Selecione o arquivo novamente.",
  invalid_document_id: "Documento não encontrado ou indisponível.",
  document_not_found: "Documento não encontrado ou indisponível.",
  download_not_available: "Download indisponível para este documento.",
  invalid_storage_state_for_download: "Download indisponível para este documento.",
};

export function mapDocumentEdgeError(codeOrMessage: string | null | undefined): string {
  if (!codeOrMessage) {
    return "Não foi possível concluir a operação com o documento. Tente novamente.";
  }

  for (const [code, label] of Object.entries(DOCUMENT_EDGE_ERROR_MESSAGES)) {
    if (codeOrMessage.includes(code)) {
      return label;
    }
  }

  if (codeOrMessage.length < 120 && !codeOrMessage.includes("Http")) {
    return codeOrMessage;
  }

  return "Não foi possível concluir a operação com o documento. Tente novamente.";
}
