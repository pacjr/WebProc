# Connect ↔ Flow — Master Data & Identity Boundary

**Status:** PO-approved architecture freeze (CONNECT-FLOW.1)
**Evidence baseline:** CONNECT-FLOW.1 discovery (2026-10-02)
**Scope:** Identity and client master-data ownership only — not Flow migration planning, transport, or implementation.

---

## Purpose

Define the authoritative boundary between **Flow** (future Actus operational client System of Record) and **Actus Connect** (identity, access, WebProc, Pulse, and future connected applications).

This document freezes decisions so WebProc Release Candidate and Connect can proceed without accidental duplication of Flow master data or bidirectional ownership conflicts.

---

## Context

- Legacy Actus **CLIENTES** combined tenant identity with extensive Flow operational configuration (dozens of columns). Connect intentionally does **not** replicate that model.
- Connect today uses **`webproc.clientes`** as a **thin, temporary bootstrap** client master (see TD-WP-01) plus **`webproc.usuarios_clientes`** for memberships and Supabase Auth for credentials.
- WebProc **`processos`** reference **`clientes.id`** (immutable FK) and capture **`nome_cli`** at creation for historical context.
- FlowProc does not exist in production yet; Connect admin CRUD for clients and memberships is accepted **bootstrap** functionality until Flow-driven sync is available.

---

## Current Connect model (as implemented)

| Object | Role |
|--------|------|
| `webproc.clientes` | Connect-local organization projection: `id`, `codigo_cliente`, `nome`, `ativo` |
| `webproc.usuarios_clientes` | Connect membership: email, optional display `nome`, optional `user_id` → Auth, `ativo` |
| `auth.users` | Supabase authentication identity |
| `webproc.usuarios_actus` | Actus operator access (separate from client membership) |
| `webproc.processos.cliente_id` | Immutable tenant scope FK → `clientes.id` |
| `webproc.processos.nome_cli` | Optional snapshot of client display name at process creation |
| `webproc.processos.created_by` | Immutable authorship → `auth.users` |

Mutations to clients and memberships from the browser go through **Actus ADMIN RPCs** and **provision-client-membership** Edge — not direct table writes. Hard delete of clients or membership rows is not part of the product contract; deactivation uses **`ativo`**.

---

## Authority boundary

| Domain | Authoritative owner |
|--------|---------------------|
| Actus operational client master (identity, CPF/CNPJ, address, contact, calculation/work config, integrations, honorarium rules, and other Flow-domain attributes) | **Flow** (future) |
| Connect organization projection (`clientes.id`, correlated business code, projected name/active flag) | **Connect** (storage); **Flow** (authoritative values when live) |
| Supabase / Auth users and sessions | **Connect** |
| Connect memberships and access activation/revocation | **Connect** |
| Connect roles and permissions (present and future) | **Connect** |
| Actus operator access | **Connect** |
| WebProc processes, documents, operational events, Pulse read models | **Connect** (derived from Connect domain facts) |
| Flow collaborator / contact person records | **Flow** |
| Whether a Flow collaborator may use Connect | **Connect** (explicit membership + provision — never automatic) |

Flow and Connect **must not** share tables or write directly into each other's persistence. Integration occurs only through an **explicit application contract / provisioning interface**. Transport (webhook, queue, Edge, polling, etc.) is **out of scope** for this ADR.

---

## Client identity strategy

### Connect-local surrogate (frozen)

- **`webproc.clientes.id`** is the Connect-local technical primary key.
- It **must remain stable** for the lifetime of the tenant in Connect.
- All existing WebProc and operational FKs continue to reference **`clientes.id`**, not Flow identifiers.

### Business correlation key (frozen)

- **`codigo_cliente`** is the **preferred stable business correlation key** between Flow and Connect.
- It is **not** an auto-generated Connect surrogate; it represents the agreed business/legacy client code (aligned with legacy **`Id_cli`** concept).
- **`flow_client_id` (or similar) must not be introduced now.** An additional external identifier may be added **only if** future Flow domain modeling demonstrates a concrete requirement that **`codigo_cliente` alone cannot satisfy**.

### What Connect must not store

Connect **`webproc.clientes`** must **not** expand into a duplicate Flow master. Operational configuration and rich client attributes remain in Flow when Flow is authoritative.

