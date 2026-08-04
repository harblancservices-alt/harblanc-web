# `/portal` V2 — Comparison & Roadmap

**Purpose of this document:** the decision record for the rebuild. It takes every feature inventoried in [`current-tms-audit.md`](./current-tms-audit.md) (V1, the existing `/admin` app) and the page-by-page proposal in [`v2-design.md`](./v2-design.md) (V2, the `/portal` rebuild) and sorts every single item into KEEP / REMOVE / MERGE / REDESIGN / MISSING, cross-checked against the audit's full inventory (§§1–32) so nothing is silently dropped. It then lays out the future roadmap beyond V2's initial scope — what a "rival McLeod/AscendTMS/Tailwind/Alvys, but built for one owner-operator" product grows into next.

**How to read the priority tags:** **High** = correctness bugs, data-integrity risk, or the single biggest lever for the stated "rival the enterprise TMS" goal. **Medium** = real user-facing or architectural value, not urgent. **Low** = worth doing, not worth delaying anything else for.

**Companion docs:** [`current-tms-audit.md`](./current-tms-audit.md) (what V1 does, exactly, §1–32), [`current-tms-prd.md`](./current-tms-prd.md) (prioritized weaknesses), [`v2-design.md`](./v2-design.md) (the full V2 page-by-page spec this document evaluates against).

---

## Table of contents

