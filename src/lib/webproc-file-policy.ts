/** Client-side mirror of supabase/functions/_shared/webproc/file-policy.ts (prepare authority). */

export const WEBPROC_MAX_UPLOAD_BYTES = 104_857_600;

const EXTENSION_TO_CONTENT_TYPE: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
};

export const WEBPROC_ALLOWED_EXTENSIONS = Object.keys(EXTENSION_TO_CONTENT_TYPE);

export type WebprocFileValidationResult =
  | { ok: true; filename: string; contentType: string; size: number }
  | { ok: false; message: string; code?: string };

function extensionOf(filename: string): string | null {
  const idx = filename.lastIndexOf(".");
  if (idx <= 0 || idx === filename.length - 1) {
    return null;
  }
  return filename.slice(idx + 1).toLowerCase();
}

export function validateWebprocUploadFile(file: File): WebprocFileValidationResult {
  const filename = file.name.trim();
  if (!filename || filename.includes("/") || filename.includes("\\")) {
    return { ok: false, message: "Nome de arquivo inválido.", code: "invalid_filename" };
  }

  const ext = extensionOf(filename);
  if (!ext) {
    return {
      ok: false,
      message: "Tipo de arquivo não suportado. Use PDF, Word, Excel ou CSV.",
      code: "invalid_extension",
    };
  }

  const expectedType = EXTENSION_TO_CONTENT_TYPE[ext];
  if (!expectedType) {
    return {
      ok: false,
      message: "Tipo de arquivo não suportado. Use PDF, Word, Excel ou CSV.",
      code: "invalid_extension",
    };
  }

  const browserType = file.type.trim().toLowerCase();
  const contentType =
    !browserType || browserType === "application/octet-stream" ? expectedType : browserType;
  if (contentType !== expectedType) {
    return {
      ok: false,
      message: "A extensão do arquivo não corresponde ao tipo informado.",
      code: "content_type_mismatch",
    };
  }

  if (file.size <= 0) {
    return { ok: false, message: "O arquivo está vazio.", code: "invalid_size" };
  }

  if (file.size > WEBPROC_MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      message: `O arquivo excede o limite de ${formatBytes(WEBPROC_MAX_UPLOAD_BYTES)}.`,
      code: "file_too_large",
    };
  }

  return {
    ok: true,
    filename,
    contentType: expectedType,
    size: file.size,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
