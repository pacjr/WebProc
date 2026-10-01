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

## AR-AC-DASH-01 — Operational Projection Boundary (WP-04 / WP-04C)

Dashboard and **ACTUS PULSE** analytics are projections of the Connect operational domain. They do not constitute a second source of truth and must not maintain parallel state to processes, timeline, situations, or other authoritative domain facts.

Analytics must derive from authoritative domain facts. The read layer must not redefine lifecycle or operational state.

Do not add dashboard or Pulse analytics tables or materialized views that duplicate domain truth for Step 2B / WP-04C.2.

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

## TD-AC-AUTH-02 — Supabase recovery pipeline (WP-04A.2c)

**Status:** CLOSED / PASS (manual E2E sign-off; implementation `dc8edd2`)

Verified:

- Recovery via e-mail; `redirectTo` → `/nova-senha` (implicit flow, no PKCE).
- `PASSWORD_RECOVERY` / recovery grant; new password + confirmation; `updateUser` effective.
- Recovery session ended after success; return to normal login (`/auth`).
- Normal session does not authorize reset; direct `/nova-senha` fail-closed; invalid/expired sanitized UI.
- `typecheck` and production `build` pass.

Implementation notes:

- `redirectTo`: `${origin}/nova-senha` (production origins must be allowlisted in Supabase Auth redirect URLs per environment).
- `/nova-senha` authorizes password reset only with an explicit recovery grant (`PASSWORD_RECOVERY` and/or `type=recovery` hash, persisted tab-scoped in `sessionStorage` for refresh within the same tab). Normal `getSession()` alone is insufficient.
- After successful reset: `signOut()` + success card → user navigates to `/auth` (recovery completion decoupled from WebProc).
- Invalid/expired/missing recovery: single product-facing blocked state (Supabase does not expose a reliable client-side split).

**Remaining (not WP-04A.2c):**

- Branded Actus Connect authentication e-mail templates (Supabase Dashboard / ops).
- PKCE migration if implicit recovery links are retired (not required for current project behavior).

## AR-AC-AUTH-05 — Internal Actor Precedence (WP-04A.2d)

If the same authenticated identity has active Actus authorization and active client membership, resolve it as **ACTUS**. The frontend sets `ConnectAccess.kind === 'ACTUS'` and does **not** attach a client membership for that session.

## AR-AC-AUTH-06 — Actus Supervisory Operational Scope (WP-04A.2d)

Actus internal users operate in transversal supervisory scope in Connect. Selecting or filtering a client does **not** change actor identity and must **never** create or emulate `usuarios_clientes` membership. The global operational dashboard belongs to **WP-04C** (separate workstream).

## TD-AC-AUTH-03 — Connect access resolution (WP-04A.2d)

**Status:** CLOSED / PASS (manual E2E sign-off; implementation `8c33f35`)

**Implementation:** `resolveConnectAccess()` — parallel `webproc.is_active_connect_actus_user()` + all active client memberships (no silent `.limit(1)`). Discriminated access: `ACTUS` | `CLIENT` | `CLIENT_SELECTION_REQUIRED` | `UNAUTHORIZED`.

**Migration:** `20260329120000_wp04a_connect_actus_access_rpc.sql` — **applied** on linked DEV Supabase project. Replicate on staging/production per environment. `webproc_private` remains outside PostgREST-exposed schemas; wrapper RPC returns boolean only.

**Verified manual E2E (DEV):**

*ACTUS actor:* login → ACTUS supervisory scope; header/banner identifies Actus supervision; global process visibility via existing RLS; client-only “Novo Processo” unavailable; process detail read-only for Actus; browser refresh reconstructs ACTUS access; no synthetic client membership.

*CLIENT actor:* login → CLIENT scope; correct client context; client-scoped process list; “Novo Processo” available; existing client behavior intact.

*Infrastructure / security:* `webproc.is_active_connect_actus_user()` works in DEV; no direct `usuarios_actus` table exposure; no service-role human authorization bypass.

**Non-blocking follow-up:**

1. Actus process-detail copy: replace client-oriented authorship/edit wording with supervision/read-only wording.
2. `CLIENT_SELECTION_REQUIRED`: interactive client selector still required for identities with multiple active client memberships (safe blocking state only today).

**Deferred (other workstreams):** supervisory cancellation/reconciliation; Flow → Connect client-facing projections; communication/WhatsApp discovery. (WP-04C read contract: **CLOSED** — see below; WP-04C.3 Pulse UI not started.)

**Domain direction (not part of WP-04A.2d):** After Flow imports a demand, Flow governs operational execution; Connect must not duplicate Flow operations; Flow transit logs remain internal unless a client-facing projection is defined.

## AR-AC-AUTH-02 — Credential Ownership

Supabase Auth is the **identity and credential authority** for Connect. Actus Connect domain tables store **authorization and operational identity context**, not user passwords. End users control their own credentials through Auth (login, recovery, future first-activation).

## AR-AC-AUTH-03 — Flow-Driven Provisioning (future)

Future **Actus Flow** is the intended long-term owner of client/user governance and cross-channel provisioning. Connect **transitional** administrative provisioning (WP-04A.3) exists only until Flow owns those workflows. Do not treat Connect admin APIs as permanent master-data authority.

## AR-AC-PROV-01 — Transitional Administrative Provisioning

Actus **ADMIN** (`webproc.usuarios_actus.papel = 'ADMIN'`, active) may administer Connect **clients** and **client memberships** through server-side RPCs (`webproc.admin_*`). **OPERADOR** retains existing supervisory **read** scope but is **not** authorized for provisioning mutations.

Membership lifecycle is soft (`ativo`); rows are not deleted. Supabase Auth invite/link is **WP-04A.3c** (umbrella); domain-only admin remains **WP-04A.3b**.

