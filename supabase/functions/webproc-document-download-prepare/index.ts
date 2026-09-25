import { requireAuthenticatedUser } from '../_shared/webproc/auth.ts';
import { handleOptions } from '../_shared/webproc/cors.ts';
import { serverResolveArquivoDownloadTarget } from '../_shared/webproc/db.ts';
import { sanitizeDownloadFilename } from '../_shared/webproc/file-policy.ts';
import {
  errorResponse,
  HttpError,
  jsonResponse,
  readJsonBody,
  rejectForbiddenClientFields,
} from '../_shared/webproc/http.ts';
import { createPresignedGetUrl } from '../_shared/webproc/r2-presign.ts';

const FORBIDDEN_FIELDS = [
  'object_key',
  'cliente_id',
  'actor_user_id',
  'user_id',
  'userId',
  'created_by',
  'storage_state',
  'id_proc',
  'content_type',
  'nome_arquivo',
  'tamanho',
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

    if (typeof body.document_id !== 'string' || !body.document_id.trim()) {
      throw new HttpError('document_id is required', 400, 'invalid_document_id');
    }

    const documentId = body.document_id.trim();
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(documentId)
    ) {
      throw new HttpError('document_id must be a UUID', 400, 'invalid_document_id');
    }

    const resolved = await serverResolveArquivoDownloadTarget({
      document_id: documentId,
      actor_user_id: user.id,
    });

    const presigned = await createPresignedGetUrl({
      objectKey: resolved.object_key,
      contentType: resolved.content_type,
      downloadFilename: sanitizeDownloadFilename(resolved.nome_arquivo),
    });

    return jsonResponse({
      success: true,
      document_id: resolved.document_id,
      id_proc: resolved.id_proc,
      download_url: presigned.downloadUrl,
      expires_in: presigned.expiresIn,
      content_type: resolved.content_type,
      nome_arquivo: resolved.nome_arquivo,
      storage_state: resolved.storage_state,
      tamanho: resolved.tamanho,
    });
  } catch (error) {
    return errorResponse(error);
  }
});
