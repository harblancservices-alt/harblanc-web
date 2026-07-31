"use client";

import { StatButton } from "./_shell/ui";
import { IconPlus, IconTasks, IconPhone } from "./_shell/icons";
import { AddContactDialog } from "./contacts/AddContactDialog";
import type { CompanyOption } from "./contacts/CompanyCombobox";
import { TaskDialog, type TaskAccountOption, type TaskContactOption } from "./tasks/TaskDialog";
import type { RepOption } from "./accounts/CompanyDialog";
import { QuickLogCallDialog } from "./calls/QuickLogCallDialog";

/**
 * The dashboard KPI strip's first three cards, each a StatButton wired to an
 * existing dialog. Split into three small Client Components (rather than
 * building the `trigger` callbacks inline in page.tsx) because `trigger` is a
 * function prop — a Server Component can never hand a closure to a Client
 * Component, so the composition has to happen entirely on this side of the
 * boundary (same rule buildCrmNav's docstring calls out for icon components).
 * page.tsx only ever passes these plain, serializable data.
 */

export function QuickAddLeadCard({
  companies,
  count,
}: {
  companies: CompanyOption[];
  count: number;
}) {
  return (
    <AddContactDialog
      companies={companies}
      trigger={(open) => (
        <StatButton
          label="New leads · 7d"
          value={String(count)}
          cta="Quick add"
          icon={<IconPlus width={14} height={14} />}
          onClick={open}
        />
      )}
    />
  );
}

export function QuickAddTaskCard({
  accounts,
  contacts,
  reps,
  canAssignOthers,
  currentUser,
  count,
}: {
  accounts: TaskAccountOption[];
  contacts: TaskContactOption[];
  reps: RepOption[];
  canAssignOthers: boolean;
  currentUser: { id: string; label: string };
  count: number;
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
        <StatButton
          label="Open tasks"
          value={String(count)}
          cta="Quick task"
          icon={<IconTasks width={14} height={14} />}
          onClick={open}
        />
      )}
    />
  );
}

export function QuickLogCallCard({
  accounts,
  contacts,
  count,
}: {
  accounts: CompanyOption[];
  contacts: TaskContactOption[];
  count: number;
}) {
  return (
    <QuickLogCallDialog
      accounts={accounts}
      contacts={contacts}
      trigger={(open) => (
        <StatButton
          label="Calls · 7d"
          value={String(count)}
          cta="Quick log"
          icon={<IconPhone width={14} height={14} />}
          onClick={open}
        />
      )}
    />
  );
}