**Transitional one-active-client policy:** the schema remains multi-client capable, but admin create/reactivate enforces **at most one active client membership per normalized email / linked `user_id`** until client-selection UX exists. Error: `active_membership_other_client` (does not disclose the other client).

Derived membership states (API, not persisted): `PENDING_AUTH` (`ativo` + `user_id` null), `ACTIVE` (`ativo` + `user_id` set), `INACTIVE` (`ativo = false`). **`ACTIVE` does not mean password/activation completed** — first-login activation is WP-04A.3c.3.

**WP-04A.3c auth provisioning (current phase):** dual-hat is **not** allowed — an active `usuarios_actus` identity (by `user_id` or normalized email) must not link to a client membership (`actus_identity_conflict`). Auth email must match membership email via strict `lower(trim())` normalization only (no provider alias rules). **`webproc.server_prepare_client_membership_auth`** and **`webproc.server_link_client_membership_auth`** are **service_role only** (Edge + JWT actor); no browser `service_role`. Forward-only migrations after `20260329153000`; applied slices are immutable.

Reference harnesses: `supabase/reference/wp04a3b_domain_admin_validation_harness.sql`, `supabase/reference/wp04a3c1_auth_provision_db_validation_harness.sql`.

**WP-04A.3c.2 Edge orchestration:** Actus ADMIN calls Edge Function `provision-client-membership` with **`membership_id` only** (JWT supplies actor). Edge uses **service_role** only server-side for `server_prepare_client_membership_auth` → bounded GoTrue Admin email lookup / `inviteUserByEmail` → `server_link_client_membership_auth`. No browser-supplied `user_id` / email authority. Existing Auth identities link without recovery email; new identities use invite. **Auth + Postgres are not one transaction** — if link fails after Auth side effect, preserve Auth identity and retry (idempotent). Activation redirect/env is separate from recovery; activation UI remains **WP-04A.3c.3**. Edge secrets: `CONNECT_AUTH_INVITE_REDIRECT_URL` and/or `CONNECT_PUBLIC_APP_URL` for invite `redirectTo` (not `VITE_*` service role).

**WP-04A.3c.2 DEV validation (linked DEV):** Edge authz matrix exercised (anonymous / CLIENT / OPERADOR denied; ADMIN path provision + idempotent retry). Auth Admin invite operation succeeded and provisioning returned **`INVITED_AND_LINKED`**; **email delivery was not independently verified**. Intentional retained Auth artifact: invite-probe user for `wp04a3c2.edge.probe.*@insightaisolutions.com.br` (not deleted). After Edge probe, restore human DEV Auth passwords via Auth Admin (local shell + service role only); optional `ACTUS_CONNECT_DEV_ACTUS_PASSWORD` / `ACTUS_CONNECT_DEV_CLIENT_PASSWORD` env overrides, else operator-local `docs/dev-seed/auth-credentials.local.json` (**gitignored**, never commit).

**WP-04A.3c.3 Activation contract:** **Provisioning ≠ Activation ≠ Recovery.** Provisioning (3c.2) links Auth identity to membership; **activation does not authorize Connect** — after invite validation and password establishment, **`resolveConnectAccess()`** remains authoritative (active `usuarios_clientes` + active `cliente`, CLIENT/ACTUS precedence unchanged). **Authority boundary:** a valid Supabase Auth identity/session does **not** by itself grant Connect access; inactive membership removes Connect authorization while Auth may remain valid. Route: **`/auth/activate`** with tab-scoped activation grant (separate from recovery grant on **`/nova-senha`**). Invitation validation: hash `type=invite|signup` and/or `verifyOtp` for `token_hash`; fail closed without invite context (consumed replay and bare `/auth/activate` → invalid). Password: `supabase.auth.updateUser({ password })` only; no membership mutation from activation UI. Recovery semantics unchanged. Edge invite `redirectTo`: **`CONNECT_AUTH_INVITE_REDIRECT_URL`** or `CONNECT_PUBLIC_APP_URL` + **`/auth/activate`**. Legacy invites on `/auth` with invite hash redirect to `/auth/activate` (gate still required). **No DB migration** for 3c.3. **DEV E2E (WP-04A.3c.3a, PO sign-off):** Actus ADMIN → `provision-client-membership` → **`INVITED_AND_LINKED`** → real invite → `/auth/activate` → password → authenticated session → **`resolveConnectAccess()`** → CLIENT → **`/app/processos`**; recovery separation; inactive membership blocks Connect; CLIENT/ACTUS regressions PASS.

## AR-AC-PROV-02 — Legacy Customer Reference

Connect client identity uses internal `webproc.clientes.id` and mandatory **`codigo_cliente`** (unique legacy/business reference). Provisioning must supply `codigo_cliente` explicitly; **`codigo_cliente` is immutable** after create in WP-04A.3b admin updates. Reconciliation with legacy Actus customer master is **TD-AC-MIG-01** — no MySQL/Delphi sync in Connect MVP.

## TD-AC-MIG-01 — Customer Master Reconciliation (deferred)

`webproc.clientes` remains a **temporary** Connect client master (TD-WP-01) until FlowProc / Flow canonical master. `codigo_cliente` anchors transitional reconciliation; full migration alignment is out of scope for WP-04A.3b.

## WP-04A.3 — Connect Provisioning (roadmap)

