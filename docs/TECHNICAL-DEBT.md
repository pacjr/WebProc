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
| WP-04C.3 — ACTUS PULSE / Analytics UI | **Not started** | Next workstream after this closeout |

### Positioning and terminology

**ACTUS PULSE** is the operational intelligence / analytical experience being developed over Actus operational domains.

For **Actus Connect**, Pulse projects facts from the Connect domain only. Connect remains: *Relacionamento e entrada digital de demandas.*

Pulse is **not**:

- a second source of truth;
- the complete operational universe of Actus;
- a replacement for Flow;
- an AI-generated interpretation layer.

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

### Snapshot semantics

- Default summary snapshot: **`ALL_IN_SCOPE`** — current state of all demands visible in caller scope (after filters).
- Optional: **`REGISTERED_IN_PERIOD`** — current state restricted to demands **registered** in the selected period.
- Do not interchange these modes silently.

### Actor and scope

**CLIENT**

- Analytics restricted by RLS to authorized client scope.
- Must not supply arbitrary `p_cliente_id` to switch identity (rejected at RPC layer).
- User filters operate only within visible domain.

**ACTUS**

- Transversal supervisory analytical scope.
- Optional `p_cliente_id` is an **analytical filter only**; never changes actor identity; no synthetic `usuarios_clientes` membership (see AR-AC-AUTH-05 / AR-AC-AUTH-06).

**ACTUS by-user identity:** **`(cliente_id, created_by)`** — do not treat `created_by` globally across clients.

Raw demand counts by user are **demand registration/activity volume**, not employee “productivity,” unless a future domain contract defines otherwise.

### Historical author attribution (Pulse resolver)

- **Authorization membership ≠ historical actor attribution.**
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

Not implementation defects; do not block WP-04C.2:

1. **Hidden foreign-process RLS** — CLIENT B had no `processos` rows; no runtime case where B has a process hidden from A by RLS.
2. **Historical inactive author** — no safe inactive historical author fixture in DEV E2E.
3. **Duplicate `created_at` pagination** — no DEV sample with shared `created_at` for explicit tie-break proof.

### AR-ACTUS-PULSE-01 — Analytics as Intelligence Foundation

Pulse metrics and projections must have stable, traceable, **AI-independent** semantics so future prediction and Cortex layers can consume trusted facts.

### AR-ACTUS-PULSE-02 — Prediction Authority Boundary

Operational predictions derive from explicitly defined facts/models. Cortex may contextualize, explain, or communicate predictions; linguistic inference is **not** an operational fact. Do not introduce Cortex or forecasting into Connect MVP implementation.

**OPA-style mapping (direction only):**

- **Observe** — Pulse / Analytics (deterministic; WP-04C.2 foundation).
- **Predict / Interpret** — forecasting/model layer + Cortex (future).
- **Act** — human decision or explicitly authorized operation.

Core metrics must not depend on an LLM inventing or recalculating operational facts via arbitrary SQL.

---

## Flow Discovery Ledger (WP-04C forward observations)

Forward observations only — **no Flow tables or implementation** in Connect:

1. **Flow Pulse** should eventually represent the complete Actus operational universe, not only Connect intake.
2. **Flow Discovery** must model demand **origin/provenance** explicitly: origin/channel; requester/source actor; operator who manually registered/imported when applicable.
3. Equivalent Connect/Flow analytical metrics should share **semantic definitions** where appropriate, even when data sources differ.
4. Future forecasting may use richer Flow facts (demand arrivals, procedures, clients, distribution, calculators, deadlines, cycle times, etc.).
