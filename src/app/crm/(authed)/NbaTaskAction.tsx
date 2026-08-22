"use client";

import { TaskDialog, type TaskDefaults, type TaskContactOption } from "./tasks/TaskDialog";
import type { RepOption } from "./accounts/CompanyDialog";

/**
 * The task-creation half of a Next Best Action row's FOLLOW UP/RESEARCH pill
 * (CRM_TASK_INTEGRATION_AUDIT.md Phase 5) — opens the same TaskDialog every
 * other task entry point uses, pre-filled and still editable, instead of the
 * pill's previous bare navigation to the company profile.
 *
 * Takes reps/contacts/currentUser as plain props from the Dashboard's own
 * already-fetched rosters (NextBestActionSection.tsx is a Server Component
 * rendering this Client Component with only serializable data — never a
 * function prop, so this doesn't cross the RSC boundary that's bitten this
 * page before). Deliberately NOT TaskOfferButton: that component fetches its
 * own options per-mount, which is fine for a one-off post-action offer but
 * would mean one redundant network round-trip PER ROW here, since the
 * Dashboard can render dozens of these at once.
 */
export function NbaTaskAction({
  label,
  defaults,
  contacts,
  reps,
  canAssignOthers,
  currentUser,
  className,
}: {
  label: string;
  defaults: TaskDefaults;
  contacts: TaskContactOption[];
  reps: RepOption[];
  canAssignOthers: boolean;
  currentUser: { id: string; label: string };
  className: string;
}) {
  const scopedContacts = defaults.account_id
    ? contacts.filter((c) => c.accountId === defaults.account_id)
    : contacts;
  const resolvedDefaults: TaskDefaults = {
    ...defaults,
    assigned_user_id: defaults.assigned_user_id ?? currentUser.id,
  };

  return (
    <TaskDialog
      mode="create"
      accountId={defaults.account_id ?? undefined}
      contacts={scopedContacts}
      reps={reps}
      canAssignOthers={canAssignOthers}
      currentUser={currentUser}
      defaults={resolvedDefaults}
      trigger={(open) => (
        <button type="button" onClick={open} className={className}>
          {label}
        </button>
      )}
    />
  );
}
