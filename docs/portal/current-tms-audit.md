# Current TMS Audit — the existing `/admin` application

**Purpose of this document:** an exhaustive, code-grounded audit of the existing admin TMS (`src/app/admin/**`) as it stands today, produced ahead of the `/portal` rebuild. This is read-only documentation — no application behavior described here has been changed as part of producing this doc. The `/crm` module ("Hello Hotshot") is a separate product built on a different auth/data model; it is noted where relevant but not audited in depth.

**Methodology:** produced by direct reading of the application source (`src/app/admin/**`, `src/lib/**`) and all 51 files under `supabase/migrations/*.sql`, using parallel research passes per module cluster, each grounded in real file paths, table names, and column names. Anything not directly verified in code is marked **unverified**. A small number of very large files (the quote-detail action files, ~1,200–1,800 lines each) were inventoried by function signature rather than read line-by-line; those spots are called out explicitly rather than glossed over.

---

## Table of contents

1. [Auth, permissions & demo-mode model](#1-auth-permissions--demo-mode-model)
2. [Dashboard (`/admin`)](#2-dashboard-admin)
3. [Load Board (`/admin/dispatch/loads`)](#3-load-board-admindispatchloads)
4. [Load detail (`/admin/dispatch/loads/[id]`)](#4-load-detail-admindispatchloadsid)
5. [Trips list (`/admin/dispatch/trips`)](#5-trips-list-admindispatchtrips)
6. [Trip detail (`/admin/dispatch/trips/[id]`)](#6-trip-detail-admindispatchtripsid)
7. [Calendar (`/admin/calendar`)](#7-calendar-admincalendar)
8. [Brokers (`/admin/dispatch/brokers`, `/new`, `/quick-add`, `/[id]`)](#8-brokers-admindispatchbrokers-new-quick-add-id)
9. [Email Broker / Load Inquiry (`/admin/dispatch/email-broker`)](#9-email-broker--load-inquiry-admindispatchemail-broker)
10. [Reach / Send Backhaul (`/admin/dispatch/reach`)](#10-reach--send-backhaul-admindispatchreach)
11. [Email Previews (`/admin/previews`, `/admin/previews-2`)](#11-email-previews-adminpreviews-adminpreviews-2)
12. [Operations hub (`/admin/operations`) — Quotes / Applications / Accounting](#12-operations-hub-adminoperations--quotes--applications--accounting)
13. [Quote detail workspace (`/admin/quotes/[id]`)](#13-quote-detail-workspace-adminquotesid)
14. [BOL generation & signature pipeline](#14-bol-generation--signature-pipeline)
15. [Applications (`/admin/applications/[id]`, `/trash`)](#15-applications-adminapplicationsid-trash)
16. [Quotes trash (`/admin/quotes/trash`)](#16-quotes-trash-adminquotestrash)
17. [Receivables (`/admin/dispatch/receivables`)](#17-receivables-admindispatchreceivables)
18. [Expenses (`/admin/expenses`)](#18-expenses-adminexpenses)
19. [Accounting (`/admin/accounting` → Operations tab)](#19-accounting-adminaccounting--operations-tab)
20. [Performance (`/admin/performance`)](#20-performance-adminperformance)
21. [Maintenance / Repairs (`/admin/maintenance/**`)](#21-maintenance--repairs-adminmaintenance)
22. [Files (`/admin/files`)](#22-files-adminfiles)
23. [Camera (`/admin/camera/**`)](#23-camera-admincamera)
24. [Settings (`/admin/settings`)](#24-settings-adminsettings)
25. [Demo mode](#25-demo-mode)
26. [Auth pages: login, logout, reset/update password](#26-auth-pages-login-logout-resetupdate-password)
27. [Shell / navigation chrome](#27-shell--navigation-chrome)
28. [Data model — table by table](#28-data-model--table-by-table)
29. [Modal inventory](#29-modal-inventory)
30. [Form inventory](#30-form-inventory)
31. [Server action / API route inventory](#31-server-action--api-route-inventory)
32. [Cross-cutting findings](#32-cross-cutting-findings)

---

## 1. Auth, permissions & demo-mode model

**Single-operator, single-allowlist auth — no roles, no per-row permissions.**

- **Gate:** `src/middleware.ts` matches `/admin/:path*` and `/crm/:path*`. For `/admin/**`, it runs `supabase.auth.getUser()` on every request and requires `user.email === process.env.ADMIN_EMAIL`. Anyone authenticated but not matching `ADMIN_EMAIL` is signed out and redirected to `/admin/login?error=not_authorized`. Public admin sub-paths (bypass the gate): `/admin/login`, `/admin/reset-password` only — **not** `/admin/update-password`, which instead relies on an active Supabase recovery session (see §26 for the associated edge case).
- On success, the middleware forwards verified identity as request headers (`x-admin-user-id`, `x-admin-user-email`) to downstream server components.
- **Two parallel server-side gate functions** exist in `src/lib/admin/auth.ts`:
  - `requireAdmin()` — full re-check (`getUser()` + email compare), used by pages that want defense-in-depth (e.g. Settings) or that sit outside guaranteed middleware coverage (e.g. the Camera export `route.ts` handlers, which are raw route handlers, not React pages under the `(authed)` layout).
  - `adminFromMiddleware()` — trusts the `x-admin-user-*` headers already verified by the middleware; used by the `(authed)` layout itself to avoid a second round-trip auth check on every page.
- **No roles/permissions table, no RLS-based authorization** for the admin app. Every admin-side Supabase read/write goes through `createServiceRoleClient()` (service-role key, bypasses RLS entirely). Authorization is 100% enforced by the Next.js server-action/middleware layer sitting in front of an otherwise-unrestricted service-role client — see §28's RLS posture note.
- **Remember-me / session persistence:** a non-HttpOnly `hb-persist` cookie (`1`/`0`) tells the middleware whether to strip `Max-Age`/`Expires` from the Supabase auth cookies on refresh, because `@supabase/ssr` hardcodes a long `Max-Age` and ignores `cookieOptions.maxAge` — a documented workaround for a library limitation, implemented in two places (client cookie rewrite in `LoginForm.tsx` + middleware-side option strip) that must stay in sync.
- **Client-side login lockout** (5 attempts / 60s cooldown, `localStorage`-based) is explicitly a UX guard only, not real brute-force protection — trivially bypassed by clearing storage. Real protection is Supabase Auth's own server-side rate limiting.
- **`/crm` has a completely independent auth boundary** (`crmGate()` in the same middleware file) — no shared allowlist, no shared state with `/admin`. Out of scope for this audit beyond noting its existence.

**Demo mode** (full detail in §25) is the other half of the permission story: a cookie-gated (`hb-demo`), convention-enforced (not framework-enforced) isolation switch that swaps every page's real Supabase reads for a static in-memory dataset, and requires every mutating server action to call `blockedByDemo()` as its first statement. There is no structural guarantee (e.g. a wrapper/middleware that intercepts all server actions) that a newly-written action includes this guard — it depends entirely on the author remembering the convention. Every action audited across all clusters in this document was found to correctly include the guard, with one intentional, documented exception (`setDemoMode` itself, which must work while demo mode is on so it can be turned off).

---

## 2. Dashboard (`/admin`)

**Files:** `src/app/admin/(authed)/page.tsx` (`dynamic = "force-dynamic"`), `DashboardView.tsx`, `AlertsPanel.tsx`, `CountdownCards.tsx`, `FarmBrokerContactCard.tsx`, `SectionTabs.tsx`, `alert-actions.ts`, `countdown-actions.ts`, `farm-contact-actions.ts`; supporting: `src/lib/dispatch/dashboard-view.ts`, `alerts.ts`, `countdown.ts`.

**Purpose:** the owner's daily "opportunity inbox" — a top "Needs attention" alert bar, active loads with inline document/odometer actions, an empty-truck nudge to farm a broker contact, a countdown-goal progress widget, a two-item truck-maintenance mini-widget, and expired quotes.

**Users:** sole owner-operator; no role distinctions anywhere in the app.

**Inputs:** swipe/tap to dismiss+undo alerts; tap-through links; inline odometer entry; inline document upload; countdown CRUD forms; current-cash inline edit; Farm-a-Broker-Contact modal (MC lookup, city typeahead, contact fields).

**Outputs:** full-page render of every section above, no pagination.

**Database Tables:** `applications`, `quote_requests` (new-lead/new-quote alert sources), `loads` (active loads, odometer aggregate, receivables/incomplete/net-pace pulls), `brokers`, `repair_reminders` + `repair_entries` + `repair_services` (maintenance widget), `countdown_goals`, `dispatch_settings` (fuel/factoring/current-cash singleton, `id = true`), `load_expenses`, `load_documents`, `recurring_expenses` + `expense_accounts` (incomplete-expense alerts), `dismissed_alerts` (reads/writes tolerate a missing table — see design note in §28).

**API Calls:** `dismissAlert`/`restoreAlert` (`alert-actions.ts`), `createCountdownGoal`/`updateCountdownGoal`/`deleteCountdownGoal`/`updateCurrentCash` (`countdown-actions.ts`), `farmBrokerContact` (`farm-contact-actions.ts`), plus `GET /api/admin/fmcsa?mc=`, `GET /api/admin/dispatch/cities?q=` used by the Farm Contact modal.

**Business Logic:**
- "New" application = active + created within 24h; "new" quote = active + `lead_status = 'new'`.
- Net-pace window is a trailing-12-week rolling window of delivered loads, used for the countdown widget's "loads needed"/"weekly pace" math.
- Maintenance widget hardcodes exactly two reminder names ("Engine oil & filter", "Fuel filters"); the full Alerts panel considers every active reminder.
- Overdue-receivable threshold is a fixed 40 days past delivery (fallback pickup date).
- Alert dismissal keys are stable-but-scoped-to-occurrence (e.g. include `lastOdo`/`status` for maintenance, the sorted gap list for incomplete-expense alerts) so a new occurrence re-surfaces even if the prior one was dismissed.
- Countdown time-progress = `(today − created) / (target − created)`, clamped 0–100.

**Weaknesses:**
- `src/lib/dispatch/dashboard-view.ts` appears to be **dead code** for this page — the live dashboard uses `src/lib/dispatch/alerts.ts` instead; `dashboard-view.ts` is referenced only from `src/lib/dispatch/pipeline.ts`. Two parallel "urgency" vocabularies exist in the codebase (`UrgencyChipKind` for the quote pipeline vs. `AlertGroupKey` for the dashboard) — worth reconciling in the rebuild.
- `load_documents` is fetched **globally, unfiltered** on every dashboard load, justified in-code as "a handful of rows for a one-truck operation" — will not hold up if load volume grows.
- 16 parallel Supabase queries plus a conditional two-hop maintenance follow-up fire on every single dashboard visit (`force-dynamic`, zero caching).

**UX Problems:** alert panel expand/collapse state is deliberately not persisted (so new alerts aren't hidden), meaning every visit starts collapsed. Countdown modals intentionally break from the app's dark theme (documented as intentional).

**Performance Issues:** full re-run of the entire query fan-out on every navigation to `/admin`, including from the bottom-nav Dashboard tab; the maintenance sub-query is a second sequential round-trip after the main `Promise.all`.

**Scalability Issues:** delivered-loads query for net-pace/receivables/incomplete has no row limit; everything is computed in Node rather than SQL.

**Security Concerns:** standard service-role-client pattern (no per-row auth beyond the code itself); all mutating actions in scope correctly call `blockedByDemo()`.

**Opportunities:** materialize the alert-group union as a SQL view; consider ISR/short revalidate instead of `force-dynamic`; remove `dashboard-view.ts` if confirmed dead.

---

## 3. Load Board (`/admin/dispatch/loads`)

**Files:** `page.tsx`, `LoadBoardView.tsx`, `AddLoadButton.tsx`, `AddLoadModal.tsx`, `BolScanner.tsx`, `actions.ts`, `board/{BoardHeader,KpiGrid,LoadCard,OverviewSection,PerformanceCard,icons,shared}.tsx`.

**Purpose:** carrier-side ledger of every load — rate, miles, deadhead, fuel/factoring/expense costs, resulting net — with a monthly KPI/goal strip and an all-time A/R figure.

**Users:** sole operator/dispatcher.

**Inputs:** month dropdown (client-side slice of a fully-fetched dataset), free-text search, delete-select mode, CSV export.

**Outputs:** load cards, six KPI cards, monthly performance card, CSV download.

**Database Tables:** `loads` (full non-deleted set), `dispatch_settings`, `load_expenses` (fetched **unfiltered, whole table**, then grouped in memory), `brokers` (factoring-flag set + full name list for the Add-Load datalist), `trips` (via `fetchOpenTripNames`).

**API Calls:** `softDeleteLoads` (bulk), `createLoad`/`updateLoad` (via `AddLoadModal`), plus `GET /api/admin/dispatch/geo` (lane miles / ZIP resolve) and `GET /api/admin/fmcsa` (broker lookup) called from the Add/Edit Load modal.

**Business Logic:**
- Month attribution uses `goalMonthParts(closeOutDate(load))`, resolved in America/Chicago — not raw calendar month of any single date.
- A/R total is **all-time**, not month-scoped: sum of `rate` across every delivered+unpaid load.
- Factoring only applies if the load's broker has `brokers.factoring = true`.
- **A verified, reproducible business-logic bug:** TONU-load net profit is computed differently across four different screens. On the Load Board, a TONU'd load's net = its raw `tonu_amount` fee, with **no** fuel/factoring/expense deduction at all. On Load Detail, the same fee is run through the full `loadNet()` pipeline (so it *is* discounted by factoring, if the broker factors). On the Trip rollup, TONU loads are excluded from `live` loads entirely — contributing **$0**, not even the fee. On the Calendar, TONU loads also show **$0** net. The same $150 TONU fee can therefore read as $150, a lower number, or $0 depending which screen the operator is looking at. Root cause: `loadNet()`/`loadDiesel()` (`src/lib/dispatch/fuel.ts`) is the single canonical costing function, but not every caller routes TONU loads through it consistently.
- Related: the user's own working assumption that "TONU factoring is 3% unconditional" is only partially accurate — `FUEL_DEFAULTS.factoringPct = 3` is merely the *default* value for the editable `dispatch_settings.factoring_pct`, and factoring is **never** unconditional; it always gates on the specific broker's `factoring` flag. Whether it's even applied to a TONU fee depends on which of the four screens above is being viewed (Performance, audited separately in §20, hardcodes factoring `true` for TONU loads regardless of broker flag — a fifth distinct treatment).

**Weaknesses:** `load_expenses` fetched unfiltered on every board load; no server-side month filtering (ships all history to the client); `force-dynamic` disables all caching.

**UX Problems:** month-default relies on a server-resolved "business date" pattern repeated ad hoc across several files rather than centralized.

**Performance Issues:** 5+ Supabase reads per page load, one of them a full-table scan.

**Scalability Issues:** no pagination or virtualization on the load list or CSV export.

**Security Concerns:** standard service-role pattern; no route-level authorization beyond the shared layout gate.

**Opportunities:** server-side month filtering; reconcile the TONU net calculation into one shared code path used identically everywhere.

---

## 4. Load detail (`/admin/dispatch/loads/[id]`)

**Files:** `page.tsx`, `AddExpenseDialog.tsx`, `BolSigner.tsx`, `CancelLoadButton.tsx`, `DeleteLoadButton.tsx`, `DocumentsCard.tsx`, `EditLoadButton.tsx`, `FinancialsPanel.tsx`, `LoadDetailsCard.tsx`, `LoadPnlCard.tsx`, `OdometerStatusCard.tsx`.

**Purpose:** one load's full financial and operational record.

**Users:** sole operator.

**Inputs:** Edit / TONU / Delete command-bar buttons; three independently-collapsible cards (Load details, Odometer & status, Financials), each with its own inline edit form; document uploader/scanner/signer.

**Outputs:** command-bar KPI tiles (Revenue/Net/Total mi/Deadhead), Load details card, Odometer & status card, Financials (P&L) panel, Documents card.

**Database Tables:** `loads`, `dispatch_settings`, `load_expenses` (this load's rows, plus a full-table category datalist), `load_documents`, `bol_signatures`, `brokers`, `trips`; storage bucket `load-documents` via signed URLs.

**API Calls (all `loads/actions.ts`):** `createLoad`, `updateLoad`, `updateLoadStatus`, `updateLoadOdometers` (typed error-result, not throw), `updateLoadDetails` (pickup/delivery date + load # only — deliberately narrow), `addLoadExpense`, `deleteLoadExpense`, `cancelLoad` (mode `tonu` default-$150 or `cancel` $0), `createLoadDocUploadUrl`, `recordLoadDocuments`, `deleteLoadDocument`, `signBolRole`, `deleteLoad` (soft), `markLoadPaid`, `markLoadUnpaid`, plus board-shared `softDeleteLoads`.

**Business Logic:**
- **There is no independent status dropdown** — status is entirely derived from which odometer readings are present (`delivered > loaded > assigned > pending`); entering an odometer reading *is* the status change. A TONU'd load is never reverted by an odometer edit.
- Odometer readings must be monotonic (assigned ≤ loaded ≤ delivered); violations return a typed `{ok:false, reason}` rather than throwing.
- BOL signing never overwrites the original document — each role's (`receiver`/`carrier`) signature is upserted into `bol_signatures` keyed `(doc_id, role)`, and a fresh "— signed.pdf" is regenerated from the original + all current signatures on every save, so signing one role never disturbs the other.
- Document naming is canonicalized centrally (`doc-name.ts`) and reused at both display- and write-time.

**Weaknesses:** same TONU-net inconsistency as §3 (here the fee *is* discounted by factoring, unlike the Board). BOL signing lazily imports `pdf-lib`/`sharp` specifically because of a past production regression (referenced by commit in code comments) — a historically fragile code path.

**UX Problems:** three separately-collapsible cards each with their own edit toggle, no unified "edit mode." TONU dialog defaults to a pre-filled $150 fee, easy to submit without adjusting.

**Performance Issues:** signed URLs (1hr TTL) are re-minted for every document on every page visit regardless of whether anything changed.

**Scalability Issues:** no pagination on expenses/documents (low risk at current per-load volumes).

**Security Concerns:** `window.confirm()` is the only delete guard; standard service-role pattern otherwise.

**Opportunities:** unify TONU-net handling with the Board and Trip/Calendar screens; consider a single unified edit mode.

---

## 5. Trips list (`/admin/dispatch/trips`)

**Files:** `page.tsx`, `TripsListView.tsx`, `NewTripButton.tsx`, `TripDateTimeFields.tsx`, `actions.ts`.

**Purpose:** groups loads into an out-and-back "trip" and tracks per-trip profitability.

**Users:** sole operator.

**Inputs:** delete-select mode, "New Trip" button.

**Outputs:** KPI strip (Active Trips, Gross/Net this month, Avg Profit %), dense zebra table (desktop) / stacked cards (mobile) for Active and Closed trips.

**Database Tables:** `trips`, `loads` (filtered `trip_id not null`), `dispatch_settings`, `brokers` (factoring flag), `load_expenses` (filtered `.in("load_id", loadIds)`).

**API Calls:** `softDeleteTrips` (bulk); row click is a client-side `router.push`, not a `<Link>`.

**Business Logic:** all financial figures come from the single shared `computeTripFinancials()` rollup (`src/lib/dispatch/trip-rollup.ts`), guaranteeing list/detail agreement. KPI-strip Gross/Net are scoped to the current calendar month, computed **client-side** over the entire fetched trip history. Margin tone (red/amber/green) is a pure display heuristic, not stored.

**Weaknesses:** month-KPI scoping is entirely client-side over an unbounded dataset — every trip in history ships to the browser to compute a one-month aggregate.

**UX Problems:** desktop table and mobile card view are two fully separate render paths (doubles JSX maintenance surface).

**Performance/Scalability Issues:** fetches all trips + all linked loads + all their expenses on every page load, no date-range limit.

**Security Concerns:** standard service-role pattern.

**Opportunities:** push month-KPI aggregation server-side; add search/filter as trip count grows.

---

## 6. Trip detail (`/admin/dispatch/trips/[id]`)

**Files:** `page.tsx`, `EditTripButton.tsx`, `TripLoadsList.tsx`.

**Purpose:** one trip's full P&L — hero net-profit figure, Money/Miles breakdowns, odometer bookends, notes, linked loads.

**Users:** sole operator.

**Inputs:** Edit (name/status/notes/dates + delete), Reopen (closed trips), odometer start/end form, "Mark paid" on linked loads.

**Outputs:** hero net-profit card + margin bar, Money module, Miles module, Odometer form, Notes, Linked Loads (collapses past 5).

**Database Tables:** `trips` (single row), `loads` (all rows for the trip, ordered by delivery date), `dispatch_settings`, `load_expenses`, `brokers`.

**API Calls:** `setTripStatus`, `updateTripOdometer`, `updateTrip`, `deleteTrip` (all trip actions), plus `markLoadPaid` reused from the loads actions module.

**Business Logic:** net is all-in at the trip level, including PC (personal-conveyance/empty) diesel folded in only here (per-load `loadNet` does not include PC). PC miles are derived by ordering the trip's loads by `odo_assigned` and summing non-negative gaps between trip-odometer bookends and each load's assigned/delivered readings — missing readings silently produce a $0 gap rather than a visible warning. TONU loads are excluded entirely from the trip rollup (see §3's cross-screen note). `setTripStatus("closed")` stamps `ended_at` only if not already set; reopening nulls both `ended_at` and `closed_at`.

**Weaknesses:** PC-miles calc silently under-counts if any load in the sequence is missing an odometer reading, with no operator-visible warning that the figure may be incomplete.

**UX Problems:** the odometer-bookends save is a full round-trip with no inline validation (unlike the trip-dates form, which validates client-side).

**Performance/Scalability:** same full-read profile as the list page; acceptable at current trip volumes.

**Security Concerns:** standard service-role pattern.

---

## 7. Calendar (`/admin/calendar`)

**Files:** `page.tsx`, `CalendarView.tsx`; supporting `src/lib/dispatch/calendar.ts`.

**Purpose:** read-only Sun–Sat month grid of load pickup→delivery bars, repair-service chips, and US federal holidays, with per-week/month net rollups.

**Users:** sole operator.

**Inputs:** month navigation only (prev/next/Today); desktop grid vs. mobile agenda is automatic by breakpoint.

**Outputs:** 8-column desktop grid (7 days + Profit column) or 7-column mobile grid with a week-net footer; load bars link to load detail; repair chips link to maintenance part detail.

**Database Tables:** `loads` (**entire unfiltered table**, no date bound), `repair_entries`, `repair_services`, `dispatch_settings`, `load_expenses` (**also unfiltered, whole table**), `brokers` (factoring ids).

**API Calls:** none — fully read-only, no server actions.

**Business Logic:** load-span resolution falls back through `pickup→delivery`, then single-day, then `created_at` (flagged `approx: true`, dashed border). Weekly net is attributed by pickup date and clipped to the viewed month (a week straddling two months totals differently depending which month is open). Overlapping load bars use half-day-slot interval-graph coloring so bars can share a lane. Federal holidays are computed algorithmically (fixed-date + nth-weekday rules with observed-shift), not stored. "Today" is resolved server-side in America/Chicago to avoid a UTC-vs-Chicago hydration mismatch after 7pm Central — a documented regression fix. **TONU loads show $0 net here too** — a third distinct TONU treatment alongside the Board's raw-fee and Detail's factored-fee approaches (see §3).

**Weaknesses:** the single heaviest data-fetch pattern in the whole app — the entire `loads` and `load_expenses` tables are pulled on every calendar visit purely to render one month, with no server-side date window at all (client month-nav happens over already-fully-fetched data).

**UX Problems:** no search/filter/jump-to-date beyond prev/next/Today.

**Performance/Scalability Issues:** will linearly worsen as total load/expense history grows; the single biggest scalability risk of the Loads/Trips/Calendar cluster.

**Security Concerns:** read-only, lower risk surface; standard service-role pattern.

**Opportunities:** scope the query to a rolling window around the viewed month; unify TONU-net handling app-wide.

---

## 8. Brokers (`/admin/dispatch/brokers`, `/new`, `/quick-add`, `/[id]`)

**Files:** `layout.tsx`, `page.tsx`, `AddBrokerPanel.tsx`, `BrokerListSidebar.tsx`, `_util.ts`, `actions.ts`, `new/page.tsx`, `quick-add/{QuickAddForm,actions,page}.tsx`, `[id]/{BrokerDetail,page}.tsx`.

**Purpose:** master-detail broker directory with profile, contacts, lane history, load history, and financials.

**Users:** sole operator.

### Layout / index
**Inputs:** client-only search + sort (name/gross/loads). **Database Tables:** `brokers` (non-deleted set) + `loads` (**entire unfiltered table**, all columns needed, aggregated client-side). **Business Logic:** gross excludes TONU loads; A/R = delivered+unpaid. **Weaknesses/Performance:** the full `loads` table is re-fetched on every navigation within `/admin/dispatch/brokers/*` because the layout re-runs per route change — a real scalability risk that compounds with broker count.

### New broker (`/new`, `AddBrokerPanel`)
**Fields:** factoring (default checked), name*, broker_type (default "Brokerage"), dot_number, mc_number, phone, authority, plus an FMCSA MC/DOT lookup control. **API:** `GET /api/admin/fmcsa`, `createBroker` server action. **Business Logic:** dedupe by generated/lowercased `name_key` — an existing match is reused (redirect to it) rather than duplicated; note the create form has **no email field**, so `email` is always null on this path. **Weaknesses:** near-duplicate names ("ABC Logistics" vs "ABC Logistics LLC") still produce separate rows since dedupe is exact-match only.

### Quick Add (`/quick-add`)
**Purpose:** rapid capture of broker + dispatcher contact + a posted lane straight off a load board, explicitly kept **out** of the booked-load/P&L flow. **Fields:** MC (+lookup), broker/company (datalist), dispatcher name/email/phone, origin/destination ZIP, posted rate. **Database Tables:** `brokers` (dedupe/insert/patch), `broker_contacts` (dedupe by normalized phone/email digits), `broker_lanes` (dedupe by broker + ZIP prefix, `last_seen_at`/`rate` refreshed on match). **API:** `quickAddBrokerLane` server action. **UX Problems:** no UI signal distinguishing "matched an existing record" from "created a new one."

### Broker detail (`/[id]`)
**Fields (Edit Broker modal):** name*, status, broker_type, mc_number, dot_number, phone, email, office, timezone, authority, insurance, w9, ten99, notes, factoring. **Fields (Contact modal):** name*, title, repeatable phone rows (number/ext/label), repeatable email rows (address/label), `is_backhaul` ("Include in Reach", default checked). **Database Tables:** `brokers`, `loads` (filtered by broker), `broker_contacts`, `dispatch_settings`, `load_expenses` (**entire unfiltered table**, filtered in memory by load id — same anti-pattern as the layout). **API:** `updateBroker`, `softDeleteBroker`, `addBrokerContact`, `updateBrokerContact`, `deleteBrokerContact`, plus reused `markLoadPaid`. **Business Logic:** same canonical `loadNet`/`loadDiesel` costing as everywhere else; A/R aging buckets 0–7/8–14/15–30/31+ days; Lanes tab aggregates by raw `origin → destination` string (not ZIP), so differently-formatted strings for the same lane fragment into separate rows; contacts store both a legacy scalar `phone`/`email` and JSONB `phones`/`emails` arrays, with the UI folding legacy values into the array only when empty — a schema mid-migration. **Weaknesses:** broker soft-delete has no cascade/warning to contacts or lanes still pointing at it, and — unlike contact deletion — has **no confirmation dialog at all**. "Documents" tab tracks only free-text reference strings (`insurance`/`w9`/`ten99`); no actual file upload is wired.

**Opportunities (whole cluster):** add a confirm step to broker deletion; finish the `phones`/`emails` migration off the legacy scalar columns; replace the full-table `load_expenses`/`loads` reads with scoped queries or a SQL rollup view.

---

## 9. Email Broker / Load Inquiry (`/admin/dispatch/email-broker`)

**Files:** `EmailBrokerView.tsx`, `PopoutButton.tsx`, `content.ts`, `parse.ts` (+`parse.test.ts`), `send-actions.ts`, `page.tsx`; popup variant `src/app/admin/(popup)/popup/email-broker/page.tsx`.

**Purpose:** a one-off "Load Inquiry" tool — paste a broker's email + one load-board line, auto-parse origin/destination, preview the exact email, and send a single templated inquiry. Deliberately simpler than Reach: no templates table, no markets, no suppression log. Can be opened as a small chrome-less pop-out window (`window.open`, 460×860) to sit beside load-board tabs.

**Users:** sole operator.

**Inputs:** broker email, pasted load line (free text), editable Origin/Destination (auto-filled, always overridable).

**Outputs:** one Resend email send; a post-send "Add this broker?" prompt feeding into the Quick Add flow.

**Database Tables:** none directly on the compose path; the post-send add-broker flow reuses `quickAddBrokerLane` (touches `brokers`/`broker_contacts`/`broker_lanes`, as in §8).

**API Calls:** `GET /api/admin/fmcsa`, `sendBrokerEmail`/`sendBrokerEmailTest` (`send-actions.ts`), reused `quickAddBrokerLane`.

**Business Logic:** `parseLoadLine()` regex-matches `"City, ST"` tokens; exactly 2 matches = confident parse, otherwise falls back to a best-effort first/last-token guess (12 unit tests cover this). Email body text is **fixed, non-editable** boilerplate from `content.ts`, with **hardcoded** MC/DOT/phone constants — not read from `reach_settings` the way Reach's equivalent values are, a duplicate source of truth that can silently drift. Reply-to is a hardcoded constant, also not settings-driven (explicit code comment). "Sent this session" history is in-memory React state only, lost on refresh by design.

**Weaknesses:** no persisted send history/audit trail for this tool (unlike Reach's `reach_sends` table) — a failed Resend send leaves no record anywhere but Resend's own dashboard. Truck-description line is hardcoded, not personalized per load/equipment.

**Security Concerns:** `to` email validated by regex both client- and server-side before sending; no rate limiting beyond a client-side busy flag.

**Opportunities:** persist sends to a table mirroring `reach_sends`; source MC/DOT/phone from `reach_settings` to eliminate the drift risk.

---

## 10. Reach / Send Backhaul (`/admin/dispatch/reach`)

**Files:** `page.tsx`, `ReachView.tsx`, `ContactsTab.tsx`, `SetupModal.tsx`, `actions.ts`, `logic.ts`, `markets.ts`, `queries.ts`, `send-actions.ts`, `signature.ts`, `types.ts`; supporting `src/lib/reach/geo.ts`.

**Purpose:** "near-zero-typing" bulk broker outreach for backhaul freight — auto-detects whether the truck is open now or soon, matches the operator's location to one of ~190 built-in freight markets, auto-builds a recipient list from brokers whose lanes/loads touch that market, and sends one personalized email per broker.

**Users:** sole operator.

**Inputs:** town (typeahead or geolocation), posture toggle (Open now / Planning ahead + date), style toggle (Low-key/Standard/Eager → `confident`/`balanced`/`push`), editable Subject/Message, Setup modal (from name, truck line, reply-to, "show exact town" toggle, default style), Contacts tab search + per-contact Include toggle.

**Outputs:** personalized bulk send with a review/confirm modal, plus a "send a test" path to the owner's own inbox.

**Database Tables:** `reach_markets` (**not actually read at runtime** — `loadReachMarkets()` always returns a hardcoded ~190-entry array from `markets.ts`; the DB table is vestigial), `reach_settings` (singleton, `id = true`), `reach_templates` (2 postures × 3 leverage levels), `reach_sends` (write-only suppression log), `brokers`, `broker_contacts` (`is_backhaul` flag), `broker_lanes`, `loads` (unfiltered, for market-matching and posture auto-detection).

**API Calls:** `resolveLocation`, `updateReachSettings`, `updateReachTemplate`, `ensureReachTemplate`, `saveReachStyleEmail`, `setContactInclude` (`actions.ts`); `sendReach`, `sendReachTest` (`send-actions.ts`); `GET /api/admin/dispatch/cities`.

**Business Logic:**
- Posture auto-detection: an active load with a destination → "planning" (market = destination); else the most recent delivered load's drop → "available"; else manual.
- Market matching: nearest built-in market whose configured radius (80–175mi, denser East-Coast metros smaller) contains the resolved town.
- Recipient auto-build: a broker "touches" a market if a lane/load origin ZIP falls within radius, or (ZIP unresolvable) the state matches; `matchCount ≥ 2` = "hot", else "warm". Brokers reached within the last 4 days are held back (visible but excluded from the sendable set entirely, not just deselected) — no manual override exists to re-include them early.
- Server never trusts client-supplied recipient emails — `sendReach` re-resolves broker/contact emails from the id list before sending.
- Token templating (`{broker} {market} {equipment} {town_paren} {mc} {phone}`) supports reverse-engineering a manually-edited rendered email back into a token template via longest-value-first literal substring matching — explicitly flagged in code as fragile (can misfire if edited text coincidentally contains a token's literal value).

**Weaknesses:** `reach_markets` table exists in schema/migration but has zero effect on the running app — a documentation/architecture trap for future maintainers. Market-touch matching re-queries all of `broker_lanes`/`loads` unfiltered on every page load and computes matches in JS.

**UX Problems:** Setup is hidden in a separate modal from the main Send flow; MC/phone "legacy" signature tokens are described as un-editable dead settings surface.

**Security Concerns:** the client *does* supply the rendered subject/body verbatim, trusted at send time — low risk given this is a single-admin internal tool, but worth noting for a rebuild. Test-send recipient is hardcoded to one authorized address.

**Opportunities:** wire `reach_markets` to real CRUD or drop it; add a manual override for held-back brokers; move market-touch matching into SQL/PostGIS as broker count grows.

---

## 11. Email Previews (`/admin/previews`, `/admin/previews-2`)

**Files:** `AdminPreviewLab.tsx`, `PreviewTabs.tsx`, `page.tsx`, and subpages `confirm-shipment`, `decline`, `finalize-confirmed`, `finalize-pending`, `home`, `payment/{page,DemoEmbeddedCheckout}.tsx`, `quote`, `quote-success`; `previews-2/{EmailComparisonLab,page}.tsx`.

**Purpose:** visual QA tool rendering every customer-facing email template and several customer-facing pages (as inert/disabled iframes) using static sample data — no real sends, no real records, no public token route. Calls the **exact same renderer functions** production uses, so preview bytes equal sent bytes. `previews-2` is a denser side-by-side "uniformity lab" for iterating on shared visual language across all four email templates at once.

**Users:** sole operator (`robots: noindex`).

**Inputs:** click a tile to open a modal viewer with an in-modal sidebar to swap previews without closing.

**Outputs:** read-only iframes, mobile (402px) + desktop (1920px) side-by-side.

**Database Tables:** none — static sample payloads only.

**API Calls:** none for rendering; `payment/page.tsx` does call `createPreviewDemoSession()`, which creates a **real Stripe sandbox PaymentIntent** on every render (metadata-tagged `do_not_fulfill: true`, not cached).

**Business Logic:** four classifications drive grouping — customer form (wrapped in `<fieldset disabled>` around the real production form component, not a reimplementation), customer view, email, internal (BOL only, "not live"). Customer-page previews are hand-maintained visual **copies** of the real customer pages' chrome — explicit code comments warn they can drift if the real page changes and the twin isn't updated.

**Weaknesses:** no runtime guard prevents `createPreviewDemoSession()` from firing against a live Stripe key if one were ever configured here — it's sandbox-only by convention, not by enforcement.

**Security Concerns:** gated only by the standard admin layout, no separate per-file check.

**Opportunities:** assert `STRIPE_SECRET_KEY` doesn't start with `sk_live_` before calling the preview-session helper.

---

## 12. Operations hub (`/admin/operations`) — Quotes / Applications / Accounting

**Files:** `page.tsx`, `OperationsTabs.tsx`, `QuotesPanel.tsx`, `ApplicationsPanel.tsx`, `AccountingPanel.tsx`.

**Purpose:** a single tabbed workspace (`?tab=quotes|applications|accounting`, URL-driven, deep-linkable) that consolidated three formerly-standalone pages (`/admin/quotes`, `/admin/applications`, `/admin/accounting` list views — all three now 307/redirect shims into this hub). Only the active tab's loaders run per request; e.g. Accounting's live Stripe calls only fire when that tab is open.

**Users:** sole operator.

### Quotes tab (`QuotesPanel`)
**Database Tables:** `quote_requests` (active set + trash count), `dispatch_estimates`/`finalized_quotes`/`bills_of_lading` (latest `sent_at` per lead, for urgency signals), `shipment_intake` (intake-started/submitted timestamps). **Business Logic:** every row is enriched with `computeUrgency()` (`src/lib/dispatch/urgency.ts`) — deterministic, no-DB-call urgency chips (`stale_estimate`, `intake_in_progress`, `awaiting_payment_long`, `ready_to_dispatch_long`, `dispatched_no_pickup`, `in_transit_stale`, `delivered_unconfirmed`, `new_lead_stale`), each carrying a `warn`/`alert` severity and age. The list renders as a single-column grouped feed (not a table): Needs Attention (urgency-flagged, wins over status) → Medium (New/Estimate sent/Awaiting pay/Ready to dispatch) → Compact rows (in-motion statuses) → Collapsed (Delivered/Archived/Lost, header-only by default). A lead appears in exactly one group. The pipeline funnel above the feed reuses the same `loadPipelineCards()` the old `/admin/loads` page showed (expired leads excluded — they surface only in the Dashboard's own "Expired quotes" table).

### Applications tab (`ApplicationsPanel`)
**Database Tables:** `applications` (active set + trash count). **Business Logic:** no `status` column exists on `applications` at all — the dense work-queue table deliberately omits a status pill rather than fabricate one. Reuses the same dark table component family as the Load Board.

### Accounting tab (`AccountingPanel`, via `src/app/admin/(authed)/accounting/page.tsx`'s redirect)
Documented in full in §19 — a **separate financial domain** from carrier-load Receivables (§17), tracking the customer-facing quote/freight-brokerage business instead.

**API Calls:** none directly in `page.tsx`/`OperationsTabs.tsx` (pure tab routing); each panel's data-loading function runs inline in its Server Component.

**Weaknesses:** none specific to the hub shell itself; see the Quotes/Applications/Accounting sub-sections and §13 for the substantial findings underneath each tab.

**Opportunities:** none beyond what's noted in the underlying panels.

---

## 13. Quote detail workspace (`/admin/quotes/[id]`)

**Files:** `page.tsx` (~1,787 lines — the single largest file in the app), plus ~25 supporting components/tabs under `[id]/`. This is the core operational screen for the lead-to-cash pipeline: quote intake → range estimate → shipment intake → finalized quote (rate confirmation) → BOL → payment.

**Purpose:** the single working surface for one lead through its entire commercial + execution lifecycle.

**Users:** sole operator.

### The 13-state lead-status pipeline (`src/lib/dispatch/status.ts`)
Two halves:
- **Commercial** (lead → booked): `new → contacted → estimate_sent → awaiting_confirmation → booked`.
- **Execution** (booked → closed): `awaiting_payment → ready_to_dispatch → dispatched → picked_up → in_transit → delivered → archived`, with `lost` as an off-ramp reachable from anywhere.

Transitions are **explicitly not enforced** in code — `suggestedNext()` only hints at the likely next state for a one-tap "advance" UI button; real dispatch is acknowledged in comments to be messier than a linear funnel (a delivered load can fall back to `lost` on a dispute, etc.). The `awaiting_payment → ready_to_dispatch` transition specifically is derived at query time from `computePaymentSummary()` (`src/lib/dispatch/payment.ts`) comparing `payments.amount` sum against `finalized_quotes.total_amount` — **not** a stored boolean — deliberately, to avoid state drift, at the cost of a live SUM on every render. A `null` `total_amount` (finalized quote sent without a confirmed total) means this auto-advance **never** fires regardless of how much has actually been paid.

### Tabs
The workspace is organized as Overview / Details / Pricing / Documents (a prior "Timeline" tab was retired in a "V4.7" pass and its two sections — the `DispatchLifecycle` pipeline strip and the event-history feed — merged into Overview; `TimelineTab.tsx` now only exports the `EventHistorySection` renderer for Overview to mount).
- **Details tab:** dark "workstation" surface; debounced (~300ms) auto-save on blur, posting the **full** 18-key editable form on every save (the action overwrites the whole `load_details_overrides` JSONB column, so a partial post would clobber unrelated fields — a real footgun if a future edit posts a subset).
- **Pricing tab:** the highest-risk slice per the code's own "Step 5.6 risk audit" comments — a thin wrapper mounting `QuoteRangeWorkspace` and `FinalizedQuoteWorkspace` in a keep-mounted (`display:none`, not unmount) segmented control so in-progress form state in either survives switching. Explicitly documented as touching zero business logic itself (no FormData key changes, no fingerprint changes, no PreviewModal changes) — the wrapper only shows/hides.
- **Overview tab:** hosts `DispatchLifecycle`'s `computeStageStates()`/`headlineFromStates()` (still live/load-bearing) plus the read-only `EventHistorySection` reading `dispatch_events` (capped at 100 rows, `kind`-keyed label dictionary with a graceful fallback for unknown kinds).
- **Documents tab:** hosts `DocumentViewButton` (opens a modal viewer + Download/Resend form) and feeds `PreviewModal`.

### A significant structural finding: extensive dead code from a prior redesign pass
`LoadWorkspaceV2.tsx` (the current root shell) imports `IdentityRowProps`, `LaneHeroProps`, `StatusHeroProps`, `OpsStripProps`, and `BolBlockerPhase` **as types only** — never rendering the corresponding components. `page.tsx` still dutifully computes and passes all of that data (rate label, drive time, status variant, next-action tone, lifecycle headline, BOL-blocker phase) into props the shell silently discards. Confirmed via `page.tsx`'s own comments ("kept on disk for a later cleanup pass") plus grep-verified zero live call sites, the following are dead:
`WorkspaceHeader.tsx`, `WorkspaceTabs.tsx`, `QuoteWorkspaceTabs.tsx` ("V3" tab shell, never wired up), `IdentityRow.tsx`, `LaneHero.tsx`, `StatusHero.tsx`, `OpsStrip.tsx`, `QuoteHero.tsx` (imported as a value in `page.tsx` but never rendered — an unused import), `OperatorHeader.tsx` (340-line freight-document header, type-only import), `LoadSummaryCard.tsx` (fully orphaned, no importers at all), `WorkspaceSection.tsx` (fully orphaned), `WorkflowProgress.tsx` and `WorkflowProgressBar.tsx` (both 10-step lifecycle strips, both orphaned — the latter has zero importers anywhere including the also-dead `WorkspaceHeader`), and the `<DispatchLifecycle>` **JSX component itself** (its helper functions remain live, but the component render is not called anywhere). **12+ files, several hundred lines of maintained-but-unreachable code.** Live components confirmed with real call sites: `LoadWorkspaceV2.tsx` (root shell), `CollapsibleWorkspaceSection.tsx`, `AttachmentsList.tsx`, `DocumentViewButton.tsx`, `DocumentsActivityTabs.tsx`, `PreviewModal.tsx` (shared by 3 live parents: `QuoteRangeWorkspace`, `FinalizedQuoteWorkspace`, `BolWorkspace`), `icons.tsx`, `quoteTime.ts`.

**Database Tables:** `quote_requests`, `dispatch_estimates`, `shipment_intake` (+ `shipment_intake_uploads`), `finalized_quotes`, `bills_of_lading` (+ `bol_signatures`), `payments`, `dispatch_events`.

**API Calls (server actions, by file — full inventory, some read by signature only per the methodology note):**
- `quotes/actions.ts` (1,227 lines): `softDeleteQuote`/`restoreQuote`/`permanentlyDeleteQuote` + bulk variants, `updateLeadStatus`, `saveDraftEstimate`, `sendEstimate`, `updateDispatchOwnership`, `addDispatchNote`, `buildEstimatePreview`, `buildAcknowledgementPreview`, `resendEstimate`, `saveLoadDetailsOverrides`, `lookupZipDetails`.
- `bol-actions.ts` (933 lines): `generateBolDraft`, `saveBolDraft`, `buildBolPreview`, `sendBol`, `resendBol`.
- `finalized-quote-actions.ts` (1,298 lines): `generateFinalizedQuoteDraft`, `saveFinalizedQuoteDraft`, `buildFinalizedQuotePreview`, `sendFinalizedQuote`, `resendFinalizedQuote`.
- `payment-actions.ts` (337 lines): `recordPayment`, `softDeletePayment`.

**needs a follow-up read:** the full internal logic of `updateLeadStatus`, `sendEstimate`, `generateBolDraft`, and `generateFinalizedQuoteDraft` was inventoried by function signature and surrounding context, not read line-by-line (each of these four action files is 900–1,300 lines). The state-machine rules, preview/send byte-parity mechanics, and the pricing-tab fingerprint-based staleness detection are understood at the level described above and in §14, but a pre-implementation pass should re-read these four functions in full before the rebuild encodes their exact behavior.

**Weaknesses:** the dead-code volume above is the single largest concrete cleanup opportunity found anywhere in this audit. `page.tsx` at 1,787 lines is doing far more orchestration than a single file should — a strong signal for the rebuild to decompose by tab/concern from the start rather than accreting one file.

**Opportunities:** delete the 12+ confirmed-dead files; decompose `page.tsx`; consider whether `WorkspaceTabs`/`QuoteWorkspaceTabs`'s "keep-mounted via `display:none` + CustomEvent" navigation pattern (used by the *live* Pricing-tab wrapper too) should become a first-class primitive in the rebuild rather than a bespoke pattern reinvented per redesign pass.

---

## 14. BOL generation & signature pipeline

This spans §4 (load-detail BOL signing UI), §13 (BOL tab within the quote workspace), and a dedicated set of PDF/email routes and libs.

**Three-tier document hierarchy** (explicit in code comments): Range Proposal (`dispatch_estimates`, conversational/rough) → Finalized Quote (`finalized_quotes`, formal/exact) → Bill of Lading (`bills_of_lading`, execution paperwork). Each has its own renderer, its own PDF route, its own audit-view route.

**Server routes (all under `/admin/quotes/[id]/`, admin-gated via `requireAdmin()`):**
- `bol-email/[bolId]/route.ts`, `estimate-email/[estimateId]/route.ts`, `finalized-quote-email/[finalizedQuoteId]/route.ts` — stateless "audit view" routes that replay the exact persisted `preview_html` bytes that were actually emailed, scoped by both the artifact id and the parent `quote_request_id`. Return `text/html`, `private, no-store`.
- `bol-pdf/[bolId]/route.ts`, `estimate-pdf/[estimateId]/route.ts`, `finalized-quote-pdf/[finalizedQuoteId]/route.ts` — on-demand PDF regeneration from **current live row state** (not stored/cached, not attached to the email — the send pipeline is HTML-only). `estimate-pdf` and `finalized-quote-pdf` both hard-refuse (HTTP 422) if their required pricing fields aren't populated yet ("build a preview first").

**PDF rendering libs (`src/lib/pdf/`):** `renderBolPdf.ts`, `renderFinalizedQuotePdf.ts`, `renderRangeProposalPdf.ts` — three near-identical thin wrappers that lazily `import("@react-pdf/renderer")` **inside** the function body (never at module top-level), specifically so a load-time throw from that dependency (which pulls in yoga WASM + fontkit) can't poison the whole `"use server"` module and 500 every route at import time; failures only surface on the actual render call. `pdfjs.ts` is the separate **client-side** lazy loader used by the in-browser BOL signature-capture viewer (not these server routes). `signDoc.ts` composites a finger-drawn signature PNG onto an existing PDF or JPEG-background page via `pdf-lib`, with non-trivial rotation math to keep a stamped signature upright regardless of the source page's `/Rotate` value — never mutates the source, always returns new bytes.

**Email rendering libs (`src/lib/email/`):** `render.ts` (pure renderers for Acknowledgement + Estimate — no `"use server"`, shared verbatim between the Preview Lab and the real send path so preview bytes = sent bytes), `estimate.ts`/`finalized-quote.ts`/`bill-of-lading.ts` (Resend delivery wrappers), `shell.ts` (shared HTML shell used by Acknowledgement/Estimate/Finalized-Quote — **explicitly not** used by BOL, which is deliberately a separate "execution paperwork" visual language, not a customer email).

**Business Logic (non-obvious, verified):**
- **Pricing transparency asymmetry:** the Finalized Quote **PDF** includes the full rate breakdown (linehaul, fuel surcharge, permits, accessorials, total); the Finalized Quote **email** deliberately shows only the total — "the customer sees the TOTAL once, prominently... we don't surface breakdowns to clients" (explicit code comment). A customer who downloads the PDF sees materially more pricing detail than the email ever showed.
- Six fields (`detentionPolicy`, `tonuPolicy`, `paymentInstructions`, `dispatchConfirmationStatement`, `schedulingStatement`, `acceptanceAcknowledgement`) remain on the Finalized Quote payload type but are **no longer rendered** into the email body — retained only for historical-snapshot compatibility with older sent records.
- Public customer-facing token resolution (`src/lib/quote-token/lookup.ts`) is a completely separate trust boundary from the admin routes above: `resolveByToken()` (accept/decline links, `dispatch_estimates.accept_token`) and `resolveByConfirmationToken()` (`finalized_quotes.confirmation_token`, requires `sent_at` non-null — a draft FQ's token is inert even if guessed) are deliberately kept independent so the two link types can't be confused/reused across each other.
- `computePaymentSummary()` treats an "unknown" total (null/0/negative) specially: `outstanding` is set equal to `paid` itself in that case, with a code comment warning the UI must render this as "—" rather than a literal dollar figure — a subtle footgun for any future caller that doesn't read the comment.

**Weaknesses:**
- **Triplicated helper functions** across the six route/lib files: `escapeHtml` (3 independent copies across the `-email` routes, none importing `shell.ts`'s own `escapeHtml`), `shortRef`/`num`/`parseAccessorials` (2 copies across `estimate-pdf`/`finalized-quote-pdf`), `resolveFrom`/`resolveReplyTo` (3 copies across `render.ts`, `bill-of-lading.ts`, `finalized-quote.ts`), `sectionHeader`/`fieldTable`/`rateSummaryTable`/`bandWhite` (2 copies across `render.ts` and `finalized-quote.ts`, with an explicit code comment acknowledging the duplication as an intentional-but-flagged tradeoff).
- Inconsistent external-integration error contracts: FMCSA's `key()` throws synchronously if unconfigured; Stripe's `getStripeClient()` also throws (with a comment instructing callers to catch); Resend's send wrappers instead return a typed `{ok:false, reason}`. A rebuild should normalize these.
- `finalized-quote-pdf`'s 422 validation gate can diverge from what was actually true at send time — if a sent FQ's row is later edited to remove/null a required pricing field, the PDF-download button breaks for an already-sent, already-paid quote even though the email long ago went out fine.

**Opportunities:** collapse the three PDF-render wrappers into one generic `renderPdfBuffer(Component, data)` helper; consolidate the triplicated helpers into shared modules; decide consciously (rather than by accretion) whether the PDF/email pricing-transparency asymmetry should persist into the rebuild.

---

## 15. Applications (`/admin/applications/[id]`, `/trash`)

**Files:** `[id]/page.tsx`, `ApplicationListTable.tsx`, `ApplicationsDarkTable.tsx`, `actions.ts`, `trash/ApplicationTrashTable.tsx`, `trash/page.tsx`. The list itself now lives in the Operations hub (§12); `/admin/applications` is a redirect shim.

**Purpose:** review one owner-operator application submitted via the public `/apply` form; soft-delete/restore/permanently-delete lifecycle with a 30-day retention window.

**Users:** sole operator.

**Database Tables:** `applications` (`deleted_at`/`delete_after` soft-delete pair).

**API Calls (`actions.ts`):** `softDeleteApplication`/`restoreApplication`/`permanentlyDeleteApplication` (single) and `softDeleteApplications`/`restoreApplications`/`permanentlyDeleteApplications` (bulk, `FormData`-driven id lists).

**Business Logic:** a 30-day `RETENTION_DAYS` window sets `delete_after` on soft-delete; permanent delete is blocked (throws) unless the row is already soft-deleted — bulk permanent-delete explicitly checks every selected row and refuses the whole batch if any are still active, reporting the count.

**Weaknesses:** no automated purge job was found anywhere in the audited code for rows past their `delete_after` timestamp — the column appears to be set but never acted on (**unverified**: a scheduled job outside the Next.js app, e.g. a Supabase cron function, could exist and wasn't in scope to check).

**Security Concerns:** standard service-role/admin-gate pattern.

---

## 16. Quotes trash (`/admin/quotes/trash`)

**Files:** `QuoteTrashTable.tsx`, `page.tsx`, sharing `softDeleteQuote(s)`/`restoreQuote(s)`/`permanentlyDeleteQuote(s)` from `quotes/actions.ts` (inventoried in §13).

**Purpose:** same soft-delete/restore/permanent-delete lifecycle as Applications trash, scoped to `quote_requests`.

**Business Logic:** identical 30-day retention pattern to Applications (`RETENTION_DAYS` constant, same guard against permanently deleting an active row).

**needs a follow-up read:** the trash table component's own rendering logic wasn't separately audited beyond confirming it consumes the shared trash actions.

---

## 17. Receivables (`/admin/dispatch/receivables`)

**Files:** `page.tsx`, `ReceivablesView.tsx`.

**Purpose:** all-time, all-loads carrier A/R — every delivered load whose `payment_status` isn't `paid`, with aging buckets and one-tap "Mark as paid."

**Users:** sole operator.

**Inputs:** client-side sort (oldest/newest/amount) + aging-band filter chips + CSV export; per-card `markLoadPaid`/`markLoadUnpaid` forms.

**Outputs:** outstanding-balance hero, 4-bucket aging summary (0–30/31–60/61–90/90+/no-date), invoice cards, "Recently Paid" undo strip (last 6), CSV export.

**Database Tables:** `loads` (delivered+unpaid for the main list; delivered+paid, limit 6, for "Recently Paid").

**API Calls:** `markLoadPaid`, `markLoadUnpaid` (`dispatch/loads/actions.ts`), revalidating six different paths on every call.

**Business Logic:** **no partial-payment state exists** — `payment_status` is a strict `unpaid`/`paid` binary, so a load is either fully owed or fully paid; "Balance Due" is always the full invoice amount. Days-outstanding is computed server-side once against a single `now` so the client can't rehydrate to a different number. "Invoiced On" is the delivery date — there is no separate invoice-date column.

**Weaknesses:** no partial payments; "Mark as paid" has no amount or backdatable-date input, timestamp is always `now()`.

**Performance/Scalability Issues:** two full-table-ish scans on every page load, no pagination on the outstanding list.

**Security Concerns:** standard service-role pattern.

**Opportunities:** partial payments; backdatable payment date; bulk mark-paid; broker-level roll-up.

---

## 18. Expenses (`/admin/expenses`)

**Files:** `page.tsx`, `ExpensesView.tsx`, `ExpenseRowMenu.tsx`, `ExpenseSlideOver.tsx`, `PaymentMethodsDialog.tsx`, `actions.ts`, `formLabel.ts`, `icons.tsx`, `types.ts`.

**Purpose:** a manual, hand-kept recurring-charge log (insurance, truck payment, subscriptions) restyled as a dense QuickBooks-style ledger. **Not** connected to any bank/card feed — no live balances, no transactions, no reconciliation; a schedule-derived estimate, not a ledger of actuals.

**Users:** sole operator.

**Inputs:** New/Edit Expense slide-over (vendor*, amount*, category [12-item fixed enum + legacy passthrough], payment method, frequency [monthly/weekly/quarterly/annual/onetime], day-of-week/day-of-month/start-date depending on frequency, tags, autopay, notes; "Attachments" section is a visible-but-unimplemented stub); Payment Methods dialog (nickname*, type, last-4-only — **no full card number is ever stored**, default flag); toolbar search/filters/saved-filters (`localStorage`-persisted, not server-side); CSV import/export; bulk archive/delete/category-change/export.

**Database Tables:** `recurring_expenses`, `expense_accounts`, `expense_activity` (insert-only, best-effort audit log — failures are swallowed, never block the parent mutation).

**API Calls:** `createExpense`, `updateExpense`, `deleteExpense` (soft), `duplicateExpense`, `archiveExpense`/`restoreExpense`, `skipNextPayment`, `getExpenseActivity`, `bulkDeleteExpenses`/`bulkArchiveExpenses`/`bulkChangeCategory`, `importExpenses`, `createExpenseAccount`/`updateExpenseAccount`/`deleteExpenseAccount`.

**Business Logic:** "This Month"/"YTD"/"Average Monthly" KPIs are entirely **schedule-derived estimates**, not actual-posted-amount tracking — explicitly documented in code. `monthlyAmount()` normalizes annual÷12, quarterly÷3, weekly×52÷12; one-time charges are excluded from run-rate and counted separately by calendar month. **Quarterly/annual frequencies have no stored anchor date**, so `nextChargeLabel` is always null for those — only monthly/weekly get a real computed next-charge date. Payment-method "Default" is exclusive (setting one flips every other in the same write, race-prone — no partial-unique-index backstop, see §28).

**Weaknesses:** no real transaction data — can't answer "what did I actually spend," only "what was scheduled." Attachments UI exists with no upload capability behind it. CSV import validates only vendor + parseable amount; malformed rows are silently skipped with no per-row error report. Saved filters live in `localStorage` only — lost across devices/browsers.

**Performance Issues:** all expenses + accounts loaded in one shot, all filtering/sorting/pagination done client-side in memory.

**Security Concerns:** CSV import runs straight into a service-role insert with no server-side size/row-count cap beyond a non-empty check.

**Opportunities:** real receipt upload (stub exists); quarterly/annual `nextChargeDate` support (needs an anchor date column); import error reporting; server-persisted saved filters.

---

## 19. Accounting (`/admin/accounting` → Operations tab)

**Files:** `accounting/page.tsx` (pure `redirect("/admin/operations?tab=accounting")`), `AccountingView.tsx`, actual loader in `operations/AccountingPanel.tsx`.

**Purpose:** a local-first A/R + payments ledger for the **customer-facing freight-brokerage business** (`quote_requests`/`finalized_quotes`/`payments`), plus live Stripe figures (fees, payouts, balance) that degrade gracefully if Stripe isn't configured. **This is a separate financial domain from Receivables (§17)**, which tracks carrier-load A/R — the two are never cross-referenced or unified anywhere in the app.

**Users:** sole operator.

**Inputs:** read-only; "Open in Stripe" external link only.

**Outputs:** KPI strip (Collected MTD, Stripe fees MTD, Net to bank, Outstanding A/R), A/R card grid, payments ledger (last 15), Stripe payouts table (last 8) + balance panel.

**Database Tables:** `payments` (limit 100, filtered non-deleted), `finalized_quotes` (`sent_at` non-null only), `quote_requests` (for customer name/lane, excludes soft-deleted leads so a deleted test lead's FQ/payments don't ghost-appear).

**API Calls:** Stripe SDK directly — `balance.retrieve()`, `payouts.list({limit:8})`, `balanceTransactions.list({created:{gte:monthStart}, limit:100})`, all wrapped in try/catch (soft-fails to "not connected" rather than breaking the page).

**Business Logic:** A/R status derivation — `overdue` if `payment_due_at` has passed with a balance owed, `unpaid` if nothing paid, `deposit` if partially paid but not yet due. Non-received payment statuses (`cancelled`/`failed`/`refunded`/`pending`) are excluded from both "collected" and "paid" sums.

**Weaknesses:** **a real, verified correctness bug** — the `payments` query for the MTD "Collected" sum is hard-capped at 100 most-recent rows. If a given month has more than 100 payments, the MTD figure silently undercounts (older-within-the-month payments outside the 100-row window are dropped from the sum with no indication to the operator). Also: two entirely separate, non-reconciled "A/R" concepts exist in the app (this page's customer-quote A/R vs. Receivables' carrier-load A/R) with no cross-reference — an operator glancing at "A/R" could easily conflate the two.

**Performance Issues:** live Stripe API calls fire on every page load with no caching; a Stripe outage directly slows this tab (though it degrades soft, not down).

**Scalability Issues:** the 100-row payments cap is the concrete risk described above; ledger/payouts tables are hard-capped with no "view all."

**Opportunities:** replace the capped client-side reduce with a proper aggregate query (or raise/remove the cap); decide whether to unify or clearly separate the two A/R concepts app-wide.

---

## 20. Performance (`/admin/performance`)

**Files:** `page.tsx`, `PerformanceView.tsx`, `Tables.tsx`, `charts.tsx`; supporting `src/lib/dispatch/performance.ts` (+ tests), `goal-month.ts` (+ tests), `fuel.ts` (+ tests).

**Purpose:** the full carrier-load analytics dashboard — net profit vs. monthly goal, rate ($/mi) trend, deadhead split, broker/lane leaderboards, a plain-English "Insights" takeaway engine, and a monthly ledger. Entirely derived — no new tables, reads `loads` + `load_expenses` + `brokers.factoring` + `dispatch_settings`.

**Users:** sole operator.

**Inputs:** client-side period picker (trailing-12-month dropdown, or a From/To date-range mode) — no server round-trip on period change; the full load history ships once and every aggregation happens client-side.

**Outputs:** 3 KPI cards with MoM delta pills, Net-vs-goal chart + goal ring + pace stats, Rate-trend two-line chart, Deadhead split bar, Top-5 Broker/Lane rank cards, an always-current-month "Insights" strip (independent of the period picker), full sortable leaderboards, monthly ledger table.

**Database Tables:** `loads` (**every non-deleted load**, not just delivered — pending/assigned/loaded loads count their booked rate), `dispatch_settings`, `brokers` (factoring id set), `load_expenses` (for the fetched load ids).

**Business Logic (the most rule-dense screen in the app):**
- Same canonical `loadDiesel()`/`loadNet()` pipeline as everywhere else, **except** TONU loads here run through the factoring gate **unconditionally** (`true` hardcoded, "tonu fee -3% of course" per an owner decision comment) rather than checking the broker's `factoring` flag — a **fifth** distinct TONU-net treatment alongside the four described in §3.
- Month attribution mirrors the Calendar's `closeOutDate()` exactly (pickup-primary, no shift) so a load lands in the same month here as on the Board and Calendar.
- A/R on this page is a **third independent computation** of the same concept as Receivables (§17) — delivered-unpaid `rate` + unpaid-TONU `tonu_amount`, all-time — recomputed here from scratch rather than shared.
- Deltas switch representation depending on the prior period's sign: percent-of-base when positive, absolute-dollar when zero/negative, so a swing from −$200 to $300 doesn't misleadingly read as "+250%." Margin/deadhead deltas are reported in points, not percent-of-percent.
- The "Insights" takeaway engine (`takeaways()`) is a rules engine with explicit minimum-sample/effect-size gates per candidate insight (e.g. min 3 loads, min 100 loaded miles for a lane ranking, 25%-under-average for a "weak lane" callout, 35-day floor for a "slow payer" callout) — deliberately falls back to one neutral line rather than manufacturing noise from thin data; max 6 shown, priority-ranked.
- `monthlyBuckets()` zero-fills months with no loads rather than skipping them, so a dead month doesn't visually blend into its neighbors.

**Weaknesses:** every load ever created is fetched and re-aggregated client-side on every page load with zero server-side date filtering — explicitly a "no new tables, no materialized rollup" simplicity tradeoff per code comments, but the single biggest scalability risk in the whole audited application, since it grows linearly and unboundedly with total historical load count forever.

**UX Problems:** the Insights strip intentionally ignores the period picker (always live current month) — documented, but could read as inconsistent to an operator scrolling other KPIs back to a past period.

**Opportunities:** server-side period filtering or a materialized month-summary rollup once load volume grows; make the takeaway engine's thresholds owner-configurable; reconcile the fifth TONU-factoring treatment with the other four.

---

## 21. Maintenance / Repairs (`/admin/maintenance/**`)

**Files:** `page.tsx`, `MaintenanceHome.tsx`, `IntervalBar.tsx`, `LogServiceModal.tsx`, `actions.ts`, `shared.tsx`, `types.ts`, `[id]/{RepairDetail,page}.tsx`, `category/[category]/{CategoryView,page}.tsx`, `preventative/{PreventativeView,page}.tsx`, `set/[group]/{SetView,page}.tsx`; supporting `src/lib/dispatch/{repair-log,maintenance}.ts`.

**Purpose:** the truck's full repair/service log, **parts-first** — a "service" is one shop visit holding N parts, organized by 7 fixed mechanical categories plus a cross-cutting "Preventative" lens for consumables/recurring items with mileage-based reminders. Money is deliberately de-emphasized (no cost KPI on the home page).

**Users:** sole operator.

**Database Tables:** `repair_entries` (the "parts" — hard-deleted, not soft), `repair_services` (the "visits" — hard-deleted, with explicit code-level cascade of attachments/entries rather than a DB FK cascade), `repair_reminders` (matched case-insensitively on `part_group`), `repair_attachments` (receipts, bucket `maintenance-receipts`), `repair_links` (bidirectional related-part graph, always stored `a_id < b_id` by convention — **not** DB-enforced, see §28), plus a read-only pull of `loads.odo_*` columns to derive "current odometer" (Maintenance has no independent odometer source of its own).

**API Calls (`actions.ts`):** `createReceiptUploadUrl`, `logService`, `updateService`, `deleteReceipt`, `deleteService` (full storage+attachment+entry cascade), `deletePart` (cascades to delete the whole service if it was the last part — a non-obvious side effect documented only in a code comment and the confirm-dialog text), `attachRelated`/`detachRelated`, `setReminderDismissed`.

**Business Logic:**
- Auto-categorization (`categoryForText()`) is a precedence-ordered, word-boundaried keyword matcher (e.g. "wheel bearing" resolves to Steering & Suspension before "wheel" could match Tires & Wheels); defaults to "Other," user override stops further auto-guessing.
- "Preventative" is a computed-then-**persisted** lens (`is_preventative` column), not a category — driven by keyword match on consumables OR the part carrying its own reminder interval OR its `part_group` already having an active reminder.
- Freshness computation requires *every available signal* (odometer delta ≤10,000mi AND days-since ≤183) to read "new"; a single available signal alone decides; no signal at all on record = "original" (never logged).
- Every part logged in the same service visit is automatically, idempotently pairwise-linked in `repair_links` — re-run across **all current parts** on every edit, not just newly-added ones.
- "Due soon" = within 1,000mi OR past 90% of interval, whichever is looser; "overdue" = zero or negative miles remaining; "baseline" = never serviced.

**Weaknesses:** `computeCostPerMile()` exists in `maintenance.ts` but is unused/dead — a placeholder built for a future feature that never shipped. Reminders are mileage-interval only; no date-based (non-mileage) reminder support. **Five near-identical loader functions** (one per page in this cluster) independently fetch the full `repair_entries`/`repair_services`/`repair_attachments`/`repair_links`/`loads`-odometer set and compute freshness/reminders in memory — a real duplication-of-logic maintenance risk (a fix in one loader is easy to miss in the other four), even though each individual query is cheap today.

**Scalability Issues:** no pagination anywhere in this cluster; implicitly single-vehicle (no `vehicle_id` scoping anywhere) — fine for one truck, would need real re-architecture for a small fleet.

**Security Concerns:** receipt MIME/size validated both at upload-URL-request time and re-validated server-side before persisting — good defense in depth.

**Opportunities:** consolidate the 5 loaders into one shared `loadMaintenanceData()`; surface `computeCostPerMile()`; support date-based reminders; make `vehicle_id` explicit if multi-truck is ever in scope.

---

## 22. Files (`/admin/files`)

**Files:** `page.tsx`, `FilesView.tsx`, `actions.ts`; supporting `src/lib/admin/{files,doc-name}.ts`.

**Purpose:** one unified, searchable, newest-first timeline **aggregating three independent upload sources** — load documents, maintenance receipts, and customer quote/application uploads — into a single browsable read-only-plus-delete list. No upload capability here; uploads happen at each source's own page.

**Users:** sole operator.

**Inputs:** search box (seedable via `?q=`, e.g. from a global-search hand-off), type filter chips (chips with 0 current matches hide themselves), "Load more" (40 at a time, client-side slice).

**Outputs:** timeline rows (thumbnail-or-glyph, canonical auto-computed name, subtitle, date, parent-record link), full-screen `DocViewer` on tap.

**Database Tables:** `load_documents` (cross-referenced against `loads`, dropped from the timeline if the parent load is soft-deleted), `repair_attachments` (cross-referenced against `repair_services`/`repair_entries`), `shipment_intake_uploads` (cross-referenced against `quote_requests`, same soft-delete-drop rule).

**API Calls:** `signFiles` (batch-signs storage paths for exactly the on-screen rows, validated against a fixed bucket allowlist — solid defense-in-depth), `deleteFile` (routes to the correct table/bucket by a `source` tag, **reimplementing** each source feature's own delete logic rather than calling it, because those actions revalidate different paths and, for maintenance, need a service id the flat timeline row doesn't carry).

**Business Logic:** canonical document naming is centralized in `doc-name.ts` and reused at both display-time and upload-write-time so a file reads identically everywhere it appears; same-type siblings on one load get a numeric suffix computed live from upload order, so old un-numbered files get numbered correctly the moment a sibling appears. **Lazy signing** is the deliberate scalability lever here — the full metadata timeline (potentially thousands of rows) ships to the client at once, but signed URLs are only requested for the current page of 40 visible rows, tracked via a Set so re-renders don't re-sign already-signed paths.

**Weaknesses:** `loadAllFiles()` does 7 parallel queries but pulls **entire tables** for all three sources plus their parent-join tables, with no date windowing or limit at the query level — every file ever uploaded is in memory and serialized to the client on every page load, even though display itself is paginated. This is a stronger risk than most other full-table-scan patterns in the app because it explicitly unions three independently-growing tables into one client payload. Three independent delete code paths duplicate logic already present (in slightly different form) in each source feature's own actions.

**Opportunities:** move to server-side search/pagination as file count grows; unify delete logic with each feature's canonical action instead of reimplementing it a fourth time.

---

## 23. Camera (`/admin/camera/**`)

**Files:** `page.tsx`, `CameraBatchList.tsx`, `actions.ts`, `[batchId]/{page,CameraCapture}.tsx`, `[batchId]/export/{pdf,zip}/route.ts`; supporting `src/lib/camera/{shared,batches,export,zip}.ts`.

**Purpose:** a mobile-first "photograph paper BOLs fast" tool — batch-based document scanning via the phone's rear camera (with a native-file-input fallback), exportable as a combined PDF or an image ZIP.

**Users:** sole operator, phone-first in-cab use case.

**Database Tables:** `camera_batches`, `camera_photos` (`seq` assigned as `max(existing)+1` per batch). Storage reuses the **existing** `load-documents` bucket under a `camera/{batchId}/` prefix rather than a dedicated bucket.

**API Calls (`actions.ts`):** `createCameraBatch`, `renameCameraBatch` (**unverified**: grep found no confirmed call site wiring this into `CameraBatchList.tsx` — may be dead/unused, or invoked from a component outside this audit's read set), `createCameraUploadUrl`, `recordCameraPhoto` (removes the just-uploaded orphan storage object if the DB insert fails — no dangling files), `deleteCameraPhoto`, `deleteCameraBatch`. Export routes (`export/pdf`, `export/zip`) are raw `route.ts` handlers that call `requireAdmin()` **directly themselves**, since they sit outside the `(authed)` layout tree — the one place in this whole audit where the auth check is not implicitly inherited from a layout, and it was done correctly.

**Business Logic:** every loader defensively detects a missing-table error (covering both raw Postgres `42P01` and the PostgREST/Supabase schema-cache-miss code `PGRST205`) and degrades to an empty result rather than crashing — strong evidence (also confirmed by the user's own project memory) that the `camera_batches`/`camera_photos` migration may not yet be applied to production, and the feature is written defensively against exactly that. Photo display numbering ("BOL-001" etc.) is derived from the photo's **current live position**, not its stored `seq` — deleting a bad shot mid-batch automatically renumbers the rest contiguously; the display name is never persisted. Client-side JPEG compression (canvas downscale to 1600px long edge, quality 0.7) applies identically to live-camera and picked-file sources. Export routes are a straight top-level navigation (`window.location.href = .../export/pdf`), not a fetch+blob-download — the "exporting" spinner clears via a **hardcoded 4-second `setTimeout`**, not any real completion signal.

**Weaknesses:** the export spinner's fixed timeout can clear early (slow assembly) or linger briefly (fast assembly) since it isn't tied to the actual download completing.

**Security Concerns:** correctly re-implements the admin gate at the route-handler level (the one place it must be explicit); reuses the private `load-documents` bucket with no distinct ACL from ordinary load documents, but the bucket is already private/service-role-only.

**Opportunities:** an unimplemented "email this batch to my rep" feature is explicitly earmarked in code comments (the assembled PDF Buffer is already exactly what such a feature would attach, and Resend is already a dependency); replace the 4s timeout with a real completion signal; confirm and either wire up or remove `renameCameraBatch`; verify the migration is actually applied to prod before the rebuild assumes this feature is live there.

---

## 24. Settings (`/admin/settings`)

**Files:** `page.tsx`, `actions.ts`, `AdvancedPanel.tsx`, `DisplaySettings.tsx`, `ThemeToggle.tsx`, `DemoModeToggle.tsx`.

**Purpose:** account identity (read-only), appearance (light/dark), display (orientation + UI scale), demo-mode toggle, business defaults (fuel + profit goals), signed-in email, advanced env diagnostics, sign-out.

**Users:** sole operator. Uses `requireAdmin()` (the full re-check, not the middleware-trust path) — likely because this page is low-frequency and displays identity.

**Database Tables:** `dispatch_settings` (singleton, `id = true`) — reads/writes `mpg`, `diesel_price_per_gallon`, `factoring_pct`, `monthly_net_goal`, `annual_net_goal`.

**API Calls (`actions.ts`):** `setDemoMode` (no demo guard — the one documented, intentional exception), `updateFuelSettings`, `updateProfitGoals` (both revalidate 4–5 downstream paths that depend on these values: Load Board, Trips, Performance, Dashboard).

**Business Logic:** while demo mode is on, the Business Defaults form deliberately shows the **fake** `DEMO_SETTINGS_ROW` constants instead of the real DB row, so the config panel matches the demo money math rather than leaking real numbers. Number parsing (`numOr`/`pctOr`) strips `$`/`%`/`,` and silently falls back to a hardcoded default on invalid input rather than rejecting the form. Account-identity fields are sourced from `src/lib/company.ts` and explicitly not editable here ("read-only for now").

**Weaknesses:** the two business-defaults forms are plain `<form action={...}>` submissions with no inline validation/error surface — a thrown server error would just fail navigation into Next's default error boundary, unlike the Dashboard's countdown forms which catch and show inline `role="alert"` text.

**UX Problems:** sign-out sits at the very bottom of a long scrolling page on mobile (also duplicated in the sidebar footer on desktop).

**Opportunities:** reuse the Dashboard's inline-error/optimistic-update pattern here for consistency.

---

## 25. Demo mode

**Files:** `src/lib/admin/demo.ts`, `src/lib/demo/demoData.ts`, `settings/DemoModeToggle.tsx`.

**Purpose:** lets the whole admin portal be shown with rich, curated fake data while the real database is never read or written — the owner's explicit #1 requirement being that real and demo data are "two separate pipes that cannot cross."

**Mechanism:** a cookie (`hb-demo`, httpOnly, 1yr maxAge, set/cleared by `setDemoMode()`). `isDemoMode()` reads it (fails safe to `false` if `cookies()` throws outside a request scope). `blockedByDemo()` is a thin alias meant to be called as the literal first statement of every mutating server action — if true, the action no-ops and returns a benign success-shaped value **before ever constructing a service-role Supabase client**.

**Enforcement model:** entirely by **convention**, not framework-enforced — there is no wrapper/middleware that intercepts all server actions and forces the guard. Every mutating action audited across every cluster in this document was confirmed to include the guard correctly, with the one documented, necessary exception (`setDemoMode` itself). This is a real, standing audit risk for any *future* action that forgets it — nothing in the type system or build process would catch the omission.

**Demo dataset:** `src/lib/demo/demoData.ts` is a large, hand-maintained, static in-memory dataset generated relative to "now" so it stays evergreen, deliberately run through the **same pure helper functions** real pages use (`loadDiesel`, `loadNet`, `computeTripFinancials`, `computeMaintenance`, `daysOutstanding`, `goalMonthParts`, etc.) so demo numbers are internally consistent across every screen (net on the Board = net on Performance = net on a Broker profile). Fake brokers all use `.example` domains. Confirmed to cover the Dashboard, Load Board, Performance, Receivables, Broker Detail, Broker List, and Maintenance screens at minimum.

**Weaknesses:** the demo dataset is a large, hand-maintained parallel data source with no schema/generator — every new page/feature needs its own demo derivation kept in sync by hand, a real ongoing maintenance burden.

---

## 26. Auth pages: login, logout, reset/update password

Covered in detail in §1; page-level specifics:

- **`/admin/login`** (`page.tsx`, `LoginForm.tsx`, `sessionPersistence.ts`, `icons.tsx`): email + password + "Remember me," `supabase.auth.signInWithPassword` client-side (not a server action). Client-side lockout (5 attempts/60s) is UX-only. `?error=`/`?notice=` query params drive banner copy via lookup maps.
- **`/admin/logout`** (`route.ts`): POST-only, no-JS-required plain form, `supabase.auth.signOut()` + 303 redirect.
- **`/admin/reset-password`** (`page.tsx`, `ResetPasswordForm.tsx`): `resetPasswordForEmail`, always shows a generic "if that email is registered..." success state regardless of whether the email exists — correct enumeration-safe pattern.
- **`/admin/update-password`** (`page.tsx`, `UpdatePasswordForm.tsx`): sets a new password after following the reset-email deep link; includes a hidden `username` autofill field so password managers save correctly. **Noted edge case (unverified, not currently exploitable under the single-admin model):** `/admin/update-password` is not in the middleware's public-path allowlist, so the general `ADMIN_EMAIL` check runs against it too — since Supabase issues the temporary recovery session for whatever email requested the reset, this only works cleanly today because there is exactly one valid admin account. A rebuild with multiple accounts would need to special-case this route.

---

## 27. Shell / navigation chrome

**Files:** `(authed)/layout.tsx`, `_shell/{PortalShell,ThemeShell,DemoBanner,PortalTopBar,PortalSidebar,PortalBottomNav,MoreSheet,GlobalSearch,search-actions,icons}.tsx`, `(authed)/loading.tsx`, `(popup)/layout.tsx` + `(popup)/popup/email-broker/page.tsx`.

**Composition:** `layout.tsx` (server) calls `adminFromMiddleware()` + `isDemoMode()`, injects a `dangerouslySetInnerHTML` no-flash theme/orientation/UI-scale script (reads only fixed `localStorage` keys — not an XSS vector, but any future change to this pattern needs care), conditionally renders `<DemoBanner/>`, then `<PortalShell>` which composes `ThemeShell > PortalTopBar + (PortalSidebar + main) + PortalBottomNav + GlobalSearch`.

**Desktop nav (`PortalSidebar`):** grouped links (Operations, Partners, Payments, Insights, Records, More), Settings pinned in footer with an identity chip + inline sign-out form. All links use `prefetch={false}` — documented reason: the admin middleware re-issues session cookies on every request, which the router cache won't store, so auto-prefetch would loop forever.

**Mobile nav (`PortalBottomNav` + `MoreSheet`):** 4-column bottom bar (Dashboard/Loads/Brokers/More), instant tap-feedback via `useLinkStatus()`. `MoreSheet` is a swipe-to-dismiss bottom sheet with a grouped 2-col tile grid.

**Global search (`GlobalSearch` + `search-actions.ts`):** debounced (180ms), sequenced (monotonic `seq` discards stale responses), ⌘K/Ctrl-K global shortcut. `globalSearch()` server action runs three parallel lookups: `loads` (ilike, capped 10), `brokers` (ilike, capped 10), and `loadAllFiles()` (the same unbounded aggregation described in §22, filtered in memory). Has no auth check of its own — relies entirely on the middleware + layout having already gated the request (documented as intentional). `sanitize()` strips PostgREST `.or()`-breaking characters before building the filter string — a defensive-parsing measure (not a SQL-injection risk, since the Supabase client parameterizes values), but silently drops those characters from the user's query with no feedback.

**Weaknesses:**
- **Two independent, hand-synced nav-destination lists** — `PortalSidebar`'s desktop groups and `MoreSheet`/`PortalBottomNav`'s mobile groups+routes — with no shared config. A new route added to one doesn't automatically appear in the other; real drift risk already latent in the pattern.
- Inconsistent `prefetch` behavior: sidebar explicitly disables it (citing the cookie-refresh loop), but the bottom-nav/MoreSheet links don't follow the same discipline.
- `GlobalSearch`'s reliance on `loadAllFiles()` means every keystroke past 2 characters re-runs the same unbounded three-table aggregation described in §22 — will get slower as file count grows, with no caching/memoization today.

**Opportunities:** unify the nav-destination list into one shared config consumed by both desktop and mobile chrome; apply `prefetch={false}` consistently or resolve the underlying cookie-refresh issue so prefetch can be safely re-enabled everywhere.

---

## 28. Data model — table by table

**Methodology note:** all 51 files under `supabase/migrations/` were read in full chronological order. A significant subset of the most central tables — **`loads`, `brokers`, `broker_contacts`, `trips`, `load_documents`, `load_expenses`, `dispatch_settings`, `recurring_expenses`, `expense_accounts`, and `app_settings`** — are **never `CREATE TABLE`'d anywhere in the tracked migration history**; they appear only as `ALTER TABLE` targets, FK targets, or in code comments referencing "the existing X table." This means the app's most important tables predate the tracked migration history entirely — they were created directly against the live Supabase DB before migrations started being checked in. `dump.sql` at the repo root is a 0-byte empty file, not a usable schema dump, and no generated `database.types.ts` exists in the repo. **Any rebuild must pull the live schema directly from Supabase for these tables — this repo's migration history cannot reconstruct them.** For each such table below, the column list is reconstructed from every `ALTER TABLE` that touches it plus every server-action query that reads/writes it — marked accordingly, and should be treated as incomplete rather than authoritative.

### RLS posture (schema-wide)
With two exceptions, **every table in the admin/dispatch domain has RLS enabled with zero policies defined** — a deliberate deny-all-to-anon/authenticated posture (repeatedly stated in migration comments) where all reads/writes happen exclusively through the service-role key in server actions. Exceptions: (1) the CRM module, which has real `authenticated`-role, org-scoped policies via a `SECURITY DEFINER` helper `crm_current_org()` — the one sophisticated piece of RLS in the schema; (2) `quote_requests` and `applications`, which allow `anon` INSERT-only (public form intake) with no SELECT/UPDATE/DELETE policy for anyone. **One confirmed gap:** `bol_signatures` has **no `enable row level security` statement at all** in its migration — unlike every sibling table, meaning its RLS status is unverified and inconsistent with the rest of the schema's stated convention.

### Lead-to-cash pipeline
| Table | Purpose | Migration(s) | Notable design smells |
|---|---|---|---|
| `quote_requests` | Root public-intake "lead" row | `20260520120000` + 6 later ALTERs | `lead_status` CHECK redefined 3× with inline data-remapping UPDATEs (enum drift); `load_details_overrides jsonb` is an unenforced escape hatch; anon INSERT with no rate-limit/captcha beyond triage fields |
| `applications` | Public `/apply` intake | `20260521120000` + soft-delete ALTER | No `status`/pipeline column at all, unlike `quote_requests` |
| `dispatch_estimates` | Range Proposal (rough estimate) | `20260525000000` + 5 later ALTERs | `accessorials jsonb` duplicated (near-identically) on `finalized_quotes` with no shared type/schema |
| `dispatch_events` | Append-only comms/audit timeline | `20260525000000` | `kind` is free text, no CHECK/enum; `payload jsonb` shape varies per kind with zero schema enforcement |
| `shipment_intake` | Post-accept customer finalize-shipment form | `20260528000000` + 1 ALTER | Legacy free-text window columns kept in parallel with new structured date columns — same fact stored twice, by design, for compatibility |
| `shipment_intake_uploads` | Customer-uploaded supporting files | `20260537000000` + 1 ALTER | No `deleted_at` despite peer tables having it; storage-object cleanup on parent delete is explicitly "handled out of band" |
| `finalized_quotes` | Rate Confirmation (exact pricing) | `20260529000000` + 3 later ALTERs | 3rd copy of address/contact data in the pipeline; `confirmation_token` column is dead/unused infrastructure |
| `bills_of_lading` | Execution paperwork | `20260531000000` + 2 ALTERs | 4th copy of address/contact data; no `deleted_at` |
| `bol_signatures` | Signer PNG + placement per BOL role | `20260710000000` | Signature stored as inline base64 **text** in the row (not Storage) — bloats table/backups; **no RLS statement in the migration at all** (see above) |
| `payments` | Money-received ledger | `20260533000000` + 1 ALTER | `amount > 0` CHECK is contradictory with a `refunded` status value — no way to actually record a refund amount; `method` is free text despite a documented fixed set |

### Core dispatch/ops — **pre-existing, not in tracked migrations**
| Table | Purpose | Reconstruction source | Notable design smells |
|---|---|---|---|
| `loads` | Load Board financial core | App code only (`loads/actions.ts`); no migration | **No CREATE TABLE anywhere** — cannot be versioned from this repo; odometer monotonicity and `status` enum enforced only in app code, not DB; `broker_name` denormalized alongside `broker_id` |
| `brokers` | Broker/customer directory | App code; FK target only in `broker_lanes`/`reach_sends` migrations | `name_key` dedupe has no unique index — race-prone read-then-write |
| `broker_contacts` | Dispatcher contacts | App code; ALTER for `is_backhaul` only | Scalar `phone`/`email` duplicated against jsonb `phones`/`emails` arrays — two representations kept in sync by hand |
| `broker_lanes` | Posted lanes, kept out of P&L flow | `20260544000000` (real CREATE) | Clean, small, well-scoped — no major smell |
| `trips` | Groups loads for odometer bookending | App code; only `started_at`/`ended_at` ALTER tracked | Same `name_key` race-prone dedupe as `brokers`; `loads.trip_id` nulled by app code, not an `ON DELETE SET NULL` FK |
| `load_documents` | Load attachments | App code; thumbnail + signed-BOL-link ALTERs only | `kind` enum enforced only in app code |
| `load_expenses` | Ad-hoc per-load expense lines | **Zero migration references whatsoever** — not even an ALTER | Least-traceable table in the entire schema |

### Settings / dashboard
`dispatch_settings` (pre-existing singleton, `id boolean = true`, two tracked ALTERs for goals + current-cash), `app_settings` (**zero references anywhere in migrations or app source — confirmed orphaned**, cannot be reconstructed, flag for direct live-DB inspection before assuming it's safe to drop), `countdown_goals` (clean, tracked), `dismissed_alerts` (clean, but `alert_key` is a stringly-typed polymorphic reference with no FK integrity to whatever it names).

### Maintenance / repair — **two full generations coexist live**
The original `maintenance_items`/`maintenance_log`/`maintenance_attachments`/`maintenance_expenses` model was fully superseded by `repair_entries`/`repair_services`/`repair_reminders`/`repair_attachments`/`repair_links`, with a one-time data migration copying everything across (`20260558000000_repair_log_migrate_data.sql`) — but **the legacy tables are explicitly left in place, untouched, non-deleted**. `maintenance_expenses` specifically is documented in-migration as a "drift guard": it was applied directly to the live DB and never captured in a tracked migration until a later migration had to reconstruct it defensively to let a fresh DB run the subsequent data migration — a second confirmed instance (after the `loads`/`brokers` cluster) of live-DB schema drift ahead of the tracked history. `repair_links.unique(a_id, b_id)` does not actually prevent a duplicate reverse-order pair, relying entirely on app-code discipline about insert ordering.

### Expenses
`recurring_expenses` (pre-existing + 1 ALTER for QBO-ledger columns) has two independent soft-state mechanisms (`deleted_at` trash + `archived` status) with no documented rule preventing both being set simultaneously; `card` is a free-text label with no FK to `expense_accounts`. `expense_accounts` (pre-existing + 1 ALTER) — "only one default" enforced by app code with no partial-unique-index backstop, race-condition risk. `expense_activity` (clean, tracked) — `action` is unconstrained free text, logging is explicitly best-effort.

### Reach
`email_presets` (tracked, appears to be **legacy infrastructure superseded by `reach_*`** — same "template email to a broker" problem solved twice; worth confirming with the owner whether it's still live). `reach_markets` (tracked, but confirmed **vestigial at runtime** — the app always uses a hardcoded array, see §10). `reach_settings` (clean singleton pattern). `reach_templates` (four consecutive migrations exist solely to hand-edit template copy via SQL `UPDATE` — a content-management concern encoded as schema migrations, a smell worth resolving in the rebuild). `reach_sends` — `broker_contact_id` is stored as a bare `uuid` with **no FK constraint**, inconsistent with `broker_id`/`market_id` on the same table which are both real FKs; looks like an oversight.

### Camera
`camera_batches`/`camera_photos` — both clean, tracked, well-scoped; per project memory, the migration itself may still be pending on production (see §23).

### CRM (out of deep-audit scope per task framing)
`crm_orgs`, `crm_profiles`, `crm_accounts`, `crm_contacts`, `crm_pipelines`, `crm_pipeline_stages`, `crm_deals`, `crm_activities`, `crm_calls`, `crm_tasks`, `crm_notes`, `crm_tags`/`crm_account_tags`, `crm_documents` — all from `20260557000000_crm_foundation.sql`, fully multi-tenant (`org_id` everywhere), the only module with real RLS policies. Per the user's own project memory this module has evolved substantially since that foundation migration (contacts split to own tab, operational-profile rebuild, calendar, activity log, BOL tab, etc.) — those later migrations were intentionally not read in this pass.

### Cross-cutting schema observations
- **No native Postgres enum types anywhere** — every constrained-value column is `text` + `CHECK`, or in several cases (`loads.status`, `load_documents.kind`, `payments.method`) not even that, relying entirely on application-level constant sets. Several CHECK constraints were redefined multiple times as the allowed-value set grew, sometimes with inline data-migrating `UPDATE`s bundled into the same migration file.
- **IDs/timestamps:** near-universal `uuid primary key default gen_random_uuid()` + `created_at timestamptz default now()`, except two singleton tables (`dispatch_settings`, `reach_settings`) using `id boolean primary key default true`. `updated_at` maintenance is inconsistent — some tables use a shared trigger (`touch_updated_at()`, and a near-identical CRM-scoped duplicate `crm_set_updated_at()` — two functions doing the same thing), others set it by hand in application code with no trigger backstop.
- **Soft-delete pattern:** `deleted_at` (nullable) is dominant, sometimes paired with `delete_after` for a future purge job that does not appear to be implemented anywhere in the tracked migrations or application code (**unverified**: could exist as an external Supabase cron function). Adoption is inconsistent — several tables (`bills_of_lading`, `shipment_intake_uploads`, `dispatch_events`, `repair_services`) have no `deleted_at` at all.
- **JSONB usage:** appropriate for genuinely variable-shape data (`dispatch_events.payload`); questionable where it substitutes for a child table (`broker_contacts.phones`/`.emails`) or duplicates a shape across tables with no shared type (`accessorials` on two tables).
- **Denormalization:** extensive and largely deliberate — the same address/contact block is duplicated as a point-in-time snapshot up to 4 times across the pipeline (`quote_requests` → `shipment_intake` → `finalized_quotes` → `bills_of_lading`), by explicit design so a customer's historical documents don't retroactively change if a later record is edited. No normalized "party/address" model exists anywhere in the schema — a clear rebuild candidate if immutability of historical documents can be achieved another way (e.g. explicit snapshotting at the ORM layer instead of full column duplication).
- **No views found anywhere in the migration history.** No explicit `CREATE EXTENSION` statements — `gen_random_uuid()` usage implies `pgcrypto`, enabled implicitly by Supabase rather than declared.

---

## 29. Modal inventory

- **Dashboard:** Countdown breakdown (read-only), Countdown new/edit (Label*, Subtitle, Target amount*, Target date*), Farm a Broker Contact (MC+lookup, contact name/phone/email, origin/destination city+state typeahead, backhaul-lane checkbox), Active-load doc upload (multi-file, BOL routes to scanner, POD forces rear-camera confirm).
- **Load Board / Load detail:** Add/Edit Load (status, load #, broker*, FMCSA lookup, origin/destination ZIP*, pickup/delivery date, rate*, loaded miles auto-computed+editable, trip select/create, dispatcher contact), BOL Scanner (4-corner crop, dewarp, color modes, client-built multi-page PDF), Add Expense (category*, amount*, note), Cancel/TONU (TONU $ amount default 150, or no-charge cancel), Delete Load confirm, BOL Signer (4-step place/sign/confirm/save).
- **Trips:** New Trip (name*, start date/time*, optional end date/time, notes), Edit Trip (name*, status, dates, notes, delete).
- **Brokers:** Edit Broker (name*, status, type, mc/dot, phone, email, office, timezone, authority, insurance/w9/ten99, notes, factoring), Add/Edit Contact (name*, title, repeatable phones/emails, is_backhaul), Lanes overview (read-only).
- **Reach:** Setup (from name, truck line, reply-to email, show-exact-town toggle, default style), Confirm Send (shared by real + test sends — subject/body preview + per-recipient checkboxes).
- **Email Broker:** Confirm-send inline card, Sent-email viewer (read-only), post-send Add-Broker prompt (MC+lookup, broker/company, phone).
- **Quote workspace:** Document viewer/resend (`DocumentViewButton`), full-screen document preview with Send/Rebuild (`PreviewModal`, shared by Range/Finalized/BOL workspaces).
- **Maintenance:** Log Service (create+edit shared component — service date*, odometer, repeatable parts [name*, category, position, reminder interval, set/part-group], receipt upload, total cost, notes; edit mode adds destructive delete).
- **Expenses:** New/Edit Expense slide-over (vendor*, amount*, category, payment method, frequency-dependent date fields, tags, autopay, notes, non-functional attachments stub), Payment Methods dialog (nickname*, type, last-4, default).
- **Files/Maintenance/Camera:** shared full-screen `DocViewer` (view/zoom/download/delete/parent-link) — the one document-viewing primitive reused across three otherwise-unrelated features.

---

## 30. Form inventory

Beyond the modal-hosted forms above: Settings' Fuel Defaults (MPG, $/gal, factoring %) and Net Profit Goals (monthly $, annual $) forms; the Load Detail page's three independently-collapsible inline-edit cards (Load details, Odometer & status, Financials); the Trip Detail odometer-bookends form; Reach's inline Subject/Message editor (auto-saves as the style default on blur); the Quote workspace's Details tab (18-key debounced auto-save form, full-payload-on-every-save); the Login form (email, password, remember-me); Reset/Update Password forms; the Quick Add Broker form (MC+lookup, broker/company, dispatcher contact, origin/destination ZIP, posted rate); the Expenses CSV import (file picker, client-parsed).

---

## 31. Server action / API route inventory

**Route handlers (`route.ts`, outside the standard page tree):**
`admin/logout/route.ts` (POST), `admin/camera/[batchId]/export/pdf/route.ts` (GET), `admin/camera/[batchId]/export/zip/route.ts` (GET), `admin/quotes/[id]/bol-email/[bolId]/route.ts`, `admin/quotes/[id]/bol-pdf/[bolId]/route.ts`, `admin/quotes/[id]/estimate-email/[estimateId]/route.ts`, `admin/quotes/[id]/estimate-pdf/[estimateId]/route.ts`, `admin/quotes/[id]/finalized-quote-email/[finalizedQuoteId]/route.ts`, `admin/quotes/[id]/finalized-quote-pdf/[finalizedQuoteId]/route.ts`.

**External REST endpoints called from admin client components:** `GET /api/admin/fmcsa?mc=|dot=`, `GET /api/admin/dispatch/geo?o=&d=|zip=`, `GET /api/admin/dispatch/cities?q=` (all out of this audit's file-read scope — referenced by URL only from the calling components; **needs a follow-up read** of their implementations under `src/app/api/admin/**`).

**Server actions by module (full file list, cross-referenced against every cluster above):**
`alert-actions.ts`, `countdown-actions.ts`, `farm-contact-actions.ts`, `settings/actions.ts` — Dashboard/Settings (§2, §24).
`dispatch/loads/actions.ts` — Load Board/Detail/Receivables (§3, §4, §17): `createLoad`, `updateLoad`, `updateLoadStatus`, `updateLoadOdometers`, `updateLoadDetails`, `addLoadExpense`, `deleteLoadExpense`, `cancelLoad`, `createLoadDocUploadUrl`, `recordLoadDocuments`, `deleteLoadDocument`, `signBolRole`, `softDeleteLoads`, `deleteLoad`, `markLoadPaid`, `markLoadUnpaid`.
`dispatch/trips/actions.ts` — Trips (§5, §6): `createTrip`, `updateTrip`, `deleteTrip`, `softDeleteTrips`, `setTripStatus`, `updateTripOdometer`.
`dispatch/brokers/actions.ts`, `dispatch/brokers/quick-add/actions.ts` — Brokers (§8): `createBroker`, `updateBroker`, `softDeleteBroker`, `addBrokerContact`, `updateBrokerContact`, `deleteBrokerContact`, `quickAddBrokerLane`.
`dispatch/email-broker/send-actions.ts` — Email Broker (§9): `sendBrokerEmail`, `sendBrokerEmailTest`.
`dispatch/reach/actions.ts`, `dispatch/reach/send-actions.ts` — Reach (§10): `resolveLocation`, `updateReachSettings`, `updateReachTemplate`, `ensureReachTemplate`, `saveReachStyleEmail`, `setContactInclude`, `sendReach`, `sendReachTest`.
`quotes/actions.ts`, `quotes/bol-actions.ts`, `quotes/finalized-quote-actions.ts`, `quotes/payment-actions.ts` — Quote workspace (§13, full signature list given there).
`applications/actions.ts` — Applications (§15): `softDeleteApplication(s)`, `restoreApplication(s)`, `permanentlyDeleteApplication(s)`.
`expenses/actions.ts` — Expenses (§18): `createExpense`, `updateExpense`, `deleteExpense`, `duplicateExpense`, `archiveExpense`, `restoreExpense`, `skipNextPayment`, `getExpenseActivity`, `bulkDeleteExpenses`, `bulkArchiveExpenses`, `bulkChangeCategory`, `importExpenses`, `createExpenseAccount`, `updateExpenseAccount`, `deleteExpenseAccount`.
`maintenance/actions.ts` — Maintenance (§21): `createReceiptUploadUrl`, `logService`, `updateService`, `deleteReceipt`, `deleteService`, `deletePart`, `attachRelated`, `detachRelated`, `setReminderDismissed`.
`files/actions.ts` — Files (§22): `signFiles`, `deleteFile`.
`camera/actions.ts` — Camera (§23): `createCameraBatch`, `renameCameraBatch`, `createCameraUploadUrl`, `recordCameraPhoto`, `deleteCameraPhoto`, `deleteCameraBatch`.
`_shell/search-actions.ts` — Global search (§27): `globalSearch`.

---

## 32. Cross-cutting findings

These are the issues that recur across multiple modules and therefore matter most for the `/portal` rebuild's architecture, roughly in priority order:

1. **TONU-load net profit is computed five different ways** across the Load Board (§3, raw fee), Load Detail (§4, factored), Trip rollup (§6, $0/excluded), Calendar (§7, $0), and Performance (§20, unconditional factoring). This is a verified, reproducible correctness bug, not a hypothesis — the same load can show three or more different net figures depending which screen is open. **Highest-priority item to fix, not just carry forward, in the rebuild.**
2. **Two entirely separate, non-reconciled "Accounts Receivable" concepts** exist side by side: carrier-load A/R (Receivables §17, recomputed a third time on Performance §20) versus customer-quote A/R (Accounting §19). No shared definition, no cross-reference.
3. **Accounting's MTD "Collected" figure silently undercounts past 100 payments/month** (§19) — a genuine correctness bug from a hard-capped query, not a display-only limitation.
4. **The most important tables in the schema (`loads`, `brokers`, `trips`, and six others) have no tracked-migration history at all** (§28) — the rebuild's data-layer work must start from a live-DB schema pull, not this repo.
5. **Full, unbounded table scans are the dominant scalability pattern app-wide**, worst on Performance (entire load history, every visit), Calendar (entire `loads` + `load_expenses`, every visit), Files (`loadAllFiles()` unions three growing tables), and the Brokers layout/detail pages (entire `loads`/`load_expenses`, every navigation). All are currently tolerable only because of single-truck, single-operator scale.
6. **Substantial confirmed dead code** in the quote-detail workspace (§13) — 12+ files from a prior redesign pass, still imported for their types but never rendered, several hundred lines of maintained-but-unreachable UI. The single largest concrete cleanup opportunity found in this audit.
7. **Demo-mode isolation (§1, §25) is enforced entirely by convention** (`blockedByDemo()` as the first line of every action), with no structural/type-level guarantee that a newly-written action includes it. Currently 100% compliant across every audited action, but this is a standing process risk, not a solved problem.
8. **No RLS-based authorization anywhere in the admin domain** (§28) — every table is "RLS on, zero policies," meaning the Next.js server-action layer sitting in front of an unrestricted service-role client is the *entire* authorization boundary. Acceptable for a single-admin app; would need to become real per-row/per-org policies for any multi-user rebuild.
9. **Two full generations of the maintenance schema coexist live** (§28) — the legacy `maintenance_*` tables were never dropped after the `repair_*` rework, and at least one of them (`maintenance_expenses`) was itself live-DB-only until a defensive "drift guard" migration reconstructed it — a second confirmed instance of untracked live-DB schema drift beyond the `loads`/`brokers` cluster.
10. **Duplicated helper functions are pervasive in the email/PDF pipeline** (§14) — `escapeHtml`, `shortRef`, `resolveFrom`/`resolveReplyTo`, and several email-layout helpers each exist in 2–3 independent copies rather than a shared module.
11. **Two independent, hand-synced navigation configs** (§27, desktop sidebar vs. mobile bottom-nav/MoreSheet) with no shared source of truth — a structural drift risk for any new route added going forward.
12. **`app_settings` is a fully orphaned table** (§28) with zero references anywhere in the codebase — needs direct live-DB inspection before the rebuild assumes it's safe to ignore or drop.
13. **`camera_batches`/`camera_photos` may not yet be applied to production** (§23, per the user's own project memory and confirmed by defensive missing-table handling throughout the Camera code) — verify before the rebuild treats Camera as a fully-live feature.
14. **Several small, single-purpose Supabase-key-authenticated APIs** (`/api/admin/fmcsa`, `/api/admin/dispatch/geo`, `/api/admin/dispatch/cities`) are called from multiple otherwise-unrelated features (Add Load, Quick Add Broker, Reach, Dashboard's Farm Contact modal) but their own implementations were not read in this pass — **needs a follow-up read** before the rebuild assumes their exact contracts.
