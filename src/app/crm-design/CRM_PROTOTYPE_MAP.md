# CRM Prototype — Screen Map

Branch: `crm-design-prototype`. Root route: `/crm-design`. See `DESIGN_DECISIONS.md` (same folder) for the
reasoning behind the structure below, and `CRM_MASTER_AUDIT.md` (repo root) for the findings that drove it.

Start at **`/crm-design/login`** — pick any of the three quick sign-in personas (Brent = Owner, Marcus = Admin,
Dana = Sales Agent) to see the role-appropriate nav. Switch personas at any time from the account menu
("Switch view") in the sidebar footer, without signing out.

---

| Screen | Route | Purpose | Primary user | Primary actions | Nav entry point | Related screens |
|---|---|---|---|---|---|---|
| Login | `/crm-design/login` | Entry point + prototype role switcher | Everyone | Sign in (form is cosmetic), quick-select a persona | Direct link | Dashboard (after "sign-in") |
| Dashboard | `/crm-design` | Daily command center — what's overdue, what's next, recent org activity | Everyone | Complete a task, open a company from NBA/activity, "Add company" | Sidebar → Dashboard | Companies, Tasks, Calendar, Activity Feed |
| Companies | `/crm-design/companies` | Company roster, searchable/filterable | Everyone (visibility-restricted for a limited Sales Agent) | Search, filter by stage, "Add company" | Sidebar → Companies | Company detail |
| Company detail | `/crm-design/companies/[id]` | Full record: stage, details, contacts, activity, documents, tasks, **Intelligence** (BOL-sourced locations/observed freight/lanes — empty until an admin releases something) | Everyone with visibility | Move stage, log activity, add contact, generate document, complete a task | Companies list, any company link elsewhere | Contact detail, Admin → Activity Log (deep-link target), Admin → BOL detail (Intelligence tab's "BOL sources," owner/admin only) |
| Contacts | `/crm-design/contacts` | Org-wide contact directory | Everyone | Search, "Add contact" | Sidebar → Contacts | Contact detail, Company detail |
| Contact detail | `/crm-design/contacts/[id]` | One contact's info + activity history | Everyone | Log activity (call/note/email), call/email links | Contacts list, Company detail's Contacts tab | Company detail |
| Tasks | `/crm-design/tasks` | Every open task, grouped by urgency | Everyone | Complete a task | Sidebar → Tasks | Company detail |
| Calendar | `/crm-design/calendar` | Month view of task due dates + follow-ups | Everyone | Select a day to see its events | Sidebar → Calendar | Company detail |
| Active Clients | `/crm-design/active-clients` | Roster of Active-Customer-stage companies | Everyone | Open a company | Sidebar → Active Clients | Company detail |
| Activity Feed | `/crm-design/activities` | Org-wide SALES activity (calls/notes/emails/stage changes/documents) | Everyone | Search, filter by type, jump to company | Sidebar → Activity Feed | Company detail. **Not** the admin audit log — see Admin → Activity Log below |
| Settings | `/crm-design/settings` | Personal account (name/title), read-only org letterhead reference | Everyone | Edit name/title | Sidebar footer → Settings | Admin → Organization (edit link, owner/admin only) |
| Design System | `/crm-design/design-system` | Living style guide — every UI primitive + explicit empty/loading/error states | Internal reviewers | Trigger a toast/modal/drawer, flip through state demos | Account menu → "Design system reference" | — |
| Admin Account (Overview) | `/crm-design/admin` | Landing summary + accurate description of each Admin tab | Owner/Admin | Jump to any Admin tab via stat tiles | Sidebar → Admin Account | BOL Center, Accounts, Activity Log, Documents, Organization |
| Admin → BOL Center (Inbox) | `/crm-design/admin/bol-center` | Intake queue for every uploaded BOL — status funnel (New→Needs Review→AI Extracted→Researching→Ready for Approval→Approved / Rejected / Archived) | Owner/Admin | Search, filter by status, "Upload BOL" | Admin tab bar → BOL Center (2nd slot, badge = needs-attention count) | BOL detail |
| Admin → BOL detail | `/crm-design/admin/bol-center/[id]` | One BOL's full review workspace — persistent original photo (left) + tabbed review (right) | Owner/Admin | Run AI extraction, correct fields, confirm/reject customer match, review locations, verify contacts, write research notes, Approve/Reject, pick release checklist + Release to Sales | BOL Center Inbox row | Company detail (only after release), another BOL (via duplicate-hint "Compare" or BOL History) |
| Admin → Accounts | `/crm-design/admin/accounts` | Team roster | Owner/Admin | Open a member's detail page | Admin tab bar → Accounts | Member detail |
| Admin → Member detail | `/crm-design/admin/accounts/[id]` | Manage one member's role, visibility, and active status | Owner/Admin | Change access level, toggle visibility, **Suspend & reassign…** or **Reactivate** (single safe path each) | Accounts roster, Activity Log deep-links | Company detail (via reassignment) |
| Admin → Activity Log | `/crm-design/admin/activity` | Real audit trail — who changed what, when | Owner/Admin | Filter by admin/action/date, search, click a row to open the affected record | Admin tab bar → Activity Log | Member detail, Company detail |
| Admin → Documents | `/crm-design/admin/documents` | The org's 2 blank master templates (Rate Confirmation, Bill of Lading) — **not** where uploaded BOL photos live | Owner/Admin | Preview a template; banner links to BOL Center for uploaded photos | Admin tab bar → Documents | Company detail's Documents tab (where documents are actually generated), BOL Center (cross-linked, different system) |
| Admin → Organization | `/crm-design/admin/organization` | Brokerage/letterhead info every generated document reads from | Owner/Admin | Edit and save | Admin tab bar → Organization | Settings (read-only reference + link here) |

---

## Key modals / drawers (not standalone routes)

| Component | Opens from | Purpose |
|---|---|---|
| Upload BOL (drawer) | BOL Center Inbox | Camera/photo-library/PDF capture (three equal-weight entry points) → BOL enters the queue as "New" → "Review now" routes into its detail page |
| Add Company (drawer) | Dashboard, Companies list | Create a company, routes into its new detail page |
| Add Contact (drawer) | Contacts list, Company detail's Contacts tab | Create a contact, optionally linked to a company |
| Log Activity (modal) | Company detail, Contact detail | Log a call / note / email against a company (and optionally a contact) |
| Generate Document (drawer, 2-step) | Company detail's Documents tab | Choose Rate Confirmation or Bill of Lading → mock preview → Generate |
| Suspend & Reassign (modal) | Admin → Member detail | Reassign a member's companies to another active member, then suspend — the only path to suspension |
| Send Feedback (modal) | Sidebar footer | Mock feedback composer (replaces the real CRM's always-visible "Upgrades" nav item) |
| Switch View (modal) | Account menu | Prototype-only persona switcher (Owner / Admin / Sales Agent) |
| Command Palette | ⌘K anywhere, or the sidebar/mobile search button | Search companies, contacts, and (owner/admin) team accounts from one place |

## Responsive coverage

Every screen above renders both desktop (`lg:` sidebar + tables) and mobile (bottom bar + "More" sheet + card
lists) layouts from the same route and the same data — there are no separate mobile-only or desktop-only pages.
Verified in-browser at 375×812 (mobile) and 1280×800 (desktop).
