/**
 * Public institutional Actus Site URL (Connect → corporate site).
 * Configure via VITE_SITE_PUBLIC_URL (base URL, no trailing slash required).
 */
export function getInstitutionalSiteUrl(): string {
  const raw = import.meta.env.VITE_SITE_PUBLIC_URL;
  const base = typeof raw === "string" ? raw.trim() : "";

  if (!base) {
    return "http://localhost:5173";
  }

  return base.replace(/\/+$/, "");
}

export function navigateToInstitutionalSite(): void {
  window.location.assign(getInstitutionalSiteUrl());
}
