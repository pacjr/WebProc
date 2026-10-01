import type { WebProcProcessoDocument } from "@/integrations/supabase/webproc-types";

/** Mirrors webproc_private.is_active_documento (LINK always; ARQUIVO when stored). */
export function isActiveProcessoDocument(
  doc: Pick<WebProcProcessoDocument, "tipo" | "storage_state" | "url">,
) {
  if (doc.tipo === "LINK") {
    return Boolean(doc.url?.trim());
  }
  if (doc.tipo === "ARQUIVO") {
    return doc.storage_state === "STORED" || doc.storage_state === "PERSISTED";
  }
  return false;
}

export function countActiveProcessoDocuments(documents: WebProcProcessoDocument[]) {
  return documents.filter(isActiveProcessoDocument).length;
}

export function getDocumentoDisplayName(doc: WebProcProcessoDocument) {
  if (doc.tipo === "LINK") {
    return doc.nome?.trim() || "Link do documento";
  }
  return doc.nome?.trim() || doc.nome_arquivo?.trim() || "Arquivo";
}

export function getLinkHostname(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
