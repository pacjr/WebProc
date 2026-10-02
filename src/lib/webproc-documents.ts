import type { WebProcProcessoDocument } from "@/integrations/supabase/webproc-types";
import { formatBytes } from "@/lib/webproc-file-policy";

/** Mirrors webproc_private.is_active_documento (LINK always; ARQUIVO when stored). */
export function isActiveProcessoDocument(
  doc: Pick<
    WebProcProcessoDocument,
    "tipo" | "storage_state" | "url" | "r2_cleanup_pending"
  >,
) {
  if (doc.tipo === "LINK") {
    return Boolean(doc.url?.trim());
  }
  if (doc.tipo === "ARQUIVO") {
    if (doc.r2_cleanup_pending === true) {
      return false;
    }
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

export function getDocumentoFileMeta(doc: WebProcProcessoDocument) {
  if (doc.tipo !== "ARQUIVO" || doc.tamanho == null) {
    return null;
  }
  return formatBytes(doc.tamanho);
}

export function getLinkHostname(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