| Work package | Status | Notes |
|--------------|--------|--------|
| WP-04A.3a — Provisioning backend audit | CLOSED / PASS | Audit-only |
| WP-04A.3b — Domain administration contract | CLOSED / PASS | Migration `20260329153000_wp04a3b_domain_admin_contract.sql` |
| WP-04A.3c — Auth provisioning (umbrella) | CLOSED / PASS | 3c.1 server contract + 3c.2 Edge orchestration + 3c.3 activation + DEV E2E |
| WP-04A.3c.1 — DB server contract | CLOSED / PASS | Migration `20260329160000_wp04a3c1_auth_provision_server_contract.sql` |
| WP-04A.3c.2 — Edge provisioning | CLOSED / PASS | Edge `provision-client-membership` (JWT → prepare → Auth Admin → link) |
| WP-04A.3c.3 — Activation UI | CLOSED / PASS | `/auth/activate` gate + password establishment; DEV E2E WP-04A.3c.3a |
| WP-04B — Actus ADMIN MVP (Administrative UI) | **CLOSED / PASS — MVP FROZEN** | Readiness WP-04B.4: **Recommendation A** — close/freeze; **no active ADMIN feature WP**. See closeout below. |
| WP-04B.0 — ADMIN capability probe | CLOSED / PASS | Migration `20260930160000_wp04b0_actus_admin_capability_probe.sql` — `is_active_connect_actus_admin()` + `fetchActusAdminCapability()` for **navigation/gating only**; **not** administrative authorization (`assert_actus_admin()` on `admin_*` / Edge unchanged). |
| WP-04B.1 — Admin foundation / client list | CLOSED / PASS | `/app/admin` + ADMIN-only nav; read-only `admin_list_clientes()`; capability probe is UX only. |
| WP-04B.2 — Client lifecycle | CLOSED / PASS | ADMIN create/rename/activate/deactivate via `admin_create_cliente` / `admin_update_cliente`; `codigo_cliente` immutable; soft lifecycle only (no DELETE). |
| WP-04B.3 — Membership lifecycle + provisioning UI | CLOSED / PASS | `/app/admin` → **Gerenciar acessos**; membership RPCs + Edge `provision-client-membership` (`{ membership_id }` only); DEV gate WP-04B.3a PASS. |
| WP-04B.4 — ADMIN MVP readiness review | CLOSED | Audit-only — **Recommendation A**: ADMIN MVP functionally complete; freeze feature development. |
| WP-04B.4a — ADMIN MVP documentation closeout | PO review | Documentation-only — records closure, boundaries, production handoff (this section). |

**No active ADMIN feature work package.** ADMIN MVP feature development is **frozen** unless PO explicitly reopens scope.

### WP-04B — Actus ADMIN MVP (implementation closeout)

**Status:** CLOSED / PASS — **MVP FROZEN** (baseline commit `b65a953` — membership lifecycle + provisioning UI).

**PO decision (WP-04B.4):** **A — CLOSE / FREEZE WP-04B ADMIN MVP.**

**Delivered chain (end-to-end product path):** Actus authentication → ACTUS Connect resolution → ADMIN capability → `/app/admin` → **Clientes** → client lifecycle → **Acessos** → access lifecycle → provisioning → invite → `/auth/activate` → password establishment → Connect CLIENT resolution → `/app/processos`.

**ADMIN MVP operations (no DELETE in product):** cadastrar cliente; editar nome; ativar/desativar cliente; cadastrar acesso; editar nome do acesso; ativar/desativar acesso (soft-disable); iniciar provisioning/convite; bloquear acesso por desativação de membership/cliente.

**Authority boundaries (unchanged):**

- **Frontend capability probe:** UX/gating only (`is_active_connect_actus_admin` / nav / route gate). UI route/nav visibility is **never** authorization.
- **Admin domain authority:** `webproc.admin_*` RPCs + `assert_actus_admin()`.
- **Provisioning authority:** Edge `provision-client-membership` + server-side `service_role` + `server_prepare_client_membership_auth` / `server_link_client_membership_auth` (actor from JWT).
- **Activation authority:** Supabase Auth establishes identity/session (`/auth/activate`, password).
- **Application authority:** `resolveConnectAccess()` determines ACTUS vs CLIENT Connect access after Auth.

**Out of scope for closed ADMIN MVP (P2 / future — no new WPs opened here):** resend-invite UX; Auth identity deletion/revocation UI; membership email change; `codigo_cliente` change; audit log; bulk operations; search/pagination; `/app/admin/clientes/:id`; provisioning reconciliation UI; broader ADMIN user-management UI in Connect.

**Functional closure ≠ production release.** Before production:

| MUST | |
|------|---|
| 1 | Migrations applied to target environment (incl. WP-04B.0 probe) |
| 2 | Edge `provision-client-membership` deployed |
| 3 | Edge redirect env vars (`CONNECT_AUTH_INVITE_REDIRECT_URL` / `CONNECT_PUBLIC_APP_URL`) |
| 4 | Auth redirect allowlist for app + `/auth/activate` |
| 5 | Production email deliverability strategy / custom SMTP as appropriate |
| 6 | Production Actus ADMIN bootstrap (`usuarios_actus.papel = 'ADMIN'`) |
| 7 | Staging ADMIN smoke |
| 8 | Staging provision → activation → CLIENT smoke |
| 9 | RPC grants / exposed `webproc` schema / RLS verification |

**SHOULD:** ADMIN operator guidance; staging fixture hygiene; monitoring/reconciliation procedure for link failures; final browser visual walkthrough of `/app/admin`.

**Email boundary:** “Convite enviado” (product copy) does **not** certify email delivery. DEV Supabase bounce alerts imply: avoid fictitious addresses in real invite tests; use controlled addresses; treat deliverability/SMTP as **production-readiness**, not ADMIN MVP feature work.

