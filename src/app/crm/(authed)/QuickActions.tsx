"use client";

import { IconPlus, IconTasks, IconPhone } from "./_shell/icons";
import { AddContactDialog } from "./contacts/AddContactDialog";
import type { CompanyOption } from "./contacts/CompanyCombobox";
import { TaskDialog, type TaskAccountOption, type TaskContactOption } from "./tasks/TaskDialog";
import type { RepOption } from "./accounts/CompanyDialog";
import { QuickLogCallDialog, type QuickCallContactOption } from "./calls/QuickLogCallDialog";

/**
 * The dashboard's Quick actions row — three plain buttons, each wired to an
 * existing dialog via its `trigger` render prop. Split into small Client
 * Components (rather than building the `trigger` callbacks inline in
 * page.tsx) because `trigger` is a function prop — a Server Component can
 * never hand a closure to a Client Component (same rule buildCrmNav's
 * docstring calls out for icon components). page.tsx only ever passes these
 * plain, serializable data.
 */

const BUTTON_CLASS =
  "flex flex-1 items-center justify-center gap-2 rounded-2xl border border-line-strong bg-card px-3 py-3.5 text-[13.5px] font-semibold text-fg shadow-e2 transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-e3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function QuickAddContactButton({ companies }: { companies: CompanyOption[] }) {
  return (
    <AddContactDialog
      companies={companies}
      trigger={(open) => (
        <button type="button" onClick={open} className={BUTTON_CLASS}>
          <IconPlus width={16} height={16} />
          Contact
        </button>
      )}
    />
  );
}

export function QuickLogCallButton({
  accounts,
  contacts,
}: {
  accounts: CompanyOption[];
  contacts: QuickCallContactOption[];
}) {
  return (
    <QuickLogCallDialog
      accounts={accounts}
      contacts={contacts}
      trigger={(open) => (
        <button type="button" onClick={open} className={BUTTON_CLASS}>
          <IconPhone width={16} height={16} />
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
          <IconTasks width={16} height={16} />
          Task
        </button>
      )}
    />
  );
}
