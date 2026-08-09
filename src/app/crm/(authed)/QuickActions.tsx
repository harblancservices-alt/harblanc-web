"use client";

import { IconPlus, IconTasks, IconPhone } from "./_shell/icons";
import { AddContactDialog } from "./contacts/AddContactDialog";
import type { CompanyOption } from "./contacts/CompanyCombobox";
import { TaskDialog, type TaskAccountOption, type TaskContactOption } from "./tasks/TaskDialog";
import { CompanyDialog, type RepOption } from "./accounts/CompanyDialog";
import { LogCallDialog } from "./calls/LogCallDialog";
import { BTN_PRIMARY } from "./_shell/ui";

/**
 * The dashboard's button cockpit — the FIRST thing on the page (replacing
 * the old KPI stat-tile row, Brent's explicit call), four big thumb-friendly
 * buttons each wired to an existing dialog via its `trigger` render prop.
 * Split into small Client Components (rather than building the `trigger`
 * callbacks inline in page.tsx) because `trigger` is a function prop — a
 * Server Component can never hand a closure to a Client Component (same rule
 * buildCrmNav's docstring calls out for icon components). page.tsx only ever
 * passes these plain, serializable data.
 */

const BUTTON_CLASS =
  "flex min-h-[64px] flex-1 flex-col items-center justify-center gap-1.5 border border-[#2563eb] bg-[#2563eb] px-3 py-3 text-[13.5px] font-bold text-white shadow-e2 transition-all hover:-translate-y-0.5 hover:bg-[#1d4ed8] hover:shadow-e3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

export function QuickAddContactButton({ companies }: { companies: CompanyOption[] }) {
  return (
    <AddContactDialog
      companies={companies}
      trigger={(open) => (
        <button type="button" onClick={open} className={BUTTON_CLASS}>
          <IconPlus width={18} height={18} />
          Add contact
        </button>
      )}
    />
  );
}

export function QuickAddCompanyButton({ reps }: { reps: RepOption[] }) {
  return (
    <CompanyDialog
      mode="create"
      reps={reps}
      trigger={(open) => (
        <button type="button" onClick={open} className={BUTTON_CLASS}>
          <IconCompanyPlus width={18} height={18} />
          Add company
        </button>
      )}
    />
  );
}

/** Small "+ Add" pill in the dashboard header — opens the full Add-company
 * dialog. Distinct from the cockpit's own big "Add company" tile below it. */
export function HeaderAddCompanyButton({ reps }: { reps: RepOption[] }) {
  return (
    <CompanyDialog
      mode="create"
      reps={reps}
      trigger={(open) => (
        <button
          type="button"
          onClick={open}
          className={`inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg px-3.5 text-[13.5px] font-bold transition-colors ${BTN_PRIMARY}`}
        >
          <IconPlus width={16} height={16} />
          Add
        </button>
      )}
    />
  );
}

/** A company's id/name — {@link CompanyOption} shape, kept as its own name
 * here for callers of this file's exported type. */
export type QuickCallContactOption = { id: string; name: string; accountId?: string | null };

/**
 * The dashboard's "Log call" tile — no fixed company/contact context.
 * `accounts`/`contacts` are accepted for caller compatibility (page.tsx
 * still passes the org roster down) but no longer needed: LogCallDialog now
 * self-fetches everything it needs for its own linked contact/company/phone
 * comboboxes and cross-autofill.
 */
export function QuickLogCallButton({
  accounts: _accounts,
  contacts: _contacts,
}: {
  accounts?: CompanyOption[];
  contacts?: QuickCallContactOption[];
}) {
  return (
    <LogCallDialog
      trigger={(open) => (
        <button type="button" onClick={open} className={BUTTON_CLASS}>
          <IconPhone width={18} height={18} />
          Log call
        </button>
      )}
    />
  );
}

export function QuickAddTaskButton({
  accounts,
  contacts,
  reps,
  canAssignOthers,
  currentUser,
}: {
  accounts: TaskAccountOption[];
  contacts: TaskContactOption[];
  reps: RepOption[];
  canAssignOthers: boolean;
  currentUser: { id: string; label: string };
}) {
  return (
    <TaskDialog
      mode="create"
      accounts={accounts}
      contacts={contacts}
      reps={reps}
      canAssignOthers={canAssignOthers}
      currentUser={currentUser}
      trigger={(open) => (
        <button type="button" onClick={open} className={BUTTON_CLASS}>
          <IconTasks width={18} height={18} />
          Add task
        </button>
      )}
    />
  );
}

/** Small building-plus glyph for "Add company" — the CRM icon set has no
 * dedicated company-create icon, so this composes IconCompanies' building
 * shape with a plus badge rather than reusing the bare IconPlus (which
 * "Add contact" already uses). */
function IconCompanyPlus(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M4 21V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v16" />
      <path d="M12 10h5a1 1 0 0 1 1 1v3" />
      <path d="M3 21h13" />
      <path d="M7.5 7.5h.01M7.5 11h.01M7.5 14.5h.01" />
      <circle cx="19" cy="17" r="3.25" />
      <path d="M19 15.75v2.5M17.75 17h2.5" />
    </svg>
  );
}
