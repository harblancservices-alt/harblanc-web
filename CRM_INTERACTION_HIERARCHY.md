# CRM Interaction Hierarchy Audit

Scope: `/crm-design` prototype (branch `crm-design-prototype`), all screens, as of this audit. Read against
the real components — every citation below is a real `file:line`, not a paraphrase. Companion deliverable:
a clickable visual reference at **`/crm-design/interaction-system`** (mirrors `/crm-design/design-system`'s
pattern) with an annotated BOL Center mock-up. This document does not change any existing screen.

---

## 1. Executive summary

The prototype's *token* discipline is good — one `Button` component, one `Badge` component, one accent
color, no ad hoc hex values. The problem isn't inconsistent colors. It's that **too many different kinds of
interaction share the same handful of shapes** (a bordered pill, a rounded-full pill, a small bordered
button), so the *shape* stops communicating what a control does. A user can't tell, at a glance, which of
six bordered pills on a BOL Center screen is a status readout, which is a toggle, which is a radio-style
selector, and which fires an irreversible network-shaped action — because all six render nearly identically.

Three specific mechanisms cause this, all fixable without a single new color:

1. **One-off "bordered pill button" pattern, reinvented five times**, each occurrence handling a different
   kind of interaction (momentary action, toggle, radio-select, tab, mode-switch) with no shared component
   and no visual differentiation between them. See §3, §4, §6.
2. **Navigation styled identically to mutation.** "View Company," "View Prospects," "Compare," and "Open BOL
   Center" — all pure navigation, zero data changes — render as the same `Button` component, at the same
   visual weight, as "Approve," "Release to Sales," and "Reject" — all real, consequential mutations. See §3,
   §7.
3. **The `admin` accent color is overloaded.** It's the primary-CTA fill, the active-tab fill, the
   "Released" status badge fill, and the zoom-toolbar active-state fill — all on the same BOL Center screen
   at once. When one color means "the one thing to click," "where I am," and "what already happened," the
   eye can't use color to find the one thing to click. See §4, §6.

None of this requires darker, bigger, or more colorful controls — the fix is almost entirely *reduction*:
collapse five bespoke pill patterns into one documented `SegmentedControl` primitive, stop lending Button
weight to plain navigation, and stop reusing one accent for three unrelated meanings. See §6–§9 for the
concrete, scoped plan. **Verdict: READY TO IMPLEMENT, with two named decisions — see §10.**

---

## 2. Current problems — "everything is a pill/button"

Concrete, cited examples, roughly in order of how often they recur:

- **A status badge that's also a link, indistinguishable from a status badge that isn't.** Company detail →
  Intelligence tab wraps `Badge` directly in `Link` for an owner/admin viewer, but renders the *identical*
  `Badge` with no link for a Sales Agent viewer — same pixels, sometimes clickable, sometimes not, no visual
  tell either way. (`companies/[id]/page.tsx:418-435`)
- **A whole table row hints "clickable" when only one cell is.** Both the Companies list and the BOL Center
  Inbox apply row-hover (`ROW_HOVER`) to the entire `<tr>`, but only the name/doc-number `<Link>` inside one
  `<td>` actually navigates — clicking anywhere else in the row does nothing. The *mobile* card version of
  the same list wraps the entire card in a `Link`, so the same data behaves differently depending on
  viewport. (`companies/page.tsx:105-119` + `195-211`; `admin/bol-center/page.tsx:158-189` + `195-211`)
- **Five different bordered-pill controls, one visual language, five different meanings.** BOL detail's
  "Fit Width / Fit Page" zoom toggle, its page switcher ("1. Bill of Lading / 2. Packing List"), its Sales
  Relevance selector (High/Medium/Low), the identical Sales Relevance selector copy-pasted into the OTR card,
  and the Admin member detail's Access Level toggle (Sales Agent/Admin) are five separate hand-rolled
  implementations of "pick one of N," each slightly different (rounded-sm bordered pills vs. a shared
  rounded-sm container with inset toggle buttons vs. rounded-full connected chain), none sharing a component.
  A momentary action (Zoom In), a page-select, a client-side filter, and a value that gets saved to a record
  all currently look like the same kind of button. (`BolDocumentViewer.tsx:216-247`, `:307-324`;
  `admin/bol-center/[id]/page.tsx:541-558`; `admin/otr/page.tsx:147-166`; `admin/accounts/[id]/page.tsx:131-146`)
