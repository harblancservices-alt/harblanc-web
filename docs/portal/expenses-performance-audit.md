# Expenses & Performance — Deep Audit + Redesign Spec

**Date:** 2026-08-07
**Scope:** Two workspaces only — `/tms-v2/expenses` and `/tms-v2/performance` — audited against legacy `/admin`, the canonical money engine, and the database schema. 100% read-only; no application code was changed to produce this report. `origin/main` was pulled fresh before starting; the most recent commits touching these tabs (`0f00c98`, `82c67ec` Expenses; `0814836` Performance) were confirmed to be layout/visual redesigns only — every functional claim below was independently re-verified against the current code, not assumed from those commits' framing.

---

## Core framing — read this before anything else

These are two different workspaces answering two different questions, and the current build already mostly respects that separation — but not completely. Hold this distinction through every section below:

> **Expenses = "what money is leaving the business."** A recurring-bills / subscription calendar and payment-method tracker. Insurance, truck/trailer payments, phone, internet, software subscriptions, credit cards, storage, yard/parking, memberships, equipment financing. The unit of value is a *schedule* (this bill, this amount, this cadence, this card, due when), not a transaction log.
>
> **Performance = "how much money the operation is producing."** The Load Board turned into analytics — gross, net, miles, deadhead, broker, lane, trip, date, all driven by the same canonical engine that powers the Load Board itself. It must never show an expense figure that isn't already netted into a load's own P&L.

The single most important finding of this audit, stated up front because it should shape every decision below: **the canonical money engine (`src/lib/domain/money.ts` / `src/lib/dispatch/fuel.ts` / `src/lib/dispatch/trip-rollup.ts`) is sound, and neither Performance surface reimplements its math locally — Brent can trust the Net/Gross figures Performance shows him.** The gaps found are in *presentation completeness* (capped tables, missing charts, a deleted goal-pace module) and in *Expenses' schema* not yet fully matching a bills-tracker's needs (no end-date, a soft string-joined payment method, notes/tags orphaned in the UI) — not in the arithmetic.

---

## Table of contents

