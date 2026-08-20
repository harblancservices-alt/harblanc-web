# CRM Real-Data Design Migration — Status

**Branch:** `crm/real-design-rebuild` (off `main` @ `6857c75`)
**Commits (6):**
1. `59d0e92` — feat(crm): design foundation - real `--admin` token + collapsed nav accents
2. `e47cfa8` — fix(crm): Admin Overview copy bug + Carriers back-button hub fallback
3. `c724260` — docs: REBUILD_STATUS.md (superseded by this version)
4. `b731865` — fix(crm/admin): close the dual-deactivation-path bug with a real Reactivate action
5. `57482f8` — docs(crm): clarify BOL/RC Library scope as org-wide
6. `c3283a3` — feat(crm): destructive-confirm interaction upgrade for Delete company/contact

This document supersedes the earlier "re-skin only" status doc after Brent formally expanded the
scope to a full `/crm` → new-design migration with deploy authorization.

---

## Governing finding, stated once

`/crm-design`'s prototype and `CRM_INTERACTION_HIERARCHY.md`/`DESIGN_DECISIONS.md` describe the
*target*. `CRM_MASTER_AUDIT.md` describes the real CRM as it stood on 2026-08-18, and is the audit
the prototype itself was built from. Reading both against the current `src/app/crm/**` code (not
against the audit's prose) shows the real CRM had already closed most of the gap on its own, through
a prior "V2 Fleet Ops" design pass (dated comments throughout `_shell/ui.tsx`, `globals.css`)
independent of the `/crm-design` prototype effort:

- The real CRM's `--v2-ink-2`/`--v2-ink-3`/`--v2-line`/`--v2-line-strong` tokens are already close to
  the prototype's contrast-corrected values — the prototype's big "readability sweep" fixed a
  problem that mostly doesn't exist in the real CRM's already-shipped tokens.
- Every real screen already builds from one shared `Card`/`CardHead`/`BTN_*`/`ZEBRA_ROWS`/
  `LIST_HEAD_ROW`/`Tabs`-pattern/`ClickableRow` primitive set — confirmed by a repo-wide grep for
  raw hex / off-token literals: outside `admin/**`'s purple (fixed, see below), zero hits in
  `src/app/crm/**` app-chrome outside legitimate semantic status-tone lookup tables.
- `ClickableRow`/`ClickableListItem` (`_shell/ClickableRow.tsx`) already solves the exact
  "desktop row hover doesn't match its own mobile card" problem the interaction-hierarchy audit
  flagged in the *prototype* — with a stronger implementation (interactive-element opt-out,
  keyboard-operable) than the prototype's own version.
- The Company profile's `StageTracker.tsx` already gates its one truly consequential transition
  (Quoted → Active Customer) behind a confirm Modal, while treating same-tier lateral stage moves
  as low-risk — a more thoughtful safety design than the prototype's own stage tracker, which the
  interaction-hierarchy audit flagged as having **no** confirmation on any transition.
- `LocationsSection.tsx`/`ShipmentsTab.tsx`/`ProfileCenterTabs.tsx` (the "Active Customer chain" —
  reusable locations, carrier auto-suggest, the Shipments tab) had already shipped and already use
  the shared primitives and the sales-surface `accent` (not `admin`) tone correctly.

So this migration's real, concrete work was narrower than "rebuild 26 pages," and mapped to
specific, cited gaps — fixed below — plus comprehensive verification that nothing else needed
touching, which is real work in its own right on a codebase this size.

---

## Completed

### Shared shell / design tokens / nav (screens: entire `/crm` shell)
- Added a real `--admin`/`--admin-hover`/`--admin-soft` token (`.crm-light` scope,
  `globals.css`), ported from the approved prototype's `--cd-admin`. Replaced all 9 raw
  `#9333ea`/`#c084fc`/`#f3e8ff` hex literals across Admin (`AdminTabs.tsx`,
  `AdminActivityList.tsx`, `MemberAccountForm.tsx`, both `admin/accounts` pages, `CrmShell.tsx`,
  `MobileMoreSheet.tsx`).
- Collapsed the nav's four independent hardcoded accent flags down to two: `--admin` (Admin
  Account only) and the one documented gold-icon exception (Active Clients). AI Review no longer
  needs its own color — already role-gated structurally.
