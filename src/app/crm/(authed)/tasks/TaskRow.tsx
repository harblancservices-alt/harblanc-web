"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClickableListItem } from "../_shell/ClickableRow";
import { centralDayRange, timestampMs } from "../_shell/format";
import { DueCountdown } from "../_shell/DueCountdown";
import { digitsForTel } from "../_shell/contactFields";
import { priorityLabel, priorityTone } from "./priority";
import { TASK_TYPE_CHIP_TONE } from "./taskType";
import { completeTask, reopenTask } from "./actions";
import {
  TaskDialog,
  type TaskAccountOption,
  type TaskContactOption,
} from "./TaskDialog";
import type { RepOption } from "../accounts/CompanyDialog";
import { BTN_EDIT, BTN_NEUTRAL, BTN_SUCCESS, BTN_WARNING } from "../_shell/ui";

export type CrmTaskItem = {
  id: string;
  title: string;
  notes: string | null;
  task_type?: string | null;
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
  /** First phone number for the linked contact (or the company, as a
   * fallback) — drives the action row's "Call" button for call-type tasks.
   * Same `parsePhones(...)[0]?.number || phone` resolution used everywhere
   * else in the CRM a single "best" number is needed. */
  contactPhone?: string | null;
  companyPhone?: string | null;
  /** crm_contacts.email — there's no equivalent column on crm_accounts, so
   * the "Email" action only ever appears when a contact is linked. */
  contactEmail?: string | null;
};

/** Task-type substring rules deciding which context action (Call/Email) an
 * action row offers — matches the vocabulary in taskType.ts (e.g. "Cold
 * call", "Voicemail follow-up" vs. "Follow-up email", "Send email") without
 * needing a second lookup table kept in sync with TASK_TYPES. */
function contextAction(
  task: CrmTaskItem,
): { kind: "call"; href: string } | { kind: "email"; href: string } | null {
  const type = (task.task_type ?? "").toLowerCase();
  if (type.includes("email")) {
    return task.contactEmail ? { kind: "email", href: `mailto:${task.contactEmail}` } : null;
  }
  if (type.includes("call") || type.includes("voicemail")) {
    const phone = task.contactPhone || task.companyPhone;
    return phone ? { kind: "call", href: `tel:${digitsForTel(phone)}` } : null;
  }
  return null;
}

type DueBucket = "overdue" | "today" | "later" | "none";

function dueBucket(task: CrmTaskItem, done: boolean): DueBucket {
  const ms = timestampMs(task.due_at);
  if (ms === null) return "none";
  if (done) return "later";
  const { startMs, endMs } = centralDayRange();
  if (ms < startMs) return "overdue";
  if (ms <= endMs) return "today";
  return "later";
}

const URGENCY_BAR: Record<DueBucket, string> = {
  overdue: "bg-bad",
  today: "bg-warn",
  later: "bg-line-strong",
  none: "bg-line-strong",
};

const ACTION_BTN =
  "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-60";

/**
 * One task CARD — a left urgency bar (red overdue / amber due-today / gray
 * later-or-none), title + type chip, company · contact, a due/assignee/
 * priority line, and an action row (Done, a task_type-driven Call or Email,
 * Reschedule, Edit). Shared by the dashboard Tasks section, the global Tasks
 * page, and the company profile's Tasks section — every caller passes the
 * same dialog data (reps/contacts/canAssignOthers/currentUser) it already
 * loads for its own "Add task" entry point, so Edit/Reschedule reuse the
 * exact same TaskDialog + actions rather than duplicating a second form.
 */
