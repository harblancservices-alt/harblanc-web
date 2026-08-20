# CRM Real-Data Design Rebuild — Status

**Branch:** `crm/real-design-rebuild` (off `main` @ `6857c75`)
**Commits:**
- `59d0e92` — feat(crm): design foundation - real `--admin` token + collapsed nav accents
- `e47cfa8` — fix(crm): Admin Overview copy bug + Carriers back-button hub fallback

Not merged, not pushed, not deployed — branch only, per instructions. `main` is untouched.

---

## What this pass actually found

The premise going in was "port the crm-design prototype's look onto the real CRM." After reading
`CRM_MASTER_AUDIT.md` (the audit that the prototype itself was built from) and diffing the real
CRM's existing primitives (`src/app/crm/(authed)/_shell/ui.tsx`, `form.tsx`, `compactForm.tsx`)
against the prototype's (`src/app/crm-design/_design/ui.tsx`, `crm-design.css`), the real CRM was
already substantially the target design system:

- The real CRM's `--v2-ink-2` (`#454c55`) / `--v2-ink-3` (`#727a84`) text tiers and `--v2-line` /
  `--v2-line-strong` border tiers are already close to the prototype's contrast-corrected values
  (`--cd-text-muted #454b5c`, `--cd-text-subtle #767c8f`) — the prototype's big "readability sweep"
  fixed a problem that mostly doesn't exist in the real CRM's already-shipped V2 "Fleet Ops" tokens.
- Every real CRM screen already builds from one shared `Card`/`CardHead`/`BTN_*`/`ZEBRA_ROWS`/
  `LIST_HEAD_ROW` primitive set (confirmed by the master audit itself, §7, and re-confirmed here by
  a repo-wide grep: outside `admin/**`'s purple hex, **zero** files in `src/app/crm/**` use a raw
  hex or an off-token gray/slate/zinc/white literal for app-chrome text or surfaces — the only hits
  are legitimate semantic status-tone lookup tables like `taskType.ts`/`outcomes.ts`/`lifecycle.ts`,
  which intentionally draw from a wider palette for a status vocabulary the 6-color token set
  doesn't cover, exactly like the prototype's own badge tones do).
- The real CRM already has `ClickableRow`/`ClickableListItem` (`_shell/ClickableRow.tsx`) — a
  *stronger* solution than the prototype's own row-click pattern (interactive-element opt-out via
  `closest("a, button, select, input, textarea")`, keyboard-operable) to the exact "desktop row
  hover doesn't match its own mobile card" problem `CRM_INTERACTION_HIERARCHY.md` §2/§9 flagged in
  the prototype.

So the real, concrete gap between "the audit's findings" and "what's live in `/crm` today" was
narrower than the brief assumed — concentrated in a handful of specific, cited items. This pass
fixed those, at the token/primitive layer so every screen inherits the fix for free, rather than
touching 20+ individual screen files.

---

## Done / verified

### 1. Design foundation — `--admin` token (commit `59d0e92`)
- Added `--admin` / `--admin-hover` / `--admin-soft` to the `.crm-light` theme scope in
  `src/app/globals.css`, wired through `@theme inline` as `bg-admin` / `text-admin` /
  `bg-admin-soft` / etc. Value ported directly from the approved prototype's `--cd-admin` token.
- Replaced all **9** raw `#9333ea` / `#c084fc` / `#f3e8ff` hex-literal occurrences (the exact ones
  the audit cited, §2/§7/§12) across `AdminTabs.tsx`, `AdminActivityList.tsx`,
  `MemberAccountForm.tsx`, both `admin/accounts` pages, `CrmShell.tsx`, and `MobileMoreSheet.tsx`
  with the new token.
- This is the one true "the same color reinvented ad hoc, file by file" bug the audit found —
  fixed at the source; every current and future Admin surface now has one real token to reach for.

### 2. Sidebar / nav restructure (commit `59d0e92`)
- Collapsed the nav's four independent hardcoded accent flags (`ownerOnly`→amber, `redAccent`→red,
  `adminAccent`→raw hex, `iconTint`→gold) down to two: the new `--admin` token (Admin Account only)
  and the one documented gold-icon exception (Active Clients' star). AI Review no longer needs its
  own color — it's already role-gated structurally (only ever pushed into the nav array for an
  owner), so a color was never doing real work there.
- **Admin Account promoted** back into the main scrolling sidebar list (with a section divider),
  instead of demoted into footer chrome below Sign Out — the owner's most powerful surface is no
  longer visually the smallest thing in the shell (audit §1/§2/§13, P1 #7).
- **Upgrades demoted** into the footer next to Settings instead of a permanent red flag in the
  primary org-wide nav (its badge count is preserved) — audit §1/§2, P1 #6.
- Desktop sidebar (`CrmShell.tsx`) and the mobile "More" sheet (`MobileMoreSheet.tsx`) both updated
  consistently; `bottomNav()`/`moreNav()`'s single-source-of-truth derivation (already the nav's one
  well-engineered pattern per the audit) was preserved untouched.