- **"Mark verified" is a badge pretending to be a toggle button.** BOL detail's Contacts & Roles tab renders
  a `<button>` styled with badge-like soft-fill/border coloring that flips between "Mark verified" (neutral)
  and "Verified" (success-tone, looking exactly like a `Badge tone="success"`) — a real, stateful toggle
  wearing a passive-status costume. (`admin/bol-center/[id]/page.tsx:485-502`)
- **The stage tracker is a row of five "badges" that are all buttons, and one of them silently mutates
  data.** Company detail's stage progress bar renders `STAGE_ORDER` as `rounded-full` pills — the *exact*
  shape `Badge` uses everywhere else for a passive status — except every pill here is a `<button>` that jumps
  the company directly to that stage on a single click, no confirmation, no "are you sure," even when
  skipping stages backward. (`companies/[id]/page.tsx:126-151`)
- **Navigation wearing the same weight as mutation.** `Button variant="secondary"` renders "View Company,"
  "View Prospects →," and "Compare" (all navigation) at the same visual weight as "Confirm as New Customer"
  and "Keep Researching" (both mutations) inside the very same card. Worse, Admin → Documents' "Open BOL
  Center" — pure navigation to another list — uses `variant="admin"`, the *same* solid-fill treatment as
  "Approve" and "Release to Sales." (`admin/bol-center/[id]/page.tsx:279-282, 349-351, 685-692`;
  `admin/documents/page.tsx:32-36`)
- **Reject fires immediately; a comparable action requires confirmation.** BOL detail's and OTR's "Reject"
  buttons are `variant="danger"` and fire on a single click with no modal. Two clicks away, Admin → Member
  detail's "Suspend & reassign…" — arguably no more consequential, since both have a "Reopen"/"Reactivate"
  undo path — is *also* `variant="danger"` but correctly opens a confirmation `Modal` first. Same color,
  same word "danger," two different safety guarantees. (`admin/bol-center/[id]/page.tsx:649-651`;
  `admin/otr/page.tsx:196-198`; `admin/accounts/[id]/page.tsx:107-109, 177-218`)
- **A `<select>` that submits itself.** Both the "match to an existing company" escape hatch and the
  "match a new BOL location to an existing one" control are native `<select>` elements that fire the mutating
  store call the instant an option is chosen — no separate "confirm" step, no visual difference from a
  read-only `<select>` elsewhere in the app. (`admin/bol-center/[id]/page.tsx:322-337, 409-424`)
- **The `admin` accent means three unrelated things on one screen.** On BOL Center Inbox alone: the "Upload
  BOL" primary CTA is `variant="admin"` (solid gold/red fill), the active status-filter tab is `tone="admin"`
  (same fill, smaller), and the "Released" status badge is `tone="admin"` (same fill again, as a pill). None
  of the three are the same kind of thing — one is the single action to take, one is "where you are," one is
  "what already happened" — but they're visually the same color at a glance.
  (`admin/bol-center/page.tsx:61-64, 80-89`; `bolStatus.ts:47-57`)

---

## 3. Complete interaction classification

Every interactive (and near-interactive) element type found in the prototype, bucketed. "File" cites one
representative usage, not every occurrence.

### Primary action
The one thing a screen/section wants you to do. Solid fill (`variant="primary"` blue or `variant="admin"`
gold/red in admin surfaces).
- "Add company" (Dashboard, Companies) · "Log activity" / "Generate document" (Company/Contact detail) ·
  "Upload BOL" (BOL Center Inbox) · "Run AI Extraction" / "Approve" / "Release to Sales" (BOL detail) ·
  "Save changes" (Admin member detail) · Modal "Confirm" buttons.

### Secondary action
A real but non-default action, or the confirm/cancel partner to a primary. Bordered, neutral fill
(`variant="secondary"`).
- "Cancel" in every modal/drawer footer · "Keep Researching" · "Confirm as New Customer" · "Upload another"
  · "Add contact" / "Log activity" (card-head slot buttons).

**Misclassified into this bucket today (should be Text Link/Nav, not Button):** "View Company," "View
Prospects →," "Compare," "Reopen as Contacted." These are navigation or state-revert, not a real secondary
*action* — see §7.

