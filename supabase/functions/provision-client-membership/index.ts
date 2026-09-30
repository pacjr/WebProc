import { requireAuthenticatedUser } from '../_shared/webproc/auth.ts';
import { handleOptions } from '../_shared/webproc/cors.ts';
import {
  errorResponse,
  HttpError,
  jsonResponse,
  readJsonBody,
  rejectForbiddenClientFields,
} from '../_shared/webproc/http.ts';
import { provisionClientMembership } from '../_shared/webproc/provision-client-membership.ts';

const FORBIDDEN_FIELDS = [
  'actor_user_id',
  'user_id',
  'userId',
  'auth_user_id',
  'email',
  'cliente_id',
  'role',
  'provisioning_state',
  'p_actor_user_id',
  'p_auth_user_id',
  'p_auth_email',
  'p_membership_id',
];

function parseMembershipId(body: Record<string, unknown>): number {
  const raw = body.membership_id;
  if (typeof raw === 'number' && Number.isInteger(raw) && raw > 0) {
    return raw;
  }
  if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) {
    const parsed = Number.parseInt(raw.trim(), 10);
    if (parsed > 0) return parsed;
  }
  throw new HttpError('membership_id must be a positive integer', 400, 'invalid_request');
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed', code: 'invalid_request' }, 405);
  }

  try {
    const user = await requireAuthenticatedUser(req);
    const body = await readJsonBody(req);
    rejectForbiddenClientFields(body, FORBIDDEN_FIELDS);

    const membershipId = parseMembershipId(body);

    console.info(
      'provision_client_membership_start',
      JSON.stringify({ membership_id: membershipId }),
    );

    const result = await provisionClientMembership({
      membership_id: membershipId,
      actor_user_id: user.id,
    });

    console.info(
      'provision_client_membership_success',
      JSON.stringify({ membership_id: membershipId, outcome: result.outcome }),
    );

    return jsonResponse(result);
  } catch (error) {
    if (error instanceof HttpError && error.code === 'unauthorized') {
      return errorResponse(
        new HttpError('Authentication required', 401, 'not_authenticated'),
      );
    }
    if (error instanceof HttpError) {
      console.warn(
        'provision_client_membership_error',
        JSON.stringify({ code: error.code ?? null, status: error.status }),
      );
    }
    return errorResponse(error);
  }
});
