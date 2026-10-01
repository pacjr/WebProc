# Protocolos Operational UX Specification (UX-02)

**Status:** PO REVIEW (PROTO-UI.1 implementation in tree; browser gate blocked on CLIENT DEV auth)  
**Version:** 2026-09-30  
**Scope:** WebProc operational Protocolos workflow in Actus Connect (CLIENT + ACTUS read).  
**Authority:** [`AR-AC-UX-PROTO-01`](./TECHNICAL-DEBT.md#ar-ac-ux-proto-01--protocolos-operational-ux-po-source-of-truth) in `docs/TECHNICAL-DEBT.md` — PO decisions there are closed; this document implements them into an implementation-ready UX spec.

**Non-goals (this document):** Pulse redesign, schema/RPC/Edge renames, ADMIN MVP, production SMTP/bootstrap.

**Technical boundary:** Routes and code may remain `/app/processos`, `processo`, `id_proc`, RPC names unchanged. **Product copy and IA** use **Protocolos**.

---

## 1. Terminology

| Layer | Term |
|-------|------|
| User-facing operational | **Protocolos**, **Novo protocolo**, **Protocolo #&lt;id_proc&gt;** |
| Court / case identifier | **Nº do Processo** → `processos.n_processo` |
| Connect identifier | **Protocolo** (numeric) → `processos.id_proc` (shown as secondary identity in list/detail) |
| Technical (unchanged) | `webproc.processos`, `salvar_rascunho`, `protocolar_processo`, etc. |
| Pulse | **Demandas** (analytic only) |

Do **not** run a global rename of routes, components, or types in terminology-only work; slice **PROTO-UI.1** covers user-visible strings and nav labels only.

---

## 2. Operational CORE (PO-approved)

Nine legacy-aligned concepts plus one approved extension:

| # | Product concept | Domain mapping | MVP UX |
|---|-----------------|----------------|--------|
| 1 | **Nº do Processo** | `n_processo` | Yes |
| 2 | **Reclamante** | `reclamante` | Yes |
| 3 | **Reclamado** | `reclamado` | Yes |
| 4 | **Data de Entrada** | `dt_entrada` | Yes |
| 5 | **Data Fatal** | `dt_fatal` | Yes |
| 6 | **Status** | `status` | Yes |
| 7 | **Instrução** | `instrucao` | Yes |
| 8 | **Observações** | `obs` | Yes |
| 9 | **Documentos** | `processo_documentos` (link + file) | Yes |
| + | **Execução Provisória** (extension) | `exec_prov` | Yes — not legacy layout, approved domain extension |

**Explicitly excluded from UX:** `instituicao` (column remains; never shown).

**Business identifier rule (PO — closed, XOR):** Each protocol has **exactly one** identifier after trim:

- Valid: **only** Nº do Processo **or** **only** Execução Provisória.
- Invalid: both empty; both populated.
- **Not** the same as **Instrução** (`instrucao`), which remains a separate required field at protocolization.

**Domain enforcement (PROTO-DOM.1):** `webproc_private.processo_identificacao_xor_ok`, CHECK `processos_identificacao_xor_check`, RPC error `identificacao_xor_violation` in `salvar_rascunho` and `protocolar_processo`.

**Frontend (implementation):** Radio selector + `validateIdentificacaoXor` on create/draft save/protocol; maps server `identificacao_xor_violation` to product copy.

---

## 3. Field specification (CORE + extension)

### 3.1 Nº do Processo

| Aspect | Specification |
|--------|----------------|
| Label | Nº do Processo |
| Purpose | External court/administrative case number |
| Source | `processos.n_processo` |
| Required | **XOR:** exactly one of Nº do Processo or Execução Provisória from create/draft save onward |
| Editable | Yes while `EM_PREENCHIMENTO` and user is creator (via `salvar_rascunho`) |
| Create | Required via radio + one field before first save |
| Edit | Same XOR via radio + single active field |
| Validation | Trim; empty → `null`; XOR enforced client + server |
| Default | Empty until user selects identification mode |
| Errors | Server: `identificacao_xor_violation`; client: `validateIdentificacaoXor` messages |
| Mobile | Single full-width text input |

### 3.2 Execução Provisória (extension)

| Aspect | Specification |
|--------|----------------|
| Label | Execução Provisória |
| Purpose | Alternate business identifier when main process number unavailable |
| Source | `processos.exec_prov` |
| Required | **XOR:** mutually exclusive with Nº do Processo (never both) |
| Editable | Same gates as Nº do Processo |
| Create / edit | Selected via radio on “Novo protocolo” / detail edit |
| Validation | Trim; XOR enforced client + server |
| Default | Empty |
| Mobile | Full-width input; may live in “Identificação” group on detail |

### 3.3 Reclamante / Reclamado

| Aspect | Specification |
|--------|----------------|
| Labels | Reclamante, Reclamado |
| Source | `reclamante`, `reclamado` |
| Required | **Optional** at draft and protocol (domain does not require) |
| Editable | Draft + creator |
| Validation | Trim → null if empty |
| Mobile | Stacked inputs |

### 3.4 Data de Entrada

| Aspect | Specification |
|--------|----------------|
| Label | Data de Entrada |
| Source | `dt_entrada` (set on insert, default `now()`) |
| Required | System-set |
| Editable | **Read-only** always |
| Create | Shown as today’s date (preview) until record exists; after insert, server value |
| Display | `dd/MM/yyyy` (business TZ display consistent with current UI) |
| Mobile | Read-only row |

### 3.5 Data Fatal

| Aspect | Specification |
|--------|----------------|
| Label | Data Fatal |
| Source | `dt_fatal` (timestamptz, business date in America/Sao_Paulo) |
| Required | Required at **protocolization** only |
| Editable | Draft + creator |
| Validation | Draft save: if set, date ≥ today (SP). Protocol: required + same rule. Server: `invalid_dt_fatal_past`, `missing_dt_fatal` |
| Default | **Today (local browser date)** on Novo protocolo; editable before save and while draft |
| List | Show date; **overdue indicator** when status is operational-active and date &lt; today (presentation only; domain may already track situations — UI may badge “Prazo vencido” without new backend) |
| Mobile | Native `type="date"` with `min` = today (SP) |

### 3.6 Status

See §4.

### 3.7 Instrução

| Aspect | Specification |
|--------|----------------|
| Label | Instrução |
| Source | `instrucao` |
| Required | At **protocolization** (domain); optional in draft |
| Editable | Draft + creator |
| Control | Multi-line text |
| Validation | Non-empty trim at protocol; server `missing_instrucao` |
| Mobile | Textarea, min 3 rows |

### 3.8 Observações

| Aspect | Specification |
|--------|----------------|
| Label | Observações |
| Source | `obs` |
| Required | Optional always |
| Editable | Draft + creator |
| Mobile | Textarea |

### 3.9 Documentos

See §10–11.

### 3.10 Cliente (context, not CORE field)

| Aspect | Specification |
|--------|----------------|
| Label | Cliente |
| Source | `clientes.nome` via membership / join |
| UX | Read-only on forms; encodes tenant context — **not** `instituicao` |
| ACTUS | Show client name on list/detail (cross-client read) |

---

## 4. Status semantics

### 4.A Current domain capability

| Status | Product label (use in UX) |
|--------|---------------------------|
| `EM_PREENCHIMENTO` | Em preenchimento |
| `PENDENTE` | Pendente |
| `IMPORTADO` | Importado |
| `CONCLUIDO` | Concluído |
| `CANCELADO` | Cancelado |

**Initial status:** `EM_PREENCHIMENTO` (insert trigger enforces; only this status on create).

**CLIENT-initiated transitions (RPC):**

| From | Action | To |
|------|--------|-----|
| `EM_PREENCHIMENTO` | Protocolar (`protocolar_processo`) | `PENDENTE` |
| `PENDENTE` | Reabrir (`reabrir_processo`) | `EM_PREENCHIMENTO` |
| `EM_PREENCHIMENTO` or `PENDENTE` | Cancelar (`cancelar_processo`) | `CANCELADO` |

**Not CLIENT-initiated in UI today:** `IMPORTADO`, `CONCLUIDO` (downstream/import/operations — no Connect button spec).

**Manual status picker:** **Not supported** — direct `status` updates blocked (`status_transition_not_allowed`); only lifecycle RPCs.

**Timestamps (read-only detail):** `pendente_at`, `importado_at`, `concluido_at`, `cancelado_at` when present.

### 4.B Proposed UX presentation

| Surface | Behavior |
|---------|----------|
| List | Badge with label + optional semantic color; not color-only (include text) |
| Create | Explain initial “Em preenchimento” in subtitle |
| Edit | Status read-only in header; never dropdown |
| Detail | Prominent badge in identity block; timeline line for protocolado em `pendente_at` |
| PENDENTE | Banner: awaiting import; primary action **Editar** → calls Reabrir then enables edit |

---

## 5. Information architecture (Protocolos)

**Routes (technical, unchanged):** `/app/processos`, `/app/processos/novo`, `/app/processos/:idProc`.

**Nav (product labels after PROTO-UI.1):**

- CLIENT: Protocolos | Pulse | Novo protocolo  
- ACTUS: Protocolos | Pulse (+ Administração if capability)

**Primary object flow:** List → Detail ↔ Edit (same route, mode switch) ; Create → Detail after first save.

**Detail hierarchy (top → bottom):**

1. **Identity:** Protocolo #`id_proc`, status badge, Nº do Processo / Execução Provisória summary, cliente (ACTUS), autor, datas-chave  
2. **Core data:** parties, datas, instrução, observações (read-only blocks when not editing)  
3. **Documentos:** unified list + add actions  
4. **Execução Provisória:** if not merged into identity, secondary field group (prefer identity strip when populated)  
5. **Operational metadata:** protocolado em, importado/concluído/cancelado when set — **no** full event log in MVP unless a later slice exposes existing `operational_events` (not in React today)

**Avoid:** Single giant always-on form on detail; legacy toolbar (Pesquisar/Novo/Alterar/Excluir).

---

## 6. Novo protocolo (create)

| Decision | Recommendation |
|----------|----------------|
| Entry | Nav “Novo protocolo”; CLIENT only (redirect ACTUS to list) |
| Container | **Dedicated page** (current pattern) — better mobile + deep-link; not modal |
| Initial fields | Cliente (read-only), Data de Entrada (read-only preview), optional early fields only — **minimal:** allow empty draft with one action |
| Field order | Cliente → Nº do Processo → Reclamante → Reclamado → Data Entrada → Data Fatal → Instrução → Observações — **hide Execução Provisória on create** or collapse under “Identificação adicional” |
| Primary | **Salvar rascunho** → creates row `EM_PREENCHIMENTO`, navigates to detail |
| Secondary | Cancelar → list |
| Validation timing | On submit only for draft (`dt_fatal` past date if filled) |
| Pending | Disable actions + “Salvando…” |
| Success | Toast + navigate to detail for documents + protocolization |
| Failure | Toast with server message |
| Dirty leave | Optional `beforeunload` on create page if form dirty — recommended in PROTO-UI.2 |
| ACTUS | No create entry; banner already states supervision-only |

**Create implementation note:** Current code uses direct `insert` on `processos`; acceptable; lifecycle fields via RPC on detail.

---

## 7. Edit UX

| Aspect | Specification |
|--------|----------------|
| Entry | From detail when `canEdit`; from PENDENTE via **Editar** → `reabrir_processo` then edit |
| Editable | All CORE draft fields except Data de Entrada, Status, Cliente, `id_proc`, author |
| Immutable | `created_by`, `cliente_id`, status (except via RPC), `dt_entrada` |
| Save | **Salvar rascunho** → `salvar_rascunho` |
| Protocol | **Protocolar** → save draft then `protocolar_processo` |
| Cancel | Navigate back or discard local changes (re-fetch on enter) |
| Concurrency | Last write wins on draft fields; no optimistic locking in domain — show server error on conflict |
| Delete protocol | **Not in MVP UX** — no `DELETE` on `processos`. Domain has **Cancelar** (`cancelar_processo`) — see §18 |
| Non-creator CLIENT | Read-only message (current behavior) |
| ACTUS | Read-only all fields; no save/protocol/reopen |

---

## 8. List / search

### 8.A Current backend

- `listProcessos()`: select all visible via RLS, order `created_at DESC`.
- **No** server-side text search, status filter, or pagination API in React layer.

### 8.B Proposed UX (MVP)

| Element | Spec |
|---------|------|
| Columns | Protocolo (`id_proc`), Nº do Processo, Reclamante, Reclamado (add), Data Entrada, Data Fatal, Status; Execução Provisória column optional/narrow; ACTUS: Cliente column |
| Row action | Tap row → detail |
| CLIENT CTA | Novo protocolo |
| Search | **Client-side** filter on nº, parties, `id_proc` until backend exists — mark gap if PO wants server search at scale |
| Status filter | Client-side chip/filter — gap class: UI-only for current dataset |
| Ordering | Default newest first; optional user sort on Data Fatal (client-side) |
| Overdue | Visual badge on Data Fatal when &lt; today and status ∈ {Em preenchimento, Pendente} |
| Empty | “Nenhum protocolo cadastrado.” + CTA (CLIENT) |
| No results | Clear filters message |
| Loading / error | Skeleton or message + retry |
| Mobile | Card list replacing table under `md` breakpoint |

---

## 9. Detail UX

- **View mode default** when not editable: structured sections (§5), not disabled form controls only.
- **Edit mode:** inline or explicit “Editar” toggling same fields as today’s form component.
- **Documentos** always visible section.
- **Protocolization checklist** visible only when editable; labels must say **documento** (link ou arquivo), not “link salvo” only.
- Link to Pulse optional later; not required for Readiness.

---

## 10. Documentos — Adicionar link

| Aspect | Specification |
|--------|----------------|
| Section title | **Documentos** |
| Actions | **Adicionar link** \| **Anexar arquivo** (equal prominence; tabs or split button — no LINK/ARQUIVO enums) |
| URL | Required for link action; http/https only (match `validateLinkUrl`) |
| Description | **Nome** optional → `nome` |
| Save | Insert link row (`tipo=LINK`) — RLS: creator draft only |
| After save | Unified list item: title (nome or host), subtitle date, **Abrir** (new tab) |
| Remove | **Remover** with confirmation — must call `remover_documento` RPC (**not** direct DELETE — revoked in WP-03) |
| Edit link | **Not supported** in domain — remove + re-add (document gap: none if UX follows remove/add) |
| Protocol count | Backend counts LINK + active ARQUIVO via `process_has_active_documents` |

---

## 11. Documentos — Anexar arquivo

### 11.A Backend capability (existing)

Three-step Edge flow (authenticated JWT):

1. **POST** `webproc-document-upload-prepare`  
   Body: `{ id_proc, filename, content_type, size, nome? }`  
   Returns: `document_id`, presigned `upload_url`, `upload_capability`, `upload_headers`.

2. **PUT** file to presigned URL (client).

3. **POST** `webproc-document-upload-confirm`  
   Body: `{ document_id, upload_capability }`.

**Download:** **POST** `webproc-document-download-prepare` with `{ document_id }` → short-lived `download_url`.

**Policy (Edge `file-policy.ts`):** Extensions pdf, doc, docx, xls, xlsx, csv; matching content-types; max size default **100 MB** (`WEBPROC_MAX_UPLOAD_BYTES`).

**Authorization:** Same as links — creator, `EM_PREENCHIMENTO`, active client membership.

**Removal:** ARQUIVO cannot use `remover_documento` from browser (`arquivo_removal_requires_coordination`) — MVP UX: **no Remover for files** unless a future governed slice adds Edge-coordinated removal; links only Remover.

### 11.B UX specification

| Step | UX |
|------|-----|
| Select file | File picker; show name + size before upload |
| Optional nome | Display name field |
| Progress | Determinate progress during PUT; disable duplicate submits |
| Success | Toast + list row with file name, **Baixar** (via download-prepare + open/navigation) |
| Failure | Map codes: too large, invalid type, capability expired → retry prepare |
| Retry | New prepare request; same document_id rules per server |
| ACTUS | Read-only: list + download if RLS SELECT allows |

**Implementation slice:** PROTO-DOC.2 — wire API helpers invoking Edge functions; unified list query all `processo_documentos` for `id_proc`.

---

## 12. Unified document presentation

Single list component:

| Display | Link | File |
|---------|------|------|
| Primary | `nome` or “Link externo” | `nome` or `nome_arquivo` |
| Secondary | Formatted `created_at` | Size (human) + date |
| Affordance | Icon “link” (decorative) | Icon “paperclip” (decorative) — not enum labels |
| Primary action | **Abrir** | **Baixar** (or Abrir if PDF inline desired later) |
| Secondary | Remover (draft, creator) | — (until removal slice) |

Hide: `object_key`, `storage_state`, UUID except internal API calls.

---

## 13. Execução Provisória UX

- **Create:** collapsed/ omitted from first screen preferred.  
- **Detail/edit:** same group as Nº do Processo under “Identificação”.  
- **List:** show column or subtitle when nº empty.  
- **Protocol checklist:** single row “Nº do Processo ou Execução Provisória”.  
- **Validation:** XOR on create, draft save, and protocolization.  
- **Conflict:** Current UI places exec on create form — implementation may move per this spec without domain change.

---

## 14. CLIENT vs ACTUS

| Capability | CLIENT (membership) | ACTUS |
|------------|---------------------|-------|
| View list/detail | Own client(s) via RLS | All clients (read) |
| Novo protocolo | Yes | No (hidden + redirect) |
| Edit / protocol / reabrir | Creator + rules | No |
| Documentos add/remove | Creator draft | No |
| Documentos download | Yes if visible | Yes (read) |
| Nav | + Novo protocolo | Supervision banner |
| Admin | No | If `admin_*` capability |

Authority from RLS/RPC — UI mirrors existing gates only.

---

## 15. Responsive UX

- List: table → cards &lt; `md`.  
- Forms: single column mobile; two column desktop for short fields.  
- Documentos: stack add-link fields vertically on mobile.  
- Sticky footer actions for **Salvar** / **Protocolar** on detail edit — optional, only if viewport hides primary actions.  
- Touch targets ≥ 44px for primary buttons.  
- Horizontal scroll table only as fallback with hint.

---

## 16. Accessibility (minimum)

- Every input has `<Label>` / `htmlFor`.  
- Status in badge text, not color alone.  
- Focus management after add document / close dialog.  
- Validation errors linked via `aria-describedby` + `role="alert"` for summary toasts duplicated inline where field-level.  
- Loading: `aria-busy` on submitting regions.  
- Destructive: confirm dialog for Remover link (and future cancel if added).  
- Headings: one `h1` per page; sections `h2`.  
- List: semantic table with headers on desktop; cards with labeled fields on mobile.

---

## 17. Implementation gap matrix

| UX capability | Current support | Gap | Required slice | Gap class |
|---------------|-----------------|-----|----------------|-----------|
| List/search | Basic list, no search | Product term Processos; no mobile cards; no overdue | PROTO-UI.1 | UI wiring |
| Create | Works | Copy/IA; exec on create heavy | PROTO-UI.2 | UI wiring |
| Edit | Operational workspace + read blocks | — | **PROTO-UI.3 CLOSED/PASS** | Closed |
| Status | Badge + Prazos operational panel | — | **PROTO-UI.3** | Closed |
| Detail | Multi-column cards + accents | — | **PROTO-UI.3** | Closed |
| Documents — link | **PROTO-DOC.1 CLOSED/PASS** | RPC remove + product copy; create via existing INSERT | — | Closed |
| Documents — file | **PROTO-DOC.2 CLOSED/PASS** | Upload/download wired | — | Closed |
| Document open/download | Links: Abrir; files: **Baixar** | — | — | Closed |
| Unified document list | **PROTO-DOC.1 + DOC.2** | LINK + stored ARQUIVO | — | Closed |
| Protocol doc count | Active helper incl. stored files | — | — | Closed |
| Execução Provisória | On form | Placement vs spec | PROTO-UI.2 | UI wiring |
| Responsive | Partial table scroll | Card list | PROTO-UI.1 | UI wiring |
| CLIENT/ACTUS | Implemented | Label/banner only | PROTO-UI.1 | UI wiring |
| Link remove | **`remover_documento` RPC** | — | — | Closed |
| Cancel protocol | `cancelar_processo` RPC | **PROTO-UI.2** detail action (draft/pending creator) | — | Closed |
| Operational history | DB events | No UI | Post-MVP | — |
| Server list search | — | Not in API | Future | DB/domain if scale |

---

## 18. Proposed implementation slices

### PROTO-UI.1 — Terminology, list, nav

- **Scope:** Protocolos copy; nav labels; list columns/cards; overdue badge; ACTUS cliente column.  
- **Non-scope:** Document upload, edit IA refactor.  
- **Deps:** None.  
- **Gate:** ACTUS + CLIENT smoke list; mobile layout; no route renames.

### PROTO-UI.2 — Novo protocolo + core edit fields

- **Scope:** Create page IA; XOR messaging; validation copy; Data Fatal default; cancel on detail (see TECHNICAL-DEBT PROTO-UI.2).
- **Status:** **CLOSED/PASS** (dates/cancel slice).

### PROTO-UI.2b — Novo dual identification + Documentos on create

- **Status:** **CLOSED/PASS** (2026-10-01) — **manual PO browser gate** (PO CLIENT session; MCP automation not used).
- **Scope:** No identification radio; both XOR fields visible with mutual disable; Documentos on Novo; ensure-draft before link; update-on-save (`draftIdProc`).
- **Non-scope:** PROTO-DOC.2 upload; governance/Pulse (see **AR-PROTO-GOV-01** in TECHNICAL-DEBT).

### PROTO-UI.3 / PROTO-UI.3b — Protocolos operational UX + visual language

- **Status:** **CLOSED / PASS** (2026-10-01). PO visual approval 2026-10-01 (revision 2).
- **Visual language (suite baseline):** [`docs/design/ACTUS-CONNECT-OPERATIONAL-VISUAL-LANGUAGE.md`](./design/ACTUS-CONNECT-OPERATIONAL-VISUAL-LANGUAGE.md) v0.1 — shared Actus Connect grammar; WebProc Protocolos is the reference implementation.
- **Scope delivered:** Desktop workspace grid; semantic accent cards; context header; read/edit modes; focus scoping; Documentos/Protocolização/Cancelamento presentation; mobile collapse; shell scroll padding.
- **Illustrative reference:** `docs/design/actus-connect-operational-ui-reference.png` (not a functional spec).
- **Non-scope (unchanged domain):** PROTO-DOC.3; Pulse/list/grid redesign; D0/D+1 UI; image-only chrome (search, sidebar, extra actions).

### PROTO-DOC.1 — Unified Documentos (links)

- **Status:** **CLOSED/PASS** (2026-10-01).
- **Scope:** Unified **Documentos** section; `listProcessoDocuments` + active-document helper; `remover_documento` RPC with confirmation; add-link product copy.
- **Non-scope:** File upload/download (PROTO-DOC.2).
- **Gate evidence:** CLIENT DEV smoke A–J — Documentos visible on editable draft; add link; Abrir; remove with confirmation via RPC; invalid URL messaging; ACTUS read-only (no add/remove); checklist tracks active document count; mobile width without horizontal overflow; no direct DELETE in UI path.

### PROTO-DOC.2 — File upload/download

- **Status:** **CLOSED / PASS** (2026-10-01). PO manual smoke PASS on DEV (upload, list, size, **Baixar**, invalid type blocked; lifecycle: PENDENTE → Editar/Reabrir → add document → Protocolar → PENDENTE).
- **Scope:** Prepare / PUT / confirm / download-prepare in unified **Documentos**; client validation; readiness integration; Novo ensure-draft.
- **Non-scope:** ARQUIVO **Remover**, cancellation storage cleanup — **PROTO-DOC.3** (see TECHNICAL-DEBT).
- **Deps:** PROTO-DOC.1 (closed).
- **Document mutability:** See TECHNICAL-DEBT (PENDENTE read-only until **Editar/Reabrir**; no separate pending-document edit path).

### PROTO-DOC.3 — Coordinated file removal & retention

- **Status:** **DEFINED / NOT STARTED** (2026-10-01).
- **Scope:** Coordinated manual file removal; post-cancel physical cleanup; audit vs physical deletion — full direction in **TECHNICAL-DEBT** § PROTO-DOC.3.
- **Non-scope:** PROTO-DOC.2 upload/download (closed).

### PROTO-UX.GATE — Readiness regression

- **Scope:** a11y pass; responsive checklist; CLIENT/ACTUS matrix; copy audit (no LINK/ARQUIVO).  
- **Deps:** All above.  
- **Gate:** PO sign-off for Product/UI-UX Readiness (does not close production readiness).

---

## 19. Decisions vs findings

### Already decided by PO (do not reopen)

- Protocolos user language; Pulse Demandas unchanged.  
- CORE fields + Documentos dual mode; no `instituicao`.  
- Legacy mental model, not layout.  
- File upload required for Readiness (not P2).  
- Nº do Processo OR Execução Provisória at protocolization.

### Repository / domain findings

- Lifecycle RPCs enforce protocol rules including documents via `process_has_active_documents`.  
- Link removal: UI uses **`remover_documento`** (PROTO-DOC.1); direct DELETE removed from frontend path.
- File pipeline: **PROTO-DOC.2 CLOSED/PASS**; ARQUIVO removal/retention → **PROTO-DOC.3**.
- `getProtocolRequirements` / checklist text understates arquivo requirement.  
- ACTUS read-only cross-client; CLIENT creator-only mutations.  
- `cancelar_processo` exposed in PROTO-UI.2 (detail, draft/pending creator).
- No operational event timeline in frontend.

### Genuine decisions still required (PO)

1. **Cancelar protocolo:** Implemented in PROTO-UI.2 (confirmed cancel, not delete). **PROTO-GOV.1 / AR-PROTO-GOV-01:** mandatory cancellation reason enforced server-side; motivo + `status_antes_cancelamento` persisted on `processos`. **PROTO-GOV.1b:** cancellation evidence read-only in list (motivo column/card) and detail (**Cancelamento** section).
2. **List search at scale:** Client-side filter sufficient for MVP or prioritize server-side search RPC?  
3. **ARQUIVO remove / cancel cleanup:** **PROTO-DOC.3** defined (TECHNICAL-DEBT); not started.

### AR-PROTO-GOV-01 — Protocol temporal & decision governance (approved)

**Source of truth:** [`docs/TECHNICAL-DEBT.md`](./TECHNICAL-DEBT.md) § AR-PROTO-GOV-01.

Summary for UX planning:

- Distinguish lifecycle status, temporal conditions (Data Fatal hoje / vencida + aging), and human decisions.
- **Pulse** surfaces attention conditions; **Protocolos** executes operations — no auto-cancel on overdue.
- Future **Data Fatal change history** and **required cancel reason** are domain requirements, not yet implemented.
- **UX-PROTO-BLOCK-01:** **CLOSED / PASS** — central protocolization blocker dialog + checklist emphasis (PO visual smoke PASS).

---

## 20. Document history

| Date | Change |
|------|--------|
| 2026-10-01 | PROTO-UI.2b manual gate; AR-PROTO-GOV-01 + UX-PROTO-BLOCK-01 recorded |
| 2026-09-30 | UX-02 initial specification for PO review |
