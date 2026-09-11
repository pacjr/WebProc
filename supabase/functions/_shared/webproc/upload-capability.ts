import { getCapabilitySecret, getCapabilityTtlSeconds } from './config.ts';
import { HttpError } from './http.ts';

const CAPABILITY_VERSION = 1;

export interface UploadCapabilityPayload {
  v: number;
  document_id: string;
  id_proc: number;
  actor_user_id: string;
  cliente_id: number;
  nome: string | null;
  nome_arquivo: string;
  content_type: string;
  tamanho: number;
  exp: number;
}

/** Canonical R2 key — derived server-side at confirm; never signed into client capability. */
export function deriveCanonicalObjectKey(input: {
  cliente_id: number;
  id_proc: number;
  document_id: string;
}): string {
  return `webproc/${input.cliente_id}/${input.id_proc}/${input.document_id}`;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const binary = atob(padded + '='.repeat(padLen));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function signPayload(payloadJson: string): Promise<string> {
  const key = await importHmacKey(getCapabilitySecret());
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(payloadJson),
  );
  return encodeBase64Url(new Uint8Array(signature));
}

export async function createUploadCapability(
  input: Omit<UploadCapabilityPayload, 'v' | 'exp'> & { exp?: number },
): Promise<{ token: string; expires_at: string; payload: UploadCapabilityPayload }> {
  const exp = input.exp ?? Math.floor(Date.now() / 1000) + getCapabilityTtlSeconds();
  const payload: UploadCapabilityPayload = {
    v: CAPABILITY_VERSION,
    document_id: input.document_id,
    id_proc: input.id_proc,
    actor_user_id: input.actor_user_id,
    cliente_id: input.cliente_id,
    nome: input.nome,
    nome_arquivo: input.nome_arquivo,
    content_type: input.content_type,
    tamanho: input.tamanho,
    exp,
  };

  const payloadJson = JSON.stringify(payload);
  const signature = await signPayload(payloadJson);
  const token = `${encodeBase64Url(new TextEncoder().encode(payloadJson))}.${signature}`;

  return {
    token,
    expires_at: new Date(exp * 1000).toISOString(),
    payload,
  };
}

export async function verifyUploadCapability(
  token: string,
  expected: { document_id: string; actor_user_id: string },
): Promise<UploadCapabilityPayload> {
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new HttpError('Invalid upload capability', 400, 'invalid_capability');
  }

  const payloadJson = new TextDecoder().decode(decodeBase64Url(parts[0]));
  const key = await importHmacKey(getCapabilitySecret());
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    decodeBase64Url(parts[1]),
    new TextEncoder().encode(payloadJson),
  );

  if (!valid) {
    throw new HttpError('Invalid upload capability signature', 403, 'invalid_capability');
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(payloadJson) as Record<string, unknown>;
  } catch {
    throw new HttpError('Invalid upload capability payload', 400, 'invalid_capability');
  }

  if ('object_key' in parsed) {
    throw new HttpError('Invalid upload capability payload', 400, 'invalid_capability');
  }

  const payload = parsed as UploadCapabilityPayload;

  if (payload.v !== CAPABILITY_VERSION) {
    throw new HttpError('Unsupported upload capability version', 400, 'invalid_capability');
  }

  if (Math.floor(Date.now() / 1000) >= payload.exp) {
    throw new HttpError('Upload capability expired', 403, 'capability_expired');
  }

  if (payload.document_id !== expected.document_id) {
    throw new HttpError('Upload capability document mismatch', 403, 'capability_mismatch');
  }

  if (payload.actor_user_id !== expected.actor_user_id) {
    throw new HttpError('Upload capability actor mismatch', 403, 'capability_actor_mismatch');
  }

  return payload;
}