**Next macro direction (handoff only — not started by WP-04B closeout):** after production-readiness gates, **Product / UI-UX Readiness** for operational routines. Established language decision: use **“Protocolos”** as primary user-facing terminology where that is user-known vocabulary; do **not** impose **“Demandas”** as the main operational label. Pulse keeps its analytic semantics. **Does not authorize** renaming Processos/routes/components in a documentation-only closeout.

## AR-AC-UX-PROTO-01 — Protocolos operational UX (PO source of truth)

**Status:** APPROVED (PO decisions after UX-01 discovery). **Scope:** Product/UI-UX Readiness for Connect operational registration — **not** Pulse redesign, **not** domain schema rename.

**Intent:** Preserve legacy **data and operational mental model**, not legacy **layout**.

### Operational core (user-facing MVP)

| Field / concept | In MVP UX | Notes |
|-----------------|-----------|--------|
| Nº do Processo | Yes | |
| Reclamante | Yes | |
| Reclamado | Yes | |
| Data de Entrada | Yes | |
| Data Fatal | Yes | |
| Status | Yes | Existing controlled lifecycle |
| Instrução | Yes | |
| Observações | Yes | |
| Documentos | Yes | Single section; see below |
| Execução Provisória | Yes | Approved domain extension; keep cadastro simple (e.g. alternate to nº processo at protocolar) |

### Identificação XOR (PO final — 2026-09-30)

Each protocol has **exactly one** business identifier:

- **A)** `n_processo` (Nº do Processo), **or**
- **B)** `exec_prov` (Execução Provisória)

| n_processo | exec_prov | Valid |
|------------|-----------|-------|
| set | empty | yes |
| empty | set | yes |
| empty | empty | no |
| set | set | no |

Applies from **initial create / draft save** onward (frontend enforced).

**Domain enforcement (PROTO-DOM.1 — CLOSED/PASS on DEV, end-to-end):** Migration `20260930180000_proto_dom1_identificacao_xor` (immutable once applied). `processo_identificacao_xor_ok`, CHECK `processos_identificacao_xor_check`, `identificacao_xor_violation` in `salvar_rascunho` / `protocolar_processo`. **PROTO-DOM.1a** (`20260930200000_proto_dom1a_xor_check_authenticated_execute`): `GRANT EXECUTE` on the XOR helper to `authenticated` so Data API INSERT/UPDATE can evaluate the CHECK (root cause: helper had `REVOKE FROM PUBLIC` without role grant; superuser harness did not reproduce PostgREST role). Harness: `supabase/reference/proto_dom1_identificacao_xor_harness.sql` (uses `SET LOCAL ROLE authenticated` / `anon`).

### `instituicao`

- **Out of MVP operational UX** — legacy screen presented by PO has no such field.
- **Do not expose** in Protocolos UI.
- **Do not drop or alter** `webproc.processos.instituicao` (technical column may remain unused in UX).

### Documentos (functional requirement)

- MVP Protocolos UX **must** support both:
  1. attach a **file**;
  2. provide a **link** to download/document.
- Present both under one user concept: **“Documentos”**.
- **Do not** expose technical types **LINK** / **ARQUIVO** in product copy.
- Backend: existing `processo_documentos` + Edge upload/download path (`webproc-document-upload-*`, etc.) **must be reflected in UX specification**.
- File-upload UX **may ship in a dedicated implementation slice**, but is **required for Product/UI-UX Readiness** — not optional P2.

### Terminology (unchanged)

- Operational UX: **Protocolos** (primary user language).
- Technical domain: **`processo` / `id_proc` / RPC names** — no requirement to rename tables/types for MVP UX.
- Pulse: analytic **Demandas** semantics remain; do not replace operational “Protocolos” with “Demandas”.

**Next documentation slice:** UX-02 — Protocol Registration UX Specification (incorporates this AR).

### UX-02 — Protocolos Operational UX Specification

**Status:** PO REVIEW (2026-09-30). **Artifact:** [`docs/UX-02-Protocolos-Operational-UX-Specification.md`](./UX-02-Protocolos-Operational-UX-Specification.md).

### PROTO-UI.1 — Protocolos operational UI foundation

**Status:** **CLOSED/PASS** (2026-09-30). CLIENT DEV browser gate A–G PASS on `localhost:8080` after AUTH-DEV-01b credential restore and PROTO-DOM.1a ACL fix.

**Delivered:** Protocolos copy/nav (Pulse → Protocolos → Novo protocolo); list cards; detail sections; Documentos placeholder + links; XOR radio + `validateIdentificacaoXor`; draft save + protocolization smoke PASS.

### PROTO-DOM.1 / PROTO-DOM.1a — Identification XOR domain

**Status:** **CLOSED/PASS** on DEV (structural invariant + authenticated write path). Migrations `20260930180000` + `20260930200000` applied; harness PASS under `authenticated`/`anon` roles; Data API insert regression PASS.

**PO gaps documented (not in PROTO-UI.1 scope):**

| Topic | PO expectation | Current domain/UI | Next slice |
|-------|----------------|-------------------|------------|
| Cancelamento | Allowed only `EM_PREENCHIMENTO` / `PENDENTE`; not delete | **PROTO-UI.2 CLOSED/PASS** — detail action + `cancelar_processo` RPC | — |
| Data de Entrada | Default now, immutable | **PROTO-UI.2** — DB `DEFAULT now()`; UI read-only + copy | — |
| Data Fatal | Default now on create, editable | **PROTO-UI.2** — local-date default on Novo; domain past-date rules unchanged | — |

### PROTO-UI.2 — Dates + cancellation operational rules

**Status:** **CLOSED/PASS** (2026-10-01). Data Fatal default on create; Data de Entrada presentation; cancel action for draft/pending creator via existing RPC (no DELETE).

### PROTO-UI.2b — Novo identification + Documentos on create

