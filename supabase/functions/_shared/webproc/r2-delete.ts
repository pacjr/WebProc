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

/** Deletes object from R2. Treats 404 as success (idempotent). */
export async function deleteR2Object(objectKey: string): Promise<void> {
  const response = await getAwsClient().fetch(buildObjectUrl(objectKey), {
    method: 'DELETE',
  });

  if (response.status === 404 || response.ok) {
    return;
  }

  throw new HttpError(
    'Storage object deletion failed',
    502,
    'storage_deletion_failed',
  );
}