- [A. Current Expenses architecture](#a-current-expenses-architecture)
- [B. Current Performance architecture](#b-current-performance-architecture)
- [C. Legacy capabilities worth preserving](#c-legacy-capabilities-worth-preserving)
- [D. What should be deleted](#d-what-should-be-deleted)
- [E. What should be rebuilt](#e-what-should-be-rebuilt)
- [F. Data/schema changes required](#f-dataschema-changes-required)
- [G. Server actions required](#g-server-actions-required)
- [H. Calculation definitions](#h-calculation-definitions)
- [I. Expenses information architecture](#i-expenses-information-architecture)
- [J. Performance information architecture](#j-performance-information-architecture)
- [K. Mobile workflow](#k-mobile-workflow)
- [L. Priority roadmap](#l-priority-roadmap)

---

## A. Current Expenses architecture

### tms-v2 (`src/app/tms-v2/(authed)/expenses/**`)

| Piece | File | Status |
|---|---|---|
| List view (compact rows, category pill, next-charge date) | `ExpensesListClient.tsx:58-122` | Real, live data |
| Desktop KPI strip (This month / Recurring / YTD / Avg monthly) | `page.tsx:139-144` | Real, backed by `getRecurringExpensesKpis()` |
| Mobile totals strip (Spent this month / Top category / Needs review) | `page.tsx:122-136` | Real |
| Inline composer (add) | `ExpenseComposer.tsx:60-150` | Real, wired to `addExpense` |
| Mobile FAB | `ExpenseComposer.tsx:55-58` | Real |
| Context drawer (edit + row actions: Archive/Restore, Duplicate, Skip next payment) | `ExpenseDrawerContent.tsx` | Real, all wired |
| Filters (category, frequency, status, search) | `page.tsx:146-179` | Real, server-side |
| Sort (Vendor/Category/Amount/Next charge) | `ExpensesListClient.tsx:34-39,225-239` | Real, server-side |
| Bulk actions (Archive, Change category, Delete) | `ExpensesListClient.tsx:184-221` | Real |
| CSV export / import | `ExportExpensesCsvButton.tsx` / `ImportExpensesButton.tsx` | Real |
| Saved views | `page.tsx:181` | Real (localStorage) |
| Payment-methods CRUD | `src/app/tms-v2/(authed)/settings/PaymentMethodsCard.tsx` | Real — **but lives on Settings, not Expenses** (see §I) |
| `ExpenseFormModal.tsx` | — | **Dead code** — zero importers anywhere in the repo, superseded by the composer/drawer pattern but never deleted |

### Legacy (`src/app/admin/(authed)/expenses/**`)

Full QuickBooks-style ledger: sortable desktop table + mobile cards (`ExpensesView.tsx`), a full add/edit slide-over with Vendor/Amount/Category/Payment-method (with inline "+Add account")/Frequency/day-of-month-or-week/start-date/**Tags**/Autopay/**Notes**/an unbuilt Attachments stub/**Activity history** (`ExpenseSlideOver.tsx`), a kebab row-menu (Edit/Duplicate/Skip Next Payment/Archive-Restore/Delete), and a payment-methods dialog with computed monthly-spend/charge-count per account.

### Data layer

Two entirely separate tables/modules, correctly not conflated:
- **`src/lib/data/recurring-expenses.ts`** — the bills-schedule table (`recurring_expenses` + `expense_accounts`). This is what "Expenses" means to Brent.
- **`src/lib/data/expenses.ts`** — `load_expenses`, per-load transaction lines charged against a specific load's P&L (tolls, lumper). Unrelated concept, correctly kept separate, not audited further here (already covered by the operational-completion audit).

### Schema (reconstructed — see §F for the caveat)

`recurring_expenses`: `id, name, category, vendor, amount, frequency, day_of_month, day_of_week, start_date, card, autopay, notes, tags[], archived, skip_next_date, deleted_at, updated_at`.
`expense_accounts`: `id, name, type, last4, is_default, deleted_at`.
`expense_activity`: `id, expense_id, action, detail, created_at` (RLS deny-all except service role).

**Only one migration in the whole repo touches these tables** (`supabase/migrations/20260801000000_expenses_quickbooks.sql`) — it's an `ALTER`, not the original `CREATE TABLE`. The base schema for `recurring_expenses`, `expense_accounts`, and `load_expenses` predates tracked migrations or was created out-of-band, the same untracked-schema pattern flagged elsewhere in this project's history (e.g. the CRM/camera migration-pending notes). This means any new columns proposed in §F need a real migration written against production's actual current schema, not assumed from this repo alone.

---

## B. Current Performance architecture

### tms-v2 (`src/app/tms-v2/(authed)/performance/**`)

- **Fully server-aggregated, bounded query — this is correct and matches Brent's explicit requirement.** `page.tsx` and every component it imports (`DeltaChip`, `PartyStatList`, `PartyBarChart`, `TrendChart`, `DualTrendChart`) are plain server components — zero `"use client"` anywhere in the directory. The data fetch (`getAnalyticsLoads`, `src/lib/data/analytics.ts:208-258`) is range-scoped via a 3-clause attribution filter (`loadsPeriodFilter`) plus a hard `.limit(2000)` — never an unbounded scan, never shipped to the browser for computation. The page's own code comment states this explicitly: *"Server-aggregated, range-scoped rollup — never the full load history re-aggregated client-side."*
- **KPIs shown**: Net, Gross, Loads, Margin %, Net $/mi, Gross $/mi, Deadhead %.
- **Goal display**: a bare percent-fill `ProgressBar`, "Net vs goal" — no remaining/pace/required-rate math anywhere on the page.
- **Charts**: a Net-vs-Gross dual bar (mobile only), a Net trend line (desktop only), and a "Rate ($/mi)" trend line that — **found this pass** — plots **gross $/mi only** (`page.tsx:50`), mislabeled as generic "Rate."
- **Broker/lane tables**: `brokerStats(loads, 6)` / `laneStats(loads, 6)` — **capped at 6, not sortable, no drill-down**, confirmed unchanged by the recent mobile remodel. Rendered as a bar chart sized by **gross revenue** even though the underlying sort is by net (a labeling/visual contradiction — see §C/§H).
- **No Insights/takeaways strip** — the module exists and is fully built (`lib/dispatch/performance.ts`'s `takeaways()`) but is imported nowhere under `src/app/tms-v2`.

### Legacy (`src/app/admin/(authed)/performance/**`)

Does the exact thing tms-v2's redesign was built to avoid: fetches **every non-deleted load, unbounded, no date filter, no limit**, ships the full array to a `"use client"` component, and does every subsequent aggregation — month buckets, KPI totals, broker/lane stats, sorting — in the browser. Otherwise materially more complete: 3 headline KPI cards with MoM deltas, a goal card with a real (if buggy — see §H) pace calculation, a dual Net+Gross $/mi rate-trend chart, a proportional deadhead bar, a Top-5 preview *and* a full sortable ~uncapped (capped 50) broker/lane leaderboard, a trailing-12-month ledger table, and a plain-English Insights strip.

### The canonical money engine (ground truth for §H)

`src/lib/domain/money.ts` → `computeLoadNet`: for a TONU'd load, `net = gross = tonu_amount`; otherwise `net = rate − dieselCost − factoring − expensesTotal`, where `factoring = brokerFactoring ? rate × factoringPct/100 : 0` and `dieselCost = (miles/mpg) × pricePerGallon`. `computeTripNet` additionally subtracts trip-level personal-conveyance (PC) diesel, which is **never** included in per-load net — Performance's "net" is per-load net and will not equal a trip's all-in net for any trip with PC miles. This is by design, not a bug, but worth stating plainly since Brent's framing centers on "load net."

Attribution: `pickup_date ?? delivery_date ?? created_at` — confirmed identical across Performance, Calendar, and the Load Board (two parallel, textually-identical implementations — `attribution.ts` for tms-v2, `goal-month.ts` for admin — not a divergence today, but a consolidation opportunity).

**Neither Performance surface reimplements any of this locally** — confirmed by grep for money-shaped arithmetic in both Performance trees, zero matches. Both apps exclusively aggregate (`Σ`, ratios) figures that `computeLoadNet` already produced.

---

## C. Legacy capabilities worth preserving

### Expenses

- **The full QuickBooks-ledger density** (sortable multi-column desktop table, KPI strip, bulk bar) — tms-v2's list view is already close to this; keep pushing toward it, don't regress toward a card-only layout.
- **Skip Next Payment** — Brent explicitly asked for this to survive. **It already has, fully** — `skipNextPayment` is ported verbatim in tms-v2, same `skip_next_date` column, same schedule-walk logic, wired in `ExpenseDrawerContent.tsx`. Nothing to do here except not regress it.
- **Inline "+Add payment method" from within the expense form** — legacy lets you create a new card/account without leaving the add/edit flow. tms-v2's payment-method CRUD exists but lives only on Settings, a real friction point for the actual moment you'd want it (mid-way through logging a new bill).
- **A constrained payment-method `type` dropdown** — legacy uses a fixed list (Credit Card/Debit Card/Bank Account/ACH/Other); tms-v2 relaxed this to freeform text, a data-quality regression for a field that will be filtered/grouped on.
- **Tags and Notes** — both exist in schema, both are legacy-only surfaces today. Notes should be kept (a bill's "why"/context is genuinely useful — e.g. "renews annually, negotiate before June"); Tags is more debatable given the bills-tracker framing (see §D).
- **One-time-charge inclusion in KPI totals** — legacy folds dated one-time charges into "This Month"/"YTD"; tms-v2 explicitly doesn't (an acknowledged code-comment gap), so tms-v2 under-reports whenever a one-off is logged.
- **Activity history** — every mutation on a legacy expense is logged (`expense_activity`) and viewable. tms-v2 has the same table but writes nothing to it — a real audit-trail regression for a page whose whole value is "what's leaving and when."

### Performance

- **The integrated Net-vs-goal bar chart with a reference line** — this is the one thing legacy does that genuinely answers "am I pacing toward my goal" visually, which tms-v2's bare percent bar doesn't.
- **The dual Net + Gross $/mi rate-trend line** — tms-v2's current chart shows gross only; the net line is the more decision-relevant series and is currently missing.
- **The full sortable, ~uncapped broker/lane leaderboard** — tms-v2's 6-row cap is a direct violation of what Brent asked for in this exact audit ("no arbitrary 6-cap, view all"). Legacy's `DataTable` (click-header-to-sort, ~50-row cap) is the right shape to rebuild toward, on the server-aggregated architecture tms-v2 already has (don't copy legacy's client-side-everything approach — keep tms-v2's server-bounded query, just remove the artificial 6-row slice and add sort).
- **The proportional deadhead bar** — a % alone hides its own denominator; the loaded/empty/total mile visualization gives it context.
- **The Insights/takeaways strip** — fully built, unused in tms-v2. Cheap to restore (just import `takeaways()`), high value (plain-English "you're pacing behind, your best lane this month is X" is exactly the kind of glanceable insight a KPI grid can't deliver).
- **`netPerLoad` and avg-gross-per-load** — both already computed by the shared aggregator, rendered nowhere in either app. Brent explicitly asked for "avg load revenue, avg load net" in his IA spec — these are a near-zero-cost addition since the math already exists.

---

## D. What should be deleted

### Expenses

- **`ExpenseFormModal.tsx`** — confirmed dead code, zero callers, superseded by the composer/drawer pattern. Delete outright (flagging for a future pass, not doing it in this read-only audit).
- **The "onetime" frequency commingled into the same list as recurring bills, with no separation.** This is the clearest signal in the whole audit that the current design is a general transaction log wearing a bills-tracker's clothes. Recommendation: either drop one-time charges from this workspace entirely (they belong in the per-load or a general ledger, not a *recurring* bills calendar) or bucket them into a visually distinct "One-off charges" section, never commingled in the same "next charge" sorted list where a past one-time item has no real "next" concept.
- **The "Average Monthly" KPI tile** — currently mathematically identical to "This Month" (`ytd / monthsElapsed` cancels out to `monthlyTotal` exactly), a redundant tile that looks like a trend but isn't one. Replace with a genuine annualized-cost figure (see §H).
- **`type` as freeform text on payment methods** — revert to the constrained dropdown legacy uses; freeform text on a field that will be grouped/filtered on is a data-quality liability, not a feature.

### Performance

- **The 6-row cap on broker/lane tables** — an artificial limit with no product reason behind it, directly contradicted by Brent's own requirement.
- **The mislabeled "Rate ($/mi)" chart showing gross only** — either fix (show both lines) or relabel; showing a single unlabeled series under a generic name is worse than showing nothing.
- **Broker/lane bars sized by gross while sorted by net** — pick one metric and make the visual match the ranking logic; right now the two disagree with each other on the same chart.

---

## E. What should be rebuilt

### Expenses — rebuild targets, in order of value

1. **A true bills-vs-one-time split** in the IA (see §I) — this is the single biggest structural change needed to match Brent's stated framing.
2. **Payment method as a real foreign key**, not a soft name-string join (see §F) — the current design silently orphans expenses when an account is renamed.
3. **An "expected annual cost" KPI** that's a real full-year projection (`monthlyTotal × 12`, with one-time charges added where dated in-year), not the current YTD-so-far figure.
4. **Wire `notes` into the tms-v2 form** — it's in the schema, it's imported by CSV, it's invisible everywhere else. Either finish wiring it or formally drop it; the current half-state (writable only via CSV, unreadable everywhere else) is the worst of both options.
5. **Restore `logActivity()` calls on every tms-v2 mutation** — the table already exists, the read function already exists in legacy, tms-v2 just never calls the write side.
6. **Move payment-method quick-add inline into the expense composer**, in addition to keeping the full CRUD on Settings.

### Performance — rebuild targets, in order of value

1. **Uncap the broker/lane tables and add sorting** — highest-value, lowest-risk fix; the server-aggregation architecture is already correct, this is purely removing a `.slice`/adding a sort param.
2. **Fix the rate-trend chart to show both Net $/mi and Gross $/mi**, matching legacy's `RpmTrendChart`.
3. **Build one shared goal-pace module** and wire it into Performance's goal display (remaining, required-per-day, required-per-week, on-pace verdict) — see §H's goal-system audit for why this must be a single shared module, not a third independent reimplementation.
4. **Restore the Insights/takeaways strip** — near-zero cost, the module is already built.
5. **Add `netPerLoad` / avg-gross-per-load tiles** — same, near-zero cost, already computed.
6. **Fix broker/lane visual ranking to match the underlying net-based sort** (size bars by net, or clearly show both net and gross per row).
7. **Add a deadhead proportional-split visual**, not just the bare percentage.

---

## F. Data/schema changes required

**Caveat repeated from §A**: the base tables predate this repo's tracked migrations. Every column below marked "exists" is confirmed via application code reading/writing it; every column marked "missing" would need a real migration written against production's actual live schema, which this repo cannot fully reconstruct on its own — verify against the live database before writing any migration.

### `recurring_expenses` field trace (exhaustive, per Brent's explicit list)

| Field Brent wants | Exists? | Detail |
|---|---|---|
| Expense name | **Yes** | `name` |
| Description | **Partial/inconsistent** | `notes` column exists and legacy uses it as description; tms-v2's manual form has no notes field at all — writable only via CSV import, invisible in the UI otherwise |
| Amount | **Yes** | `amount` |
| Category | **Yes** | `category`, constrained list |
| Frequency | **Yes** | `frequency` enum: `monthly \| weekly \| quarterly \| annual \| onetime` |
| Next due date | **Computed, not stored** | Derived live from `day_of_month`/`day_of_week`/`start_date`/`skip_next_date`; no stored column, which is fine — this is correctly a derived value |
| Start date | **Yes** | `start_date` |
| **End date** | **Missing entirely** | No column, no field, no filter. Nothing represents "this bill ends on X" — directly relevant to Brent's own examples (equipment financing, a truck/trailer payment with a payoff date). **This is the single most consequential schema gap found.** |
| Payment method/account/card | **Exists, but not a real FK** | `card` is a **plain text column storing the account's name**, soft-joined by string match at read time. Renaming or deleting an `expense_accounts` row silently orphans every expense pointing at the old name string. |
| Active/inactive | **Yes** | `archived boolean` |
| Autopay | **Yes** | `autopay boolean` |
| **Last payment date** | **Missing entirely** | No column tracks when a charge was actually paid — this is a *schedule*, not a *payment log*. If Brent wants to see "paid" vs. "scheduled" as distinct states, this needs a new column (or a lightweight `recurring_expense_payments` log table, mirroring `expense_activity`'s shape). |
| Next payment date | Same concept as next due date | No distinct column; fine as-is unless Brent wants to separately track "due" vs. "will actually be paid" (e.g. a bill paid a few days late every cycle) |
| Notes | **Yes, schema-present, UI-orphaned in tms-v2** | See Description row above |
| Vendor | **Yes** | `vendor` |
| Account/card last-four | **Yes, correctly on the right table** | `expense_accounts.last4` — clean separation from `recurring_expenses`, no sensitive data stored |
| Annualized cost | **Computed, not stored, and not actually computed anywhere today** | No function exists that produces a true full-year projection; `monthlyAmount() × 12` would be the formula, see §H |
| Monthly equivalent | **Computed, not stored, correctly implemented** | `monthlyAmount(amount, frequency)`, identical pure function on both apps — see §H for the exact formula |
| Tags | **Yes, legacy-only** | `tags text[]`, dropped from tms-v2's UI entirely (debatable whether to restore — see §D) |

### `expense_accounts` (payment-method) architecture — audit verdict

Columns: `id, name, type, last4, is_default, deleted_at`. **This is sufficient for Brent's stated needs as-is, once `type` is reverted to a constrained enum.** No changes needed beyond that. **Confirmed: no sensitive card/account numbers are stored anywhere** — grepped for `card_number`/`account_number`/`cvv`/`full_card` across all migrations and expense-related source, zero matches; both apps' code comments explicitly assert "last4 only, never a full number." No security issue.

### Recommended schema additions

1. `recurring_expenses.end_date date` — nullable, for bills with a known payoff/cancellation date.
2. `recurring_expenses.expense_account_id uuid references expense_accounts(id)` — a real foreign key, migrating existing `card` text values by matching against `expense_accounts.name`. Keep `card` temporarily as a fallback display value during migration, then drop it once the FK is backfilled.
3. Optionally, a `recurring_expense_payments` log table (`id, recurring_expense_id, paid_at, amount, created_at`) if Brent wants a real "was this actually paid this cycle" record rather than just a schedule — mirrors the shape of the already-existing `expense_activity` table and would let "last payment date" become a real, queryable fact instead of an assumption.

---

## G. Server actions required

Full checklist, cross-referenced against both apps.

| Capability | Legacy | tms-v2 | Notes |
|---|---|---|---|
| Add | ✅ `createExpense` | ✅ `addExpense`, wired | |
| Edit (full row) | ✅ `updateExpense` | ✅ `editExpense`, wired | Neither app has granular per-field actions (change-amount, change-due-date, etc. standalone) — both fold every field into one full-row update. This is fine; a bills tracker doesn't need field-by-field mutation granularity. |
| **Delete (single row)** | ✅ `deleteExpense` | ⚠️ **Missing** — only bulk delete exists (`bulkDeleteExpenses`), no single-row delete action or UI | Regression vs. legacy's per-row kebab-menu Delete; add a single-row delete action, trivial given the bulk one already exists |
| Archive | ✅ `archiveExpense` | ✅ `setExpenseArchived(id, true)`, wired | |
| Restore | ✅ `restoreExpense` | ✅ `setExpenseArchived(id, false)`, wired | |
| **Skip next occurrence** | ✅ `skipNextPayment` | ✅ **`skipNextPayment`, fully wired, same schema, same logic** | **Confirmed fully preserved, exactly as Brent requested — nothing to build here.** |
| Duplicate | ✅ `duplicateExpense` | ✅ `duplicateExpense`, wired | |
| Change payment method | Folded into edit | Folded into edit | Parity |
| Change amount | Folded into edit | Folded into edit | Parity |
| Change due date | Folded into edit | Folded into edit | Parity |
| Change frequency | Folded into edit | Folded into edit | Parity |
| Change category (single) | Folded into edit | Folded into edit | Parity |
| Mark autopay | Folded into edit | Folded into edit | Parity |
| **Add notes** | ✅ (part of full edit form) | ⚠️ **Schema supports it, UI doesn't expose it** | See §E — wire the form field |
| Bulk archive | ✅ | ✅ `bulkArchiveExpenses`, wired | |
| Bulk delete | ✅ | ✅ `bulkDeleteExpenses`, wired | |
| Bulk change category | ✅ | ✅ `bulkChangeExpenseCategory`, wired | |
| Bulk skip-next / bulk change-payment-method | ❌ Neither app | ❌ Neither app | Not present in legacy either — not a tms-v2 regression, just never built anywhere |
| CSV import | ✅ | ✅ `importExpenses`, wired | |
| CSV export | ✅ | ✅ client-side download, wired | |
| Payment-method create/edit/delete | ✅ `createExpenseAccount`/`updateExpenseAccount`/`deleteExpenseAccount` | ✅ Wired via `src/actions/tms-v2/expense-accounts.ts`, live on Settings | **Code comment in `expenses.ts:17-19` is stale** — it still claims payment methods are "read-only in this phase," but full CRUD has shipped since; worth a one-line comment fix in a future pass |
| **Activity-log read** | ✅ `getExpenseActivity` | ❌ **Missing entirely** | No `expense_activity` write OR read anywhere in tms-v2. This is the one genuine functional regression in the whole Expenses server-action inventory — see §C/§E |

---

## H. Calculation definitions

### The canonical engine, exactly as implemented

```
// src/lib/dispatch/fuel.ts
dieselCost(miles, settings) = (miles / mpg) * pricePerGallon
factoring(rate, brokerFactoring, factoringPct) = brokerFactoring ? rate * factoringPct/100 : 0
loadNet = rate - dieselCost - factoring - expensesTotal

// src/lib/domain/money.ts — computeLoadNet
if load.status == "tonu":
    gross = net = tonu_amount        // diesel, factoring, expenses all zeroed
else:
    gross = rate
    net = loadNet(...)               // as above

// src/lib/dispatch/trip-rollup.ts — computeTripNet (TRIP-LEVEL, not per-load)
tripNet = Σ(computeLoadNet for each load on the trip) - pcDiesel
// pcDiesel = personal-conveyance miles between load stops, trip-scoped only,
// NEVER subtracted from any individual load's own net.

// src/lib/domain/money.ts — computeCarrierAR
A/R includes every load where status ∈ {delivered, tonu} and payment_status != "paid"
amount = tonu_amount if status == "tonu" else rate
overdue when daysOutstanding >= 40 (RECEIVABLE_OVERDUE_DAYS)

// src/lib/domain/attribution.ts
attributionDate(load) = load.pickup_date ?? load.delivery_date ?? load.created_at
```

**Every Performance KPI, on both apps, resolves to a pure aggregation of these already-costed values — confirmed via grep, zero local reimplementation found anywhere in either Performance tree.**

| KPI | Formula | Divergence found? |
|---|---|---|
| Gross | Σ `rate` (or `tonu_amount` where applicable) | None |
| Net | Σ `computeLoadNet(...).net` | None |
| Loads | count | n/a |
| Loaded miles | Σ `loadDiesel(...).loaded` | None |
| Deadhead miles | Σ `loadDiesel(...).deadhead` | None |
| Gross $/mi | `gross / loadedMiles` | None |
| Net $/mi | `net / loadedMiles` | None |
| Deadhead % | `deadhead / (loaded + deadhead)` | None |
| Margin % | `net / gross × 100` | None |
| Avg net/load | `net / loads.length` | Computed by the shared aggregator, **rendered nowhere in either app** — an omission, not a divergence |

**The one nuance every stakeholder should know explicitly, because it's easy to assume otherwise:** Performance's "net" is *per-load* net. It does not subtract trip-level PC diesel the way Trip Detail's net does. A load that's part of a trip with meaningful personal-conveyance mileage will show a slightly higher net on Performance/the Load Board than that same load's contribution implies once the trip closes out. This is intentional and documented in the code (`trip-rollup.ts` explicitly scopes PC diesel to trip-level only) — not a bug — but it should be called out plainly in the product (a tooltip or footnote on Performance's Net figure) so Brent never has a moment of "why doesn't this match the trip page."

### Frequency → monthly/annual projection, without double-counting

```
monthlyAmount(amount, frequency):
  annual    -> amount / 12
  quarterly -> amount / 3
  weekly    -> (amount * 52) / 12
  onetime   -> 0
  monthly   -> amount   (default)
```
This is the identical pure function on both apps, confirmed correct — weekly is annualized to 52 occurrences then divided into 12 months, not naively multiplied by ~4.33 with rounding, avoiding drift; `onetime` correctly contributes zero to any recurring run-rate. **No double-counting bug found.**

**Annualized cost is never actually computed anywhere today.** The formula should be `annualAmount(amount, frequency) = monthlyAmount(amount, frequency) * 12` for anything except `onetime` (which should be added to the annual total only in the specific year it's dated, if Brent wants one-time charges reflected in an annual figure at all — see §D's recommendation to separate them out entirely). This is the fix for both the "expected annual cost" KPI Brent asked for and the currently-redundant "Average Monthly" tile (§D).

### Goal-pace system — a real, demonstrable bug, and a clear recommendation

This is the most consequential correctness finding of this audit outside the core money engine, so it's stated in full here rather than buried.

**Current state:** there is no shared pace-calculation module anywhere in the codebase today. One used to exist (`lib/domain/goal-pace.ts`) and was deleted during a recent Today/Dashboard rework, with no replacement built — confirmed by a surviving code comment in `LoadBoardGoalCard.tsx` that explicitly says so. As a result:
- **tms-v2 Performance** shows only a bare percent-fill bar — no remaining, no required rate, no verdict.
- **tms-v2's Load Board** shows a percent + a plain "remaining" figure, computed inline, with an explicit code comment stating pace math was deliberately left out ("flagged, not faked").
- **tms-v2's Today/Dashboard** no longer shows the monthly net goal at all — it was replaced by an unrelated feature (a multi-goal savings/debt-payoff tracker, `countdown_goals`), and a stale comment elsewhere in the codebase (`lib/data/analytics.ts`) still incorrectly claims a "Today pace bar" exists.
- **Legacy admin Performance** is the only surface with real pace math — but it computes two different numbers, independently, on the same page, that visibly contradict each other: a "required per week" figure using `Math.ceil(daysLeft / 7)` weeks, and a separate "required per day" figure (in its Insights sentence) using the exact day count. For a worked example — $8,000 net so far, $20,000 goal, 10 days left — the page shows **"$6,000/wk"** in one card and implies **"$1,200/day"** in another, and `$1,200 × 7 = $8,400 ≠ $6,000`. A user doing simple mental math on the two figures shown together on one screen would notice they don't agree.

**Recommendation:** build one pure module — `{ goal, netSoFar, daysLeft } → { remaining, requiredPerDay, requiredPerWeek, onPace }` — with `requiredPerWeek` derived consistently from `requiredPerDay` (never a separately-rounded week count) so the two can never contradict each other. Every surface that shows the monthly/annual net goal — the Load Board card, Performance's goal display, and Today's dashboard if/when a goal widget is restored there — should consume this one function, the same discipline the codebase already applies to its load-aggregation functions (whose own doc comments explicitly warn against exactly this class of drift: "recomputing net here with a different formula is exactly the drift this split exists to prevent"). **Today's dashboard and Performance should absolutely consume the same goal data and the same pace calculation — not two independent ones** — this closes both the missing-widget gap on Today and the contradictory-numbers bug in legacy in a single fix.

### Redundant / misleading Performance metrics — consolidated verdict

- **Keep, confirmed correct and canonical-engine-backed**: Gross, Net (always paired), Loads, Net $/mi, Gross $/mi, Deadhead %, Margin %.
- **Fix**: the "Rate ($/mi)" chart (gross-only, mislabeled — show both lines); broker/lane bars (sized by gross, sorted by net internally — pick one and make the visual match).
- **Add, near-zero cost since already computed**: avg net/load, avg gross/load.
- **Add, requires the new module above**: goal remaining/required-rate/on-pace verdict.
- **Remove**: the "Average Monthly" Expenses tile (mathematically redundant with "This Month" today).
- **No purely decorative charts found** — everything currently rendered maps to a real business question; the issues found are correctness/completeness gaps, not clutter.

---

## I. Expenses information architecture

Proposed layout, top to bottom:

1. **KPI strip** — Monthly recurring total, Annual recurring total (new, per §H), Due this week, Due this month, # active bills. Five tiles, all glanceable in under a second.
2. **Upcoming Bills** — a chronological list, nearest-due first: `Date | Expense | Amount | Payment method | Category | Status (upcoming/due-soon/overdue-if-no-autopay)`. This is the single highest-value view for Brent's stated daily use case ("what's coming due") and should be the default landing view, not buried behind a filter.
3. **Recurring-bill calendar** — month/year selectable, showing every scheduled charge for the selected month plus a running "total scheduled this month" and "total for the year" figure. This directly answers Brent's ask and doesn't exist in either app today — it's the one genuinely new surface this spec calls for building, distinct from the flat list view.
4. **Full ledger / list view** (what exists today) — kept as a secondary, filterable, sortable table below the calendar, for the "find and edit a specific bill" workflow.
5. **Payment methods** — either duplicated inline (quick-add from the bill form, per §E) or a clearly-linked shortcut to Settings, not buried two clicks away with no visible path from Expenses itself.

**One-time charges, if kept in this workspace at all, get their own visually distinct section** — never commingled into the "next charge" sorted list with true recurring bills (§D).

---

## J. Performance information architecture

Proposed layout, top to bottom:

1. **Overall KPI row**: Gross, Net, Loads, Loaded miles, Deadhead miles, Total miles, Rev/loaded-mile, Net/loaded-mile, Deadhead %, Avg load revenue, Avg load net. All server-aggregated, all already either present or a near-zero-cost addition per §H.
2. **Time controls**: This week / This month / Last month / This year / Last year / Custom range, plus explicit MoM and YoY comparison deltas next to each KPI (MoM already exists; YoY does not and would need a second trailing-period fetch, same pattern as the existing MoM fetch).
3. **Load-performance table** — the analytical Load Board: `Load# | Date | Origin | Dest | Broker | Revenue | Loaded mi | Deadhead | Total mi | $/loaded-mi | $/total-mi | Net | Net/mi | Trip`, server-paginated, sortable, linking each row to the real Load Detail page. This table does not exist in either app today and is the second genuinely new build item in this spec — it's the literal "Load Board turned into analytics" Brent asked for, distinct from the summary KPIs above it.
4. **Broker performance table** — full, sortable, no 6-row cap, a "View all" affordance, links to each broker's profile. Rebuild target already scoped in §E.
5. **Lane performance table** — same shape as broker, for origin→destination pairs.
6. **Trend charts** — only the ones that answer a specific question: Net trend, Gross trend (paired, not net-alone), Net $/mi + Gross $/mi trend (paired, fixing the current gross-only mislabel), Volume (loads/period) trend, Deadhead % trend. Every chart must answer a stated business question per Brent's own instruction — no chart ships without one.
7. **Goal card** — percent, remaining, required-per-day/week, on-pace verdict, all from the single shared goal-pace module (§H) — not a bare progress bar.
8. **Insights strip** — restored, near-zero cost (§C/§E).

All of the above stays server-aggregated on the architecture tms-v2 already has correctly built — the fixes needed are removing artificial caps and adding two genuinely new tables/charts, not re-architecting the data layer.

---

## K. Mobile workflow

**Expenses on a phone:**
- KPI strip collapses to the existing 3-tile mobile totals strip pattern (already built, keep it) — Monthly recurring / Due this week / Needs review, or similar, above the fold with no scroll.
- Upcoming Bills list is the natural mobile-first view — a chronological card list (date, name, amount, card, category) is exactly the shape `DataList`'s mobile card mode already renders well elsewhere in the app; reuse that primitive.
- The recurring-bill calendar (new, per §I) needs a mobile-appropriate compressed view — likely an agenda list grouped by day rather than a full month grid, mirroring the pattern Calendar already uses for its own mobile view (`CalendarAgenda.tsx`) rather than inventing a new one.
- Quick add/edit stays the existing FAB + inline composer pattern (already built, works well).
- No giant sortable table forced onto a phone — the full ledger view (§I item 4) should be desktop-primary, with the mobile experience anchored on the Upcoming Bills list and calendar instead.

**Performance on a phone:**
- KPI row becomes the existing horizontal `StatChip` scroll strip (already built, keep it) — Net and Gross should be the first two chips visible without scrolling, since those are the numbers Brent checks most.
- Charts already have a mobile-specific mode (`DualTrendChart` is mobile-only per the recent remodel) — extend the same pattern to the fixed rate-trend and any new deadhead/goal visuals, don't force a desktop-shaped line chart onto a narrow viewport.
- The new Load-performance, Broker, and Lane tables (§J items 3-5) must use the same `DataList` dual-mode (table on desktop, stacked cards on mobile) pattern already proven across the rest of tms-v2 — this is a solved problem elsewhere in the app, just needs to be applied here too.
- Goal card and Insights strip both read as quick, scannable text blocks already — no rework needed beyond building them (§H, §C).

---

## L. Priority roadmap

### Expenses

**Critical**
- Add `end_date` to `recurring_expenses` (real schema gap against Brent's own examples — equipment financing, truck/trailer payments)
- Convert `card` from a soft string join to a real foreign key against `expense_accounts`
- Restore `logActivity()` writes on every tms-v2 mutation (the audit-trail regression)
- Add single-row delete (currently bulk-only, a real UI gap for the single-item case)

**High**
- Build the Upcoming Bills chronological view and the recurring-bill month/year calendar (§I) — the two biggest structural gaps against Brent's stated framing
- Add a true "expected annual cost" KPI (real `× 12` projection, not YTD-so-far)
- Wire the `notes` field into the tms-v2 form (currently write-only via CSV, invisible everywhere else)
- Separate one-time charges from the recurring-bills list visually

**Medium**
- Revert payment-method `type` to a constrained dropdown
- Move payment-method quick-add inline into the expense composer
- Remove or repurpose the redundant "Average Monthly" KPI tile

**Low**
- Decide on Tags — restore or formally drop
- Delete the orphaned `ExpenseFormModal.tsx`
- Fix the stale "read-only in this phase" comment in `expenses.ts`

### Performance

**Critical**
- Remove the 6-row cap on broker/lane tables and add sorting + "View all" (a direct, explicit ask in Brent's own brief for this audit)
- Fix the rate-trend chart to show both Net $/mi and Gross $/mi (currently gross-only, mislabeled)
- Build the single shared goal-pace module and wire it into Performance's goal display, resolving the demonstrable weekly-vs-daily contradiction found in legacy and the complete absence of pace math in tms-v2

**High**
- Build the Load-performance table (the literal "analytical Load Board" Brent asked for) — genuinely new, doesn't exist in either app today
- Build the Lane performance table with the same sortable/uncapped treatment as Broker
- Fix broker/lane visual ranking to match the underlying net-based sort (currently sized by gross)
- Restore the Insights/takeaways strip (near-zero cost, module already built)

**Medium**
- Add avg net/load and avg gross/load tiles (near-zero cost, already computed)
- Add YoY comparison alongside the existing MoM deltas
- Add a deadhead proportional-split visual, not just the bare percentage

**Low**
- Add a document footnote/tooltip clarifying that Performance's Net is per-load net, not trip-inclusive net
- Consolidate the two parallel attribution-date implementations (`attribution.ts` / `goal-month.ts`) into one shared module

---

## Notes on scope and confidence

- Every finding traces to a specific file and, in nearly all cases, a line number; every formula quoted is the actual code, not a paraphrase.
- The base-table schema for `recurring_expenses`/`expense_accounts`/`load_expenses` predates this repo's tracked migrations — every "missing column" recommendation in §F must be verified against the live production schema before a migration is written, not assumed complete from this repo's history alone.
- The goal-pace bug (§H) is the one finding in this audit that rises to "demonstrable correctness defect," not just a completeness gap — it was verified with a worked numeric example against the actual arithmetic in the code, not inferred.
- This audit did not modify any application code; it is a read-only survey to inform a redesign spec.