**Status:** **CLOSED/PASS** (2026-10-01). **Manual PO browser gate** in the PO’s real CLIENT session (`localhost:8080`); not automated E2E (Cursor MCP browser is session-isolated from the PO browser).

**Delivered:**

- Removed identification radio; **Nº do Processo** and **Execução Provisória** always visible with mutual disable (no destructive clearing); XOR validation unchanged.
- **Documentos** on Novo via reused `ProcessoDocumentosSection`; `ensureDraftPersisted` + `draftIdProc` so link add creates one draft and **Salvar rascunho** updates via `saveProcessoDraft` (no duplicate INSERT in session).
- Lighter **Cliente** presentation on Novo (`clientePresentation="context"`).

### PROTO-DOC.1 — Unified Documentos foundation (links)

**Status:** **CLOSED/PASS** (2026-10-01). PO approved; committed on `main` (no push).

**Delivered:**

- Single **Documentos** section (`ProcessoDocumentosSection`) for links today; list query `listProcessoDocuments` returns active rows (LINK + future ARQUIVO when stored).
- Link create unchanged: direct INSERT via `addProcessoLink` (draft creator, `EM_PREENCHIMENTO`).
- Link remove: **`remover_documento` RPC** (`removerDocumento` helper); confirmation dialog; authoritative list refresh (no direct DELETE, no optimistic-only removal).
- Checklist / client validation: **`countActiveProcessoDocuments`** / `activeDocumentCount` (not `links.length`).
- Product copy: Nome do documento, Endereço do documento, Adicionar, Abrir, Remover; restrained file-attachment “em breve” note (no fake upload).
- Domain error mapping: `documento_not_found`, `invalid_status_for_document_mutation`, `arquivo_removal_requires_coordination`.

**Validation (DEV):** `npm run typecheck` PASS; `npm run build` PASS; `git diff --check` PASS; CLIENT smoke A–J on `localhost:8080` (see UX-02 § PROTO-DOC.1 evidence).

**DB migration:** **None** (existing WP-03 contract sufficient).

**Remaining implementation gaps (post DOC.1):**

| Gap | Class |
|-----|--------|
| Documentos: upload prepare, PUT, confirm, download; ARQUIVO in unified list; file-removal coordination; stored-file checklist | **PROTO-DOC.2 (pending)** |
| Detail view/edit IA | PROTO-UI.3 |
| List server-side search | optional backend |

**Product/UI-UX Readiness:** NOT closed — PROTO-DOC.2 + PROTO-UI.3 + PROTO-UX.GATE remain (PROTO-DOC.1 link foundation closed).

---

## AR-PROTO-GOV-01 — Protocol Temporal & Decision Governance

**Status:** **APPROVED / RECORDED** (2026-10-01). **Not implemented** in PROTO-UI.2d — documentation and backlog only.

### Separation of concepts

| Concept | Meaning |
|---------|---------|
| **Lifecycle state** | `EM_PREENCHIMENTO`, `PENDENTE`, `IMPORTADO`, `CONCLUIDO`, `CANCELADO` |
| **Temporal condition** | Derived from `dt_fatal` vs current business time — **not** a lifecycle status |
| **Human operational decision** | Cancel, change Data Fatal, continue handling, etc. |

Do not overload lifecycle status with temporal conditions.

### Data Fatal — D0 (“Data Fatal hoje”)

When a **non-terminal** protocol has `dt_fatal` equal to the **current business date**, expose an operational **attention** condition (“Data Fatal hoje”). Initial primary surface: **Pulse** (anticipate operational risk). **No automatic lifecycle mutation.**

### Data Fatal — D+1 and beyond (“Data Fatal vencida”)

When **business today > dt_fatal** and the protocol remains operationally unresolved / non-terminal, derive **“Data Fatal vencida”** with aging (D+1, D+2, …). Stronger attention condition. The system **must not** automatically cancel, change `dt_fatal`, change lifecycle, or infer fault. **Actus governance** decides the response.

### Pulse responsibility (future)

Pulse should eventually surface temporal exceptions (drafts aging, Data Fatal today, Data Fatal overdue, pending without evolution). **Pulse = observation/supervision**; **Protocolos = operational execution**. Not implemented in this slice.

### Notifications (future)

Channels may include in-app and email. Notifications **consume the same temporal-condition rules**; email is delivery only, not authority for overdue state. Not implemented.

### Data Fatal history (future — domain gap)

Editable `dt_fatal` must **not** erase historical truth. Future implementation must audit at minimum: `id_proc`, previous `dt_fatal`, new `dt_fatal`, actor, timestamp, reason/motivo. Current `dt_fatal` remains effective value. Example: fatal 01/10 changed on 02/10 to 05/10 must preserve that 01/10 was once valid and the change occurred after that deadline.

### Cancellation governance (future — domain gap)

Cancellation remains lifecycle → `CANCELADO`, never DELETE. **Approved:** **cancellation reason required** with decision trail: `id_proc`, actor, timestamp, previous status, reason, Data Fatal effective at cancellation. **`cancelar_processo` today accepts optional `p_motivo`** — record as **domain gap** requiring forward migration / RPC contract change. **Do not** auto-cancel overdue protocols.

### Governance boundary

The system may **observe and inform**; it must **not** automatically decide administrative consequences of overdue protocols unless Actus defines that later (cancel, regularize, change deadline, justify, escalate, continue). **Automatic cancellation is not approved.**

### UX-PROTO-BLOCK-01 — Protocolization blocking feedback

**Status:** **CLOSED / PASS** (2026-10-01). PO manual visual smoke: central blocker displayed correctly; missing document clearly visible; visual behavior approved.

