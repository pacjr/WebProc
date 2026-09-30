import {
  findAuthUserByNormalizedEmail,
  getAuthInviteRedirectUrl,
  getAuthUserById,
  inviteAuthUserByEmail,
} from './auth-admin.ts';
import {
  serverLinkClientMembershipAuth,
  serverPrepareClientMembershipAuth,
} from './auth-provision-db.ts';
import { authUserEmailNormalized } from './membership-email.ts';
import { HttpError } from './http.ts';

export type ProvisionSuccessOutcome =
  | 'INVITED_AND_LINKED'
  | 'EXISTING_AUTH_LINKED'
  | 'ALREADY_LINKED';

export interface ProvisionMembershipResult {
  success: true;
  membership_id: number;
  outcome: ProvisionSuccessOutcome;
}

async function linkMembership(input: {
  membership_id: number;
  actor_user_id: string;
  auth_user_id: string;
  normalized_email: string;
}) {
  return serverLinkClientMembershipAuth({
    membership_id: input.membership_id,
    actor_user_id: input.actor_user_id,
    auth_user_id: input.auth_user_id,
    auth_email: input.normalized_email,
  });
}

function mapLinkToProvisionOutcome(
  linkOutcome: 'LINKED' | 'ALREADY_LINKED',
  path: 'invite' | 'existing' | 'already_linked',
): ProvisionSuccessOutcome {
  if (linkOutcome === 'ALREADY_LINKED' || path === 'already_linked') {
    return 'ALREADY_LINKED';
  }
  if (path === 'invite') return 'INVITED_AND_LINKED';
  return 'EXISTING_AUTH_LINKED';
}

/**
 * Orchestrates prepare → Auth Admin (lookup/invite) → link.
 * Domain rules remain authoritative in webproc.server_* RPCs.
 */
export async function provisionClientMembership(input: {
  membership_id: number;
  actor_user_id: string;
}): Promise<ProvisionMembershipResult> {
  const prepare = await serverPrepareClientMembershipAuth({
    membership_id: input.membership_id,
    actor_user_id: input.actor_user_id,
  });

  const normalizedEmail = prepare.normalized_email;
  const membershipId = prepare.membership_id;

  if (prepare.existing_user_id) {
    const authUser = await getAuthUserById(prepare.existing_user_id);
    if (!authUser?.id) {
      throw new HttpError(
        'Membership references missing Auth identity; reconciliation required',
        502,
        'auth_db_reconciliation_required',
      );
    }
    const authEmail = authUserEmailNormalized(authUser);
    if (authEmail !== normalizedEmail) {
      throw new HttpError('Auth email does not match membership', 409, 'auth_email_mismatch');
    }

    const link = await linkMembership({
      membership_id: membershipId,
      actor_user_id: input.actor_user_id,
      auth_user_id: authUser.id,
      normalized_email: normalizedEmail,
    });

    return {
      success: true,
      membership_id: membershipId,
      outcome: mapLinkToProvisionOutcome(link.outcome, 'already_linked'),
    };
  }

  if (prepare.provisioning_state !== 'PENDING_AUTH') {
    throw new HttpError('Membership is not eligible for auth provisioning', 409, 'membership_inactive');
  }

  const existingAuth = await findAuthUserByNormalizedEmail(normalizedEmail);

  if (existingAuth?.id) {
    try {
      const link = await linkMembership({
        membership_id: membershipId,
        actor_user_id: input.actor_user_id,
        auth_user_id: existingAuth.id,
        normalized_email: normalizedEmail,
      });
      return {
        success: true,
        membership_id: membershipId,
        outcome: mapLinkToProvisionOutcome(link.outcome, 'existing'),
      };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError('Link failed after Auth identity resolution', 502, 'link_failed_after_auth');
    }
  }

  let invitedUser;
  try {
    invitedUser = await inviteAuthUserByEmail(normalizedEmail, getAuthInviteRedirectUrl());
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError('Auth invite failed', 502, 'auth_invite_failed');
  }

  try {
    const link = await linkMembership({
      membership_id: membershipId,
      actor_user_id: input.actor_user_id,
      auth_user_id: invitedUser.id,
      normalized_email: normalizedEmail,
    });
    return {
      success: true,
      membership_id: membershipId,
      outcome: mapLinkToProvisionOutcome(link.outcome, 'invite'),
    };
  } catch (error) {
    console.error(
      'link_failed_after_auth',
      JSON.stringify({ membership_id: membershipId, auth_user_id: invitedUser.id }),
    );
    if (error instanceof HttpError) {
      throw new HttpError(
        error.message,
        502,
        'link_failed_after_auth',
      );
    }
    throw new HttpError(
      'Auth identity created but membership link failed; retry provisioning',
      502,
      'link_failed_after_auth',
    );
  }
}
