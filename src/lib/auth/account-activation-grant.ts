/** Tab-scoped flag: user may complete Connect activation (not inferred from session alone). */
const STORAGE_KEY = "actus_connect_account_activation_grant";

export function markAccountActivationGrant(): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // sessionStorage unavailable
  }
}

export function hasAccountActivationGrant(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearAccountActivationGrant(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Implicit-flow invite links include type=invite in the URL hash before SDK sanitization. */
export function hashIndicatesInvite(): boolean {
  if (typeof window === "undefined") return false;
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return false;
  const type = new URLSearchParams(hash).get("type");
  return type === "invite" || type === "signup";
}

export function searchParamsIndicateInvite(): { tokenHash: string } | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const type = params.get("type");
  const tokenHash = params.get("token_hash");
  if ((type === "invite" || type === "signup") && tokenHash) {
    return { tokenHash };
  }
  return null;
}