**Delivered:** When **Protocolar** is blocked by incomplete mandatory requirements, a central **AlertDialog** lists blockers derived from `validateProtocolFields` / `collectProtocolizationBlockers` (same rules as checklist). **No `protocolar_processo` RPC** on client-known incomplete state. Server readiness domain codes map to the same dialog; other failures remain toast. After close, protocolization checklist section receives restrained ring/background emphasis and focus.

**Implementation explicitly out of scope for AR-PROTO-GOV-01 recording:** Data Fatal history tables, cancellation-required migrations, Pulse aging queries, notification/email logic, automatic cancellation, protocolization modal, PROTO-DOC.2, PROTO-UI.3, visual redesign.

## Authorship Model (WP-01C)

- `webproc.processos.created_by` is the immutable technical author (`auth.users.id`).
- Operational display identity is resolved through `webproc.usuarios_clientes` (`nome`, `email`) linked by `user_id`.
- Author names/emails are not duplicated on `webproc.processos`.
- Reassignment and impersonation are out of scope; future actions by another authorized user use that user's own authentication identity without overwriting original authorship.

---

## WP-04C — ACTUS PULSE (Connect Read Contract)

### Roadmap status

| Work package | Status | Notes |
|--------------|--------|--------|
| WP-04C.1 — Pulse data audit | CLOSED / PASS | Connect demand facts on `webproc.processos` |
| WP-04C.2a — Pulse read contract design | PASS | Five public RPCs + author resolver |
| WP-04C.2b — Pulse read layer implementation | CLOSED / PASS | Commit `763a2c8` — `feat(pulse): add Connect Pulse read contract`; migration `20260329140000_wp04c_pulse_read_layer.sql` applied on linked DEV |
| WP-04C.3 — ACTUS PULSE MVP (Connect UI) | **CLOSED / PASS** | Connect Pulse feature development **frozen** for MVP — see below |
| WP-04C.3c — Pulse MVP readiness review | CLOSED | Recommendation **A**: PULSE MVP FUNCTIONALLY COMPLETE — STOP FEATURE DEVELOPMENT |
| WP-04C.3d — Pulse MVP closeout + pre-prod gate | PO review | Documentation / validation only (no feature WP) |

**No active Pulse feature work package.** Next Connect work returns to broader roadmap / production readiness, not additional Pulse UI slices unless PO explicitly reopens scope.

### WP-04C.3 — ACTUS PULSE MVP (implementation closeout)

**Status:** CLOSED / PASS (baseline commit `a4cb4dd` — demand drill-down with keyset pagination).

**PO decision (WP-04C.3c):** **A — PULSE MVP FUNCTIONALLY COMPLETE — STOP FEATURE DEVELOPMENT.**

| Milestone | Status | Evidence |
|-----------|--------|----------|
| WP-04C.3a — UI/UX audit | PASS | Audit-only (no commit) |
| WP-04C.3b.1 — Filters + summary KPIs | CLOSED | Commit `cc9ed62` |
| WP-04C.3b.2 — Daily REGISTERED series + lazy Pulse route | CLOSED | Commit `0591cbc` |
| WP-04C.3b.3 — User / client distributions | CLOSED | Commit `708e2db` |
| WP-04C.3b.4 — Demand drill-down | CLOSED | Commit `a4cb4dd` |
| WP-04C.3c — Readiness review | CLOSED | Recommendation A (audit-only) |

#### Connect Pulse analytical chain (MVP)

Under **applied** analytical filters (draft → Apply):

1. KPI summary (`pulse_summary`)
2. Daily **REGISTERED** series (`pulse_daily_series` — cadastros por dia)
3. Distribution by user — **REGISTERED** (`pulse_by_user`)
4. Distribution by client — **REGISTERED**, **ACTUS only** (`pulse_by_client`)
5. **REGISTERED** demand drill-down (`pulse_drilldown`, keyset pagination)
6. Navigation to existing **`/app/processos/:idProc`** — **ProcessoDetail** remains operational authority

Pulse is an **analytical projection / cockpit** over Connect demand facts. It does **not** maintain parallel operational state.

Pulse is **not**:

- a second operational source of truth;
- a process-management module or Flow substitute;
- an employee productivity or performance-ranking system;
- a representation of total Actus workload outside the Connect domain;
- a reporting/export subsystem;
- an AI/Cortex interpretation layer.

#### MVP UI performance boundary

Route **`/app/pulse`** is **lazy-loaded** (`React.lazy` + `Suspense` in `src/App.tsx`) so Recharts and Pulse analytics code do **not** inflate the normal Processos / auth entry path.

Reference production build measurements (not contractual budgets):

| Chunk | Raw | Gzip |
|-------|-----|------|
| Initial app bundle | ~610.78 kB | ~180.95 kB |
| Lazy `PulsePage` chunk | ~497.78 kB | ~140.77 kB |

#### Pre-production gate (release validation — not a feature WP)

**MUST before production:**

1. Confirm migration **`20260329140000_wp04c_pulse_read_layer.sql`** is applied in the target environment (Pulse RPCs, author resolver, RLS-invoker behavior).
2. **CLIENT** staging smoke: login → `/app/pulse` → expect `pulse_summary`, `pulse_daily_series`, `pulse_by_user`, `pulse_drilldown` — **never** `pulse_by_client` → drill-down → **Ver processo** → correct **ProcessoDetail** → return to Pulse.
3. **ACTUS** staging smoke: supervisory identity → global Pulse → optional **client analytical filter** (no identity / membership switch) → supervisory process detail remains **read-only**.
4. Confirm target-environment RPC availability, `authenticated` execute grants, and RLS behavior for both actors.

**SHOULD if practical:**

