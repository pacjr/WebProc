import { createClient, type User } from 'https://esm.sh/@supabase/supabase-js@2';
import { getServiceRoleKey, getSupabaseUrl } from './config.ts';
import { HttpError } from './http.ts';
import { authUserEmailNormalized, normalizeMembershipEmail } from './membership-email.ts';

function createAuthAdminClient() {
  return createClient(getSupabaseUrl(), getServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function authAdminHeaders(): Record<string, string> {
  const key = getServiceRoleKey();
  return {
    Authorization: `Bearer ${key}`,
    apikey: key,
    'Content-Type': 'application/json',
  };
}

/**
 * GoTrue Admin list users supports a bounded email filter (not a full directory scan).
 * @see https://supabase.com/docs/reference/javascript/auth-admin-listusers
 */
export async function findAuthUserByNormalizedEmail(
  normalizedEmail: string,
): Promise<User | null> {
  normalizeMembershipEmail(normalizedEmail);

  const url = new URL(`${getSupabaseUrl()}/auth/v1/admin/users`);
  url.searchParams.set('page', '1');
  url.searchParams.set('per_page', '2');
  // GoTrue Admin API: bounded lookup by exact email (not a paginated directory scan).
  url.searchParams.set('filter', `email.eq."${normalizedEmail.replaceAll('"', '\\"')}"`);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: authAdminHeaders(),
  });

  if (response.status === 429) {
    throw new HttpError('Auth provider rate limited', 429, 'auth_rate_limited');
  }

  if (!response.ok) {
    const text = await response.text();
    console.error('Auth admin list users failed', response.status, text.slice(0, 200));
    throw new HttpError('Auth identity lookup failed', 502, 'auth_admin_error');
  }

  const payload = (await response.json()) as { users?: User[] };
  const users = payload.users ?? [];

  if (users.length > 1) {
    console.error('Ambiguous Auth email lookup', normalizedEmail, users.length);
    throw new HttpError('Ambiguous Auth identity for email', 502, 'auth_admin_error');
  }

  if (users.length === 0) {
    return null;
  }

  const user = users[0]!;
  const userEmail = authUserEmailNormalized(user);
  if (userEmail !== normalizedEmail) {
    console.error('Auth filter returned non-matching email', normalizedEmail, userEmail);
    throw new HttpError('Auth identity email mismatch', 502, 'auth_admin_error');
  }

  return user;
}

export async function getAuthUserById(authUserId: string): Promise<User | null> {
  const client = createAuthAdminClient();
  const { data, error } = await client.auth.admin.getUserById(authUserId);
  if (error) {
    if (error.status === 404 || error.message?.toLowerCase().includes('not found')) {
      return null;
    }
    console.error('Auth admin getUserById failed', error.message);
    throw new HttpError('Auth identity lookup failed', 502, 'auth_admin_error');
  }
  return data.user ?? null;
}

export async function inviteAuthUserByEmail(
  normalizedEmail: string,
  redirectTo: string,
): Promise<User> {
  normalizeMembershipEmail(normalizedEmail);

  const client = createAuthAdminClient();
  const { data, error } = await client.auth.admin.inviteUserByEmail(normalizedEmail, {
    redirectTo,
  });

  if (error) {
    const lower = error.message.toLowerCase();
    if (error.status === 429 || lower.includes('rate limit')) {
      throw new HttpError('Auth provider rate limited', 429, 'auth_rate_limited');
    }
    if (
      lower.includes('already') ||
      lower.includes('registered') ||
      lower.includes('exists')
    ) {
      const existing = await findAuthUserByNormalizedEmail(normalizedEmail);
      if (existing?.id) {
        return existing;
      }
    }
    console.error('Auth admin invite failed', error.message);
    throw new HttpError('Auth invite failed', 502, 'auth_invite_failed');
  }

  const user = data.user;
  if (!user?.id) {
    throw new HttpError('Auth invite returned no user', 502, 'auth_invite_failed');
  }

  const invitedEmail = authUserEmailNormalized(user);
  if (invitedEmail !== normalizedEmail) {
    throw new HttpError('Auth invite email mismatch', 502, 'auth_invite_failed');
  }

  return user;
}

export function getAuthInviteRedirectUrl(): string {
  const explicit = Deno.env.get('CONNECT_AUTH_INVITE_REDIRECT_URL')?.trim();
  if (explicit) return explicit;

  const base = Deno.env.get('CONNECT_PUBLIC_APP_URL')?.trim();
  if (base) {
    return base.replace(/\/+$/, '') + '/auth';
  }

  throw new HttpError(
    'Auth invite redirect is not configured',
    503,
    'invite_redirect_missing',
  );
}
