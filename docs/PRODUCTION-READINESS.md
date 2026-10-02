# WebProc Production Readiness — PROD-READINESS.1

**Audit date:** 2026-10-02

**RC baseline audited:** `adf354dcd776d56cc214313e113db8e6a1870584`

**Validated environment:** DEV Supabase `cxrnptygbzqzobtdxpwo`

**Status:** **NOT PRODUCTION READY** — **PROD-READINESS.1 CLOSED / PASS** (audit); cutover not executed.

This document records findings from PROD-READINESS.1. It does **not** authorize production deploy.

---

## Executive summary

WebProc **application code and RC** are frozen and functionally complete on DEV. Production cutover requires **environment provisioning**, **configuration externalization**, **migration-chain validation on a greenfield project**, **Edge/R2/Auth bootstrap**, and **PO decisions** on hosting, domains, and data scope. No production resources were created in this audit.

---

## Deployment inventory (summary)

| Component | DEV (current) | Production requirement | Config source | Secret? | Deploy mechanism | Readiness | Risk/gap |
|-----------|---------------|------------------------|---------------|---------|------------------|-----------|----------|
| Frontend (Vite/React SPA) | `npm run dev` :8080; `npm run build` → `dist/` | Static/hosted SPA + HTTPS + `/app/*` fallback | `VITE_*` at build time | Anon key public | Host-specific (see hosting) | **REQUIRED** | Host must inject prod `VITE_*` at build (**PROD-CONFIG.1 CLOSED**) |
| Supabase project | `cxrnptygbzqzobtdxpwo` | Dedicated prod project (Actus-owned per TD) | Dashboard / CLI | Service role, JWT secret | Create project | **PO DECISION** | TD: temp Insight infra |
| PostgreSQL / `webproc` | Migrations on DEV | Same migration chain on prod | `supabase/migrations/` | — | `supabase db push` / CI | **REQUIRED** | Legacy migration prefix risk |
| PostgREST / Data API | `webproc` exposed | Expose `webproc` + required tables | Supabase API settings | — | Dashboard | **REQUIRED** | TD § Deployment Portability |
| Auth (GoTrue) | DEV users/seeds | Prod users + redirect allowlist | Supabase Auth | SMTP optional | Dashboard + bootstrap | **REQUIRED** | Email deliverability |
| Edge Functions (WebProc) | ACTIVE on DEV | Deploy 6 functions from repo | `supabase/functions/` | R2, capability secret, URLs | `supabase functions deploy` | **REQUIRED** | Secrets per env |
| Cloudflare R2 | DEV bucket `webproc` (default) | Prod bucket + credentials | Edge env | **Yes** | Cloudflare + Edge secrets | **REQUIRED** | R2 CORS for browser PUT |
| Legacy Storage bucket | `process-attachments` (migration) | Not used by WebProc UI path | Migration | — | — | **N/A** | Legacy migrations only |
| Legacy Edge (`upload-attachment`, etc.) | Removed from repo (**LEGACY-CLEANUP.1**); may still exist on DEV cloud | **Not invoked by WebProc frontend** | — | — | Do not deploy on prod | **N/A** | Retire DEV deployment separately |
| DNS / custom domain | localhost / DEV | Production app URL | PO | — | Host | **PO DECISION** | Not in repo |
| Institutional site link | `VITE_SITE_PUBLIC_URL` optional | Prod Actus site URL | Env | Public | Build | **POLISH** | Defaults localhost |

---

## Supabase migrations

- **Count:** 28 SQL files under `supabase/migrations/` (ordered by timestamp prefix).
- **Schemas:** `public` (legacy), `webproc`, `webproc_private`.
- **Extensions:** Standard Supabase/Postgres (no exotic extension called out in WP-01 header).
- **RLS:** Enabled on core `webproc.*` tables per WP-01+ migrations; Actus internal read in WP-03B; operational tables in WP-02B.
- **Service-role-only:** `webproc.server_*` auth provision, document resolve/finalize paths (see migrations WP-03, WP-04A.3c.1, PROTO-DOC.3).

### Deterministic greenfield question

**Can a brand-new production project be built from repository migrations alone?**

**PROD-INFRA.1 (2026-10-02):**

| Apply path | Result |
|------------|--------|
| All **28** migrations in timestamp order on empty DB | **NO** — **live local proof:** fails at **`20251002135826`** (`public.t_processoweb` does not exist, SQLSTATE 42P01) |
| **WebProc subset** only (`20260307180000` → latest, **25** files; skip three `202510*`) | **YES** — **live local proof PASS** (2026-10-02); Strategy B **`migration repair`** + future `db push` drill documented in infra doc |

