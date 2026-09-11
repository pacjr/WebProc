import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20';
import { getPresignedPutTtlSeconds, getR2Config } from './config.ts';

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

export async function createPresignedPutUrl(input: {
  objectKey: string;
  contentType: string;
  contentLength: number;
}): Promise<{ uploadUrl: string; expiresIn: number }> {
  const expiresIn = getPresignedPutTtlSeconds();
  const signed = await getAwsClient().sign(
    new Request(buildObjectUrl(input.objectKey), {
      method: 'PUT',
      headers: {
        'Content-Type': input.contentType,
        'Content-Length': String(input.contentLength),
      },
    }),
    { aws: { signQuery: true, expires: expiresIn } },
  );

  return { uploadUrl: signed.url, expiresIn };
}
