# Actus Connect Operational Visual Language

**Version:** 0.1
**Status:** PO APPROVED BASELINE
**Date:** 2026-10-01

**Authority:** First implementation and PO approval on WebProc **Protocolos** (PROTO-UI.3 / PROTO-UI.3b). This document extracts approved visual/product principles. It is **not** a full design system and does **not** specify FlowProc screens or requirements.

**Illustrative reference (non-functional):** [`actus-connect-operational-ui-reference.png`](./actus-connect-operational-ui-reference.png) — desktop layout is the large area; the narrow phone mock on the far right shows **responsive collapse only**, never a desktop sidebar.

**Implementation source of truth:** Current Protocolos Novo/detail code plus primitives listed in §15.

---

## 1. Purpose and scope

- **Shared identity** for the Actus Connect product suite (WebProc today; FlowProc and future operational surfaces later).
- WebProc and FlowProc should read as **products of the same suite** (typography, surfaces, accents, action hierarchy) even when **screen composition and domain grouping differ**.
- This language defines **visual grammar**, not identical page layouts.
- Domain UX, lifecycle rules, and information architecture remain **module-specific**; only presentation patterns are shared where reuse is justified.

---

## 2. Design principles

1. **Operational clarity before decoration** — hierarchy serves task completion, not visual novelty.
2. **Restrained but identifiable color** — avoid monochrome flatness; avoid saturated “dashboard gaming” aesthetics.
3. **Hierarchy through surfaces, typography, and semantic accents** — not through excessive shadow, gradient, or icon noise.
4. **Web-responsive composition** — use width for spatial organization where it helps; do not stretch a single long form merely because desktop space exists.
5. **Operational information density** — compact but breathable; whitespace supports scanning; app chrome also affects perceived density.
6. **Mobile as transformation** — same information architecture, single-column collapse; logical order preserved.
7. **Domain state and actions outrank decoration** — status, permissions, and primary workflow actions must remain obvious.

---

## 3. Typography

Use **existing** Actus Connect / login theme fonts only (no new bundles):

| Role | Convention |
|------|------------|
| Major page / section context | **Playfair Display** (`font-serif`) — e.g. protocol title, operational card titles |
| Body, labels, metadata | **Inter** (default sans) |
| Section titles in cards | Serif, `text-base` semibold, often tinted by semantic accent |
| Labels (forms / read blocks) | `text-xs`–`text-sm`, `text-muted-foreground` for labels; `text-sm` medium weight for values |
| Page title | Serif, `text-2xl`–`text-3xl`, `text-primary` |

Do not introduce additional display fonts without PO approval.

---

## 4. Layout / workspace

- **Constrained operational workspace** — content column aligned with app shell (currently `max-w-6xl` on Protocolos pages, matching `WebProcShell` main width).
- **Desktop multi-column** where semantically useful — e.g. main information column + operational side column; full-width bands below for cross-cutting areas (documents, readiness).
- **Mobile single column** — grid `order` or equivalent; typical Protocolos order: Identificação → Prazos e andamento → Informações → Documentos → lifecycle/readiness actions.
- **Cards may differ in width and role** — not every block is an equal full-width stacked card.
- **Sticky operational panels** (desktop only when appropriate) — e.g. deadlines/progression column; offset accounts for sticky app header (`scroll-pt` / `scroll-mt` on shell and workspace).
- **Whitespace** is intentional for readability; avoid both cramped fields and excessive vertical gaps between every micro-section.

---

## 5. Operational cards

Approved **card grammar** (implemented as `ProtocoloSectionCard`; describe generically for other modules):

| Element | Treatment |
|---------|-----------|
| Container | `rounded-lg`, `border border-border`, `bg-card`, light `shadow-sm` |
| Semantic emphasis | **Thin top border** (≈3px) in role color |
| Header | **Light tint** (`bg-* / opacity`), bottom border optional |
| Icon | Small **icon chip** in header (decorative, `aria-hidden` on icon wrapper) |
| Title | Serif semibold, often role-tinted |
| Description | Optional `text-sm text-muted-foreground` |
| Body | Neutral card surface; form fields or label/value blocks |