### Tertiary / low-emphasis action
Optional, skippable, or exploratory. No border, muted text (`variant="ghost"`).
- "Research First" (BOL Customer & Location tab) is the only real usage today. Under-used — several
  navigation-as-secondary-Button cases above are better candidates for demotion to ghost/text-link than to
  stay Button-shaped at all.

### Destructive action
Hard/costly to undo. Danger tone (`variant="danger"`).
- "Reject" (BOL, OTR) · "Suspend & reassign…" · Modal "Reassign & suspend" confirm.
- **Inconsistent today:** only the Suspend flow gates behind a confirmation `Modal`. Reject does not. See §2,
  §7.

### Icon action
A small, usually momentary, view-state change — not a data mutation, not navigation.
- Zoom In/Out, Fit Width/Fit Page, Fullscreen toggle, page switcher (BOL document viewer) · Sidebar
  collapse/expand · Close (`X`) on every Modal/Drawer/fullscreen overlay · Mobile "More" sheet open/close.
- Every icon action in this prototype already carries an `aria-label` — good, keep enforcing it. None
  currently show a hover tooltip (label text is either always visible or `hidden sm:inline` at larger
  widths) — acceptable for now since none are destructive or ambiguous, but a genuinely icon-only destructive
  icon action does not yet exist anywhere in the prototype; if one is added (e.g., a delete-row trash icon),
  it must get danger tone *and* a confirm step, not just an icon swap.

### Text link
Inline, colored, no fill, no border, underline on hover (or hover-color-shift). Pure navigation or a
disclosure toggle — never a mutation.
- Company/contact name links inside table cells · `tel:`/`mailto:` rows on Contact detail (a **correctly
  weighted** example — cite as the reference pattern) · Breadcrumb items · Account-menu dropdown rows ·
  "Actually matches an existing company?" `<details>` disclosure (also correctly weighted).

### Nav item
Sidebar links, mobile bottom-bar links, mobile "More" sheet rows, tab-bar-adjacent breadcrumbs. Icon +
label, active state = subtle fill change, never a pill/button silhouette.
- `(app)/layout.tsx`'s `WORKSPACE`/admin nav — this is the **cleanest, most consistent** interaction category
  in the whole prototype. No changes recommended here; use it as the reference for restraint elsewhere.

### Tab
Switches the *content* of the current view, no navigation, no mutation. The shared `Tabs` component
(`_design/Tabs.tsx`).
- Company detail's Overview/Contacts/Activity/Documents/Tasks/Intelligence · BOL detail's
  Extraction/Customer & Location/Contacts & Roles/Research/Approve & Release · Admin Account's own section
  tabs · Design System's demo tabs.
- **This is the one interaction type in the prototype that's already fully consistent.** Every real page-tab
  usage goes through the same `Tabs` component.

