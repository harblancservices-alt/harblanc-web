"use client";

import { BTN_ACTION } from "../../_shell/ui";
import { IconPlus, IconTasks } from "../../_shell/icons";
import type { RepOption } from "../CompanyDialog";
import { TaskDialog, type TaskContactOption } from "../../tasks/TaskDialog";
import { TaskRow, type CrmTaskItem } from "../../tasks/TaskRow";

/**
 * The center panel's "Tasks" tab — per-account task management (open/
 * completed, add/edit/complete/snooze/delete). Trimmed from the old
 * TasksSection.tsx it replaces: no Log call/Add person slots in the header
 * (those live in the Contacts tab and top-bar More menu now) — just Add task.
 *
 * Delete used to be an inline pill this component owned, passed into TaskRow
 * through a `children` slot. The Style-C card owns Delete itself now (in its
 * ⋯ menu, behind the shared confirm Modal), so this is back to a plain list —
 * no delete handler, no router.refresh(), no local pending/error state.
 */
export function TasksTab({
  accountId,
  tasks,
  reps,
  contacts,
  canAssignOthers,
  currentUser,
}: {
  accountId: string;
  tasks: CrmTaskItem[];
  reps: RepOption[];
  contacts: TaskContactOption[];
  canAssignOthers: boolean;
  currentUser: { id: string; label: string };
}) {
  const open = tasks.filter((t) => t.status !== "completed");
  const done = tasks.filter((t) => t.status === "completed");

  return (
    <div>
      <div className="flex items-center justify-between gap-3 px-5 py-3">
        <p className="text-[13px] font-bold text-fg">{open.length ? `${open.length} open` : "Tasks"}</p>
        <TaskDialog
          accountId={accountId}
          mode="create"
          reps={reps}
          contacts={contacts}
          canAssignOthers={canAssignOthers}
          currentUser={currentUser}
          trigger={(openDialog) => (
            <button type="button" onClick={openDialog} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${BTN_ACTION}`}>
              <IconPlus width={14} height={14} />
              Add task
            </button>
          )}
        />
      </div>

      {tasks.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
          <span className="flex h-11 w-11 items-center justify-center bg-inset text-fg-subtle">
            <IconTasks />
          </span>
          <p className="text-[14px] font-semibold text-fg">No tasks yet</p>
          <p className="max-w-xs text-[13px] text-fg-muted">Add a follow-up, a call-back, or a next step.</p>
        </div>
      ) : (
        <>
          <ul className="grid max-h-[640px] grid-cols-1 items-start gap-2 overflow-y-auto px-3 pb-3 sm:grid-cols-2 lg:grid-cols-3">
            {open.map((t) => (
              <TaskRow key={t.id} task={t} accountId={accountId} reps={reps} contacts={contacts} canAssignOthers={canAssignOthers} currentUser={currentUser} />
            ))}
          </ul>
          {done.length > 0 && (
            <details className="border-t border-line-strong">
              <summary className="cursor-pointer list-none px-4 py-2.5 text-[12px] font-semibold text-fg-subtle transition-colors hover:text-fg">
                {done.length} completed
              </summary>
              <ul className="grid max-h-[480px] grid-cols-1 items-start gap-2 overflow-y-auto border-t border-line-strong p-3 sm:grid-cols-2 lg:grid-cols-3">
                {done.map((t) => (
                  <TaskRow key={t.id} task={t} accountId={accountId} reps={reps} contacts={contacts} canAssignOthers={canAssignOthers} currentUser={currentUser} />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
