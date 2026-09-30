import { HttpError } from './http.ts';

/** Must match webproc_private.normalize_membership_email (lower + trim, requires @). */
export function normalizeMembershipEmail(raw: string): string {
  const normalized = raw.trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) {
    throw new HttpError('Invalid email', 400, 'invalid_request');
  }
  return normalized;
}

export function authUserEmailNormalized(user: { email?: string | null }): string | null {
  if (!user.email) return null;
  try {
    return normalizeMembershipEmail(user.email);
  } catch {
    return null;
  }
}