### Filter / segmented selector
Narrows a list or picks one mutually-exclusive value. Should look like a *family* with Tab (same "which one
am I on" job) but is currently five unrelated implementations — see §2, §6.
- BOL Center / OTR status filter chips (**these correctly reuse `Tabs`** — good) vs. Sales Relevance
  selector, Fit Width/Page toggle, Access Level toggle (all **bespoke**, all different from each other and
  from `Tabs`).

### Badge / status
Passive, non-interactive, no cursor-pointer, no hover state. The shared `Badge` component.
- Lifecycle stage, BOL/OTR status, document status, role tags, "New"/"DM" indicators, confidence readouts.
- **Violated when wrapped in a `Link`** (Intelligence → Sources) — see §2. Rule: if a badge is ever a link, it
  is no longer a badge; render it as a text link with the tone color instead, or add a visible affordance
  (chevron) so *badge-shaped* never silently means *clickable*.

### Menu action
A row inside a dropdown/overflow menu. Plain text row, full-width hit target, no border/pill/fill except on
hover. Danger items get red text only, no red fill until hover.
- Account-menu dropdown (`(app)/layout.tsx:236-273`) — **correctly weighted**, including "Sign out" in danger
  text with no border. Reference pattern.

### Row / card interaction
The row or card itself is the click target; the whole element gets a hover fill and cursor-pointer, and
click anywhere on it navigates.
- **Correct on mobile** (every list's `*Card` component wraps itself in one `Link`).
- **Broken on desktop** (every list's `<tr>` hovers as if clickable but only navigates from one `<td>`'s
  inner `Link`) — see §2. This is the single highest-value, lowest-risk fix in this audit: it's a one-line
  change (move the `Link`/`onClick` to the `<tr>` itself, or drop `ROW_HOVER` from the row and confine hover
  to the link text) repeated identically across every desktop table.

### Modal trigger / Drawer trigger
Not a new visual style — a *behavior tag* on an existing Primary/Secondary Button. A Button that opens a
`Modal` should read as a confirmation or short single-purpose action; a Button that opens a `Drawer` should
read as "go do a multi-step thing without losing your place." Both `Modal` and `Drawer` are themselves
well-built and consistent (`_design/Modal.tsx`, `_design/Drawer.tsx` — identical header/footer/close-button
treatment, only the slide-direction and default width differ) — no changes needed to the primitives
themselves, only to which Button variant callers use to trigger them (see §7).

### Informational / non-interactive (looks clickable, isn't — or vice versa)
- BOL Inbox's `ConfidenceReadout` ("✓ High" / "? 2 to review") — plain colored text, correctly non-interactive
  looking. Good.
- Extraction tab's per-field confidence tags ("✓ High," "✓ Corrected," "? Review") — same, correct.
- The Intelligence tab's linked `Badge` (see above) is the inverse failure: *looks* non-interactive,
  sometimes *is* interactive.
- The desktop `<tr>` hover (see above) is the other inverse failure: *looks* interactive, mostly isn't.

---

## 4. BOL Center deep audit

BOL Center is the deep-audit target because it has the highest density of every problem in §2 in one place —
document-verification workspace, funnel status, multi-step review, and a release gate all stacked in one
screen. Every action below: what it should look like, and where it should live.

| Action | Current | Should be | Where |
|---|---|---|---|
| **Upload BOL** (entry point) | `variant="admin"` primary Button, opens `Drawer` | Correct as-is — this is a genuine primary action | Inbox page header |
| **Take Photo / Upload Photo / Upload PDF** | Three equal-weight large tiles (bespoke `CaptureTile`, not `Button`) | Correct as-is — deliberately equal-weight, distinct from a button list on purpose (documented). Keep. | Inside Upload Drawer |
| **Review now →** (post-upload) | `variant="primary"` Button, navigates to detail page | Correct component, but it's *navigation* dressed as primary — acceptable here since it's the drawer's one clear next step and there's no competing action in the same view | Drawer footer |
| **View / Open a BOL** | Table-cell `Link` (desktop) / whole-card `Link` (mobile) | Make desktop row fully clickable to match mobile (§2, §6) | Inbox row |
| **Search** | Bordered `Card` wrapping a plain `INPUT` with a leading icon | Correct — matches every other list's search treatment | Inbox page |
| **Filter by status** | `Tabs` component, `tone="admin"` | Correct component. The only issue is `tone="admin"` sharing a fill color with the primary CTA — see §6's recommended fix (soften the active-tab fill, don't touch the CTA) | Inbox page |
| **Sort** | Not exposed as a control — list is hard-sorted newest-first | No control exists to audit; if added, it should be a small ghost-button/text-link ("Newest first ▾") next to the search bar, never a segmented selector (sort is single-value, not multi-state) | — |
| **Select / Bulk actions** | Do not exist yet | Not yet built — flagging so a future bulk-action bar doesn't invent a sixth bordered-pill pattern; it should reuse the same checkbox + contextual action-bar pattern already established by the release-selection checklist (§below) | — |
| **Zoom in/out, Fit Width/Page, Fullscreen** | Bespoke bordered-pill `ZoomToolbar` buttons, `tone`-style active state reused from BOL Center's admin color | Momentary actions (Zoom In/Out) and mode toggles (Fit Width/Page, Fullscreen) currently look identical; differentiate: momentary = icon-only ghost button, no "active" state possible; mode toggle = the current bordered-pill-with-active-fill treatment is fine, just don't let its active color collide with the primary CTA's color (§6) | Document viewer toolbar, inline in both embedded and fullscreen panes |
| **Page switcher** (multi-page BOLs) | Same bordered-pill pattern as Fit Width/Page, separate implementation | Should be the *same component instance* as the Fit Width/Page toggle (both are "pick one of N, view-only, no data mutation") — currently two different hand-rolled versions of the same idea | Document viewer, above the image |
| **Edit metadata / extraction fields** | Plain bordered text `<input>`, warning-tinted background when low-confidence | Correct — inputs read as inputs, not buttons. No change. | Extraction tab |
| **Assign company** (customer match) | "Confirm as New Customer" (secondary Button) + "Research First" (ghost Button) + a `<details>` disclosure hiding a self-submitting `<select>` for "match existing" | Keep Confirm/Research as-is (correct weights). The `<select>`-inside-`<details>` pattern is fine for a rarely-used escape hatch, but it should require an explicit confirm click rather than submitting on `onChange` — a misclick on the dropdown currently reassigns the customer match with no undo-affordance visible in the UI | Customer & Location tab |
| **Assign location** (match to existing) | Self-submitting `<select>`, same pattern as above | Same fix: require a confirm click | Customer & Location tab, per-location row |
| **Review / mark contact verified** | Bespoke toggle button styled like a status badge | Reclassify as a real checkbox-style toggle (a checkbox input styled to match `_design/ui.tsx`'s existing checkbox convention, or a distinctly-shaped toggle switch) — must stop reusing `Badge`'s soft-fill/border look, since that look is reserved for passive status everywhere else | Contacts & Roles tab, per contact row |
| **Approve** | `variant="admin"` Button | Correct — real primary decision for this tab | Approve & Release tab |
| **Reject** | `variant="danger"` Button, fires immediately | Add a confirmation `Modal` (reuse the exact Suspend & Reassign pattern: Cancel/secondary + Reject/danger in the footer) | Approve & Release tab |
| **Keep Researching** | `variant="secondary"` Button | Correct — real state-revert action, secondary weight is right | Approve & Release tab |
| **Release to Sales** | Checklist of checkboxes + `variant="admin"` Button | Correct — checkbox list is the right control for "pick which fields," Button is the right weight for the one real mutation on the screen | Approve & Release tab |
| **View Prospects → / View Company →** (post-release) | `variant="secondary"` Button ×2, side by side | Demote to text links — these are pure navigation with zero ambiguity about destination, and currently compete visually with the real "Release to Sales" primary action that was just above them | Approve & Release tab |
| **Open company / customer / related load** | `Link` wrapping `variant="secondary"` Button ("View Company") or a `<Badge>` (Intelligence → Sources) | Standardize on text link everywhere this pattern recurs — no Button-wrapped navigation, no Badge-wrapped navigation | Customer & Location tab, Research tab (BOL history), Intelligence tab |
| **Compare** (duplicate-hint) | `variant="secondary"` Button | Demote to text link — it's navigation to another BOL, not a mutation | Customer & Location tab, duplicate-hint banner |
| **Sales Relevance** (High/Med/Low) | Bespoke bordered-pill selector, mutates `bol.research.salesRelevance` on click | Extract into the shared `SegmentedControl` primitive recommended in §6/§9 — currently duplicated verbatim in OTR's card component, byte-for-byte the same JSX | Research tab |
| **BOL history** (same-company BOLs) | List of `Link`-wrapped rows with status `Badge` | Correct row-interaction pattern (whole row is the `Link`) — this is actually the one row-list in BOL Center that gets it right; use it as the fix reference for the Inbox table (§2) | Research tab |

**BOL Center verdict:** the underlying information architecture (Inbox → tabbed detail → Approve & Release)
is sound and doesn't need to change. Every fix above is a *visual re-tiering* of existing controls — nothing
needs a new screen, a new modal flow, or new data. The single highest-leverage fix is collapsing the five
bordered-pill patterns into one `SegmentedControl` component (§6, §9) and demoting six navigation-Buttons to
text links (§7's ELEMENT → ACTION → DESTINATION rules make this mechanical, not subjective).

---

## 5. Page-by-page inconsistencies

Same action, styled or behaving differently depending on which page it's on:

| Action | Page A | Page B | Divergence |
|---|---|---|---|
| Sales Relevance selector | BOL detail Research tab (`admin/bol-center/[id]/page.tsx:541-558`) | OTR card (`admin/otr/page.tsx:148-165`) | Byte-for-byte duplicated JSX, not a shared component — any future visual fix has to be made twice |
| "View Company" cross-nav | BOL detail (`Button variant="secondary"`) | OTR card (`Button variant="secondary"`) | Consistent with each other, but both are the misclassification described in §3/§7 |
| Reject/decline action | BOL detail Approve & Release (no confirm) | OTR card (no confirm) | Consistent with each other, but both diverge from Admin Suspend's confirm-modal pattern for a comparably risky action |
| List row click target | Companies desktop table (`ROW_HOVER` on `<tr>`, link only in name cell) | BOL Center desktop table (same pattern) | Consistent with each other — but both diverge from their own mobile card versions, which ARE fully clickable |
| Row click target, desktop vs. mobile | Companies desktop `<tr>` (partial) | Companies mobile `Card` (whole card is a `Link`) | Same list, same data, different affordance by breakpoint |
| Empty-state CTA duplication | Company detail → Contacts tab (CardHead button + EmptyState action button, same "Add contact" twice) | Company detail → Tasks tab (no CardHead button, EmptyState has no action either) | Same page, two tabs, two different empty-state conventions |
| "Segmented selector" visual language | BOL/OTR Sales Relevance (bordered pills, tone-per-value) | Admin member detail Access Level (rounded container, inset toggle buttons, shadow-on-active) | Two different controls for the same underlying UX pattern ("pick one of N") |
| Primary-action color reuse | BOL Center Inbox: CTA button, active filter tab, and "Released" badge all `admin`-toned on one screen | Sales-side pages (Companies, Contacts, Dashboard) never reuse `accent` this densely — CTA is `primary` (blue), active tab is `accent` (blue), but no status badge on those pages happens to also be `accent`-toned at the same time | The overload is specific to BOL/OTR/Admin surfaces, not sales-facing ones — a smaller, more contained fix |
| Destructive-icon pattern | Does not exist yet anywhere | — | Flagged in §3 so it's designed correctly the first time, not audited after the fact |

---

## 6. Recommended CRM interaction hierarchy

A small, strict set of levels, derived from what's already mostly working in this prototype (Button, Badge,
Tabs, Nav, Modal, Drawer) plus the two additions needed to close the gaps above:

1. **Primary Action** — `Button variant="primary"` (sales surfaces) / `variant="admin"` (admin surfaces).
   Solid fill. At most one per view/section. Performs the view's main mutation, or opens the Modal/Drawer
   that leads to it.
2. **Secondary Action** — `Button variant="secondary"`. Bordered, neutral fill. A real, named mutation or
   state change that isn't the primary one (Cancel, Keep Researching, Confirm as New Customer). **Never
   navigation.**
3. **Tertiary Action** — `Button variant="ghost"`. No border, muted. Optional/skippable actions.
4. **Destructive Action** — `Button variant="danger"`. Always gates behind a confirming `Modal` before the
   mutation fires — no exceptions, including Reject.
5. **Icon Action** — small icon-only or icon+label control for momentary, easily-reversible view-state
   changes (zoom, fit, fullscreen, close). `aria-label` required on every instance. A destructive icon
   action (none exist yet) must carry danger tone *and* a confirm step, not just an icon.
6. **Text Link** — inline colored text, underline-on-hover, zero fill/border. All pure navigation
   ("View Company," "Compare," "View Prospects") and all disclosure toggles live here, not in Button.
7. **Nav Item** — sidebar/bottom-bar/menu-sheet links. Already consistent; no change.
8. **Tab** — the existing `Tabs` component. Switches visible content within the same page. Already
   consistent; no change.
9. **Filter / Segmented Selector** *(new shared primitive: `SegmentedControl`)* — replaces the five bespoke
   pill implementations. Visually related to Tab (same "which one am I on" shape) but semantically distinct
   (narrows a list or picks a value, doesn't change which content region you're looking at). Two explicit
   modes:
   - `mode="filter"` — view-only, no data mutation (BOL/OTR status chips — already `Tabs`, stays `Tabs`).
   - `mode="field"` — mutates a stored value (Sales Relevance, Access Level, Fit Width/Page, page switcher).
     Same visual family as Tab, but never `tone="admin"`/`tone="accent"` sharing the exact CTA fill color —
     use the softer inactive/active pairing already used for Fit Width/Page today, just componentized once.
10. **Badge / Status** — the existing `Badge` component. Passive only. Never wrapped in a `Link` or a
    `<button>`; if something needs to be both a status *and* a link, render it as a Text Link colored with
    the status tone, not as a Badge.
11. **Menu Action** — plain text rows inside a dropdown/overflow menu. Already consistent; no change.
12. **Row / Card Interaction** — the entire row/card is the click target on every breakpoint (fixes the
    desktop/mobile split in §2/§5). Nested Badges/secondary text inside a clickable row must `stopPropagation`
    if they carry their own link.

**Design direction check:** none of the twelve levels above require a new color, a bigger button, or more
icons — they require *fewer* bespoke shapes (five pill patterns become one `SegmentedControl`), *less*
Button-weight lent to navigation (six cases demoted to text links), and *one* rule change (Reject always
confirms). This is hierarchy through restraint, not through volume.

---

## 7. Interaction behavior rules — ELEMENT → ACTION → DESTINATION

| Element | Action | Destination / effect |
|---|---|---|
| Primary/Secondary/Tertiary Button (no `href`) | Click | Performs a mutation via a store function, OR opens a `Modal`/`Drawer`. Never changes the URL directly. |
| Destructive Button | Click | Opens a confirming `Modal`. The mutation only fires from the Modal's own danger-toned footer button. |
| Icon Action (non-destructive) | Click | Immediately toggles a local view-state (zoom level, fit mode, panel open/closed). No store mutation, no confirmation. |
| Icon Action (destructive, future) | Click | Opens a confirming `Modal`, same as a Destructive Button. |
| Text Link | Click | Navigates via Next.js `Link`/`<a>`, or toggles a `<details>` disclosure. Never calls a store mutation function directly. |
| Nav Item | Click | Navigates to a top-level route. Active state reflects `pathname`, never a manual "selected" flag. |
| Tab | Click | Swaps the visible content block within the current page. URL and stored data are unchanged (unless the tab is later wired to a query param — not currently the case, and fine either way as long as it never mutates a *record*). |
| Filter (`SegmentedControl mode="filter"`) | Click | Narrows the currently-displayed list client-side. No store mutation. |
| Field selector (`SegmentedControl mode="field"`) | Click | Calls exactly one store mutation function for the field it controls, then reflects the new value as its own active state. No separate "save" step (matches today's onBlur/onChange autosave convention used by every text field in the app — see `saveResearchNotes`, `updateExtractionField`). |
| Badge / Status | — | No interaction. `cursor: default`, no hover state, never inside a `Link`/`<button>`. |
| Menu Action | Click | Performs a mutation or navigates, then always closes the menu. Danger items (Sign out) get red text, no red fill until hover. |
| Row / Card | Click anywhere except a nested interactive element | Navigates to the record's detail page. Nested elements (a badge that's also a link, a secondary button) must `stopPropagation`. |
| Modal Cancel button | Click | Closes the modal, discards any in-progress local state, no mutation. |
| Modal Confirm/Danger button | Click | Performs the mutation, then closes the modal. |
| Drawer's own Button(s) | Click | Advances a multi-step flow, or performs the drawer's terminal action (e.g., "Review now →" both mutates — creates the BOL record — and navigates). Closing via the `X` or backdrop click discards nothing already persisted (uploads/creates already happened; only in-progress *form* state on the current step is lost). |

---

## 8. Consistency matrix

`✅` consistent with the recommended hierarchy · `⚠️` inconsistent with another page doing the same action ·
`❌` inconsistent with the recommended hierarchy itself (regardless of other pages)

| Action | Dashboard | Companies | Company detail | Contacts | Prospects | Tasks | BOL Inbox | BOL detail | OTR | Admin Accounts detail | Admin Documents |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Primary CTA (Button) | ✅ | ✅ | ✅ | ✅ | — | — | ✅ | ✅ | — | ✅ | — |
| List row → detail nav | ✅ (Recent activity) | ⚠️ desktop partial / mobile full | — | — | ✅ (whole card) | — | ⚠️ desktop partial / mobile full | — | — | — | — |
| Status badge | ✅ | ✅ | ✅ | — | — | — | ✅ | ✅ | ✅ | ✅ | — |
| Status badge as link | — | — | ❌ (Intelligence→Sources) | — | — | — | — | — | — | — | — |
| Navigation styled as Button | — | — | — | — | — | — | — | ❌ (View Company/Prospects/Compare) | ❌ (View Company) | — | ❌ (Open BOL Center, `admin` fill) |
| Destructive action confirms | — | — | — | — | — | — | ❌ (Reject, no modal) | ❌ (Reject, no modal) | ❌ (Reject, no modal) | ✅ (Suspend, has modal) | — |
| Segmented "pick one of N" | — | — | ⚠️ (stage tracker, bespoke `rounded-full` pills, mutates on click, no confirm) | — | — | — | ✅ (`Tabs` for status filter) | ❌ (3 bespoke patterns: relevance, fit-mode, page-switch) | ❌ (relevance, duplicated from BOL) | ❌ (access-level, 4th distinct pattern) | — |
| Empty-state CTA | ✅ (no dupe) | ✅ (no dupe) | ⚠️ (dupes on Contacts/Documents tabs, not on Tasks/Activity) | — | ✅ | ✅ | ✅ | — | — | — | — |
| `tel:`/`mailto:` text link | — | — | — | ✅ | — | — | — | — | — | — | — |

---

## 9. Recommended implementation order

Scoped so each step is independently shippable and low-risk (mechanical re-tiering, not new features):

1. **Ship this audit + the `/crm-design/interaction-system` reference page** (this task) — nothing else
   should start until there's one page everyone can point at.
2. **Build `SegmentedControl`** in `_design/ui.tsx` with `mode="filter" | "field"`. Migrate the four bespoke
   implementations onto it: Sales Relevance (BOL + OTR — collapses two duplicated copies into one), Fit
   Width/Page + page switcher (BOL document viewer), Access Level (Admin member detail). Zero data-shape
   changes — this is a pure render-layer swap.
3. **Fix the row/card click-target split.** Make every desktop `<tr>` fully clickable (Companies, BOL Center
   Inbox) to match its own mobile card. One shared fix, two files.
4. **De-badge the linked Sources.** Company detail's Intelligence → Sources: stop wrapping `Badge` in `Link`;
   render those as text links in the status tone instead.
5. **Add a confirm `Modal` to Reject** (BOL detail, OTR card) — reuse the exact Suspend & Reassign
   Cancel/Danger footer pattern already proven out.
6. **Demote navigation-as-Button to text links**: "View Company," "View Prospects →," "Compare" (BOL detail,
   OTR), "Open BOL Center" (Admin Documents — also drop its `admin` solid fill).
7. **Soften the Tabs `tone="admin"` active-fill** so it no longer exactly matches the primary CTA's solid
   fill on the same screen (BOL Center Inbox, BOL detail, OTR) — needs the decision in §10 before landing.
8. **Roll forward**: re-verify BOL Center end-to-end after steps 2–7 land there first (highest complaint
   density), then OTR (shares the Sales Relevance and Reject fixes), then spot-check the rest of the admin
   surfaces.

---

## 10. Verdict

**READY TO IMPLEMENT** for steps 2–6 in §9 — each is a mechanical, unambiguous re-tiering of an existing
control with a clearly-cited before/after in this document, no new data model, no new route, no ambiguity
about which component to use.

**NEEDS ONE DESIGN DECISION before step 7:** how different should a `mode="field"` `SegmentedControl` (Sales
Relevance, Access Level — writes to a real record) look from a `mode="filter"` one (BOL/OTR status chips —
view-only)? Two reasonable options, and the right one is Brent's call, not an engineering default:
- **(a) Shared visual language, distinguished only by nearby label text** (the current de facto approach,
  formalized) — simplest, most restrained, keeps the "hierarchy through restraint" direction furthest along.
- **(b) A small persistent tell on `mode="field"` controls only** (e.g., a hairline "saved" checkmark that
  flashes on change, or a slightly different corner treatment) — costs a little more visual surface but
  removes any chance of mistaking "I'm filtering a view" for "I just changed a customer's record."

**Secondary, smaller decision:** whether Reject (§9 step 5) should get the *full* Suspend-style confirmation
modal, or a lighter one-line inline confirm (since both funnels already offer a no-cost "Reopen" undo path
that Suspend does not have as cleanly). Either is defensible; pick one so it's applied identically to BOL and
OTR rather than drifting into a sixth inconsistency.

Everything else in this document is unambiguous and can start immediately.