---

## Flow → Connect projection model

Conceptual contract (implementation deferred):

```text
Flow Client
    codigo_cliente = X
          |
          v
Connect provisioning contract
          |
          v
upsert Connect client BY codigo_cliente
          |
          v
preserve existing clientes.id (on match)
```

- **Upsert key:** `codigo_cliente` (unique in Connect).
- **Preserve:** existing **`clientes.id`** when the same business code is synchronized — so memberships, **`processos.cliente_id`**, audit, and Pulse history remain valid.
- **Updates when Flow is authoritative:** projected **`nome`**, projected **`ativo`**, and any other fields explicitly agreed in the integration contract — not ad hoc Connect admin edits of master identity.

---

## Auth / membership boundary

- **Authentication** stays in Supabase Auth; Connect owns credential lifecycle (invite, link, recovery, disable).
- **Membership** (`usuarios_clientes`) expresses “this person may act for this Connect organization,” not “this person exists in Flow.”
- A **Flow collaborator or contact does not automatically** receive Connect access. Flow may **request or trigger** provisioning through the Connect contract; Connect still owns Auth and authorization decisions.
- **Legacy collaborator passwords** are outside the future architecture and must **never** be migrated, reproduced, or documented as a design input.

Provisioning today: membership row (often `PENDING_AUTH`) → **provision-client-membership** → Auth invite or link → **`user_id`** populated.

---

## Activation / deactivation semantics

**Deactivation is not deletion.**

| Action | Expected Connect behavior |
|--------|---------------------------|
| Flow client inactive | Project **`clientes.ativo = false`**; block new CLIENT operational access via existing RLS/membership rules; **do not** delete `clientes` row |
| Flow client reactivated | Project **`clientes.ativo = true`** |
| Flow display name change | Update **`clientes.nome`** via sync; historical **`processos.nome_cli`** snapshots remain as recorded |
| Membership revoked | **`usuarios_clientes.ativo = false`**; row and **`user_id`** history retained |
| Logical delete in Flow | Map to **deactivation** in Connect — not FK-breaking hard delete |

Connect has **no** supported path to hard-delete clients with dependent **`processos`** (FK RESTRICT). This is intentional for historical preservation.

---

## Historical-data guarantees

When Flow deactivates or renames a client, Connect must preserve:

- Stable **`clientes.id`**
- Membership rows and audit of access changes
- **`processos`** and immutable **`created_by`**
- Document metadata, governance events, cancellation evidence
- Pulse and operational history derived from preserved process facts

Author display may degrade when membership is inactive (e.g. “inativo” labels in Pulse); that is acceptable and does not require rewriting historical FKs.

---

## Forbidden coupling / anti-patterns

- Flow writing directly to Connect Postgres tables (or the reverse).
- Duplicating Flow operational master columns into **`webproc.clientes`** “for convenience.”
- Bidirectional ownership of the same attribute (e.g. Connect admin and Flow both authoritative for legal name).
- Hard-deleting Connect clients or memberships to mirror Flow lifecycle.
- Migrating or storing legacy **Colaboradores** passwords in Connect or Auth.
- Treating Flow contact records as equivalent to Connect membership without an explicit provision step.
- Introducing **`flow_client_id`** preemptively without a proven gap in **`codigo_cliente`**.

---

## Transition from bootstrap Connect CRUD

**Today (Flow unavailable):** Actus ADMIN **create/update client** and **membership CRUD** in Connect is **accepted bootstrap** functionality (`admin_*` RPCs, provision Edge).

**When Flow is authoritative:**

| Bootstrap capability | Target state |
|---------------------|--------------|
| Manual client create with **`codigo_cliente`** | Replaced or restricted to Flow-originated upsert / contingency-only |
| Manual edit of Flow-owned **name** and **master identity** | **Read-only**, sync-only, or restricted break-glass |
| **`codigo_cliente`** assignment | Flow-owned; immutable in Connect after projection |
| Membership create / deactivate / provision | **Remains Connect** (Flow may request, not own Auth) |
| Actus operator admin | **Remains Connect** |

---

## Deferred Flow integration work

**Not WebProc RC blockers.** Address when Flow migration starts:

| Item | Class |
|------|--------|
| Flow → Connect **provisioning / upsert contract** (by **`codigo_cliente`**) | REQUIRED-BEFORE-FLOW |
| Optional **synchronization metadata** (e.g. last sync, source version) **if** operational need is demonstrated | REQUIRED-BEFORE-FLOW (conditional) |
| Transition Flow-owned Connect client fields to **read-only / sync-only** in admin UI and RPCs | REQUIRED-BEFORE-FLOW |
| Schema naming cleanup (`webproc` vs future `connect` namespace) | BACKLOG / migration when Flow begins |
| Multi-client active membership product rule (vs current global single-active constraint) | BACKLOG — only if requirements demand |

**Explicitly not required now:** `flow_client_id` column, sync transport choice, event bus, or Flow API implementation.

---

## Ownership matrix (concise)

| Concept | Future authoritative owner | Connect projection / store | Notes |
|---------|----------------------------|----------------------------|--------|
| Client operational master | Flow | No duplicate master table | Flow-only attributes |
| `codigo_cliente` | Flow | `clientes.codigo_cliente` | Preferred correlation key |
| Connect tenant PK | Connect | `clientes.id` | Stable FK target |
| Client display name (live) | Flow (when live) | `clientes.nome` | Sync |
| Client active flag | Flow (when live) | `clientes.ativo` | Deactivation ≠ delete |
| Process client snapshot | Connect (historical) | `processos.nome_cli` | Set at create |
| Auth user | Connect | `auth.users` | |
| Membership / access | Connect | `usuarios_clientes` | |
| Connect roles | Connect | TBD | Future |
| Actus operators | Connect | `usuarios_actus` | |
| WebProc / Pulse facts | Connect | `processos`, events, RPCs | Flow consumes via future APIs if needed |
| Flow collaborator | Flow | — | Optional link to membership |

---

## Frozen decisions (PO-approved)

1. Flow is the future System of Record for Actus operational Client master data.
2. Connect keeps a thin, persistent Client/Organization projection for tenant identity, memberships, WebProc, Pulse, and future apps.
3. **`codigo_cliente`** is the preferred stable business correlation key; it is not an auto-generated Connect surrogate; **`flow_client_id` is not introduced now**.
4. **`webproc.clientes.id`** remains the Connect-local surrogate PK and must stay stable; WebProc FKs keep using it.
5. Future sync: Flow client with **`codigo_cliente = X`** → Connect contract → upsert by code → preserve **`clientes.id`**.
6. No shared tables or cross-writes; integration via explicit contract only; transport undecided.
7. Flow owns authoritative operational client attributes in the Flow domain.
8. Connect must not expand **`webproc.clientes`** into a duplicate Flow master.
9. When Flow is authoritative, Flow-driven name/active projection; Connect manual master edit becomes read-only, restricted, or contingency-only.
10. Deactivation preserves ids, memberships, processos, documents/audit, and Pulse/history.
11. Connect remains authoritative for Auth, memberships, access, roles, and Actus operators.
12. Flow collaborators do not automatically become Connect users; Connect owns Auth and authorization.
13. Legacy passwords are excluded from the future architecture.
14. Current Connect client CRUD is bootstrap until Flow is available.
15. **No WebProc architecture change required before RC.**
16. Deferred items listed in **Deferred Flow integration work** above.
17. **`codigo_cliente` is sufficient** as the preferred correlation key unless future Flow modeling proves otherwise (replacing any prior wording that treated **`flow_client_id`** as a near-term requirement).

---

## Evolution rule

Any change that (a) adds Flow-owned columns to **`webproc.clientes`**, (b) introduces a second correlation key without proven necessity, (c) enables bidirectional master-data editing, or (d) breaks stable **`clientes.id`** / historical FKs requires an **explicit architecture revision** and PO approval — not drive-by implementation during WebProc or Flow feature work.

---

## References

- CONNECT-FLOW.1 discovery report (conversation / program record, 2026-10-02)
- `docs/TECHNICAL-DEBT.md` — TD-WP-01, AR-CONNECT-FLOW-01
- Migrations: `20260307180000_wp01_webproc_schema.sql`, `20260329153000_wp04a3b_domain_admin_contract.sql`
