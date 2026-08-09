"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BTN_DANGER, BTN_ACTION } from "../../_shell/ui";
import { IconPlus, IconTasks } from "../../_shell/icons";
import type { RepOption } from "../CompanyDialog";
import { TaskDialog, type TaskContactOption } from "../../tasks/TaskDialog";
import { TaskRow, type CrmTaskItem } from "../../tasks/TaskRow";
import { deleteTask } from "../../tasks/actions";

/**
 * The center panel's "Tasks" tab — reintroduces per-account task management
 * (open/completed, add/edit/complete/delete), which the first pass of this
 * rebuild had dropped from the page entirely. Trimmed from the old
 * TasksSection.tsx it replaces: no Log call/Add person slots in the header
 * (those live in the Contacts tab and top-bar More menu now) — just Add task.
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
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const open = tasks.filter((t) => t.status !== "completed");
  const done = tasks.filter((t) => t.status === "completed");

  function remove(task: CrmTaskItem) {
    if (!window.confirm(`Delete "${task.title}"?`)) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteTask(task.id, accountId);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

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

      {error && <p className="px-5 pb-2 text-[12.5px] text-bad">{error}</p>}

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
          <ul className="grid max-h-[420px] grid-cols-1 items-start gap-2 overflow-y-auto px-3 pb-3 sm:grid-cols-2">
            {open.map((t) => (
              <TaskRow key={t.id} task={t} accountId={accountId} reps={reps} contacts={contacts} canAssignOthers={canAssignOthers} currentUser={currentUser}>
                <button type="button" onClick={() => remove(t)} disabled={pending} className={`inline-flex items-center rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${BTN_DANGER}`}>
                  Delete
                </button>
              </TaskRow>
            ))}
          </ul>
          {done.length > 0 && (
            <details className="border-t border-line-strong">
              <summary className="cursor-pointer list-none px-4 py-2.5 text-[12px] font-semibold text-fg-subtle transition-colors hover:text-fg">
                {done.length} completed
              </summary>
              <ul className="grid max-h-[320px] grid-cols-1 items-start gap-2 overflow-y-auto border-t border-line-strong p-3 sm:grid-cols-2">
                {done.map((t) => (
                  <TaskRow key={t.id} task={t} accountId={accountId} reps={reps} contacts={contacts} canAssignOthers={canAssignOthers} currentUser={currentUser}>
                    <button type="button" onClick={() => remove(t)} disabled={pending} className={`inline-flex items-center rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${BTN_DANGER}`}>
                      Delete
                    </button>
                  </TaskRow>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
