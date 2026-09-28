/** Tab-scoped flag: user may reset password on /nova-senha (not inferred from session alone). */
const STORAGE_KEY = "actus_connect_password_recovery_grant";

export function markPasswordRecoveryGrant(): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // sessionStorage unavailable — grant cannot persist across refresh
  }
}

export function hasPasswordRecoveryGrant(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearPasswordRecoveryGrant(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Implicit-flow recovery links include type=recovery in the URL hash before SDK sanitization. */
export function hashIndicatesRecovery(): boolean {
  if (typeof window === "undefined") return false;
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return false;
  return new URLSearchParams(hash).get("type") === "recovery";
}
