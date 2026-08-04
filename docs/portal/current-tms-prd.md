# Current TMS — Product Requirements Document (as-built)

**Scope note:** this document describes the **existing** `/admin` application exactly as it stands in the codebase today — it is not a design proposal for `/portal`. It exists so the rebuild has a single, accurate reference for "what the current product actually does" before any new architecture decisions are made. Companion document: [`current-tms-audit.md`](./current-tms-audit.md), which contains the full page-by-page technical audit this PRD summarizes and prioritizes.

---

## Table of contents

1. [Overview](#1-overview)
2. [Personas](#2-personas)
3. [Feature list by module](#3-feature-list-by-module)
4. [Data model summary](#4-data-model-summary)
5. [Non-functional characteristics](#5-non-functional-characteristics)
6. [Prioritized weaknesses & opportunities for the rebuild](#6-prioritized-weaknesses--opportunities-for-the-rebuild)

---

## 1. Overview

Harblanc Services' admin app is a purpose-built transportation management system for a **single hotshot owner-operator**, covering two distinct workflows under one roof:

1. **Carrier operations** — the trucking side: booking loads, tracking trips, managing receivables, logging maintenance, and measuring profitability against fuel/factoring costs. This is the operational core the owner touches daily.
2. **Freight brokerage / lead-to-cash pipeline** — the customer-facing side: a public quote-request form feeds a 13-state sales-and-execution pipeline (range estimate → shipment intake → finalized rate confirmation → Bill of Lading → payment), each stage backed by its own document type and its own customer-facing email.

A separate module, `/crm` ("Hello Hotshot"), is a multi-tenant CRM product sharing the same Supabase project but with its own auth boundary, its own data model (`crm_*` tables), and its own users — explicitly out of scope for this PRD.

The application is built on Next.js (App Router, server actions), Supabase (Postgres + Auth + Storage, accessed almost exclusively via a service-role client), Resend (transactional email), Stripe (payment infrastructure, currently preview/sandbox-only for the customer payment flow — **unverified**: the live checkout implementation was outside this audit's read scope), and `@react-pdf/renderer`/`pdf-lib` for document generation and signature capture.

**Scale context that shapes every design decision in the current app:** one truck, one operator, one admin account. Nearly every "weakness" documented in the companion audit is really a scale-appropriate simplification that was made deliberately (explicit code comments confirm this repeatedly) — full-table reads instead of pagination, client-side aggregation instead of SQL rollups, a single hardcoded admin allowlist instead of a roles table. These tradeoffs held up fine at current scale; the rebuild's job is to decide, module by module, which of them still hold at whatever scale `/portal` is meant to serve.

---

## 2. Personas

**The Owner-Operator (sole user of the entire admin app today).** Drives the truck, dispatches their own loads, negotiates with brokers, quotes customers, signs their own BOLs, and does their own books. Every screen in the app is designed for exactly one person wearing five hats (dispatcher, salesperson, driver, bookkeeper, mechanic-log-keeper) — there are no other roles, no assignment/handoff features, and no notion of "my tasks" vs. "someone else's tasks." The Settings page's account-identity fields are literally hardcoded to this one person's company info (`src/lib/company.ts`).

**The Customer / Shipper (public-facing, unauthenticated, token-gated).** Interacts only through: the public `/quote` intake form, emailed range-proposal accept/decline links, a post-acceptance shipment-details form, and an emailed rate-confirmation confirm link. Never sees the admin app itself. Authenticated by possession of an opaque token embedded in an emailed link (`dispatch_estimates.accept_token`, `finalized_quotes.confirmation_token`), not by a login — this is a genuinely separate trust boundary from the admin `ADMIN_EMAIL` gate (see audit §14).

**The Broker (external, email-only contact).** Never has any account or login. Interacts with the system exclusively as an email recipient: broker-directory contact info, load-inquiry emails, and bulk backhaul-outreach emails all flow one direction, out to brokers, with replies handled entirely outside the app (in the owner's actual inbox).

**The Owner-Operator Applicant (public-facing, unauthenticated, one-shot).** Submits the `/apply` recruiting form once; has no further interaction with the system. No applicant-facing status page, portal, or notification exists.

---

## 3. Feature list by module

Each module is described as it behaves today. Section numbers in parentheses point to the corresponding deep-dive in the audit document.

### Dashboard (audit §2)
The daily landing screen: a "Needs attention" alert bar (dismissible, auto-resurfacing on new occurrences of the same underlying issue), active-load cards with inline document upload and odometer entry, an empty-truck "farm a broker contact" prompt, a countdown-goal progress widget (owner-defined dollar targets with a deadline), a two-item maintenance mini-widget, and a table of quotes that expired without action.

### Load Board (audit §3)
The master ledger of every load ever booked: rate, miles, deadhead, computed fuel/factoring cost, resulting net profit, searchable and filterable by month, with six summary KPI cards and CSV export. New loads are created here (or from the empty-truck Dashboard prompt) via a modal that auto-fills broker identity from an FMCSA MC/DOT lookup and auto-computes lane mileage from a ZIP-pair geo lookup.

### Load detail (audit §4)
One load's complete record: revenue/cost/net breakdown, an odometer-driven status progression (there is no separate status field — entering the next odometer reading *is* the status advance), document management (rate confirmation / BOL / proof-of-delivery / other, each with camera-capture or file-picker upload), an in-browser BOL scanning tool (perspective-correcting, multi-page, client-assembled PDF), and a fingertip BOL signature-capture flow supporting two independent signer roles that never overwrite each other's stamp.

### Trips (audit §5, §6)
Groups related loads into an out-and-back run for combined P&L, including personal-conveyance (empty/repositioning) mileage and diesel cost that individual loads don't carry on their own. Tracks odometer bookends for the whole trip, active vs. closed status, and per-trip notes.

### Calendar (audit §7)
A read-only month-at-a-glance view of load pickup/delivery spans, maintenance service dates, and US federal holidays, with per-week and per-month net-profit totals layered in.

### Brokers (audit §8)
A CRM-lite broker directory: profile (contact info, MC/DOT, factoring flag, compliance-document references), one or more dispatcher contacts per broker (multi-phone/email), historical posted-lane data (kept explicitly separate from booked-load financials), full load/financial history per broker with A/R aging, and two fast-capture paths (a full "New Broker" form with FMCSA lookup, and a "Quick Add" form purpose-built for grabbing a broker/lane/contact straight off a load board in seconds).

### Email Broker / Load Inquiry (audit §9)
A minimal, single-purpose tool: paste a broker's email and one load-board posting line, get an auto-parsed lane, review the exact email, and send one templated inquiry — optionally in a small pop-out window so it can sit alongside load-board browser tabs. Deliberately simpler than Reach: no templates, no market matching, no send history.

### Reach / Send Backhaul (audit §10)
Bulk, near-zero-typing broker outreach for finding backhaul freight: detects whether the truck is open now or will be soon from live load data, matches the operator's current or upcoming location to one of ~190 built-in US freight markets, auto-builds a recipient list from brokers whose posted lanes or historical loads touch that market, and sends a personalized templated email to each — with three adjustable "leverage" tones (Low-key / Standard / Eager) and a 4-day per-broker suppression window so the same broker isn't spammed on back-to-back sends.

### Email Previews (audit §11)
An internal-only QA tool rendering every customer-facing email template and several customer-facing pages with static sample data — using the exact same render functions production uses, so what's previewed is byte-identical to what would be sent.

### Operations hub — Quotes / Applications / Accounting (audit §12, §13, §15, §16)
The consolidated home for the customer-facing sales pipeline:
- **Quotes:** every inbound lead, grouped into a single feed by urgency and pipeline stage (Needs Attention / Medium / In motion / Collapsed-closed), with a funnel visualization of where all active leads sit in the 13-state pipeline.
- **Quote detail:** the working surface for one lead's full lifecycle — building and sending a range estimate, tracking the customer's shipment-intake submission, composing and sending a finalized rate confirmation, generating and sending the Bill of Lading, and recording payments. Every emailed document has a persisted, replayable audit view (exactly what was sent, not a re-render) and an on-demand current-state PDF.
- **Applications:** review queue for inbound owner-operator recruiting submissions.
- **Accounting:** a payments ledger and live Stripe balance/fee/payout snapshot for the customer-facing brokerage business specifically (a different A/R concept from carrier-load Receivables below).
- **Trash:** both Quotes and Applications support soft-delete with a 30-day retention window and restore.

### Receivables (audit §17)
All-time carrier-load accounts receivable — every delivered, unpaid load — with aging buckets and one-tap mark-as-paid (no partial payments today).

### Expenses (audit §18)
A manual recurring-charge log (insurance, truck payment, subscriptions) styled as a dense ledger, with categories, tags, payment-method tracking (nickname + type + last-4 only, no full card numbers), CSV import/export, and schedule-derived monthly/YTD run-rate estimates. Explicitly not connected to any bank or card feed.

### Performance (audit §20)
The full carrier-load analytics view: net profit vs. an owner-set monthly/annual goal, rate-per-mile trend, deadhead-mile analysis, broker and lane leaderboards, a rules-based plain-English "Insights" engine that surfaces only statistically meaningful callouts (never manufactures noise from thin data), and a monthly ledger table.

### Maintenance / Repairs (audit §21)
A parts-first repair log: each shop visit ("service") holds one or more replaced parts, auto-categorized into 7 fixed mechanical groups plus a cross-cutting "Preventative" view for consumables with mileage-based reminders. Tracks freshness per positioned part-group (e.g. all four wheel-bearing corners), auto-links parts replaced in the same visit as "related," and stores receipt photos/PDFs per visit.

### Files (audit §22)
A single unified, searchable timeline aggregating every uploaded document across the app — load documents, maintenance receipts, and customer intake uploads — into one browsable list with lazy-signed preview/download and delete.

### Camera (audit §23)
A phone-first rapid document-scanning tool: batch multiple BOL/paperwork photos, export the batch as one combined PDF or an image ZIP to hand off to a broker or rep.

### Settings (audit §24)
Appearance (light/dark theme, orientation, UI scale), demo-mode toggle, business defaults (fuel economy, diesel price, factoring %, monthly/annual profit goals), signed-in account display, advanced environment-configuration diagnostics, sign-out.

### Demo mode (audit §1, §25)
A cookie-gated, whole-app toggle that swaps every page's real data for a curated, internally-consistent fake dataset and no-ops every write — built so the product can be shown to a third party (an investor, a buyer, a curious friend) with zero risk of exposing or corrupting real business data.

### Authentication (audit §1, §26)
Single-admin-account login gated by an exact email match against an environment variable — no signup flow, no roles, no per-user permissions. Password reset via email link. "Remember me" controls whether the session survives a browser restart.

---

## 4. Data model summary

The system spans roughly **45 tables** across five domains (see audit §28 for the complete table-by-table breakdown):

- **Lead-to-cash pipeline** (10 tables): `quote_requests`, `applications`, `dispatch_estimates`, `dispatch_events`, `shipment_intake` (+`_uploads`), `finalized_quotes`, `bills_of_lading`, `bol_signatures`, `payments`.
- **Core dispatch/ops** (7 tables): `loads`, `brokers`, `broker_contacts`, `broker_lanes`, `trips`, `load_documents`, `load_expenses`.
- **Settings/dashboard** (4 tables): `dispatch_settings`, `app_settings` (orphaned), `countdown_goals`, `dismissed_alerts`.
- **Maintenance** (9 tables — two full generations coexisting live): legacy `maintenance_items`/`_log`/`_attachments`/`_expenses`, current `repair_entries`/`_services`/`_reminders`/`_attachments`/`_links`.
- **Expenses** (3 tables): `recurring_expenses`, `expense_accounts`, `expense_activity`.
- **Reach** (5 tables): `email_presets` (likely legacy), `reach_markets` (vestigial — unused at runtime), `reach_settings`, `reach_templates`, `reach_sends`.
- **Camera** (2 tables): `camera_batches`, `camera_photos`.
- **CRM** (14 tables, separate product, out of scope): `crm_orgs`, `crm_profiles`, `crm_accounts`, `crm_contacts`, `crm_pipelines`, `crm_pipeline_stages`, `crm_deals`, `crm_activities`, `crm_calls`, `crm_tasks`, `crm_notes`, `crm_tags`, `crm_account_tags`, `crm_documents`.

**The single most important data-model fact for the rebuild:** the ten most operationally central tables (`loads`, `brokers`, `broker_contacts`, `trips`, `load_documents`, `load_expenses`, `dispatch_settings`, `recurring_expenses`, `expense_accounts`, `app_settings`) have **no `CREATE TABLE` in the tracked migration history at all** — they were created directly against the live database before migrations were checked into this repo. This repo's `supabase/migrations/` cannot, by itself, reconstruct the current schema for the app's most important data. Any `/portal` work touching these tables must start from a live-schema pull (`pg_dump`, the Supabase dashboard, or a fresh `supabase db pull`), not from reading this repository.

**Authorization model:** with two narrow exceptions (public `anon`-INSERT-only policies on `quote_requests`/`applications`, and the fully-separate CRM module's real per-org RLS policies), **every table has Row Level Security enabled with zero policies** — a deliberate "deny all to anyone but the service-role key" posture. All authorization for the admin app happens in the Next.js server-action/middleware layer in front of an otherwise-unrestricted service-role Supabase client. This is a sound model for a single-admin app; it would need to become real per-row or per-org RLS policies for any multi-user version of this product.

**Reconciliation debt already present in the schema:** the customer-facing pipeline stores the same shipper/consignee address-and-contact block up to four times as point-in-time snapshots (`quote_requests` → `shipment_intake` → `finalized_quotes` → `bills_of_lading`) rather than through a normalized party model — a deliberate choice to keep historical documents immutable, but one with no single source of truth for "who is this customer" today.

---

## 5. Non-functional characteristics

**Performance.** Nearly every list/dashboard page in the app fetches its *entire* backing table(s) on every request and does filtering/aggregation client-side or in Node — there is essentially no server-side pagination or date-windowing anywhere in the admin app. This is explicitly a scale-appropriate simplification for a single truck's worth of history (confirmed by in-code comments on the Performance page specifically: "no new tables, no materialized rollup" as a stated tradeoff) rather than an oversight, but it is the single largest non-functional risk to carry forward unexamined into a rebuild meant to "rival McLeod, AscendTMS, Tailwind, and Alvys."

**Scalability.** Directly downstream of the above: Performance, Calendar, Files, and the Brokers layout/detail pages are the four heaviest offenders (full-table reads on every single page view). Maintenance has five independently-duplicated loader functions doing the same full-table read-and-compute. None of this has caused a problem yet at one-truck scale; all of it would need a real query/pagination redesign to serve a multi-truck or multi-operator product.

**Security.** No roles, no RLS policies for the admin domain, one hardcoded admin email as the entire authorization boundary, and no MFA. This is appropriate and low-risk for a single-operator internal tool exposed only to its own owner, but is not a model that extends to a team or multi-tenant product without real work. Demo-mode's real-vs-fake data isolation (the owner's explicitly stated #1 requirement for that feature) is enforced entirely by a coding convention with no structural/type-level backstop — every action audited today complies, but nothing prevents a future regression.

**Reliability / data integrity.** Soft-delete (`deleted_at`) is the dominant pattern but is inconsistently applied — several tables have no soft-delete at all. A stated 30-day purge window (`delete_after`) exists on a few tables with no confirmed implementation of the actual purge job anywhere in the audited code. Odometer monotonicity, load-status derivation, and several other important invariants are enforced only in application code, not at the database layer — a direct SQL write or a bug in a new code path could silently violate them.

**Consistency of business rules across surfaces.** The clearest concrete example: TONU-load net profit is computed five different ways across five different screens (audit §32, item 1) — the same underlying business rule ("what does a no-load TONU fee net out to") was implemented independently in at least five places and has drifted. This pattern (a shared concept re-derived independently per screen rather than computed once and reused) recurs elsewhere — two unreconciled A/R definitions, duplicated email/PDF helper functions, two hand-synced navigation configs.

**Observability.** No structured logging, error tracking, or monitoring infrastructure was found anywhere in the audited code. Errors largely surface as thrown exceptions caught by Next's default error boundary, or as silently-swallowed try/catch blocks (e.g. the expense activity log, several Reach send-log writes) — acceptable for a single-operator tool who would notice a broken page immediately, but a gap for any product with users other than its own builder.

**Testing.** Unit tests exist for isolated pure-logic modules (`fuel.test.ts`, `goal-month.test.ts`, `performance.test.ts`, `trip-rollup.test.ts`, `calendar.test.ts`, `doc-name.test.ts`, `signDoc.test.ts`, `parse.test.ts` for the email-broker line parser) — the pattern is consistently applied to money-math and parsing logic specifically. No integration/e2e test suite was found in the audited scope.

---

## 6. Prioritized weaknesses & opportunities for the rebuild

Ranked by a combination of correctness risk, user-facing impact, and how directly each one should shape `/portal`'s architecture — not by ease of fix.

1. **Fix the TONU net-profit inconsistency as a first-class rebuild requirement, not a bug-fix footnote.** Five independent implementations of the same business rule is the clearest evidence in this whole audit that "compute once, reuse everywhere" was not consistently the app's architecture. The rebuild should establish one authoritative costing function per financial concept and make every surface that needs it call through the same path — enforced structurally (a single module, ideally with a type that makes bypassing it awkward), not by convention.

2. **Decide, deliberately, whether carrier-load A/R and customer-quote A/R are one concept or two.** Today they're computed independently in three places (Receivables, Performance, Accounting) with no shared definition and at least one confirmed correctness bug (Accounting's 100-row MTD cap). This is the second clearest instance of the same "reimplemented per screen" pattern as #1.

3. **Pull the live database schema before any data-layer work begins.** The ten most central tables have no tracked-migration history — this repository cannot serve as the schema source of truth for them. This is a prerequisite, not a nice-to-have; skipping it risks the rebuild working from an incomplete or wrong understanding of `loads`/`brokers`/`trips`.

4. **Design the rebuild's list/dashboard pages with real pagination and server-side filtering from day one**, rather than porting the current full-table-scan pattern forward. The current app got away with it at one-truck scale; a system meant to "rival McLeod, AscendTMS, Tailwind, and Alvys" should not inherit this ceiling.

5. **Replace convention-enforced invariants with structural ones where the cost is low.** Demo-mode isolation, odometer monotonicity, load-status derivation, and the payment-method "only one default" rule are all currently enforced by application-code discipline alone. A rebuild is a natural point to move the cheap ones (uniqueness constraints, CHECK constraints, DB triggers) into the database itself.

6. **Consolidate the duplicated helper functions in the email/PDF pipeline and the two hand-synced navigation configs** — both are small, mechanical fixes with no product-behavior risk, but both are exactly the kind of drift-prone duplication that compounds silently over a codebase's life.

7. **Clear out the confirmed dead code in the quote-detail workspace** (12+ files, several hundred lines, from a prior redesign pass) before using that screen as a reference for how the rebuild should structure its equivalent — copying the *current* file's shape forward would also copy its accumulated cruft.

8. **Treat the two coexisting maintenance-schema generations, the orphaned `app_settings` table, and the possibly-not-yet-applied Camera migration as cleanup/verification items to resolve during the rebuild's data-migration planning**, not as ongoing technical debt to carry into `/portal`'s new schema.

9. **Preserve the things that are already working well and worth carrying forward deliberately**, not just critiquing what's weak: the shared canonical-naming pattern for documents (`doc-name.ts`), the lazy-signing pattern for storage URLs (Files, Camera), the preview-bytes-equal-sent-bytes discipline for every customer email, the deterministic/no-DB-call urgency-chip computation, and the rules-engine-with-minimum-sample-gates approach to the Performance "Insights" feature are all thoughtful, well-executed patterns worth re-using rather than reinventing.

10. **Revisit the deliberate address/contact denormalization across the lead pipeline with fresh eyes** — the current four-times-duplicated snapshot approach solves a real problem (immutable historical documents) but at real cost (no single source of truth for "who is this customer"). A rebuild could likely achieve the same immutability guarantee with an explicit snapshot/versioning pattern at the application layer instead of full column duplication at the schema layer.
