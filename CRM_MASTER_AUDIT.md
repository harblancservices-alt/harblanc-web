# CRM Master UX + Workflow + Admin Audit

**Scope:** `src/app/crm/**` and the modules it genuinely shares (`src/lib/crm/auth.ts`). Read-only inspection of the actual, currently-deployed code — no TMS code, no hypothetical features. Every claim below is backed by a specific file. Where the audit brief's own framing didn't match what the code actually does, that's called out explicitly rather than silently accepted.

**Date:** 2026-08-18. Recent commits inspected: `d785c10` (Documents tab → template library, suspend-reassigns), `28834aa`, `81df2f5` (Admin Account shipped), `966cc15`, `606b427` (role-lockdown trigger).

---

## 0. Correcting the brief's premises before auditing them

Two assumptions in the brief don't hold up against the code:

- **"Stars/favorites make it messy/childish"** — there is no favorites feature. Grepping the entire CRM tree for `favorite`/`starred`/`custom_color` returns nothing. What exists is a single *fixed, non-interactive* icon tint (`iconTint: "gold"` in `_shell/nav.ts:47`) hardcoded onto exactly one nav item, "Active Clients." No user has ever been able to star anything or pick a color. The actual messiness (real, see §2/§8) is a **hardcoded per-item accent-color system** the last several nav commits layered on — orange, red, gold, purple — not a favorites feature that needs removing.
- **"Suspend now reassigns a user's companies to another user then deactivates"** — true for the dedicated `suspendAndReassignMember()` flow, but the *same form* also exposes a plain "Active account" checkbox that deactivates a user with **zero reassignment**, via a completely different code path. This is a real, currently-shippable inconsistency — detailed in §3 and §6. It's not what the brief implied ("Suspend now reassigns") — that's only true of one of the two ways to flip the flag.

Both corrections matter because they redirect where the real problems are: not "remove stars," but "the nav's ad-hoc color system needs one coherent rule," and not "suspend already reassigns," but "there are two deactivation paths and only one is safe."

---

## 1. Full CRM Information Architecture

### Primary nav (`_shell/nav.ts:86-147`, built fresh per request in `CrmShell.tsx`)

| Item | Route | Visibility | Notes |
|---|---|---|---|
| Dashboard | `/crm` | everyone | "Command Center" — counters, NBA queue, search |
| Companies | `/crm/accounts` | everyone (visibility-restricted per user) | roster |
| Contacts | `/crm/contacts` | everyone | org-wide directory |
| Prospects | `/crm/ai-agent` | everyone | *label* "Prospects", *route* `ai-agent` — released, unclaimed AI/Field-Capture leads |
| Tasks | `/crm/tasks` | everyone | org-wide, not per-user |
| Calendar | `/crm/calendar` | everyone | org-wide |
| Active Clients | `/crm/active-customers` | everyone | badge = customer count; `match` also claims `/crm/shipments`, `/crm/carriers`, `/crm/customers` |
| Upgrades | `/crm/upgrades` | everyone | internal feedback/bug board, permanently red-flagged |
| AI Review | `/crm/ai-review` | **owner only** | pending-review queue (server-redirects non-owners) |
| Settings | `/crm/settings` | everyone | pulled out of the scroll list into the bottom identity block |
| Admin Account | `/crm/admin` | **owner only** | pulled out of the scroll list into the bottom identity block |

### Hidden/legacy routes still live but unlinked from nav
`ActiveCustomersHubPage`'s own header comment (`active-customers/page.tsx:19-22`) confirms these are deliberately orphaned deep-link targets, not dead code to delete: `/crm/customers`, `/crm/shipments`, `/crm/carriers` each still render their own full page (`customers/page.tsx`, `shipments/page.tsx`, `carriers/page.tsx`) reusing the same components the hub tabs use. `/crm/rate-confirmation` and `/crm/bill-of-lading` are pure redirects to `/crm/shipments` (`rate-confirmation/page.tsx:11`, `bill-of-lading/page.tsx:11`).

**Assessment:** this consolidation (4 separate surfaces → one "Active Clients" hub with client-side tabs) is a good pattern, correctly executed — no duplicated query logic, just duplicated *entry points*. The redirects for RC/BOL are the right way to retire a route. The problem is that the *nav* doesn't reflect this consolidation cleanly (see §2) and that a rep can still stumble onto `/crm/customers` or `/crm/carriers` directly (e.g. an old bookmark, or a link inside another page like `carriers/page.tsx:41`'s own `BackButton fallbackHref="/crm/shipments"`) and land on a page with **no sidebar affordance to get back into the hub's tabbed context** — they just see an isolated Carriers list.

### What's personal vs org vs owner-only
- **Personal:** nothing, really — even "Settings" is mostly org data (see §4). The closest thing to personal state is *which record you're currently looking at*; there is no per-user saved view, saved filter, or dashboard customization anywhere.
- **Org-wide (everyone):** Dashboard, Companies (subject to `can_view_all_companies`), Contacts, Prospects, Tasks, Calendar, Active Clients hub, Upgrades.
- **Owner-only:** AI Review, Admin Account (all 4 tabs), and inside Settings, editing (not viewing) the Company/Brokerage Info card (`settings/page.tsx:54`).

