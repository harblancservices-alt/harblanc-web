"use client";

import { BTN_NEUTRAL } from "../../_shell/ui";
import { ContactDialog, type ContactDefaults } from "../../accounts/[id]/ContactDialog";
import { TaskDialog, type TaskContactOption } from "../../tasks/TaskDialog";
import type { RepOption } from "../../accounts/CompanyDialog";

/**
 * Dialog-with-trigger actions on the contact profile — thin client wrappers
 * so the server-rendered page can drop them in without handing a render-prop
 * closure across the Server->Client boundary (crashed prod twice before on
 * this codebase — see crm-rsc-trigger-boundary-rule). Log call/Delete moved
 * to ContactMoreMenu.tsx and Call/Email moved to ContactHeader.tsx in the
 * surface-4 rebuild; this file now only carries Edit (header) and the Tasks
 * card's "+ Add task" trigger.
 */
export function EditContactButton({
  accountId,
  defaults,
}: {
  accountId: string | null;
  defaults: ContactDefaults & { id: string };
}) {
  if (!accountId) return null;
  return (
    <ContactDialog
      accountId={accountId}
      mode="edit"
      defaults={defaults}
      trigger={(open) => (
        <button
          type="button"
          onClick={open}
          className={`inline-flex h-11 items-center gap-1.5 rounded-lg px-3.5 text-[13px] font-semibold transition-colors ${BTN_NEUTRAL}`}
        >
          Edit
        </button>
      )}
    />
  );
}

export function AddTaskButton({
  accountId,
  contactOptions,
  reps,
  canAssignOthers,
  currentUser,
  defaultContactId,
}: {
  accountId: string | null;
  contactOptions: TaskContactOption[];
  reps: RepOption[];
  canAssignOthers: boolean;
  currentUser: { id: string; label: string };
  defaultContactId: string;
}) {
  if (!accountId) return null;
  return (
    <TaskDialog
      mode="create"
      accountId={accountId}
      contacts={contactOptions}
      reps={reps}
      canAssignOthers={canAssignOthers}
      currentUser={currentUser}
      defaults={{ contact_id: defaultContactId }}
      trigger={(open) => (
        <button
          type="button"
          onClick={open}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${BTN_NEUTRAL}`}
        >
          + Add task
        </button>
      )}
    />
  );
}
