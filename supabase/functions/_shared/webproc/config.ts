import { HttpError } from './http.ts';

/**
 * Environment-specific secrets (MUST NOT be copied across environments):
 * - WEBPROC_UPLOAD_CAPABILITY_SECRET — HMAC signing for upload capabilities
 * - R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY — Cloudflare R2 credentials
 * Each target environment (dev/test/prod) must generate its own independent values.
 */

const DEFAULT_MAX_UPLOAD_BYTES = 104_857_600;
const DEFAULT_CAPABILITY_TTL_SECONDS = 900;
const DEFAULT_PRESIGNED_PUT_TTL_SECONDS = 900;
const DEFAULT_PRESIGNED_GET_TTL_SECONDS = 300;

function readPositiveInt(name: string, fallback: number): number {
  const raw = Deno.env.get(name);
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new HttpError(`Invalid ${name}`, 500, 'config_error');
  }
  return value;
}

export function getMaxUploadBytes(): number {
  return readPositiveInt('WEBPROC_MAX_UPLOAD_BYTES', DEFAULT_MAX_UPLOAD_BYTES);
}

export function getCapabilityTtlSeconds(): number {
  return readPositiveInt(
    'WEBPROC_UPLOAD_CAPABILITY_TTL_SECONDS',
    DEFAULT_CAPABILITY_TTL_SECONDS,
  );
}

export function getPresignedPutTtlSeconds(): number {
  return readPositiveInt(
    'WEBPROC_PRESIGNED_PUT_TTL_SECONDS',
    DEFAULT_PRESIGNED_PUT_TTL_SECONDS,
  );
}

export function getPresignedGetTtlSeconds(): number {
  return readPositiveInt(
    'WEBPROC_DOWNLOAD_URL_TTL_SECONDS',
    DEFAULT_PRESIGNED_GET_TTL_SECONDS,
  );
}

export function getCapabilitySecret(): string {
  const secret = Deno.env.get('WEBPROC_UPLOAD_CAPABILITY_SECRET');
  if (!secret || secret.trim().length < 32) {
    throw new HttpError(
      'Upload capability signing is not configured',
      503,
      'capability_secret_missing',
    );
  }
  return secret;
}

export function getSupabaseUrl(): string {
  const url = Deno.env.get('SUPABASE_URL');
  if (!url) throw new HttpError('SUPABASE_URL missing', 500, 'config_error');
  return url;
}

export function getServiceRoleKey(): string {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) {
    throw new HttpError('SUPABASE_SERVICE_ROLE_KEY missing', 500, 'config_error');
  }
  return key;
}

export function getR2Config() {
  const accountId =
    Deno.env.get('CLOUDFLARE_R2_ACCOUNT_ID') ?? Deno.env.get('R2_ACCOUNT_ID');
  const accessKeyId =
    Deno.env.get('CLOUDFLARE_R2_ACCESS_KEY_ID') ?? Deno.env.get('R2_ACCESS_KEY_ID');
  const secretAccessKey =
    Deno.env.get('CLOUDFLARE_R2_SECRET_ACCESS_KEY') ?? Deno.env.get('R2_SECRET_ACCESS_KEY');
  const bucket = Deno.env.get('R2_BUCKET') ?? 'webproc';

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new HttpError('R2 credentials are not configured', 503, 'r2_config_missing');
  }

  return { accountId, accessKeyId, secretAccessKey, bucket };
}
