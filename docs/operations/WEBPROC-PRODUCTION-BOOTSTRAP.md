# WebProc Production Bootstrap — PROD-BOOTSTRAP.1

**Gate date:** 2026-10-02  
**PO approval:** 2026-10-02 — **CLOSED / PASS**  
**RC baseline:** `75ee3f4f2a1a38741f81cd472fa83ed771dc1da1`  
**Status:** Runbook authoritative; **production NOT declared ready.**

This document defines how to bootstrap a **fresh** WebProc environment after **PROD-INFRA** (Strategy B migrations, API exposure, Edge, Auth, R2). It does **not** authorize production cutover by itself.

**CONNECT-FLOW.1 (frozen):** Connect bootstrap CRUD for `webproc.clientes` / memberships is **transitional** until Flow owns client master data. **`codigo_cliente`** remains the preferred future correlation key. Connect owns Auth and memberships.

---

## Layer model

| Layer | Owner slice | Contents |
|-------|-------------|----------|
| **A — Infrastructure** | PROD-INFRA | WP-01+ migrations, expose `webproc`, Edge deploy, secrets, R2, Auth URLs/SMTP |
| **B — First ACTUS ADMIN** | This runbook | Auth user + `webproc.usuarios_actus` (`papel = ADMIN`) — **one-time chicken-and-egg** |
| **C — Tenant (cliente)** | Admin UI / `admin_*` RPCs | `webproc.clientes` via authenticated ADMIN |
| **D — CLIENT user** | Admin UI + Edge | Membership row → `provision-client-membership` → invite → `/auth/activate` |
| **E — Additional Actus staff** | Runbook (no product UI) | Auth user + SQL `usuarios_actus` (`ADMIN` or `OPERADOR`) |

---

## Architecture map (authority)

### ACTUS identity

| Piece | Mechanism |
|-------|-----------|
| Supabase Auth user | Dashboard / Auth Admin API (service role) — **not** self-registration |
| `webproc.usuarios_actus` | **No** authenticated PostgREST access (`REVOKE` from `authenticated`; **service_role / SQL only**) |
| Actus access probe | `webproc.is_active_connect_actus_user()` → `webproc_private.is_active_actus_user()` |
| ADMIN capability probe (UX only) | `webproc.is_active_connect_actus_admin()` — **gating only** |
| Admin mutations | `webproc.admin_*` RPCs → `webproc_private.assert_actus_admin()` |
| `papel` | `ADMIN` \| `OPERADOR` — v1 **same operational read scope**; ADMIN required for `admin_*` |

### Client master (Connect projection)

| Piece | Mechanism |
|-------|-----------|
| Table | `webproc.clientes` (`codigo_cliente`, `nome`, `ativo`) |
| Create/update | `admin_create_cliente`, `admin_update_cliente` (ADMIN only; `codigo_cliente` immutable after create) |
| List | `admin_list_clientes` |

### CLIENT membership

| Piece | Mechanism |
|-------|-----------|
| Table | `webproc.usuarios_clientes` |
| Create metadata | `admin_create_client_membership` → row with `user_id` null, `provisioning_state = PENDING_AUTH` |
| Auth link / invite | Edge **`provision-client-membership`** (JWT ADMIN) → `server_prepare/link_client_membership_auth` (service_role) |
| Dual-hat block | Active Actus identity cannot hold client membership (same email / `user_id`) |
| Activation | User completes `/auth/activate` + password → `resolveConnectAccess()` → CLIENT |

### Provisioning Edge (required for Layer D)

| Secret / config | Purpose |
|-----------------|--------|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Edge → DB server RPCs |
| `CONNECT_AUTH_INVITE_REDIRECT_URL` **or** `CONNECT_PUBLIC_APP_URL` | Invite redirect → `/auth/activate` |

---

## Layer B — First ACTUS ADMIN (one-time)

**There is no RPC or UI to create the first `usuarios_actus` row.** This is intentional (no anonymous elevation, no migration fixtures).

### Approved mechanism (staging/prod)

1. **Create Auth user** (Supabase Dashboard → Authentication → Users, or Auth Admin API with **service role** on a trusted operator workstation / CI — never in frontend).
   - Use a real Actus-owned email (PO policy).
   - Set confirmed email; set temporary password or invite per Auth policy.
