import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20';
import { getR2Config } from './config.ts';
import { HttpError } from './http.ts';

let cachedClient: AwsClient | null = null;

function getAwsClient(): AwsClient {
  if (cachedClient) return cachedClient;
  const { accessKeyId, secretAccessKey } = getR2Config();
  cachedClient = new AwsClient({
    accessKeyId,
    secretAccessKey,
    service: 's3',
    region: 'auto',
  });
  return cachedClient;
}

function buildObjectUrl(objectKey: string): string {
  const { accountId, bucket } = getR2Config();
  return `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${objectKey}`;
}

export async function headObject(objectKey: string): Promise<{
  contentLength: number;
}> {
  const response = await getAwsClient().fetch(buildObjectUrl(objectKey), { method: 'HEAD' });

  if (response.status === 404 || response.status === 403) {
    throw new HttpError('Uploaded object not found', 404, 'object_not_found');
  }
  if (!response.ok) {
    throw new HttpError('Failed to verify uploaded object', 502, 'r2_head_failed');
  }

  return { contentLength: Number(response.headers.get('content-length') ?? 0) };
}

export async function readObjectPrefix(
  objectKey: string,
  maxBytes = 8192,
): Promise<Uint8Array> {
  const response = await getAwsClient().fetch(buildObjectUrl(objectKey), {
    headers: { Range: `bytes=0-${Math.max(0, maxBytes - 1)}` },
  });

  if (response.status === 404 || response.status === 403) {
    throw new HttpError('Uploaded object not found', 404, 'object_not_found');
  }
  if (!response.ok) {
    throw new HttpError('Failed to read uploaded object bytes', 502, 'r2_read_failed');
  }

  return new Uint8Array(await response.arrayBuffer());
}