FlowProc (future) should reuse this **grammar**, not necessarily the same titles or icons.

---

## 6. Semantic accent roles

Accents encode **functional category**, not decoration. Prefer theme tokens (`primary`, `destructive`) or restrained semantic hues with light/dark variants.

**Current Protocolos mapping (examples only):**

| Role key (implementation) | Semantic intent | Typical hue family |
|---------------------------|-----------------|---------------------|
| `identificacao` | Identity / core record fields | **Primary / brand** |
| `prazos` | Deadlines, progression, operational time | **Emerald** (operational) |
| `informacoes` | Complementary, lower-weight notes | **Violet** |
| `documentos` | Attachments / external files | **Sky** |
| `protocolizacao` | Readiness / checklist / gate to next stage | **Amber** |
| `cancelamento` | Irreversible governance / cancellation evidence | **Destructive** |

**FlowProc:** Map domain concepts to the **same semantic grammar** (e.g. a “stage deadlines” panel → operational/deadline role), not necessarily the same keys or colors file-for-file.

Defined in code: `src/lib/operational-visual-language.ts` (`OperationalAccentRole`, `operationalAccentByRole`).

---

## 7. Status and governance signals

Keep layers distinct:

| Layer | Purpose | Examples |
|-------|---------|----------|
| **Card/category accent** | “Which functional area is this?” | Top border + header tint on Prazos card |
| **Lifecycle / status badge** | “What state is the entity in?” | Header badge: Pendente, Em preenchimento |
| **Warning / attention** | Validation or legacy data repair | Amber text for XOR dual-fill warning |
| **Destructive / error** | Irreversible or failed action | Cancel actions, `role="alert"` errors |
| **Future temporal governance** | D0 / D+1 / aging (not in v0.1 UI) | Must not be faked with static labels in Protocolos v0.1 |

Do **not** overload one color for category + lifecycle + temporal urgency simultaneously.

---

## 8. Forms and focus

- **Editable fields** must be visibly distinct on focus — scoped enhancement (Protocolos: `webprocEditableFieldClassName` on inputs/textareas), using theme ring/accent/border; global `Input` primitive unchanged to limit app-wide regression.
- **Read-only / view mode** — prefer **label + value** blocks over disabled inputs when the user cannot edit.
- **System / immutable values** (e.g. Data de Entrada) — read-only styling; avoid unnecessary **tab stops** (`tabIndex={-1}` where appropriate).
- **Keyboard** — preserve natural tab order; labels associated with controls; no mouse-only ordinary data entry.
- **Validation** — product messages with `role="alert"`; not color-only.

---

## 9. Actions

| Level | Convention |
|-------|------------|
| **Primary operational** | `variant="legal"` — e.g. Protocolar, Editar/Reabrir, Salvar rascunho (context-dependent primary) |
| **Secondary** | `variant="outline"` — Voltar, Salvar when paired with stronger primary |
| **Destructive** | Outline + destructive border/text, separated spatially from primary cluster — Cancelar protocolo |
| **Lifecycle** | Placed in **context header** or dedicated band when they change entity state (PENDENTE → Editar) |

Actions must not all compete at equal visual weight. Group related actions; separate destructive flows.

---

## 10. Responsive behavior

- **Desktop:** Multi-column operational layout permitted when IA supports it.
- **Narrow viewports:** Single column; preserve **logical reading order** (Protocolos: Identificação → Prazos → Informações → Documentos).
- **No horizontal scroll** for normal CLIENT workflows; long text uses `break-words` / `break-all` where needed.
- **Do not** render a “sidebar” or phone mock column beside desktop content — mobile reference is collapse only.
- **No new bottom navigation** in v0.1; existing shell navigation remains authoritative.

---

## 11. Shared vs domain-specific

