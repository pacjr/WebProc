# WebProc Technical Debt

## TD-WP-01 — Temporary Client Master

`webproc.clientes` is a temporary WebProc client master table introduced in WP-01.

Future target: **FlowProc** should become the canonical client master. Do not integrate FlowProc in WP-01.

## TD-WP-02 — Legacy Supabase Objects

Existing `public` schema tables, RLS policies, Storage objects, and legacy Edge Functions remain preserved as historical/reference sources until the new WebProc application passes validation.

**Rule:** No legacy object should be deleted during reconstruction.

Legacy runtime code must not be used for new WebProc features. New runtime code uses the `webproc` schema only.

## TD-WP-03 — Same-Client Membership Visibility for Author Display

Resolved in WP-01D (`20260307200000_wp01d_same_client_membership_select.sql`).

Authenticated users with an active membership in client X may SELECT active membership identity rows (`user_id`, `nome`, `email`, `cliente_id`) for client X only. Cross-client and inactive membership reads remain denied. Authorization is evaluated through `webproc_private.has_active_client_membership()` to avoid RLS recursion on `webproc.usuarios_clientes`.

## Deployment Portability

The following constraints apply to every environment (development, staging, production):

1. **Supabase Data API must expose schema `webproc`.** Without it, PostgREST returns `PGRST106` and WebProc queries fail before RLS is evaluated. Preserve existing exposed schemas and add `webproc` (for example: `public`, `graphql_public`, `webproc`).

2. **Required WebProc tables must be exposed through the Data API.** At minimum: `webproc.clientes`, `webproc.usuarios_clientes`, `webproc.processos`, `webproc.processo_documentos`.

3. **Internal trigger functions do not need Data API exposure.** Functions such as `webproc.set_updated_at()` are invoked by triggers only.

4. **Current Supabase and Cloudflare infrastructure is temporary.** Development/staging may run on Insight-owned accounts during reconstruction.

5. **Production infrastructure will be recreated or migrated to Actus-owned accounts.** Do not treat current project refs, bucket names, or account IDs as permanent.

6. **Required Edge Functions must exist in Git and be reproducible during Actus deployment.** No runtime may depend on dashboard-only functions that are absent from the repository.

7. **No account IDs, project refs, bucket identifiers, secrets, or administrative UUIDs may become application business logic.** Configuration belongs in environment variables and deployment docs; authorization belongs in RLS and membership data—not hard-coded identifiers in source code.

## AR-AC-DASH-01 — Operational Projection Boundary (WP-04)

The Actus Connect Dashboard is a projection of the operational domain. It does not constitute a second source of truth and must not maintain parallel state to processes, timeline, situations, or other authoritative domain facts.

Implementation belongs to WP-04. Do not add dashboard analytics tables or materialized views for Step 2B.

## TD-AC-LEGACY-FE-01 — Legacy public-schema frontend retired (Step 2B)

The legacy `/dashboard/*` Lovable frontend was removed. The following backend artifacts may remain unreferenced by the Connect frontend and are **cleanup candidates only** (no destructive DB/Edge changes in Step 2B):

- **Public tables (historical):** e.g. `public.clientes`, `public.t_processoweb`, legacy attachment metadata as used by the old dashboard
- **Legacy Edge Functions:** `list-attachments`, `upload-attachment`, `delete-attachment` (distinct from validated `webproc-document-*`)

Do not drop migrations, tables, or WP-03 functions without a separate controlled backend cleanup step.

## AR-AC-IDENT-01 — Actus Connect Product Identity V1 (WP-04A.2a CLOSED)

**Status:** CLOSED / APPROVED (manual visual sign-off)

Presentation-only identity for Connect auth surfaces:

- **Shared Login:** `@insight/product-login-system` v1.1.0 (Git dependency; package source not forked).
- **Product mark:** `src/assets/auth/actus-connect-mark-light.png` (light) and `actus-connect-mark-dark.png` (dark); **72px** rendered height in auth card; theme via `html.dark` + `ActusConnectLogo`.
- **Login card:** no separate “Acesso” heading; mark + `authDescription` hierarchy.
- **Auth shell:** `ActusConnectAuthShell` + scoped tokens in `src/styles/product-login-theme.css` and `actus-connect-auth.css` (Connect-owned; not Actus-Site).
- **Hero:** `src/assets/auth/actus-connect-auth-hero.png` with approved border/framing rules.
- **Favicon:** `public/favicon.png` derived from the approved **light** mark; referenced in `index.html`. No PWA/manifest icon set yet.

**Deferred (not part of V1):** PWA icons (192/512/maskable/splash), browser favicon dark-mode swap, final wordmark in auth card.

## Authorship Model (WP-01C)

- `webproc.processos.created_by` is the immutable technical author (`auth.users.id`).
- Operational display identity is resolved through `webproc.usuarios_clientes` (`nome`, `email`) linked by `user_id`.
- Author names/emails are not duplicated on `webproc.processos`.
- Reassignment and impersonation are out of scope; future actions by another authorized user use that user's own authentication identity without overwriting original authorship.
