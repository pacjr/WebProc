import { getMaxUploadBytes } from './config.ts';
import { HttpError } from './http.ts';

const EXTENSION_TO_CONTENT_TYPE: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
};

const ALLOWED_CONTENT_TYPES = new Set(Object.values(EXTENSION_TO_CONTENT_TYPE));

export interface NormalizedUploadMetadata {
  filename: string;
  contentType: string;
  size: number;
  nome: string | null;
}

function extensionOf(filename: string): string {
  const idx = filename.lastIndexOf('.');
  if (idx <= 0 || idx === filename.length - 1) {
    throw new HttpError('Unsupported file extension', 400, 'invalid_extension');
  }
  return filename.slice(idx + 1).toLowerCase();
}

export function normalizeUploadMetadata(input: {
  filename: unknown;
  content_type: unknown;
  size: unknown;
  nome?: unknown;
}): NormalizedUploadMetadata {
  if (typeof input.filename !== 'string' || !input.filename.trim()) {
    throw new HttpError('filename is required', 400, 'invalid_filename');
  }

  const filename = input.filename.trim();
  if (filename.includes('/') || filename.includes('\\') || filename.includes('\0')) {
    throw new HttpError('Invalid filename', 400, 'invalid_filename');
  }

  const ext = extensionOf(filename);
  const expectedType = EXTENSION_TO_CONTENT_TYPE[ext];
  if (!expectedType) {
    throw new HttpError('Unsupported file extension', 400, 'invalid_extension');
  }

  if (typeof input.content_type !== 'string' || !input.content_type.trim()) {
    throw new HttpError('content_type is required', 400, 'invalid_content_type');
  }

  const contentType = input.content_type.trim().toLowerCase();
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new HttpError('Unsupported content type', 400, 'invalid_content_type');
  }

  if (contentType !== expectedType) {
    throw new HttpError(
      'Filename extension does not match content type',
      400,
      'content_type_mismatch',
    );
  }

  const size = Number(input.size);
  if (!Number.isFinite(size) || size <= 0) {
    throw new HttpError('size must be a positive number', 400, 'invalid_size');
  }

  const maxBytes = getMaxUploadBytes();
  if (size > maxBytes) {
    throw new HttpError('File exceeds maximum allowed size', 413, 'file_too_large');
  }

  let nome: string | null = null;
  if (input.nome !== undefined && input.nome !== null) {
    if (typeof input.nome !== 'string') {
      throw new HttpError('nome must be a string', 400, 'invalid_nome');
    }
    nome = input.nome.trim() || null;
  }

  return { filename, contentType, size: Math.trunc(size), nome };
}

/** Safe attachment filename derived from authorized DB metadata only. */
export function sanitizeDownloadFilename(nomeArquivo: string): string {
  const trimmed = nomeArquivo.trim();
  let name = (trimmed || 'download').replace(/[\x00-\x1f\x7f\\/:*?"<>|]/g, '_');
  if (!name || name === '.' || name === '..') {
    name = 'download';
  }
  if (name.length > 180) {
    name = name.slice(0, 180);
  }
  return name;
}
