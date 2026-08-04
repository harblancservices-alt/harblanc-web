# `/portal` V2 — Design Document

**Status:** design only, no code written. **Companion docs:** [`current-tms-audit.md`](./current-tms-audit.md) (what V1 does, exactly), [`current-tms-prd.md`](./current-tms-prd.md) (prioritized weaknesses). This document is the answer to "what should V2 be instead" — it does not copy V1's UI forward; it redesigns from the user's actual jobs outward.

**Frame.** One owner-operator wears five hats: dispatcher, salesperson, driver, bookkeeper, mechanic-log-keeper. V2's job is to make each hat faster to wear and cheaper to switch between — not to add roles, workflows, or screens a one-truck operation doesn't need. Every page below is justified against that person's actual day, not against what a McLeod/Alvys screen inventory looks like. "Rival the enterprise TMS" means *matching their information density and correctness discipline*, not their org-chart complexity.

**Non-negotiable engineering constraints carried into every page design below** (from the PRD's prioritized list):
- **One money engine.** A single `lib/money/*` module computes load net, TONU net, trip net, and A/R for every screen. No screen is allowed its own copy of `loadNet()`. This document calls out, per page, which money-engine function it renders — never a page-local calculation.
- **One profit-attribution rule.** Pickup date, everywhere. Calendar, Performance, Load Board, Trips all bucket by the same `attributionDate(load)` call.
- **One A/R concept**, not two. Carrier-load A/R (money owed *to* the owner for delivered freight) and customer-quote A/R (money owed *by* the shipper for the brokerage margin — same trade, upstream) are surfaced as two labeled rows of *one* Receivables screen, not two unreconciled screens (V1's Receivables vs. Accounting split).
- **Server-paginated, date-scoped queries by default.** No list page ships an unbounded table to the client. Every list has a real page size, a default date/status window, and a total count — virtualized where the count can legitimately run long (Files, Load Board history).
- **CST labeling everywhere**, via one `formatCentral()` helper — never a raw `Date` render.
- **Demo-mode isolation is structural**, not conventional (detailed in [§ Demo mode](#demo-mode)).
- **High-contrast text, always.** No `text-gray-400`-on-white anywhere, especially not at small sizes. Hierarchy comes from weight, size, and spacing — not opacity. Color is reserved for semantics: **green** = net positive / cash in, **red** = spend / destructive / overdue, **amber** = needs-attention / warning. One brand accent (Harblanc red) marks primary actions and focus states, nothing else.

---

## Table of contents

**Foundations**
- [Design system & tokens](#design-system--tokens)
- [Global shell & unified navigation](#global-shell--unified-navigation)
- [Command palette & keyboard shortcuts](#command-palette--keyboard-shortcuts)
- [Notification model](#notification-model)
- [Cross-cutting fewer-clicks / automation wins](#cross-cutting-fewer-clicks--automation-wins)

**Auth**
- [1. Login](#1-login)
- [2. Password reset / update](#2-password-reset--update)

**Daily operations**
- [3. Dashboard / Today](#3-dashboard--today)
- [4. Load Board](#4-load-board)
- [5. Load detail](#5-load-detail)
- [6. Trips list](#6-trips-list)
- [7. Trip detail](#7-trip-detail)
- [8. Calendar](#8-calendar)

**Broker relationships**
- [9. Brokers list](#9-brokers-list)
- [10. Broker detail](#10-broker-detail)
- [11. Load Inquiry (Email Broker)](#11-load-inquiry-email-broker)
- [12. Reach (Send Backhaul)](#12-reach-send-backhaul)

**Customer pipeline (lead → cash)**
- [13. Operations hub](#13-operations-hub)
- [14. Quote detail workspace](#14-quote-detail-workspace)
- [15. Estimate composer + send](#15-estimate-composer--send)
- [16. Finalized Quote composer + send](#16-finalized-quote-composer--send)
- [17. BOL composer + sign + send](#17-bol-composer--sign--send)
- [18. Customer-facing confirm pages](#18-customer-facing-confirm-pages)
- [19. Applications](#19-applications)

**Money**
- [20. Receivables](#20-receivables)
- [21. Expenses](#21-expenses)
- [22. Accounting](#22-accounting)
- [23. Performance](#23-performance)

**Assets & records**
- [24. Maintenance / Repairs](#24-maintenance--repairs)
- [25. Files](#25-files)
- [26. Camera](#26-camera)

**System**
- [27. Settings](#27-settings)
- [Demo mode](#demo-mode)

---

## Design system & tokens

**Philosophy:** Stripe/Linear/Ramp/QuickBooks register calm because they spend almost their entire visual budget on *one* thing per screen — usually a number — and render everything else as quiet, high-contrast structure around it. V2 adopts that: hairlines instead of card boxes, one accent color, tabular numbers, and text that's either fully legible or not shown at all (never "sort of visible" grey).

### Color

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#FFFFFF` | `#0A0A0A` | page background |
| `--surface` | `#FFFFFF` | `#111111` | raised panels (rare — most layout uses hairlines, not surfaces) |
| `--fg` | `#0A0A0A` | `#F5F5F4` | primary text — **always this or `--fg-muted`, never lower-contrast** |
| `--fg-muted` | `#3F3F3F` | `#C7C7C5` | secondary text — still ≥4.5:1, distinguished by size/weight not opacity |
| `--border` | `#E2E2E0` | `#2A2A2A` | hairlines (1px), the dominant structural device |
| `--accent` | `#C8102E` (Harblanc red) | `#E23B54` | primary buttons, active nav item, focus ring, brand marks — **nothing else** |
| `--positive` | `#0F7B3D` | `#3DDC84` | net profit, cash in, paid, delivered |
| `--negative` | `#B3261E` | `#FF6B60` | spend, destructive actions, overdue, TONU/cancelled |
| `--warning` | `#946200` | `#F2B33D` | needs-attention, due-soon, drafts pending action |

No fourth semantic color. No gradient fills. No decorative icon color — icons inherit `--fg-muted` unless they're inside a colored status pill.

### Typography

- One typeface family, variable weight (e.g. Inter or system-ui stack) — no serif, no display font.
- Financial figures: `font-variant-numeric: tabular-nums`, right-aligned in any tabular context, always rendered via the money-engine formatter (never `toFixed(2)` inline).
- Type scale is small and disciplined: 12 / 13 / 15 / 17 / 22 / 28 / 40px. Hero numbers (Dashboard net, Trip detail net) get 40px; everything else stays ≤22px. Size carries hierarchy, not color.
- Minimum body text is 13px at `--fg-muted` contrast (never smaller, never lighter).

### Structure

- 8px spacing grid.
- **Hairlines over boxes.** Lists are rows separated by 1px `--border`, not stacked cards with shadows. Cards are reserved for genuinely discrete objects (a KPI tile, a document thumbnail) — not for "a section of a page," which V1 overused (three separately-collapsible cards on Load Detail, for example — V2 replaces that with one unified edit surface, see [§5](#5-load-detail)).
- Dense by default on desktop (data-forward), generously spaced on mobile (touch-forward) — the same component, two breakpoints, not two parallel implementations. (V1's Trips list had a fully separate desktop-table/mobile-card codepath; V2's list primitive renders one data model into either a table row or a stacked card via CSS, killing that double-maintenance surface.)
- One list primitive (`<DataList>`) used everywhere: sortable header, zebra rows, sticky money column, built-in pagination, built-in bulk-select, built-in saved filters (server-persisted, not `localStorage`). Every list in this document (§4, §6, §9, §13, §19, §20, §21, §25) is an instance of this primitive, not a bespoke table.
- One money-row primitive (`<MoneyRow>`) — label left, tabular figure right, semantic color only on the figure. Used on every P&L surface (Dashboard, Load Detail, Trip Detail, Performance).

### Motion & feedback

- Optimistic UI on every one-tap action (mark paid, dismiss alert, advance status) — the row updates immediately, rolls back with an inline error only on actual failure. No spinner-then-refetch for actions that don't need it.
- Toasts are reserved for background/async confirmation (email sent, export ready); inline state (row color, checkmark, strike-through) is preferred over a toast wherever the action's result is visible on-screen.

---

## Global shell & unified navigation

**Why does this exist?** Every V1 page finding that starts with "two hand-synced lists" or "prefetch is inconsistent" traces back to the same root cause: there is no single nav configuration. V2 fixes this structurally, not by discipline.

**Single primary action:** get to any of ~20 destinations, or any specific record, in under 2 seconds from anywhere in the app.

**Fewer clicks:** one `nav.config.ts` array (`{id, label, icon, href, group, badge?, ownerOnly?}`) is the *only* place a route is registered. Desktop sidebar, mobile bottom nav, mobile "More" sheet, and the command palette's navigation results all render from this one array — a new route added once appears correctly in all four surfaces automatically. This directly kills V1 finding #11.

**Automation:** nav badges (e.g. "3" on Operations for leads needing attention) are computed server-side from the same rules that drive the [notification model](#notification-model) — one source of truth for "what's counted as needing attention," not a bespoke per-nav-item query.

**Information hierarchy:** five groups, matching the five hats: **Today** (Dashboard, Calendar), **Loads** (Load Board, Trips), **Partners** (Brokers, Reach, Load Inquiry), **Pipeline** (Operations hub — Quotes/Applications), **Money** (Receivables, Expenses, Accounting, Performance), plus **Records** (Maintenance, Files, Camera) and **Settings** pinned at the bottom. This mirrors V1's sidebar grouping (which was already reasonable) but now generates the mobile equivalent instead of hand-duplicating it.

### Desktop wireframe (≥1024px)

```
┌──────────┬──────────────────────────────────────────────────────────────┐
│  H  ⌂    │  [⌘K Search or jump to...]              🔔³   ＋New  ⚙ AM ▾  │
│──────────┼──────────────────────────────────────────────────────────────│
│ TODAY    │                                                              │
│ ● Today  │                                                              │
│  Calendar│                                                              │
│          │                                                              │
│ LOADS    │                       <page content>                        │
│  Load Bd │                                                              │
│  Trips   │                                                              │
│          │                                                              │
│ PARTNERS │                                                              │
│  Brokers │                                                              │
│  Reach   │                                                              │
│  Inquiry │                                                              │
│          │                                                              │
│ PIPELINE │                                                              │
│  Ops  ③  │                                                              │
│          │                                                              │
│ MONEY    │                                                              │
│  Receiv. │                                                              │
│  Expenses│                                                              │
│  Account.│                                                              │
│  Perform.│                                                              │
│          │                                                              │
│ RECORDS  │                                                              │
│  Mainten.│                                                              │
│  Files   │                                                              │
│  Camera  │                                                              │
│──────────┤                                                              │
│ ⚙ Settings                                                              │
│ 👤 Adam M.  [Sign out]                                                  │
└──────────┴──────────────────────────────────────────────────────────────┘
```
Sidebar collapses to icon-only rail (48px) via a persisted toggle; group labels become tooltips. Active item: accent-red left rule + accent text, nothing else changes (no filled pill background, keeps it calm).

### Mobile wireframe (<768px)

```
┌───────────────────────────┐
│ ☰ H          🔔³   ＋      │  ← top bar: menu, brand, bell, quick-add
├───────────────────────────┤
│                           │
│      <page content,       │
│    stacked-card layout>   │
│                           │
├───────────────────────────┤
│  ⌂     🚚     👥    ⋯    │  ← bottom nav: Today, Loads, Partners, More
│ Today  Loads Partners More│
└───────────────────────────┘
```
Bottom nav shows the 3 highest-frequency destinations (Today, Load Board, Brokers — configurable per `nav.config.ts` `mobilePrimary: true` flag) plus **More**, which opens a full-height sheet listing every remaining group exactly as grouped on desktop — same data, same order, generated not hand-kept.

---

## Command palette & keyboard shortcuts

**Why:** V1 has a working `⌘K` search but it only searches three tables and has no action layer — you can find a load but you can't *do* anything from the palette. V2 merges search + actions + navigation into one surface, the single fastest path to anything in the app.

**Primary action:** answer "where do I need to be, or what do I need to do, right now" in one keystroke sequence, without touching the mouse.

**Fewer clicks:** any record (load, trip, broker, quote) is reachable in `⌘K` + type + `↵` — 2 actions instead of navigate-to-list → scroll/filter → click.

**Automation:** recent + frequent destinations are ranked automatically (simple recency/frequency score, no config needed); the palette also surfaces *actions* ("Mark load #4821 paid", "New Trip") ranked alongside navigation, powered by the same server-side fuzzy search — one indexed, paginated query, not the three unbounded `ilike` scans V1 runs (including the unbounded `loadAllFiles()` union, [audit §27](./current-tms-audit.md)).

**Information hierarchy:** results grouped **Actions** → **Records** → **Pages**, top 3 per group max, "see all N results" footer for anything with more.

```
┌──────────────────────────────────────────────────────┐
│  🔍  4821                                          esc │
├──────────────────────────────────────────────────────┤
│  RECORDS                                              │
│  🚚  Load #4821 — Dallas TX → Memphis TN     $1,850   │
│  🚛  Trip "TX-TN run" (contains #4821)                │
│                                                        │
│  ACTIONS                                              │
│  ✓  Mark Load #4821 as paid                           │
│  ✎  Add expense to Load #4821                         │
│                                                        │
│  PAGES                                                │
│  📋  Load Board                                       │
└──────────────────────────────────────────────────────┘
```

### Keyboard shortcut map

| Keys | Action |
|---|---|
| `⌘/Ctrl K` | Open command palette |
| `/` | Focus in-page search (when palette closed) |
| `G then D` | Go: Dashboard/Today |
| `G then L` | Go: Load Board |
| `G then T` | Go: Trips |
| `G then C` | Go: Calendar |
| `G then B` | Go: Brokers |
| `G then O` | Go: Operations hub |
| `G then P` | Go: Performance |
| `N` | Context-aware "New" (New Load on Load Board, New Trip on Trips, New Expense on Expenses, etc.) |
| `E` | Edit focused record (inline edit, no modal) |
| `⌘ Enter` | Submit/save the focused form |
| `Esc` | Close modal / palette / cancel inline edit |
| `?` | Show this shortcut sheet |

Shortcut sheet is itself a command-palette result (`? shortcuts`), not a buried Settings toggle.

---

## Notification model

**Why:** V1's "alerts" are a Dashboard-only, `dismissed_alerts`-backed, stringly-keyed hack ([audit §2](./current-tms-audit.md)) that doesn't generalize past the Dashboard and re-derives its own definition of "urgent" separately from the Operations hub's `computeUrgency()` ([audit §12](./current-tms-audit.md)) — two unreconciled urgency vocabularies. V2 replaces both with one notification model everything else plugs into.

**Primary action:** one bell icon, one list, answers "what needs my attention right now" regardless of which module it came from.

**Fewer clicks:** every notification deep-links to the exact record/tab that needs action — zero "now go find it" navigation.

**Automation:** notifications are *generated*, not authored — a single rules registry (`lib/notifications/rules.ts`) with one entry per rule (overdue receivable, stale quote, maintenance due, incomplete expense, new lead, empty-truck nudge), each emitting a typed `{severity, entity, dedupeKey, ...}` record. The nav badge count, the Dashboard's "Needs attention" section, and the bell dropdown all read from this one generated set — not three parallel computations.

**Information hierarchy:** two severities only — **Action needed** (amber/red dot) and **Info** (no dot) — sorted newest-relevant first, grouped by module. Dismissal is per-occurrence via a real `notification_id`, not the fragile "sorted gap list as a string key" pattern V1 uses for incomplete-expense alerts.

```
┌──────────────────────────────────────┐
│  Notifications                   ✓ all│
├──────────────────────────────────────┤
│ ⚠ ACTION NEEDED                       │
│ ● Load #4790 — 42 days unpaid    →   │
│ ● Quote "J. Rivera" stale 6d     →   │
│ ● Oil change overdue 900mi       →   │
│                                        │
│  INFO                                 │
│   New lead: "M. Alvarez"         →   │
│   Trip "OK run" closed            →   │
├──────────────────────────────────────┤
│  See all notifications                │
└──────────────────────────────────────┘
```

Bell badge = count of **Action needed** only (info items never inflate the badge — avoids the "everything is a 47" numbness problem enterprise TMS's are notorious for).

---

## Cross-cutting fewer-clicks / automation wins

Patterns applied *everywhere they fit*, called out once here so each page section below doesn't need to repeat them:

1. **Inline edit, not modal-then-edit-mode.** V1's Load Detail has three independently-collapsible cards each with their own edit toggle ([audit §4](./current-tms-audit.md)); V2 uses one inline-edit affordance per field group — click a value, it becomes an input, `⌘Enter`/blur saves, `Esc` cancels. No separate "Edit" button opening a duplicate form.
2. **One-tap actions carry smart defaults, not blind defaults.** V1's TONU dialog pre-fills $150 and is "easy to submit without adjusting" (flagged as a UX problem). V2 keeps the one-tap speed but requires the amount field to be *touched* (focused+blurred or explicitly confirmed) before a non-zero default submits — same speed, removes the fat-finger risk.
3. **Bulk actions are a standard list-primitive feature**, not bolted on per-page — select-mode, bulk status change, bulk export, bulk delete all come free from `<DataList>` (§ Design system) rather than being reimplemented per screen.
4. **Global quick-add (`＋New`, top bar + `N` shortcut)** is context-aware: New Load from Load Board/Dashboard, New Quote from Operations, New Expense from Expenses — one control, no hunting for "the button" per page.
5. **Saved filters are server-persisted** (`user_id`-scoped), not `localStorage` (V1's Expenses filters are lost across devices — [audit §18](./current-tms-audit.md)).
6. **Auto-computed defaults stay, but become visible, not silent.** Lane mileage, FMCSA lookups, PC-mile gap-filling — V2 keeps every V1 automation that saves real typing, but any figure derived rather than entered is visually flagged (small "auto" tag) so the operator can tell a computed $0 (missing data) from an actual $0 — directly fixing the PC-miles silent-undercount finding ([audit §6](./current-tms-audit.md)).
7. **Status derivation stays odometer-driven** (a genuinely good V1 pattern — [audit §4](./current-tms-audit.md)) but gets one-tap "Mark delivered" / "Mark picked up" buttons that write the odometer-implied state directly, so the operator doesn't have to know the mechanic to get the outcome.
8. **Every money figure is a link to its source rows**, not just a number — click net profit, see the load/expense lines that produced it. Kills the "which of five calculations produced this number" trust problem at its root.

---

## 1. Login

**Why does this page exist?** The one door into the entire operational system — must be fast for the one legitimate user and boring for everyone else.

**Primary action:** authenticate and land on Today.

**Fewer clicks:** password-manager-friendly markup (correct `autocomplete` attributes throughout — V1 already does this for update-password, V2 extends it to login) means most visits are autofill + one click, not four keystrokes + a click.

**Automation:** "Remember me" persists correctly (V2 fixes this at the `@supabase/ssr` cookie layer with one documented helper instead of the two-places-must-stay-in-sync workaround in [audit §1](./current-tms-audit.md)) so re-auth friction only happens when the operator actually wants it to.

**Information hierarchy:** one column, one primary action, nothing competing with it — no marketing copy, no secondary CTAs.

```
Desktop (centered, 400px card, rest of viewport quiet neutral bg)   Mobile (full width, same order)
┌────────────────────────────┐                                     ┌───────────────────────┐
│   H  Harblanc               │                                     │   H  Harblanc          │
│                             │                                     │                        │
│  Email                     │                                     │  Email                 │
│  [_____________________]    │                                     │  [__________________]  │
│                             │                                     │                        │
│  Password                  │                                     │  Password              │
│  [_____________________]    │                                     │  [__________________]  │
│                             │                                     │                        │
│  ☑ Remember me   Forgot?    │                                     │  ☑ Remember me         │
│                             │                                     │       Forgot password? │
│  [        Sign in        ]  │                                     │  [    Sign in        ] │
│                             │                                     │                        │
└────────────────────────────┘                                     └───────────────────────┘
```
Server-side rate limiting only (Supabase Auth) — V2 drops the `localStorage` lockout theater from V1, since it protects nothing a cleared-storage bypass doesn't defeat, and instead surfaces a real inline error if the server rejects for rate-limit reasons.

---

## 2. Password reset / update

**Why:** the one legitimate self-service recovery path.

**Primary action:** get a working session back with the fewest steps between "I forgot" and "I'm in."

**Fewer clicks:** single email field, enumeration-safe generic success state (kept from V1 — it's correct).

**Automation:** none needed — deliberately minimal.

**Information hierarchy:** identical one-column shape to Login, so the flow feels continuous rather than a jarring context switch.

```
┌────────────────────────────┐        ┌────────────────────────────┐
│  Reset your password        │        │  Set a new password         │
│                             │   →    │                             │
│  Email                     │        │  New password               │
│  [_____________________]    │        │  [_____________________]    │
│                             │        │  Confirm password            │
│  [   Send reset link    ]   │        │  [_____________________]    │
│                             │        │  [    Update password   ]   │
│  ← Back to sign in          │        │                             │
└────────────────────────────┘        └────────────────────────────┘
```
Structural fix vs. V1: `/portal`'s middleware explicitly allowlists the update-password route by *recovery-session type*, not by email match — closes the multi-account edge case noted in [audit §26](./current-tms-audit.md) before it can ever bite a future second admin account.

---

## 3. Dashboard / Today

**Why does this page exist?** The single "what do I do right now" screen the operator opens first every day — not a data dump, a prioritized to-do list backed by real numbers.

**Primary action:** clear whatever's flagged as action-needed, in the order it matters.

**Fewer clicks:** every alert row *is* its action — tapping "Load #4790 — 42 days unpaid" opens the mark-paid control inline, not a navigation to another page and back.

**Automation:** the entire alert stack is generated by the [notification model](#notification-model)'s rules registry — one list, reused as-is (not re-derived) for the bell dropdown. The empty-truck farm-a-broker-contact nudge and the countdown-goal pace math (both genuinely good V1 ideas) carry forward unchanged in spirit, but the goal pace calculation now runs through the same trailing-window helper Performance uses ([§23](#23-performance)) instead of a Dashboard-local copy.

**Information hierarchy:** one page, four zones, most-actionable first: Needs Attention → Active Loads (with one-tap doc/odo actions) → Goal pace → Maintenance-due strip. Expired quotes move to the notification model (they no longer need a dedicated always-visible table taking permanent real estate — they surface as an Info notification and in the Operations feed).

```
Desktop (≥1024px)
┌──────────────────────────────────────────────────────────────────────┐
│  Today · Tuesday, Aug 3                                    CST 2:41p │
├──────────────────────────────────────────────────────────────────────┤
│  NEEDS ATTENTION (3)                                                  │
│  ⚠ Load #4790 — 42 days unpaid, $1,650        [Mark paid ▾]   ✕      │
│  ⚠ Quote "J. Rivera" — no reply in 6 days      [Open]          ✕      │
│  ⚠ Oil change — 900mi overdue                  [Log service]  ✕      │
├──────────────────────────────────────────────────────────────────────┤
│  ACTIVE LOADS (2)                              Net pace: ▓▓▓▓▓▓░░ 72%│
│  ┌────────────────────────────┐ ┌────────────────────────────┐      │
│  │ #4821  Dallas → Memphis     │ │ #4822  Memphis → Nashville  │      │
│  │ In transit · odo 84,201     │ │ Loaded · odo 84,610         │      │
│  │ [+ Doc]  [Update odometer]  │ │ [+ Doc]  [Update odometer]  │      │
│  └────────────────────────────┘ └────────────────────────────┘      │
│  Truck is open in ~2 days near Nashville, TN → [Reach out ▾]         │
├──────────────────────────────────────────────────────────────────────┤
│  GOAL: $18,400 / $24,000 this month     14 loads needed · 3.1/wk pace│
└──────────────────────────────────────────────────────────────────────┘

Mobile (<768px) — same 4 zones, stacked full-width, load cards single-column, goal bar becomes a compact strip under the top bar (always visible while scrolling other zones via a sticky mini-bar).
```
Weakness fixed: no more 16 parallel unbounded queries per visit ([audit §2](./current-tms-audit.md)) — the notification set is computed by one scheduled/materialized pass (or short-TTL cache), not re-run from scratch on every navigation; Active Loads and Goal pace are the only two live, narrowly-scoped queries left on this page.

---

## 4. Load Board

**Why does this page exist?** The carrier-side system of record — every load ever booked, with its financial outcome, searchable fast.

**Primary action:** find a load, or book a new one, in seconds.

**Fewer clicks:** New Load reachable via the global quick-add (`N` on this page) with FMCSA + lane-mileage auto-fill kept from V1 (genuinely good automation); inline status/paid toggles on each row instead of drilling into detail for a one-field change.

**Automation:** month attribution and net figures render through the **one money engine** — this page finally agrees with Trip/Calendar/Performance on what a TONU'd load is worth, closing the audit's #1 cross-cutting finding structurally (the money engine's `computeLoadNet()` is the *only* function permitted to touch `rate`/`tonu_amount`/expenses/factoring math; TypeScript's module boundary makes bypassing it require an explicit, greppable escape hatch, not a quiet duplicate).

**Information hierarchy:** KPI strip (this month) → filter/search bar → paginated, sortable load list. CSV export operates on the *filtered* server query, not a client-side full-history dump.

```
Desktop (≥1024px)
┌──────────────────────────────────────────────────────────────────────┐
│  Loads                                          [Search…] [＋ New]   │
│  ┌────────┬────────┬────────┬────────┬────────┬────────┐            │
│  │ Gross  │  Net   │ Loads  │ $/mi   │Deadhead│  A/R   │  ◀ Aug 2026 ▶│
│  │$18,400 │$11,220 │  9     │ $2.14  │  8.2%  │ $3,290 │            │
│  └────────┴────────┴────────┴────────┴────────┴────────┘            │
│  [ All ▾ ] [ Broker ▾ ] [ Status ▾ ]           ⎘ select   ⇩ export   │
│  ─────────────────────────────────────────────────────────────────  │
│  #    Broker         Lane                  Pickup   Rate     Net    │
│  4821 Werner          Dallas → Memphis      8/1      $1,850  $1,120 │
│  4820 CH Robinson      Memphis → Nashville   7/30     $1,400  $890  │
│  4819 (TONU) Werner    Dallas → Tulsa        7/28     $150    $128  │
│  …                                                     [Load more ▾]│
└──────────────────────────────────────────────────────────────────────┘

Mobile (<768px): KPI strip becomes a 2×3 swipeable tile grid; list becomes stacked cards (broker/lane header, rate+net right-aligned, status pill) — same <DataList> primitive, card render mode.
```
Weakness fixed: server-side month filtering + real pagination replace V1's "ship all history, slice client-side" pattern; `load_expenses` is fetched scoped to the visible page's load IDs, never the whole table.

---

## 5. Load detail

**Why does this page exist?** One load's complete, trustworthy financial and operational record.

**Primary action:** advance the load's status (via odometer entry) or record its financial outcome.

**Fewer clicks:** V1's three separately-collapsible cards (Load details / Odometer & status / Financials), each with its own edit toggle, collapse into **one unified inline-edit surface** (design-system win #1) — every field is click-to-edit in place, no modal, no "enter edit mode for this whole card" friction.

**Automation:** status stays odometer-derived (kept — it's good), but gets one-tap "Mark delivered" that also opens odometer entry inline rather than requiring the operator to know that's how status changes work at all (a genuine usability gap in V1, where the odometer-drives-status rule is invisible unless you already know it). Document signed-URL re-minting is cached client-side for the page session instead of re-signing every document on every visit ([audit §4](./current-tms-audit.md)).

**Information hierarchy:** hero P&L number (kept from the recent trip-detail redesign pattern — [commit 5c05842] — extended here) → command bar (Mark delivered / TONU / Edit / Delete) → flat money row (revenue, fuel, factoring, expenses, net) → odometer/status → documents.

```
Desktop (≥1024px)                                        Mobile (<768px)
┌──────────────────────────────────────┐                ┌───────────────────────┐
│  ← Loads   #4821  Dallas → Memphis    │                │ ← #4821                │
│                                       │                │                        │
│         NET PROFIT                   │                │      NET PROFIT        │
│         $1,120                       │                │      $1,120            │
│         ▓▓▓▓▓▓▓▓░░ 60% margin        │                │   ▓▓▓▓▓▓▓▓░░ 60%       │
│                                       │                │                        │
│  [Mark delivered] [TONU] [Delete]    │                │ [Mark delivered]        │
│  ─────────────────────────────────── │                │ [TONU]  [Delete]        │
│  Rate                        $1,850  │                │ ────────────────────── │
│  Fuel                          −$310 │                │ Rate            $1,850 │
│  Factoring (3%)                 −$56 │                │ Fuel             −$310 │
│  Expenses (2)                  −$364 │                │ Factoring         −$56 │
│  Net                          $1,120 │                │ Expenses         −$364 │
│  ─────────────────────────────────── │                │ Net             $1,120 │
│  Broker: Werner            [edit]    │                │ ────────────────────── │
│  Pickup 8/1  Delivery 8/2  [edit]    │                │ Broker: Werner   [edit] │
│  Odometer  assigned 84,050           │                │ Dates            [edit] │
│            loaded    84,180          │                │ Odometer         [edit] │
│            delivered 84,610 [edit]   │                │ ────────────────────── │
│  ─────────────────────────────────── │                │ DOCUMENTS               │
│  DOCUMENTS                    [+Add] │                │ [Rate Con] [BOL] [+Add] │
│  [Rate Con] [BOL] [POD]              │                │                        │
└───────────────────────────────────────┘                └───────────────────────┘
```
Fixed: TONU net now renders through `computeLoadNet()` — same figure as Board, Trip, Calendar, Performance.

---

## 6. Trips list

**Why does this page exist?** Out-and-back run grouping, for P&L that individual loads can't carry alone (deadhead/PC diesel).

**Primary action:** find an active trip, or start one.

**Fewer clicks:** New Trip via quick-add; row click navigates directly (real `<Link>`, not a client-side `router.push` wrapper — fixes a hydration/prefetch inconsistency noted implicitly in V1's shell audit).

**Automation:** month-scoped KPI strip (Active Trips, Gross/Net, Avg Margin) computed server-side, not client-reduced over full history ([audit §5](./current-tms-audit.md) weakness).

**Information hierarchy:** KPI strip → Active trips → Closed trips (collapsed by default past the most recent 5, same pattern Trip Detail already uses well for linked loads).

```
Desktop (≥1024px)                                         Mobile (<768px)
┌────────────────────────────────────────────────┐       ┌───────────────────┐
│  Trips                            [＋ New Trip] │       │ Trips      [＋]    │
│  ┌────────┬────────┬────────┬──────────┐       │       │ Active(1)Net$3,890│
│  │ Active │ Gross  │  Net   │ Avg Marg │       │       │ ┌─────────────────┐│
│  │   2    │$6,200  │$3,890  │   63%    │       │       │ │TX-TN run        ││
│  └────────┴────────┴────────┴──────────┘       │       │ │$3,890 net · 63% ││
│  ACTIVE                                          │       │ └─────────────────┘│
│  Name        Loads  Miles   Gross   Net  Marg   │       │ Closed (12) ▸      │
│  TX-TN run    3     1,240 $3,200 $1,890  59%    │       └───────────────────┘
│  OK backhaul  2       810 $3,000 $2,000  67%    │
│  CLOSED (12)                             [▾]     │
└────────────────────────────────────────────────┘
```

---

## 7. Trip detail

**Why does this page exist?** One trip's full P&L, including personal-conveyance miles/diesel that no single load captures.

**Primary action:** close out the trip (or reopen it) once its numbers are right.

**Fewer clicks:** odometer-bookend save gets the same inline validation Trip Dates already has in V1 — parity fix, not a new pattern.

**Automation:** PC-mile gap-filling stays, but a missing odometer reading now renders an explicit "≈ incomplete, missing reading on Load #4822" flag next to the PC figure instead of a silent $0 ([audit §6](./current-tms-audit.md) weakness — directly addressed by cross-cutting win #6).

**Information hierarchy:** hero net (kept from the existing redesign — [commit 5c05842]) → Money/Miles flat rows → odometer bookends → notes → linked loads.

```
Desktop (≥1024px)                                        Mobile (<768px)
┌────────────────────────────────────────┐              ┌───────────────────────┐
│  ← Trips   TX-TN run          [Close]   │              │ ← TX-TN run             │
│                                          │              │        NET             │
│           NET PROFIT                    │              │       $1,890           │
│           $1,890                        │              │   ▓▓▓▓▓▓░░ 59%          │
│         ▓▓▓▓▓▓░░ 59% margin             │              │ ─────────────────────  │
│  ──────────────────────────────────────  │              │ Money                  │
│  MONEY                                   │              │ Gross         $3,200   │
│  Gross                          $3,200   │              │ Fuel+PC        −$610   │
│  Fuel + PC diesel                 −$610   │              │ Factoring       −$96   │
│  Factoring                        −$96   │              │ Net           $1,890   │
│  Net                            $1,890   │              │ Miles                  │
│  MILES                                   │              │ Loaded         1,120    │
│  Loaded miles                     1,120  │              │ PC miles ⚠ incomplete   │
│  PC miles ⚠ incomplete (missing odo      │              │ Odometer               │
│  on #4822)                          120  │              │ Start 83,900 End 85,140│
│  ──────────────────────────────────────  │              │ Loads (3)               │
│  ODOMETER  Start 83,900   End 85,140     │              │ #4821 #4822 #4823       │
│  NOTES                          [edit]   │              └───────────────────────┘
│  LINKED LOADS (3)                        │
│  #4821 #4822 #4823                       │
└──────────────────────────────────────────┘
```

---

## 8. Calendar

**Why does this page exist?** Month-at-a-glance load spans + maintenance dates, for planning what's committed and where the truck is.

**Primary action:** see what's booked this week/month at a glance; jump to a load or maintenance record.

**Fewer clicks:** a real jump-to-date control (V1 has prev/next/Today only — no search/filter, flagged as a UX gap) plus click-through everywhere already present.

**Automation:** federal holidays stay algorithmic (good, no reason to store them); weekly/monthly net rollups render through the same `attributionDate()`+money-engine pair as everywhere else — TONU loads finally show the *same* net here as on the Board, closing another instance of finding #1.

**Information hierarchy:** month grid with load bars → per-week net column → per-month total footer, exactly V1's layout (it's a sound information design) rebuilt on a scoped, windowed query.

```
Desktop (≥1024px)
┌──────────────────────────────────────────────────────────────────────┐
│  ◀  August 2026  ▶   [Today]   [Jump to date…]           Month net:  │
│                                                              $11,220  │
│  Sun    Mon    Tue    Wed    Thu    Fri    Sat   │  Net              │
│  ───────────────────────────────────────────────┼───────────────────│
│                1      2      3      4      5     │                   │
│         [#4821 Dallas→Memphis───]                │  $2,970           │
│  ───────────────────────────────────────────────┼───────────────────│
│   6      7      8      9     10     11     12    │                   │
│    [#4822──] [#4823────]  🔧 oil change           │  $4,110           │
│  ───────────────────────────────────────────────┴───────────────────│
└──────────────────────────────────────────────────────────────────────┘

Mobile (<768px): agenda list grouped by day (kept from V1 — a sound mobile pattern), week-net footer sticky at bottom of each week's group.
```
Weakness fixed: the query is windowed to the visible month ±1 week (for spanning loads), not the entire `loads`/`load_expenses` tables — this was flagged as the single heaviest full-table-read offender in the whole app ([audit §7](./current-tms-audit.md)); V2 removes that ceiling entirely rather than carrying it forward.

---

## 9. Brokers list

**Why does this page exist?** Master directory of every partner the operator books freight through or sells freight to.

**Primary action:** find a broker, or capture a new one fast off a load-board posting.

**Fewer clicks:** the Quick-Add flow (broker + contact + posted lane in one short form, kept from V1 — it's a genuinely good fast-capture pattern) stays, reachable from quick-add (`N`) with a visible "matched existing / created new" confirmation chip — fixing the V1 UX gap where that distinction was invisible ([audit §8](./current-tms-audit.md)).

**Automation:** server-side search/sort replaces client-side full-table aggregation; gross/A/R per broker computed via the money engine, scoped query (not the whole `loads` table re-fetched on every navigation within the broker section — [audit §8](./current-tms-audit.md) weakness).

**Information hierarchy:** search/sort bar → paginated broker list with gross, load count, A/R inline.

```
Desktop (≥1024px)                                          Mobile (<768px)
┌──────────────────────────────────────────────┐          ┌───────────────────┐
│  Brokers                    [Search…] [＋ New]│          │ Brokers    [＋]     │
│  Sort: Gross ▾                                 │          │ [Search…]           │
│  ─────────────────────────────────────────────│          │ ┌─────────────────┐ │
│  Name          Loads   Gross     A/R          │          │ │Werner            │ │
│  Werner         14    $22,400   $1,650        │          │ │14 loads $22,400  │ │
│  CH Robinson     9    $14,100   $0            │          │ │A/R $1,650        │ │
│  Landstar        6     $9,800   $890          │          │ └─────────────────┘ │
│  …                              [Load more ▾] │          │ …                   │
└──────────────────────────────────────────────┘          └───────────────────┘
```

---

## 10. Broker detail

**Why does this page exist?** One partner's full relationship record — contacts, lanes, load history, financials, compliance docs.

**Primary action:** find a contact to call, or check A/R aging, fast.

**Fewer clicks:** tabs (Overview / Contacts / Lanes / History) instead of one long scroll, so "just get me the phone number" doesn't require passing the whole load-history table first.

**Automation:** A/R aging buckets computed via the money engine; lane aggregation normalizes `origin`/`destination` to ZIP-prefix keys server-side instead of raw-string grouping, so "Dallas, TX" and "Dallas TX" stop fragmenting into separate lane rows ([audit §8](./current-tms-audit.md) weakness).

**Information hierarchy:** identity header → tabs → tab content, each tab independently paginated/scoped rather than one full-broker-history payload.

```
Desktop (≥1024px)                                         Mobile (<768px)
┌──────────────────────────────────────────┐             ┌───────────────────┐
│ ← Brokers  Werner Enterprises   [Edit]    │             │ ← Werner        [⋮]│
│ MC 123456 · DOT 654321 · Factoring ✓      │             │ MC123456 Factor✓   │
│ ─────────────────────────────────────────│             │ ─────────────────  │
│ [Overview] Contacts  Lanes  History        │             │ Overview▾           │
│                                            │             │ Contacts            │
│  A/R aging          Gross (all-time)       │             │ Lanes               │
│  0–7   $0            $22,400               │             │ History             │
│  8–14  $650                                │             │ ────────────────── │
│  15–30 $1,000        Loads: 14             │             │ A/R  $1,650         │
│  31+   $0                                  │             │ Gross $22,400       │
│  ─────────────────────────────────────────│             │ 14 loads            │
│  DELETE requires confirm  [Delete broker]  │             └───────────────────┘
└──────────────────────────────────────────┘
```
Fixed: broker soft-delete now requires an explicit confirm step (V1 has none at all, unlike contact deletion — a flagged inconsistency); confirm dialog also surfaces the count of contacts/lanes that will be orphaned rather than deleting silently with no warning.

---

## 11. Load Inquiry (Email Broker)

**Why does this page exist?** A one-off, fast tool: paste a broker's email + a load-board line, send one templated inquiry — deliberately simpler than Reach.

**Primary action:** get one inquiry email sent in under 20 seconds.

**Fewer clicks:** kept nearly as-is from V1 — paste line, auto-parsed origin/destination, review, send. It's already a minimal-friction tool; the redesign's job here is mostly consistency and correctness, not new UI.

**Automation:** MC/DOT/phone and reply-to now read from the **same `reach_settings`-equivalent single source** Reach uses, closing the "hardcoded, drifts from Reach" finding ([audit §9](./current-tms-audit.md)) — one company-identity settings object powers every outbound broker email, not two.

**Information hierarchy:** paste box → parsed lane (editable) → preview → send, single column, pop-out-window mode kept (genuinely useful for sitting beside load-board tabs).

```
┌──────────────────────────────────────┐
│  Load Inquiry                    [⧉] │  ← pop-out toggle
│  Broker email                        │
│  [_______________________________]    │
│  Paste load-board line               │
│  [_______________________________]    │
│  Origin            Destination        │
│  [Dallas, TX___]    [Memphis, TN___]  │
│  ──────────────────────────────────  │
│  Preview                             │
│  ┌───────────────────────────────┐   │
│  │ Subject: Inquiring on your    │   │
│  │ Dallas → Memphis load…        │   │
│  └───────────────────────────────┘   │
│  [        Send inquiry         ]      │
└──────────────────────────────────────┘
```
Fixed: every send is now persisted to the same send-log table Reach writes to (`reach_sends`-equivalent, tagged by source) so a failed Resend send leaves a record instead of vanishing ([audit §9](./current-tms-audit.md) weakness).

---

## 12. Reach (Send Backhaul)

**Why does this page exist?** Near-zero-typing bulk backhaul outreach — the highest-leverage tool for keeping the truck loaded on the return leg.

**Primary action:** send a personalized batch email to every broker touching the right market, in under a minute.

**Fewer clicks:** posture auto-detection, market matching, and recipient auto-build all carry forward from V1 (genuinely excellent automation, no reason to rebuild them differently) — V2's job is folding Setup into the main flow instead of a separate modal (flagged UX problem) and adding the missing manual override for held-back (recently-reached) brokers.

**Automation:** the 4-day suppression window stays, but gains a visible, one-click "include anyway" override per held-back broker — closing the V1 gap where those brokers are invisible-excluded with no override at all.

**Information hierarchy:** posture/style controls → live recipient count with hot/warm breakdown → editable subject/message → send.

```
Desktop (≥1024px)
┌──────────────────────────────────────────────────────────────────────┐
│  Reach                                                    [Setup ▾]  │
│  Open now ● | Planning ahead ○     Near: Nashville, TN               │
│  Tone: Low-key ○ Standard ● Eager ○                                  │
│  ──────────────────────────────────────────────────────────────────  │
│  Recipients: 12 hot, 8 warm  (3 held back — reached <4d ago) [show]  │
│  Subject  [_________________________________________________]        │
│  Message  [_________________________________________________]        │
│           [_________________________________________________]        │
│  [ Send test to me ]                          [ Send to 20 → ]       │
└──────────────────────────────────────────────────────────────────────┘

Mobile (<768px): same fields, single column, sticky send bar at bottom.
```
Fixed/carried forward: `reach_markets`-equivalent gets wired to real CRUD or explicitly dropped in the rebuild (not left as vestigial dead schema — [audit §10](./current-tms-audit.md)); market-touch matching moves to a scoped/indexed query rather than an unbounded in-JS scan as broker count grows.

---

## 13. Operations hub

**Why does this page exist?** The single feed of every inbound lead, ranked by what actually needs the operator's attention today — the sales-and-execution front door.

**Primary action:** work the top of the feed, in order.

**Fewer clicks:** the urgency-grouped single-column feed (Needs Attention → Medium → Compact → Collapsed) is a genuinely good V1 pattern — kept whole. V2's fix is structural: `computeUrgency()` becomes the same rules registry that feeds the [notification model](#notification-model), so a lead flagged here and a lead flagged on the bell/Dashboard are provably the same computation, not two vocabularies that can drift ([audit §2](./current-tms-audit.md) finding).

**Automation:** funnel visualization stays (shows where every active lead sits across the 13-state pipeline); tab routing (`?tab=`) stays deep-linkable.

**Information hierarchy:** funnel strip → urgency-grouped feed. Applications gets its own tab (kept), Accounting's figures now literally link into the unified [Receivables](#20-receivables) page rather than maintaining a second, unreconciled A/R view.

```
Desktop (≥1024px)
┌──────────────────────────────────────────────────────────────────────┐
│  Operations        [Quotes] Applications                    [＋ New] │
│  new─→contacted─→estimate─→confirm─→booked─→pay─→dispatch─→transit   │
│   3      2         4          1        6      2      1        3     │
│  ──────────────────────────────────────────────────────────────────  │
│  NEEDS ATTENTION (2)                                                  │
│  ⚠ J. Rivera — estimate sent, no reply 6d          [Open]            │
│  ⚠ M. Alvarez — awaiting payment 12d                [Open]            │
│  MEDIUM (5)                                                           │
│    New: T. Nguyen · New: K. Park · Estimate sent: S. Cho …          │
│  IN MOTION (6)                        [compact rows, one line each]  │
│  ▸ Closed / Archived / Lost (14)                                     │
└──────────────────────────────────────────────────────────────────────┘

Mobile (<768px): funnel becomes a horizontally-scrollable strip; feed groups stack full-width, identical grouping logic.
```

---

## 14. Quote detail workspace

**Why does this page exist?** One lead's complete commercial + execution lifecycle — the highest-stakes, highest-complexity screen in the app.

**Primary action:** move this lead to its next real state (send the next document, record the next event) — one obvious next action, not five tabs to hunt through.

**Fewer clicks:** the biggest win here is *subtractive* — the audit found 12+ confirmed-dead files (WorkspaceHeader, IdentityRow, StatusHero, OpsStrip, WorkflowProgress, etc. — [audit §13](./current-tms-audit.md)) still shipped in the bundle from a prior redesign pass. V2 starts from the *live* component set only (`LoadWorkspaceV2`'s actual shell, `CollapsibleWorkspaceSection`, `PreviewModal`, `EventHistorySection`) and never re-introduces the dead ones — a from-scratch rebuild has no excuse to carry ghost code forward.

**Automation:** `suggestedNext()`'s one-tap "advance" stays (it's a good pattern — hint, don't enforce, since real dispatch is messier than a linear funnel); the `awaiting_payment → ready_to_dispatch` live-computed transition stays derived-not-stored (correct, avoids drift) but the `null total_amount` footgun ([audit §13](./current-tms-audit.md)) gets a visible "total not set — auto-advance paused" banner instead of silently never firing.

**Information hierarchy:** identity/status header (one row, not five separate hero components) → one obvious next-action button → four tabs (Overview / Details / Pricing / Documents, kept — this grouping is sound) → each tab's content.

```
Desktop (≥1024px)
┌──────────────────────────────────────────────────────────────────────┐
│  ← Operations   J. Rivera — Dallas → Memphis      Status: Estimate ✎ │
│  Next: [ Follow up on estimate → ]                                    │
│  ──────────────────────────────────────────────────────────────────  │
│  Overview  Details  Pricing  Documents                                │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Event history                                                │   │
│  │  8/1 10:2a  Estimate sent ($1,400–$1,650)                    │   │
│  │  7/30 3:1p  Lead created via quote form                       │   │
│  └──────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘

Mobile (<768px): status header + next-action button pinned at top (sticky), tabs become a horizontal scroller, tab content stacks full-width.
```
Details tab: auto-save stays but posts only the *changed* keys, not the full 18-key payload on every save — fixes the "partial edit clobbers unrelated fields" footgun risk flagged in the audit ([audit §13](./current-tms-audit.md)) even though V1 never hit it in practice, since a partial-post caller is one refactor away from breaking it silently.

---

## 15. Estimate composer + send

**Why does this page exist?** Build and send the first customer-facing number — a range, not a commitment.

**Primary action:** get an accurate range in front of the customer fast.

**Fewer clicks:** kept as a form → live preview → send, single flow (this pattern already works well in V1 — the risk audit in the code itself confirms it's stable); V2's contribution is consolidating the triplicated `escapeHtml`/`shortRef`/`resolveFrom` helpers ([audit §14](./current-tms-audit.md)) into one shared email/PDF module so a bug fixed once is fixed everywhere, not two-of-three places.

**Automation:** zip-based lane/mileage lookups stay; draft auto-save stays.

**Information hierarchy:** two-pane on desktop (form left, live preview right) so "what will the customer actually see" is never a guess.

```
Desktop (≥1024px)                                    Mobile (<768px)
┌──────────────────────┬───────────────────────┐    ┌───────────────────┐
│ Estimate — J. Rivera │  Live preview          │    │ Estimate — Rivera  │
│ Origin  [Dallas,TX]   │  ┌───────────────────┐│    │ [Form] [Preview]   │
│ Dest    [Memphis,TN]  │  │ Range: $1,400–1,650││    │  (tab switch)      │
│ Equipment [Hotshot▾]  │  │ Valid through 8/8  ││    │                    │
│ Range low  [1400]     │  └───────────────────┘│    │ Origin  [_______]  │
│ Range high [1650]     │                        │    │ Dest    [_______]  │
│ Valid until [8/8]     │                        │    │ Range   [__][__]  │
│ ─────────────────────│                        │    │ [Preview] [Send]  │
│ [Save draft] [Send →] │                        │    └───────────────────┘
└──────────────────────┴───────────────────────┘
```

---

## 16. Finalized Quote composer + send

**Why does this page exist?** The formal, exact rate confirmation — the document that actually books the load.

**Primary action:** lock in the exact price and send the binding confirmation.

**Fewer clicks:** the pricing breakdown (linehaul/fuel surcharge/permits/accessorials) auto-populates from the estimate's range as a starting point rather than a blank form — a real time-save V1 doesn't do (each document type is composed independently).

**Automation:** the fingerprint-based staleness detection (flagging when the form has drifted from what was last sent) stays — it's a sound "don't accidentally resend something you haven't actually changed" guard.

**Information hierarchy:** same two-pane form/preview pattern as the Estimate composer for consistency — an operator who's used one has used the other. The pricing-transparency choice (PDF shows full breakdown, email shows total only — [audit §14](./current-tms-audit.md)) is made a visible, explicit toggle in this composer rather than a silent divergence baked into two separate renderers — the operator decides per-quote instead of the code deciding once, invisibly, for everyone.

```
Desktop (≥1024px)
┌──────────────────────────┬───────────────────────┐
│ Finalized Quote — Rivera  │  Live preview (Email) │
│ Linehaul      [1,500]     │  ┌───────────────────┐│
│ Fuel surcharge [90]       │  │ Total: $1,650      ││
│ Permits        [40]       │  │ [Show full breakdown│
│ Accessorials   [20]       │  │  to customer? ○ ●] ││
│ Total          $1,650     │  └───────────────────┘│
│ ⚠ Stale — form has changed since last sent          │
│ [Save draft] [Send →]     │                        │
└──────────────────────────┴───────────────────────┘
```

---

## 17. BOL composer + sign + send

**Why does this page exist?** Execution paperwork — the document that actually moves with the freight and captures signatures.

**Primary action:** generate the BOL, get both signatures, done — no step should require re-uploading or losing the other party's stamp.

**Fewer clicks:** the two-independent-signer-role model (receiver/carrier never overwrite each other, [audit §14](./current-tms-audit.md)) is a genuinely correct design — kept exactly. Draft → build preview → send stays a straight line.

**Automation:** the never-mutates-source signature compositing (`signDoc.ts`'s rotation-safe stamping) carries forward unchanged — it's solving a real, subtle problem correctly.

**Information hierarchy:** document preview dominates (this is a "get the paper right" screen, not a data-entry screen) with a slim signature-status strip.

```
Desktop (≥1024px)                                    Mobile (<768px) — signature capture
┌──────────────────────────────────────┐            ┌───────────────────────┐
│  BOL — J. Rivera            [Send →] │            │  Sign as: Receiver     │
│  Signatures:  Carrier ✓   Receiver ○  │            │  ┌───────────────────┐│
│  ┌──────────────────────────────────┐│            │  │                   ││
│  │                                  ││            │  │   (draw here)     ││
│  │        <BOL document preview>    ││            │  │                   ││
│  │                                  ││            │  └───────────────────┘│
│  └──────────────────────────────────┘│            │  [Clear]  [Confirm]   │
└──────────────────────────────────────┘            └───────────────────────┘
```

---

## 18. Customer-facing confirm pages

**Why do these pages exist?** The shipper's *entire* window into the system — token-gated, unauthenticated, one-shot per link. Every click here is a stranger's first and only impression of the business's professionalism.

**Primary action (per page):** Accept/decline the estimate → fill in shipment details → confirm the finalized rate. Each is a single yes/no or single-form decision — never a dashboard.

**Fewer clicks:** each link lands the customer already in context (their lane, their price) — zero login, zero navigation, one primary button per screen. Kept from V1, which already does this well; V2's change is visual only — these pages currently are hand-maintained *copies* of admin-preview twins that can drift ([audit §11](./current-tms-audit.md) weakness) — V2 renders the real customer page directly inside the Preview Lab via a `readOnly` prop instead of maintaining a second copy, so preview and production are provably the same component, not just the same email-render function.

**Automation:** none needed — deliberately minimal, single-purpose, mobile-first (most shippers open these on a phone from an email).

**Information hierarchy:** brand mark → the one number/decision that matters → the one button.

```
Mobile (primary target, 402px)                     Desktop (centered card, same content)
┌───────────────────────┐
│        H  Harblanc     │
│                        │
│   Your estimate        │
│   Dallas → Memphis      │
│                        │
│      $1,400–$1,650     │
│    Valid through 8/8    │
│                        │
│  [   Accept estimate  ] │
│  [      Decline       ] │
│                        │
└───────────────────────┘
```
Same shell/shape reused for: shipment-intake form (post-accept), finalized-quote confirm (accept exact rate + payment), and payment. Token resolution stays two independent boundaries (accept-token vs. confirmation-token, never cross-usable — [audit §14](./current-tms-audit.md), a correct existing design).

---

## 19. Applications

**Why does this page exist?** Review queue for inbound owner-operator recruiting submissions — a simple work queue, deliberately not over-built with a status pipeline the underlying data doesn't have.

**Primary action:** review one application, decide keep-or-archive.

**Fewer clicks:** dense table (kept, it's already a work-queue-appropriate density), row click opens detail without a full page nav (slide-over on desktop, full page on mobile).

**Automation:** none warranted — this is intentionally a thin, low-automation review queue; the audit correctly notes V1 deliberately omits a fabricated status column, and V2 keeps that restraint.

**Information hierarchy:** list → detail slide-over, trash tab for the 30-day soft-delete window (kept, with the missing purge job finally wired to a real scheduled task rather than a `delete_after` column nothing acts on — [audit §15](./current-tms-audit.md) weakness).

```
Desktop (≥1024px)
┌──────────────────────────────────────────────────────────────────────┐
│  Applications                    [Search…]                    Trash  │
│  Name            Submitted   Truck       Experience    Phone         │
│  D. Alvarez        8/1        2019 Volvo    6 yrs      (555) …      │
│  R. Kim             7/29       2021 Freightliner  3 yrs  (555) …    │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 20. Receivables

**Why does this page exist?** "What's owed to me, and by whom" — for both sides of the business, in one place. This is the structural fix for PRD priority #2: two unreconciled A/R concepts (carrier-load vs. customer-quote).

**Primary action:** collect the oldest/largest outstanding balance.

**Fewer clicks:** one-tap "Mark paid" stays, but now takes an optional amount + backdatable date (V1 is a strict all-or-nothing $now-only toggle — flagged gap, [audit §17](./current-tms-audit.md)) — supports real partial payments for the first time, recorded via the same `payments` ledger both A/R types already share underneath.

**Automation:** aging buckets computed via the money engine for both rows; a load's or quote's balance-due figure is always the *same* number whether you arrived here or from Load Detail / Quote Detail (every money figure links to its source, cross-cutting win #8).

**Information hierarchy:** two clearly-labeled sections — **Carrier freight** (what brokers owe you for delivered loads) and **Customer brokerage** (what shippers owe on your finalized quotes) — never merged into one number, always visually distinct, but on one page so there's no more "which A/R am I even looking at" ambiguity.

```
Desktop (≥1024px)
┌──────────────────────────────────────────────────────────────────────┐
│  Receivables                                                          │
│  CARRIER FREIGHT                     Outstanding: $3,290              │
│  0–7 $0   8–14 $650   15–30 $1,000   31+ $1,640                       │
│  #4790  Werner  42d   $1,650   [Mark paid ▾]                          │
│  #4801  CH Robinson 12d $650   [Mark paid ▾]                          │
│  ──────────────────────────────────────────────────────────────────  │
│  CUSTOMER BROKERAGE                  Outstanding: $1,650              │
│  J. Rivera  awaiting payment  $1,650   [Record payment]               │
└──────────────────────────────────────────────────────────────────────┘

Mobile (<768px): two stacked sections, same cards as Load Board/Operations feed patterns, "Mark paid ▾" opens an inline amount/date sheet.
```
Fixed: no more separate, non-cross-referenced Accounting-tab A/R — Accounting ([§22](#22-accounting)) now *links into* this page for balances instead of maintaining its own capped, independently-computed figure.

---

## 21. Expenses

**Why does this page exist?** The manual recurring-charge log — insurance, truck payment, subscriptions. Explicitly not a bank feed; a schedule-derived estimate, and V2 keeps that scope honest rather than pretending it's a ledger of actuals.

**Primary action:** log a new recurring charge, or check this-month's run-rate.

**Fewer clicks:** slide-over add/edit form (kept — it's a good pattern), bulk archive/delete/category-change (kept, now via the shared `<DataList>` bulk-select rather than a bespoke implementation).

**Automation:** quarterly/annual frequencies finally get a real anchor date (schema gap in V1 — [audit §18](./current-tms-audit.md)) so `nextChargeLabel` works for every frequency, not just monthly/weekly. CSV import gets a per-row error report instead of silently skipping malformed rows.

**Information hierarchy:** run-rate KPI strip → dense ledger table, saved filters now server-persisted (fixes the `localStorage`-only gap — [audit §18](./current-tms-audit.md)).

```
Desktop (≥1024px)
┌──────────────────────────────────────────────────────────────────────┐
│  Expenses                                    [Search…]  [＋ New]     │
│  This month $2,140   YTD $16,900   Avg/mo $2,113                     │
│  [Category ▾] [Frequency ▾] [Saved: "Recurring only" ▾]  ⎘  ⇩       │
│  Vendor            Category    Freq       Next        Amount        │
│  Progressive Ins.   Insurance   Monthly    8/15        $410          │
│  Ryder Lease        Truck pmt   Monthly    8/1         $1,280        │
│  Samsara            Subscript.  Annual     3/1/27      $450          │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 22. Accounting

**Why does this page exist?** Live Stripe balance/fees/payouts for the customer-brokerage revenue stream — a payments-infrastructure view, distinct from the A/R question ([§20](#20-receivables) now owns A/R).

**Primary action:** confirm what actually landed in the bank this month, and reconcile against Stripe.

**Fewer clicks:** none needed beyond "open in Stripe" (kept) — this is a read-only reconciliation view by nature.

**Automation:** the MTD "Collected" figure moves from a hard-capped 100-row client reduce to a real aggregate query — fixes a **confirmed correctness bug** where months with >100 payments silently undercount ([audit §19](./current-tms-audit.md)).

**Information hierarchy:** KPI strip (Collected MTD, Stripe fees, Net to bank) → payments ledger (paginated, not last-15-hardcoded) → Stripe payouts/balance panel, each explicitly labeled as *customer-brokerage* money with a link out to the unified Receivables page for the outstanding side.

```
Desktop (≥1024px)
┌──────────────────────────────────────────────────────────────────────┐
│  Accounting                                        [Open in Stripe ↗]│
│  Collected MTD $8,400   Stripe fees $244   Net to bank $8,156         │
│  Outstanding A/R → see Receivables ($1,650)                          │
│  ──────────────────────────────────────────────────────────────────  │
│  Payments                                          [Load more ▾]     │
│  J. Rivera   8/1   $1,650   card ····4242                            │
│  Payouts (Stripe)                                                     │
│  8/2  →  $8,156  bank ····1122                                        │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 23. Performance

**Why does this page exist?** The analytics rollup — net vs. goal, rate/mile trend, deadhead, leaderboards, and the plain-English "Insights" engine (a genuinely strong V1 feature worth carrying forward whole).

**Primary action:** answer "am I on pace this month, and why/why not."

**Fewer clicks:** period picker stays client-instant (no server round-trip for a UI toggle — correct pattern to keep), but now toggles a *server-computed* period rollup instead of re-aggregating the entire fetched load history client-side on every toggle.

**Automation:** the Insights rules engine (minimum-sample/effect-size gates, max 6 shown, priority-ranked — [audit §20](./current-tms-audit.md)) carries forward unchanged, it's excellent; its thresholds move to Settings as owner-configurable values instead of hardcoded constants. The fifth TONU-factoring treatment (Performance's unconditional-factoring hardcode) is deleted — this page now calls the same `computeLoadNet()` as everywhere else, closing the last of the five TONU inconsistencies.

**Information hierarchy:** KPI strip with MoM deltas → Net-vs-goal chart → rate trend / deadhead → leaderboards → Insights strip → monthly ledger.

```
Desktop (≥1024px)
┌──────────────────────────────────────────────────────────────────────┐
│  Performance                         [Trailing 12mo ▾] [From–To]     │
│  Net $11,220 ▲12%   $/mi $2.14 ▲3%   Deadhead 8.2% ▼1pt              │
│  ┌──────────────────────────┐  ┌──────────────────────────┐          │
│  │ Net vs goal (ring+trend) │  │ Rate/mi trend (2 lines)   │          │
│  └──────────────────────────┘  └──────────────────────────┘          │
│  Top brokers            Top lanes                                    │
│  1 Werner $22,400        1 DAL→MEM $8,900                            │
│  INSIGHTS                                                             │
│  • Nashville lane is 28% below your average rate/mi this month       │
│  • Werner has averaged 38-day payment — consider factoring more loads│
│  MONTHLY LEDGER                                          [Load more]│
└──────────────────────────────────────────────────────────────────────┘

Mobile (<768px): KPI strip becomes swipeable tiles, charts stack full-width, leaderboards collapse to top-3 with "see all."
```

---

## 24. Maintenance / Repairs

**Why does this page exist?** The truck's parts-first repair log — a sound, deliberately money-de-emphasized model V1 gets right conceptually.

**Primary action:** log a service visit, or check what's due soon.

**Fewer clicks:** the "log a visit with N parts" modal stays largely as-is (it's a well-thought-out form); one-tap "Mark reminder dismissed" stays.

**Automation:** the 5 near-identical per-page loader functions ([audit §21](./current-tms-audit.md) weakness — one fix missed in four other places risk) collapse into one shared `loadMaintenanceData()` used by Home/Category/Preventative/Set/Detail — a single source for freshness/reminder computation instead of five copies. Auto-categorization and the auto-linked "related parts" graph carry forward unchanged (good automation).

**Information hierarchy:** category grid (7 fixed groups + Preventative lens) → due-soon strip → recent services, cost still de-emphasized per the owner's stated preference (no cost KPI headlining the page).

```
Desktop (≥1024px)
┌──────────────────────────────────────────────────────────────────────┐
│  Maintenance                                        [Log service +]  │
│  DUE SOON (2)                                                        │
│  ⚠ Oil & filter — 900mi overdue         ⚠ Fuel filters — due in 400mi│
│  ──────────────────────────────────────────────────────────────────  │
│  Engine  Brakes  Suspension  Tires  Electrical  Drivetrain  Other    │
│  Preventative ▸                                                       │
│  RECENT SERVICES                                                      │
│  7/28  Oil change + filters (2 parts)              odo 84,200        │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 25. Files

**Why does this page exist?** One unified, searchable timeline across every uploaded document (load docs, maintenance receipts, customer intake uploads) — genuinely useful as a single "where's that file" answer.

**Primary action:** find a specific document fast.

**Fewer clicks:** search-seedable via `?q=` from anywhere (kept — a good cross-app hand-off pattern), unified `DocViewer` (kept, already correctly shared across three features).

**Automation:** the metadata timeline is now server-paginated at the query level, not just display-paginated over an in-memory full union of three growing tables ([audit §22](./current-tms-audit.md) weakness — flagged as a stronger risk than most other full-scan patterns because it unions three independently-growing tables). Lazy-signing of visible rows only (kept — it's the right lever, was already correct). Delete now calls each source's own canonical delete action instead of a fourth reimplementation of the same logic.

**Information hierarchy:** search/filter chips → newest-first timeline, virtualized.

```
Desktop (≥1024px)
┌──────────────────────────────────────────────────────────────────────┐
│  Files                                          [Search…]            │
│  [All] Load docs  Maintenance  Intake                                │
│  📄 Rate Con — Load #4821                  8/1     [view]            │
│  🧾 Oil change receipt                     7/28    [view]            │
│  📎 J. Rivera intake upload                7/30    [view]            │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 26. Camera

**Why does this page exist?** Phone-first rapid BOL/paperwork scanning — batch photos, export as one PDF or ZIP.

**Primary action:** photograph a paper document and get it into a shareable PDF in seconds, one-handed, in-cab.

**Fewer clicks:** capture → batch → export stays exactly as V1 (this is already a well-built, purpose-fit mobile flow).

**Automation:** export completion is tied to a real completion signal instead of a hardcoded 4-second timeout ([audit §23](./current-tms-audit.md) weakness); the earmarked-but-unbuilt "email this batch to my rep" gets built in V2 since the assembled PDF buffer already exists and Resend is already wired everywhere else — a genuinely cheap, real automation win the audit itself flags as low-hanging.

**Information hierarchy:** camera viewfinder dominates; batch strip is a thin filmstrip along the bottom, export controls surface only once ≥1 photo exists.

```
Mobile (primary, portrait)
┌───────────────────────┐
│  ← Batch: BOL 8/1      │
│                        │
│    <camera viewfinder> │
│                        │
│  [📷 shutter]           │
│  ─────────────────────│
│  [1][2][3][+]           │  ← filmstrip
│  [Export PDF] [Email →]│
└───────────────────────┘
```

---

## 27. Settings

**Why does this page exist?** Business defaults, appearance, and account controls — the one place all the "how does the app compute things" knobs live.

**Primary action:** change a business default (fuel price, factoring %, goals) and trust every downstream page picks it up.

**Fewer clicks:** grouped sections instead of one long scroll (Business, Appearance, Notifications, Advanced), with the account/sign-out block reachable from the shell's own account menu on desktop (kept accessible on mobile at the top of Settings, not buried at the bottom — fixes the flagged UX gap of sign-out sitting beneath a full scroll — [audit §24](./current-tms-audit.md)).

**Automation:** business-default forms get the Dashboard's inline-error/optimistic-save pattern (fixes the plain-`<form>`-no-inline-validation gap — [audit §24](./current-tms-audit.md)); Performance's Insights thresholds move here as owner-configurable values.

**Information hierarchy:** account identity (read-only) → Business defaults → Appearance → Notifications preferences → Demo mode toggle → Advanced/diagnostics, in that priority order (money-affecting settings first, cosmetic settings after).

```
Desktop (≥1024px)
┌──────────────────────────────────────────────────────────────────────┐
│  Settings                                                             │
│  Account        Adam M. · harblancservices@gmail.com     [Sign out]  │
│  Business       MPG [6.5]  Diesel $/gal [3.85]  Factoring % [3]      │
│                 Monthly goal [24,000]  Annual goal [280,000]          │
│  Appearance     Theme: Light ● Dark ○     Density: Comfortable ▾     │
│  Notifications  Insight thresholds, alert channels                    │
│  Demo mode      ○ off  ●  on                                          │
│  Advanced       Environment diagnostics                               │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Demo mode

**Why does this exist?** Show the whole product to a third party — investor, buyer, curious friend — with zero risk of exposing or corrupting real business data. Stated by the owner as the #1 requirement for this feature; V2 treats that as an architectural constraint, not a UI toggle.

**Primary action (for the owner):** flip one switch, present confidently, flip it back — no risk of a stray real number leaking or a stray write hitting real data.

**Fewer clicks:** unchanged from the owner's perspective — still one toggle in Settings, a persistent banner while active (kept, it's correct and necessary).

**Automation — the actual redesign:** V1 enforces isolation by *convention*: every mutating server action must remember to call `blockedByDemo()` as its literal first line, with no structural backstop ([audit §1](./current-tms-audit.md), [audit §25](./current-tms-audit.md) — currently 100% compliant, but a standing risk for the next action anyone writes). V2 makes this **structurally impossible to forget**:

- Every data access goes through a single `DataSource` interface (`getLoads()`, `markLoadPaid()`, …) rather than a raw Supabase client imported ad hoc per file.
- Two implementations exist behind that interface: `LiveDataSource` (real service-role Supabase client) and `DemoDataSource` (the curated in-memory dataset, no-op on every write).
- The interface is resolved **once**, at the request boundary (middleware/layout), from `isDemoMode()`, and passed down via context/DI — no page or action ever imports a Supabase client directly, so there is no code path left that *could* bypass the switch. A new feature physically cannot "forget" the demo guard, because it never touches real data access at all except through the one interface that's already isolated.
- The demo dataset stays hand-curated (as today — deliberately internally consistent, generated relative to "now," run through the same money-engine helpers real data uses so demo numbers agree across screens exactly like real numbers do) — but the **enforcement** moves from a lint-of-one-line-per-file to a type system that has no other way in.

```
┌──────────────────────────────────────────────────────────────────────┐
│  ⚠ DEMO MODE — showing sample data, no changes are saved      [Exit] │
├──────────────────────────────────────────────────────────────────────┤
│                    <normal app UI, unchanged>                        │
└──────────────────────────────────────────────────────────────────────┘
```

