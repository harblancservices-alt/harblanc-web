"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDateTime, timestampMs } from "../_shell/format";
import { ClickableListItem } from "../_shell/ClickableRow";
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
  /** Optional: contact linkage is only resolved where a row needs to show it
   * (the global Tasks page and the company profile's Tasks section). Left
   * undefined on the dashboard queue rather than adding an extra query that
   * surface isn't asking for. */
  contact_id?: string | null;
  contactName?: string | null;
  /** Every task list resolves this (dashboard, global Tasks, company
   * profile) — tasks are shared org-wide, not per-user, so the row always
   * needs to show who actually owns the task. */
  assigneeName?: string | null;
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
  linkTo,
  children,
}: {
  task: CrmTaskItem;
  showCompany?: boolean;
  /** Makes the whole row navigate there on click (the dashboard's queue —
   * the task's company profile, or /crm/tasks when it has none). Nested
   * interactive elements (the checkbox, the company link, `children`) still
   * work normally. Omitted everywhere else (global Tasks page, company
   * profile) so this doesn't change those rows' existing behavior. */
  linkTo?: string;
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

  const dueMs = timestampMs(task.due_at);
  const overdue = !optimisticDone && dueMs !== null && dueMs < Date.now();

  const rowContent = (
    <>
      {overdue && (
        <span
          aria-hidden
          title="Past due"
          className="absolute left-1.5 top-1.5 h-2 w-2 shrink-0 rounded-full bg-bad"
        />
      )}
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
          {task.contactName && (
            <>
              <span className="text-fg-subtle">·</span>
              <span className="text-fg-subtle">{task.contactName}</span>
            </>
          )}
          {task.assigneeName && (
            <>
              <span className="text-fg-subtle">·</span>
              <span className="text-fg-subtle">
                Assigned: <span className="text-fg-muted">{task.assigneeName}</span>
              </span>
            </>
          )}
        </div>
      </div>

      {children && <div className="shrink-0">{children}</div>}
    </>
  );

  if (linkTo) {
    return (
      <ClickableListItem href={linkTo} className="relative flex items-start gap-3 px-5 py-3.5">
        {rowContent}
      </ClickableListItem>
    );
  }

  return (
    <li className="relative flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-fg/[0.04]">
      {rowContent}
    </li>
  );
}
