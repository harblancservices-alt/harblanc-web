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

## 10. Visual system correction — readability/contrast/hierarchy (2026-08-19)

Brent's feedback on the first click-through: too light/washed-out/childish — pale gray secondary text, near-white
text, translucent surfaces, barely-visible borders, indistinguishable alternating rows, low-contrast badges, tiny
helper text, near-identical whites/grays. Explicit constraint: **not** everything-black — a deliberate three-tier
hierarchy, not a flatter, paler one. Fixed at the token/primitive level first (`crm-design.css`, `_design/ui.tsx`),
then applied consistently — not restyled screen by screen.

### CURRENT (first build, tokens in `crm-design.css`)
- Three surface tokens 3 hex steps apart (`--cd-surface: #ffffff`, `--cd-surface-2: #f8f9fb`, page `--cd-bg:
  #f4f5f8`) — a card header bar, a zebra alt-row, and the page canvas around the card were all visually the same
  color, so "technically different, visually identical" rows/panels were the default everywhere `ZEBRA`/`CardHead`
  were used, not a per-page mistake.
- Borders (`--cd-border: #e3e5eb`, `--cd-border-strong: #cfd2db`) light enough to be barely perceptible against
  white — cards, inputs, tabs, table cells all under-defined.
- Text tiers too close together and the bottom tier too pale (`--cd-text-muted: #565b6b`, `--cd-text-subtle:
  #8a8fa0`) — and, more importantly, **`--cd-text-subtle` (the lowest tier) was the de facto default color for
  almost every secondary-but-needed field** across ~14 page files: company industry/city/state, assigned rep,
  last-contact dates, contact titles, admin roster emails, audit-log timestamps, and — worst instance — the
  Admin Activity Log's own row detail text (the "Brent suspended Priya and reassigned her companies to Caleb"
  line, i.e. the literal answer to "what happened," rendered in the single palest color in the system).
- `INPUT` background was `--cd-surface` — identical to `Card`'s background, so a field sitting inside a white
  card had no fill of its own, only a border, to signal "this is editable."
- Badges: 10.5px text, no border on colored tones, soft-tint backgrounds close enough to their own text color to
  read as low-contrast chips rather than instant status signals.
- One genuinely missing hover state (Companies list's desktop `<tr>` had none at all) and two hand-duplicated
  inline `<thead>` strings instead of a shared header-row primitive.
- Three raw hex literals inside `GenerateDocumentDrawer.tsx` bypassing the token system entirely (`#d5d5d5`,
  `#999`, `#aaa`) for the drawer's own explanatory captions (not the mock-document illustration itself, which
  intentionally stays token-free — see below).

### PROPOSED (now shipped)
**Surfaces** — three real, visibly-stepped tiers, darkest→lightest: page canvas (`--cd-bg: #e7eaf1`) → header
bars/zebra/sunken-input fill (`--cd-surface-2: #eef1f6`) → white card body (`--cd-surface: #ffffff`). Added
`--cd-surface-hover` and `--cd-surface-selected` as dedicated tokens so hover/selected states are a distinct step,
not a coincidence of reusing `--cd-surface-2`.

**Borders** — `--cd-border: #d3d7e1` (cards/tables/tabs/modals) and `--cd-border-strong: #a7adbd` (inputs,
stronger dividers) — both now clearly visible against white and against the canvas, not "technically present."

**Text** — three tiers with real, deliberate gaps and each tier's *use* reclassified, not just its color darkened:
- **Primary** (`--cd-text: #14161c`, unchanged) — names, amounts, headings, values. Near-black, not pure black.
- **Secondary** (`--cd-text-muted: #454b5c`, darkened from `#565b6b`) — now the default for anything a user
  actually needs on every pass through a screen: field labels, column headers, card-head hints/counts, contact
  and company secondary lines (title/industry/city/state), rep names, activity/document/task dates, admin roster
  emails, permission-caveat captions, and — the one that mattered most — every Activity Log row's WHO/WHAT/WHEN
  detail text.
- **Tertiary** (`--cd-text-subtle: #767c8f`, darkened from `#8a8fa0`) — narrowed to genuinely optional/decorative
  use only: search-bar icons, placeholder text, breadcrumb trail, completed-item strikethrough, empty-state
  captions, the stage tracker's not-yet-reached steps, and the mock-document drawer's own illustrative captions.
  Went through every call site of this token across the app (~50 occurrences, 14 files) and reclassified each
  one individually rather than just relying on the token getting less pale — a still-pale color used for
  essential recurring information (a due date, a suspension reason) is a hierarchy bug, not a contrast bug, and
  darkening the token alone wouldn't have fixed it.

**Inputs** — `INPUT`'s background moved to `--cd-surface-2` (was `--cd-surface`, identical to its parent card),
with a `focus:bg-[var(--cd-surface)]` step so a focused field visibly "lifts." An input now looks editable
against both the page and the card it sits in.