Evidence and contracts: [`docs/architecture/WEBPROC-PRODUCTION-INFRASTRUCTURE.md`](./architecture/WEBPROC-PRODUCTION-INFRASTRUCTURE.md).

**Recommended production strategy:** **Strategy B** — selective apply / production baseline path; **do not rewrite** migrations already applied on DEV.

WebProc runtime uses **`webproc` only**; legacy `public` objects are **not** referenced from `src/` or WebProc Edge.

**Manual SQL outside migrations:** `supabase/reference/*.sql` harnesses — **not** applied in prod (DEV validation only). `legacy_public_baseline_local.sql` — reference, not migration.

---

## Auth & bootstrap (CONNECT-FLOW.1 frozen)

Flow integration **not** required for WebProc production.

**Minimum bootstrap before first use:**

| Actor | Requirement |
|-------|-------------|
| **ACTUS ADMIN** | Auth user + `webproc.usuarios_actus` row with `papel = 'ADMIN'`, `ativo` (see WP-04B; TD MUST #6) |
| **ACTUS OPERADOR** | Auth user + `usuarios_actus` `OPERADOR` |
| **CLIENT** | `webproc.clientes` row; `webproc.usuarios_clientes` membership linked to Auth `user_id`; provisioning via Admin → Edge `provision-client-membership` → `/auth/activate` |
| **Reference data** | Client master minimal fields (`codigo_cliente`, `nome`, `ativo`) — Connect bootstrap until Flow |

**DEV seed:** `docs/dev-seed/auth-credentials.local.json` is gitignored — **not** for prod. No hardcoded user UUIDs in migrations (verified grep).

**Production dependencies (from TD WP-04B):** Auth redirect allowlist (`/nova-senha`, `/auth/activate`, app origin); Edge `CONNECT_AUTH_INVITE_REDIRECT_URL` and/or `CONNECT_PUBLIC_APP_URL`; SMTP strategy for invites/recovery.

---

## Edge Functions (WebProc runtime)

| Function | Purpose | verify_jwt | Secrets / env | DB / R2 |
|----------|---------|------------|---------------|---------|
| `webproc-document-upload-prepare` | Presigned PUT + capability | true | R2, `WEBPROC_UPLOAD_CAPABILITY_SECRET`, Supabase service | RPC prepare |
| `webproc-document-upload-confirm` | Confirm upload | true | Same | RPC confirm |
| `webproc-document-download-prepare` | Presigned GET | true | R2, Supabase service | resolve download |
| `webproc-document-remove` | Coordinated ARQUIVO remove | true | R2 delete | PROTO-DOC.3 RPCs |
| `webproc-document-r2-cleanup` | Post-cancel R2 cleanup | true | R2 delete | PROTO-DOC.3 |
| `provision-client-membership` | Admin invite/link | true | Service role, invite redirect URL | server_prepare/link |

**Legacy Edge:** `list-attachments`, `upload-attachment`, `delete-attachment` — **removed from repository** (LEGACY-CLEANUP.1); may remain deployed on DEV until cloud retirement.

**Deploy order:** Migrations (document RPCs) → Edge secrets → deploy all six functions above → smoke upload/download/remove.

**CORS:** `_shared/webproc/cors.ts` uses `Access-Control-Allow-Origin: *` — acceptable for JWT-protected POST; **POLISH:** tighten to prod app origin if desired.

---

## R2 / documents

- **Config:** `R2_ACCOUNT_ID` / `CLOUDFLARE_R2_*`, `R2_SECRET_*`, `R2_BUCKET` (default name `webproc` in code).
- **Browser:** Client uploads via **presigned PUT** URL returned by Edge — **R2 bucket CORS** must allow prod app origin and PUT/GET methods (**REQUIRED-BEFORE-PROD** ops task).
- **TD-DOC3-ORPHAN-01:** Abandoned prepare without confirm — **POST-PROD DEBT** (monitor `storage_state`).
- **DOC3-RETRY-01:** No scheduled retry for failed post-cancel cleanup — **POST-PROD DEBT**; state durable via `r2_cleanup_pending`; manual re-invoke cleanup Edge documented.

---

## Frontend configuration

| Variable | Purpose | Class |
|----------|---------|--------|
| `VITE_SUPABASE_URL` | Supabase API | Public build |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Anon key | Public build |
| `VITE_SUPABASE_PROJECT_ID` | Optional metadata | Public |
| `VITE_SITE_PUBLIC_URL` | Institutional site link | Public optional |

**PROD-CONFIG.1 (2026-10-02, CLOSED / PASS):** `src/integrations/supabase/client.ts` reads **`VITE_SUPABASE_URL`** and **`VITE_SUPABASE_PUBLISHABLE_KEY`** only, with fail-fast validation (no DEV project fallback in source). Template: `.env.example`. Local DEV via gitignored `.env`; `.env` removed from repository tracking.

**Remaining:** Production/staging hosts must **supply** the correct `VITE_*` values at **build time**. Missing env still prevents a valid build/runtime init — this does **not** by itself mark production READY.

---

## Hosting / routing

- **SPA:** React Router (`BrowserRouter`); routes `/app/*`, `/auth`, `/auth/activate`, `/nova-senha`, etc.
- **Deep links:** Host must serve `index.html` for unknown paths (**REQUIRED** standard SPA fallback).
- **Repository evidence:** Generic Lovable deploy README — **no Actus production host defined** → **PO DECISION**.
- **Build:** Node.js + `npm run build`; output `dist/`; no server-side env injection unless host supports build-time `VITE_*`.

---

## Observability & ops (minimum)

| Area | Current | Classification |
|------|---------|----------------|
| Supabase logs | Dashboard | **REQUIRED** baseline |
| Edge logs | Dashboard | **REQUIRED** for document/provision failures |
| Frontend errors | Browser only | **POLISH** / POST-PROD (no Sentry in repo) |
| R2 cleanup failures | `r2_cleanup_pending` + manual re-invoke | **POST-PROD** (DOC3-RETRY-01) |
| Audit trail | `webproc.operacional_eventos` domain | **REQUIRED** exists; no UI timeline |
| Backups | Supabase project backups | **REQUIRED-BEFORE-PROD** enable/verify on prod project |

---

## Rollback model (reference)

| Layer | Rollback |
|-------|----------|
| **Frontend** | Redeploy previous static build / prior RC SHA `adf354d` or earlier |
| **Database** | Forward-only migrations; rollback = restore backup or corrective migration (no automated down) |
| **Edge** | Redeploy prior function bundle from git tag/SHA |
| **R2** | Objects persist; cancel/remove semantics already domain-defined |
| **Git RC** | `adf354dcd776d56cc214313e113db8e6a1870584` current baseline |

---

## Proposed cutover sequence (do not execute)

1. **PO:** Prod Supabase project owner, app URL, R2 account, data scope (greenfield vs legacy).
2. Create Supabase production project; enable backups.
3. **Dry-run migrations** on empty project; resolve legacy-prefix blocker if needed.
4. Configure API: expose schema `webproc`; verify table grants.
5. Set Auth redirect URLs and SMTP.
6. Set Edge secrets (service role auto; R2; capability secret; invite URL).
7. Deploy Edge functions (6 WebProc + provision).
8. Configure R2 bucket + CORS.
9. Build frontend with **prod** `VITE_*` (PROD-CONFIG.1 client; host-supplied values).
10. Deploy frontend to host; HTTPS.
11. Bootstrap ACTUS ADMIN; bootstrap first cliente/memberships.
12. Run production smoke matrix (CLIENT / ACTUS / ADMIN).
13. PO production sign-off.

---

## Production smoke matrix (minimum — post-deploy)

See PROD-READINESS.1 task §16: CLIENT full document/lifecycle path; ACTUS read-only + cross-client; ACTUS_ADMIN admin CRUD; responsive desktop/mobile; light/dark shell.

---

## Classification register (PROD-READINESS.1)

### BLOCKERS

_(None.)_

Previously: hardcoded DEV Supabase URL/key in `client.ts` — **RESOLVED** by **PROD-CONFIG.1 CLOSED / PASS**.

### REQUIRED-BEFORE-PROD

1. Production/staging CI/host: inject **`VITE_SUPABASE_URL`** + **`VITE_SUPABASE_PUBLISHABLE_KEY`** for each environment build.
2. Production Supabase project + **migration apply verified** on target (greenfield dry-run).
3. PostgREST `webproc` schema exposure + table exposure (TD).
4. Deploy WebProc Edge functions + `provision-client-membership`.
5. Per-environment Edge secrets (R2, upload capability secret, invite redirect URLs).
6. R2 bucket + **CORS** for presigned PUT/GET from prod origin.
7. Auth redirect allowlist for prod app + `/auth/activate` + `/nova-senha`.
8. Production email/SMTP strategy for invite/recovery.
9. Bootstrap ACTUS ADMIN + initial cliente/membership path documented and executed.
10. Staging/prod smoke per TD (Pulse RPC migration, ADMIN provision chain, PROTO-DOC paths).
11. Production backup policy on Supabase.

### PO DECISIONS

1. Production hosting provider and custom domain.
2. Actus-owned vs transitional Supabase/Cloudflare accounts (TD expects Actus-owned prod).
3. Greenfield WebProc-only DB vs legacy `public` schema requirement for migration chain.
4. Operational data migration scope (historical protocolos vs empty start).
5. Edge CORS tightening vs `*`.
6. Custom SMTP / sender identity.

### POLISH

- Retire legacy Edge deployments on DEV/staging cloud (repo source removed in LEGACY-CLEANUP.1).
- `VITE_SITE_PUBLIC_URL` for prod institutional link.
- Frontend error monitoring.
- Pulse chunk size / performance budgets (TD reference only).

### POST-PROD DEBT

- **TD-DOC3-ORPHAN-01**, **DOC3-RETRY-01**
- CONNECT-FLOW integration (frozen, not prod blocker)
- Observability platform beyond Supabase dashboards

---

## PROD-CONFIG.1 — Frontend env externalization

**Status:** **CLOSED / PASS** (2026-10-02).

**Delivered:** Env-based Supabase client; fail-fast missing/invalid URL; `.env.example` documented; `vite-env.d.ts` contract; no service-role in frontend; `.env` untracked (gitignored).

**Does not close:** Production readiness — infra, migrations dry-run, Edge/R2, Auth bootstrap, hosting PO decisions remain.

---

## PROD-INFRA.1 — Greenfield infrastructure & migration readiness

**Status:** **CLOSED / PASS** (PO approval 2026-10-02). **Production NOT declared ready.**

**Delivered:** Migration inventory; legacy analysis; runtime graph; Strategy B; infra contracts; **PROD-INFRA.1a local greenfield proof** (see infra doc).

**Reproducible from zero:** **NO** (28-file chain) / **YES** (WP-01+ **25** migrations — **live local PASS**).

---

## PROD-INFRA.1a — Strategy B greenfield execution proof

**Status:** **CLOSED / PASS** (PO approval 2026-10-02).

**Executed (local only):** Full 28-chain failure at `20251002135826` (legacy `public.t_processoweb` absent); WP-01+ selective apply **25/25**; production strategy = WP-01+ apply + **`migration repair`** for three legacy versions; future `db push --local` drill **PASS**; no structural dependency on legacy public tables. DEV **`cxrnptygbzqzobtdxpwo`** not mutated.

**Strategy B classification:** **PASS** (local greenfield proof).

**Evidence:** [`docs/architecture/WEBPROC-PRODUCTION-INFRASTRUCTURE.md`](./architecture/WEBPROC-PRODUCTION-INFRASTRUCTURE.md) § Executive result / PROD-INFRA.1a.

---

## LEGACY-CLEANUP.1 — Repository legacy artifact removal

**Status:** **CLOSED / PASS** (PO approval 2026-10-02).

**Removed from repository:** Legacy Edge sources (`list-attachments`, `upload-attachment`, `delete-attachment`) and `config.toml` entries; stale legacy `public` frontend type contract in `types.ts`.

**Retained:** All `202510*` historical migrations; Strategy B documentation; `legacy_public_baseline_local.sql`; current `webproc-document-*` R2 architecture; `provision-client-membership`; Connect ↔ Flow frozen boundary.

**Not performed:** DEV cloud infrastructure/data deletion; legacy `public` tables remain protected pending Actus/Flow data policy; `process-attachments` bucket **VERIFY-FIRST** for cloud retirement.

---

## Recommended immediate next slice

**PROD-BOOTSTRAP.1** — ADMIN + first tenant runbook.

---

## Related docs

- [`TECHNICAL-DEBT.md`](./TECHNICAL-DEBT.md) — Deployment Portability, WP-04B production MUSTs, PROTO-DOC.3 debt
- [`architecture/CONNECT-FLOW-MASTER-DATA-BOUNDARY.md`](./architecture/CONNECT-FLOW-MASTER-DATA-BOUNDARY.md)
- [`design/ACTUS-CONNECT-OPERATIONAL-VISUAL-LANGUAGE.md`](./design/ACTUS-CONNECT-OPERATIONAL-VISUAL-LANGUAGE.md)
