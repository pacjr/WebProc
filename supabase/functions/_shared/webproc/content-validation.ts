import { HttpError } from './http.ts';

const PDF_SIGNATURE = new TextEncoder().encode('%PDF-');
const OLE_SIGNATURE = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const ZIP_SIGNATURE = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

function startsWithBytes(data: Uint8Array, prefix: Uint8Array): boolean {
  if (data.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (data[i] !== prefix[i]) return false;
  }
  return true;
}

function containsAscii(data: Uint8Array, needle: string): boolean {
  const haystack = new TextDecoder('latin1').decode(data);
  return haystack.includes(needle);
}

function rejectKnownBinaryDocumentSignatures(data: Uint8Array): void {
  if (startsWithBytes(data, PDF_SIGNATURE)) {
    throw new HttpError('Uploaded content is not valid CSV', 400, 'invalid_content');
  }
  if (startsWithBytes(data, OLE_SIGNATURE)) {
    throw new HttpError('Uploaded content is not valid CSV', 400, 'invalid_content');
  }
  if (startsWithBytes(data, ZIP_SIGNATURE)) {
    throw new HttpError('Uploaded content is not valid CSV', 400, 'invalid_content');
  }
  if (data.length >= 2 && data[0] === 0x50 && data[1] === 0x4b) {
    throw new HttpError('Uploaded content is not valid CSV', 400, 'invalid_content');
  }
}

function validateCsvContent(data: Uint8Array): void {
  if (data.length === 0) {
    throw new HttpError('Invalid CSV content', 400, 'invalid_content');
  }

  rejectKnownBinaryDocumentSignatures(data);

  for (const byte of data) {
    if (byte === 0) {
      throw new HttpError('Invalid CSV content', 400, 'invalid_content');
    }
    if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
      throw new HttpError('Invalid CSV content', 400, 'invalid_content');
    }
  }
}

export function validateUploadedContent(
  contentType: string,
  prefixBytes: Uint8Array,
): void {
  switch (contentType) {
    case 'application/pdf':
      if (!startsWithBytes(prefixBytes, PDF_SIGNATURE)) {
        throw new HttpError('Uploaded content is not a valid PDF', 400, 'invalid_content');
      }
      return;

    case 'application/msword':
    case 'application/vnd.ms-excel':
      if (!startsWithBytes(prefixBytes, OLE_SIGNATURE)) {
        throw new HttpError(
          'Uploaded content is not a valid legacy Office document',
          400,
          'invalid_content',
        );
      }
      return;

    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      if (!startsWithBytes(prefixBytes, ZIP_SIGNATURE)) {
        throw new HttpError('Uploaded content is not a valid DOCX container', 400, 'invalid_content');
      }
      if (!containsAscii(prefixBytes, 'word/') && !containsAscii(prefixBytes, '[Content_Types].xml')) {
        throw new HttpError('Uploaded content is not a valid DOCX package', 400, 'invalid_content');
      }
      return;

    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      if (!startsWithBytes(prefixBytes, ZIP_SIGNATURE)) {
        throw new HttpError('Uploaded content is not a valid XLSX container', 400, 'invalid_content');
      }
      if (!containsAscii(prefixBytes, 'xl/') && !containsAscii(prefixBytes, '[Content_Types].xml')) {
        throw new HttpError('Uploaded content is not a valid XLSX package', 400, 'invalid_content');
      }
      return;

    case 'text/csv':
      validateCsvContent(prefixBytes);
      return;

    default:
      throw new HttpError('Unsupported content type for validation', 400, 'invalid_content_type');
  }
}

export const CONTENT_VALIDATION_LIMITATIONS = [
  'Legacy DOC and XLS share the same OLE compound-document signature; Edge validates the OLE family but cannot cryptographically distinguish Word vs Excel binaries beyond declared content_type.',
  'OOXML validation uses bounded ZIP header inspection only; it does not parse the full package graph.',
  'CSV validation rejects known binary/document signatures and disallowed control bytes in a bounded prefix; it does not prove delimiter choice, full-file charset, or semantic CSV correctness.',
];
