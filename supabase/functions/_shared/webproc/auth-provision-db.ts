import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getServiceRoleKey, getSupabaseUrl } from './config.ts';
import { HttpError } from './http.ts';

export type ProvisioningState = 'PENDING_AUTH' | 'ACTIVE' | 'INACTIVE';
export type LinkOutcome = 'LINKED' | 'ALREADY_LINKED';

export interface PrepareMembershipAuthResult {
  success: boolean;
  membership_id: number;
  normalized_email: string;
  provisioning_state: ProvisioningState;
  existing_user_id: string | null;
}

export interface LinkMembershipAuthResult {
  success: boolean;
  membership_id: number;
  provisioning_state: ProvisioningState;
  outcome: LinkOutcome;
}

function createWebprocServiceClient() {
  return createClient(getSupabaseUrl(), getServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'webproc' },
  });
}

function mapAuthProvisionDbError(
  error: { message?: string; details?: string; hint?: string },
  fallback: string,
): HttpError {
  const message = [error.message, error.details, error.hint].filter(Boolean).join(' | ') || fallback;
  const lower = message.toLowerCase();

  if (lower.includes('not_authenticated')) {
    return new HttpError('Authentication required', 401, 'not_authenticated');
  }
  if (lower.includes('not_actus_admin')) {
    return new HttpError('Actus ADMIN required', 403, 'not_actus_admin');
  }
  if (lower.includes('actus_identity_conflict')) {
    return new HttpError('Actus identity cannot link to client membership', 403, 'actus_identity_conflict');
  }
  if (lower.includes('membership_not_found')) {
    return new HttpError('Membership not found', 404, 'membership_not_found');
  }
  if (lower.includes('membership_inactive')) {
    return new HttpError('Membership is inactive', 409, 'membership_inactive');
  }
  if (lower.includes('client_inactive')) {
    return new HttpError('Client is inactive', 409, 'client_inactive');
  }
  if (lower.includes('auth_email_mismatch')) {
    return new HttpError('Auth email does not match membership', 409, 'auth_email_mismatch');
  }
  if (lower.includes('membership_already_linked')) {
    return new HttpError('Membership linked to a different Auth identity', 409, 'membership_already_linked');
  }
  if (lower.includes('active_membership_other_client')) {
    return new HttpError('Active membership exists for another client', 409, 'active_membership_other_client');
  }
  if (lower.includes('invalid_auth_user_id') || lower.includes('invalid_email')) {
    return new HttpError('Invalid request', 400, 'invalid_request');
  }

  console.error('Auth provision DB error:', message);
  return new HttpError('Database provisioning failed', 500, 'database_error');
}

export async function serverPrepareClientMembershipAuth(input: {
  membership_id: number;
  actor_user_id: string;
}): Promise<PrepareMembershipAuthResult> {
  const supabase = createWebprocServiceClient();
  const { data, error } = await supabase.rpc('server_prepare_client_membership_auth', {
    p_membership_id: input.membership_id,
    p_actor_user_id: input.actor_user_id,
  });

  if (error) throw mapAuthProvisionDbError(error, 'Prepare provisioning failed');
  if (!data?.success) {
    throw new HttpError('Prepare provisioning failed', 500, 'database_error');
  }

  return data as PrepareMembershipAuthResult;
}

export async function serverLinkClientMembershipAuth(input: {
  membership_id: number;
  actor_user_id: string;
  auth_user_id: string;
  auth_email: string;
}): Promise<LinkMembershipAuthResult> {
  const supabase = createWebprocServiceClient();
  const { data, error } = await supabase.rpc('server_link_client_membership_auth', {
    p_membership_id: input.membership_id,
    p_actor_user_id: input.actor_user_id,
    p_auth_user_id: input.auth_user_id,
    p_auth_email: input.auth_email,
  });

  if (error) throw mapAuthProvisionDbError(error, 'Link provisioning failed');
  if (!data?.success) {
    throw new HttpError('Link provisioning failed', 500, 'database_error');
  }

  return data as LinkMembershipAuthResult;
}