### IA problems worth naming directly
1. **"Prospects" and "AI Review" are the same underlying concept (AI-sourced leads) split across two disconnected destinations** with different names, different audiences, and no visual link between them. A sales agent has no way to know AI Review exists or that leads pass through a human gate before they see them. An owner has no in-app way to jump from Prospects to AI Review or back — they're siblings in the nav array, not related surfaces.
2. **Upgrades (an internal product-feedback board) sits in the primary, permanent, org-wide sales nav**, styled with an always-on red flag — the same visual urgency language used elsewhere for genuinely time-sensitive things (Prospects' unclaimed-lead badge). A rep has no reason to think about product feedback every time they glance at their nav; this belongs closer to Settings/Help, not co-equal with Dashboard and Companies.
3. **Admin Account and Settings are demoted to "account chrome"** (bottom identity block, small text, alongside Sign Out) while Upgrades — a much lower-stakes destination — gets full-size treatment in the primary scrolling list. This inverts the actual importance hierarchy: the owner's most powerful surface is visually the *least* prominent item in the whole shell.

---

## 2. Left Sidebar / Navigation UX

Source: `_shell/CrmShell.tsx:87-277`, `_shell/nav.ts`, `_shell/icons.tsx`.

### What's actually happening with color
Every nav item defaults to white text / steel-blue (`--accent`) active state. Layered on top, four *independent, hardcoded* boolean flags each apply their own fixed color regardless of active state:

- `ownerOnly` → amber/`--warn` (AI Review)
- `redAccent` → red/`--bad` (Upgrades)
- `iconTint: "gold"` → icon-only `#e3b341` (Active Clients)
- `adminAccent` → purple `#c084fc` / `#9333ea` (Admin Account) — **not a design token at all**, a raw hex literal that appears nowhere else in the CRM's palette (`--accent`/`--warn`/`--bad`/`--ok`/`--steel` are the only themed tokens used everywhere else — see `_shell/ui.tsx`'s `BTN_*` constants)

None of these four colors form a system a user could learn. Amber means "owner-only" on one item. Red means "always flagged, for everyone" on another. Gold means "this icon is permanently this color, nothing else." Purple means "this is the elevated admin area" but is implemented as a color no other part of the app uses, on both the nav item *and* separately re-declared inline in Admin's own tab bar (`AdminTabs.tsx:41`), activity-type filter (`AdminActivityList.tsx:106`), and role-badge pills (`admin/accounts/page.tsx:49`, `admin/accounts/[userId]/page.tsx:68`, `MemberAccountForm.tsx:85`) — six-plus separate hardcoded occurrences of `#9333ea`/`#c084fc`/`#f3e8ff` instead of one token. This is the actual root of "feels messy": not too many colors as a design choice, but **the same handful of colors reinvented ad hoc, item by item, commit by commit**, so nothing reads as an intentional system on first look.

### Ordering / grouping
The 10-item flat list mixes daily-driver surfaces (Dashboard, Companies, Contacts, Tasks, Calendar) with a lead-intake queue (Prospects), a hub (Active Clients), an internal feedback board (Upgrades), and an owner gate (AI Review) — all at the same visual level, one after another, no section headers or grouping at all. A brand-new sales agent has no way to tell "these 6 are my daily tools" from "these 2 are edge cases" from "that one's for the boss."

### Mobile
`bottomNav()`/`moreNav()` (`_shell/nav.ts:151-175`) correctly derive from the same source array, so nothing can drift out of sync between desktop sidebar, mobile bottom bar, and the "More" sheet — this part is well-engineered. The bottom bar's fixed 4 slots (Dashboard, Companies, Contacts, Tasks) is a reasonable "most-used" cut. The "More" sheet inherits the same ad-hoc color problem 1:1 (`MobileMoreSheet.tsx:89-121`).

### Recommended navigation structure
Group by function, not by insertion order, with real (even minimal) visual separation — not more color, structural grouping:

```
WORKSPACE               (no header needed — this is just "the app")
  Dashboard
  Companies
  Contacts
  Prospects            ← keep badge, drop nothing
  Tasks
  Calendar
  Active Clients

──────────────────────
Admin Account           (owner-only; ONE consistent elevated treatment,
                          promoted back into the main list, not demoted
                          to footer chrome — it's the owner's most
                          powerful destination)
──────────────────────
Settings                (stays in footer — it genuinely is account chrome)
Upgrades                (moves to Settings, or footer, as a "Send feedback"
                          link — not a top-level nav destination)
Sign out
```

`AI Review` should not be a sibling nav item at all — fold it into **Prospects** as a second tab/filter ("Unclaimed" / "Pending review", owner sees both, everyone else sees only "Unclaimed") so the two AI-lead surfaces are visibly one feature with an internal gate, not two unrelated destinations.

