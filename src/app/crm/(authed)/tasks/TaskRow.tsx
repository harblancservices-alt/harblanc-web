"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDateTime } from "../_shell/format";
import { priorityLabel, priorityTone } from "./priority";
import { completeTask, reopenTask } from "./actions";

export type CrmTaskItem = {
  id: string;
  title: string;
  notes: string | null;
  due_at: string | null;
  priority: string | null;
  status: string;
  completed_at: string | null;
  reminder_at: string | null;
  account_id: string | null;
  assigned_user_id: string | null;
  companyName: string | null;
};

/**
 * One task row with an inline complete/reopen checkbox — shared by the global
 * Tasks page and the company Tasks section. A `showCompany` link ties a task
 * back to its company on the global list; on a profile it's hidden. Trailing
 * `children` (e.g. an Edit trigger) render on the right.
 */
export function TaskRow({
  task,
  showCompany,
  children,
}: {
  task: CrmTaskItem;
  showCompany?: boolean;
  children?: ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const done = task.status === "completed";
  const [optimisticDone, setOptimisticDone] = useState(done);

  function toggle() {
    const next = !optimisticDone;
    setOptimisticDone(next);
    startTransition(async () => {
      const res = next ? await completeTask(task.id) : await reopenTask(task.id);
      if (res.ok) router.refresh();
      else setOptimisticDone(!next);
    });
  }

  const overdue =
    !optimisticDone && task.due_at ? new Date(task.due_at).getTime() < Date.now() : false;

  return (
    <li className="flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-inset">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={optimisticDone}
        aria-label={optimisticDone ? "Reopen task" : "Complete task"}
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors disabled:opacity-60 ${
          optimisticDone
            ? "border-ok bg-ok text-white"
            : "border-line-strong bg-card text-transparent hover:border-accent"
        }`}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12l5 5 9-11" />
        </svg>
      </button>

      <div className="min-w-0 flex-1">
        <p
          className={`text-[14px] font-medium ${
            optimisticDone ? "text-fg-subtle line-through" : "text-fg"
          }`}
        >
          {task.title}
        </p>
        {task.notes && (
          <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-relaxed text-fg-muted">
            {task.notes}
          </p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ${priorityTone(task.priority)}`}
          >
            {priorityLabel(task.priority)}
          </span>
          {task.due_at && (
            <span className={overdue ? "font-semibold text-bad" : "text-fg-subtle"}>
              Due {formatDateTime(task.due_at)}
            </span>
          )}
          {showCompany && task.account_id && (
            <>
              <span className="text-fg-subtle">·</span>
              <Link
                href={`/crm/accounts/${task.account_id}`}
                prefetch={false}
                className="font-medium text-accent hover:underline"
              >
                {task.companyName || "Company"}
              </Link>
            </>
          )}
        </div>
      </div>

      {children && <div className="shrink-0">{children}</div>}
    </li>
  );
}
