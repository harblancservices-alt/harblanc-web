# Operational Completion Audit — Phase 5

**Date:** 2026-08-06
**Question this audit answers, and only this question:** *If `/admin` were deleted tomorrow and `/tms-v2` shipped as-is, could Brent run his entire trucking company — quote to cash, dispatch to delivery, a wrench turned in the shop — without ever needing the legacy app back?*

**Method:** 100% read-only. No application code was written or modified to produce this report — the only file this audit creates is this one. Four independent research passes were run against the actual codebase (not documentation, not naming conventions) and cross-checked against each other: an orphaned-capability sweep (every exported server action vs. its call sites, mechanically grepped), a state-machine transition matrix for every stateful entity, an end-to-end trace of six operational chains across page boundaries, and a mobile-only field-operations audit. Every claim below traces to a file path, usually a line number, and where a claim is "X doesn't exist," it is backed by the actual grep that was run to confirm it, not an inference from absence of documentation.

**Relationship to the Phase 4 report:** `docs/portal/feature-gap-report.md` (Phase 4) audited *pages and features* workspace by workspace. This audit deliberately ignores page boundaries and asks a narrower, harder question: does a complete business transaction — the whole arc from "a stranger emails asking for a quote" to "the money is in the bank" — survive being run through tms-v2 alone? The two reports agree on every underlying fact; this one adds workflow-chain tracing, a full state-machine audit (including reverse/exception transitions Phase 4 didn't systematically enumerate), a mechanical dead-code sweep, and a numeric production-readiness score.

---

## Headline finding

**tms-v2's read layer and its write layer are at two completely different stages of completion, and that gap is the whole story of this audit.**

Nearly every screen in tms-v2 shows live, correct, well-computed data — arguably better data than legacy in several places (server-side aggregation, a single canonical net-profit calculation, bounded queries). But of the **9 stateful business entities** in the app (Load, Quote/Lead, Trip, Maintenance, Broker, Expense, Application, Camera, Files), only **2 have meaningful write capability in tms-v2 today (Load, partially; Expense, mostly)**. The other **7 are pure read-only surfaces** — Trip, Broker, Maintenance, Quote/Lead, Application, Camera, and Files cannot be created, edited, or transitioned at all from tms-v2. See [§11](#11-production-readiness-score) for the full math.

A second, equally important finding: **two of the discoveries in this audit are not tms-v2 regressions at all — they're gaps in the whole product, legacy included.** `recordPayment` (the function that would record a customer payment and unlock dispatch) has **zero callers anywhere in the entire codebase**, legacy or new. And soft-deleted Loads, Trips, Brokers, and recurring Expenses have **no restore path in either app**. These are called out explicitly throughout so they aren't mistaken for tms-v2-specific bugs — but they matter for the central question just as much, because Brent can't complete these workflows in `/admin` either.

---

## Table of contents

1. [Every missing workflow (six end-to-end chains)](#1-every-missing-workflow-six-end-to-end-chains)
2. [Every missing business state transition](#2-every-missing-business-state-transition)
3. [Every record trap](#3-every-record-trap)
4. [Every one-way workflow](#4-every-one-way-workflow)
5. [Every business dead end](#5-every-business-dead-end)
6. [Every orphaned capability](#6-every-orphaned-capability)
7. [Every mobile workflow gap](#7-every-mobile-workflow-gap)
8. [Master list: workflows that force a return to /admin](#8-master-list-workflows-that-force-a-return-to-admin)
9. [Legacy /admin worth preserving conceptually](#9-legacy-admin-worth-preserving-conceptually)
10. [Prioritized roadmap by operational impact](#10-prioritized-roadmap-by-operational-impact)
11. [Production-readiness score](#11-production-readiness-score)
12. [Information architecture notes](#12-information-architecture-notes-where-layout-itself-blocks-work)

---

## 1) Every missing workflow (six end-to-end chains)

Each chain below was traced through the actual legacy code first (to establish the full intended flow), then mapped step-by-step against tms-v2, with each step marked ✅ Works / ⚠️ Partial / ❌ Missing and a precise **break point** — the exact step where a real user, in the real app, would stop being able to continue.

### Chain A — Quote → Estimate → Negotiation → Accepted → Load → Delivered → Paid → Archived

| Step | tms-v2 status | Evidence |
|---|---|---|
| 1–7. Lead intake through payment (new→contacted→estimate_sent→awaiting_confirmation→booked→awaiting_payment→ready_to_dispatch) | ❌ Missing | `operations/page.tsx:31-36` — *"READ-ONLY for this phase... no compose/send/status-advance action exists yet."* No write action of any kind exists under `src/app/tms-v2/(authed)/operations/`. |
| 8. Create load | ✅ Works | `src/actions/tms-v2/loads.ts:150 addLoad` |
| 9. Advance to delivered + odometer | ✅ Works | `loads.ts:247 markLoadDelivered`, `:221 editLoadOdometer` |
| 10. Mark paid | ❌ Missing | `loads/[id]/page.tsx:191-193` |
| 11. Archive/delete | ❌ Missing | No delete/archive mutation exists for loads or leads anywhere in `src/actions/tms-v2/**` |

**Break point:** tms-v2 can complete steps 8–9 only. The entire commercial pipeline that produces a load (steps 1–7) is 100% read-only, and everything downstream of delivery (mark paid, archive) is entirely absent. **There is no way in tms-v2 to go from an inbound customer lead to a load existing at all** — a load can only be created by someone who already knows the deal terms and types them in from scratch, bypassing the sales pipeline entirely.

**Note (not a tms-v2 regression):** Quotes and Loads are not linked by any foreign key or code path even in legacy — a dispatcher manually re-keys a new Load once a deal is struck. This is a whole-product gap, not something tms-v2 broke.

### Chain B — New Broker → First Load → Invoice → Payment

| Step | tms-v2 status | Evidence |
|---|---|---|
| 1. Create broker (dedicated flow) | ❌ Missing | `brokers/page.tsx:61` — *"Quick-add and edit land in a later phase."* |
| 1′. **Implicit broker creation** | ⚠️ Partial | `src/actions/tms-v2/loads.ts:58-74 resolveBrokerId` — the Load form's broker field is free-text with autocomplete; typing a new name silently creates a broker row with **only `name` set** — no MC#, DOT#, factoring flag, or contacts |
| 2. Add broker contact | ❌ Missing | No contact-management mutation exists anywhere under `src/actions/tms-v2/` |
| 3. Load referencing broker | ✅ Works | Same `resolveBrokerId` path |
| 4. Load shows in Receivables | ✅ Works | `receivables/page.tsx` reads live |
| 5. Mark paid | ❌ Missing | Same as Chain A step 10 |

**Break point:** Broker creation is **not flatly absent** — it happens implicitly, correctly deduped by name, the moment a dispatcher types a new broker into the Load form. But that record is permanently incomplete (no MC#/DOT#/factoring/contacts) with **no edit UI anywhere in tms-v2** to ever finish it. The chain then breaks for good at step 5, mark paid.

### Chain C — New Trip → Assigned Loads → Odometers → Closed → Reopened

| Step | tms-v2 status | Evidence |
|---|---|---|
| 1. Create trip (dedicated flow) | ❌ Missing | No "New trip" page/button anywhere under `src/app/tms-v2/(authed)/trips/` |
| 1′. **Implicit trip creation** | ⚠️ Partial | `resolveTripId` (`loads.ts:76-93`), via the Load form's "+ New trip…" option — inserts `{name}` only, no `started_at`/`start_odometer` |
| 2. Assign loads to trip | ✅ Works | Same `resolveTripId` path |
| 3. Odometer bookend entry | ❌ Missing | `trips/[id]/page.tsx:156-158` — literal UI text: *"read-only bookends; entry lands with the writes phase."* No input exists. |
| 4. Close trip | ❌ Missing | `trips/[id]/page.tsx:99-101` — literal text: *"Editing, close/reopen land in a later phase."* No button exists at all — not a silent failure, an explicit deferred-feature notice. |
| 5. Reopen trip | ❌ Missing | Same as step 4 |

**Break point:** Steps 1 (implicit) and 2 work; the chain breaks hard at step 3 (odometer entry) and never recovers. A trip created via the Load form is permanently stuck "active," with no odometer data, forever — closing it requires `/admin`.

### Chain D — Maintenance Reminder → Repair → Receipt → Completed → Future Reminder

| Step | tms-v2 status | Evidence |
|---|---|---|
| 1. View reminders | ✅ Works | `maintenance/page.tsx:38-75`, live data |
| 2. Log a repair | ❌ Missing | No `src/actions/tms-v2/maintenance.ts` file exists at all. `maintenance/[id]/page.tsx:153-156` — *"logging services, editing parts, and managing reminders land in a later phase."* |
| 3. Attach receipt | ❌ Missing | Same root cause as step 2 |
| 4–5. Resolve reminder / compute next one | N/A | Unreachable — depends on step 2 |

**Break point:** tms-v2 can view (step 1) and nothing else. It breaks at the very first write action — logging a repair.

### Chain E — Expense Created → Completed → Attached → Accounted

| Step | tms-v2 status | Evidence |
|---|---|---|
| 1. Create expense | ✅ Works | `src/actions/tms-v2/expenses.ts:116 addExpense` |
| 2. Complete a gapped expense (fill amount/date/account/category) | ✅ Works | `editExpense` (`expenses.ts:132`) covers every field the "incomplete" check requires |
| 3. Attach receipt/document | ❌ Missing **in both apps** | Legacy's own UI stubs this: `ExpenseSlideOver.tsx:451-455` — *"No attachments yet... planned for a follow-up pass."* Not a tms-v2 regression. |
| 4. Appears in a report/reconciliation view | ❌ Missing **in both apps** | `src/lib/data/accounting.ts` never queries `recurring_expenses` at all (its own header comment confirms it's customer-payment-only); no Accounting or Performance view in **either app** folds recurring expenses into a company-wide net. |

**Break point:** This is the one chain where tms-v2 is genuinely on par with legacy through step 2. Both apps break identically at steps 3–4, which are pre-existing whole-product gaps, not something tms-v2 regressed.

### Chain F — Driver Delivery → POD → Signature → Invoice Ready → Payment Received

| Step | tms-v2 status | Evidence |
|---|---|---|
| 1. Mark delivered + odometer | ✅ Works | `markLoadDelivered` (`loads.ts:247`) |
| 2. POD upload | ❌ Missing | `loads/[id]/page.tsx:161-193` — documents section is a read-only list; *"Document uploads and payment-status actions (Mark paid) land in a later phase."* |
| 3. BOL e-signature | ❌ Missing | No `signBolRole` equivalent anywhere in `src/actions/tms-v2/` |
| 4. "Invoice ready" (implicit state) | ❌ Unreachable | Depends on steps 2–3 |
| 5. Mark paid | ❌ Missing | Same as Chain A. tms-v2 also has no `markLoadUnpaid` — even a from-scratch build today would need to add the reversible half too. |

**Break point:** step 2, immediately after the one thing that does work (mark delivered). **This is the single most consequential broken chain in the audit** — it is the most complete-on-paper (a load genuinely reaches `delivered` with a real odometer reading) and the most broken-in-practice (the driver who just delivered the load has no way to prove it, get it signed, or ever see it paid, all from the same screen that told them the delivery succeeded).

---

## 2) Every missing business state transition

Nine entities were audited for a complete transition matrix (all valid states, every forward/reverse/exception transition, grounded in the exact action or "NONE — gap"). Full per-cell citations are preserved in the underlying research; only the **gaps** are listed here (the complete matrices are large — see the individual chain evidence above for the fully-cited versions of Load and Trip, the two most operationally central).

| Entity | States (grounded) | Missing in tms-v2 | Missing in BOTH apps |
|---|---|---|---|
| **Load** | `pending / assigned / loaded / delivered / tonu`; `payment_status: unpaid / paid` | Mark paid, mark unpaid, delete, restore-from-tonu (no status field in the edit form at all) | Restore a soft-deleted load |
| **Quote/Lead** | 13-value enum: `new, contacted, estimate_sent, awaiting_confirmation, booked, awaiting_payment, ready_to_dispatch, dispatched, picked_up, in_transit, delivered, archived, lost` | **All writes** — create, every status advance, manual override, trash, restore, permanent delete | 8 of 13 states are never written as a target by *any* code path in either app (only reachable by direct DB edit) — `contacted, booked, dispatched, picked_up, in_transit, delivered, archived, lost` |
| **Trip** | `active / closed` | **All writes** — create (dedicated flow), edit, close, reopen, delete | Restore a soft-deleted trip |
| **Maintenance/Repair** | `dismissed_at` (reminder), category/position (not lifecycle) | **All writes** — log service, dismiss/undismiss reminder, delete part/service, attach/detach related repairs | — (repair deletion is intentionally hard/irreversible by design, not a gap) |
| **Broker** | free-text `status` (app convention: active/inactive) | **All writes** — create (dedicated), edit, status change, delete | Restore a soft-deleted broker |
| **Expense (recurring)** | `archived` boolean + soft-delete | Delete, skip-next-payment, duplicate, payment-method CRUD | Restore a soft-deleted (not archived) expense |
| **Application** | soft-delete only (no read/unread or approved/rejected column exists in the schema at all) | **All writes** — trash, restore, permanent delete | — (full cycle exists in legacy) |
| **Camera batch** | no lifecycle state exists (create/rename/delete only) | **All writes** — create batch, rename, capture photo, delete photo, delete batch (explicitly read-only by design: *"Capture happens on /admin/camera; this is the review surface"*) | — |
| **Files/documents** | exists / hard-deleted (no versioning, no approval state) | **All writes** — upload, sign, delete | Restore a deleted file (hard delete by design) |

**The pattern:** of 9 entities, **7 have zero write capability in tms-v2 at all.** Only Load (partial — the odometer-driven lifecycle works, but payment and deletion don't) and Expense (mostly — create/edit/archive/restore all work, delete and payment methods don't) have meaningful write surfaces.

**New finding beyond Phase 4:** `updateLoadStatus` (`src/app/admin/(authed)/dispatch/loads/actions.ts:323`) — the action that would let a load's status be manually corrected outside the odometer-derivation flow — has **zero callers anywhere in the codebase**, confirmed by exhaustive grep. This means the escape hatch that would otherwise let someone un-cancel a TONU load doesn't actually exist as live code even in legacy; legacy's only working escape hatch is the free-text status `<select>` in the Edit Load modal (`AddLoadModal.tsx:256-267`), which calls `updateLoad`, not `updateLoadStatus`. tms-v2's edit form has no status field at all, so **TONU is a true terminal state in tms-v2 specifically** — legacy can still get out of it via the edit dropdown, tms-v2 cannot.

---

## 3) Every record trap

A record trap is a record that can enter a state but structurally cannot leave it via any UI in tms-v2.

| # | Trap | Where it happens | Why it's stuck |
|---|---|---|---|
| 1 | **Every delivered/TONU'd load is permanently "unpaid"** | Load Detail, Receivables | No `markLoadPaid` exists anywhere in tms-v2 |
| 2 | **A TONU'd load can never be un-cancelled in tms-v2** | Load Detail | No status field in the edit form; the one legacy escape hatch (Edit modal's status dropdown) has no tms-v2 counterpart |
| 3 | **A broker created via the Load form's free-text field is permanently incomplete** | Any new-broker-via-load flow | No broker edit UI exists in tms-v2 at all — MC#, DOT#, factoring, and contacts can never be added later |
| 4 | **A trip created via the Load form's "+ New trip…" option has no start date or odometer forever, and can never be closed** | Any new-trip-via-load flow | No trip write actions exist in tms-v2 |
| 5 | **A load that reaches `delivered` has no path to attach POD or get a BOL signature** | Load Detail | No document upload/sign action exists in tms-v2 |
| 6 | **Overdue maintenance reminders never resolve inside tms-v2** | Maintenance | No log-service action exists; a reminder can only be cleared by switching to `/admin` |
| 7 | **Soft-deleted Loads, Trips, Brokers, and recurring Expenses have no restore path in EITHER app** | All four entities | No `restoreLoad`/`restoreTrip`/`restoreBroker` function exists anywhere in the repo, and `restoreExpense` only clears the `archived` flag, never `deleted_at` — this is a whole-product design gap, not tms-v2-specific |
| 8 | **`payments.status = 'refunded'`** is a defined, valid database value that **no code path in either app ever writes** — an unreachable state, not a stuck one, but functionally the same dead end | `payments` table | Confirmed by exhaustive grep across both apps |
| 9 | **8 of 13 `lead_status` values are unreachable** through the product in either app | Quotes/Leads | Only reachable by direct database edit |

---

## 4) Every one-way workflow

An action that can be performed but never reversed.

| Workflow | Direction that's missing | Where | Scope |
|---|---|---|---|
| **Mark a load TONU** | No "un-cancel" | Load Detail | Shared gap — legacy's only escape hatch (`updateLoad` via the Edit modal's status dropdown) has no tms-v2 counterpart, so this is fully one-way in tms-v2, only *mostly* one-way in legacy |
| **Broker created implicitly via Load form** | No edit, ever | Broker record | tms-v2-specific — the record is permanently frozen at whatever was typed in the Load form's broker field |
| **Trip created implicitly via Load form** | No edit/close/reopen, ever | Trip record | tms-v2-specific |
| **Mark a load delivered** | No "un-deliver" beyond the general odometer-downward-derivation path (which *does* work in both apps, but isn't an obvious/discoverable "undo") | Load Detail | Mostly parity — technically reversible via clearing odometer fields, not via a dedicated undo action, in either app |
| **Soft-delete anything** (Load, Trip, Broker, recurring Expense) | No restore | All four | Whole-product gap |
| **Delete a repair/part/photo/document** | No restore (by design — hard delete) | Maintenance, Camera, Files | Whole-product, intentional |

**Contrast worth noting:** recurring **Expense** archive/restore is the one entity where tms-v2 already got the reversible pattern right in both directions (`setExpenseArchived(id, true|false)`) — proof the pattern is well understood by the team when it's been built, which makes the *absence* of the same pattern for Load payment status and Trip status more clearly a sequencing gap (not yet built) rather than a design blind spot.

---

## 5) Every business dead end

Ranked by business impact. ("Dead end" here means: a plausible, expected next action from a given screen simply isn't available — not necessarily a broken button, often an *absent* one.)

| Dead end | Where it occurs | Why it blocks operations | Recommended fix | Business impact | Priority |
|---|---|---|---|---|---|
| Load reaches `delivered`, can't be marked paid | Load Detail, Receivables | Every dollar collected has to be reconciled back in `/admin`; tms-v2's own A/R numbers are permanently wrong the moment cash actually comes in | Build `markLoadPaid`/`markLoadUnpaid` + wire into both screens | Critical | **Critical** |
| Load reaches `delivered`, can't attach POD or get a BOL signed | Load Detail | The paperwork that proves delivery — and unlocks getting paid — has no home in tms-v2 at all | Port the signed-URL upload primitive once; wire POD, BOL, and signature capture on top of it | Critical, and mobile-specific (see §7) | **Critical** |
| Create broker but can't add contacts, edit MC/DOT, or set factoring | Brokers | Every broker relationship started in tms-v2 is permanently half-finished | Build broker `actions.ts` (create/edit/contacts/status) | High | **Critical** |
| Create trip but can't close it | Trips | Every trip started in tms-v2 stays "active" forever; trip-level P&L never resolves | Build trip `actions.ts` (create/close/reopen/odometer) | High | **Critical** |
| Log nothing for maintenance | Maintenance | A shop visit happening today cannot be recorded from tms-v2 at all — not even a partial record | Build maintenance `actions.ts` (log service, receipts) | High | **Critical** |
| Quote/lead pipeline entirely read-only | Operations | The revenue-generating sales motion (send estimate → send rate confirmation → collect payment) cannot happen from tms-v2 | Build the send/payment pipeline (this is the single largest build item in the whole audit) | Critical | **Critical** |
| Application received, can't be reviewed with contact actions or trashed | Operations → Applications | Recruiting workflow stalls; applicants pile up unreachable | Port detail view + trash lifecycle (small, self-contained) | Medium | High |
| Per-load expense (toll, lumper) has no add/delete path | Load Detail | The Net figure on every load is missing real costs the driver actually incurred | Build `addLoadExpense`/`deleteLoadExpense` | High, compounds daily | **Critical** |
| Settings values (fuel %, factoring %, goals) are display-only | Settings | The inputs that drive every net-profit calculation in the app can't be updated without `/admin` | Build settings write forms | Critical (silent, compounding error if a diesel price goes stale) | **Critical** |
| Camera capture stays on `/admin/camera` | Camera | A driver using only tms-v2 physically cannot scan a document | Port the capture flow | High, mobile-specific | High |

---

## 6) Every orphaned capability

Business logic that exists in the codebase but has no live path to reach it — found by mechanically grepping every exported server action against the whole `src/` tree for call sites.

### tms-v2 (`src/actions/tms-v2/**`)
**Zero orphaned exports.** Every single thing shipped in tms-v2's action layer (`addExpense`, `editExpense`, `setExpenseArchived`, `addLoad`, `editLoad`, `editLoadOdometer`, `markLoadDelivered`, `markLoadTonu`, `searchWorkspace`) has a confirmed UI caller. **The gap in tms-v2 is entirely about what was never built, not broken wiring on what exists** — a genuinely reassuring finding, since it means every future build item is additive, not a repair job.

### Legacy (`src/app/admin/**/actions.ts`) — 16 dead exports found

| Export | File:line | What it would enable if wired |
|---|---|---|
| **`recordPayment`** | `quotes/payment-actions.ts:77` | **The single most operationally significant dead function in the whole audit.** Records a customer payment and auto-advances `awaiting_payment → ready_to_dispatch` — the hinge between "customer paid" and "we dispatch the load." Zero callers anywhere in the entire codebase, legacy included. The doc comment on the function literally says "No UI yet." |
| `softDeletePayment` | `quotes/payment-actions.ts:280` | Undo an erroneously recorded payment |
| `updateLeadStatus` | `quotes/actions.ts:306` | Manual override of a lead's funnel stage (already known from Phase 4) |
| `updateLoadStatus` | `dispatch/loads/actions.ts:323` | Manually correct a load's status outside the odometer-derived flow — **newly found**; means the TONU-reversal escape hatch relies on a *different* code path than expected |
| `setReminderDismissed` | `maintenance/actions.ts:686` | Dismiss/undismiss a maintenance reminder without servicing it (already known from Phase 4) |
| `restoreApplications`, `permanentlyDeleteApplications` | `applications/actions.ts:143,165` | Bulk restore/purge from the Applications trash (the singular versions are wired; the bulk versions aren't) |
| `renameCameraBatch` | `camera/actions.ts:82` | Rename a photo batch after the fact |
| `restoreQuotes`, `permanentlyDeleteQuotes` | `quotes/actions.ts:181,208` | Bulk restore/purge from the Quotes trash |
| `updateDispatchOwnership` | `quotes/actions.ts:714` | Reassign which dispatcher owns a lead |
| `saveDraftEstimate` | `quotes/actions.ts:546` | Save an estimate draft outside the preview-build flow |
| `addDispatchNote` | `quotes/actions.ts:760` | Append a manual note to a lead's timeline |
| `buildAcknowledgementPreview` | `quotes/actions.ts:953` | Preview a customer acknowledgement email before sending |
| `saveBolDraft` | `quotes/bol-actions.ts:440` | Save a BOL draft independently of building a preview |
| `saveFinalizedQuoteDraft` | `quotes/finalized-quote-actions.ts:623` | Save a finalized-quote draft independently of building a preview |

### Read-only-by-omission database fields
Fields that are read and rendered in tms-v2 but have no corresponding write path anywhere in the app:

- **Broker fields** (`notes`, `status`, `factoring`, `mc_number`, `dot_number`, `phone`, `email`) and **all broker contact fields** — fully readable, zero write path (no `actions.ts` exists for brokers at all).
- **Per-load expense line items** (`category`, `amount`, `note`) — displayed on Load Detail, factored into the visible Net calculation, but **no add/edit/delete action exists**, and unlike most other gaps in tms-v2, this one isn't even flagged with "later phase" copy — it reads as a finished feature rather than an acknowledged gap.
- **`load_documents`** (rate con/BOL/POD) and **`payment_status`/`paid_at`** — both self-acknowledged in the UI copy, distinct from the silent gap above.
- **All `dispatch_settings` money-engine fields** (MPG, diesel $/gal, factoring %, monthly/annual net goal, current cash) — every load's Net is computed from these, and none can be edited from tms-v2.
- **All repair/maintenance detail fields** — fully read-only.
- **Every field on leads/quotes/applications** — confirmed zero write triggers anywhere under `operations/**`.

### Computed-but-never-rendered values
- **`BrokerProfile.identity.notes`** (`src/lib/data/broker-profile.ts:40,314`) — fetched from the database on every single broker-profile page load, assembled into the returned object, and then **never read** by the JSX that renders the page. A broker's notes are queried and silently discarded on every view. (The equivalent legacy pattern — Performance's dead `arTotal` — was checked and does **not** carry over to tms-v2's Today page; that specific field is correctly rendered there.)

### Schema tables with zero UI surface in tms-v2
`bol_signatures` (e-signature capture), `broker_lanes` (Backhaul lane data), `dismissed_alerts` (alert triage), `expense_activity` (audit trail), `countdown_goals` (custom savings goals), `reach_sends`/`reach_settings`/`reach_templates` (the entire Reach feature) — all exist in the schema, all back a real legacy feature, none are read or written anywhere under `src/app/tms-v2/**`.

---

## 7) Every mobile workflow gap

Audited from the position of a driver standing beside the truck: one hand, phone only, no desktop, possibly bad signal, possibly gloved or greasy hands.

| Workflow | Exists in tms-v2? | Mobile-appropriate? | Severity |
|---|---|---|---|
| Dispatch (view/accept next load) | ✅ Yes | ✅ Good — `DataList` stacked cards, hero card | — |
| Pickup (mark picked up + odometer) | ⚠️ Partial | Weak — buried in a plain modal, no comma formatting or numeric keypad hinting (legacy's inline dashboard field with `inputMode="numeric"` not ported) | Medium |
| Delivery (mark delivered + odometer) | ✅ Yes | ✅ Good — one-tap modal | — |
| Fuel (log a fill-up) | N/A | Not a distinct concept in **either** app — fuel is only a computed estimate, never a logged transaction | Low (shared gap) |
| Expenses — recurring | ✅ Yes | ✅ Good — inline composer | — |
| **Expenses — per-load (tolls, lumper)** | ❌ **Missing** | N/A | **High** — several times a week; a driver has nowhere to log a cash expense against a load and must remember it until back at a desktop, by which point the receipt is often lost |
| **Maintenance logging** | ❌ **Missing** | N/A | **High** — happens at every shop visit; receipt-loss risk is real and immediate |
| **Camera capture** | ❌ **Missing** (deferred to `/admin/camera` by design) | N/A | Medium |
| **BOL scan** | ❌ **Missing** — not even a generic file-picker fallback | N/A | **High** — happens at every pickup |
| **POD capture** | ❌ **Missing** | N/A | **Critical** — happens at *every single delivery*, i.e. daily; directly gates getting paid |
| **Signatures (BOL e-sign)** | ❌ **Missing** | N/A | **High** — same frequency as POD |
| **Documents (upload any)** | ❌ **Missing** (view only) | N/A | High — the shared root cause blocking BOL/POD/maintenance-receipt capture at once |
| **Trip management (create/close on the road)** | ⚠️ Partial (create-only, implicit) | N/A | Medium — happens at the end of a run |
| Load completion (assigned→delivered→**paid**) | ⚠️ Partial | Status side works, payment side doesn't | High |
| Receivables (view / mark paid) | ⚠️ Partial | View is fine, act is missing | Low-Medium (typically an owner task, not field-blocking) |

**The one fix that unblocks the most:** legacy's signed-URL direct-to-storage upload pattern (`createLoadDocUploadUrl`/`recordLoadDocuments`) is a single piece of infrastructure that, ported once, would unblock **four** separate mobile workflows at once — BOL scan, POD capture, maintenance receipts, and general document upload. It exists specifically so a large phone photo on a weak signal never times out against a server-action body-size limit; this is a real mobile-reliability requirement, not a nice-to-have.

**Mobile primitives tms-v2 already does well** (worth extending, not replacing): the `DataList` dual-mode component (table on desktop, stacked cards on mobile) used consistently across every list screen; the `Fab` floating-action-button pattern for primary adds; `ContextDrawer` for acting on a row without leaving the list; a thumb-reachable `BottomNav`. The read/status/money side of mobile is genuinely solid — it's specifically the document-capture side that hasn't been ported at all.

**Overall verdict:** A driver **cannot** complete a full day (dispatch → pickup → delivery → POD → signature → next dispatch) using only a phone and only tms-v2 today. The chain works cleanly through "mark delivered," then breaks completely — there is no camera button, no upload control, nothing on the load detail page except a read-only list and a note that says the capability lands later. The driver would have to switch to `/admin`, text a photo to someone, or lose the paperwork.

---

## 8) Master list: workflows that force a return to /admin

This is the direct answer to the audit's central question — every workflow that, as of today, cannot be completed in tms-v2 and therefore requires opening `/admin`.

**Entire pipelines with zero write capability:**
1. Quoting/estimating/sending a rate confirmation/recording a customer payment (the whole sales-to-cash pipeline)
2. Creating or editing a broker, or managing broker contacts
3. Creating, closing, or reopening a trip; entering trip odometer bookends
4. Logging any maintenance/repair visit or managing reminders
5. Reviewing or trashing a driver application
6. Capturing photos into a camera batch (must use `/admin/camera`)
7. Uploading, viewing-with-context, or deleting any document (rate con, BOL, POD, receipts) beyond a bare read-only link
8. The entire Reach (backhaul outreach) tool — 0% built
9. The entire Load Inquiry (one-off broker email) tool — 0% built

**Specific transitions within otherwise-working workflows:**
10. Marking a load paid or unpaid
11. Un-cancelling a TONU'd load
12. Deleting a load
13. Adding or deleting a per-load expense
14. Signing a BOL
15. Changing any Settings value (fuel %, factoring %, profit goals, demo mode)
16. Restoring any soft-deleted record (load, trip, broker, expense — note this also fails in legacy, so it forces a database-level fix either way, not a return to `/admin` specifically)
17. Deleting a file, or filtering files by the full 7-way legacy type taxonomy
18. Bulk actions of any kind (bulk archive/delete/category-change on expenses, bulk trash on quotes/applications)

**Net effect:** an owner-operator who tried to live entirely inside tms-v2 starting today would be forced back to `/admin` within the first hour of a normal working day — most likely at "a customer just paid the invoice" or "I need to log today's delivery paperwork," both of which are Critical-priority, high-frequency events.

---

## 9) Legacy /admin worth preserving conceptually

Not a call to copy legacy's visuals — a call to preserve the *reasoning* behind why these patterns worked, rebuilt with tms-v2's own component language.

### (a) Legacy mobile Load Detail — the foundation for the new mobile load experience

**The principle, stripped of legacy's specific styling:** a load's detail page should be a single continuous workspace, not a set of destinations. Everything a driver needs to touch during a delivery — status, money, paperwork — lives on one scroll, ordered by how often it's touched, with the highest-frequency action always one tap away even when its section is collapsed.

Concretely, what should survive into tms-v2's rebuild:
- **No tabs.** A tab switch is a real cost on a small screen with a weak connection; legacy's single-scroll layout removes that cost entirely for the two most common actions (check status, add a cost).
- **Status derived from the odometer, never a free-standing dropdown.** The one number a driver actually has in hand — the odometer reading — is also the one input that advances the load. This isn't a stylistic choice; it eliminates an entire category of "status says delivered but nobody ever recorded a delivery odometer" bugs. tms-v2 already does this correctly for the transitions it has built — the principle just needs to extend to whatever gets built next (don't reintroduce a dropdown when payment/document actions are added).
- **Inline edit-in-place for small, single-purpose edits; a modal only for genuinely multi-field records.** Odometer and per-load expenses are single-purpose edits and should stay inline, in place, in the flow.
- **Collapsed sections whose header still exposes the primary action.** A financials section that's collapsed by default but still shows "+ Add expense" in its header bar means the most common write action never requires "opening" anything first.
- **Non-throwing mutations with inline error text.** tms-v2's `MutationResult` pattern already does this correctly — it's the right template for every future action (mark paid, upload document, sign BOL) and should not be abandoned for anything new.
- **Signed-URL direct-to-storage uploads.** Not a UX nicety — a mobile-reliability requirement, since a phone photo over a weak signal must never be blocked by a server-action body-size limit or timeout.
- **Camera-specific capture per document type**, not one generic uploader — POD wants the rear camera forced with a confirm step, BOL wants an in-app scanner with a picker fallback, a rate con wants a generic picker. Three different real-world capture situations deserve three different flows, not one.

**How to rebuild it with V2 patterns (not legacy visuals):** one continuous `LoadActions`-style island stays as the command surface (already built, well-patterned); layer Mark Paid/Unpaid into it as a first-class action; add a Documents section using tms-v2's own visual language but built on the signed-URL upload primitive; add inline per-load expense add/delete using the same `MutationResult` pattern already proven on odometer edits; add BOL signing as a dedicated full-screen touch flow, styled to match tms-v2, not copied from legacy's `BolSigner.tsx`.

### (b) Legacy Dashboard → the evolution path into Today

**The principle:** a dashboard should be an inbox of things to *act on*, not a report of things to *notice*. Every widget on legacy's dashboard either lets you act right there or tells you exactly where to go and gets out of the way once you've dealt with it.

What should survive into Today's evolution:
- **Micro-actions embedded directly in the list**, not behind a click-through. Odometer entry and document upload on the active-loads cards meant the list itself was a working surface. Today's `DataList` is the right foundation for this — it just needs the same inline affordances added to its rows.
- **Alerts that can be triaged, not just displayed.** A list that only ever grows trains the user to stop reading it. The dismiss/undo pattern (with a deep-link quick-action baked into the dismiss) is what kept legacy's alert panel useful indefinitely; Today's `NeedsAttentionList` needs the same lifecycle, not just a longer list.
- **A visible goal you're racing against, not just a number.** The countdown widget's real value wasn't the progress bar — it was converting an abstract instruction ("keep the net up") into a concrete, dated target with a pace verdict. `dispatch_settings.monthly_net_goal` already exists and is already read by Performance; a single-goal version of this widget is schema-ready today, well before any multi-goal CRUD needs building.
- **Noticing context and offering the one action it makes valuable** — the empty-truck "farm a broker contact" card is the clearest example: it doesn't show a generic empty state, it recognizes "zero active loads" as an opportunity and offers exactly the one thing worth doing about it.
- **One collapsible summary instead of competing widgets** — keeping the page opening on the *work* (active loads), with alerts summarized to a single line until opened, rather than a wall of warnings above the fold.

**How this evolves into Today, in V2's own language:** extend `NeedsAttentionList` with the dismissed-alert lifecycle rather than building a new component; add inline odometer entry to the active-loads `DataList` rows using the same modal-triggered pattern already proven on Load Detail; ship a single-goal countdown card off the existing `monthly_net_goal` column as a fast win, with multi-goal support explicitly deferred; add a new-lead/new-application signal to `getNeedsAttention()`'s existing five categories rather than a separate widget.

---

## 10) Prioritized roadmap by operational impact

Ordered by "how much closer does this get Brent to running the company from tms-v2 alone" — not by workspace, not by how easy the fix is.

### Tier 1 — unblocks a complete, common, daily transaction end-to-end
1. **Mark load paid/unpaid** — closes Chains A, B, and F simultaneously; the single highest-leverage fix in the entire audit.
2. **POD + BOL signature capture** (built on one shared signed-URL upload primitive) — closes Chain F, the most field-critical broken chain, and unblocks 4 mobile workflows at once (§7).
3. **Per-load expense add/delete** — the Net figure on every load is silently wrong without this; touched constantly.
4. **Broker create/edit** (including contacts, MC/DOT, factoring, status) — without this the two apps' broker data permanently diverges from day one.
5. **Trip create/close/reopen/odometer** — without this every trip started in tms-v2 is a permanent record trap.
6. **Settings write forms** (fuel %, factoring %, goals) — every net-profit number in the app silently drifts without this.

### Tier 2 — unblocks a complete pipeline, less frequent but revenue-critical
7. **Quote/estimate/rate-confirmation send pipeline + real payment recording** — the biggest single build item, and note `recordPayment` doesn't even exist as live code anywhere, so this isn't "port a working feature," it's "build the feature legacy never finished either."
8. **Maintenance log-service + receipts** — closes Chain D; high receipt-loss risk while it's missing.
9. **Load delete**, and **restore-from-TONU** — closes the two remaining Load record traps.

### Tier 3 — completes secondary workflows
10. Applications detail view + trash lifecycle (self-contained, low effort, real weekly workflow).
11. Camera capture flow (in-cab use case the feature exists for).
12. Reach (mature existing design, port rather than redesign).
13. Load Inquiry (self-contained, fast to build).
14. Bulk actions across Expenses/Quotes/Applications trash.
15. Restore paths for soft-deleted records (Loads/Trips/Brokers/Expenses) — note this is a whole-product fix, needed in both apps.

### Tier 4 — polish, once the above is real
16. Countdown/goal widget on Today; alert dismiss/undo pattern; inline odometer+doc-upload on Today's active-loads list; CSV export/import; column sorting/saved filters; expense payment-method CRUD; performance trend charts; global search breadth (Files group, multi-field matching).

---

## 11) Production-readiness score

**The right unit to measure is workflow completion, not feature count** — a page can look finished and still be a dead end the moment a real transaction reaches it. Three independent measurements were taken and cross-checked; all three land in the same range.

### Measurement 1 — state-machine transition coverage (unweighted)

For each of the 9 audited entities, the fraction of legacy's *meaningfully-used* transitions (excluding transitions that are themselves dead code in legacy, like `updateLeadStatus`) that also exist in tms-v2:

| Entity | Legacy transitions counted | Present in tms-v2 | Coverage |
|---|---|---|---|
| Load | 8 | 4 | 50% |
| Quote/Lead | 7 | 0 | 0% |
| Trip | 4 | 0.5 (implicit, incomplete create only) | 13% |
| Maintenance | 5 | 0 | 0% |
| Broker | 3 | 0.5 (implicit, incomplete create only) | 17% |
| Expense | 7 | 3 | 43% |
| Application | 3 | 0 | 0% |
| Camera | 5 | 0 | 0% |
| Files | 3 | 0 | 0% |
| **Unweighted average** | | | **~14%** |

### Measurement 2 — frequency-weighted entity coverage

Same table, weighted by how often Brent actually touches each entity in a working week (Load and Expense dominate daily use; Camera and Files are occasional):

Weights used: Load 25, Quote/Lead 15, Trip 10, Maintenance 8, Broker 10, Expense 15, Application 3, Camera 5, Files 9 (sums to 100).

`(25×0.50) + (15×0) + (10×0.13) + (8×0) + (10×0.17) + (15×0.43) + (3×0) + (5×0) + (9×0) = 12.5 + 0 + 1.3 + 0 + 1.7 + 6.45 + 0 + 0 + 0 ≈ 22%`

### Measurement 3 — end-to-end chain completion (§1)

Estimating each of the six traced chains as the fraction of its steps that actually work in tms-v2 before the break point: Chain A ≈18%, B ≈70% (with a completeness caveat on the broker record), C ≈40%, D ≈20%, E ≈50% (shared gap, not v2-specific), F ≈20%.

`(18+70+40+20+50+20)/6 ≈ 36%`

### Measurement 4 — mobile field-workflow completion (§7)

Scoring each of the 14 audited mobile workflows 0–100 by how completable it is standing beside the truck: average ≈ **33%**.

### Reconciling the four numbers

| Measurement | Score |
|---|---|
| Entity transition coverage (unweighted) | ~14% |
| Entity transition coverage (frequency-weighted) | ~22% |
| End-to-end chain completion | ~36% |
| Mobile field-workflow completion | ~33% |

The spread exists because the four methods measure different things: the unweighted entity score is harshest because it treats Camera and Files as equal to Load; the chain and mobile scores are more forgiving because they credit partial progress (e.g., "reached delivered" counts for something even though the chain doesn't finish).

### Headline number

**~25% operationally complete** — a blended read across all four measurements, weighted toward the frequency-weighted entity score (the methodologically strongest of the four, since it reflects how often each gap is actually hit) with the chain and mobile scores as corroborating checks that the true number isn't lower.

**The critical caveat that makes this number meaningful:** this is a **write/workflow-completion** score, not a read-completeness score. If the same measurement were taken for *viewing* data — can Brent see his loads, his numbers, his brokers, his receivables, his performance — that score would be roughly **90%+**: virtually every workspace in tms-v2 renders live, correct, often better-computed data than legacy. **The gap this audit measures is entirely in the write layer**, and it is a large, real gap: tms-v2 today is closer to a very good reporting dashboard bolted onto a partial dispatch tool than it is to an operations system Brent could live in.

**Bottom line: tms-v2 is not ready to replace `/admin`.** It is ready to be the primary *read* surface today. It is not ready to be the primary *write* surface for anything except creating and progressing a load through delivery, and logging/completing a recurring expense. Every other write action Brent performs in a normal week — collecting money, managing brokers, running trips, servicing the truck, capturing delivery paperwork, working the sales pipeline — still requires `/admin`.

---

## 12) Information architecture notes — where layout itself impedes work

A short, targeted note (this audit's focus was workflow completeness, not visual design, per Brent's Phase 4 instruction that still applies) — cases where a workspace's *structure*, not just missing functionality, actively slows down or obscures the work that IS possible:

- **Settings renders every value as a static display row with no visual distinction from a form.** Even once write forms exist, the current layout (`&lt;Field&gt;` components indistinguishable from inputs-that-don't-exist) will need a real "this is editable" affordance — right now there's no way to tell, by looking, that these values are inert.
- **Trip and Maintenance detail pages use static explanatory text ("land in a later phase") in the exact visual position a primary action button would occupy.** This is honest and non-misleading today, but it means the information architecture of those pages was built assuming the action would slot in later — worth confirming the eventual button placement doesn't need to fight the current layout.
- **Load Detail's Documents section is a plain list with no visual "add" affordance at all** — not even a disabled button — so the section reads as genuinely finished/complete rather than pending, which is the one place in the app where the "later phase" self-documentation pattern breaks down (compare to Trip/Maintenance, which do label themselves).
- **Per-load expenses on Load Detail render inside the same visual card as the read-only P&L breakdown**, with no separation suggesting "this part is a ledger you could add to" — reinforcing the same finished-not-pending misread as Documents.
- **Mobile odometer entry is a full modal takeover for a single-field edit**, where legacy's inline dashboard-card field achieved the same result with less navigation — worth reconsidering once other inline-edit patterns (per-load expenses, mark-paid) are added to the same page, so the page doesn't accumulate five different modals for five single-field edits.

---

## Notes on scope and confidence

- Every finding traces to a specific file and, in nearly all cases, a line number and the exact grep run to confirm a negative claim ("no callers found" is always backed by the search that was performed).
- Findings that apply to **both** apps (dead `recordPayment`, no restore-from-soft-delete, the expense-attachment stub, the expense-reconciliation gap) are called out explicitly throughout so they are never mistaken for tms-v2-specific regressions — they represent real backlog, just not migration backlog.
- This audit did not modify any application code; it is a read-only survey to inform planning, produced alongside (and without conflicting with) concurrent layout work on `/tms-v2`.