| Shared Actus Connect | Domain-specific (WebProc / FlowProc / Pulse) |
|----------------------|-----------------------------------------------|
| Typography (serif + Inter) | Card composition and grid per screen |
| Surface language (card, border, muted) | Information grouping (Identificação vs FlowProc stages) |
| Semantic accent **roles** | Mapping roles to domain concepts |
| Focus behavior pattern | Field sets and validation rules |
| Button hierarchy (legal / outline / destructive) | Workflow actions and RPCs |
| Status badge treatment | Domain status enums and labels |
| Spacing / radius philosophy (`--radius`, card padding) | Governance rules (XOR, protocolization) |
| Responsive collapse principles | Pulse cockpit metrics; list/grid columns |

---

## 12. Application guidance

1. **Protocolos (WebProc)** — First **PO-approved** implementation (PROTO-UI.3 / UI.3b). Reference implementation for v0.1.
2. **Processos list/grid** — Should **inherit** language (typography, accents, density); **not** mechanically copy Protocolos detail card layout.
3. **Pulse** — Future **operational attention / cockpit** using the same grammar; avoid unrelated colored widgets or vanity metrics.
4. **FlowProc** — When UI is refined, adopt the same Actus Connect visual grammar; **do not** duplicate WebProc page structure speculatively.

Normative doc path for future slices: this file (v0.1+).

---

## 13. Anti-patterns

- Excessive monochrome (flat gray-on-white stacks with no semantic anchors).
- Arbitrary decorative colors per screen or per developer preference.
- Every section as an **equal full-width** vertical card with no spatial composition.
- Maximizing horizontal form width on desktop “because space exists.”
- Color as the **only** carrier of meaning (accessibility and copy still required).
- Copy-pasting WebProc Protocolos layout into FlowProc without domain IA.
- **New palette per module** — breaks suite identity.
- Pulse as a **“gaming dashboard”** (gradients, vanity KPIs, decorative charts).
- Extracting shared React packages before a **second product surface** validates reuse.

---

## 14. Current reusable implementation

| Artifact | Label | Notes |
|----------|--------|--------|
| `docs/design/ACTUS-CONNECT-OPERATIONAL-VISUAL-LANGUAGE.md` | **Actus-shared** | This baseline |
| `src/lib/operational-visual-language.ts` | **Shared candidate** (WebProc-local path today) | Accent role tokens; `protocoloWorkspaceClassName` is Protocolos-named |
| `ProtocoloSectionCard` | **Shared candidate** (WebProc-local) | Generic card grammar + `accentRole` |
| `ProtocoloContextHeader` | **WebProc-local** (pattern reusable) | Entity context header; rename/generalize when second surface needs it |
| `webproc-field-styles.ts` | **Shared candidate** (WebProc-local name) | Scoped focus classes |
| `ProcessoFormFields` workspace grid | **WebProc-local** | XOR, fields, read mode — domain-specific |
| `WebProcShell` `scroll-pt-[5.5rem]` | **Actus Connect shell** | Prevents sticky header overlap |
| Global CSS (`index.css`, login theme) | **Actus-shared** | `--primary`, `--destructive`, `--radius`, shadows |

**This task does not move or rename files.** Promotion to `@/components/connect/*` or similar waits on demonstrated reuse (§15).

---

## 15. Evolution rule

- **v0.1** is an approved baseline, **not** a frozen design system.
- New patterns emerge from **validated product needs** (PO-approved slices).
- Promote a pattern to **shared Actus Connect primitive** only after reuse is demonstrated (e.g. FlowProc or Grid adopts the same card shell).
- Avoid premature abstraction, speculative tokens, or large Figma-only systems without code counterparts.
- Version bumps (0.2, …) require PO acknowledgment when principles or roles change materially.

---

## Related documentation

- WebProc Protocolos UX spec: [`docs/UX-02-Protocolos-Operational-UX-Specification.md`](../UX-02-Protocolos-Operational-UX-Specification.md)
- Delivery / slice status: [`docs/TECHNICAL-DEBT.md`](../TECHNICAL-DEBT.md) (PROTO-UI.3, PROTO-DOC.*)
