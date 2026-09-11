import { requireAuthenticatedUser } from '../_shared/webproc/auth.ts';
import { handleOptions } from '../_shared/webproc/cors.ts';
import { serverPrepareDocumentUpload } from '../_shared/webproc/db.ts';
import { normalizeUploadMetadata } from '../_shared/webproc/file-policy.ts';
import {
  errorResponse,
  HttpError,
  jsonResponse,
  readJsonBody,
  rejectForbiddenClientFields,
} from '../_shared/webproc/http.ts';
import { createPresignedPutUrl } from '../_shared/webproc/r2-presign.ts';
import { createUploadCapability } from '../_shared/webproc/upload-capability.ts';

const FORBIDDEN_FIELDS = [
  'object_key',
  'cliente_id',
  'actor_user_id',
  'user_id',
  'userId',
  'created_by',
  'storage_state',
  'document_id',
];

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
  }

  try {
    const user = await requireAuthenticatedUser(req);
    const body = await readJsonBody(req);
    rejectForbiddenClientFields(body, FORBIDDEN_FIELDS);

    if (typeof body.id_proc !== 'number' || !Number.isInteger(body.id_proc) || body.id_proc <= 0) {
      throw new HttpError('id_proc must be a positive integer', 400, 'invalid_id_proc');
    }

    const metadata = normalizeUploadMetadata({
      filename: body.filename,
      content_type: body.content_type,
      size: body.size,
      nome: body.nome,
    });

    const prepared = await serverPrepareDocumentUpload({
      id_proc: body.id_proc,
      actor_user_id: user.id,
      nome: metadata.nome,
      nome_arquivo: metadata.filename,
      content_type: metadata.contentType,
      tamanho: metadata.size,
    });

    const capability = await createUploadCapability({
      document_id: prepared.document_id,
      id_proc: prepared.id_proc,
      actor_user_id: user.id,
      cliente_id: prepared.cliente_id,
      nome: prepared.nome,
      nome_arquivo: prepared.nome_arquivo,
      content_type: prepared.content_type,
      tamanho: prepared.tamanho,
    });

    const presigned = await createPresignedPutUrl({
      objectKey: prepared.object_key,
      contentType: prepared.content_type,
      contentLength: prepared.tamanho,
    });

    return jsonResponse({
      success: true,
      document_id: prepared.document_id,
      upload_url: presigned.uploadUrl,
      upload_capability: capability.token,
      expires_at: capability.expires_at,
      upload_headers: {
        'Content-Type': prepared.content_type,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});
