import { requireAuthenticatedUser } from '../_shared/webproc/auth.ts';
import { handleOptions } from '../_shared/webproc/cors.ts';
import {
  serverFinalizeArquivoRemoval,
  serverResolveArquivoRemovalTarget,
} from '../_shared/webproc/db.ts';
import {
  errorResponse,
  HttpError,
  jsonResponse,
  readJsonBody,
  rejectForbiddenClientFields,
} from '../_shared/webproc/http.ts';
import { deleteR2Object } from '../_shared/webproc/r2-delete.ts';

const FORBIDDEN_FIELDS = [
  'object_key',
  'cliente_id',
  'actor_user_id',
  'user_id',
  'userId',
  'created_by',
  'id_proc',
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

    const resolved = await serverResolveArquivoRemovalTarget({
      document_id: documentId,
      actor_user_id: user.id,
    });

    await deleteR2Object(resolved.object_key);

    const finalized = await serverFinalizeArquivoRemoval({
      document_id: documentId,
      actor_user_id: user.id,
    });

    return jsonResponse({
      success: true,
      document_id: finalized.document_id,
      tipo: 'ARQUIVO',
    });
  } catch (error) {
    return errorResponse(error);
  }
});