**Color rule going forward:** one accent per *semantic category*, drawn from the existing token set (`--accent`/`--warn`/`--bad`/`--ok`) — never a new raw hex. Badges stay the two-tone system already documented in `nav.ts:24-29` (alert=red / neutral=gray) since that part is actually well-reasoned. Icon tint and permanent color-regardless-of-active-state (`ownerOnly`/`redAccent`/`adminAccent`) should collapse into a single "elevated/owner surface" treatment reused everywhere (Admin Account, AI Review-as-Prospects-tab) rather than each getting its own invented color.

---

## 3. Admin Account / Admin Portal

Source: `admin/guard.ts`, `admin/layout.tsx`, `admin/actions.ts`, `admin/{page,accounts,activity,documents}/*`.

### Enforcement (this part is solid)
`requireCrmAdmin()` gates every `/crm/admin/**` page server-side; every mutating action in `admin/actions.ts` independently re-verifies `role === 'owner'`, re-fetches the target row scoped to the caller's own `org_id` (never trusts a client-submitted id), and hard-blocks any write to the primary owner's row. Role writes are further locked at the database layer by a `BEFORE INSERT/UPDATE` trigger that rejects role changes from anything but the service-role client (`admin/actions.ts:29-41`, referencing `20260818000000_crm_profiles_role_lockdown.sql`). This is genuine defense-in-depth, not just a page-level redirect — worth preserving exactly as-is in any redesign.

### Overview tab — a factual bug, not a UX nit
`admin/page.tsx:46-49` tells the owner:

> "...**Documents** to browse every Rate Confirmation and Bill of Lading generated across every shipment."

That is false. `documents-data.ts:29-49`'s own header comment states plainly: *"this tab originally showed every RC/BOL generated across shipments; Brent's explicit correction: this is a template library, not a job-output library."* The actual Documents tab (`admin/documents/AdminDocumentsGrid.tsx`) shows exactly **2 fixed cards** — the blank master RC and BOL templates — nothing per-shipment. An owner reading the Overview card and clicking through expecting a searchable document archive will find 2 template thumbnails and nothing else. **This is a P0 copy fix**, not a design question — it actively misdescribes a shipped feature on the admin landing page.

### Accounts tab — one real workflow bug
`MemberAccountForm.tsx` bundles two independent write paths onto one form/card:

1. **"Save changes"** → `updateMemberAccount()` (`admin/actions.ts:99-129`) — writes `role`, `is_active`, `can_view_all_companies` in one shot, straight from checkbox state, **with no reassignment of that member's companies**.
2. **"Suspend user"** → `suspendAndReassignMember()` (`admin/actions.ts:157-206`) — the only path that reassigns the member's book of business *before* deactivating.

Both paths write the exact same `crm_profiles.is_active` column. An admin who simply unchecks "Active account" and clicks "Save changes" **deactivates the member and leaves every company still `assigned_user_id = <now-suspended-user>`** — silently defeating the one rule the whole Suspend flow was explicitly built to guarantee ("Brent's explicit call is that a suspended member's companies must not go unowned," `admin/actions.ts:137-139`). Nothing in the UI signals that the plain checkbox is unsafe in a way the red "Suspend user" button isn't. **This is a P0**: it's not a hypothetical edge case, it's the obvious first thing an admin would try ("just uncheck Active and save").

### Activity tab — doesn't do what the brief (and the tab's own name) implies
`activity-data.ts` and `AdminActivityList.tsx` build an org-wide merge of `crm_activities` + `crm_calls` + `crm_notes` — i.e., **the exact same business-activity data already visible on every individual Company profile's own Timeline tab** (`accounts/[id]/ActivityLogSection.tsx`/`ActivityTimeline.tsx`), just flattened across companies with filters for type/rep/company and a free-text search. That's a legitimate, useful feature (a company-agnostic activity feed), but it is **not an audit log**, and the code says so explicitly: *"This NEVER includes admin actions (role changes, promotions, control toggles, suspensions) — admin/actions.ts simply never calls logActivity()... Brent's 'don't log it when I do' instruction"* (`activity-data.ts:27-31`).

The consequence: **there is currently zero record, anywhere, of who suspended whom, who promoted whom to Admin, or who toggled `can_view_all_companies` on/off, or when.** That's fine as long as Brent is the only owner ever performing these actions and trusts himself. It stops being fine the moment a second Admin exists (`updateMemberAccount()` already allows promoting a member to `owner`, i.e. this is not a hypothetical — the product already supports multiple admins) — at that point there is no way for Brent to see "who suspended this person" or "who gave Admin to that account," which is precisely the accountability tool the brief describes wanting. Recommend a genuinely separate, minimal **admin action log** (distinct table or a `kind`-tagged row in the existing activity infrastructure, filtered *out* of the business-activity feed by default but visible on its own) — not by repurposing the current Activity tab, which correctly serves a different, real need (cross-company sales activity) and should keep its current name and scope.