2. **Record `auth.users.id`** (UUID).
3. **Insert Actus row** (SQL Editor as postgres / service role — **one row**):

```sql
INSERT INTO webproc.usuarios_actus (user_id, email, nome, papel, ativo)
VALUES (
  '<AUTH_USER_UUID>',
  '<normalized-email@actus.example>',
  '<Display Name>',
  'ADMIN',
  true
);
```

4. **Verify** (as that user, with `webproc` exposed):

```sql
-- Or use app login + Admin nav / RPC smoke
SELECT webproc.is_active_connect_actus_admin();  -- expect true
SELECT webproc.is_active_connect_actus_user();   -- expect true
```

### Security boundary

- **Not** exposed to `authenticated` role for INSERT on `usuarios_actus`.
- **Not** a permanent backdoor: same SQL pattern for **additional** Actus staff until a future internal admin product exists.
- **Auditable:** Dashboard user creation + SQL insert logged by operator process (ticket/runbook sign-off).
- **Never** commit credentials or UUIDs to git.

### Local rehearsal (2026-10-02)

On local Strategy B DB (0 `usuarios_actus` start): Auth Admin `createUser` + SQL `INSERT` + SQL role simulation confirmed `is_active_connect_actus_admin` / `admin_create_cliente` / `admin_create_client_membership` (`PENDING_AUTH`). PostgREST `webproc` exposure required for browser path (local default may expose only `public` — configure like prod before UI rehearsal).

---

## Layer C — First client (ongoing admin)

**After** Layer B, use **Connect Admin UI** (`/app/admin`) or RPCs as the bootstrapped ADMIN:

1. `admin_create_cliente(p_codigo_cliente, p_nome)` — choose business **`codigo_cliente`** (Flow correlation).
2. Confirm in `admin_list_clientes`.
3. Deactivate later via `admin_update_cliente(..., p_ativo := false)` — clients with active memberships may be blocked by RPC rules (see migration comments).

---

## Layer D — CLIENT provisioning

1. `admin_create_client_membership(p_cliente_id, p_email, p_nome)` — creates/updates row; state **`PENDING_AUTH`** when `user_id` is null.
2. Call Edge **`provision-client-membership`** with `{ "membership_id": <id> }` (ADMIN JWT).
   - Outcomes: `INVITED_AND_LINKED`, `EXISTING_AUTH_LINKED`, `ALREADY_LINKED`.
3. User opens invite → **`/auth/activate`** → sets password.
4. Login → **`resolveConnectAccess()`** → `{ kind: "CLIENT", membership }`.

**Production Auth:**

- Site URL + redirect allowlist: app origin, `/auth/activate`, `/nova-senha`.
- SMTP or Supabase mail (PO decision).

**Local:** Mailpit/Inbucket (`http://127.0.0.1:54324`) when Edge + redirect env configured.

---

## Layer E — Additional ACTUS users

**No Connect UI** for Actus staff CRUD (WP-04B out of scope).

Repeat Layer B pattern:

1. Auth user (Dashboard / Admin API).
2. SQL insert into `webproc.usuarios_actus` with `papel = 'OPERADOR'` or `'ADMIN'`.

**Who may create another ADMIN?** Operational policy: existing Actus organization / PO — **not** enforced in product today. Only **`papel = 'ADMIN'`** passes `assert_actus_admin()`.

**OPERADOR:** Resolves `is_active_connect_actus_user` (ACTUS supervisory UI); **cannot** call `admin_*` (expect `not_actus_admin`).

---

## Deactivation (not deletion)

| Entity | Mechanism | Connect effect |
|--------|-----------|----------------|
| Cliente | `admin_update_cliente` → `ativo = false` | Memberships/process rules per RPC; inactive client hidden from member selects |
| CLIENT membership | `admin_set_client_membership_active` → `ativo = false` | User loses active membership → `resolveConnectAccess` → **UNAUTHORIZED** if no Actus hat |
| Actus user | SQL `UPDATE webproc.usuarios_actus SET ativo = false` (service role) | Loses Actus probes; ADMIN mutations fail |

Hard delete of clients/memberships is **not** product contract (CONNECT-FLOW boundary).

---

## Failure / idempotency / recovery