- Mobile (~390px) and dark-theme visual pass on Pulse.
- Inactive historical-author label spot-check if a safe fixture exists in staging.

#### Post-MVP P2 backlog (non-blocking — do not implement under frozen MVP)

- Possible duplicate inactive-author wording (SQL resolver suffix + UI “associação inativa”).
- `keepPreviousData` brief stale-scope presentation on Apply (mitigated by “Atualizando…” copy).
- Long one-scroll page / mobile table density.
- Optional future Pulse chunk splitting beyond current lazy route.
- Live chart tooltip hover regression.
- Load-more error path fault injection.
- Same-`created_at` keyset pagination tie fixture (SQL tie-break exists; DEV lacked sample).
- Optional inactive historical-author browser fixture.

### Positioning and terminology

**ACTUS PULSE** is the operational intelligence / analytical experience being developed over Actus operational domains.

For **Actus Connect**, Pulse projects facts from the Connect domain only. Connect remains: *Relacionamento e entrada digital de demandas.*

Pulse is **not**:

- a second source of truth;
- the complete operational universe of Actus;
- a replacement for Flow;
- an AI-generated interpretation layer;
- a process-management replacement or employee productivity system (see WP-04C.3 MVP chain above).

Future **ACTUS FLOW** may expose Pulse over the broader Actus operational universe (including demands originating outside Connect). Flow implementation is out of scope here.

**Terminology:**

- **ACTUS PULSE** — operational intelligence / cockpit experience.
- **Analytics** — metrics, trends, series, distributions, and analytical projections *inside* Pulse.
- **Reports / Relatórios** — reserved for actual report/export capabilities (not WP-04C.2).
- Do **not** use **Insight** as the Pulse UI label (collision with Insight AI Solutions institutional identity).

### Connect Pulse universe (WP-04C.2)

The read contract covers **`webproc.processos`** and related Connect authorization/identity context only. Connect Pulse measures the Connect universe.

**Do not** add demand origin/provenance columns to Connect for Pulse. Equivalent metrics may eventually share semantic definitions with Flow Pulse while underlying data sources differ.

**Implemented lifecycle dimensions (read layer):** registered (`created_at`), protocolled (`pendente_at`), imported (`importado_at`), plus **current `status`** for filtering and snapshot counts.

**Deferred analytics (domain facts exist; not in WP-04C.2 RPC metrics):** concluded (`concluido_at`), cancelled-as-event (`cancelado_at`) as lifecycle-in-period series — document domain semantics below for future work; WP-04C.2 does not count cancellation *events* by `cancelado_at`.

### Business time

- Pulse business timezone: **`America/Sao_Paulo`**.
- Database timestamps remain **`timestamptz`**.
- Date periods use local business-day boundaries, half-open: **[start of local day, start of next local day)**.
- Daily analytical buckets use the same business timezone.

### Lifecycle and status semantics

| Concept | Field | Role in WP-04C.2 |
|---------|--------|-------------------|
| Registered / Cadastrada | `created_at` | Lifecycle-in-period + REGISTERED drilldown basis |
| Protocolled / Protocolada | `pendente_at` | Lifecycle-in-period + PROTOCOLLED basis |
| Imported / Importada | `importado_at` | Lifecycle-in-period + IMPORTED basis |
| Concluded / Concluída | `concluido_at` | Domain fact; **not** a WP-04C.2 aggregate axis |
| Cancelled / Cancelada | `cancelado_at` | Domain fact; **not** a WP-04C.2 lifecycle counter |

**Current `status`** (e.g. `CANCELADO`) is distinct from lifecycle event timestamps. Filtering by current status does **not** mean “cancelled in period.” A demand registered in a period remains in **registered** history even if current status later becomes `CANCELADO`.

**Connect Pulse MVP UI (WP-04C.3):** The daily chart, user/client distribution tables, and demand drill-down use **`REGISTERED`** semantics (`created_at` in period). Summary KPIs additionally show **protocolled** and **imported** lifecycle-in-period counts and a **current-state snapshot** block — do **not** expect snapshot totals (e.g. “Total no escopo”) to reconcile with REGISTERED event totals; they answer different questions.

Under identical applied filters, REGISTERED counts should reconcile across: summary `registered_count`, sum of daily `registered_count`, sum of by-user/by-client REGISTERED aggregates, and complete REGISTERED drill-down traversal (contract + fixture evidence on linked DEV; see residual gaps below).

### Snapshot semantics

- Default summary snapshot: **`ALL_IN_SCOPE`** — current state of all demands visible in caller scope (after filters).
- Optional: **`REGISTERED_IN_PERIOD`** — current state restricted to demands **registered** in the selected period.
- Do not interchange these modes silently.

### Actor and scope

**CLIENT**

- Analytics restricted to the caller’s **own authorized Connect universe** (RLS on `webproc.processos`).
- Must not supply `p_cliente_id` / `clienteId` (rejected at RPC layer); no client switching via Pulse.
- **No by-client projection** — frontend does not call `pulse_by_client` for CLIENT actors.
- User filters operate only within the visible domain.
- Detail navigation uses existing client-scoped **ProcessoDetail**; Pulse does not override authorization.

**ACTUS**

- Transversal **supervisory analytical** view over Connect demands visible under Actus authorization.
- Optional `p_cliente_id` is an **analytical filter only**; never changes actor identity; no synthetic `usuarios_clientes` membership (see AR-AC-AUTH-05 / AR-AC-AUTH-06).
- Pulse introduces **no mutation authority** (read-only analytics + links to existing read-only supervisory detail).

**ACTUS by-user identity:** **`(cliente_id, created_by)`** — do not treat `created_by` globally across clients.

Raw demand counts by user are **demand registration/activity volume**, not employee “productivity,” unless a future domain contract defines otherwise.