### Documents tab — fine as shipped, name it precisely
2 fixed cards, no filters, admin-only, view-only preview via the shared `DocViewer`. This is a small, correctly-scoped feature — the only issue is the Overview page's description of it (above) and its label ("Documents" — generic enough that a member skimming the Overview card, or an owner months from now, will expect it to grow into more than 2 static templates, since nothing in the UI communicates "this is intentionally fixed at exactly these two").

---

## 4. Settings

Source: `settings/page.tsx`, `settings/BrokerProfileDialog.tsx`, `settings/actions.ts`.

Settings is now genuinely small and clean post-Admin-Account split: "Your account" (name/title/email/role — read-only) and "Company / Brokerage Info" (the org's letterhead data — RC/BOL header fields — owner-editable, member-readable). This is a correct, minimal Personal-vs-Org split already:

| Section | Who sees | Who edits | Category |
|---|---|---|---|
| Your account (name/title/role) | everyone | *no in-app edit path at all* — see below | Personal |
| Company / Brokerage Info | everyone | owner only (`isAdmin` gate, `settings/page.tsx:54`) | Organization |

**Gap, not misplacement:** "Your account" has no edit affordance for the viewer's own `full_name`/`title` — the page renders them read-only with no button. That's a missing personal-settings capability, not something that needs to move.

**Team roster, per-member activity log, and the document library correctly moved out already** (page.tsx:11-17 documents this explicitly — "moved into the owner-only Admin Account section... and were removed from this page so there's no duplicate surface"). No further Settings→Admin migration is needed; this section is done.

---

## 5. Sales Agent Workflow

Walking the actual code paths a rep hits daily:

- **Find/view a company:** Dashboard search (`DashboardSearch.tsx`) or Companies list with full-text search over a real GIN index (`accounts/page.tsx:37-44`, `toPrefixQuery`) — fast, real search, not client-side filtering of a capped page. Good.
- **Company profile:** two-column layout, 7-stage funnel tracker, tabbed Contacts/Timeline/Tasks/Files panel (`accounts/[id]/page.tsx:43-59`). This has been rebuilt multiple times per memory of prior sessions; the current shape is coherent and matches the rest of the design system.
- **Add a contact:** two entry points — Companies list (`AddContactDialog` reused via `accounts/page.tsx:14`) and the Contacts page itself. Consistent component reuse, no duplicated form logic.
- **Follow up / record activity:** `LogCallDialog`, task creation, and the dashboard's Next-Best-Action queue all funnel into the same underlying tables and the same company profile. The dashboard's NBA tiering (overdue tasks → overdue follow-ups → stale accounts → research gaps, `page.tsx:466-527`) is a genuinely well-thought-out single ranked queue rather than a fuzzy composite score — the code comment explicitly notes this was a deliberate correction from an earlier "fuzzy composite score" design. This is one of the CRM's stronger workflow decisions.
- **Search:** two separate search implementations exist — the dashboard's `DashboardSearch` (companies+contacts, client-side over a pre-fetched roster) and the Companies list's server-side full-text search. A rep has no single mental model of "where do I search"; the dashboard search and the Companies list search look and behave differently for the same underlying question ("find this company"). Minor but real friction — not urgent.
- **Favorites:** none exist (see §0). Not a gap — nothing in the workflow evidence suggests reps need to pin/save specific companies; the dashboard's NBA/stale/research queues already do the "what should I look at" job favorites would otherwise be asked to do.
- **Mobile:** bottom-bar + "More" sheet covers every desktop nav destination (verified via `bottomNav()`/`moreNav()` deriving from one source, §2). Genuinely solid parity — no dead ends on mobile navigation-wise.

**Friction actually worth fixing:**
1. Two different search UIs for the same underlying question (dashboard vs Companies list).
2. Reaching `/crm/carriers` or `/crm/customers` directly (any old link, or the Carriers page's own `BackButton fallbackHref="/crm/shipments"`, `carriers/page.tsx:41`) drops a rep outside the tabbed Active Clients hub with no way back into it except re-navigating via the sidebar — the page doesn't even know the hub exists.

---

## 6. Owner/Admin Workflow

- **Manage users / promote / demote / suspend / visibility:** all in Admin → Accounts → member detail. Server-side guarantees are strong (§3). The one real defect is the dual deactivation path (§3, P0).
- **Review activity:** Admin → Activity gives a real, useful cross-company feed — good for "what's been happening" but cannot answer "who changed what admin setting" (§3).
- **Manage documents:** Admin → Documents is correctly scoped and simple, but the Overview tab's own description of it is wrong (§3, P0).
- **Org-level settings:** Company/Brokerage Info lives in regular Settings, not Admin — reasonable, since it's read by every member (letterhead data), and the brief's "Documents → Admin" ask has already shipped; there's no comparable case for moving Brokerage Info.
- **Monitor usage:** `admin/page.tsx` Overview gives 3 cheap counters (active team, doc count, open tasks org-wide) — thin but honest, and explicitly designed to stay cheap as data grows (`admin/page.tsx:6-12`). Fine as a v1 landing page.
- **Investigate + navigate to affected records:** Admin Activity rows link to the referenced company/contact (`recordHref()`, `AdminActivityList.tsx:20-24`) — correct deep-linking pattern, and the one place in Admin that already does what §3/§10's "activity log must deep-link" requirement asks for. This pattern (not a new one) is what any future real audit-log feature should reuse.

**Missing from today's owner workflow, confirmed by code absence, not assumption:** no way to see "who did X to this admin setting," no way to un-suspend without going through the same form that has the dual-path issue, no notification/alert when a member is suspended or promoted (silent, `revalidatePath` only — the acting admin sees it, no one else is told).

---

## 7. Visual Design System

The underlying primitives (`_shell/ui.tsx`, `_shell/form.tsx`, `_shell/compactForm.tsx`) are **more disciplined than the brief's premise assumes**. Concretely:

- One `Card`/`CardHead` pair used identically across Dashboard, Companies, Tasks, Settings, AI Agent, AI Review, and Admin (`ui.tsx:56-109`, comment explicitly states this "so every CRM page reads identically").
- A real semantic button-color standard (`ui.tsx:148-190`): `BTN_PRIMARY`/`BTN_SUCCESS`/`BTN_ACTION`/`BTN_EDIT`/`BTN_WARNING`/`BTN_DANGER`/`BTN_NEUTRAL`, each with a documented meaning, and the comment records a real historical correction (all-red operational buttons → blue `BTN_ACTION`, Brent's 2026-08-08 call) — i.e., this system has already been through one consistency pass and held.
- One shared form-control token set (`compactForm.tsx`'s `CONTROL`/`CONTROL_SIZE`/`LABEL`) reused by both the uncontrolled (`form.tsx`) and controlled/autosave (`compactForm.tsx`) form families — genuinely not duplicated.
- `ZEBRA_ROWS`/`LIST_HEAD_ROW`/`GRID_TABLE` give every list (card-grid or raw `<table>`) the same dark-bar-header + zebra-stripe treatment.

**So where does "messy/inconsistent/overdecorated" actually come from?** Two concrete, narrow sources, not a systemic problem:

1. **The nav's hardcoded accent-color layering** (§2) — the single biggest visible source of "too many colors," concentrated entirely in `nav.ts`/`CrmShell.tsx`/`MobileMoreSheet.tsx`.
2. **Admin's off-token purple** (`#9333ea`/`#c084fc`/`#f3e8ff`, 6+ occurrences, §2) — the one place raw hex bypasses the otherwise-consistent token system, likely because Admin was built as its own late addition without folding its accent into the existing `--accent`/`--warn`/`--bad`/`--ok` palette.

**Smaller, real inconsistencies:**
- `CompanyMoreMenu.tsx:57` uses a native `window.confirm()` for "Delete company" — every other confirm/destructive-action flow in the app (Suspend, e.g.) uses the shared `Modal` component. One native browser dialog breaks the otherwise-consistent modal language.
- Admin's tab-active color (`#9333ea`) and its type-filter active color (same hex, `AdminActivityList.tsx:106`) don't match the rest of the app's tab pattern elsewhere (e.g. `ActiveCustomersTabs.tsx:66` uses `text-accent`, the real token) — same page-type component, two different color systems depending on which part of the app built it.

**Recommended direction:** don't redesign the primitives — they're good. Fold Admin's purple into the token system (either promote it to a real `--admin` CSS variable alongside the existing ones, or just reuse `--accent` and let context/placement communicate "elevated," not color) and collapse the nav's four independent accent flags into the single system proposed in §2.

---

## 8. Favorites / Star / Color System

As established in §0, there is no favorites or user-customizable-color system to remove. What exists and should be addressed:

- The gold star (`IconStarSolid`, `iconTint: "gold"`) is a **fixed brand choice for one specific nav item**, not a favoriting mechanic — keep it, but recognize it currently reads as "why does this one thing get a special icon color" with zero explanation anywhere in the UI. If kept, it should be the *only* icon-level color exception in the whole nav (currently it's one of four).
- No per-user customization exists anywhere (no theme picker, no reorderable nav, no saved views) — this is consistent with a small-team internal tool and shouldn't be added; user-customizable nav color/order would actively work against the "one coherent product" goal the brief states.
- **Recommendation:** treat color purely as *system-assigned meaning* (owner-only, active state, alert badge) — never user-assigned, never per-item bespoke. This naturally resolves both the "childish" feeling (arbitrary-looking colors) and avoids introducing a real favorites feature that nothing in the current workflow evidence (§5) suggests reps actually need.

---

## 9. Responsive / Mobile

- **Broken:** none found. Every surface inspected renders a real mobile layout — Admin's `AdminTabs.tsx:28` scrolls horizontally at `overflow-x-auto`, `ActiveCustomersTabs.tsx:55` switches to a 4-col grid on mobile specifically to avoid horizontal scroll, `MobileMoreSheet` correctly derives from the same nav source as desktop (§2). Prior memory entries (Active Customers tab-bar fix, etc.) suggest mobile bugs get caught and fixed promptly when found.
- **Needs polish, not broken:** Admin's member-detail page (`admin/accounts/[userId]/page.tsx:57`) uses `grid-cols-1 lg:grid-cols-[320px_1fr]` — reasonable, but the "Access & controls" form and the Suspend dialog haven't been screenshot-verified on a narrow viewport per the code's own comments elsewhere in this codebase's convention of flagging "NOT browser-verified." Given Admin just shipped, this is the one area worth an actual phone-screenshot pass before calling it done.
- Nothing in Admin, Activity, or Documents suggests desktop-only assumptions (no fixed-width tables, no hover-only affordances) — the underlying `Card`/list primitives are viewport-agnostic by construction.

---

## 10. Route + Workflow Consistency

- **Naming mismatch:** nav label "Prospects" → route `/crm/ai-agent`. Nothing else in the nav has label/route this disconnected; a rep bookmarking or sharing a URL sees `ai-agent`, not `prospects`.
- **Orphaned-but-alive routes** (`/crm/customers`, `/crm/shipments`, `/crm/carriers`) are reachable with no path back into their consolidated hub (§1, §5) — the redirect pattern used for `/crm/rate-confirmation`/`/crm/bill-of-lading` (clean 301-style redirect to the new home) was the right call for *retired* routes; these three are *not* retired (still independently useful for deep links per the hub page's own comment) but also don't visually acknowledge they're now tabs of something bigger.
- **Admin Activity's deep-linking is the one place in the whole CRM that already satisfies the brief's "each row links to the record it references" requirement** (`recordHref()`, §6) — this is the pattern to standardize on, not invent fresh, when/if a real audit log gets built.
- **No dead links found** in the traced routes — every internal `Link`/`redirect` target resolves to a real page.
- **BackButton fallback correctness:** `carriers/page.tsx:41` falls back to `/crm/shipments`, which is itself a live-but-unlinked route rather than the new `/crm/active-customers` hub — a small but real "doesn't preserve context" instance; a rep who arrived at Carriers *from* the hub and clicks Back lands outside the hub, not back in it.

---

## 11. Permission/Security UX

Server-side enforcement is consistently strong everywhere traced: `requireCrmUser()` (`lib/crm/auth.ts:30-58`) is the one authoritative gate, independent of the separate `/admin` (dispatch) gate; `requireCrmAdmin()` layers owner-only on top; every Admin mutating action re-verifies role + org + target independently of the page gate (§3). RLS scopes every query to the caller's org regardless of UI state.

**One concrete UI/enforcement mismatch found**, worth flagging precisely because the brief asked for exactly this class of bug:

- `getCompanyVisibility()` (`_shell/companyVisibility.ts:9-27`) is explicitly scoped to "the CRM's actual company-ROSTER surfaces — the Companies list and Active Customers" and deliberately *not* applied to pickers, by design, per its own comment (companies a rep is "already working with" rather than browsing the org's whole roster).
- `accounts/page.tsx:104` correctly applies this restriction even to its own "Add contact" company combobox ("otherwise a restricted agent could still pick any company by name through this dropdown" — the code says this explicitly).
- **But the Dashboard's company-search roster does not.** `page.tsx:208-213` (`companyOptionsRes`) fetches **every** company in the org with no `getCompanyVisibility()` filter at all, and feeds it straight into `DashboardSearch` (org-wide company search) and the "Add company" quick-action's company picker. A restricted sales agent (`can_view_all_companies = false`) who is blocked from seeing a company on the Companies list can still **type its name into the Dashboard search bar and find it** — the exact "UI hides something but doesn't enforce it consistently" pattern the brief asked to check for. This isn't a data leak in the RLS/security sense (RLS still scopes by org, and the underlying row data returned is just id+name), but it is a real UX/policy inconsistency: the same restriction is enforced in one search surface and silently absent in another, for what is otherwise treated as one coherent "which companies can this person see" policy.

**Recommendation:** either apply `getCompanyVisibility()` to the dashboard's company roster query too, or (if intentional — dashboard search is meant to answer "does this company exist," not "is it assigned to me") document that distinction explicitly in the code and, more importantly, decide it deliberately rather than by omission.

---

## 12. Database/Code Architecture (product-relevant only)

- **Genuinely reusable, well-isolated:** `_shell/nav.ts`'s `buildCrmNav`/`bottomNav`/`moreNav` triad, the `Card`/`CardHead`/`BTN_*` design tokens, `requireCrmUser`/`requireCrmAdmin`'s layered-gate pattern, `AdminActivityList`'s `recordHref()` deep-link pattern (§10/§6) — all good foundations for expanding Admin without a rewrite.
- **A naming/concept collision worth flagging before it compounds:** "Activity" now means two different things in the same product — the per-company `ActivityTimeline`/`ActivityLogSection`, and Admin's org-wide `AdminActivityList`, which read the *same three source tables* (`crm_activities`/`crm_calls`/`crm_notes`) through *separately duplicated* query/merge logic (`activity-data.ts` vs `accounts/[id]/ActivityLogSection.tsx`). If a real admin *audit* log gets added later, calling it "Activity" too (a third meaning) would make this materially worse — see the naming recommendation in §14.
- **Purple-as-a-hex-literal (§2/§7) is the one piece of Admin architecture that will make future Admin features harder**, specifically: every future Admin surface will either (a) keep copy-pasting `#9333ea` (what's already happening, 6+ times) or (b) silently drift to a different ad hoc color, because there is no `--admin` token to reach for. This is a 10-minute fix (add one CSS variable) that prevents a compounding problem.
- **No TMS-specific assumptions or shared-module leakage found** in anything traced — `lib/crm/auth.ts` is explicitly independent of the `/admin` (dispatch/TMS) gate, and the CRM's own `_shell/` primitives are CRM-only (`icons.tsx:1-6` states this is "Deliberately its own small set (not the admin icon set) to keep the CRM self-contained"). CRM/TMS separation is intact.

---

## 13. Prioritization

**P0 — must-fix-before-continuing** (correctness/safety bugs, not preference):
1. Admin Accounts: unify the two deactivation paths so unchecking "Active account" + Save either also requires/forces reassignment, or is removed in favor of the Suspend flow being the *only* way to deactivate (§3, §6).
2. Admin Overview: fix the Documents-tab description — it currently describes a feature (per-shipment RC/BOL archive) that was explicitly built and then explicitly removed (§3).
3. Dashboard company picker: apply (or explicitly, deliberately decide not to apply) `getCompanyVisibility()` to `companyOptionsRes` in `page.tsx`, matching what `accounts/page.tsx` already does (§11).

**P1 — should-fix-soon:**
4. Fold Admin's purple hex literals into a real design token (§2/§7/§12).
5. Collapse the nav's four independent hardcoded accent flags (`ownerOnly`/`redAccent`/`iconTint`/`adminAccent`) into one coherent, documented color rule (§2).
6. Move Upgrades out of the primary org-wide nav into Settings/footer (§1/§2).
7. Rename or re-route "Prospects" so its label and URL agree, and merge it with AI Review into one Prospects surface with an internal owner-only tab/filter rather than two nav items (§1/§2).
8. Fix the Carriers page's `BackButton` fallback (and any similar orphaned-route back-links) to return into the Active Clients hub, not a bare unlinked route (§5/§10).

**P2 — product/UX improvement:**
9. Design (don't yet build) a real, separate admin-action audit log distinct from the business-Activity feed — see §14 for the recommended shape (§3/§6/§12).
10. Unify the two separate company/contact search implementations (dashboard vs Companies list) into one shared search pattern (§5).
11. Replace `CompanyMoreMenu`'s native `window.confirm()` with the shared `Modal` component for consistency (§7).
12. Add an edit affordance for the viewer's own name/title in Settings → "Your account" (§4).
13. Restore Admin Account and Settings to visual parity with their actual importance — Admin especially shouldn't read as smaller/lesser than Upgrades (§1/§2).

**P3 — optional polish:**
14. Screenshot-verify Admin's member-detail page and Suspend dialog on a real narrow mobile viewport (§9).
15. Consider a small visual distinction (not a new color — e.g. spacing/section label) separating "daily driver" nav items from "occasional" ones, once the color system is unified (§2).

**Recommended order (smallest changes, biggest improvement first):** 1 → 3 → 2 → 4 → 5 → 6 → 7 → 8 → the rest. Items 1–3 are each a small, contained code change (a form/action fix, a copy fix, a query filter) that close real correctness gaps *today*, before any visual/IA work. Items 4–8 are the nav/Admin coherence pass the brief is centrally asking for, and are cheap precisely because the underlying design-system primitives (§7) don't need to change — only the handful of files that bypass them do.

---

## 14. Admin V1 Recommended IA

Keep the existing 4-tab shape — it's the right size for what's actually needed today, and the tab-strip pattern (`AdminTabs.tsx`) is a real route-backed structure (not client-only state), which matters for the deep-linking requirement in §10:

```
Admin Account
├── Overview        (fix the Documents description; otherwise fine as a thin landing page)
├── Accounts        (fix the dual-deactivation-path bug; otherwise the strongest tab today)
├── Activity        (keep as-is — cross-company sales activity feed; rename nothing, it's honest about what it is once the audit-log confusion in §3 is resolved)
├── Documents        (keep as-is — 2-card template library; tighten the Overview copy so nobody expects more)
└── [future] Audit Log   ← NEW, separate from Activity. WHO/WHAT/WHEN/record-link,
                            populated by actually calling a logging function from
                            admin/actions.ts (currently deliberately not called at all,
                            §3). Reuse AdminActivityList's existing filter/search/
                            recordHref() pattern rather than building new UI.
```

**Why a 5th tab and not folding Audit Log into Activity:** they answer different questions for different reasons (§12's naming-collision warning). Activity answers "what's been happening with our customers." Audit Log answers "what did an admin change, and who's accountable." Merging them either buries the accountability data inside noise, or (per Brent's current explicit choice) keeps it invisible entirely. A separate tab keeps both honest and keeps Activity's current, real value intact.

**Expansion rule for future Admin features:** every new tab must (a) use the shared `AdminTabs` route pattern, (b) reuse `requireCrmAdmin()` for the page gate and re-verify role in its own actions file exactly like `admin/actions.ts` already does, and (c) draw its accent from a real token, not a new hex literal — codifying the fix from P1 #4 as the standing rule, not a one-time cleanup.

---

## 15. Final Product Recommendation

**A. Current CRM state — what's good.** The core design-system primitives (`Card`/`CardHead`/`BTN_*`/`CONTROL`) are disciplined and already survived one real consistency pass. Server-side permission enforcement is layered and genuinely defense-in-depth (page gate + re-verified action + DB trigger for role). The Admin Account section's Accounts tab and its guardrails (can't touch self/primary-owner, service-role writes) are well-built. The dashboard's Next-Best-Action tiering is a strong, deliberate workflow decision, not a generic dashboard. Mobile parity is real, not an afterthought — derived from one nav source, not duplicated by hand. The Active Clients hub consolidation (4 surfaces → 1, with old routes kept alive as deep-link targets rather than deleted) is exactly the right retirement pattern.

**B. Biggest problems (5–10, ranked).**
1. Two divergent ways to deactivate a user, only one of which is safe (P0).
2. Admin Overview describes a feature that doesn't exist anymore (P0).
3. A visibility policy enforced in one search surface, silently absent in another (P0).
4. The nav's four independent, hardcoded, ad-hoc accent colors — the real source of "feels messy," not a favorites system that never existed.
5. Admin's purple exists nowhere in the actual design-token system.
6. No accountability trail for admin actions, despite the product already supporting multiple admins.
7. Admin Account (the owner's most powerful surface) is visually demoted below Upgrades (an internal feedback board) in nav prominence.
8. "Prospects" and "AI Review" are one concept split into two disconnected, inconsistently-visible destinations.

**C. Admin portal recommendation.** Keep Overview/Accounts/Activity/Documents; add a 5th Audit Log tab once built (§14); fix items B1–B2 immediately; promote Admin Account back into full nav prominence.

**D. Sidebar recommendation.** Flat Workspace list (Dashboard/Companies/Contacts/Prospects/Tasks/Calendar/Active Clients) at full visual weight; Admin Account promoted alongside it (owner-only, one consistent elevated treatment, not a new color per feature); Settings and a demoted "feedback" link for Upgrades in the footer; one color per semantic category, all drawn from existing tokens (§2).

**E. Settings recommendation.** Stays as-is structurally — "Your account" (personal) + "Company/Brokerage Info" (org, owner-edits) is already the correct split post-Admin-split. Only gap: add self-edit for name/title.

**F. Sales agent experience changes.** Unify the two search implementations; fix the Carriers/Shipments/Customers orphaned-route back-navigation; otherwise the daily workflow (dashboard NBA queue → company profile → task/call logging) is already close to right and shouldn't be disrupted.

**G. Owner experience changes.** Fix the dual-deactivation bug and the Overview copy immediately; design (don't build yet) a real audit log as a 5th Admin tab; restore Admin Account's nav prominence.

**H. Visual design direction.** Don't redesign the primitives — extend the existing token system (one `--admin` token, one nav-color rule) rather than inventing a new visual language. The "professional vs childish" gap closes by *removing ad hoc color*, not by adding more design.

**I. Prioritized roadmap (exact order).** P0 #1 → #3 → #2, then P1 #4 → #5 → #6 → #7 → #8, then P2, then P3 — full detail and rationale in §13.

**J. DO NOT BUILD YET.**
- Any user-facing favorites/pinning/custom-color feature — no workflow evidence supports it, and it would reintroduce the exact per-user visual chaos this audit recommends removing.
- A generic "audit log" bolted onto the existing Activity tab — build it as its own tab once actually needed, using Activity's proven filter/search/deep-link pattern, not by overloading Activity's current honest scope.
- Any expansion of the Documents tab into a searchable per-shipment archive — that was explicitly tried and explicitly reverted (`documents-data.ts`'s own comment); don't re-litigate it without a fresh, explicit product decision.
- Nav reordering/personalization controls for end users — the fix here is a *system* color rule the product enforces, not a knob each user turns themselves.