| Scenario | Expected behavior | Recovery |
|----------|-------------------|----------|
| Duplicate `codigo_cliente` | `admin_create_cliente` error | Choose new code |
| Duplicate membership email (same client) | Reactivate/update path in `admin_create_client_membership` | Use admin list + provision |
| `active_membership_other_client` | RPC error (one active client per email) | Deactivate other membership first |
| Auth user created; SQL insert failed | Orphan Auth user | Delete Auth user or complete SQL insert |
| Invite sent; link failed (`link_failed_after_auth`) | Edge 502; Auth user may exist | Retry **`provision-client-membership`** (documented in Edge) |
| `actus_identity_conflict` on provision | Actus email/user cannot be CLIENT | Use non-Actus email |
| Abandoned activation | Membership stays `PENDING_AUTH` | Resend via reprovision / Auth invite policy |

Avoid ad-hoc destructive SQL except Layer B/E inserts under runbook control.

---

## Production bootstrap checklist

### One-time (environment)

- [ ] PROD-INFRA complete (WP-01+, repair legacy history, expose `webproc`)
- [ ] Edge functions deployed (incl. `provision-client-membership`)
- [ ] Edge secrets + invite redirect URL
- [ ] Auth redirect allowlist + SMTP (PO)
- [ ] R2 + document Edge secrets (for later smoke)
- [ ] **First ACTUS ADMIN** (Layer B)
- [ ] Verify ADMIN login + `/app/admin` + capability probe

### First tenant smoke

- [ ] Create cliente (`codigo_cliente`, `nome`)
- [ ] Create membership + **provision** + activate
- [ ] CLIENT login → `resolveConnectAccess` → tenant scope
- [ ] Optional: ACTUS OPERADOR row + read-only supervisory check

### Ongoing administration

- Use Admin UI + standard RPCs/Edge — **not** Layer B SQL except new Actus staff (Layer E).

---

## What must NEVER be done

- Public self-registration as Actus ADMIN
- Frontend or browser use of **service_role**
- Hardcoded bootstrap users in migrations
- Permanent “bootstrap” RPC callable by `anon` / `authenticated`
- Deleting DEV/prod legacy `public` tables as part of bootstrap
- Flow integration or `flow_client_id` without PO unlock
- Skipping Edge provision for CLIENT (manual `user_id` patch except documented break-glass)

---

## Rehearsal evidence (2026-10-02)

### PASS (local, synthetic — no DEV mutation)

| Step | Result |
|------|--------|
| Clean bootstrap start | Local Strategy B DB; `usuarios_actus` count **0** |
| Layer B | Synthetic Auth user + one-time SQL `usuarios_actus` **ADMIN** |
| Capability probes | `is_active_connect_actus_admin` / `is_active_connect_actus_user` → **true** (authenticated role simulation) |
| Layer C | `admin_create_cliente` → synthetic client row |
| Layer D (contract) | `admin_create_client_membership` → **`PENDING_AUTH`** |
| Cleanup | Rehearsal `webproc` rows removed locally |

### DEFERRED TO STAGING (not claimed as PASS in PROD-BOOTSTRAP.1)

- Edge **`provision-client-membership`** invite delivery
- **`/auth/activate`** + password establishment in browser
- Complete **`resolveConnectAccess()`** CLIENT path after activation
- Full two-tenant browser isolation smoke
- Production/staging SMTP + redirect allowlist behavior

**Next engineering phase:** **STAGING-CUTOVER.1** (infra + bootstrap + deferred items on a non-DEV project).

### Security boundaries preserved

No anonymous admin creation; no frontend **service_role**; no permanent bootstrap backdoor RPC; no seed users in migrations; deactivation ≠ deletion; Connect ↔ Flow boundary frozen; bootstrap client CRUD is transitional; **`codigo_cliente`** correlation unchanged.

---

## Related

- [`../architecture/WEBPROC-PRODUCTION-INFRASTRUCTURE.md`](../architecture/WEBPROC-PRODUCTION-INFRASTRUCTURE.md)
- [`../architecture/CONNECT-FLOW-MASTER-DATA-BOUNDARY.md`](../architecture/CONNECT-FLOW-MASTER-DATA-BOUNDARY.md)
- [`../../supabase/reference/wp04a3b_domain_admin_validation_harness.sql`](../../supabase/reference/wp04a3b_domain_admin_validation_harness.sql)
- [`../TECHNICAL-DEBT.md`](../TECHNICAL-DEBT.md) — WP-04B ADMIN MVP