- **Not done:** merging "Prospects" and "AI Review" into one surface (audit's original
  recommendation, later explicitly reversed by Brent in `DESIGN_DECISIONS.md` §12 for the
  prototype — kept as two separate real routes here too, since collapsing them would be a real
  navigation/feature change, not a re-skin).

### 3. Two small, cited correctness fixes (commit `e47cfa8`)
- **Admin Overview copy** (`admin/page.tsx`) claimed Documents lets an owner "browse every Rate
  Confirmation and Bill of Lading generated across every shipment" — false; that tab shows exactly
  2 fixed blank master templates. Copy now matches what the tab actually shows (audit §3, P0 #2).
  The `StatLinkTile`'s own count/query was **left untouched** — see Risks below, this is a deeper
  mismatch than a copy fix can fully resolve.
- **Carriers back-button** (`carriers/page.tsx`) fell back to the orphaned standalone
  `/crm/shipments` route instead of the Active Clients hub it's actually a tab of. Now falls back
  to `/crm/active-customers` (audit §5/§10, P1 #8).

### 4. Dashboard, Companies (list + detail), Contacts (list + detail)
**Already on the shared design system — no screen-specific changes needed.** Confirmed by:
- Repo-wide grep for raw hex / off-token gray literals in `page.tsx` (Dashboard),
  `accounts/page.tsx` + `accounts/[id]/**` (Companies), `contacts/page.tsx` + `contacts/[contactId]/**`
  (Contacts): zero hits outside legitimate semantic tone maps.
- These screens are composed almost entirely from shared components (`CounterTiles`,
  `DashboardSearch`, `NextBestActionSection`, `QuickActions`, `StageTracker`, `ClickableRow`, the
  `_shell/ui.tsx` primitives) that already read from the token system — the foundation fix in
  step 1 cascades to them automatically, with nothing screen-specific left to port.

### 5. Remaining screens (Active Customers/Shipments hub, Settings, Tasks, Calendar, AI Review,
Prospects/AI Agent, Upgrades, Admin's 4 tabs)
Same finding as #4 — every screen checked builds from the same shared primitives and the same
token set; none bypass it. No screen-specific edits were needed or made beyond the two fixes in
§3. `git diff main --stat` for this branch touches exactly 11 files, all inside
`src/app/crm/**` + `src/app/globals.css` — nothing else in the repo changed.

---

## Explicitly NOT built (prototype-only, no real backend — per instructions, not faked)

- **BOL Center** (live BOL-photo extraction/intake funnel, admin-only) — `crm-design`'s newest,
  largest feature. No real extraction pipeline, no `bolRecords` table, nothing to re-skin onto.
- **OTR intake** (document-less phone-research funnel) — same reason, no real backend.
- **Prospects as a curated, provenance-tracked funnel output** (`crm-design`'s `Prospect` record
  type, "From BOL"/"From research" tags) — the real CRM's "Prospects" (`/crm/ai-agent`) is a
  different, already-real surface (released-but-unclaimed AI leads) and was left exactly as-is.
- **⌘K command palette** — the real CRM still has two separate search implementations (Dashboard
  search vs. Companies list search, audit §5/§11 P2 #10). Unifying them is a real feature build,
  not a re-skin; not attempted.
- **`SegmentedControl` primitive** — built in the prototype to replace 4-5 bespoke "pick one of N"
  patterns that mostly don't exist in the real CRM (no BOL Center, no OTR). The one place a
  comparable pattern exists for real — `MemberAccountForm.tsx`'s Access Level toggle — was left
  as-is; it's a single, internally-consistent instance, not a duplicated/drifting one.
- **Organization info moved into Admin** (prototype's 5th Admin tab) — the real CRM's org/brokerage
  letterhead editor stays in Settings, exactly where it works today. Moving it would change a real
  route/IA, not just its skin.

---

## Known pre-existing issues — deliberately NOT fixed (business logic / correctness, out of
this pass's scope)

Flagging these because they were found while reading the audit, not because this pass touched
them — none were modified:

1. **Admin Accounts dual-deactivation path** (audit §3/§6, P0 #1) — unchecking "Active account" and
   hitting Save deactivates a member with no company reassignment, alongside the separate, safe
   Suspend-and-reassign flow. Real workflow-safety bug, needs a product decision, not a re-skin.
2. **Dashboard company picker doesn't apply `getCompanyVisibility()`** (audit §11, P0 #3) — a
   restricted sales agent can find a company via Dashboard search that the Companies list itself
   would hide from them. Real permissions-UX gap.
3. **Admin Overview's "Operational documents" tile** shows a real per-shipment RC/BOL count but
   links to a page that only ever shows 2 fixed templates — the copy underneath it is now accurate
   (§3 above), but the tile's own count/link target is still mismatched. Fixing this means deciding
   whether the tile should count templates (data change) or the Documents tab should become a real
   per-shipment archive (a previously-tried-and-reverted feature per `documents-data.ts`'s own
   comment) — a product call, not something to guess at overnight.
4. **17 `window.confirm()` destructive-action dialogs** across the app (Delete company, Delete
   contact, Delete task, Reject lead, etc.) — the audit's prototype comparison flagged ONE of these
   (`CompanyMoreMenu.tsx`) as inconsistent with Suspend's Modal-based confirm. In the real CRM this
   is actually the app-wide *established* pattern (17 call sites), not a one-off drift. Rebuilding
   all 17 onto the shared `Modal` component is a real interaction-model change with real regression
   surface, not a visual re-skin — left as a scoped follow-up, not attempted here.
5. **`BTN_ACTION`'s `#2563eb` operational blue is duplicated as a raw literal** in a few files
   (`StageTracker.tsx`, `TaskRow.tsx`, `QuickActions.tsx`, `NextBestActionSection.tsx`'s RESEARCH
   tone uses a different violet, `#7c3aed`, deliberately — not the same concept as admin). All
   currently use the *same* correct value everywhere, so this isn't a visible bug — just a DRY gap,
   lower priority than the admin-purple issue (which had actually-inconsistent values). Not touched.

---

## Verification performed

- `npx tsc --noEmit` — clean, twice (after each commit).
- `npm run build` (production, Turbopack) — exit 0, all 88 routes compiled/generated including
  every `/crm/**` route, zero new errors. Run in an isolated `git worktree` (see below), not the
  shared dev directory.
- `npx vitest run` — **193/193 tests pass**, 14 files, no regressions.
- `npx eslint src/app/crm` — 10 pre-existing errors / 9 warnings, **all in files this branch never
  touched** (`LogCallDialog.tsx`, `DocumentEditorModal.tsx`, `ShipmentWorkspace.tsx`,
  `RateConfirmationEditor.tsx`, `LoginForm.tsx`) — confirmed zero new lint errors from this branch's
  changes.
- Repo-wide grep confirmed **zero** `tms-v2` imports anywhere in `src/app/crm/**` (only 3 comment
  mentions, all pre-existing, all historical context — no actual cross-imports); `git diff main
  --stat` confirms zero files under `src/app/tms-v2/**` changed.
- Every touched route (`/crm`, `/crm/admin`, `/crm/admin/accounts`, `/crm/admin/activity`,
  `/crm/admin/documents`, `/crm/upgrades`, `/crm/settings`, `/crm/accounts`, `/crm/contacts`,
  `/crm/carriers`, `/crm/active-customers`, `/crm/tasks`) hit unauthenticated via a real running
  dev server → clean `307` redirect to `/crm/login`, zero 500s, zero browser console errors.
- Dev server + build were run in an **isolated `git worktree`** (`../harblanc-web-verify`, detached
  HEAD synced to each commit, own `node_modules`/`.env.local`), not the shared working directory —
  another session had a dev server already running in this repo's normal directory, and Next/
  Turbopack refuses a second instance against the same `.next` lock. The worktree was removed after
  verification; nothing from it is part of this branch's history.

---

## Risk note — what needs an authenticated click-through before deploy

**This environment has no CRM login credentials**, so nothing past the `/crm/login` redirect could
actually be rendered or clicked. Everything above was verified through code-level grep, `tsc`,
`next build`'s route compilation, the test suite, and unauthenticated-redirect checks — real
confidence, but not a substitute for eyes-on. Before this goes live, get a real, authenticated
click-through on:

1. **The desktop sidebar as an owner** — confirm the new section divider above Admin Account reads
   cleanly, the violet `--admin` token looks right against the graphite sidebar in context (not
   just computed contrast math), and Upgrades' badge count still shows correctly in the footer.
2. **The mobile "More" sheet as both an owner and a non-owner member** — confirm Admin Account
   still only appears for an owner, and the simplified color logic (dropped `ownerOnly`/`redAccent`
   branches) didn't change what a member sees.
3. **`/crm/carriers`'s Back button**, reached both directly and via the Active Clients hub — confirm
   it now lands back in the hub, not the old orphaned `/crm/shipments` page.
4. **Admin's 4 tabs (Overview/Accounts/Activity/Documents)** — confirm the violet active-tab/badge
   treatment renders correctly everywhere the 9 hex literals used to be, especially
   `MemberAccountForm.tsx`'s Access Level toggle (which sits right next to the now-tokenized
   "Admin" pill) and the Primary Owner badge on both the roster list and member-detail page.
5. **Nothing else changed** — every other screen (Dashboard, Companies, Company detail, Contacts,
   Contact detail, Active Customers hub, Settings, Tasks, Calendar, AI Review, Prospects/AI Agent)
   received zero edits this pass; a click-through there is a sanity check, not a verification of
   new work.
