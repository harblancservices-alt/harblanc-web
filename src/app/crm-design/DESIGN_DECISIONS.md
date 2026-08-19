# CRM Redesign — Design Decisions

Prototype location: `src/app/crm-design/**` on branch `crm-design-prototype`. Every decision below traces back to a
specific finding in `CRM_MASTER_AUDIT.md` (repo root) — that audit is the source of truth for *why* something was
wrong; this document is the source of truth for *what changed* and *why that specific fix*, screen by screen.

This is a visual/interaction prototype. Nothing here reads from or writes to Supabase, the real `/crm` routes, or
any production data. All state is in-memory (React context, `src/app/crm-design/_lib/store.tsx`) and resets on
page reload — documented once here rather than repeated on every screen.

---

## 1. Navigation structure

### CURRENT (real CRM — `src/app/crm/(authed)/_shell/nav.ts`, `CrmShell.tsx`)
A single flat list of 10 items with four independent, hardcoded accent-color flags layered on ad hoc
(`ownerOnly` → amber, `redAccent` → red, `iconTint` → gold, `adminAccent` → a raw hex not in the token system,
reused 6+ times across separate files). Admin Account and Settings are pulled out of the scrolling list into
small footer chrome next to Sign Out; Upgrades (an internal feedback board) sits full-size in the primary nav
with a permanent red flag. "Prospects" (label) routes to `/ai-agent`; "AI Review" is a second, unrelated,
owner-only nav item for what is functionally the same underlying concept (AI-sourced leads).

### PROPOSED (prototype — `_lib/store.tsx` + `(app)/layout.tsx`)
```
WORKSPACE (flat, one accent color — --cd-accent — for every active state)
  Dashboard · Companies · Contacts · Tasks · Calendar · Active Clients · Activity Feed

ADMINISTRATION (owner/admin only — SAME visual weight as Workspace, not demoted)
  Admin Account   ← one dedicated --cd-admin token, not four ad hoc colors

FOOTER (account-level chrome only)
  Settings · Send feedback · Sign out
```
- Active Clients keeps ONE intentional icon-color exception (gold star) — a deliberate brand accent, not a system.
  No other item gets a bespoke color.