export function TaskRow({
  task,
  showCompany,
  linkTo,
  reps,
  contacts,
  canAssignOthers,
  currentUser,
  accountId,
  accounts,
  children,
}: {
  task: CrmTaskItem;
  showCompany?: boolean;
  /** Makes the whole card navigate there on click (the dashboard's queue —
   * the task's company profile, or /crm/tasks when it has none). Nested
   * interactive elements (buttons, links) still work normally. */
  linkTo?: string;
  reps: RepOption[];
  contacts: TaskContactOption[];
  canAssignOthers: boolean;
  currentUser: { id: string; label: string };
  /** Fixed company context for the edit dialog (company-profile usage). */
  accountId?: string;
  /** Company picker options for the edit dialog (dashboard/global usage,
   * where a task's company isn't fixed). */
  accounts?: TaskAccountOption[];
  /** Extra trailing action (e.g. Delete) appended to the action row. */
  children?: ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const done = task.status === "completed";
  const [optimisticDone, setOptimisticDone] = useState(done);
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    const next = !optimisticDone;
    setError(null);
    setOptimisticDone(next);
    startTransition(async () => {
      const res = next ? await completeTask(task.id) : await reopenTask(task.id);
      if (res.ok) router.refresh();
      else {
        setOptimisticDone(!next);
        setError(res.error);
      }
    });
  }

  const bucket = dueBucket(task, optimisticDone);
  const context = contextAction(task);

  const cardContent = (
    <div className="flex min-w-0 flex-1 items-stretch gap-3">
      <span aria-hidden className={`w-1 shrink-0 ${URGENCY_BAR[bucket]}`} />

      <div className="min-w-0 flex-1 py-3 pr-3">
        <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
          <p
            className={`text-[14.5px] font-semibold ${
              optimisticDone ? "text-fg-subtle line-through" : "text-fg"
            }`}
          >
            {task.title}
          </p>
          {task.task_type && (
            <span
              className={`inline-flex items-center px-2 py-0.5 text-[10.5px] font-semibold ${TASK_TYPE_CHIP_TONE}`}
            >
              {task.task_type}
            </span>
          )}
        </div>

        {(showCompany && task.account_id) || task.contactName ? (
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-fg-subtle">
            {showCompany && task.account_id && (
              <Link
                href={`/crm/accounts/${task.account_id}`}
                prefetch={false}
                className="font-medium text-accent hover:underline"
              >
                {task.companyName || "Company"}
              </Link>
            )}
            {showCompany && task.account_id && task.contactName && <span>·</span>}
            {task.contactName && <span>{task.contactName}</span>}
          </p>
        ) : null}

        {task.notes && (
          <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-fg-muted">
            {task.notes}
          </p>
        )}

        {error && <p className="mt-1 text-[12px] text-bad">{error}</p>}

        <div className="mt-1.5 flex flex-wrap items-start gap-x-3 gap-y-1.5 text-[12.5px]">
          <DueCountdown iso={task.due_at} />
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1">
            {task.assigneeName && <span className="text-fg-subtle">{task.assigneeName}</span>}
            <span
              className={`inline-flex items-center px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ${priorityTone(task.priority)}`}
            >
              {priorityLabel(task.priority)}
            </span>
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={toggle}
            disabled={pending}
            className={`${ACTION_BTN} ${optimisticDone ? BTN_NEUTRAL : BTN_SUCCESS}`}
          >
            {optimisticDone ? "Reopen" : "Done"}
          </button>

          {context && (
            <a
              href={context.href}
              onClick={(e) => e.stopPropagation()}
              className={`${ACTION_BTN} ${BTN_EDIT}`}
            >
              {context.kind === "call" ? "Call" : "Email"}
            </a>
          )}

          <TaskDialog
            mode="edit"
            accountId={accountId}
            accounts={accounts}
            contacts={contacts}
            reps={reps}
            canAssignOthers={canAssignOthers}
            currentUser={currentUser}
            defaults={task}
            initialFocus="due_at"
            trigger={(open) => (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  open();
                }}
                className={`${ACTION_BTN} ${BTN_WARNING}`}
              >
                {task.due_at ? "Reschedule" : "Set due date"}
              </button>
            )}
          />

          <TaskDialog
            mode="edit"
            accountId={accountId}
            accounts={accounts}
            contacts={contacts}
            reps={reps}
            canAssignOthers={canAssignOthers}
            currentUser={currentUser}
            defaults={task}
            trigger={(open) => (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  open();
                }}
                className={`${ACTION_BTN} ${BTN_EDIT}`}
              >
                Edit
              </button>
            )}
          />

          {children}
        </div>
      </div>
    </div>
  );

  const cardClass =
    "relative flex overflow-hidden border border-line-strong bg-card shadow-e1";

  if (linkTo) {
    return (
      <ClickableListItem
        href={linkTo}
        className={`${cardClass} hover:border-accent/40`}
      >
        {cardContent}
      </ClickableListItem>
    );
  }

  return <li className={cardClass}>{cardContent}</li>;
}