**Badges** — bumped to 11px/bold with real padding, and every tone (not just neutral) now carries a
tone-matched 25%-opacity border, so a badge self-defines even sitting on a now-more-visible gray card header.

**Tables/lists** — added two new shared primitives to `_design/ui.tsx` so this is fixed once, not per screen:
`LIST_HEAD_ROW` (replaces two hand-duplicated inline `<thead>` strings, secondary-not-tertiary text) and
`ROW_HOVER` (added to the one row type — Companies' desktop table — that had no hover feedback at all; the
Command Palette's result-row hover was also promoted from the flat `--cd-surface-2` to the new dedicated
`--cd-surface-hover` token for consistency with every other interactive row).

**Semantic colors** — success/warning/danger deepened (e.g. `--cd-danger: #ad2a2a` from `#c53434`,
`--cd-danger-soft: #f6d9d9` from `#fbeaea`) and the admin accent deepened slightly (`--cd-admin: #6d3fd4` from
`#7c4fe0`) for stronger text-on-soft-background contrast, without changing any color's *meaning*.

**Left as-is, deliberately:** `GenerateDocumentDrawer.tsx`'s mock-document preview (the 8.5×11 "fake paper"
illustrating what a generated Rate Confirmation/BOL would look like) keeps its own independent, small, pale
typography — it's a picture of a printed document, not app chrome, and real generated documents in the shipped
product already have their own letterhead styling independent of the CRM's own UI tokens (matching the real
CRM's actual RC/BOL PDF generator). Its *surrounding* explanatory captions (which ARE app chrome) were promoted
to the token system and to secondary-tier contrast. The single documented gold-icon exception for "Active
Clients" (§1/§8) is unchanged — it was never part of this problem, it's one deliberate, already-justified brand
accent, not an instance of the washed-out pattern.

### WHY
Brent's complaint was two problems wearing one description. The *contrast* problem (pale-on-pale) is a token
problem — three token edits fix every screen that reads from those tokens, which is why this was done in
`crm-design.css`/`ui.tsx` first. But the *hierarchy* problem (essential information rendered in the tier reserved
for decoration) is a classification problem no token value alone can fix — `--cd-text-subtle` could have been
made pitch black and an Activity Log row's "what happened" text would still have been *visually* the least
important thing on the screen, which is backwards for the one CRM surface whose entire job is making that text
easy to read. Both had to be fixed together, and both had to be fixed at the shared-primitive/token layer so the
28+ screens stay one coherent system instead of drifting into 28 separately-tuned ones — exactly the failure mode
the original audit (§7) diagnosed in the real CRM's own admin-purple hex literals.

## 11. BOL Center — an admin-only intake/intelligence funnel (2026-08-19)

New Admin section — nothing like this exists in the real CRM today. Purpose: Brent has 400+ BOL photos to turn
into usable customer intelligence, and the single hardest requirement is negative — **uploading a BOL must never,
by itself, put anything in front of Sales.** Every design choice below serves that one constraint first.

### The core architectural decision: Company creation is deferred to Release, not Match

The brief's own screen list (item 5) describes a `[Create Customer]` button at the *Customer Matching* step,
implying a real Company record could exist before research/approval finish. This prototype deliberately does
**not** do that. Here's why: this prototype's `companies` array has no "hidden from Sales" or "internal draft"
concept — it's the same flat list every Sales Agent's Companies page reads from. Creating a real Company the
moment a BOL is matched (even from one deliberate click, not automatically) would mean an unresearched,
unapproved candidate shows up in front of every Sales Agent before Brent has decided it's worth their time —
precisely the failure mode ("400 uploads → 400 things Sales sees") the brief calls out as the thing to prevent.

So the funnel's actual data-flow guarantee is stronger than "uploading doesn't auto-create a company" — it's
**"nothing before the Release click can ever become visible to a non-admin, full stop."** Concretely:
- `uploadBol` → `runExtraction` → `updateExtractionField` → `confirmCustomerMatch` → `confirmLocation` →
  `saveResearchNotes` → `setSalesRelevance` → `setBolStatus` (Approve/Reject/Keep Researching) all write **only**
  to `bolRecords` (and, for location matching, read-only lookups against `companyLocations`). None of them touch
  `companies`, `contacts`, or `tasks`.
- `releaseBolToSales` is the **only** function in the entire store that can create a Company from BOL data, and
  only when the admin has (a) already clicked Approve and (b) explicitly checked "Company" in the release
  checklist and clicked Release. See `_lib/store.tsx`'s `releaseBolToSales`.

**Consequence for the brief's `[Create Customer]` button:** relabeled to **"Confirm as New Customer"** on the
Customer & Location tab (`bol-center/[id]/page.tsx`). It does exactly what its real-CRM-adjacent name promises —
locks in `customerMatch.status: "confirmed_new"` as a research checkpoint distinguishing "we're fairly sure this
is a new prospect" from "still ambiguous" — without creating anything Sales could stumble onto. The copy directly
under the button says so ("Not in the CRM yet. Nothing is created until you release this BOL to Sales.") so the
distinction is never left implicit. This is the one place this pass diverges from the brief's literal button
label, and it's a deliberate trade against the brief's own CRITICAL constraint, not an oversight.

