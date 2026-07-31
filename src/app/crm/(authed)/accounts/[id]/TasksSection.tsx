"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHead } from "../../_shell/ui";
import { IconPlus, IconTasks } from "../../_shell/icons";
import type { RepOption } from "../CompanyDialog";
import { TaskDialog, type TaskContactOption } from "../../tasks/TaskDialog";
import { TaskRow, type CrmTaskItem } from "../../tasks/TaskRow";
import { deleteTask } from "../../tasks/actions";

/**
 * Tasks on the company profile — add, edit, complete/reopen, and delete. Open
 * tasks show first, completed ones underneath. Add/edit route through the task
 * dialog (company fixed to this profile; contact offered from this company's
 * own roster); completion toggles inline via each row's checkbox. All writes
 * stamp org_id from the session and revalidate the dashboard + Tasks page.
 */
export function TasksSection({
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
  const router = useRouter();

  const open = tasks.filter((t) => t.status !== "completed");
  const done = tasks.filter((t) => t.status === "completed");

  function remove(task: CrmTaskItem) {
    if (!window.confirm(`Delete "${task.title}"?`)) return;
    startTransition(async () => {
      const res = await deleteTask(task.id, accountId);
      if (res.ok) router.refresh();
    });
  }

  function deleteAction(task: CrmTaskItem) {
    return (
      <button
        type="button"
        onClick={() => remove(task)}
        disabled={pending}
        className="inline-flex items-center rounded-lg border border-line-strong bg-card px-2.5 py-1.5 text-[12px] font-semibold text-fg-subtle transition-colors hover:bg-bad/10 hover:text-bad disabled:opacity-60"
      >
        Delete
      </button>
    );
  }

  return (
    <Card>
      <CardHead
        title="Tasks"
        hint={open.length ? `${open.length} open` : undefined}
        right={
          <TaskDialog
            accountId={accountId}
            mode="create"
            reps={reps}
            contacts={contacts}
            canAssignOthers={canAssignOthers}
            currentUser={currentUser}
            trigger={(openDialog) => (
              <button
                type="button"
                onClick={openDialog}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-accent-hover"
              >
                <IconPlus width={14} height={14} />
                Add task
              </button>
            )}
          />
        }
      />

      {tasks.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-inset text-fg-subtle">
            <IconTasks />
          </span>
          <p className="text-[14px] font-semibold text-fg">No tasks yet</p>
          <p className="max-w-xs text-[13px] text-fg-muted">
            Add a follow-up, a call-back, or a next step for this company.
          </p>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-2.5 p-3">
            {open.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                accountId={accountId}
                reps={reps}
                contacts={contacts}
                canAssignOthers={canAssignOthers}
                currentUser={currentUser}
              >
                {deleteAction(t)}
              </TaskRow>
            ))}
          </ul>
          {done.length > 0 && (
            <details className="border-t border-line-strong">
              <summary className="cursor-pointer list-none px-5 py-3 text-[12.5px] font-semibold text-fg-subtle transition-colors hover:text-fg">
                {done.length} completed
              </summary>
              <ul className="flex flex-col gap-2.5 border-t border-line-strong p-3">
                {done.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    accountId={accountId}
                    reps={reps}
                    contacts={contacts}
                    canAssignOthers={canAssignOthers}
                    currentUser={currentUser}
                  >
                    {deleteAction(t)}
                  </TaskRow>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </Card>
  );
}
