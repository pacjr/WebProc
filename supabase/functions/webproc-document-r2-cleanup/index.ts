import { requireAuthenticatedUser } from '../_shared/webproc/auth.ts';
import { handleOptions } from '../_shared/webproc/cors.ts';
import {
  serverConfirmArquivoPurgedAfterR2,
  serverListR2CleanupForProcess,
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

    const idProcRaw = body.id_proc;
    if (typeof idProcRaw !== 'number' && typeof idProcRaw !== 'string') {
      throw new HttpError('id_proc is required', 400, 'invalid_id_proc');
    }

    const idProc = typeof idProcRaw === 'number' ? idProcRaw : Number.parseInt(idProcRaw, 10);
    if (!Number.isFinite(idProc) || idProc <= 0) {
      throw new HttpError('id_proc is invalid', 400, 'invalid_id_proc');
    }

    const candidates = await serverListR2CleanupForProcess({
      id_proc: idProc,
      actor_user_id: user.id,
    });

    let purged = 0;
    let failed = 0;
    const failures: { document_id: string; code: string }[] = [];

    for (const candidate of candidates) {
      try {
        await deleteR2Object(candidate.object_key);
        await serverConfirmArquivoPurgedAfterR2(candidate.document_id);
        purged += 1;
      } catch (error) {
        failed += 1;
        const code =
          error instanceof HttpError
            ? error.code ?? 'storage_deletion_failed'
            : 'storage_deletion_failed';
        failures.push({ document_id: candidate.document_id, code });
      }
    }

    return jsonResponse({
      success: true,
      id_proc: idProc,
      candidates: candidates.length,
      purged,
      failed,
      failures,
      remaining: candidates.length - purged,
    });
  } catch (error) {
    return errorResponse(error);
  }
});
