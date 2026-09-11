import { requireAuthenticatedUser } from '../_shared/webproc/auth.ts';
import { handleOptions } from '../_shared/webproc/cors.ts';
import { validateUploadedContent } from '../_shared/webproc/content-validation.ts';
import { serverRegisterConfirmedDocumentUpload } from '../_shared/webproc/db.ts';
import {
  errorResponse,
  HttpError,
  jsonResponse,
  readJsonBody,
  rejectForbiddenClientFields,
} from '../_shared/webproc/http.ts';
import { headObject, readObjectPrefix } from '../_shared/webproc/r2-verify.ts';
import {
  deriveCanonicalObjectKey,
  verifyUploadCapability,
} from '../_shared/webproc/upload-capability.ts';

const FORBIDDEN_FIELDS = [
  'object_key',
  'cliente_id',
  'actor_user_id',
  'user_id',
  'userId',
  'expected_size',
  'size',
  'content_type',
  'filename',
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
    if (typeof body.upload_capability !== 'string' || !body.upload_capability.trim()) {
      throw new HttpError('upload_capability is required', 400, 'invalid_capability');
    }

    const documentId = body.document_id.trim();
    const capability = await verifyUploadCapability(body.upload_capability.trim(), {
      document_id: documentId,
      actor_user_id: user.id,
    });

    const objectKey = deriveCanonicalObjectKey({
      cliente_id: capability.cliente_id,
      id_proc: capability.id_proc,
      document_id: capability.document_id,
    });

    const head = await headObject(objectKey);
    if (head.contentLength !== capability.tamanho) {
      throw new HttpError('Uploaded object size mismatch', 400, 'size_mismatch');
    }
    if (head.contentLength <= 0) {
      throw new HttpError('Uploaded object is empty', 400, 'empty_object');
    }

    const prefixBytes = await readObjectPrefix(objectKey);
    validateUploadedContent(capability.content_type, prefixBytes);

    const registered = await serverRegisterConfirmedDocumentUpload({
      id_proc: capability.id_proc,
      actor_user_id: user.id,
      nome: capability.nome,
      nome_arquivo: capability.nome_arquivo,
      content_type: capability.content_type,
      tamanho: capability.tamanho,
      document_id: capability.document_id,
    });

    return jsonResponse({
      success: true,
      document_id: registered.document_id,
      id_proc: registered.id_proc,
      tipo: registered.tipo,
      storage_state: registered.storage_state,
      already_registered: registered.already_registered ?? false,
    });
  } catch (error) {
    return errorResponse(error);
  }
});
