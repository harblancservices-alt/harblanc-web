"use client";

import { TaskDialog, type TaskAccountOption, type TaskContactOption } from "./TaskDialog";
import type { RepOption } from "../accounts/CompanyDialog";
import { IconPlus } from "../_shell/icons";

/**
 * Client-side trigger wrapper for the standalone TaskDialog — mirrors
 * AddCompany.tsx/AddDealButton.tsx's pattern. tasks/page.tsx (a Server
 * Component) can't pass a plain closure across the client boundary as
 * TaskDialog's `trigger` render prop, so the button has to be built here.
 */
export function AddTaskButton({
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
        <button
          type="button"
          onClick={open}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-accent-hover"
        >
          <IconPlus width={16} height={16} />
          Add task
        </button>
      )}
    />
  );
}