1. [Features to KEEP](#1-features-to-keep)
2. [Features to REMOVE](#2-features-to-remove)
3. [Features to MERGE](#3-features-to-merge)
4. [Features to REDESIGN](#4-features-to-redesign)
5. [MISSING features — gaps V1 never had](#5-missing-features--gaps-v1-never-had)
6. [Future roadmap](#6-future-roadmap)
   - [6.1 Enterprise](#61-enterprise-high)
   - [6.2 AI](#62-ai-high)
   - [6.3 Automation](#63-automation-high)
   - [6.4 Analytics](#64-analytics-medium)
   - [6.5 Accounting](#65-accounting-high)
   - [6.6 Dispatch](#66-dispatch-medium)
   - [6.7 Maintenance](#67-maintenance-low)
   - [6.8 Compliance](#68-compliance-high)
   - [6.9 Safety](#69-safety-medium)
   - [6.10 CRM](#610-crm-medium)
   - [6.11 Customer portal](#611-customer-portal-medium)
   - [6.12 Broker portal](#612-broker-portal-low)
   - [6.13 Driver portal](#613-driver-portal-medium)
   - [6.14 Owner portal](#614-owner-portal-low)
   - [6.15 Reporting](#615-reporting-medium)
7. [Coverage check](#7-coverage-check)

---

## 1. Features to KEEP

Carried into V2 essentially as-is — proven automations, sound information design, or correct logic that a rebuild has no reason to touch.

| # | Feature (V1 source) | Why it stays | Priority |
|---|---|---|---|
| 1 | FMCSA MC/DOT lookup + lane-mileage ZIP-pair geo lookup on Add/Edit Load (audit §3) | Real typing-saved automation, no correctness issues found | High |
| 2 | Quick Add broker/contact/lane fast-capture form (audit §8) | Purpose-built for "grab it off a load board in seconds," genuinely good | High |
| 3 | Odometer-driven load status derivation — no separate status dropdown (audit §4) | A sound, correct pattern; V2 only adds a one-tap surface on top, doesn't change the model | High |
| 4 | BOL two-independent-signer-role model, never overwrites the other's stamp (audit §4, §14) | Correctly solves a genuinely subtle problem | High |
| 5 | Preview-bytes-equal-sent-bytes discipline for every customer email (audit §11, §14) | Exactly the right invariant for trust in what was actually sent | High |
| 6 | Performance "Insights" rules engine — minimum-sample/effect-size gates, max 6, priority-ranked (audit §20) | Deliberately avoids manufacturing noise from thin data; a genuinely strong feature | High |
| 7 | Federal holidays computed algorithmically, not stored (audit §7) | No reason to store what can be computed correctly | Low |
| 8 | Lazy-signing pattern for storage URLs (Files, Camera) (audit §22, §23) | Correct scalability lever, already well-executed | Medium |
| 9 | Canonical document naming (`doc-name.ts`), shared display/write time (audit §4, §22) | Single source of truth already achieved for this concern | Medium |
| 10 | 30-day soft-delete + trash + restore pattern (Quotes, Applications) (audit §15, §16) | Sound retention model; V2 only fixes the missing purge job (see §4 REDESIGN) | Medium |
| 11 | Three-tier document hierarchy: Range Proposal → Finalized Quote → BOL, each with its own renderer/PDF/audit-view route (audit §14) | Correct conceptual model for the pipeline | High |
| 12 | `suggestedNext()` — hints the likely next pipeline state, never enforces (audit §13) | Correctly acknowledges real dispatch is messier than a linear funnel | Medium |
| 13 | CSV export (Load Board, Expenses) and CSV import (Expenses) | Useful, low-risk; V2 fixes CSV import's silent-skip weakness (see §4) but keeps the feature | Low |
| 14 | Load Inquiry pop-out window mode (460×860, chrome-less) (audit §9) | Genuinely useful for sitting beside load-board browser tabs | Low |
| 15 | Reach's near-zero-typing automation core: posture auto-detection, market matching, recipient auto-build (audit §10) | Explicitly called out in v2-design.md as "genuinely excellent automation, no reason to rebuild differently" | High |
| 16 | Reach's 4-day per-broker suppression window (audit §10) | Correct anti-spam guard; V2 only adds a manual override (see §4) | Medium |
| 17 | Enumeration-safe password reset (generic success message regardless of email existing) (audit §26) | Correct security pattern already in place | Medium |
| 18 | Maintenance parts-first model: services hold N parts, 7 fixed categories + Preventative lens (audit §21) | Sound conceptual model, money deliberately de-emphasized per owner preference | Medium |
| 19 | Maintenance auto-categorization (`categoryForText()`) and auto-linked "related parts" graph (audit §21) | Correct, low-maintenance automation | Medium |
| 20 | Camera batch capture → combined PDF/ZIP export, client-side JPEG compression (audit §23) | Well-built, purpose-fit mobile flow | Medium |
| 21 | Countdown-goal progress widget + empty-truck "farm a broker contact" nudge (audit §2) | Genuinely good owner-facing ideas; carried forward "unchanged in spirit" per v2-design.md | Medium |
| 22 | Dark/light theme + orientation + UI-scale appearance settings (audit §24) | No issues found; kept as-is | Low |
| 23 | Demo mode's core promise — one toggle, persistent banner, curated internally-consistent fake dataset (audit §1, §25) | The owner's explicit #1 requirement; only the *enforcement mechanism* changes (see §4) | High |
| 24 | `dispatch_events` append-only audit timeline per lead (audit §13, §28) | Sound event-sourcing pattern for the pipeline | Medium |
| 25 | `computePaymentSummary()` deriving `awaiting_payment → ready_to_dispatch` live rather than storing a boolean (audit §13) | Correct, avoids state drift — kept exactly, only the null-total footgun gets a visible banner (see §4) | Medium |

---

## 2. Features to REMOVE

Confirmed-dead code, vestigial schema, or deliberately-dropped UX theater. Each entry states why it's safe to drop.

| # | Item (V1 source) | Why remove | Priority |
|---|---|---|---|
| 1 | `dashboard-view.ts` (audit §2) | Confirmed dead — live dashboard uses `alerts.ts` instead; only referenced by `pipeline.ts`. Superseded by the [notification model](./v2-design.md#notification-model) | Medium |
| 2 | 12+ dead files in the quote-detail workspace: `WorkspaceHeader`, `WorkspaceTabs`, `QuoteWorkspaceTabs`, `IdentityRow`, `LaneHero`, `StatusHero`, `OpsStrip`, `QuoteHero`, `OperatorHeader`, `LoadSummaryCard`, `WorkspaceSection`, `WorkflowProgress`, `WorkflowProgressBar`, the `<DispatchLifecycle>` JSX render (audit §13) | Grep-verified zero live call sites, imported only as types or not at all; several hundred lines of maintained-but-unreachable code from a prior redesign pass | High |
| 3 | Client-side `localStorage` login lockout (5 attempts/60s) (audit §1, §26) | Explicitly UX-only theater, trivially bypassed by clearing storage; V2 relies on Supabase Auth's real server-side rate limiting instead | Medium |
| 4 | `reach_markets` DB table (audit §10, §28) | Confirmed vestigial at runtime — `loadReachMarkets()` always returns the hardcoded array in `markets.ts`; the table has zero effect. Drop it rather than wire it to CRUD nobody asked for (V1's own weakness note leaves this as an open question — resolving it as "drop" here since no owner requirement exists for editable markets) | Low |
| 5 | `finalized_quotes.confirmation_token` unused column (audit §28) | Explicitly noted as "dead/unused infrastructure" in the schema audit | Low |
| 6 | `email_presets` table (audit §28) | Legacy infrastructure superseded by `reach_*` — same "template email to a broker" problem solved twice; confirm with owner it's inactive, then drop | Low |
| 7 | Legacy `maintenance_items`/`maintenance_log`/`maintenance_attachments`/`maintenance_expenses` tables (audit §28) | Fully superseded by `repair_*` after a completed one-time data migration; left in place untouched today, pure carry-forward risk | Medium |
| 8 | `app_settings` orphaned table (audit §28) | Zero references anywhere in code or migrations; verify against live DB, then drop | Low |
| 9 | Countdown modal's deliberate dark-theme break (audit §2) | V1 documents this as intentional, but V2's design system has zero tolerance for per-surface theme exceptions — removed as part of the design-system consolidation, not carried forward as a "documented exception" | Low |
| 10 | Broker `phones`/`emails` legacy scalar columns, once the JSONB-array migration is finished (audit §8, §28) | Currently two representations kept in sync by hand; V2 finishes the migration V1 left half-done and drops the scalar columns | Medium |
| 11 | `bol_signatures` storing signature PNGs as inline base64 **text** in the row (audit §28) | Bloats table/backups; V2 moves this to Storage like every other document, consistent with the rest of the schema | Medium |
| 12 | `touch_updated_at()` / `crm_set_updated_at()` duplicate triggers (audit §28) | Two functions doing the same thing; consolidate to one, drop the redundant copy | Low |

---

## 3. Features to MERGE

V1 things that collapse into a single V2 surface, config, or code path.

| # | V1 sources | V2 merged surface | Why | Priority |
|---|---|---|---|---|
| 1 | Receivables (§17, carrier-load A/R) + Accounting's A/R figure (§19, customer-quote A/R) | [Receivables](./v2-design.md#20-receivables) — two clearly-labeled sections, one page | PRD priority #2: two unreconciled A/R concepts computed independently in three places (Receivables, Performance, Accounting) become one page with one shared definition; Accounting page keeps only the Stripe-specific payments/payouts view and links out for the A/R figure | High |
| 2 | Desktop sidebar (`PortalSidebar`) nav list + mobile bottom-nav/`MoreSheet` nav list (audit §27) | One `nav.config.ts` array, rendered by all four surfaces (desktop sidebar, mobile bottom nav, mobile More sheet, command palette) | Confirmed "two independent, hand-synced nav-destination lists" with real drift risk — this is cross-cutting finding #11 in the PRD | High |
| 3 | Email Previews (`/admin/previews`, `/admin/previews-2`) hand-maintained customer-page **copies** (audit §11) + the real customer-facing confirm pages (audit §18/§14) | One component set, rendered `readOnly` for the Preview Lab and live for real customers ([§18](./v2-design.md#18-customer-facing-confirm-pages)) | V1 explicitly warns the preview twins "can drift if the real page changes and the twin isn't updated" — merging eliminates the drift risk structurally, not by discipline | Medium |
| 4 | Load Inquiry's in-memory-only send history (audit §9) + Reach's persisted `reach_sends` suppression log (audit §10) | One shared send-log table/schema, tagged by source, used by both tools ([§11](./v2-design.md#11-load-inquiry-email-broker)) | V1: "a failed Resend send leaves no record anywhere but Resend's own dashboard" for Load Inquiry specifically — merging onto Reach's existing pattern closes that gap for free | Medium |
| 5 | Load Inquiry's hardcoded MC/DOT/phone/reply-to constants (audit §9) + Reach's `reach_settings`-driven company identity (audit §10) | One shared company-identity settings object powering every outbound broker email | V1 explicitly flags this as "a duplicate source of truth that can silently drift" | Medium |
| 6 | 5 near-identical Maintenance page loaders (Home/Category/Preventative/Set/Detail, audit §21) | One shared `loadMaintenanceData()` | "A fix in one loader is easy to miss in the other four" — confirmed duplication-of-logic risk | Medium |
| 7 | 3 near-identical PDF-render wrappers: `renderBolPdf.ts`, `renderFinalizedQuotePdf.ts`, `renderRangeProposalPdf.ts` (audit §14) | One generic `renderPdfBuffer(Component, data)` helper | Explicit audit opportunity; same lazy-import-for-fault-isolation trick, no reason for 3 copies | Low |
| 8 | Triplicated helpers across the email/PDF pipeline: `escapeHtml` (×3), `shortRef`/`num`/`parseAccessorials` (×2), `resolveFrom`/`resolveReplyTo` (×3), `sectionHeader`/`fieldTable`/`rateSummaryTable`/`bandWhite` (×2) (audit §14) | Shared modules in `lib/email/` and `lib/pdf/` | Cross-cutting finding #10 in the PRD — pervasive, low-risk, high-value consolidation | Medium |
| 9 | Two unreconciled "urgency" vocabularies: `UrgencyChipKind` (Operations hub's `computeUrgency()`) vs. the Dashboard's own `AlertGroupKey`/alert-string-keying (audit §2, §12) | One rules registry (`lib/notifications/rules.ts`) feeding the [notification model](./v2-design.md#notification-model), the Dashboard's Needs Attention section, the Operations feed, and nav badges | Explicitly called out in v2-design.md as the fix for the Dashboard/Operations urgency-vocabulary drift | High |
| 10 | Files/Maintenance/Camera's shared `DocViewer` (already merged in V1 — confirmed as the one correctly-reused pattern) (audit §29) | Stays merged, extended to any new document-bearing surface added in V2 | Already correct — listed here to confirm it's *not* accidentally un-merged during the rebuild | Low |
| 11 | Files' 3 independent delete code paths (load docs, maintenance receipts, intake uploads) reimplementing each source's own delete logic (audit §22) | Each source's canonical delete action, called directly instead of reimplemented a 4th time | Audit explicitly flags this as unnecessary duplication now that Files is being rebuilt anyway | Medium |

---

## 4. Features to REDESIGN

Kept in concept, but the V1 implementation approach changes. Grouped by module; V1 approach → V2 approach.

### 4.1 The single highest-priority redesign: one money engine

| V1 approach | V2 approach | Priority |
|---|---|---|
| TONU-load net profit computed **five independent ways** across Load Board (raw fee), Load Detail (factored), Trip rollup ($0/excluded), Calendar ($0), Performance (factoring hardcoded `true` regardless of broker flag) — a verified, reproducible bug (audit §3, §32 #1) | One `lib/money/*` module; `computeLoadNet()` is the only function permitted to touch `rate`/`tonu_amount`/expenses/factoring math. TypeScript module boundaries make bypassing it require an explicit, greppable escape hatch, not a quiet duplicate. Every screen renders through it — Board, Detail, Trip, Calendar, Performance | **High** |

### 4.2 Per-module redesigns

| Module | V1 approach | V2 approach | Priority |
|---|---|---|---|
| Dashboard | 16 parallel unbounded Supabase queries fire on every visit, `force-dynamic`, zero caching (audit §2) | Notification set computed by one scheduled/materialized pass or short-TTL cache; only Active Loads and Goal pace remain live, narrowly-scoped queries ([§3](./v2-design.md#3-dashboard--today)) | High |
| Dashboard | Alert dismissal keyed by a fragile "sorted gap list as a string" (audit §2) | Real `notification_id` per occurrence via the notification model | Medium |
| Load Board | Entire `loads` history + unfiltered `load_expenses` shipped to client, sliced client-side by month; CSV export is a full client-side dump (audit §3) | Server-side month filtering, real pagination, CSV export operates on the filtered server query ([§4](./v2-design.md#4-load-board)) | High |
| Load detail | Three independently-collapsible cards, each with its own edit toggle, no unified edit mode (audit §4) | One unified inline-edit surface — click a value, it becomes an input, `⌘Enter`/blur saves ([§5](./v2-design.md#5-load-detail)) | Medium |
| Load detail | Signed URLs (1hr TTL) re-minted for every document on every visit regardless of change (audit §4) | Client-side cache for the page session | Low |
| Load detail | TONU dialog pre-fills $150, easy to submit unadjusted (audit §4) | Amount field must be touched (focused+blurred or explicitly confirmed) before a non-zero default submits | Medium |
| Load detail / Brokers | `window.confirm()` as the only delete guard; broker soft-delete has **no** confirm dialog at all (audit §4, §8) | Real confirm dialog app-wide, surfacing consequence detail (e.g. broker delete shows count of contacts/lanes that would be orphaned) ([§10](./v2-design.md#10-broker-detail)) | Medium |
| Trips list | Month-KPI strip computed **client-side** over full unbounded trip history; row click is `router.push`, not a real `<Link>` (audit §5) | Server-computed month-scoped KPI strip; real `<Link>` navigation ([§6](./v2-design.md#6-trips-list)) | Medium |
| Trips list | Fully separate desktop-table / mobile-card render paths (audit §5) | One `<DataList>` primitive rendering one data model into table-row or stacked-card via CSS | Medium |
| Trip detail | PC-mile gap-filling silently produces $0 on a missing odometer reading, no operator-visible warning (audit §6) | Explicit "≈ incomplete, missing reading on Load #X" flag next to the PC figure ([§7](./v2-design.md#7-trip-detail)) | High |
| Trip detail | Odometer-bookends save has no inline validation, unlike the trip-dates form (audit §6) | Same inline validation as trip-dates form | Low |
| Calendar | Entire `loads` + `load_expenses` tables pulled unfiltered on every visit, purely to render one month — the single heaviest data-fetch pattern in the app (audit §7) | Query windowed to viewed month ±1 week ([§8](./v2-design.md#8-calendar)) | High |
| Calendar | No search/filter/jump-to-date beyond prev/next/Today (audit §7) | Real jump-to-date control added | Low |
| Brokers list/layout | Entire `loads` table re-fetched on every navigation within the broker section (audit §8) | Server-side search/sort, scoped queries, no full-table re-fetch on navigation ([§9](./v2-design.md#9-brokers-list)) | High |
| Broker detail | Lanes aggregate by raw `origin → destination` string, fragmenting differently-formatted duplicates (audit §8) | Server-side normalization to ZIP-prefix keys | Medium |
| Broker detail | Quick Add gives no signal distinguishing "matched existing" from "created new" (audit §8) | Visible "matched existing / created new" confirmation chip | Low |
| Broker detail | `name_key` dedupe on brokers/trips has no unique index — race-prone read-then-write (audit §28) | Real unique index/constraint backing the dedupe | Medium |
| Broker detail | "Documents" tab tracks only free-text reference strings (insurance/w9/ten99); no actual file upload wired (audit §8) | Real file upload for compliance documents, feeding the future [Compliance](#68-compliance-high) module | Medium |
| Reach | Setup hidden in a separate modal from the main Send flow; held-back (recently-reached) brokers are invisibly excluded with no override (audit §10) | Setup folded into the main flow; visible one-click "include anyway" override per held-back broker ([§12](./v2-design.md#12-reach-send-backhaul)) | Medium |
| Operations hub / Quote workspace | Two unreconciled urgency vocabularies (see [§3 Merge #9](#3-features-to-merge)) | `computeUrgency()` becomes the shared rules registry, provably the same computation everywhere it's flagged | High |
| Quote detail workspace | Details tab posts the **full** 18-key form on every debounced auto-save, clobbering unrelated fields on any future partial-post caller (audit §13) | Posts only changed keys ([§14](./v2-design.md#14-quote-detail-workspace)) | Medium |
| Quote detail workspace | `null total_amount` silently and permanently blocks the `awaiting_payment → ready_to_dispatch` auto-advance with no operator-visible signal (audit §13) | Visible "total not set — auto-advance paused" banner | Medium |
| Finalized Quote composer | PDF shows full pricing breakdown, email shows total only — a silent divergence baked into two separate renderers (audit §14) | Explicit per-quote toggle the operator controls, not a hardcoded asymmetry ([§16](./v2-design.md#16-finalized-quote-composer--send)) | Low |
| Applications / Quotes trash | `delete_after` purge window is set but no automated purge job was found anywhere in the audited code (audit §15, §16) | Real scheduled job actually acting on `delete_after` | Medium |
| Accounting | MTD "Collected" figure hard-capped at 100 most-recent payment rows — silently undercounts past that (audit §19, a **confirmed correctness bug**) | Real aggregate query, no row cap ([§22](./v2-design.md#22-accounting)) | High |
| Expenses | Quarterly/annual frequencies have no stored anchor date, so `nextChargeLabel` is always null for them (audit §18) | Real anchor-date column, `nextChargeLabel` works for every frequency ([§21](./v2-design.md#21-expenses)) | Medium |
| Expenses | CSV import silently skips malformed rows with no per-row error report (audit §18) | Per-row error report on import | Medium |
| Expenses | Saved filters are `localStorage`-only, lost across devices (audit §18) | Server-persisted, `user_id`-scoped saved filters | Low |
| Expenses | Payment-method "Default" exclusivity is app-code-enforced, race-prone, no partial-unique-index backstop (audit §18, §28) | DB-level partial unique index | Medium |
| Performance | Entire load history fetched and re-aggregated client-side on every period-picker toggle, zero server-side date filtering — the single biggest scalability risk in the app (audit §20) | Server-computed period rollup; period picker stays client-instant, but toggles a server query ([§23](./v2-design.md#23-performance)) | High |
| Performance | Insights engine's thresholds are hardcoded constants (audit §20) | Owner-configurable in Settings | Low |
| Maintenance | `repair_links.unique(a_id, b_id)` doesn't actually prevent a duplicate reverse-order pair, relying on app-code insert-ordering discipline (audit §28) | DB constraint that normalizes ordering, or a real composite check | Low |
| Files | `loadAllFiles()` pulls entire tables across three growing sources, unions them, ships all to the client — display is paginated but the fetch isn't (audit §22) | Server-side search/pagination at the query level, not just display level ([§25](./v2-design.md#25-files)) | High |
| Camera | Export "exporting" spinner clears via a hardcoded 4-second `setTimeout`, not tied to actual completion (audit §23) | Real completion signal ([§26](./v2-design.md#26-camera)) | Low |
| Settings | Business-defaults forms are plain `<form action>` submissions with no inline validation/error surface, unlike Dashboard's countdown forms (audit §24) | Same inline-error/optimistic-save pattern as Dashboard ([§27](./v2-design.md#27-settings)) | Low |
| Settings | Sign-out sits at the very bottom of a long scrolling page on mobile (audit §24) | Account/sign-out reachable from the shell's account menu; kept near the top of Settings on mobile ([§27](./v2-design.md#27-settings)) | Low |
| Demo mode | Isolation enforced entirely by convention — `blockedByDemo()` must be remembered as literally the first line of every mutating action, no structural backstop (audit §1, §25) | Single `DataSource` interface resolved once at the request boundary; `LiveDataSource`/`DemoDataSource` behind it; no page or action ever imports a Supabase client directly — structurally impossible to forget ([Demo mode](./v2-design.md#demo-mode)) | High |
| Login | "Remember me" implemented via a two-places-must-stay-in-sync workaround for an `@supabase/ssr` limitation (audit §1) | One documented helper at the cookie layer, not a hand-synced duplicate | Low |
| Update-password | Not in the middleware's public-path allowlist; relies on there being exactly one valid admin account to not misbehave with a second account (audit §26) | Middleware allowlists by recovery-session *type*, not by email match ([§2](./v2-design.md#2-password-reset--update)) | Medium |
| Shell / navigation | Inconsistent `prefetch={false}` application — sidebar disables it (citing a cookie-refresh loop), bottom-nav/MoreSheet don't follow the same discipline (audit §27) | Consistent `prefetch` policy app-wide, or the underlying cookie-refresh issue resolved so prefetch is safe everywhere | Low |
| Shell / navigation | Global search relies on the same unbounded `loadAllFiles()` aggregation as Files — every keystroke past 2 characters re-runs it (audit §27) | One indexed, paginated query powering both Files search and the command palette | Medium |
| Command palette | V1's `⌘K` only searches three tables, no action layer — can find a load but can't act on it (audit §27) | Merged search + actions + navigation surface; results grouped Actions → Records → Pages ([Command palette](./v2-design.md#command-palette--keyboard-shortcuts)) | Medium |
| Schema-wide | Odometer monotonicity, load-status derivation, demo isolation, "one default payment method" — all invariants enforced only in application code, not the database (audit §28, PRD priority #5) | Move the cheap ones (uniqueness constraints, CHECK constraints, DB triggers) into the database itself | Medium |
| Schema-wide | Ten of the most central tables (`loads`, `brokers`, `broker_contacts`, `trips`, `load_documents`, `load_expenses`, `dispatch_settings`, `recurring_expenses`, `expense_accounts`, `app_settings`) have no tracked-migration history at all (audit §28, PRD priority #3) | Live-schema pull (`pg_dump` / `supabase db pull`) as a **prerequisite** before any V2 data-layer work begins — this is not a page redesign, it's a blocking engineering task | High |

---

## 5. MISSING features — gaps V1 never had

Real capabilities a TMS meant to "rival McLeod/AscendTMS/Tailwind/Alvys" needs that V1 has no version of at all — distinct from the REDESIGN items above (which fix an existing-but-flawed feature). Items already resolved by the V2 page designs are marked accordingly; everything else rolls into the [future roadmap](#6-future-roadmap).

| # | Gap | Status | Priority |
|---|---|---|---|
| 1 | Partial payments — V1's `payment_status` is a strict unpaid/paid binary, no partial-amount or backdatable-date support (audit §17) | **Resolved in V2** — [Receivables](./v2-design.md#20-receivables) adds optional amount + backdatable date | High |
| 2 | Structured logging, error tracking, or any monitoring infrastructure (PRD §5 Observability) | Not addressed by any V2 page design — genuine gap | High — see [6.1 Enterprise](#61-enterprise-high) |
| 3 | Integration/e2e test suite — only isolated pure-logic unit tests exist today (PRD §5 Testing) | Not addressed by any V2 page design | High — see [6.1 Enterprise](#61-enterprise-high) |
| 4 | Automated purge job for soft-deleted records past `delete_after` | **Resolved in V2** — [Applications](./v2-design.md#19-applications) | Medium |
| 5 | Roles/permissions model — every table is "RLS on, zero policies," authorization is 100% the Next.js layer; no notion of more than one user (audit §1, §28) | Out of scope for V2 (single-operator by design) — future roadmap only | High — see [6.1 Enterprise](#61-enterprise-high) |
| 6 | Multi-truck / multi-driver support — Maintenance has no `vehicle_id` scoping anywhere, dispatch assumes one truck throughout (audit §21) | Out of scope for V2 — future roadmap | High — see [6.6 Dispatch](#66-dispatch-medium) |
| 7 | ELD/telematics integration (live GPS, hours-of-service data) | Never existed | High — see [6.9 Safety](#69-safety-medium), [6.6 Dispatch](#66-dispatch-medium) |
| 8 | Fuel-card integration / live diesel-price feed (currently a manually-set `dispatch_settings.diesel_price_per_gallon`) | Never existed | Medium — see [6.5 Accounting](#65-accounting-high) |
| 9 | Accounting-system export/sync (QuickBooks, Xero) — Expenses is explicitly "not connected to any bank or card feed" (audit §18) | Never existed | High — see [6.5 Accounting](#65-accounting-high) |
| 10 | Load-board API integration (DAT, Truckstop.com) for automated posting/searching | Never existed | Medium — see [6.3 Automation](#63-automation-high) |
| 11 | Cost-per-mile feature — `computeCostPerMile()` exists in `maintenance.ts` but is dead/unused, built for a feature that never shipped (audit §21) | Never surfaced | Low — see [6.4 Analytics](#64-analytics-medium) |
| 12 | Document OCR / auto-data-extraction from scanned BOLs or rate confirmations | Never existed | High — see [6.2 AI](#62-ai-high) |
| 13 | Route optimization / live ETA tracking | Never existed | Medium — see [6.6 Dispatch](#66-dispatch-medium) |
| 14 | Dedicated compliance module — IFTA, driver qualification files, DOT inspection records, permit tracking (broker "Documents" tab is free-text refs only, no expiration alerting) | Never existed | High — see [6.8 Compliance](#68-compliance-high) |
| 15 | Insurance-certificate expiration tracking/alerting for brokers (only free-text reference strings exist today, audit §8) | Never existed | Medium — see [6.8 Compliance](#68-compliance-high) |
| 16 | Public API / webhook layer for third-party integrations | Never existed | Medium — see [6.1 Enterprise](#61-enterprise-high) |
| 17 | Driver settlement statements (moot for a solo owner-operator today, real the moment a second driver exists) | Never existed | Medium — see [6.13 Driver portal](#613-driver-portal-medium) |
| 18 | Rate negotiation / RFP / bid-comparison tooling | Never existed | Low — see [6.10 CRM](#610-crm-medium) |
| 19 | Native mobile app or installable PWA with push notifications (today: responsive web only) | Never existed | Medium — see [6.1 Enterprise](#61-enterprise-high) |
| 20 | Customer self-service beyond one-shot token links — no persistent account, no shipment-history view for a repeat shipper | Never existed | Medium — see [6.11 Customer portal](#611-customer-portal-medium) |
| 21 | Broker self-service portal — brokers today are email-only recipients with zero account/login (audit §2 Personas) | Never existed | Low — see [6.12 Broker portal](#612-broker-portal-low) |
| 22 | Weigh-station / permit / oversize-load tracking | Never existed | Low — see [6.8 Compliance](#68-compliance-high) |
| 23 | AI-assisted anything — rate suggestion, lane-matching beyond static market radii, drafting, anomaly detection (Reach's market-matching is static-radius, not learned) | Never existed | High — see [6.2 AI](#62-ai-high) |

---

## 6. Future roadmap

Beyond V2's initial page-by-page scope. Each item is concrete and ranked; items are additive to the pages already specced in `v2-design.md`, not replacements for them. Sequencing note: **Enterprise** items 1–3 (observability, live schema, invariants) and **Accounting** item 1 (real transaction ledger) are prerequisites that make several other sections meaningfully safer to build — call this out to the owner before treating the rest of this list as a flat backlog.

### 6.1 Enterprise (High)

1. **[High]** Structured logging + error tracking (e.g. Sentry-class tool) — closes the single largest observability gap in the whole audited app; currently errors surface only as thrown exceptions or silently-swallowed try/catch blocks.
2. **[High]** Integration/e2e test suite covering the lead-to-cash pipeline and load lifecycle end-to-end — today only isolated pure-logic modules (`fuel.test.ts`, `trip-rollup.test.ts`, etc.) have coverage.
3. **[High]** Roles/permissions model with real per-row or per-org RLS policies — the entire authorization boundary today is one hardcoded `ADMIN_EMAIL`; needed the moment a second person (dispatcher, bookkeeper, second driver) touches the system.
4. **[Medium]** Public API + webhook layer (load created/updated, payment received, document signed) for third-party integrations (accounting software, load boards, telematics).
5. **[Medium]** Installable PWA with push notifications, or a native wrapper — the notification model (§ v2-design.md) already generates the right events; this is the delivery channel beyond in-app.
6. **[Low]** Audit log at the user-action level (who did what, when) — currently moot with one user, becomes necessary the moment roles exist (item 3).
7. **[Low]** SSO/MFA support — appropriate once the system has more than one authorized account.

### 6.2 AI (High)

1. **[High]** Document OCR / auto-data-extraction from scanned BOLs, rate confirmations, and driver-submitted receipts — directly extends the existing Camera scanning tool and the BOL-signing pipeline; the highest-leverage AI item because the scanning UI already exists.
2. **[High]** AI-assisted rate suggestion for quotes — surface a suggested range on the Estimate composer based on historical lane/broker data, as a suggestion the operator can override, never an auto-send.
3. **[Medium]** AI-drafted email replies/follow-ups in Reach and the quote pipeline (subject/body suggestions the operator reviews before sending — consistent with V2's existing "client always sees and can edit the exact send" pattern).
4. **[Medium]** Anomaly detection on load financials (e.g. flag a load whose net is an outlier vs. its lane/broker history) — a natural extension of the existing Insights rules engine, additive rather than a replacement for its deterministic gates.
5. **[Low]** Natural-language search in the command palette ("loads to Memphis last month that lost money") layered on top of the existing indexed search.
6. **[Low]** AI-assisted lane/market matching for Reach, replacing/augmenting the static ~190-market radius table with a learned model — explicitly a v2-of-v2, not a V2 item; the static table works today and shouldn't be touched until there's a reason to believe it's underperforming.

### 6.3 Automation (High)

1. **[High]** Load-board API integration (DAT, Truckstop.com) — auto-post open capacity, auto-pull matching postings into the Reach/Load-Inquiry flow instead of manual copy-paste.
2. **[Medium]** Automated recurring-invoice generation and factoring-company submission integration, extending the Expenses/Receivables money model.
3. **[Medium]** Auto-generated weekly/monthly owner digest email (net, pace vs. goal, top overdue items) — a natural extension of the notification model's rules registry, delivered as a scheduled send rather than only in-app.
4. **[Low]** Auto-reconciliation between Stripe payouts and the Accounting ledger — flags a payout total that doesn't match summed payments instead of requiring a manual eyeball.
5. **[Low]** Scheduled/materialized nightly rollups for Performance and Dashboard once volume grows past what a live query comfortably serves (a graceful next step after V2's server-side period filtering, not a day-one requirement).

### 6.4 Analytics (Medium)

1. **[Medium]** Cost-per-mile analytics — finish and surface the already-written-but-dead `computeCostPerMile()`.
2. **[Medium]** Broker/lane profitability trend lines beyond the current leaderboard snapshot (e.g. "this broker's average rate/mi over the last 6 months").
3. **[Medium]** Deadhead-cause breakdown (which lanes/brokers correlate with higher deadhead %) beyond the current single deadhead-split bar.
4. **[Low]** Benchmark comparisons against anonymized aggregate data, if/when a multi-tenant version of this product exists (out of scope for the single-operator product).
5. **[Low]** Exportable/scheduled analytics reports (PDF/CSV emailed on a cadence) — ties into [6.15 Reporting](#615-reporting-medium).

### 6.5 Accounting (High)

1. **[High]** Real transaction ledger via bank/card feed integration (Plaid-class) — Expenses today is explicitly schedule-derived, not actuals; this is the single biggest gap in the Money domain.
2. **[High]** QuickBooks/Xero export or sync — closes the "not connected to any accounting system" gap noted throughout the audit.
3. **[Medium]** Live fuel-price feed replacing the manually-set `diesel_price_per_gallon` default, with a per-load override retained for accuracy.
4. **[Medium]** 1099 generation/export for owner-operator applicants who become contracted drivers, once multi-driver support exists.
5. **[Low]** Multi-factoring-company support (today `brokers.factoring` is a single boolean/percentage; a fleet working with more than one factor needs per-relationship terms).

### 6.6 Dispatch (Medium)

1. **[High]** Multi-truck / multi-driver dispatch board — today's entire dispatch model assumes one truck; this is the largest single architectural expansion beyond V2's scope, and should be sequenced deliberately, not organically.
2. **[Medium]** Live GPS/ELD location feed powering the Dashboard's "truck is open near X" logic automatically instead of inferring from the most recent delivered load.
3. **[Medium]** Route optimization / live ETA on load detail and calendar views.
4. **[Medium]** Load-assignment workflow once more than one driver exists (today "assigned" is just an odometer-status stage, not an actual person-to-load assignment).
5. **[Low]** Detention-time tracking tied to the BOL/POD timestamps already captured.

### 6.7 Maintenance (Low)

1. **[Medium]** Cost-per-mile surfaced on the Maintenance home (ties to [6.4 Analytics](#64-analytics-medium) item 1).
2. **[Low]** Date-based (non-mileage) reminders, alongside the existing mileage-interval reminders.
3. **[Low]** Explicit `vehicle_id` scoping — needed the moment a second truck exists (ties to [6.6 Dispatch](#66-dispatch-medium) item 1), a pure schema-readiness item until then.
4. **[Low]** Shop/vendor directory with historical pricing, so "who did the last brake job and what did it cost" doesn't require re-deriving from free-text notes.

### 6.8 Compliance (High)

1. **[High]** IFTA fuel-tax reporting — pulls from the same odometer/state-crossing data the app already tracks per load/trip.
2. **[High]** Driver qualification file tracking (license, medical card, MVR) with expiration alerts, feeding the same notification model already built for maintenance/receivables alerts.
3. **[Medium]** Broker/carrier insurance-certificate expiration tracking and alerting — directly extends the Broker Detail Documents tab once it gets real file upload (see §4 Redesign).
4. **[Medium]** DOT inspection record log.
5. **[Low]** Permit/oversize-load tracking and renewal alerts.

### 6.9 Safety (Medium)

1. **[High]** Hours-of-service (HOS) tracking via ELD integration (ties to [6.6 Dispatch](#66-dispatch-medium) item 2) — currently entirely absent.
2. **[Medium]** Incident/accident log with document attachment (reusing the existing shared `DocViewer`/upload primitives).
3. **[Low]** Driver safety-score tracking, relevant once multi-driver dispatch exists.

### 6.10 CRM (Medium)

1. **[Medium]** Decide deliberately whether the standalone `/crm` module ("Hello Hotshot," a separate multi-tenant product with its own org/auth model) and `/portal`'s broker/customer relationship data should ever share a data model, or stay permanently separate products — an explicit product decision, not a default outcome. Out of scope to resolve inside this roadmap; flagged for an owner decision.
2. **[Medium]** Rate negotiation / RFP tracking on the customer-pipeline side, building on the existing 13-state lead-status model.
3. **[Low]** Customer relationship history unified across repeat shippers (today each `quote_requests` row is an independent lead with no persistent "this is the 4th time this shipper has booked" concept).

### 6.11 Customer portal (Medium)

1. **[Medium]** Persistent (not one-shot-token) customer account for repeat shippers — view shipment history, re-request a quote, download past BOLs/invoices without a fresh emailed link each time.
2. **[Medium]** Real-time shipment status/tracking page for the customer, beyond the current accept/decline/confirm one-shot flow.
3. **[Low]** Self-service payment history and receipt download.

### 6.12 Broker portal (Low)

1. **[Low]** Optional broker self-service login — post loads directly, view payment status on delivered freight, download signed BOLs — a meaningful lift given brokers today are pure email recipients with no account model at all; sequence after the customer portal, which has clearer near-term demand.
2. **[Low]** Broker-side document upload (rate confirmations, updated insurance certs) instead of email-only exchange.

### 6.13 Driver portal (Medium)

1. **[Medium]** A distinct driver-facing mobile view once multi-driver dispatch exists — load assignment, document upload/signature capture, odometer entry — largely a re-scoped version of screens the owner-operator already uses today (Load Detail, Camera, BOL Signer), gated to "my assigned loads only."
2. **[Medium]** Driver settlement statements (ties to [5. Missing #17](#5-missing-features--gaps-v1-never-had)).
3. **[Low]** In-app messaging between dispatcher and driver, replacing informal phone/text coordination.

### 6.14 Owner portal (Low)

Largely already served by the rebuilt `/portal` itself (Dashboard, Performance, Settings) for a single-owner-operator business. Forward-looking items apply once the business grows beyond one truck:

1. **[Low]** Multi-entity/multi-truck consolidated P&L view, distinct from the per-truck Performance page.
2. **[Low]** Owner-level approval workflows (e.g. expenses above a threshold, large rate confirmations) once staff exist to delegate to.

### 6.15 Reporting (Medium)

1. **[Medium]** Scheduled report exports (PDF/CSV, emailed on a cadence — weekly P&L, monthly IFTA-ready mileage summary).
2. **[Medium]** Custom report builder over the money-engine's canonical figures (avoids yet another independent reimplementation of net/A/R logic — must be built *on top of* `lib/money/*`, never beside it).
3. **[Low]** Year-end tax-prep summary export (mileage, fuel, maintenance, expense totals in one packet).

---

## 7. Coverage check

Confirms every module in the audit's table of contents (§§1–27, the feature-bearing sections; §§28–31 are data-model/inventory appendices cross-referenced throughout the tables above, not independent features) is accounted for in exactly one or more of the sections above:

| Audit § | Module | Disposition |
|---|---|---|
| 1 | Auth, permissions & demo-mode | REDESIGN (demo enforcement, remember-me, recovery-session gate) + REMOVE (lockout theater) + KEEP (demo mode's core promise) |
| 2 | Dashboard | REDESIGN (query fan-out, alert keying) + KEEP (countdown, farm-contact) + REMOVE (`dashboard-view.ts`) + MERGE (urgency vocab) |
| 3 | Load Board | REDESIGN (pagination, money engine) |
| 4 | Load detail | REDESIGN (unified edit, confirm dialogs, signed-URL caching) + KEEP (odometer-driven status, BOL scanner/signer) |
| 5 | Trips list | REDESIGN (server KPI, real Link, list primitive) |
| 6 | Trip detail | REDESIGN (PC-miles flag, odometer validation) |
| 7 | Calendar | REDESIGN (windowed query, jump-to-date) + KEEP (holiday calc) |
| 8 | Brokers | REDESIGN (scoped queries, lane normalization, delete confirm, docs upload) + KEEP (Quick Add) + REMOVE (legacy scalar phone/email cols) |
| 9 | Email Broker / Load Inquiry | KEEP (core flow) + MERGE (send-log, company identity) |
| 10 | Reach | KEEP (automation core) + REDESIGN (Setup flow, override) + REMOVE (`reach_markets`) |
| 11 | Email Previews | MERGE (readOnly shared components with customer pages) |
| 12 | Operations hub | KEEP (urgency feed) + MERGE (Accounting A/R → Receivables) |
| 13 | Quote detail workspace | REDESIGN (partial-save, null-total banner) + REMOVE (12+ dead files) + KEEP (`suggestedNext`, event history, live components) |
| 14 | BOL generation & signature pipeline | KEEP (three-tier hierarchy, two-signer model) + MERGE (PDF wrappers, helpers) + REMOVE (base64-in-row signatures, dead `confirmation_token`) |
| 15 | Applications | KEEP (review queue, trash) + REDESIGN (real purge job) |
| 16 | Quotes trash | KEEP (30-day retention pattern, shared with §15's purge fix) |
| 17 | Receivables | MERGE into unified Receivables + REDESIGN (partial payments) |
| 18 | Expenses | REDESIGN (anchor dates, CSV errors, server filters, default-exclusivity constraint) + KEEP (ledger/slide-over pattern) |
| 19 | Accounting | REDESIGN (100-row cap fix) + MERGE (A/R into Receivables) |
| 20 | Performance | REDESIGN (server period filtering, money engine, configurable thresholds) + KEEP (Insights engine) |
| 21 | Maintenance / Repairs | KEEP (parts-first model, auto-categorization, link graph) + MERGE (5 loaders) + MISSING (cost-per-mile → roadmap) |
| 22 | Files | REDESIGN (server pagination) + KEEP (lazy signing, DocViewer) + MERGE (delete logic) |
| 23 | Camera | KEEP (capture/export flow) + REDESIGN (completion signal) |
| 24 | Settings | REDESIGN (grouped sections, inline validation, configurable thresholds) + KEEP (appearance) |
| 25 | Demo mode | REDESIGN (structural `DataSource` enforcement) + KEEP (core promise) |
| 26 | Auth pages | REDESIGN (remember-me, recovery-session gate) + REMOVE (lockout theater) + KEEP (enumeration-safe reset) |
| 27 | Shell / navigation chrome | MERGE (nav config) + REDESIGN (prefetch consistency, search) |

No V1 feature from the audit's inventory is absent from KEEP, REMOVE (with rationale), MERGE, or REDESIGN above.
