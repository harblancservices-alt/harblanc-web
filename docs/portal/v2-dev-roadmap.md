# `/portal` V2 — Development Roadmap

**Status:** planning only, no code written as part of producing this document. **Companion docs:** [`current-tms-audit.md`](./current-tms-audit.md) (what V1 does, exactly), [`current-tms-prd.md`](./current-tms-prd.md) (prioritized weaknesses), [`v2-design.md`](./v2-design.md) (the target design this roadmap builds toward — every phase below ships a specific numbered section of that document).

**Purpose of this document:** a phased, independently-deployable build sequence for V2, so the rebuild can proceed screen-by-screen without ever putting the live `/admin` TMS at risk.

---

## Ground rules (apply to every phase below, not repeated per-phase)

1. **Production never breaks.** `/admin` stays online, unmodified in behavior, for the entire roadmap. No phase touches `src/app/admin/**` except the final cutover phase, and even then only additively (see Phase 12).
2. **V2 lives under `/tms-v2`** (a new Next.js route group, e.g. `src/app/tms-v2/(authed)/...`), additive-only, until the cutover phase renames/promotes it to `/portal`. Until cutover, `/tms-v2` is reachable only by an operator who knows the URL — it is never linked from `/admin`'s nav, and it is excluded from `sitemap.ts` and given `robots: noindex`.
3. **Auth is identical from Phase 1 onward.** `/tms-v2/:path*` is added to the same `src/middleware.ts` gate used by `/admin/:path*` — same `ADMIN_EMAIL` comparison, same `x-admin-user-id`/`x-admin-user-email` header forwarding, same `requireAdmin()`/`adminFromMiddleware()` pair reused (not reimplemented) from `src/lib/admin/auth.ts`. A session already logged into `/admin` is automatically valid on `/tms-v2` with zero extra login step, and vice versa. No phase introduces a second session model, a second cookie, or a second password.
4. **No schema changes, ever, inside a build phase.** V2 reads/writes the existing Supabase project (`rtlahhywtijaayrzipvs`) exactly as `/admin` does today — same tables, same columns, same service-role-client pattern. If a phase's own testing surfaces a genuine schema gap (e.g. Expenses' missing quarterly/annual anchor date, or a table the audit flagged as possibly not yet applied to prod — camera, the QuickBooks-expenses redesign), that gap is written up as a standalone migration proposal in `docs/portal/` and parked for explicit owner approval. It is never silently rolled into a phase's "done" definition.
5. **Every phase ships behind its own PR(s), typechecked and built green before merge.** `npm run build` (or the project's equivalent) and `tsc --noEmit` are non-negotiable gates on every phase — see each phase's Testing section for what's added on top of that floor.
6. **Rollback is "revert the merge" for every phase except cutover.** Because `/tms-v2` is additive and unlinked, deleting or reverting its code cannot regress `/admin`. Only the cutover phase (Phase 12) needs a real rollback *procedure* beyond `git revert`, because that's the one phase that changes what `/portal` resolves to.
7. **The money engine, attribution rule, and notification registry grow incrementally.** Phase 2 ships the *interfaces and scaffolding* (`lib/money/*`, `attributionDate()`, the `DataSource` abstraction, `lib/notifications/rules.ts`); each later phase that introduces a new financial concept or alert condition adds its function/rule to those same shared modules rather than creating a page-local copy. This is what makes Finding #1 (five TONU treatments) structurally impossible to reintroduce.

---

## Phase 0 — Live schema verification (docs-only, no code)

**Scope:** Pull the live Supabase schema (`supabase db pull` or a dashboard export) for the ten operationally-central tables that have no `CREATE TABLE` in tracked migration history (`loads`, `brokers`, `broker_contacts`, `trips`, `load_documents`, `load_expenses`, `dispatch_settings`, `recurring_expenses`, `expense_accounts`, `app_settings`), per PRD priority #3. Diff the pulled schema against what the audit describes from application code. Produce a short `docs/portal/schema-verification.md` noting any discrepancy, and a separate one-paragraph-per-item proposal list for anything that looks like it needs a real migration (quarterly/annual expense anchor date, camera migration prod status, QuickBooks-expenses migration prod status, any partial-unique-index gaps like the "one default payment method" rule). No table is altered. No approval is requested yet in this phase — it just produces the accurate baseline every later phase's data-layer work reads from.

- **Complexity:** Low — read-only introspection and a write-up.
- **Risk:** Low — zero write access to the database; worst case is the pull tool needs credentials the operator has to provide.
- **Dependencies:** None — this can start immediately, in parallel with Phase 1.
- **Testing:** Manual — confirm the pulled DDL round-trips (i.e., matches what Supabase reports for each of the 10 tables) and that every column referenced in the audit's data-model section (§28) is accounted for.
- **Completion criteria:** `docs/portal/schema-verification.md` exists, committed, covering all 10 tables; any proposed-but-not-yet-approved migration is listed explicitly as "proposal, not scheduled" so no later phase mistakes it for done work.
- **Rollback:** N/A (documentation only, no app or database change).

---

## Phase 1 — Scaffold `/tms-v2`: shared auth, app shell, unified nav, design tokens

**Ships:** [Design doc §Design system & tokens](./v2-design.md#design-system--tokens), [§Global shell & unified navigation](./v2-design.md#global-shell--unified-navigation).

**Scope:** Create the `/tms-v2` route group and its `(authed)` layout wired to the shared auth gate (ground rule #3). Implement the CSS token set (`--bg`/`--fg`/`--accent`/`--positive`/`--negative`/`--warning`, type scale, 8px grid) as the app's only styling vocabulary going forward. Build the single `nav.config.ts` array and the shell components that read from it: desktop sidebar (collapsible rail), mobile bottom nav + "More" sheet, and a placeholder top bar (search box wired later in Phase 2's command palette, quick-add button wired per-module as each module ships, bell icon wired in Phase 3 alongside the notification model). Land on a bare `/tms-v2` root page (just "Today" placeholder) so the shell has something to render around. No business screens yet — this phase is pure chrome.

- **Complexity:** Medium — new route group, layout, and a nav-config-driven render for two breakpoints, but no business logic.
- **Risk:** Low — entirely additive; nothing in `/admin` is touched; the only shared surface is `src/middleware.ts`, which gets a route-matcher addition, not a rewrite of existing `/admin`/`/crm` matching logic.
- **Dependencies:** None (Phase 0 can run in parallel, not a blocker).
- **Testing:** `tsc`/build gates; manual pass logging in via the real `/admin/login` page, then navigating directly to `/tms-v2` in the same browser session to confirm the shared cookie is honored with no second login; manual check that an unauthenticated request to any `/tms-v2/**` path redirects to `/admin/login` exactly like `/admin/**` does today; responsive check at the 768px/1024px breakpoints; dark/light theme toggle smoke test.
- **Completion criteria:** `/tms-v2` renders the full shell (sidebar/bottom-nav/top-bar chrome) behind the shared auth gate on desktop and mobile, `robots: noindex` set, not linked from `/admin`'s nav or `sitemap.ts`, single `nav.config.ts` is the only route registry (verified by grep — no second hand-kept nav array anywhere in `tms-v2/**`).
- **Rollback:** Revert the merge; `/admin` and `/crm` are untouched since the middleware change is a pure route-matcher addition.

---

## Phase 2 — Shared domain/data layer

**Ships:** the non-negotiable engineering constraints from [design doc's intro](./v2-design.md#portal-v2--design-document) — one money engine, one attribution rule, structural demo-mode isolation, paginated query modules — plus the [command palette](./v2-design.md#command-palette--keyboard-shortcuts) and [notification model](./v2-design.md#notification-model) scaffolding.

**Scope:** This is the highest-leverage phase in the whole roadmap — every later screen phase depends on it, and it's where PRD priorities #1 (TONU/money consistency) and #5 (structural over conventional invariants) actually get fixed, not just documented.

- `lib/money/*`: `computeLoadNet()`, `computeTonuNet()`, `computeTripNet()`, `computeAR()` — ported from V1's `src/lib/dispatch/fuel.ts`/`trip-rollup.ts` logic but consolidated into the *one* callable path every later phase is required to use. Includes the fix for the five-way TONU inconsistency (audit §3/§20): one deterministic answer, factoring gated on the broker's real `factoring` flag, no page-local hardcode.
- `attributionDate(load)`: the single pickup-date-based month-attribution helper (replacing V1's `goalMonthParts(closeOutDate(load))` ad hoc repetition).
- `DataSource` interface + `LiveDataSource`/`DemoDataSource` implementations, resolved once per-request from `isDemoMode()` and passed via context — the structural demo-mode fix described in [design doc's Demo mode section](./v2-design.md#demo-mode). No page or action in any later phase imports a Supabase client directly; everything goes through this interface. This is what makes the demo-isolation guarantee a type-system fact instead of a discipline.
- `lib/notifications/rules.ts`: the rules-registry shape (`{severity, entity, dedupeKey, ...}`) and the bell/dropdown UI shell wired into Phase 1's top bar — shipped with zero or one trivial rule initially (e.g. a static "welcome" no-op), since real rules (overdue receivable, stale quote, maintenance due) get added by the phases that actually own that data (Phase 4, Phase 7, Phase 10 respectively). This phase's job is making the registry the *only* place a rule can be added, not authoring every rule up front.
- Server-paginated query module pattern (`{page, pageSize, filters} → {rows, totalCount}`) established once here as the shape every later list screen (`<DataList>`, Phase 1's primitive) consumes — no later phase invents its own pagination contract.
- Command palette shell: `⌘K` open/close, keyboard shortcut map (`G then D`, etc.), and a first indexed search source (records) — action-layer entries get added incrementally as each module ships its own actions, same incremental pattern as the notification registry.

**Explicitly not in scope for this phase:** any actual screen. This phase has no user-visible page beyond the palette and bell shell from Phase 1's top bar — it is a library + interface phase, verified by unit tests, not a UI walkthrough.

- **Complexity:** High — this is where the architectural guarantees the whole rebuild is justified by (single money engine, structural demo isolation) actually get built, and getting the `DataSource` interface shape wrong here is expensive to unwind later.
- **Risk:** Medium — no risk to production (still fully additive, and `LiveDataSource` isn't exercised by any real screen yet), but *design* risk: an interface that's too narrow will force a workaround in a later phase. Mitigate by sketching `LiveDataSource`'s method signatures against all of Phases 3–9's actual data needs (already enumerated in the design doc) before finalizing, not just Phase 3's.
- **Dependencies:** Phase 1 (shell to mount the palette/bell into); Phase 0's schema verification should land first so the money-engine functions and `DataSource` methods are written against confirmed column names, not assumed ones.
- **Testing:** Unit tests ported/expanded from V1's existing money-math test suite (`fuel.test.ts`, `trip-rollup.test.ts`, `goal-month.test.ts` equivalents) — every money-engine function gets a TONU case, a factoring-on and factoring-off broker case, and a boundary case (null `total_amount`, missing odometer reading). `DataSource` gets a contract test run against both implementations (`LiveDataSource` against a scratch/staging read, `DemoDataSource` against the curated fixture) asserting identical method signatures and return shapes. No manual UI testing (there's no UI to test yet beyond Phase 1's shell, which was already verified).
- **Completion criteria:** `lib/money/*` has 100% of the TONU/factoring/A/R logic centralized with passing unit tests covering the audit's five documented inconsistency cases; grep confirms zero Supabase client imports anywhere under `tms-v2/**` outside the `DataSource` implementation files themselves; the notification registry and pagination contract are documented (a short README in the relevant `lib/` folder is fine) so every subsequent phase implements against the same shape.
- **Rollback:** Revert the merge; nothing outside `tms-v2/**` and the middleware matcher is touched, and no real screen depends on this yet within the same phase.

---

## Phase 3 — Dashboard / Today

**Ships:** [Design doc §3](./v2-design.md#3-dashboard--today).

**Scope:** The first real screen and the first live exercise of Phase 2's `DataSource`/money-engine/notification registry. Needs Attention zone (backed by real notification rules registered this phase: overdue receivable via `computeAR()`, stale quote, maintenance-due, incomplete-expense, empty-truck nudge — ported from V1's `alerts.ts` logic but now living in the shared registry, not a Dashboard-local file), Active Loads cards with inline odometer/doc actions, goal-pace widget (reusing the same trailing-window helper Performance will use in Phase 7 — stub the helper here, Phase 7 completes it), maintenance mini-strip.

- **Complexity:** Medium — mostly composition over Phase 2's primitives, but the alert-generation logic (dedupe keys, per-occurrence dismissal via real `notification_id` instead of V1's stringly-keyed hack) is genuinely new work, not a port.
- **Risk:** Low — read-mostly page; the only writes are odometer entry, doc upload, and alert dismissal, all narrow and already-proven patterns from V1.
- **Dependencies:** Phase 1 (shell), Phase 2 (`DataSource`, money engine, notification registry, command palette).
- **Testing:** Build/typecheck gates; manual walkthrough logged in as the real admin account against real (non-demo) data comparing Dashboard figures 1:1 against the existing `/admin` Dashboard for the same day (goal pace %, active load count, A/R figures) to catch any silent money-engine regression before it compounds into later phases; demo-mode toggle verified to swap the whole page to fixture data with zero real reads (checked via network tab / query logs, not just visual inspection).
- **Completion criteria:** `/tms-v2` Dashboard numbers match `/admin` Dashboard numbers exactly for the same live data (modulo the intentional TONU-net fix, which should be called out explicitly if it produces a different number than V1 for any TONU'd load); alert dismissal survives a refresh; demo mode fully isolated.
- **Rollback:** Revert the merge.

---

## Phase 4 — Load Board + Load detail

**Ships:** [Design doc §4](./v2-design.md#4-load-board), [§5](./v2-design.md#5-load-detail).

**Scope:** The carrier system-of-record core. Load Board: KPI strip, server-paginated/filtered list (via Phase 2's pagination contract, replacing V1's ship-all-history pattern), New Load modal (FMCSA lookup + lane-mileage auto-fill ported from V1), CSV export scoped to the filtered query. Load Detail: unified inline-edit surface (replacing V1's three separately-collapsible cards), hero net-profit number, one-tap Mark Delivered/TONU, documents card with signed-URL caching for the page session. This phase is the first one that fully proves out the TONU-net fix end-to-end on the two screens that most visibly disagreed in V1.

- **Complexity:** High — largest screen pair in the "core screens" cluster; the inline-edit-everywhere pattern (replacing V1's per-card edit toggles) is new UI work, not a port, and the BOL-scanning/signature-capture pieces carried from V1 are non-trivial (`pdf-lib`/`sharp`, lazy-imported for the same load-time-fragility reason V1 does it).
- **Risk:** Medium — this is carrier revenue data the operator relies on daily; a money-engine wiring mistake here is the highest-consequence bug this roadmap could ship. Mitigated by Phase 2's unit-test floor plus this phase's side-by-side reconciliation testing (below).
- **Dependencies:** Phase 2 (money engine — `computeLoadNet()`/`computeTonuNet()` are load-bearing on this exact screen pair), Phase 3 (Active Loads cards on Dashboard link here, though Load Board itself doesn't require Phase 3 to function).
- **Testing:** Build/typecheck gates; a scripted reconciliation pass — export V1's Load Board CSV and V2's Load Board CSV for the same month and diff net-profit-per-load, expecting zero unexplained deltas (any delta must trace to the intentional TONU fix, not a bug); manual test of the full New Load → odometer progression → Mark Delivered → TONU → Mark Paid lifecycle; document upload/signing smoke test (upload, sign as both roles, confirm neither signature overwrites the other).
- **Completion criteria:** Reconciliation diff against V1 is clean (explained deltas only); load list is server-paginated with a real page size and total count, no full-table client fetch; CSV export operates on the filtered server query.
- **Rollback:** Revert the merge.

---

## Phase 5 — Trips list + Trip detail

**Ships:** [Design doc §6](./v2-design.md#6-trips-list), [§7](./v2-design.md#7-trip-detail).

**Scope:** Out-and-back trip grouping and PC-mile/diesel rollup. List: server-scoped month KPI strip, real `<Link>` navigation (fixing V1's `router.push` wrapper). Detail: hero net (pattern already proven in V1's own recent redesign, commit `5c05842` — ported forward, not reinvented), Money/Miles flat rows via `computeTripNet()`, odometer bookends with inline validation, and the new "⚠ incomplete" flag on PC-miles when a load in the sequence is missing an odometer reading (fixing the audit's silent-$0-undercount finding).
- **Complexity:** Medium — smaller surface than Phase 4; the PC-miles gap-detection flag is the one genuinely new piece of logic.
- **Risk:** Low-Medium — depends on Load data from Phase 4 being correct; a Phase-4 money bug would surface here too (another reason Phase 4's reconciliation testing matters).
- **Dependencies:** Phase 4 (trips are built from loads; `computeLoadNet()` composes into `computeTripNet()`).
- **Testing:** Build/typecheck gates; reconciliation diff against V1 Trips (same method as Phase 4); manual test of close/reopen status transitions and the odometer-bookend inline validation.
- **Completion criteria:** Trip net matches V1 for existing trips (modulo the TONU fix, same caveat as Phase 4); PC-miles flag correctly appears only when a genuine gap exists (verified against at least one real trip with a known missing reading, or a demo-data case constructed to trigger it).
- **Rollback:** Revert the merge.

---

## Phase 6 — Calendar

**Ships:** [Design doc §8](./v2-design.md#8-calendar).

**Scope:** Month grid + agenda view, windowed to the visible month ±1 week server-side (fixing the single heaviest full-table-read offender identified in the audit) instead of V1's whole-table fetch. Load bars, repair-service chips, algorithmic federal holidays, per-week/month net footers via the shared money engine — this is the third of three screens (Board, Trips, Calendar) that needed to agree on TONU net, and by this phase all three do, by construction.
- **Complexity:** Medium — the interval-graph half-day-slot bar-overlap rendering is fiddly UI work ported from V1, but the data-fetch redesign (windowed query replacing full-table) is a clear, bounded change.
- **Risk:** Low — read-only screen (no mutations happen here), so the blast radius of a bug is display-only, not data-corrupting.
- **Dependencies:** Phase 4 (loads), Phase 5 is not required (Calendar reads loads directly, doesn't depend on trip grouping).
- **Testing:** Build/typecheck gates; manual visual diff against V1 Calendar for the current month and one historical month with several overlapping loads; confirm the query is actually windowed (check network/query logs, not just that the page looks right) — this is the one phase where "looks the same but still fetches everything" would be an easy, easy-to-miss regression to ship.
- **Completion criteria:** Visual parity with V1 for a sampled month; confirmed windowed query (no full `loads`/`load_expenses` table read); TONU loads show the same net as Board/Trips for the same load.
- **Rollback:** Revert the merge.

---

## Phase 7 — Performance

**Ships:** [Design doc §23](./v2-design.md#23-performance).

**Scope:** Analytics rollup — KPI strip with MoM deltas, net-vs-goal chart, rate-trend, deadhead split, broker/lane leaderboards, and the Insights rules engine (ported whole from V1 — audit calls it out as genuinely strong, minimum-sample/effect-size gates and all). This phase deletes the fifth TONU-factoring treatment (V1's Performance-specific unconditional-factoring hardcode) by routing through Phase 2's `computeLoadNet()` like every other screen — the last of the audit's five inconsistent TONU implementations closed here. Completes the trailing-window goal-pace helper Phase 3's Dashboard stubbed.
- **Complexity:** High — "the most rule-dense screen in the app" per the audit; the Insights engine's threshold logic and the MoM delta sign-switching behavior (percent vs. absolute-dollar depending on the prior period's sign) both need careful porting, not just a re-skin.
- **Risk:** Medium — server-side period aggregation (replacing V1's client-side full-history reduce) is new query work, not a straight port; a mis-scoped date-range query would silently produce wrong KPI figures.
- **Dependencies:** Phase 2 (money engine, `attributionDate()`), Phase 4 (loads/expenses data this page rolls up).
- **Testing:** Build/typecheck gates; reconciliation diff against V1 Performance for the trailing-12-month view and at least one custom From/To range, spot-checking KPI totals, leaderboard rankings, and at least 2 Insights callouts for identical output; unit tests ported for the Insights minimum-sample gates (confirm a thin-data month correctly falls back to the neutral line, not a manufactured callout).
- **Completion criteria:** KPI/leaderboard figures reconcile against V1 (again, modulo the now-corrected TONU factoring — that specific delta should be visible and explained, not hidden); period-toggle no longer re-fetches full history client-side (verified via network logs); Insights thresholds are read from Settings-configurable values (wired even if Phase 11/Settings hasn't shipped its own UI yet — a sane default plus a code-level config point is enough for this phase).
- **Rollback:** Revert the merge.

---

## Phase 8 — Expenses

**Ships:** [Design doc §21](./v2-design.md#21-expenses).

**Scope:** Dense recurring-charge ledger — KPI strip (This month/YTD/Avg), server-persisted saved filters (fixing V1's `localStorage`-only gap), bulk archive/delete/category-change via Phase 1's `<DataList>` primitive, CSV import with a per-row error report (fixing V1's silent-skip gap). **Note:** the quarterly/annual anchor-date gap flagged in the audit and Phase 0's schema check is a genuine schema limitation — if Phase 0 confirms it's still missing, this phase ships with the same `nextChargeLabel = null` behavior V1 has for those two frequencies, and the anchor-date column becomes a documented migration proposal, not a Phase-8 deliverable (ground rule #4). Per project memory, there may also be a pending QuickBooks-style expenses migration from a prior redesign pass (`d476489`) whose prod-apply status Phase 0 should also confirm before this phase assumes any newer columns exist.
- **Complexity:** Medium — mostly a `<DataList>` instance plus a slide-over form; the CSV import error-reporting UI is the one piece of real new logic.
- **Risk:** Low — this data has no downstream money-engine dependency (Expenses figures are schedule-derived estimates, explicitly not wired into load/trip net anywhere per the audit).
- **Dependencies:** Phase 1 (`<DataList>` primitive), Phase 0 (schema confirmation for the anchor-date question).
- **Testing:** Build/typecheck gates; manual CSV import test with a deliberately malformed row to confirm the per-row error report (not a silent skip); saved-filter persistence check across a simulated second device/session (confirms server-persisted, not `localStorage`).
- **Completion criteria:** KPI figures match V1 for the same data; saved filters survive a fresh browser profile (proving server persistence); malformed CSV rows produce a visible per-row error instead of vanishing.
- **Rollback:** Revert the merge.

---

## Phase 9 — Brokers (list + detail)

**Ships:** [Design doc §9](./v2-design.md#9-brokers-list), [§10](./v2-design.md#10-broker-detail).

**Scope:** Master-detail broker directory. List: server-side search/sort replacing V1's client-side full-table aggregation. Detail: tabbed (Overview/Contacts/Lanes/History) instead of one long scroll, ZIP-prefix-normalized lane aggregation (fixing V1's raw-string-fragmentation finding), A/R aging via the money engine, and — the one explicit correctness fix called out in the design doc — a real confirm step (with orphan-count warning) on broker delete, closing the audit's "no confirmation dialog at all" gap. Quick-Add flow ported from V1 (genuinely good pattern) with a new "matched existing / created new" chip closing the audit's UX-ambiguity finding.
- **Complexity:** Medium — mostly server-side-query conversion of an already-well-understood V1 feature set; the lane-normalization logic is the one piece needing care (must not silently merge genuinely-different lanes).
- **Risk:** Low-Medium — broker delete now has a real confirm step and orphan warning where V1 had none, which is a strict safety improvement, but the ZIP-normalization change to lane aggregation could re-bucket historical lanes differently than V1 displayed them — call this out explicitly in the PR description so it isn't mistaken for a bug during review.
- **Dependencies:** Phase 2 (money engine for A/R aging), Phase 4 (loads, for gross/A/R-per-broker figures).
- **Testing:** Build/typecheck gates; manual reconciliation of gross/A/R-per-broker for a handful of real brokers against V1; explicit test of the delete-confirm flow (attempt delete on a broker with contacts+lanes, confirm the warning shows the correct counts, confirm cancel leaves everything intact).
- **Completion criteria:** Broker delete cannot happen without an explicit confirm; Quick-Add visibly distinguishes matched-vs-created; list/detail queries are server-scoped (no full `loads`/`load_expenses` table read on every navigation, the audit's flagged weakness for this cluster).
- **Rollback:** Revert the merge.

---

## Phase 10 — Customer pipeline: Operations hub + Quote detail workspace

**Ships:** [Design doc §13](./v2-design.md#13-operations-hub), [§14](./v2-design.md#14-quote-detail-workspace), [§19](./v2-design.md#19-applications).

**Scope:** The lead-to-cash front door. Operations hub: funnel strip + urgency-grouped feed, with `computeUrgency()` promoted into the shared [notification registry](./v2-design.md#notification-model) from Phase 2 so a lead flagged here and a lead flagged on the Dashboard bell are provably the same computation (closing the audit's two-unreconciled-urgency-vocabularies finding). Quote detail workspace: identity/status header, one next-action button, Overview/Details/Pricing/Documents tabs — built from the *live* V1 component set only (`LoadWorkspaceV2`'s real shell, `CollapsibleWorkspaceSection`, `PreviewModal`, `EventHistorySection`), deliberately **not** porting forward any of the 12+ files the audit confirmed dead (`WorkspaceHeader`, `IdentityRow`, `StatusHero`, `OpsStrip`, `WorkflowProgress`, etc.) — a from-scratch build has zero reason to reintroduce ghost code. Details-tab auto-save is rewritten to post only changed keys (fixing the full-18-key-overwrite footgun). Applications tab ships in this phase too (simple work queue, low effort relative to the rest of this phase, and shares the hub's tab shell).
- **Complexity:** High — this is the highest-stakes, highest-complexity screen in the whole app per the audit's own assessment (`page.tsx` was 1,787 lines in V1); expect this phase to be the longest of the roadmap's screen phases, and it's the one place a subagent/pairing pass re-reading the four largest V1 action files in full (per the audit's explicit "needs a follow-up read" note on `updateLeadStatus`/`sendEstimate`/`generateBolDraft`/`generateFinalizedQuoteDraft`) should happen *before* this phase's implementation starts, not during.
- **Risk:** Medium-High — the 13-state pipeline's transition rules are deliberately unenforced-but-hinted in V1 (`suggestedNext()`), and reimplementing that "hint, don't enforce" behavior incorrectly (e.g. accidentally making it a hard state machine) would be a real behavior regression, not just a UI difference.
- **Dependencies:** Phase 2 (notification registry — `computeUrgency()` becomes a first-class rule source here), Phase 9 not required (this cluster doesn't depend on Brokers).
- **Testing:** Build/typecheck gates; manual walkthrough of a real lead's full status progression (new → contacted → estimate_sent → …) confirming `suggestedNext()` hints correctly without hard-blocking manual overrides; explicit test of the `null total_amount` case rendering the new visible "auto-advance paused" banner instead of V1's silent no-op; grep-verified confirmation that none of the 12+ audit-confirmed-dead V1 components were copied into `tms-v2/**`.
- **Completion criteria:** Urgency chips on this page and the Dashboard bell are backed by the identical registry computation (verified by tracing both call sites to the same function, not just visually matching); Details-tab save sends only changed keys (verified via network payload inspection); zero dead-component carryover.
- **Rollback:** Revert the merge.

---

## Phase 11 — Estimate, Finalized Quote, and BOL composers + customer-facing confirm pages

**Ships:** [Design doc §15](./v2-design.md#15-estimate-composer--send), [§16](./v2-design.md#16-finalized-quote-composer--send), [§17](./v2-design.md#17-bol-composer--sign--send), [§18](./v2-design.md#18-customer-facing-confirm-pages).

**Scope:** The three composer/send flows plus the token-gated public-facing pages a shipper actually sees. Two-pane form/live-preview pattern (kept — it's already sound in V1). Consolidates the triplicated `escapeHtml`/`shortRef`/`resolveFrom`/`sectionHeader` helper functions the audit found duplicated 2–3× across `render.ts`/`bill-of-lading.ts`/`finalized-quote.ts`/the PDF routes into one shared module. The pricing-transparency asymmetry (PDF shows full breakdown, email shows total-only) becomes an explicit per-quote toggle instead of a silent, code-level always-on divergence. BOL's two-independent-signer-role model and rotation-safe signature compositing (`signDoc.ts`) carry forward unchanged — audit confirms it's solving a real problem correctly. Customer-facing confirm pages are rendered from the *real* production component via a `readOnly` prop reused by the Preview Lab (Phase 13), instead of maintaining hand-kept visual twins that can drift.
- **Complexity:** High — three PDF renderers, three email renderers, `pdf-lib` signature compositing with non-trivial rotation math, and two independent public-token trust boundaries (`accept_token` vs `confirmation_token`) all need to be correct, not just visually similar.
- **Risk:** High — this is the one phase with a genuine external-facing blast radius: a bug here can send a wrong price or a broken confirm link to an actual customer. Mitigate with byte-for-byte preview-equals-sent-bytes discipline (kept from V1, verified explicitly in testing below) and by treating the two token-resolution functions as security-sensitive code requiring a second-pass review before merge.
- **Dependencies:** Phase 10 (Quote detail workspace hosts these composers as tabs/sub-flows), Phase 2 (shared email/PDF helper consolidation target).
- **Testing:** Build/typecheck gates; the send-preview-vs-sent-bytes assertion (render a preview, send a test email to the owner's own inbox, diff the two byte-for-byte) for all three document types; token-boundary test confirming an `accept_token` cannot resolve via `resolveByConfirmationToken()` and vice versa; a full manual dry run of Estimate → Shipment Intake → Finalized Quote → BOL-with-both-signatures → Payment against a real test lead (or a clearly-marked test quote, never a real customer's record) before this phase is called done.
- **Completion criteria:** All three composers reconcile preview-bytes-equal-sent-bytes; token cross-boundary test passes; helper-function triplication is down to one shared module (verified by grep for duplicate `escapeHtml`/`shortRef` definitions under `tms-v2/**`); pricing-transparency toggle is a visible, per-quote control, not a hardcoded branch.
- **Rollback:** Revert the merge. (If this phase is ever merged and later found to have a live customer-facing defect *after* cutover, ground rule #6's "revert the merge" model no longer applies post-cutover — see Phase 12's rollback section for that case. Pre-cutover, `/tms-v2` isn't reachable by real customers since no real send targets go out from an unlinked, noindexed staging path used only by the operator's own test sends.)

---

## Phase 12 — Remaining modules: Maintenance, Files, Camera, Reach + Load Inquiry, Receivables + Accounting, Settings

**Ships:** [Design doc §24](./v2-design.md#24-maintenance--repairs), [§25](./v2-design.md#25-files), [§26](./v2-design.md#26-camera), [§12](./v2-design.md#12-reach-send-backhaul), [§11](./v2-design.md#11-load-inquiry-email-broker), [§20](./v2-design.md#20-receivables), [§22](./v2-design.md#22-accounting), [§27](./v2-design.md#27-settings).

**Scope:** This phase bundles the remaining lower-daily-frequency modules. They're grouped together because each is individually small-to-medium and none blocks any other screen already shipped — but each ships as its own PR/sub-phase with its own testing pass, so a problem in one (e.g. Camera's pending migration) never holds up another (e.g. Settings).

- **Maintenance:** consolidates V1's 5 near-identical per-page loaders into one shared `loadMaintenanceData()`; auto-categorization and related-parts linking carry forward unchanged.
- **Files:** unified cross-source timeline, now server-paginated at the query level (fixing the audit's flagged "unions three growing tables into one client payload" risk) instead of V1's full-union-then-paginate-in-memory pattern; delete calls each source's canonical action instead of a fourth reimplementation.
- **Camera:** capture → batch → export flow ported as-is (already well-built per the audit); export completion switches from V1's hardcoded 4-second timeout to a real completion signal; the earmarked-but-never-built "email this batch to my rep" ships here since Resend and the assembled PDF buffer are already available. **Depends on Phase 0 confirming the `camera_batches`/`camera_photos` migration is actually applied to prod** (per project memory, this was uncertain as of the V1 audit) — if not yet applied, this sub-phase's scope is docs-plus-defensive-code only (mirroring V1's own missing-table-tolerant pattern) until the migration is separately approved and applied.
- **Reach + Load Inquiry:** built together because Phase 11's fix (both tools reading MC/DOT/phone/reply-to from one shared settings object) only closes the drift risk if they ship in the same phase. Reach's posture-detection/market-matching/recipient-build automation carries forward unchanged (genuinely strong per the audit); adds the missing manual "include anyway" override for held-back brokers and folds Setup into the main flow instead of a separate modal. `reach_markets` gets wired to real CRUD or explicitly and permanently dropped in favor of the hardcoded market list — a deliberate decision made and documented in this phase's PR, not left vestigial.
- **Receivables + Accounting:** the structural fix for PRD priority #2. One Receivables page with two clearly-labeled, never-merged sections (Carrier freight / Customer brokerage), both computed via the money engine, both linking to the same underlying `payments` ledger. Adds real partial-payment support (amount + backdatable date) replacing V1's all-or-nothing toggle. Accounting's MTD "Collected" figure moves off the confirmed 100-row-cap bug onto a real aggregate query, and its A/R figure is deleted in favor of linking into the unified Receivables page.
- **Settings:** grouped sections (Account/Business/Appearance/Notifications/Demo mode/Advanced), inline-validated business-default forms, Insights thresholds (stubbed in Phase 7) get a real UI here, demo-mode toggle wired to the Phase 2 `DataSource` switch (the UI control for a mechanism that's already structurally enforced, not the enforcement itself).

- **Complexity:** Medium overall, but uneven per sub-module — Receivables/Accounting is the most involved (real partial-payment support is new behavior, not a port); Settings and Load Inquiry are the lightest.
- **Risk:** Low-Medium — no sub-module here sits on the customer-facing send path (Phase 11's higher-risk territory) or the core revenue path (Phase 4's), so a bug in any one of these is contained and low-consequence relative to earlier phases; Camera's migration-status dependency is the one item that could genuinely block a sub-phase, not just delay it.
- **Dependencies:** Phase 2 (money engine, `DataSource`), Phase 4 (Receivables' carrier-freight side reads load payment status), Phase 9 (Reach/Load Inquiry read broker/contact data), Phase 0 (Camera's migration-status question, Expenses' anchor-date question already resolved in Phase 8).
- **Testing:** Build/typecheck gates per sub-module PR; Maintenance — confirm the consolidated loader produces identical freshness/reminder output to V1's five independent loaders for a sampled truck history; Files — confirm server-side pagination via network/query logs, not just visual "load more" behavior; Camera — confirm export completion is tied to the real async result, not a timer, by testing against a deliberately large batch; Reach/Load Inquiry — confirm both tools render an identical MC/DOT/phone signature block from the one shared settings source; Receivables/Accounting — reconcile MTD Collected against a real month with >100 payments if one exists in test/demo data (to explicitly exercise the bug this phase fixes), and confirm a partial payment leaves the correct remaining balance; Settings — confirm a business-default change (e.g. diesel price) is picked up by Performance/Load Detail on next render without a stale-cache gap.
- **Completion criteria:** each sub-module's specific fix (listed above) is verified per its testing note; `reach_markets` has an explicit, documented fate (wired or dropped) rather than staying silently vestigial; Receivables shows both A/R concepts on one page with no third, unreconciled Accounting-local A/R figure remaining anywhere in `tms-v2/**`.
- **Rollback:** Revert the relevant sub-module's merge independently — these are unrelated enough that one sub-module's rollback never requires rolling back another.

---

## Phase 13 — Email Previews / Preview Lab

**Ships:** [design doc's §18 `readOnly`-prop reuse](./v2-design.md#18-customer-facing-confirm-pages) applied to a rebuilt internal-only preview tool equivalent to V1's `/admin/previews`/`/admin/previews-2`.

**Scope:** Internal QA tool rendering every customer-facing email template and page with static sample data, using the exact renderer functions Phase 11 ships (preview bytes = sent bytes, kept from V1). This phase is pulled out on its own, after Phase 11, specifically so the Preview Lab can consume Phase 11's finished renderers/`readOnly` prop rather than being built speculatively ahead of them. Includes the audit's flagged safety fix: assert `STRIPE_SECRET_KEY` doesn't start with `sk_live_` before the preview payment page calls `createPreviewDemoSession()`.
- **Complexity:** Low — this tool has no business logic of its own; it's a thin harness around Phase 11's real renderers.
- **Risk:** Low, with one specific sharp edge called out explicitly: the live-key assertion above must ship in the same PR as the page that calls Stripe, not as a follow-up.
- **Dependencies:** Phase 11 (the renderers this tool wraps).
- **Testing:** Build/typecheck gates; manual click-through of every tile confirming it renders; explicit test that the Stripe-live-key guard actually throws when a `sk_live_`-prefixed value is present (temporarily set a dummy value matching the prefix in a local env to confirm the guard fires, then unset it).
- **Completion criteria:** every customer-facing template/page previewable; live-key guard verified to actually block, not just exist in code.
- **Rollback:** Revert the merge.

---

## Phase 14 — `/portal` cutover

**Scope:** The one phase that changes what a real user reaches. By this point every module has shipped and been individually verified under `/tms-v2`. This phase:

1. Renames/promotes the `tms-v2` route group to `portal` (or mounts the same layout tree under a `/portal` path — implementation detail to decide at execution time, not a design constraint here).
2. Removes `robots: noindex` and the `/tms-v2` sitemap exclusion; adds `/portal` in its place.
3. Adds a visible link from `/admin`'s nav to `/portal` (e.g. "Try the new portal") for a soft-launch window, **without removing or disabling any `/admin` route** — both stay live and both stay correct, since they still read the identical, unmodified database.
4. After an owner-determined soak period with `/portal` as the daily driver, `/admin`'s routes are archived (moved out of the active build, not deleted from git history) in a **separate, later PR** explicitly called out as a distinct decision point — not bundled into this phase automatically.

- **Complexity:** Low-Medium — mostly routing/config changes at this point, since every screen's actual logic was already built and tested in Phases 1–13. The complexity is in sequencing and communication (making sure the soft-launch link doesn't surprise the one person using this app daily), not new code.
- **Risk:** Medium — this is the first phase where a real workflow could genuinely shift from `/admin` to `/portal` mid-task; mitigated by *not* disabling `/admin` in this phase at all (item 3 above) — the operator can always fall back to the app they already trust with zero data loss, since both surfaces read/write the same tables.
- **Dependencies:** All of Phases 1–13 individually verified and merged.
- **Testing:** Full regression pass across every module listed in Phases 3–12, this time specifically at the `/portal` path/domain rather than `/tms-v2`, to catch any path-relative bug the rename introduces (redirects, absolute links, cookie domain/path scoping); confirm `/admin` still fully functions, unmodified, side-by-side.
- **Completion criteria:** `/portal` is reachable, indexed appropriately, linked from `/admin`'s nav; `/admin` remains fully operational and untouched; the owner has explicitly used `/portal` for at least one real end-to-end business action (e.g. one real load booked and delivered, one real quote sent) before this phase is declared complete — not just a synthetic/demo-mode walkthrough.
- **Rollback:** This is the one phase with a real rollback *procedure*, not just a `git revert`. Because `/admin` was never disabled (item 3), rollback is: remove the `/portal` nav link from `/admin` (one-line revert), leave `/portal` reachable-but-unlinked exactly as `/tms-v2` was pre-cutover, and the operator resumes working entirely in `/admin` with zero data-loss risk, since no phase up to this point ever diverged the schema or the data both apps read. The archive-`/admin` step (item 4) is deliberately never bundled with this phase specifically so it can't complicate this rollback path.

---

## Phase 15+ — Future roadmap (post-cutover)

Not part of the rebuild proper — captured here so they aren't lost, and so no earlier phase is tempted to over-build toward them prematurely:

- **Notification model v2:** push/SMS delivery for Action-Needed items (today's model is in-app only).
- **Command palette action-layer expansion:** every module's actions (not just navigation/records) fully indexed — Phase 2 ships the mechanism, but filling in every module's action set is naturally incremental and can continue past cutover.
- **`/admin` archival PR** (Phase 14 item 4) — a distinct, owner-scheduled decision point, not automatic.
- **Real bank/card feed for Expenses** — V1 and V2 both are explicitly schedule-derived-estimate-only by design; connecting a live feed is a scope expansion the PRD doesn't ask for today but the audit flags as a natural next step if ever wanted.
- **Structural DB invariants** (PRD priority #5's cheap wins not already covered by a Phase 0 migration proposal) — CHECK constraints for odometer monotonicity, a partial unique index for "one default payment method," etc. — proposed and approved as their own standalone migration(s) outside this roadmap's no-schema-change constraint.
- **Multi-truck/multi-operator readiness** — explicitly out of scope everywhere in this roadmap (V2 is still a single-owner-operator product per the design doc's framing); would require the RLS/roles rework the PRD's non-functional section flags as a precondition, not a roadmap phase.

---

## At-a-glance phase table

| # | Phase | Complexity | Risk |
|---|---|---|---|
| 0 | Live schema verification (docs-only) | Low | Low |
| 1 | Scaffold `/tms-v2`: auth, shell, nav, tokens | Medium | Low |
| 2 | Shared domain/data layer (money engine, attribution, `DataSource`, notifications, pagination) | High | Medium |
| 3 | Dashboard / Today | Medium | Low |
| 4 | Load Board + Load detail | High | Medium |
| 5 | Trips list + Trip detail | Medium | Low-Medium |
| 6 | Calendar | Medium | Low |
| 7 | Performance | High | Medium |
| 8 | Expenses | Medium | Low |
| 9 | Brokers list + detail | Medium | Low-Medium |
| 10 | Operations hub + Quote detail workspace + Applications | High | Medium-High |
| 11 | Estimate / Finalized Quote / BOL composers + customer confirm pages | High | High |
| 12 | Maintenance, Files, Camera, Reach + Load Inquiry, Receivables + Accounting, Settings | Medium | Low-Medium |
| 13 | Email Previews / Preview Lab | Low | Low |
| 14 | `/portal` cutover | Low-Medium | Medium |
| 15+ | Future roadmap (post-cutover) | — | — |

**Reading the risk column:** risk rises through the core revenue/customer-facing screens (Phases 4, 7, 10, 11) and drops back down for read-mostly or low-consequence modules (Calendar, Expenses, Files, Settings) and for the cutover itself, which is deliberately engineered to have an `/admin` safety net at every point. No phase before 14 can affect production; Phase 14 is the only one with real blast radius, and it's the one phase in this roadmap with an actual rollback *procedure* rather than a plain revert.