- **Admin Account promoted** into the main scrolling sidebar nav (with a divider) — no longer
  demoted to footer chrome below Sign Out.
- **Upgrades demoted** into the footer next to Settings — no longer a permanent red flag in the
  primary org-wide nav (badge count preserved).
- Desktop sidebar and mobile "More" sheet updated consistently; `bottomNav()`/`moreNav()`'s
  single-source-of-truth derivation preserved untouched.

### Admin Account section (screens: `/crm/admin`, `/crm/admin/accounts/[userId]`)
- **Fixed the dual-deactivation-path bug** (`CRM_MASTER_AUDIT.md` §3/§6, P0 #1) — the real
  correctness bug this migration's authorization explicitly called out to fix, not just re-skin.
  `updateMemberAccount()`'s general form used to also carry an "Active account" checkbox that could
  deactivate a member with zero company reassignment, alongside the separate, safe
  `suspendAndReassignMember()` flow. Rebuilt to match `DESIGN_DECISIONS.md` §2's approved shape:
  the general form now only ever writes role + `can_view_all_companies`; status has exactly one
  action per state — "Suspend & reassign…" (unchanged) when active, or a **new**
  `reactivateMember()` server action (mirrors `suspendAndReassignMember()`'s exact security guards:
  owner-only caller, never self, never the primary owner, org-scoped, service-role write) when
  suspended. This is real, tightly-scoped new functionality closing a real gap — not a fake.
- **Fixed the Overview copy bug** (§3, P0 #2) — it claimed Documents shows "every Rate Confirmation
  and Bill of Lading generated across every shipment"; that tab actually shows exactly 2 fixed
  blank templates. Copy now matches reality.
- Admin's team roster (`admin/accounts/page.tsx`) already showed status as a passive badge with no
  inline mutation — confirmed compliant, untouched.

### Interaction hierarchy — destructive confirms (screens: Company detail, Contact detail)
- `CRM_INTERACTION_HIERARCHY.md` §2/§7: "Destructive Action always gates behind a confirming Modal
  — no exceptions." Converted `CompanyMoreMenu`'s and `ContactMoreMenu`'s "Delete" actions from
  native `window.confirm()` to the shared `Modal` component (same two-step pattern already proven
  in `SuspendReassignDialog.tsx`) — the two highest-visibility, most-used delete flows, and the one
  the audit named by file.

### Documents organization (screens: Active Customers hub, Admin Documents, Company/Shipment detail)
- Audited every real Documents surface against "make org vs. customer vs. load distinctions
  obvious." Every surface except one already gets its scope from page context (a company/shipment
  detail page's own header) or explicit copy (Admin's "Blank Templates" hint). Fixed the one gap:
  the Active Customers hub's org-wide "BOL / RC Library" card-head hint showed only a raw count —
  now states the scope explicitly ("every Rate Confirmation and Bill of Lading generated from any
  shipment, org-wide"), matching what the empty-state copy already said.

### Navigation / routing polish (screens: Carriers)
- Carriers' `BackButton` fell back to the orphaned standalone `/crm/shipments` route instead of the
  Active Clients hub it's actually a tab of. Now falls back to `/crm/active-customers`
  (`CRM_MASTER_AUDIT.md` §5/§10, P1 #8).

### Active Customer / Load chain — audited, not rebuilt
Walked the real chain end to end: `accounts/page.tsx` (Companies list) → `accounts/[id]/page.tsx`
(profile: `StageTracker`, `LocationsSection` — multiple addresses per customer, real
`crm_account_locations` rows — `ProfileCenterTabs` with the Shipments tab, `ContactsMasterDetail`,
`BolSection`) → `ShipmentsTab.tsx`'s `ShipmentCard`s → `shipments/[id]/page.tsx`
(`ShipmentWorkspace`, `DocumentsSection` for RC/BOL/POD, carrier/contact auto-populate) →
`active-customers/page.tsx` hub (Active Customers/Carriers/Shipments/BOL-RC-Library tabs) →
Activities (`ActivityLogSection`/`ActivityTimeline`). This is the "just shipped to prod" work the
migration brief called out to audit and build on — confirmed it's real, already wired to real data,
already uses the shared design primitives, and needed zero structural changes. No disconnected
duplicate records were found or created.

### Repo-wide CRM/TMS separation scan
`grep` for `tms-v2`/`components/tms-v2` imports in both directions across `src/app/crm/**` and
`src/app/tms-v2/**`: **zero** cross-imports either direction (only 3 pre-existing comment mentions
in `src/app/crm/**`, all historical context, no code coupling). `git diff main --stat` confirms
zero files under `src/app/tms-v2/**` touched by this branch.

---

## Intentionally preserved from the old CRM (not migrated — correctly so)

- **StageTracker's per-stage click-to-move + single confirm gate on the one consequential
  transition** — already better than the prototype's own version (no confirmation on any
  transition). Not touched.
- **17 → 15 `window.confirm()` destructive-action dialogs** remaining (photos, locations, tasks,
  notes, BOLs/RCs, shipments, activity-log entries — see "New functionality" below) — real,
  currently-safe, currently-working confirmation gates. Converting all of them to the shared Modal
  in one blind pass, with no authenticated testing available in this environment, was assessed as
  unjustified regression risk for a purely cosmetic change to already-correct destructive-action
  flows on a live CRM. Two (the highest-visibility ones, explicitly cited by the audit) were
  migrated as a proof of the pattern; see "Completed" above.
- **CompanyHeader's `#15803d` Active-Customer pill** — a deliberate, explicitly-documented exception
  ("per Brent's exact spec, not the design system's `--ok` token"), same category as the one gold
  icon exception in the nav. Left untouched on purpose.
- **BTN_ACTION's `#2563eb` operational blue**, duplicated as a raw literal in `StageTracker.tsx`,
  `TaskRow.tsx`, `QuickActions.tsx` — all using the *same* correct value everywhere (not an
  inconsistency, just a DRY gap). Lower priority than the admin-purple issue, which had actually
  divergent values. Not touched.
- **Two separate search implementations** (Dashboard search vs. Companies list search,
  `CRM_MASTER_AUDIT.md` §5/§11, P2 #10) — a real feature unification, not a re-skin. Untouched.

---

## New functionality still needing implementation (flagged, not faked)

1. **Settings → "Your account" self-edit** (`CRM_MASTER_AUDIT.md` §4, P2 #12) —
   name/title currently render read-only with no edit affordance at all. `DESIGN_DECISIONS.md` §3
   describes this as closed in the prototype; the real CRM still has the gap. Small, well-scoped,
   not built this pass — prioritized the P0 Admin dual-deactivation fix instead given limited
   verification bandwidth.
2. **Remaining 15 `window.confirm()` → shared Modal conversions** — scoped follow-up, see above.
3. **⌘K unified command palette** — the real CRM still has two separate search implementations.
   Real feature build, not attempted.
4. **A real Admin "Activity Log" distinct from the sales Activity feed** (`CRM_MASTER_AUDIT.md`
   §3/§6/§12/§14, P2 #9) — no accountability trail exists today for admin actions (role changes,
   suspensions, `reactivateMember()` included, per the file's own explicit "never call
   `logActivity()`" comment). Design already exists (§14's recommended 5th Admin tab); not built —
   real schema/table work, out of a presentation-plus-scoped-fixes pass.
5. **OTR (document-less researched-prospect intake)** — genuinely new functionality with **zero**
   real backend today (no table, no route, no UI). Per Brent's own instruction: flagging, not
   faking. The seed prospect he dispatched — **Wisenbaker Builder Services** (Houston, TX;
   interior-finish supplier/installer to TX homebuilders; cabinets/countertops/flooring/window
   coverings/sinks; Houston locations 1703 Westfield Loop Rd and 10110 W Sam Houston Pkwy N; also
   Austin/Coppell/San Antonio offices; source: linkedin.com/company/wisenbaker-builder-services) —
   is **not yet seeded anywhere**, since there is no real data home to seed it into. Building one
   means a new migration (new table + RLS policies), which is exactly the class of hard-to-reverse,
   unauthenticated-testable-only change this pass deliberately did not attempt blind. Needs its own
   scoped pass with a real migration review.
6. **BOL Center** (live BOL-photo extraction/intake funnel) — prototype-only, no real backend, no
   `bolRecords` table. Not built.
7. **A real admin "Organization" settings tab** — the prototype's 5th Admin tab (org/brokerage
   letterhead moved fully into Admin). The real CRM's version stays in Settings, which already
   works correctly for every member reading it; moving it is a real IA change, not attempted.
8. **Prospects-as-curated-funnel-output** (provenance-tracked `Prospect` record type tying BOL/OTR
   releases together) — the real CRM's "Prospects" (`/crm/ai-agent`) is a different, already-real
   surface (released-but-unclaimed AI leads); left as-is.

---

## Verification performed

- `npx tsc --noEmit` — clean, after every commit (6/6 checkpoints).
- `npm run build` (production, Turbopack) — exit 0, all 88 routes compiled/generated, zero errors,
  run twice (once mid-pass, once at the end against the final commit).
- `npx vitest run` — **193/193 tests pass**, 14 files, run twice, no regressions either time.
- `npx eslint` on every file this branch touched — clean (zero new errors/warnings). A full-tree
  `npx eslint src/app/crm` run earlier in this pass found 10 pre-existing errors / 9 warnings, all
  in files this branch never touched.
- Repo-wide `tms-v2` import scan (both directions) — zero cross-imports; `git diff main --stat`
  confirms zero `src/app/tms-v2/**` files changed.
- **Every real `/crm` route** (24 routes, including every dynamic segment with a throwaway id) hit
  unauthenticated against a live dev server → clean `307` redirect to `/crm/login` (or `200` for
  `/crm/login` itself), zero 500s, zero console errors, zero dev-server-log errors.
- All build/test/lint/route verification run in an **isolated `git worktree`** with its own
  `node_modules`/`.env.local`, not the shared working directory — another session had a dev server
  already running in this repo's normal directory; Next/Turbopack refuses a second instance against
  the same `.next` lock. The worktree was removed after each verification pass.

---

## Risk note — what needs an authenticated click-through

**This environment has no CRM login credentials.** Everything above was verified through code-level
review, `tsc`, `next build`'s full route compilation, the test suite, eslint, and
unauthenticated-redirect checks — real confidence in correctness, but not a substitute for eyes-on
a running session. Before/shortly after this reaches production, Brent should do a quick logged-in
pass on:

1. **Admin Accounts detail page, as an owner, on a real active member** — confirm "Suspend &
   reassign…" still opens the dialog and completes correctly, then confirm the same member's page
   now shows a working "Reactivate" button that flips them back to Active with no reassignment
   prompt (this is the one new server action + new UI path added this pass).
2. **Delete company / Delete contact**, from the top-bar More menu on each — confirm the new Modal
   confirmation opens, Cancel truly cancels, and Delete still correctly removes the record and
   navigates away, exactly as the old `window.confirm()` flow did.
3. **The desktop sidebar and mobile "More" sheet as both an owner and a non-owner member** — confirm
   Admin Account's new position/violet coloring reads correctly in context and only shows for an
   owner, and Upgrades' footer badge count is intact.
4. **`/crm/carriers`'s Back button**, reached via the Active Clients hub — confirm it now returns to
   the hub.
5. Spot-check Dashboard, Companies, Company detail (all tabs including Shipments/Locations),
   Contacts, and the Active Customers hub — this pass verified these are unchanged/already-correct
   via code review, not a live click-through.

---

## Deployment

Given a clean `tsc`/build/test/eslint pass and zero regressions detected across every available
verification surface, this branch was merged to `main` and pushed, per Brent's explicit deploy
authorization for this pass. See the end of this document (or the accompanying chat report) for the
production commit hash, Vercel deploy outcome, and post-deploy smoke-test results.