### Historical author attribution (Pulse resolver)

- **Current active authorization ≠ historical actor attribution.**
- **Server-resolved** display labels (`pulse_author_identity`); frontend must not reconstruct historical authors from live membership lists alone.
- Technical anchor: immutable **`created_by`** on `webproc.processos`.
- Labels may reflect **inactive** membership when historically visible; email is **not** part of the default Analytics author display contract.

**Architecture (approved, do not redesign casually):**

| Function | Security | Role |
|----------|----------|------|
| `pulse_caller_can_see_author_context` | INVOKER | Visibility gate on `webproc.processos` (RLS as session user) |
| `pulse_author_identity` | DEFINER | Narrow label resolver after gate; not a cross-client directory |

### Security / RPC boundary

**Authenticated public Pulse API:**

- `pulse_summary`, `pulse_daily_series`, `pulse_by_user`, `pulse_by_client`, `pulse_drilldown`

**Not authenticated-facing RPC surface** (no direct `EXECUTE` for `authenticated`):

- `pulse_period_bounds`, `pulse_assert_cliente_filter_allowed`, `pulse_filtered_processes`

**PUBLIC / anonymous:** denied on Pulse RPCs.

**Note:** `pulse_by_client` is exposed via PostgREST but **domain-authorized for ACTUS only** — exposed RPC ≠ actor authorization.

Reference harness: `supabase/reference/wp04c_pulse_validation_harness.sql`.

### Drilldown pagination

Stable ordering: **`created_at DESC`, `id_proc DESC`**.

| Cursor state | Behavior |
|--------------|----------|
| Both `NULL` | First page |
| Both supplied | Keyset next page |
| Exactly one supplied | `pulse_invalid_drilldown_cursor` (no silent restart) |

### DEV validation evidence (authenticated E2E)

Linked DEV authenticated E2E **PASS** (no credentials or fixture UUIDs recorded here):

- **CLIENT:** own-scope visibility; summary, daily series, by-user, drilldown; foreign `cliente_id` rejection; `pulse_by_client` rejection.
- **ACTUS:** global summary; Cliente A/B filters; by-user `(cliente_id, created_by)` grouping.
- **Snapshot:** `ALL_IN_SCOPE` default; `REGISTERED_IN_PERIOD` callable.
- **Lifecycle / status:** current `CANCELADO` filter behavior; registered counts stable vs status changes.
- **Timezone:** single-day series under `America/Sao_Paulo`.
- **Drilldown:** both-null, partial rejection, paired cursor.
- **RPC exposure:** internal helpers denied; public RPCs callable per actor rules; anonymous denied.
- **Author anti-directory:** CLIENT A invoked `pulse_author_identity` with controlled CLIENT B membership `user_id` input — result `display_name = "Usuário desconhecido"`, `membership_active = false`; no foreign name, email, or actual membership state exposed; no DB mutation.

### Residual non-blocking test coverage (regression gaps)

Not implementation defects; do not block WP-04C.2 / WP-04C.3 MVP release (see also Post-MVP P2 backlog under WP-04C.3):

1. **Hidden foreign-process RLS** — CLIENT B had no `processos` rows; no runtime case where B has a process hidden from A by RLS.
2. **Historical inactive author** — no safe inactive historical author fixture in DEV E2E.
3. **Duplicate `created_at` pagination** — no DEV sample with shared `created_at` for explicit tie-break proof.
4. **CLIENT process-detail browser smoke** — not re-exercised in final drill-down pass (ACTUS regression PASS).

### AR-ACTUS-PULSE-01 — Analytics as Intelligence Foundation

Pulse metrics and projections must have stable, traceable, **AI-independent** semantics so future prediction and Cortex layers can consume trusted facts.

### AR-ACTUS-PULSE-02 — Prediction Authority Boundary

Operational predictions derive from explicitly defined facts/models. Cortex may contextualize, explain, or communicate predictions; linguistic inference is **not** an operational fact. Do not introduce Cortex or forecasting into Connect MVP implementation.

**Deterministic architecture direction (future — not Connect MVP):**

Operational facts → Pulse Analytics (deterministic) → statistical / forecast layer → Prediction Facts → Cortex explanation / context → human or explicitly authorized action.

**Connect Pulse MVP remains deterministic.** Cortex / LLM is **not** operational fact authority and is **not** implemented in WP-04C.3.

Core metrics must not depend on an LLM inventing or recalculating operational facts via arbitrary SQL.

---

## Flow Discovery Ledger (WP-04C forward observations)

Forward observations only — **no Flow tables or implementation** in Connect. The following are **explicitly deferred to Flow Discovery** (do not implement in Connect Pulse MVP):

- Demand **origin / channel** and provenance beyond Connect intake
- Manual Flow registration and **spreadsheet imports**
- **Calculator assignment** and process **affinity**
- **Protocol executor**, **transit logs**, internal operational **notes**
- **Deadlines**, **cycle time**, **workforce / capacity**
- **Cross-channel workload** and **procedure execution**
- **DHE distribution**
- **Flow → Connect lifecycle projection**
- Broader **Flow Pulse** over the complete Actus operational universe

Cross-cutting ledger items:

1. **Flow Pulse** should eventually represent the complete Actus operational universe, not only Connect intake.
2. **Flow Discovery** must model demand **origin/provenance** explicitly: origin/channel; requester/source actor; operator who manually registered/imported when applicable.
3. Equivalent Connect/Flow analytical metrics should share **semantic definitions** where appropriate, even when data sources differ.
4. Future forecasting may use richer Flow facts (demand arrivals, procedures, clients, distribution, calculators, deadlines, cycle times, etc.).
