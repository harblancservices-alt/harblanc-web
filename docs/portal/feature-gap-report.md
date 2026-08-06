# /tms-v2 Feature Gap Report — Phase 4 Audit

**Date:** 2026-08-06
**Scope:** Full functional/workflow audit of every `/tms-v2` workspace against its legacy `/admin` equivalent, plus a legacy-strengths review. Read-only audit — no code was changed to produce this report. Appearance was explicitly **not** evaluated; every finding here is about whether a workflow can be completed.

**Method:** grounded in the actual repo — every claim below traces to a file path (and usually a line number) in `src/app/admin/(authed)/**`, `src/app/tms-v2/(authed)/**`, `src/actions/tms-v2/**`, and `src/lib/data|domain/**`. "Dead end" means a rendered button/link/form with no wired handler. "Missing" means the capability (button, form, server action) does not exist anywhere in tms-v2 yet. Priority is Critical / High / Medium / Low per Brent's brief.

---

## How to read this report

- **Part 1–4 findings** are folded into each workspace section below rather than kept as four separate passes — for each workspace you'll find: what legacy can do, what tms-v2 can do, the gap list (missing actions/workflows/filters/bulk/export/search/mobile — each with why it matters / affected users / where it belongs / priority), missing business-state transitions, and dead ends.
- **The AR-"mark Paid" pattern** (Brent's flagship example) turned out to recur constantly. Every workspace was checked for the same shape of bug: *a record can reach a terminal real-world state, but the UI has no control to record that state.* Each occurrence is called out inline and rolled up in the [Consolidated Critical Table](#consolidated-critical-missing-business-workflows) below.
- **Executive framing:** tms-v2's foundation (data layer, money/attribution engine, `DataList`/`MutationResult` primitives, non-throwing server actions with inline error text) is sound and in several places *better engineered* than legacy (server-side aggregation instead of client recompute, bounded calendar queries, a single canonical net-profit calculation). But tms-v2 is, block for block, a **read layer with a thin slice of writes**. Nearly every "the record is stuck" gap below has the same root cause: the phase-by-phase build order shipped the read/list/detail views first and explicitly deferred "the writes phase" — and that deferred phase is still mostly not built. This is expected given the project's own in-code comments ("lands in a later phase" appears dozens of times), but it means tms-v2 cannot yet fully replace `/admin` for daily operation. Two entire legacy workspaces (**Reach**, **Load Inquiry**) are 0% ported (placeholders). **Applications** and **Maintenance** are reduced to read-only shells. **Settings** cannot persist a single value. **Brokers** cannot be created or edited. **Receivables/AR cannot be marked paid anywhere in the app** — not on the Receivables page, not on the Load detail page, not on the Trip page.

---

## Table of contents

1. [Today / Dashboard](#today--dashboard)
2. [Calendar](#calendar)
3. [Load Board](#load-board)
4. [Load Detail](#load-detail)
5. [Trips](#trips)
6. [Reach](#reach)
7. [Expenses](#expenses)
8. [Operations / Pipeline / Quotes](#operations--pipeline--quotes)
9. [Load Inquiry](#load-inquiry)
10. [Previews](#previews-customer-facing-pages)
11. [Applications](#applications)
12. [Receivables](#receivables--ar-mark-paid-verification)
13. [Accounting](#accounting)
14. [Brokers](#brokers)
15. [Maintenance](#maintenance)
16. [Files](#files)
17. [Camera](#camera)
18. [Performance](#performance)
19. [Settings](#settings)
20. [Global Search](#global-search)
21. [Legacy /admin worth preserving](#legacy-admin-worth-preserving)
22. [Consolidated Critical Missing Business Workflows](#consolidated-critical-missing-business-workflows)
23. [Prioritized Implementation Roadmap](#prioritized-implementation-roadmap)

---

## Today / Dashboard

### Legacy `/admin` Dashboard
`src/app/admin/(authed)/page.tsx` + `DashboardView.tsx` reads as an "opportunity inbox," not a report — almost everything on it is actionable in place:
- **Alerts panel** (`AlertsPanel.tsx`): 6 groups (maintenance, overdue receivables, incomplete loads, incomplete expenses, new applications, new quote requests), each **swipeable to dismiss** with a 4-second undo snackbar and a swipe-right quick action that deep-links into the fix (`alert-actions.ts:35,54`).
- **Inline odometer entry** and **three per-load document upload buttons** (Rate Con/BOL/POD) directly on each active-load card (`ActiveLoadDocActions.tsx:39`) — no need to open the load.
- **Empty-truck "farm a broker contact" card** (`FarmBrokerContactCard.tsx`) — FMCSA lookup + lane capture in one action, shown only when there are zero active loads.
- **Countdown goals widget** (`CountdownCards.tsx`) — full CRUD, per-goal time-progress bars, pace verdict, editable current-cash with live shortfall math.
- Truck maintenance quick-view, expired-quotes section, global search.

### New `/tms-v2` Today
`src/app/tms-v2/(authed)/page.tsx` — command-center hero (Net for the period), KPI strip (Gross/Loads/A-R), quick-add rail (Add Load / Add Expense — both really wired), `NeedsAttentionList` (5 categories incl. a new "stale open trips" signal legacy lacks), active-loads `DataList`, ⌘K command palette (Pages/Loads/Brokers).

### Gap list

| Gap | Why it matters | Affected users | Where it belongs | Priority |
|---|---|---|---|---|
| No alert dismiss/undo/swipe quick-action | `NeedsAttentionList` is explicitly documented as deferred read-only aggregation (`attention.ts:29-31`) — items never leave the list except by fixing the underlying record, so it either gets ignored or nags forever | Brent (sole user) | Extend `NeedsAttentionList` + port the `dismissed_alerts` table/action pattern | High |
| No inline odometer entry from Today | Highest-frequency micro-action, feeds net calc; extra click-through per load adds real friction on the road | Brent | Today active-loads list | High |
| No inline document upload from Today | Same "close the loop without navigating away" value as odometer | Brent | Today active-loads list | High |
| No countdown/savings-goal widget | Explicitly flagged by the team's own code comment (`page.tsx:78-81`) as a known gap; `dispatch_settings.monthly_net_goal` already exists and is schema-ready for a single-goal version today | Brent | Today, right rail | **Critical** (self-flagged) |
| No "farm a broker contact" empty-truck flow | Converts idle time into a business-development action; currently silently dropped | Brent | Today empty state | Medium |
| No new-application / new-quote-request signal on Today | `getNeedsAttention()` covers documents/receivables/expenses/maintenance/trips only, not lead intake; missing a new lead for days costs revenue | Brent | Extend `getNeedsAttention()` | High |
| No truck-maintenance quick-view widget | Minor — Needs Attention covers overdue/soon already | Brent | Today | Low |
| No expired-quotes section | Unclear if tms-v2 Operations surfaces this equivalently | Brent | Today or Operations | Medium |
| Command palette has no arrow-key navigation, and doesn't search Files (legacy's does) | Real regression for keyboard-first use; narrower search surface | Brent | `CommandPalette.tsx` | Low/Medium |

### Dead ends
- `TopBar.tsx` bell icon (line 27-35) — `disabled`, tooltip only, no handler.
- `TopBar.tsx` "New" button (line 36-44) — `disabled`, no handler.
- (Both are honestly labeled placeholders, not broken wiring.)

### Legacy Dashboard deep-dive
See [Legacy /admin worth preserving → Dashboard → Today](#legacy-dashboard--why-it-worked-and-what-to-extract-into-today).

---

## Calendar

### Legacy `/admin` Calendar
Explicitly read-only ("an activity logbook," `page.tsx:20-27`). Month grid with a weekly-net "Profit" column; **load bars span pickup→delivery** across multiple days (lane-assigned so a load keeps its row); cancelled/TONU loads shown grey+strikethrough and excluded from totals but still visible; **repair/maintenance chips** on their service date linking to `/admin/maintenance/{id}`; real US federal holiday markers; month-max-profit mini-bar; **every load bar and repair chip is a clickable link** to its detail page.

### New `/tms-v2` Calendar
Also read-only, month-windowed with a bounded query (an intentional improvement over legacy's full-table scan). Sun–Sat grid (desktop) or agenda list (mobile), loads attributed strictly by pickup date, up to 3 loads/day with "+N more" overflow, month/year jump-to picker (legacy has no direct jump-to-month input).

### Gap list

| Gap | Why it matters | Affected users | Where it belongs | Priority |
|---|---|---|---|---|
| **No click-through from any load entry to its detail page** — neither `CalendarMonthGrid.tsx` nor `CalendarAgenda.tsx` wraps a load in a link or `onClick` | Calendar is a natural place to spot a load and jump to it; right now that requires manually finding it on the Load Board | Brent | Wrap each load cell in a `Link` to `/tms-v2/loads/{id}` | **Critical dead end** (biggest single regression in this scope) |
| No repair/maintenance markers at all | Calendar loses its "activity logbook of loads AND shop visits" role, becomes a pure revenue calendar | Brent | Calendar grid | High |
| No federal holiday markers | Minor context loss | Brent | Calendar grid | Low |
| No visual distinction for TONU/cancelled loads | Math is correct (`computeLoadNet` zeroes/flat-rates TONU), but legibility of *why* a number looks odd is lost | Brent | Calendar grid | Medium |
| No multi-day load bars / span visualization | Byproduct of the (correct) pickup-date-only attribution rule; loses the "where was the truck this week" at-a-glance read | Brent | Calendar grid | Medium |

Both apps are consistently read-only (no drag-to-reschedule, no create/delete via calendar in either) — that's parity, not a regression.

---

## Load Board

### Legacy `/admin`
All-time A/R total, free-text search across load#/broker/origin/destination/trip, six-stage shipment-timeline badge per card, collapsible Overview (monthly performance card + 6-tile KPI grid), **CSV export** of the visible slice, **bulk delete (select mode)** with confirm dialog, full-bleed card = one-tap to detail.

### New `/tms-v2`
Period-scoped KPI strip (Gross/Net/Loads/$-per-mi/Deadhead%/A-R), status+broker filter dropdowns (no free-text search), server pagination, row → context drawer via shareable `?id=` URL param or full navigate, `+ Add load` modal. `DataList` primitive's own header comment documents pagination/bulk-select/search as explicitly deferred (`DataList.tsx:11-17`).

### Gap list

| Gap | Why it matters | Affected users | Where it belongs | Priority |
|---|---|---|---|---|
| No free-text search (load#/broker/city/trip) | Legacy's primary way to find a specific load fast | Dispatch, daily | Board filter bar | High |
| No CSV export | Owner/bookkeeper pulls month-end data into Excel/QuickBooks from this exact view today | Owner/accounting | Board action bar | Medium |
| No bulk delete/select | Cleaning up duplicate/test loads currently requires one-at-a-time (and delete doesn't exist on Load Detail in tms-v2 either — see below) | Dispatch, occasional | Board, port the select-mode pattern | Medium |
| Board A/R KPI is period-scoped, not all-time | Silently changes/hides unpaid loads from prior months as the operator pages months; misleading tile (mitigated by Receivables page being all-time) | Owner, weekly cash-flow check | `getLoadBoardSummary` | Medium |
| No shipment-timeline visualization on cards | Appearance-adjacent, low priority per Brent's instruction; underlying Invoice/Paid states aren't surfaced anywhere though | Dispatch | Low |

---

## Load Detail

**This is Brent's flagship directive area.** State model: `status` ∈ {pending, assigned, loaded, delivered, tonu}, derived from odometer entries, not a free dropdown; `payment_status` ∈ {unpaid, paid} with `paid_at`.

### Capability matrix

| Action | Legacy | tms-v2 | Priority if gap |
|---|---|---|---|
| Edit load core fields | Yes | Yes (wired) | — |
| FMCSA broker MC/DOT lookup on Edit | Yes | Absent | Medium |
| Dispatcher-contact capture | Yes | Absent (explicitly deferred to a "Brokers-write phase") | Low-Medium |
| Trip/Broker jump-links from detail | Yes | **Absent** | Medium |
| Odometer edit / status derivation | Yes | Yes (wired) | — |
| Mark delivered (one-tap) | Implicit | Yes, dedicated action | — |
| TONU cancel with fee | Yes | Yes (wired) | — |
| Plain "no charge" cancel as distinct button | Yes | Absent (same form, must zero manually) | Low |
| **Delete load** | Yes | **Absent — no action or button anywhere** | **High** |
| **Mark Paid / Undo Paid** | Yes | **Absent — no action exists in `actions/tms-v2/loads.ts`** | **Critical — the exact AR-Paid pattern** |
| **Add manual expense** | Yes | **Absent — no action exists at all** | **Critical** |
| **Delete manual expense** | Yes | **Absent** | High |
| **Document upload (rate con/BOL/POD)** | Yes, direct-to-storage | **Absent — read-only list only** | **High** |
| BOL in-browser scanner | Yes | Absent (rides with doc upload) | Medium |
| **BOL e-signature (Receiver/Carrier)** | Yes | **Absent** | High — real delivery-time workflow |
| Document delete | Yes | Absent | Medium |
| Command-bar always-visible KPIs | Yes, 4 primary + 4 sub-metrics above the fold | Present as hero Net + a detail grid | Low (appearance-adjacent) |

### Missing business-state transitions (self-documented in the code)
1. `payment_status: unpaid → paid` has **no tms-v2 UI or server action anywhere.** Confirmed by full-repo grep — `markLoadPaid`/`markLoadUnpaid` exist only in legacy files.
2. `src/app/tms-v2/(authed)/receivables/page.tsx:78`: *"Mark-paid lands in a later phase; this view reads live."*
3. `src/app/tms-v2/(authed)/loads/[id]/page.tsx:190`: *"Document uploads and payment-status actions (Mark paid) land in a later phase."*
4. Net effect: a load can be driven all the way to `delivered`/`tonu`, its A/R shows correctly everywhere it's read — but there is **no way, anywhere in the app, to close the loop.** Every delivered/TONU'd load is permanently stuck "outstanding" from tms-v2's own UI.

### Dead ends
None as literal broken buttons — every rendered control is wired to a real action. The Load domain's gaps are **omissions** (capability never built), not broken wiring — worth stating explicitly to Brent since it changes the fix (build the feature, not "fix the button").

---

## Trips

### Legacy `/admin`
`actions.ts` exports: `createTrip`, `updateTrip`, `updateTripOdometer`, `setTripStatus` (active⇄closed toggle, stamps `closed_at`), `softDeleteTrips` (bulk), `deleteTrip` (single). Detail page: odometer bookend entry (drives PC-miles/PC-diesel into net), Edit modal (name/status/dates/notes + Delete), Reopen button when closed, and each linked load has an inline **Mark paid** button.

### New `/tms-v2`
`src/lib/data/trips.ts` is **read-only** — `listTrips`/`getTripById` only. Zero trip-specific server actions exist in `src/actions/tms-v2/`. Detail page literally renders: *"Editing, close/reopen land in a later phase"* and *"read-only bookends; entry lands with the writes phase."* Trip assignment on the load form **does** have parity (picker with "No trip"/existing/+New).

### Gap list

| Capability | Legacy | tms-v2 | Priority |
|---|---|---|---|
| Create a trip directly | Yes | No | High |
| Edit trip name/notes | Yes | No | High |
| **Close a trip** (active→closed) | Yes | **No** — same AR-Paid shape applied to trips | **Critical** |
| **Reopen a closed trip** | Yes | **No** | High |
| **Enter/edit odometer bookends** | Yes | **No (explicitly deferred)** — PC diesel cost is silently omitted from Net until this exists | High |
| Delete/soft-delete a trip | Yes | No — an accidental trip from a mistyped `trip_name` (auto-create-on-resolve) is permanent | Medium |
| Mark a linked load paid from the trip page | Yes | No | Medium |
| Export/print trip P&L | No (neither app) | No | Medium |
| Trip search/filter by name/date | No (neither app) | No | Low (shared gap) |

### Dead ends
None — tms-v2 is honest about the gap (static "later phase" text, not a broken button).

---

## Reach

Legacy Reach (`src/app/admin/(authed)/dispatch/reach/`) is a near-zero-typing bulk backhaul-outreach tool: auto-detects truck posture (Available/Planning), matches a named freight market, builds a warmth-scored recipient list with held-back suppression, uses a posture×leverage template system, has a confirm-send modal with test-send, sends personalized emails via Resend with token rendering, and logs every send to `reach_sends`.

**tms-v2's `/tms-v2/reach` is a complete placeholder** (`PlaceholderPage`, single file, no other code under the route). **0% of legacy Reach exists in tms-v2** — data layer, actions, everything.

| Gap | Priority |
|---|---|
| Entire feature (posture detection, market match, recipient build, templates, send, test-send, settings, contacts include-toggle) | **Critical** — blocks full cutover from legacy; this is Brent's daily backhaul-solicitation tool |
| Held-back suppression logic (don't re-spam a broker) | Critical (part of the above — business logic, not just UI) |
| Send audit trail (`reach_sends`) | High (part of the above) |

Correctly self-flagged as deferred, not broken — but it is the single largest all-or-nothing capability gap found in the entire audit.

---

## Expenses

Two systems exist: **recurring expenses** (`recurring_expenses`, the `/expenses` workspace) and **per-load expenses** (`load_expenses`, managed from Load Detail).

### Legacy `actions.ts` (15 exports)
`createExpense`, `updateExpense`, `deleteExpense`, `duplicateExpense`, `archiveExpense`, `restoreExpense`, `skipNextPayment`, `getExpenseActivity` (audit trail), `bulkDeleteExpenses`, `bulkArchiveExpenses`, `bulkChangeCategory`, `importExpenses` (CSV), `createExpenseAccount`, `updateExpenseAccount`, `deleteExpenseAccount`. Plus per-load: `addLoadExpense`, `deleteLoadExpense`.

### New tms-v2 `actions.ts` (3 exports)
`addExpense`, `editExpense`, `setExpenseArchived`. That's the **entire** write surface. Per-load expenses: **zero write actions exist** — `load_expenses` never appears in `src/actions/tms-v2/**`, and the Load/Trip detail pages render expenses read-only with no add/delete control.

### Gap list

| Gap | Why it matters | Priority |
|---|---|---|
| **No per-load expense add/delete anywhere in tms-v2** | Tolls/lumper/hotel can't be recorded without leaving tms-v2 for `/admin` — directly undercuts the Load/Trip Net number, the app's headline metric | **Critical** |
| No delete for recurring expenses (only Archive) | Bad/duplicate entries can only be hidden, not removed | High |
| No Skip Next Payment | Common real workflow ("insurance is between renewals") has no path | High |
| No CSV export | No way to hand the ledger to an accountant without retyping | High |
| Payment-method (account) CRUD entirely missing | Can't add/rename/retire a card from tms-v2 at all, even though tms-v2 itself uses accounts in its own dropdown | High |
| "Incomplete expenses" only a row-level dot, not a Today alert | Owner won't notice an incomplete expense unless proactively opening Expenses | High |
| No duplicate expense | Minor convenience loss | Medium |
| No bulk archive/delete/category-change | `DataList` has no row-selection | Medium |
| No CSV import | Migrating a schedule is a modal-by-modal slog | Medium |
| No date-range filter, no column sorting, no saved filter views | Ledger usability regression | Medium/Low |
| No activity/audit trail (`expense_activity`) | No "who changed what, when" | Medium |
| No receipt/document attachment | **Not built in either app** — shared gap, not tms-v2-specific (legacy explicitly stubs it too) | High (shared) |

### Missing state transitions
No "paid/reconciled" state exists in either app's schema — real gap but not a tms-v2 regression. **Skip-a-single-occurrence** and **delete** exist in legacy only. **Load-expense add/remove** exists in legacy only (Critical, see above).

---

## Operations / Pipeline / Quotes

Legacy "Operations" hub wraps three tabs (Quotes/Applications/Accounting) around the full lead-to-cash pipeline for a `quote_requests` row.

### Legacy write surface (all real, all wired)
- Quotes: trash lifecycle (single+bulk soft-delete/restore/permanent-delete).
- `saveDraftEstimate` → `sendEstimate` (auto-advances lead status to `estimate_sent`).
- BOL: `generateBolDraft`/`saveBolDraft`/`sendBol`/`resendBol`.
- Finalized quote (rate confirmation): `generateFinalizedQuoteDraft`/`sendFinalizedQuote` (auto-advances to `awaiting_payment`).
- `recordPayment` (auto-advances `awaiting_payment` → `ready_to_dispatch` when paid in full).
- Applications: same trash lifecycle, single+bulk.

### New tms-v2
The page's own copy: *"READ-ONLY for this phase... no compose/send/status-advance action exists yet."* `src/lib/data/pipeline.ts` is 100% read-only. **No** `operations/actions.ts` exists. Zero references to `quote_requests`/`dispatch_estimates`/`finalized_quotes`/`bills_of_lading`/`applications` in any tms-v2 action file.

### Gap list

| Capability | Priority |
|---|---|
| Send range estimate (draft/preview/send/resend) | **Critical** — the #1 revenue action, 100% missing |
| Generate/send finalized quote (rate confirmation) | **Critical** — 100% missing |
| Generate/send BOL | **Critical** — 100% missing |
| Record payment | **Critical** — the same AR-Paid shape at the lead level; dispatch can never leave "awaiting payment" via tms-v2 |
| Quote/application trash + restore + permanent delete | High — no cleanup path for spam/duplicate leads |
| Bulk select + bulk actions on lead list | Medium |
| Search leads by name/lane/commodity/ID | Medium |
| Urgency-tiered grouping (Needs attention/New/etc.) | Medium |
| Application detail view (rows aren't even clickable) | High |
| Dispatch ownership fields, manual dispatch notes, Load Details overrides | Medium |

### Missing state transitions
Lead status has **no manual override in either app** (`updateLeadStatus` exists server-side in legacy but is dead code — zero UI call sites) — status only ever advances as a side effect of send/payment actions. tms-v2 can't even do that yet, so every lead created there is permanently stuck at `new`. Worth fixing the override gap in both apps while building tms-v2's send/payment actions.

---

## Load Inquiry

`src/app/tms-v2/(authed)/load-inquiry/page.tsx` is a bare placeholder. Legacy equivalent: `EmailBrokerView.tsx` — paste a load-board line → auto-parsed origin/destination/deadhead, live email preview, send/test-send, post-send "add this broker" FMCSA flow, session sent-history, pop-out window mode. **100% missing in tms-v2**, not partial — a fast, frequently-used one-tap dispatch tool with no compose form, no send action, nothing built yet. **Priority: High.**

---

## Previews (customer-facing pages)

Near-parity by design — tms-v2 deliberately **reuses legacy's renderer functions and routes** rather than reimplementing (`previews/email` explicitly ported from `/admin/previews-2`; `previews/pages` iframes the actual `/admin/previews/...` routes same-origin). Minor notes: tms-v2 previews permanently depend on `/admin` routes existing (becomes relevant only if/when legacy is retired — not urgent now); no single unified grid mixing forms+views+emails+internal the way legacy's `AdminPreviewLab` does (split into two tabs instead). **Priority: Low**, this area is in good shape.

---

## Applications

Legacy: full list + **dedicated detail page** (contact card with call/email links, operations strip, forensics disclosure) + full single/bulk trash lifecycle (`softDelete`/`restore`/`permanentlyDelete`, single and bulk). Deliberately narrow by design — no approval/hire workflow, which is intentional, not a gap.

tms-v2: survives only as a **read-only tab** inside Operations. No detail page exists at all (confirmed: no `applications/[id]` route on disk, and the code comments "row click has no destination yet"). No trash/restore/delete anywhere. This is not a feature-gap list — it's most of a workspace reduced to a bare list.

**Priority: High** (not Critical — secondary to the revenue pipeline, but a real weekly recruiting workflow). Recommend porting the legacy detail page's contact-card + trash lifecycle into `/tms-v2/operations/applications/[id]` — the action functions are already reusable with minimal changes (just add `/tms-v2/operations` to their `revalidatePath` targets).

---

## Receivables — AR "mark Paid" verification

### Definitive answer: **the gap Brent described is real and confirmed as of right now.**

Grep evidence:
```
$ grep -n "paid|mark|status" src/app/tms-v2/(authed)/receivables/**
src/app/tms-v2/(authed)/receivables/page.tsx:78:  description="...Mark-paid lands in a later phase; this view reads live."
```
No form, button, or action import exists anywhere in that directory (the page.tsx is the only file). Cross-referenced against the actions layer:
```
$ grep -rn "receivab|payment_status|paid" src/actions/tms-v2/
src/actions/tms-v2/loads.ts:166:  payment_status: "unpaid",   // only set once, on load creation
```
`loads.ts` has a full mutation set for the load lifecycle (`addLoad`, `editLoad`, `markLoadDelivered`, `markLoadTonu`) but **no `markLoadPaid`/`markLoadUnpaid` equivalent**. `src/lib/data/receivables.ts` is 100% read-only. The one place `payment_status` is ever written is hard-coded to `"unpaid"` at load creation — **nothing in the new app can ever flip it back to `"paid"`.**

### Legacy capability
`MarkPaidButton` (`ReceivablesView.tsx:806-828`) → `markLoadPaid(id)` sets `payment_status: "paid", paid_at: now()`, revalidates loads/receivables/brokers/trips/performance/dashboard. "Recently Paid" strip with an **Undo** button → `markLoadUnpaid`. Aging bands (0-30/31-60/61-90/90+/undated), CSV export, sort, filter chips. Schema is a hard `unpaid|paid` boolean — no partial-payment/disputed/written-off states exist in either app (a pre-existing schema limitation, not a tms-v2 regression, but worth flagging per Brent's "assume there are many, find them all" instruction).

### Gap list — Receivables

| Gap | Priority |
|---|---|
| **No "Mark as Paid" action anywhere in tms-v2** | **Critical** |
| No "Undo"/mark-unpaid, no "recently paid" list | High (ships with the above) |
| No disputed/written-off status (schema gap, shared by both apps) | Medium |
| No partial-payment support (schema gap, shared by both apps) | Low — legacy explicitly designed around its absence |

---

## Accounting

Legacy: standalone route with Collected/Outstanding KPIs, payments ledger, **Stripe fees/net-to-bank/payouts/balance section**, "Open in Stripe" deep-link. tms-v2: redirects into Operations' `AccountingTab.tsx`, has Collected/Outstanding/payments-ledger parity, but **no Stripe fees, net-to-bank, payouts ledger, or balance section at all**. Outstanding-balance rows also aren't clickable to the lead (legacy's are).

| Gap | Priority |
|---|---|
| No Stripe fees/net-to-bank/payouts/balance visibility | High — this is the reconciliation half of Accounting, not just the A/R half |
| Outstanding rows not clickable to lead | Low |

Neither app supports manual payment mutation in Accounting — payments come from Stripe webhooks in both, which is parity, not a gap.

---

## Brokers

### Legacy `actions.ts` (2 files, 6 exports)
`createBroker` (with FMCSA MC/DOT auto-fill), `updateBroker` (full edit incl. free-text status field), `softDeleteBroker`, `addBrokerContact`, `updateBrokerContact`, `deleteBrokerContact`, plus `quickAddBrokerLane` (one-shot broker+contact+lane capture from the load board, feeds Backhaul). Broker profile also has an inline **Mark paid** on unpaid loads in its load-history tab, SAFER lookup link, and a lane-overview modal.

### New tms-v2
Directory + profile page only — **no `actions.ts`, no `new/`, no `quick-add/` at all.** Both pages' own copy: *"Quick-add and edit land in a later phase; this view reads live."* No create, no edit, no delete, no contact management, no status toggle, no notes editing, no mark-paid.

### Gap list

| Gap | Priority |
|---|---|
| **No broker creation in tms-v2** — every new broker relationship must be entered in legacy first, and the two apps' directories diverge | **Critical** |
| **No broker edit in tms-v2** — any correction (phone, MC/DOT, factoring flag, notes, status) requires falling back to legacy | **Critical** |
| No broker archive/delete | High |
| No status transition (active/inactive) — tms-v2 can't even set the loose free-text status legacy has | High |
| No contact management (add/edit/delete) | High |
| No lane overview / lane management surface (Backhaul-feeding lanes can only be created via legacy's quick-add) | Medium |
| No mark-paid from broker profile's load history | Medium (compounds with the Receivables Critical gap) |
| No SAFER/FMCSA lookup integration | Low |
| No documents tab | Low — legacy's is unwired too (text-only), shared gap |
| Notes field read-only | Medium |

### Dead ends
Broker profile has **no edit/action affordance whatsoever** — a user landing here from Receivables or Loads has no path forward except leaving tms-v2 entirely. Directory search with no results also has no "Add broker" fallback prompt (legacy always shows the Add-broker panel above the list).

---

## Maintenance

### Legacy `actions.ts` (8 exports)
`createReceiptUploadUrl`, `logService` (new visit + parts + receipts), `updateService`, `deleteReceipt`, `deleteService`, `deletePart` (auto-deletes parent service if last part), `attachRelated`/`detachRelated`, `setReminderDismissed`. UI: global search, category grid, Preventative "stay-ahead" lens, per-position part-set/corner view, deep-link log-service modal from dashboard alerts.

### New tms-v2
`src/lib/data/maintenance.ts` header: *"Phase 4b, READ-ONLY."* Detail page: *"logging services, editing parts, and managing reminders land in a later phase."* No `actions.ts` exists. No category/preventative/set routes exist at all.

| Gap | Priority |
|---|---|
| No log-service form | **Critical** — can't record any repair from the new app |
| No edit/delete service or part | **Critical** — data-entry mistakes are permanent once tms-v2 is primary |
| No reminder dismiss/create UI | High |
| No Preventative lens, Category, or Set/corner views | High — loses the "stay ahead" and per-position tracking workflows entirely |
| No receipt upload/delete/viewer | High |
| No search box on maintenance list | Medium |
| No attach/detach related repairs | Medium |

Note: `setReminderDismissed` is dead code even in legacy (defined, never called from any UI) — not a tms-v2 regression, but worth a quick look since it means the reminder-dismiss workflow doesn't actually exist anywhere today.

---

## Files

Legacy `actions.ts`: `signFiles`, `deleteFile` (deletes from whichever of 3 source tables + storage). UI: free-text search, 7-way type filter chips, thumbnails, full-screen viewer with delete wired.

tms-v2: GET-based search + 3-way **source** filter (coarser than legacy's 7 type chips), real pagination, "View" opens in new tab. **No delete action anywhere** — `deleteFile` never imported into tms-v2, no `actions/tms-v2/files.ts` exists. No thumbnails/in-app preview.

| Gap | Priority |
|---|---|
| **No delete file capability** | **Critical** |
| Filter granularity dropped (3 source buckets vs 7 doc types) | High |
| No thumbnails/in-app preview | Medium |

---

## Camera

Legacy `actions.ts`: `createCameraBatch`, `renameCameraBatch`, `createCameraUploadUrl`/`recordCameraPhoto` (capture loop), `deleteCameraPhoto`, `deleteCameraBatch`, plus PDF/ZIP export routes.

tms-v2: `src/lib/data/camera.ts` header: *"tms-v2's read-only entry point."* Only list/detail reads exist. Page copy: *"Capture happens on /admin/camera; this is the review surface."* **Export PDF/ZIP genuinely work** (real links into the legacy route handlers) — not a stub.

| Gap | Priority |
|---|---|
| **No capture flow in tms-v2** | **Critical** — this is the core in-cab mobile workflow the feature exists for; a driver using only tms-v2 cannot scan a BOL |
| No create/rename/delete batch | High |
| No delete individual photo | Medium |

Neither app has a "batch finalized/locked" concept — a genuine absence in both, not a parity gap.

---

## Performance

Legacy: month or custom date-range picker, 3 KPI cards w/ MoM delta, **trailing-12-month Net-vs-goal bar chart + pace stats**, **trailing-12-month rate-trend line chart**, deadhead bar, **full sortable broker/lane leaderboards** (unbounded, tap-header-to-sort), **monthly ledger table**, plain-English "Insights" strip.

tms-v2: server-aggregated (an intentional architecture improvement over legacy's client recompute), 4 KPI tiles w/ delta, single-period goal progress bar, $/mi + deadhead% tiles, **top-broker/top-lane lists capped at 6 rows, no drill-down, no re-sort**.

| Gap | Priority |
|---|---|
| No trend charts (Net-vs-goal bar, Rate-trend line) | High — loses trailing-12-month trajectory view |
| No Monthly ledger table | Medium |
| Broker/lane lists capped at 6, no full leaderboard/re-sort/"View all" | Medium |
| No Insights/Takeaways strip | Low-Medium |
| No pace stats (remaining-to-goal $, avg-needed/week) | Medium |

---

## Settings

Legacy `actions.ts`: `setDemoMode`, `updateFuelSettings` (MPG/diesel-$/factoring-%), `updateProfitGoals` (monthly/annual net goals). Also: theme toggle, display/scale settings, demo-mode toggle, advanced/env diagnostics panel.

tms-v2: `src/lib/data/settings.ts` header: *"Read-only for this phase (write forms are a later, deferred phase)."* Page: *"Read-only in this phase — editable forms land in a later phase."* **Every settings value is display-only. There is no mutation path for anything.**

| Gap | Priority |
|---|---|
| **Fuel/factoring settings not editable** — feeds every net-profit number app-wide | **Critical** |
| **Profit goals not editable** — drives Performance's goal bar and Today's pace | **Critical** |
| No demo-mode toggle | Medium |
| No theme toggle | Low — may be intentional (tms-v2 is dark-themed by design per prior work); confirm with Brent rather than assume regression |
| No display/scale settings | Low |
| No advanced/env diagnostics panel | Low — developer aid, not Brent-facing |

This is the single largest "can't persist a change" gap in the whole audit — every value on the page is a display row, nothing is a form.

---

## Global Search

tms-v2's `CommandPalette` (⌘K) is genuinely wired to `searchWorkspace()` — real, not a dead end. But scope is intentionally narrow (module header confirms "foundation phase"): loads matched on `load_number` only, brokers matched on `name` only, capped at 6 results each. **No Files group at all.**

Legacy's `globalSearch()` is broader on every axis: loads matched on 4 fields, brokers on 3 fields, plus a third **Files** search group.

**Gap: tms-v2 search is materially narrower** — missing Files entirely, single-field-only matching vs legacy's multi-field. Affected: owner/dispatcher trying to jump to a load by broker name, city, or a doc by filename. **Priority: Medium.**

---

## Legacy /admin worth preserving

### Legacy Dashboard — why it worked, and what to extract into Today

1. **Zero-click micro-actions embedded in the list itself.** Odometer entry and document upload live directly on each active-load card — the list is a working surface, not a summary requiring drill-down. This is the single biggest thing worth carrying forward: give Today's `DataList` inline affordances for the highest-frequency edits (odometer, at minimum).
2. **Alerts that can be triaged, not just seen.** Swipe-to-dismiss + undo + one-tap quick-action is what keeps "Needs attention" useful indefinitely instead of becoming wallpaper. Port the `dismissed_alerts` pattern onto `getNeedsAttention()`'s items.
3. **A financial goal you're visibly racing against.** The countdown widget turns "keep the net up" into a concrete, dated target with a pace verdict. Cheap to bootstrap a single-goal version off the already-existing `dispatch_settings.monthly_net_goal` column before building full multi-goal CRUD.
4. **Turning idle time into pipeline.** The empty-truck "Farm a broker contact" card notices context (zero active loads) and offers the one action that context makes valuable.
5. **One dismissible bar instead of six widgets fighting for the top of the page.** The collapsed "Needs attention" tab keeps the page opening on the *work*, not a wall of warnings.

What tms-v2 already does better and should keep: the single canonical `computeLoadNet`/`computeCarrierAR` money engine eliminates the "net computed 5 different ways" bug class; the stale-open-trips signal is a genuinely new, useful addition; the command palette is a stronger search primitive once keyboard nav + Files are restored.

### Legacy Load Details → the mobile foundation (Brent's specific directive)

**Why it works, structurally:**

1. **Single page, zero tabs, everything in one continuous scroll** — no tab-switch tax for the two most common actions (check status, add an expense).
2. **A three-tier command bar** engineered for a 375px phone: back+actions row → compact origin→destination line → 4-KPI strip (Revenue, Net, Total mi, Deadhead), each carrying a secondary sub-metric. The densest, most information-per-pixel block in either app.
3. **Collapsed-by-default sections whose header bar still carries the primary action** — Financials starts collapsed but its header always shows "+ Add expense," so the single most common write action is one tap away even collapsed.
4. **Inline edit-in-place, never a full-page reload,** for single-purpose edits (odometer, schedule, expenses); modals reserved for genuinely multi-field records (full load edit) — a deliberate, documented distinction in the code itself.
5. **The status model is physically real, not a dropdown fiction** — status is *derived* from which odometer readings exist. The one input dispatch actually has in hand (the odometer) is also the one action that advances the load, removing an entire class of desync bug. **Do not reintroduce a free-standing status dropdown.**
6. **Errors surface inline as text, never a full error page** — every mutating action returns `{ok, reason}` instead of throwing (server-action errors are redacted to an opaque digest in production, so this is a correctness rule, not a style choice). tms-v2's `MutationResult` pattern already follows this — keep it as the template for everything still missing.
7. **Uploads bypass server body/size limits** via a two-step signed-URL flow — a real mobile-reliability decision for a phone photo on the road, not cosmetic.
8. **Camera-first, task-specific capture flows** — POD forces rear camera behind a confirm, BOL gets a dedicated in-browser scanner plus a fallback picker, Rate Con gets a generic picker. Three different capture UX for three different real-world situations.
9. **Deep-link anchors** (`#odometer`, `#documents`) let the dashboard's alert list land the operator directly on the section they need, pre-expanded.

**What must be preserved when modernized:** the single-page no-tabs structure ordered by read-frequency; the odometer-drives-status model; inline edit-in-place for low-field edits vs. modals for multi-field ones; collapsed sections with an always-visible primary action; command-bar KPI density above the fold; non-throwing mutations with inline error text; signed-URL direct-to-storage uploads; camera-specific capture per document type.

**What's actually weak and should NOT be carried forward as-is:** the Cancel/TONU dialog's two-separate-buttons UI — tms-v2's single form with a $0-able amount field is cleaner, keep tms-v2's version; the full Edit-load modal reusing the entire Add-load form (bolting one-time creation concerns like FMCSA lookup onto every edit) — tms-v2's narrower edit form is a defensible simplification *as long as* broker MC/DOT lookup and dispatcher-contact capture get a proper home in a future Brokers-write phase rather than staying silently dropped; the command-bar's visual density (nested sub-metrics, multiple font sizes) is the one place "modernize appearance while preserving information density" genuinely applies — keep all 8 numbers visible without scrolling, present them with tms-v2's cleaner typographic system.

**Concrete recommendation:** rebuild `/tms-v2/loads/[id]` as one continuous page (not tabs): **(1)** command bar — back + Edit/TONU/Delete/Mark-paid actions, then the dense KPI band always visible; **(2)** Load details with broker/trip jump-links restored; **(3)** Odometer & status, inline edit, odometer-derives-status preserved exactly; **(4)** Financials — inline expense add/delete restored, collapsed by default but Add-expense always reachable from the header; **(5)** Documents — port the signed-URL upload + BOL scanner + POD camera-confirm + BOL e-signature flow essentially unchanged, since this is the largest capability gap and the flow being ported already works well. Layer Mark Paid/Unpaid into the command bar as a first-class action, closing the AR-Paid gap at its source.

### Other legacy strengths worth modernizing forward (not discarded)

- **Expenses' QBO-ledger density** (sortable multi-column table, KPI strip, bulk-select bar) is more workflow-complete than what exists in tms-v2 today and is worth porting wholesale into `DataList`/Expenses rather than reinventing.
- **Skip Next Payment** on recurring expenses is a genuinely good, real-world-informed feature (handles "insurance is between renewals" without corrupting the schedule).
- **The "Incomplete expenses" dashboard alert group** (chips per gap type, direct "Open" link) is a strong pattern Today should adopt at the alert-rail level, not just as a row-level dot.
- **Reach's entire design** (posture detection, warmth-scored recipients, suppression, template system) should be ported close to as-is — it's a mature, well-thought-out tool, not a candidate for redesign-from-scratch.
- **Performance's trend charts and full sortable leaderboards** give a trajectory view the new KPI-tile-only layout doesn't; worth adding back once the read layer is otherwise settled.
- **Calendar's repair chips and load-bar spans** turn the calendar into a genuine "what happened this week" logbook, beyond just a revenue view.

---

## Consolidated Critical Missing Business Workflows

The AR-"mark Paid" pattern, found everywhere it was hunted:

| # | Record / Workspace | Missing transition | Where it should live | Root cause |
|---|---|---|---|---|
| 1 | **Receivables** | Unpaid → Paid (and Undo) | `receivables/page.tsx` + new `markLoadPaid`/`markLoadUnpaid` action | No write action exists in `actions/tms-v2/loads.ts`; `payment_status` is only ever set to `"unpaid"` at creation |
| 2 | **Load Detail** | Same unpaid→paid transition, surfaced at the load level | `loads/[id]/page.tsx` command bar | Same root cause as #1 |
| 3 | **Trips** | Active → Closed, and Closed → Active (reopen) | Trip detail header | No `setTripStatus` equivalent; `lib/data/trips.ts` is read-only |
| 4 | **Trips** | Mark a linked load paid from trip context | Trip detail linked-loads list | Same root cause as #1, compounded |
| 5 | **Trips** | Odometer bookend entry (PC-miles/PC-diesel) | Trip detail | Explicitly deferred; Net is silently understated without it |
| 6 | **Operations/Quotes** | `awaiting_payment` → `ready_to_dispatch` (record payment) | Operations lead detail | `recordPayment` not ported; no `operations/actions.ts` exists at all |
| 7 | **Operations/Quotes** | Manual lead-status override | Operations lead detail | Dead even in legacy (`updateLeadStatus` has zero UI call sites) — a shared gap worth fixing in both apps |
| 8 | **Load Detail** | Add / delete a manual expense | Load detail Financials section | No `addLoadExpense`/`deleteLoadExpense` equivalent in tms-v2 |
| 9 | **Load Detail** | Delete a load | Load detail command bar | No delete action exists in tms-v2 |
| 10 | **Brokers** | Create / edit / archive a broker; set active/inactive status | Broker directory + profile | No `actions.ts` exists for tms-v2 brokers at all |
| 11 | **Maintenance** | Log a service visit; edit/delete a service or part | Maintenance workspace | Explicitly "READ-ONLY, Phase 4b" |
| 12 | **Files** | Delete a file | Files page | `deleteFile` never wired into tms-v2 |
| 13 | **Camera** | Capture photos into a batch; create/rename/delete a batch | Camera workspace | tms-v2 is "review surface" only; capture stays on `/admin/camera` |
| 14 | **Settings** | Persist any change (fuel/factoring %, profit goals, demo mode) | Settings page | Every field is display-only; zero write actions exist |
| 15 | **Reach** | The entire outreach send workflow | Reach workspace | 0% built — placeholder page only |
| 16 | **Load Inquiry** | The entire one-off broker-email workflow | Load Inquiry workspace | 0% built — placeholder page only |
| 17 | **Applications** | View an application's detail; trash/restore/delete | Operations → Applications | No detail route exists; rows aren't clickable |

---

## Prioritized Implementation Roadmap

### Critical (blocks daily operation / direct revenue-cash impact)
1. **AR mark-paid/unpaid** — build `markLoadPaid`/`markLoadUnpaid` actions + wire into Receivables and Load Detail (#1, #2 above). This single fix closes the most-cited gap in the whole audit.
2. **Trip close/reopen** — `setTripStatus` equivalent + UI (#3).
3. **Per-load expense add/delete** — closes the Load/Trip Net-accuracy gap (#8).
4. **Broker create/edit** — without this, the two apps' broker directories permanently diverge (#10).
5. **Operations send/payment pipeline** (estimate → finalized quote → BOL → record payment) — the actual revenue-generating workflow is currently unreachable from tms-v2 (#6).
6. **Reach** — port the full existing feature; it's mature and shouldn't be redesigned, just rebuilt on tms-v2's stack.
7. **Maintenance log-service + edit/delete** — can't record a repair from the new app at all.
8. **Settings write forms** (fuel/factoring %, profit goals) — every net-profit number in the app depends on these values being editable somewhere.
9. **Camera capture flow** — the in-cab mobile use case the feature exists for doesn't work in tms-v2 yet.
10. **Countdown/goal widget on Today** — self-flagged by the team; schema-ready today for a single-goal version.
11. **Delete load** and **document upload/BOL e-signature** on Load Detail — the flagship mobile-foundation rebuild described above.

### High (real weekly-workflow friction, not yet blocking)
- Alert dismiss/undo pattern on Today's Needs Attention list.
- Inline odometer entry + document upload from Today's active-loads list.
- Trip odometer bookends, trip create/edit.
- Recurring-expense delete, Skip Next Payment, CSV export, payment-method CRUD.
- Broker archive, status toggle, contact management.
- File delete; Files' 7-way type filter restored.
- Camera batch create/rename/delete, individual photo delete.
- Maintenance reminder dismiss/create, Preventative/Category/Set views, receipt upload.
- Applications detail view + trash lifecycle.
- Quote/application trash+restore+bulk actions.
- Load Inquiry (full feature, self-contained, good candidate for a fast follow-up).
- Calendar load-entry click-through (flagged as a "critical dead end" for legibility, filed here since it's a link-wiring fix, not a new feature).
- Load Board free-text search.
- Performance trend charts.
- Accounting Stripe fees/payouts/balance section.

### Medium
- Load Board CSV export, bulk delete, all-time A/R tile fix.
- Load Detail: trip/broker jump-links, FMCSA lookup on edit, dispatcher-contact capture.
- Trip delete, mark-paid-from-trip.
- Expenses: bulk actions, CSV import, date-range filter, column sorting, audit trail.
- Calendar: repair/maintenance markers, TONU visual distinction, multi-day load bars.
- Empty-truck "farm a broker contact" flow, new-lead/new-application signal on Today.
- Broker lane-management surface, mark-paid-from-broker-profile, notes editing.
- Performance monthly ledger, leaderboard drill-down/sort, pace stats.
- Global search: restore Files group, multi-field matching.
- Files thumbnails/in-app preview.

### Low
- Federal holiday markers on Calendar, shipment-timeline visualization on Load Board cards.
- Command palette keyboard navigation.
- Truck-maintenance quick-view widget on Today, expired-quotes section.
- Saved filter views (Expenses), Accounting outstanding-row links.
- SAFER/FMCSA lookup on broker create, broker documents tab.
- Settings: demo-mode toggle, theme toggle (confirm intentional first), display/scale, advanced diagnostics.
- Insights/takeaways strip on Performance.
- Previews unified grid (currently split into two tabs — cosmetic reorganization only).

---

## Notes on scope and confidence

- Every finding above traces to a specific file and, in nearly all cases, a line number, gathered by direct code inspection (not inference from naming or documentation alone).
- Several gaps are **self-documented in the code** ("lands in a later phase," "READ-ONLY for this phase") rather than discovered by absence — these are the most confident findings in the report, since the team already knows about them; this report's contribution is prioritizing and cross-referencing them against real business impact, and finding the ones that *aren't* self-flagged (e.g. the Calendar click-through dead end, Performance's dropped `arTotal`, `updateLeadStatus`'s dead code, `setReminderDismissed`'s dead code).
- Shared gaps (present in neither app — e.g. receipt attachment on expenses, partial-payment support, trip search) are called out explicitly so they aren't mistaken for tms-v2 regressions; they represent genuine backlog, just not "parity" backlog.
- This audit did not modify any application code; it is a read-only survey to inform planning.
