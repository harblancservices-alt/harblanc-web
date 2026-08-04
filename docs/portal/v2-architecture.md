# `/tms-v2` — Architecture

**Status:** architecture only, no application code written. **Companion docs:** [`current-tms-audit.md`](./current-tms-audit.md) (what V1 does, exactly), [`current-tms-prd.md`](./current-tms-prd.md) (prioritized weaknesses), [`v2-design.md`](./v2-design.md) (page-by-page UX design — this document is its engineering counterpart: *how* every page in that doc gets built so it stays maintainable for years).

**Contract this document operates under:** clean-room application-layer rebuild under a **new route group**, reusing the **existing** Supabase project (`rtlahhywtijaayrzipvs`) as the single source of truth. **No schema changes.** Runs **alongside** the existing `/admin` app, not in place of it — both read/write the same tables during the transition, and `/admin` keeps working unmodified until a future, separate cutover decision. Staging path: **`/tms-v2`**, structured so it is a rename (`/tms-v2` → `/portal`), not a rebuild, when promoted.

Every decision below states **what** and **why** — rationale and tradeoffs — because the audit's #1 finding (the same business rule reimplemented five different ways) was fundamentally a failure to write down *why* once and point everyone at it.

---

## Table of contents

**Foundations**
- [1. Tech stack & conventions](#1-tech-stack--conventions)
- [2. Component hierarchy](#2-component-hierarchy)
- [3. The data/domain layer](#3-the-datadomain-layer)
- [4. Folder hierarchy](#4-folder-hierarchy)
- [5. Routing hierarchy](#5-routing-hierarchy)
- [6. State management strategy](#6-state-management-strategy)
- [7. Auth — inheriting the existing admin session](#7-auth--inheriting-the-existing-admin-session)
- [8. Naming conventions & coding standards](#8-naming-conventions--coding-standards)
- [9. House rules (non-negotiable, lint/review-enforced)](#9-house-rules-non-negotiable-lintreview-enforced)
- [10. Demo-mode isolation, structurally enforced](#10-demo-mode-isolation-structurally-enforced)
- [11. Testing strategy](#11-testing-strategy)
- [12. Promotion path: `/tms-v2` → `/portal`](#12-promotion-path-tms-v2--portal)

---

## 1. Tech stack & conventions

**Decision: same stack as `/admin` — Next.js 16 (App Router, this repo's actual version — not the pre-16 conventions a general-purpose model would default to), React 19, TypeScript, Tailwind v4, Supabase (`@supabase/ssr` + `@supabase/supabase-js`), Resend, Stripe, `@react-pdf/renderer`/`pdf-lib`, Vitest.**

**Why:** `/tms-v2` is an *application-layer* rebuild, not a platform migration — the PRD's prioritized weaknesses (TONU-net inconsistency, unbounded queries, dead code, convention-only demo isolation) are all architecture-and-discipline problems, not technology problems. Introducing a second framework, ORM, or state library alongside the existing one would add a second thing to learn and keep patched for a one-operator product, without fixing any of the audited issues. Every dependency already in `package.json` earns its place; `/tms-v2` adds **zero new runtime dependencies** unless a specific page design in `v2-design.md` requires one (none currently do).

**What changes vs. what `/admin` does today:**

| Area | `/admin` (V1) | `/tms-v2` | Why change |
|---|---|---|---|
| Data access | Supabase client imported ad hoc per file/action | Every access goes through typed functions in `lib/data/*` behind a `DataSource` interface (§3, §10) | Root cause of TONU-net-computed-5-ways and demo-isolation-by-convention; a single interface makes both structurally impossible to bypass |
| List queries | Full-table reads, client/Node-side filtering | Server-paginated, date/status-scoped by default (§3) | PRD priority #4 — the single largest non-functional risk carried into a rebuild meant to rival McLeod/Alvys |
| Business rules (money, dates, attribution) | Re-derived per screen (`loadNet` sometimes, not always; A/R computed 3 places) | One `lib/domain/money.ts`, one `lib/domain/attribution.ts` — every screen imports, none re-derives (§3) | PRD priorities #1 and #2 |
| Component reuse | Bespoke table per list (desktop table vs. mobile card as two JSX trees), 3 collapsible cards on Load Detail, hand-duplicated nav config | One `<DataList>` primitive (one data model → table row or stacked card via CSS, not two trees), one inline-edit surface, one `nav.config.ts` (§2) | `v2-design.md`'s cross-cutting wins — kills the doubled-JSX and hand-sync-drift patterns named in audit §5, §27 |
| Auth | Two gate functions (`requireAdmin`, `adminFromMiddleware`) reused as-is | **Identical, reused, not reimplemented** — see §7 | The one piece of `/admin` that is already correct for a single-tenant app; rebuilding it would only add risk |
| Data fetching primitive | `force-dynamic` + `Promise.all` fan-out per page | React Server Components fetch directly in the route segment; `"use cache"` / segment-level revalidation applied per-query where the underlying data doesn't need to be live-every-request (§6) | Next 16's App Router default caching model differs materially from Next ≤14 (which most training data assumes) — see the callout below |
| Styling | Tailwind v4 `@theme inline` CSS-variable tokens in `globals.css`, light/dark via `[data-theme]` | **Same token system, extended, not replaced** — `/tms-v2` adds its own semantic aliases in the same `@theme inline` block rather than a parallel token file | One design system, one file, for the whole app (including `/admin` and `/crm`) — a second token file would be exactly the kind of duplication this rebuild exists to avoid |

**Next.js 16 callout (read `node_modules/next/dist/docs/01-app` before writing code — this repo pins `next@16.2.6`, not the version most training data was trained on):** the App Router's request APIs (`headers()`, `cookies()`, `params`, `searchParams`) are **async** — this repo's own `src/lib/admin/auth.ts` already does `await headers()`, confirming the pattern to follow. Caching defaults, `"use cache"` directive availability, and Server Action conventions in Next 16 differ from the Next ≤14 shape a general-purpose model tends to assume by default; **do not assume Next 13/14 App Router behavior — verify against the installed version's docs before implementing any given page.** This instruction is repeated here because it is the single most likely source of subtly-wrong code in this rebuild if skipped.

**Server vs. client components — default rule:** every component is a Server Component unless it needs one of: browser-only state (`useState`/`useReducer` for UI-local state), event handlers, browser APIs (camera, clipboard, `localStorage`), or a third-party client-only library. This mirrors what `/admin` already does reasonably well; `/tms-v2` makes it an explicit, checked rule (§9) rather than an implicit habit, because the audit found no violations in `/admin` worth calling out — this is a "keep doing it, now write it down" decision, not a fix.

**TypeScript:** `strict: true` (already the repo default — confirmed via `tsconfig.json` inheritance, not overridden per route group). No `any` in `lib/domain/*` or `lib/data/*` — the money engine and query layer are exactly where a silently-`any`-typed escape hatch would reintroduce the bug this rebuild exists to close.

---

## 2. Component hierarchy

**Decision: three layers — primitives (`components/ui`), domain composites (`components/domain`), page shells (`app/**/page.tsx` + colocated `_view.tsx`) — with a hard rule that a page never contains raw markup for anything a primitive already covers.**

### Layer 1 — Primitives (`components/ui/*`)

Presentation-only, zero Supabase/business-logic imports, fully reusable across `/tms-v2` (and, later, portable back into `/admin` or `/crm` if useful — not a goal of this rebuild, but a natural consequence of keeping this layer clean). One file per primitive:

| Primitive | Replaces (V1 pattern) | Contract |
|---|---|---|
| `<DataList>` | Bespoke table-per-page + separate mobile-card JSX tree (audit §5, §8, §17, §18, §21, §22) | One data model in, renders as sortable/zebra table (desktop) or stacked card (mobile) via CSS breakpoint, not two render paths. Built-in: pagination, bulk-select, server-persisted saved filters. Every list in `v2-design.md` (§4, §6, §9, §13, §19, §20, §21, §25) is an instance, not a bespoke build. |
| `<MoneyRow>` | Inline `$X` strings scattered per page, `toFixed(2)` calls | label ← → tabular-nums figure, semantic color (`--positive`/`--negative`) only on the figure, always fed by a `lib/domain/money.ts` formatter — never a literal number formatted inline. |
| `<Money>` | same | Single-value inline variant of `<MoneyRow>` for use inside table cells / KPI tiles. |
| `<StatusPill>` | Ad hoc colored `<span>` per page (load status, lead-pipeline stage, trip status) | One component, takes a typed `status` + `domain` (`"load" | "trip" | "lead"`) prop, resolves color/label from `lib/domain/status.ts` — not per-page string→color maps. |
| `<DateTime>` | Raw `Date` renders, ad hoc `formatCentral()` calls | Always renders via `lib/domain/dates.ts`'s `formatCentral()`; literal "CST" suffix built in — a raw `<Date>`/`toLocaleString()` call outside this component is a review-blocking finding (§9). |
| `<KpiTile>` | Bespoke KPI card markup repeated per page (Dashboard, Load Board, Trips, Performance) | label, figure (via `<Money>`/plain), optional delta pill, optional sparkline slot. |
| `<Card>` | Overused stacked-card-with-shadow pattern (flagged in `v2-design.md`'s Structure section as V1's main visual-noise source) | Reserved for genuinely discrete objects (a KPI tile, a document thumbnail) — **not** for "a section of a page." Lists use hairlines (`--border`), not card boxes, per the design doc's Stripe/Linear/Ramp philosophy. |
| `<Table>` | — | Low-level primitive `<DataList>` composes internally; not meant for direct page use except genuinely one-off tabular data that isn't a list-of-records (e.g. a static breakdown table). |
| `<Modal>` / `<SlideOver>` | Both exist ad hoc per feature in V1 (Countdown modal, Add Load modal, Expense slide-over, Contact modal — each hand-built) | Two primitives, one implementation each, used everywhere a modal/slide-over is needed. `v2-design.md`'s cross-cutting win #1 (inline-edit over modal-then-edit-mode) means these are used *less* in V2 than V1, but where genuinely needed (BOL signer, Log Service, Applications detail) there is one component, not N. |
| `<CommandPalette>` | V1's `GlobalSearch` (search-only, 3 unbounded table scans) | Rebuilt per `v2-design.md`'s Command palette spec — Actions/Records/Pages grouping, one indexed paginated server query (§3) replacing the three `ilike` scans including the unbounded `loadAllFiles()` union (audit §27). |
| `<Button>`, `<Input>`, `<Select>`, `<Checkbox>`, `<Combobox>`, `<Toast>`, `<InlineEdit>` | Scattered ad hoc form controls per feature | Standard form-primitive set. `<InlineEdit>` is new — the single component backing cross-cutting win #1 (click a value → input → `⌘Enter`/blur saves → `Esc` cancels), used on Load Detail, Trip Detail, Quote Details tab instead of each page reinventing its own inline-edit toggle. |

**Rule enforced at review time (not lint, judgment-based — see §9):** if a second page needs markup visually identical to an existing page's bespoke block, that block becomes a primitive or composite *before* the second page ships, not after a third page repeats it. This directly targets the audit's repeated "reimplemented per screen" pattern (TONU net, A/R, nav config, `escapeHtml`/`shortRef`/`resolveFrom` helpers) — the failure mode was never "we didn't have a component," it was "the second copy was allowed to exist at all."

### Layer 2 — Domain composites (`components/domain/*`)

Compose primitives + know about one entity's shape, but still contain **no data-fetching** — they receive fully-loaded, typed props from a Server Component parent. Examples: `<LoadCard>`, `<TripSummaryRow>`, `<BrokerIdentityHeader>`, `<UrgencyBadge>`, `<NotificationBell>`, `<AlertRow>`. Each corresponds to a reusable unit named explicitly in `v2-design.md` (e.g. the Load Board's load card, the Operations feed's urgency-grouped row).

**Why the fetch/render split matters here specifically:** it's what makes the "server-paginated by default" rule (§3) mechanical rather than aspirational — a domain composite that received data via props *cannot* accidentally issue its own unbounded query, because it has no data-fetching capability at all. This is the component-layer half of the same structural-enforcement idea behind `DataSource` (§10).

### Layer 3 — Page shells (`app/**`)

A `page.tsx` per route (Server Component, does the data fetch via `lib/data/*`, §3) plus a colocated `*View.tsx` (also typically server, occasionally a thin client wrapper for interactive chrome) that lays out composites per the wireframe in `v2-design.md`. Page shells own layout only — zero inline business logic, zero inline Supabase calls. A page shell that starts accumulating its own money math or its own query is a signal the domain/data layer is missing something, not a place to patch around it (this is the exact failure pattern behind the audit's 1,787-line `quote-detail/page.tsx` — decompose by tab/concern from the start, per PRD priority #7, rather than accreting one file).

---

## 3. The data/domain layer

This is the layer the PRD's #1 and #2 priorities are actually about, so it gets the most explicit treatment.

### 3a. One money/profit engine — `lib/domain/money.ts`

**Decision:** a single module exports the only functions permitted to touch `rate`, `tonu_amount`, `load_expenses`, or `factoring_pct`:

```
computeLoadNet(load, expenses, settings, broker)      // replaces V1's 5 divergent TONU treatments
computeTripNet(trip, loads, expenses, settings, brokers)  // includes PC diesel, flags incomplete PC-mile data
computeCarrierAR(loads)                                // "owed to me for delivered freight"
computeCustomerAR(quotes, payments)                     // "owed by shipper for brokerage margin"
formatMoney(cents | dollars)                            // the only allowed formatter — tabular-nums, no inline toFixed
```

**Why one module, not "a shared util file":** the audit's #1 finding is that `loadNet()`/`loadDiesel()` already exist as V1's *intended* canonical function — the bug wasn't the absence of a shared function, it was that not every caller routed through it (Load Board's TONU path bypasses it entirely; Performance hardcodes factoring `true` regardless of the broker flag). A shared file that can still be bypassed by a page importing raw columns and computing inline reproduces the exact same failure. The structural fix: **`lib/domain/money.ts` is the only file in the entire `/tms-v2` route group permitted to import `rate`/`tonu_amount`/`load_expenses`/`factoring_pct` from a data-layer type.** Every other file receives a pre-computed `Money` result, never the raw columns. This is enforced by: (1) `lib/data/*` query functions return domain types (`LoadWithFinancials`, not raw `loads` rows) that don't expose the raw money columns to callers outside `lib/domain`; (2) a documented review rule (§9) that any PR touching money math outside `lib/domain/money.ts` gets flagged.

**One A/R concept, two labeled rows, not two computations (PRD #2):** `computeCarrierAR()` and `computeCustomerAR()` are two functions because they are genuinely two different receivables (freight owed to the owner vs. brokerage margin owed by the shipper — `v2-design.md`'s Receivables page renders both as labeled sections of one page), but both live in the same module, are both called from exactly one place each (Receivables page + wherever else needs the same number, e.g. Accounting linking out rather than recomputing), and neither is ever re-derived by Performance, Accounting, or any other screen independently. Accounting's confirmed 100-row MTD undercount bug (audit §19) is fixed here structurally: `computeCustomerAR`/the MTD collected figure becomes a real aggregate query (§3c), not a capped client reduce.

### 3b. One profit-attribution rule — `lib/domain/attribution.ts`

```
attributionDate(load): Date   // pickup date, always — the one rule
```

**Why a dedicated one-line module instead of inlining `load.pickup_date` everywhere:** V1's month-attribution logic (`goalMonthParts(closeOutDate(load))`) is already centralized in spirit but reimplemented per-caller in enough places that Calendar, Performance, and the Load Board don't all obviously agree they're calling the same rule at a glance. Giving the rule its own named function with a name that states the rule (`attributionDate`, not `closeOutDate` — the old name described *how*, the new name states *what and why*) makes every call site self-documenting and makes a future accidental divergence (e.g. someone attributing by delivery date on one new screen) a one-line diff to review, not a buried inline expression.

### 3c. Query modules — `lib/data/*`, paginated and scoped by default

**Decision:** one file per entity (`lib/data/loads.ts`, `lib/data/trips.ts`, `lib/data/brokers.ts`, `lib/data/quotes.ts`, …), each exporting typed, purpose-named functions — never a generic `query(table, filters)` escape hatch. Every list-returning function takes an explicit `{ page, pageSize, ...scopeFilters }` argument and returns `{ rows, totalCount, hasMore }` — there is no "give me everything" function for any table the audit flagged as a full-table-scan risk (`loads`, `load_expenses`, `brokers` cluster, Calendar's month window, Files' three-table union, Performance's full history).

```ts
// lib/data/loads.ts
export async function listLoads(opts: {
  page: number; pageSize: number;
  month?: { year: number; month: number };
  brokerId?: string; status?: LoadStatus;
}): Promise<Paginated<LoadWithFinancials>>

export async function getLoadById(id: string): Promise<LoadWithFinancials | null>

// lib/data/calendar.ts
export async function listLoadsInWindow(monthStart: Date, monthEnd: Date): Promise<CalendarLoad[]>
// ^ scoped to the viewed month ±1 week for spanning loads — replaces V1's
//   entire-unfiltered-`loads`-table read, the single heaviest query in the app (audit §7)

// lib/data/performance.ts
export async function getPerformanceRollup(period: DateRange): Promise<PerformanceSummary>
// ^ server-aggregated for the requested period; V1 ships the entire load
//   history to the client and re-aggregates on every period-toggle (audit §20)
```

**Why this is a data-layer rule and not a per-page discipline:** PRD priority #4 explicitly calls out that V1 "got away with" full-table reads at one-truck scale and that a rebuild meant to rival McLeod/Alvys should not inherit that ceiling. Putting the pagination contract in the *type signature* of every `lib/data` function (returns `Paginated<T>`, takes `{page, pageSize}`) means a page can't accidentally regress to an unbounded read without a visible, awkward type mismatch — the same "make the correct path the only path" idea as the money engine, applied to query shape instead of business logic.

**Supabase access pattern — kept from `/admin`, not changed:** service-role client, created server-side only, inside `lib/data/*` functions exclusively (never inside a page/component/action directly — see §10 for why this specific rule is now type-enforced rather than conventional). `/tms-v2` reuses `createServiceRoleClient()` from `/admin`'s existing `src/lib/supabase/server.ts` rather than a second copy — one client factory for both route groups, since the underlying Supabase project and RLS posture (deny-all, service-role-bypasses-everything) is identical and unrelated to which app is calling it.

### 3d. Notification rules registry — `lib/domain/notifications.ts`

Per `v2-design.md`'s Notification model: one rules registry (`{severity, entity, dedupeKey, module}` per rule — overdue receivable, stale quote, maintenance due, incomplete expense, new lead, empty-truck nudge), computed once, consumed by the nav badge, the Dashboard's Needs Attention section, and the bell dropdown identically. This directly replaces V1's two unreconciled urgency vocabularies (`AlertGroupKey` on the Dashboard vs. `computeUrgency()`'s `UrgencyChipKind` on Operations, audit §2/§12) with one. `computeUrgency()`'s actual rule logic (the urgency thresholds themselves — stale-estimate days, awaiting-payment-long threshold, etc.) is preserved and ported here verbatim where V1's version is already correct; only the *plumbing* (one registry, one consumer contract) is new.

---

## 4. Folder hierarchy

```
src/app/tms-v2/
  (authed)/
    layout.tsx                 # resolves session (§7) + demo mode (§10), renders shell
    page.tsx                   # Dashboard / Today
    loading.tsx
    error.tsx
    loads/
      page.tsx                 # Load Board
      [id]/
        page.tsx                # Load detail
        loading.tsx
    trips/
      page.tsx
      [id]/page.tsx
    calendar/page.tsx
    brokers/
      page.tsx
      new/page.tsx
      quick-add/page.tsx
      [id]/page.tsx
    reach/page.tsx
    load-inquiry/page.tsx
    operations/
      page.tsx                  # tab-routed via ?tab=, per v2-design.md §13
      applications/[id]/page.tsx
    quotes/
      [id]/
        page.tsx                 # Quote detail workspace
        estimate/page.tsx
        finalized-quote/page.tsx
        bol/page.tsx
    receivables/page.tsx
    expenses/page.tsx
    accounting/page.tsx
    performance/page.tsx
    maintenance/
      page.tsx
      category/[category]/page.tsx
      preventative/page.tsx
      [id]/page.tsx
    files/page.tsx
    camera/
      page.tsx
      [batchId]/page.tsx
    settings/page.tsx
  (public)/
    q/[token]/...                # customer-facing confirm pages, token-gated (§7 — separate trust boundary, unchanged from V1)
  api/
    fmcsa/route.ts               # reused/ported from /api/admin/* — see §5 note
    geo/route.ts
    cities/route.ts

src/components/
  ui/            # Layer 1 primitives (§2) — shared by tms-v2, and reusable by /admin or /crm if ever wanted
  domain/        # Layer 2 composites (§2), tms-v2-specific (load cards, trip rows, etc.)

src/lib/
  data/          # §3c — one file per entity, paginated/scoped query functions, the ONLY layer that talks to Supabase
    loads.ts
    trips.ts
    brokers.ts
    quotes.ts
    calendar.ts
    performance.ts
    maintenance.ts
    files.ts
    notifications.ts
  domain/        # §3a/3b/3d — pure functions, zero I/O, fully unit-testable
    money.ts
    attribution.ts
    dates.ts       # formatCentral() and friends — CST labeling, one implementation
    status.ts      # load/trip/lead status → label/color resolution
    notifications.ts
  auth/          # §7 — thin re-exports of /admin's existing auth, not a reimplementation
    session.ts
  demo/          # §10 — DataSource interface + Live/Demo implementations
    data-source.ts
    live-data-source.ts
    demo-data-source.ts
    demo-dataset.ts
  nav/
    nav.config.ts  # the one route registry (§2, §5)

src/actions/tms-v2/   # Server Actions, one file per entity, mirrors lib/data/*.ts naming
  loads.ts
  trips.ts
  ...
```

**Why a new `app/tms-v2/**` tree instead of nesting inside `app/admin/**`:** the architecture contract requires `/tms-v2` to run *alongside* `/admin`, not as a variant of it — a nested route would inherit `/admin`'s layout, middleware matcher assumptions, and `(authed)`/`(popup)` route-group conventions in ways that make "promote later" (§12) a restructure instead of a rename. A sibling top-level route group with its own `(authed)` layout is a clean, literal rename target: `mv src/app/tms-v2 src/app/portal` plus a middleware matcher edit is the entire promotion, by design.

**Why `components/` and `lib/` are shared (not `app/tms-v2/components/`, `app/tms-v2/lib/`):** the `DataSource`/demo-mode interface (§10), the money engine (§3a), and the primitive kit (§2) are exactly the pieces future work (a `/crm` feature needing `<DataList>`, or a genuine `/admin` → `/tms-v2` incremental page-by-page migration) would want to reuse. Nesting them under `app/tms-v2` would require a later extraction; putting them at `src/lib`/`src/components` top level costs nothing now (nothing else imports them yet — `/admin` and `/crm` keep their own existing lib code untouched) and avoids a guaranteed future refactor. This is the one folder-structure decision made partly for hypothetical future reuse rather than only today's requirement — justified because the cost today is zero (it's just where new files go) and the alternative (extract later) is strictly more work.

---

## 5. Routing hierarchy

**Segment structure:** one `(authed)` route group under `app/tms-v2/` mirroring `/admin`'s own `(authed)`/`(popup)` split — `(authed)` for the full shell (§7's layout does the auth check once), a lightweight `(public)` group for the token-gated customer-facing pages (§7 — a genuinely separate trust boundary, kept separate from `(authed)` exactly as V1 does).

**Layouts:** one root `(authed)/layout.tsx` resolving auth (§7) + demo mode (§10) + rendering `<PortalShell>` (the Layer-3 shell composing sidebar/topbar/bottom-nav from `nav.config.ts`, §2/§4). No per-section nested layouts unless a section genuinely needs its own persistent chrome beyond the global shell (none currently do — Operations' tab UI is `?tab=`-driven client state within one page, not nested layouts, matching V1's already-good pattern there).

**Loading/error boundaries:** every route segment with a data-dependent `page.tsx` gets a colocated `loading.tsx` (skeleton matching the page's `<DataList>`/KPI-strip shape — not a generic spinner, since the design doc's Motion & feedback section explicitly prefers inline/optimistic feedback over spinner-then-refetch) and relies on the root `(authed)/error.tsx` for uncaught errors, with page-specific `error.tsx` only where a page's failure mode is meaningfully different from "show a retry button" (e.g. the BOL PDF-render pipeline, which V1's own code comments flag as historically fragile — that route gets its own error boundary with a more specific message).

**Param conventions:** `[id]` for a single-entity route (matches V1), `[category]`/`[group]`/`[batchId]` where the V1 audit shows a genuinely distinct identifier concept (Maintenance's category/set grouping, Camera's batch) — kept as-is since these are already clear and there's no reason to rename working conventions for their own sake. Query params reserved for **view state**, not resource identity: `?tab=`, `?page=`, `?q=`, `?month=` — never `?id=` in place of a path segment.

**`/api/*` route handlers:** `/tms-v2` reuses the *existing* `/api/admin/fmcsa`, `/api/admin/dispatch/geo`, `/api/admin/dispatch/cities` endpoints as-is (they're stateless, admin-domain-agnostic lookups — FMCSA/geocoding — with no `/admin`-specific business logic in them per the audit's description) rather than duplicating them under `/api/tms-v2/*`. If the audit's flagged follow-up read of those three handlers (audit §31, "needs a follow-up read") surfaces admin-specific coupling once actually opened, they get factored into a shared `/api/lookup/*` location at that point — noted here as a known open question, not resolved by this document, since it requires reading code this document's no-code constraint doesn't cover.

---

## 6. State management strategy

**Decision: Server Components + Server Actions first, by default, for everything.** Client-side state is scoped narrowly to the specific interaction patterns that need it, not adopted as an app-wide layer.

| Need | Approach | Why |
|---|---|---|
| Page data | RSC fetch in `page.tsx` via `lib/data/*` | No client-side data-fetching library (no SWR/React Query) — Next 16's server-first model plus this app's genuinely low concurrent-user count (one operator) means client-cache invalidation machinery would be solving a problem this app doesn't have. `/admin` doesn't use one today either; no finding in the audit points at this as a gap. |
| Mutations | Server Actions, colocated in `src/actions/tms-v2/*.ts` | Matches `/admin`'s existing pattern exactly (one action file per entity) — kept because it works, not reinvented. |
| Revalidation | `revalidatePath()` per action, targeted at the specific paths that read the mutated data — enumerated explicitly per action, same as V1 | V1 already does this correctly (e.g. Settings' fuel-update action revalidates the 4-5 downstream paths that depend on it); the fix needed here is narrowing *what* gets revalidated as query scoping improves (§3c), not changing the mechanism. |
| Optimistic UI | React 19's `useOptimistic` for one-tap actions (mark paid, dismiss alert, advance status) per `v2-design.md`'s Motion & feedback section | React 19 (already the repo's pinned version) ships this hook natively — no external library needed for the exact "row updates immediately, rolls back on real failure" pattern the design doc specifies. |
| URL state | `searchParams` for `?tab=`, `?page=`, `?q=`, `?month=` — read directly in the Server Component, no client router-state duplication | Keeps every list/tab page deep-linkable and server-renderable on first load, matching Operations' existing `?tab=` pattern (kept, not replaced). |
| Local UI-only state | `useState` inside the specific client component that needs it (inline-edit's in-progress value, command palette's open/closed, a form's in-progress draft before submit) | Scoped narrowly — never lifted to a global store, since nothing in this app's interaction model needs cross-component client state that isn't either server state (→ Server Action + revalidate) or URL state (→ searchParams). |
| Forms | Server Actions with `useActionState` (React 19) for inline validation/error surfacing | Replaces V1's plain-`<form action={...}>`-with-no-inline-validation pattern flagged on Settings (audit §24) — one form-handling convention used everywhere, including the pages V1 got wrong, not just the ones V1 already got right (the Dashboard's countdown forms). |
| Demo mode | Resolved once at the `(authed)/layout.tsx` boundary, passed via the `DataSource` (§10) — not React Context for the *data*, since data flows through `lib/data/*` regardless | Context is used only if a client component genuinely needs to know "is demo mode on" for UI purposes (the persistent banner) — a thin `DemoModeContext` for that display concern only, separate from and much smaller in scope than the `DataSource` mechanism. |

**Caching:** Next 16's request-level fetch/data caching is applied per-query in `lib/data/*`, not per-page — a query that's genuinely fine to be briefly stale (Dashboard's notification set, per `v2-design.md`'s explicit "one scheduled/materialized pass or short-TTL cache" callout replacing V1's 16-query-per-visit fan-out) gets a short revalidate window; a query that must reflect the latest write (Load Detail immediately after a mark-paid action) does not. This is a per-function decision documented at the call site (a one-line comment stating the staleness tolerance and why), not a blanket `force-dynamic` on every page as V1 does today.

---

## 7. Auth — inheriting the existing admin session

**Decision: `/tms-v2` uses the exact same authentication/session as `/admin`. Same Supabase Auth session, same `ADMIN_EMAIL` allowlist, same cookies. A user logged into `/admin` is already logged into `/tms-v2` and vice versa — there is no second login screen, no second session, no second cookie.**

**How this is implemented, concretely:**

1. **Middleware matcher extended, not duplicated.** `src/middleware.ts`'s existing admin-gate block (the `getUser()` + `ADMIN_EMAIL` compare + `x-admin-user-*` header-forwarding logic already in place, lines ~150-217 today) is reused for `/tms-v2/:path*` by adding it to the same matcher array and routing it through the *same* gate function the `/admin` branch already calls — not a copy-pasted second gate. Concretely: the inline logic currently living directly in the `/admin` branch of `middleware()` gets extracted into one shared `adminSessionGate(request)` helper, called from both the `/admin` and `/tms-v2` branches. This is a **refactor of existing middleware code**, not new auth logic — the audit found this gate to be correct and appropriately scoped for a single-admin app (PRD's "preserve what's working" list doesn't call it out as needing a rebuild), so `/tms-v2` inherits it rather than reinventing it.
2. **Server-side gates reused directly, not reimplemented.** `/tms-v2`'s `(authed)/layout.tsx` calls the *existing* `adminFromMiddleware()` from `src/lib/admin/auth.ts` (§1's table already confirms this file is reused as-is), exactly as `/admin`'s own layout does. `src/lib/auth/session.ts` (§4) is a thin re-export, not a new implementation — its only job is giving `/tms-v2` code a route-group-appropriate import path without duplicating logic.
3. **Same cookies, same remember-me behavior.** Because the session is the literal same Supabase Auth session (not a second one issued for a second gate), `/tms-v2` automatically inherits the `hb-persist` remember-me cookie behavior and the recently-fixed `@supabase/ssr` `Max-Age` workaround — there is nothing route-group-specific to configure.
4. **No second login page.** `/tms-v2` has no `/tms-v2/login` route. If middleware finds no valid session, it redirects to the *existing* `/admin/login` (not a new `/tms-v2/login`) — one login screen for the whole authed surface of the product, matching the "single door" framing `v2-design.md`'s Login section already establishes. This also means `/tms-v2`'s login experience gets any future login-page fixes (e.g. the `v2-design.md`-proposed autofill/rate-limiting improvements) "for free" the moment they land, without a second implementation to keep in sync.
5. **Customer-facing token routes stay their own boundary, unchanged.** The `(public)` route group (§5) for shipper-facing confirm pages uses the *same* two independent token-resolution functions V1 already has (`resolveByToken()`/`resolveByConfirmationToken()`, audit §14) — this trust boundary is deliberately separate from `ADMIN_EMAIL` auth in V1 today and stays separate in `/tms-v2`; nothing here changes that design, which the audit found to be correct.

**Why reuse instead of rebuilding a `/tms-v2`-specific auth layer:** the architecture contract's explicit requirement ("login is identical — same gate/cookie") rules out a second auth system on its face, but even absent that constraint, the audit's own findings support this call: `/admin`'s auth model earns a spot on PRD priority #9's "preserve what's working" list. A rebuild's job is to fix what's broken, and this isn't. The one genuine, audit-flagged gap — `/admin/update-password`'s reliance on email-match rather than recovery-session-type, which only works today because there's exactly one valid admin account (audit §26) — is fixed once, in the shared gate, and both `/admin` and `/tms-v2` inherit the fix simultaneously, rather than needing the same fix applied twice.

---

## 8. Naming conventions & coding standards

**Files & components:**
- React components: `PascalCase.tsx` (`LoadCard.tsx`, `DataList.tsx`).
- Non-component modules: `kebab-case.ts` (`load-net.ts` — actually named `money.ts` per §3, illustrating the rule: name the *concept*, not the *mechanism*) or `camelCase.ts` where the module is a single default export matching a function name; this repo already mixes both in `/admin`'s `lib/`, so `/tms-v2` picks **one** rule going forward rather than inheriting the mix: **`kebab-case.ts` for all non-component files**, no exceptions, so a filename never requires knowing the export shape to guess its case.
- Route segment folders: lowercase, hyphenated where multi-word (`load-inquiry/`, matching V1's existing `email-broker` → renamed per `v2-design.md`'s own page-11 naming, "Load Inquiry").
- Test files: colocated `*.test.ts` next to the module under test (matches V1's existing `fuel.test.ts`, `goal-month.test.ts` pattern — kept, it already works).

**Server Actions:** one file per entity in `src/actions/tms-v2/`, exported functions are verb-first and state the effect, not the mechanism — `markLoadPaid`, not `updatePaymentStatus`; `advanceLeadStatus`, not `patchQuoteRequest`. Every mutating action's **first statement** resolves its `DataSource` from context (§10) — there is no separate "call `blockedByDemo()` as line one" convention to remember, because the demo check is inside the `DataSource` itself, not the action (this is the concrete mechanism behind §10's structural-enforcement claim).

**Types:** domain types live beside the domain logic that owns them (`lib/domain/money.ts` exports `Money`, `LoadFinancials`; `lib/data/loads.ts` exports `LoadWithFinancials`, `Paginated<T>`) — no single `types.ts` grab-bag file, which is how V1 ended up with `accessorials` shaped twice with no shared type (audit §14) in the first place.

**Server actions vs. route handlers:** Server Actions for every mutation reachable from a `/tms-v2` page. Route handlers (`route.ts`) reserved for: (a) the reused external-lookup endpoints (§5), (b) anything that must return a non-HTML/non-RSC payload (PDF bytes, ZIP export, the audit-view "replay exact sent bytes" routes — ported from V1's existing pattern, which the audit found to be a genuinely sound design worth keeping), (c) anywhere Next's Server Action body-size/timeout characteristics are a poor fit (large file upload URL minting already uses signed-URL-then-direct-to-Storage in V1, kept as-is).

---

## 9. House rules (non-negotiable, lint/review-enforced)

These are `v2-design.md`'s stated non-negotiables, restated here as *enforcement mechanisms* rather than design intent, since a design doc says what must be true and an architecture doc says how the codebase makes it stay true.

1. **No faint grey text.** `--fg-muted`/`--fg-subtle` are contrast-checked tokens (already defined in `globals.css`'s existing `@theme inline` block, §1), not arbitrary opacity. A PR introducing a literal `text-gray-400`, `opacity-50` on body text, or any color value outside the token set is a review-blocking finding, not a style preference — this is the exact failure mode the design doc calls out by name.
2. **CST labeling, always, via one helper.** `<DateTime>` (§2) is the only sanctioned way to render a date/time in `/tms-v2`. A raw `Date`/`toLocaleString()`/`new Intl.DateTimeFormat()` call outside `lib/domain/dates.ts` is a review-blocking finding. This directly ports `/crm`'s already-shipped `formatCentral()`/"CST" convention (per project memory: CRM Central time + CST labels, commit `d0c0f6c`) into `/tms-v2` rather than reinventing a third date-formatting approach across the codebase's three route groups.
3. **Semantic color only.** `--positive`/`--negative`/`--warning`/`--accent` map to fixed meanings (net-positive/cash-in, spend/destructive/overdue, needs-attention, primary-action-only) per `v2-design.md`'s Color table — never repurposed for decoration. Enforced by code review against that table, since a lint rule can't distinguish "this red button is destructive" from "this red button just looks nice here."
4. **Calm, hairline-first structure.** Cards reserved for discrete objects, not page sections (§2's `<Card>` contract) — a page section wrapped in a shadowed card box where a hairline-separated `<DataList>`/flat row would do is a review finding, per the design doc's explicit critique of V1's three-collapsible-cards Load Detail pattern.
5. **One list primitive, no bespoke tables.** Any new sortable/paginated list is a `<DataList>` usage, full stop — a hand-built `<table>` for record-list data (as opposed to genuinely one-off tabular data, §2) is a review finding.
6. **Money only through the engine.** Enforced structurally per §3a (the type boundary), backstopped by review for the cases TypeScript alone can't catch (e.g. someone re-deriving a percentage inline that happens not to touch a raw column name).

---

## 10. Demo-mode isolation, structurally enforced

**Decision: every data access in `/tms-v2` goes through a single `DataSource` interface, resolved once per request from `isDemoMode()`, and passed down via a request-scoped context. No page, component, Server Action, or `lib/data/*` function ever imports a Supabase client directly.**

```ts
// lib/demo/data-source.ts
export interface DataSource {
  listLoads(opts: ListLoadsOptions): Promise<Paginated<LoadWithFinancials>>;
  getLoadById(id: string): Promise<LoadWithFinancials | null>;
  markLoadPaid(id: string, amount: Money, paidAt: Date): Promise<Result<void>>;
  // ... one method per lib/data/* function, same names — DataSource IS the
  // typed surface lib/data/*.ts exports; the module-level functions are thin
  // wrappers that resolve the current DataSource and delegate.
}
```

```ts
// lib/demo/live-data-source.ts — wraps createServiceRoleClient(), real reads/writes
// lib/demo/demo-data-source.ts — reads DEMO_DATASET (curated, in-memory, run
//                                 through the SAME lib/domain/money.ts helpers
//                                 real data uses, per v2-design.md's Demo mode
//                                 section — demo numbers agree across screens
//                                 exactly like real numbers do); every mutating
//                                 method is a no-op that returns a benign
//                                 success-shaped Result, matching V1's
//                                 blockedByDemo() return contract.
```

```ts
// lib/demo/resolve.ts — called ONCE, in (authed)/layout.tsx
export async function resolveDataSource(): Promise<DataSource> {
  return (await isDemoMode()) ? demoDataSource : liveDataSource;
}
```

The resolved `DataSource` is passed down via a request-scoped mechanism (a React `cache()`-wrapped resolver so every `lib/data/*` call within the same request tree resolves the identical instance without prop-drilling it through every component) — pages and actions call the *module-level* functions in `lib/data/loads.ts` etc. (keeping call sites simple: `import { markLoadPaid } from "@/lib/data/loads"`), and those module-level functions are the only code that touches the resolved `DataSource` internally.

**Why this is a structural fix, not a rebrand of `blockedByDemo()`:** V1's model is *literally correct* today — the audit confirms 100% compliance across every audited action — but the enforcement mechanism is "the author remembers to write one specific line first," which has no backstop if a future action is written without it (audit's own words: "nothing in the type system or build process would catch the omission"). The `DataSource` interface changes what "forgetting" would even look like: a new Server Action that wants to touch `loads` has *no other way in* except calling a `lib/data/loads.ts` function, which internally always resolves through `DataSource` — there is no `createServiceRoleClient()` import available to reach for by mistake, because no file outside `live-data-source.ts` imports it. The convention becomes physically the only path, not the recommended one.

**Cost/tradeoff acknowledged:** this adds one interface-implementation layer between "I want to read loads" and "here's a Supabase query," which is more ceremony than V1's direct-import pattern for a one-developer, one-operator app. The architecture accepts this cost because it's the exact mechanism the owner's explicitly-stated #1 requirement for demo mode ("two separate pipes that cannot cross," `v2-design.md`) calls for, and because §3c's pagination contract and §3a's money-engine boundary are naturally expressed as part of the same interface — this isn't three separate abstraction layers, it's one `DataSource` boundary that happens to solve three PRD priorities (money correctness, query scoping, demo isolation) at once because they were all, structurally, the same underlying problem: *nothing stopped a file from reaching around the intended chokepoint.*

**Demo dataset generation (`lib/demo/demo-dataset.ts`):** ported from V1's `src/lib/demo/demoData.ts` — hand-curated, generated relative to "now" so it stays evergreen, `.example` domains for fake brokers. The *content* strategy is unchanged (V1's approach here is sound, per PRD #9's "preserve what's working" list); only the *plumbing* around it (how it's reached, §10 above) changes.

---

## 11. Testing strategy

**Unit tests — domain engines, mandatory, colocated (`lib/domain/*.test.ts`, `lib/data/*.test.ts` for pure query-shape logic where feasible without a live DB):**
- `money.test.ts` — every `computeLoadNet`/`computeTripNet` branch, explicitly including the TONU cases across factoring-on/factoring-off brokers (this is the exact bug surface the audit found; the test suite's job is making that bug's five old manifestations each a named, permanent regression test — "TONU net matches across Board/Detail/Trip/Calendar/Performance" as one parameterized test run against all five call sites, not five independent hand-checks).
- `attribution.test.ts`, `dates.test.ts` (CST formatting, DST edges), `status.test.ts` (odometer-driven status derivation, ported from V1's already-tested logic).
- `notifications.test.ts` — each rule's threshold logic (stale-quote days, overdue-receivable threshold, maintenance-due), ported from V1's `alerts.ts`/`urgency.ts` test coverage where it exists, backfilled where the audit notes it doesn't.

This mirrors V1's own testing pattern, which the audit confirms is "consistently applied to money-math and parsing logic specifically" — `/tms-v2` keeps that discipline and *extends its surface area*, since more logic now lives in dedicated `lib/domain` modules than was previously scattered across page-local functions, so there's more to test, not a new testing philosophy to adopt.

**Data-layer tests:** `lib/data/*` functions are integration-tested against a Supabase local/test project where feasible (pagination contract — does `listLoads({page:2, pageSize:20})` actually return rows 21-40 and a correct `totalCount`), not mocked — the audit's PRD priority #3 (schema must be pulled from the live DB before this work starts) applies directly here: these tests are only meaningful once the real column shapes for `loads`/`brokers`/`trips`/etc. are confirmed, since (per audit §28) those tables have no tracked migration history to test against otherwise.

**Component tests:** primitives (`<DataList>`, `<Money>`, `<StatusPill>`) get focused unit tests for their pure logic (sort comparator, pagination math, status→color resolution) via Vitest + React Testing Library — not full-page integration tests, which are deferred to manual verification per page during implementation (this document is architecture-only; actual page-by-page manual QA happens when each page is built, following the existing repo convention of no e2e suite, which the audit notes as an accepted gap for a single-operator tool, not one this rebuild is scoped to close).

**Build/typecheck gates:** `tsc --noEmit` and `next build` both clean, `vitest run` passing, as the baseline CI-equivalent bar for any `/tms-v2` PR — matching the existing `package.json` scripts (`typecheck`, `test`, `build`) already in place; no new tooling introduced.

---

## 12. Promotion path: `/tms-v2` → `/portal`

Not required by this document's scope, but stated because §4's folder decision and §7's shared-auth decision were both made *in service of* this eventually being cheap:

1. Rename `src/app/tms-v2` → `src/app/portal` (or an equivalent route-group move).
2. Update the middleware matcher (§7) from `/tms-v2/:path*` to `/portal/:path*`.
3. Update `nav.config.ts` hrefs (§2/§4) — one file, one edit, every nav surface (desktop sidebar, mobile bottom nav, More sheet, command palette) picks it up automatically by construction.
4. No data-layer, auth, or component change required — `lib/data`, `lib/domain`, `lib/demo`, `components/ui`, `components/domain` are already route-group-agnostic (§4).
5. `/admin` is retired or kept read-only/redirect-shimmed at that point — an explicit, separate decision outside this document's scope, made once `/tms-v2` has been used in place of `/admin` for real day-to-day operation long enough to trust it.