### The funnel, screen by screen

`BOL Center Inbox` (`admin/bol-center`) → `Upload BOL` (drawer: Take Photo / Upload Photo / Upload PDF, all
equally weighted since the real workflow is "400 phone photos," not a form) → `BOL detail` (`admin/bol-center/
[id]`), one page with the original photo pinned on the left across five tabs on the right:

1. **Extraction** — every AI-detected field, each independently marked `✓ HIGH` or `? REVIEW`; every value is a
   live-editable input, and editing one flips it to `✓ Corrected` — the AI's guess is a starting point, never
   authoritative (brief item 4).
2. **Customer & Location** — merges the brief's items 5+6 into one tab because a company *is* its locations; a
   `MATCH FOUND` company links straight to its real profile, an unmatched one shows the "Confirm as New Customer"
   path above, plus a manual "actually matches an existing company?" escape hatch for when the AI guesses wrong.
   Each detected address is checked against that company's known locations (`companyLocations`) and shown as
   either "Existing — {label}" or "New Location Detected." A lightweight duplicate heuristic (matching normalized
   candidate name or pickup address against every other unresolved BOL) surfaces a "Possible duplicate" banner
   with a link to compare — this is what "duplicates consolidated" looks like without a real entity-resolution
   engine.
3. **Contacts & Roles** — every detected person/org grouped by role (Shipper Contact / Consignee Contact /
   Broker / Carrier), explicitly labeled as separate from the real CRM contact book, with a per-contact "Mark
   verified" toggle (brief item 7).
4. **Research** — free-text notes (autosaves on blur), a High/Medium/Low sales-relevance call, read-only Observed
   Freight/Observed Lanes chips, and a "BOL History" list of every other BOL from the same company already in the
   queue (brief item 8).
5. **Approve & Release** — the two decisions kept visually and conceptually distinct, per the brief's explicit
   instruction that approval and release are different decisions: Approve/Reject/Keep Researching first; only
   once approved does the release checklist appear (`Company / Locations / General contact / Observed freight /
   Observed lanes / Sales notes` on by default, `Original BOL / Internal research / Sensitive info / Raw
   extracted data` off by default — the exact defaults the brief specified), and only clicking **Release to
   Sales** triggers `releaseBolToSales`.

Release does three things, all in `releaseBolToSales`: resolves or (only now) creates the Company; attaches new
or bumps existing `CompanyLocation` rows; and logs one Activity item on that company ("Customer intelligence
released from BOL Center") — which is how it becomes visible on that company's real Activity tab too, not just
Intelligence. A guardrail worth calling out in the code: this function reads `bolRecords` from render scope and
fires every side effect (company creation, activity log, toast) as plain top-level calls rather than nesting them
inside a `setBolRecords` updater — nesting side effects in a state updater risks double-firing under React
StrictMode's dev-mode double-invoke, which here would mean silently creating two companies from one click.

### Where it lands — Company profile → Intelligence tab

A 6th tab on `companies/[id]/page.tsx`, populated **only** from BOLs with `release !== null` matched to that
company, and gated field-by-field by each BOL's own release selection (checking "Company" but not "Observed
freight" on one BOL means that BOL contributes nothing to the freight list, even if research had it). Shows Sales
Status (`AI-sourced · Released`), Locations, Observed Freight, Observed Lanes, Sales Notes, and BOL Sources — the
last one links back into the BOL's own admin review page, but only for an owner/admin viewer; a Sales Agent sees
the same doc-number badges as plain, non-interactive text, since the BOL Center workspace itself stays
owner/admin-only regardless of what a company page links to.

### Admin nav placement

BOL Center is the 2nd tab in Admin, immediately after Overview — ahead of Accounts/Activity Log/Documents/
Organization — with a live needs-attention badge (New + Needs Review + Ready for Approval counts). This follows
directly from the audit's nav-hierarchy finding (§1/§2/§13): the highest-volume, most time-sensitive admin task
gets top billing, not whatever order tabs happened to be added in. The Admin Overview page and the Documents tab
were both updated to describe BOL Center accurately and link to it — the same "don't let one Admin surface's
description silently drift out of sync with what another surface actually does" discipline the original audit
flagged as a real bug in the real CRM's Overview page (audit §3, P0 #2).

### A bug found and fixed while building this

Testing the release flow surfaced a pre-existing hydration error unrelated to BOL Center: the sidebar's account
menu rendered its dropdown (containing more `<button>`/`<a>` elements) as a *child* of the trigger `<button>` —
invalid HTML, since interactive elements can't nest. Fixed by making the trigger and its dropdown siblings under
a shared `relative` wrapper (`(app)/layout.tsx`) instead of parent/child. Unrelated to this task's scope but cheap
to fix once found, and left unfixed it would have kept throwing a hydration warning on every single screen in the
prototype, not just BOL Center's.