- "Prospects" and "AI Review" are merged conceptually: the prototype's Companies/Dashboard flow treats AI-sourced
  leads as ordinary companies at the `new_lead` stage rather than as a second, hidden nav destination. (Full
  parity with the real CRM's AI-agent pipeline UI was out of scope for this pass — see §9 "Not prototyped.")
- "Upgrades" is renamed **Send feedback**, moved out of the primary nav into the sidebar footer as a small
  modal-triggering action, not a routed destination.

### WHY
Audit §1/§2/§13 (P0/P1 #4–#8): the ad hoc colors are the actual root cause of "feels messy," not a favorites
system (which never existed — see §8 below). Demoting Admin Account below an internal feedback board inverts
the real importance hierarchy. A flat, single-accent list plus one dedicated elevated-surface token gives every
color in the nav a single, learnable meaning: blue = active, violet = elevated/admin, gold = one named exception.

### Collapsed sidebar
Desktop sidebar has a working collapse toggle (icon-only rail, `(app)/layout.tsx`'s `collapsed` state) — not in
the real CRM today, added because the brief explicitly asked the redesign to define this state.

### Mobile
Bottom bar (Dashboard/Companies/Contacts/Tasks, 4 fixed slots) + a "More" sheet holding everything else,
including Admin Account (still visually promoted — bold, admin-tinted — inside the sheet). This is a direct
carry-over of the real CRM's one genuinely well-engineered pattern (`bottomNav()`/`moreNav()` both derived from
one source array, audit §2/§9) — kept because it works, not redesigned for its own sake.

---

## 2. Admin structure

### CURRENT (real CRM — `src/app/crm/(authed)/admin/**`)
4 tabs: Overview / Accounts / Activity / Documents.
- Overview's own copy is **factually wrong** — it describes Documents as a per-shipment RC/BOL archive; the tab
  actually shows exactly 2 fixed blank templates (audit §3, P0).
- Accounts: a single form lets an admin uncheck "Active account" and hit Save, deactivating a member **without**
  reassigning their companies — a second, unsafe path alongside the dedicated (safe) Suspend-and-reassign flow
  (audit §3/§6, P0).
- Activity: reads `crm_activities`/`crm_calls`/`crm_notes` org-wide — i.e. it is the SALES activity feed, not an
  audit log. Admin actions (role changes, suspensions, visibility toggles) are explicitly never logged anywhere
  (audit §3: *"Brent's 'don't log it when I do' instruction"*). This is fine with one owner; it stops being safe
  the moment a second admin exists — which the product already allows.
- Documents: 2 fixed template cards. Correctly scoped; only the Overview page lies about it.
- No Organization settings screen — the org's brokerage/letterhead info lives in personal Settings instead,
  editable only by an owner but stranded outside Admin (audit §4/§14).

### PROPOSED (prototype — `(app)/admin/**`)
5 tabs: **Overview / Accounts / Activity Log / Documents / Organization.**

1. **Overview** — copy rewritten to match exactly what each tab shows (2 templates, not an archive; "Activity
   Log," not "Activity," to pre-empt the naming collision below).
2. **Accounts → member detail** — the P0 fix. Status (Active/Suspended) is no longer a checkbox on the general
   form. It is a separate read-only badge with **exactly one** action per state: `Suspend & reassign…` (always
   opens the reassignment dialog — there is no other way to deactivate someone) or `Reactivate` (no reassignment
   needed, since suspension already zeroed their book of business). The "Access & visibility" form now only ever
   touches role and `canViewAllCompanies` — it can no longer touch status at all. See
   `(app)/admin/accounts/[id]/page.tsx` for the implementation; verified end-to-end in the browser (suspend →
   reassign dialog → team roster updates; reactivate → status flips with no reassignment prompt).
3. **Activity Log** (renamed, new tab, new capability) — a REAL admin audit trail: WHO (actor) did WHAT (a typed
   action: role changed / user suspended / user reactivated / visibility changed / user invited / company
   reassigned / org settings changed) to WHOM/WHAT, WHEN — filterable by admin, action type, and date range, with
   every row that has a target deep-linking straight to that user's admin detail page or that company's profile
   (`(app)/admin/activity/page.tsx`). This is the brief's literal "John changed Acme Logistics from Active to
   Suspended, click through" requirement, which the real CRM has no version of at all.
4. **Documents** — unchanged in scope (2 templates), copy corrected to match.
5. **Organization** (new) — the org's brokerage/letterhead fields, editable by owner/admin, replacing the one
   owner-only edit control that used to be stranded in personal Settings.

### WHY
Audit §3/§6/§12/§14. The dual-deactivation bug is a real, exploitable inconsistency, not a hypothetical — it's
the obvious first thing an admin would try. The Activity/Activity-Log split directly answers the audit's naming-
collision warning (§12): "Activity" meaning two unrelated things (sales activity vs. admin accountability) in
one product is exactly the kind of ambiguity that compounds every time a new feature reuses the word. Moving
Organization into Admin puts every owner-only control in one place, which is also the expandability rule for any
future Admin feature (§14).

---

## 3. Settings structure

### CURRENT (real CRM — `src/app/crm/(authed)/settings/page.tsx`)
"Your account" (name/title/role) rendered fully **read-only** — no edit path exists at all (audit §4, a gap, not
a misplacement). "Company / Brokerage Info," owner-editable, correctly stays here since every member needs to
read it.

### PROPOSED (prototype — `(app)/settings/page.tsx`)
- "Your account" — name and title are now actually editable (closes the audit-flagged gap).
- "Organization / Brokerage Info" — now **read-only** here, with an "Edit in Admin → Organization" link for an
  owner/admin. Every member can still see the letterhead data they need; the one owner-only *edit* control that
  used to live outside Admin now lives inside it, consistent with §2 above.

### WHY
Personal vs. organization settings should split on *who edits it*, not just *who can see it*. Settings, after
this pass, contains ONLY things the signed-in individual controls about themselves — matching the audit's
finding that this section was already nearly right and just needed its one stray owner-only control relocated,
plus its one real gap (no self-edit) closed.

---

## 4. Design system

Established first, in `_design/ui.tsx` + `crm-design.css`, applied to every one of the 20 screens with zero
per-page exceptions.

- **Color tokens** (`crm-design.css`): one accent (`--cd-accent`, steel blue), one dedicated elevated/admin token
  (`--cd-admin`, violet), four semantic status tones (success/warning/danger + neutral), a dark sidebar palette.
  Every badge, button, and nav accent in the prototype pulls from this fixed set — nothing hardcodes a hex
  outside `crm-design.css`. This directly answers the audit's §2/§7/§12 finding that the real CRM's Admin purple
  (`#9333ea`/`#c084fc`/`#f3e8ff`) is a raw literal repeated 6+ times with no token backing it.
- **Buttons** (`_design/ui.tsx` `Button`): five variants — primary / secondary / ghost / danger / admin — one
  hierarchy, reused everywhere. Mirrors the real CRM's actual best pattern (`BTN_PRIMARY`/`BTN_ACTION`/etc. in
  `_shell/ui.tsx`, which the audit found was already disciplined — audit §7) rather than replacing something
  that worked; the prototype's version is simply also used by the one area (Admin) that had drifted off it.
- **Cards / tables / tabs / badges**: one `Card`/`CardHead` pair, one zebra-row helper, one `Tabs` component, one
  six-tone `Badge`. No screen invents its own card shadow, table stripe, or tab-active color.
- **Modal vs. Drawer**: two distinct, deliberately-scoped surfaces (`_design/Modal.tsx`, `_design/Drawer.tsx`) —
  Modal for short confirmations/forms (Suspend user, Log activity), Drawer for multi-step or record-context work
  (Add company, Generate document) that shouldn't feel like it discarded your place on the page.
  `CompanyMoreMenu`'s native `window.confirm()` in the real CRM (audit §7) has no equivalent here — every
  destructive action in the prototype goes through the same Modal.
- **Toast** (`_design/Toast.tsx`): one host, three tones, mounted once at the app root — every mock mutation
  (save, generate document, suspend, reactivate) routes through it rather than a page inventing its own
  confirmation UI.
- **Empty / loading / error states**: `EmptyState`, `SkeletonRows`, `ErrorState` in `_design/ui.tsx`, used
  contextually throughout (e.g. a company with no contacts, no documents) AND collected on one reference page,
  `(app)/design-system/page.tsx`, reachable from the account menu — this page IS the "establish the design
  system first" deliverable in browsable form, not just a description in this document.

---

## 5. Sales-agent workflow

- **Dashboard** — greeting, one summary line, 4 KPI tiles (Overdue/Due Today/Active Customers/New This Week,
  each a real link), a personal Next-Best-Action queue, and an org-wide recent-activity feed. Directly reuses
  the real CRM's strongest workflow decision (audit §5: tiered overdue → stale → research-gap ranking, not a
  fuzzy composite score) — not redesigned, just re-skinned onto the new design system.
- **Companies** — search + stage filter, desktop table / mobile cards from ONE filtered dataset (no duplicated
  query logic), "Add company" drawer that actually creates a record and routes straight into it.
- **Company detail** — breadcrumb, clickable stage tracker (click any stage to move it — mocked, not gated),
  a fixed left details card, and a 5-tab right panel: Overview / Contacts / Activity / Documents / Tasks. This
  is where "Log activity," "Add contact," and "Generate document" all live, each opening the appropriate
  Modal/Drawer and updating the record's own Activity tab immediately — verified end-to-end in the browser
  (generating a document bumped both the Documents count and the Activity count on the same page).
- **Contacts** — one org-wide directory + detail page mirroring the Company detail's information density.
- **Search** — ONE surface, the ⌘K command palette (`_design/CommandPalette.tsx`), searching companies, contacts,
  and (owner/admin view only) team accounts. Directly answers audit §5/§11's finding that the real CRM has two
  different, inconsistent search implementations (dashboard search vs. Companies list search) — the prototype
  has exactly one.
- **Visibility** — a Sales Agent's `canViewAllCompanies` flag genuinely restricts the Companies list in the
  prototype (`(app)/companies/page.tsx`'s `restricted` check), closing the audit §11 gap where the real CRM's
  dashboard company-picker silently ignored the same flag that the Companies list enforced.

## 6. Owner/admin workflow

- Admin Account is a first-class, full-weight nav destination (§1), not a demoted footer link.
- Managing a member: role + visibility saved together on one form; status (suspend/reactivate) is a completely
  separate, single-path control (§2). Both are on the SAME detail page so an admin never has to hunt.
- Investigating: Activity Log's filters (admin / action / time range) plus free-text search, every row
  deep-linking to the affected record — an owner can go from "who suspended someone in the last 30 days" to that
  person's account page in two clicks.
- Org-wide settings: Organization tab, same page shape as every other Admin surface.

## 7. Activity — two surfaces, on purpose

The prototype deliberately ships **two** differently-named activity surfaces instead of one, because the real
CRM's single "Activity" already tried to be both things and satisfied neither (audit §12):

| | Activity Feed (`(app)/activities`) | Admin → Activity Log (`(app)/admin/activity`) |
|---|---|---|
| Audience | Everyone | Owner/admin only |
| Records | Calls, notes, emails, stage changes, documents | Role changes, suspensions, reactivations, visibility changes, invites, reassignments, org settings |
| Question it answers | "What's been happening with our customers?" | "What did an admin change, and who's accountable?" |
| Deep-links to | The company | The affected user's admin page, or the affected company |

## 8. Favorites / stars / colors

There is no favorites feature in the prototype, because there was never one in the real CRM either — the
audit's own §0 corrects the brief's premise on this point after reading the actual nav code. The single gold
star on "Active Clients" is kept as the one deliberate, documented brand-color exception (§1); nothing is
user-customizable, and no per-item color is invented anywhere else.

## 9. Not prototyped / intentionally out of scope

- **Carriers / Shipments / full RC-BOL job-output library.** The real CRM's Active Customers hub is a 4-tab
  aggregator (Active Customers + Carriers + Shipments + BOL/RC library). This prototype's "Active Clients" is
  scoped to the customer roster only — the document *workflow* itself is already fully demonstrated on the
  Company profile's Documents tab and Admin → Documents, and Carriers/Shipments are dispatch-operational surfaces
  that weren't on the required screen list. Flagged here explicitly rather than silently dropped.
- **AI Agent / AI Review lead-intake pipeline UI.** Folded conceptually into "Companies" (AI-sourced leads simply
  land as `new_lead`-stage companies) rather than rebuilding the pending-review queue and its owner-only gate as
  a separate screen.
- **Real PDF generation.** "Generate document" produces a mock on-screen preview, not an actual PDF — explicitly
  called out in the brief as acceptable ("mock the workflow visually").
- **A working "Send feedback" backend.** The modal collects text and closes; nothing is persisted or sent.
- **Persisted state across reloads.** All mock data lives in a React context and resets on refresh — intentional
  for a click-through prototype, documented here once rather than caveated on every screen.
- **Real auth / real role enforcement.** The Admin section's gate (`(app)/admin/layout.tsx`) is a client-side
  visual stand-in (an `EmptyState` for non-elevated viewers) for what would be a server-enforced redirect in
  production — appropriate for a prototype with no backend, not appropriate to ship as-is.
