"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClickableListItem } from "../_shell/ClickableRow";
import { centralDayRange, timestampMs, formatDateTime, dueCountdown } from "../_shell/format";
import { digitsForTel } from "../_shell/contactFields";
import { formatPhone } from "@/lib/domain/phone";
import { normalizePriority } from "./priority";
import { TASK_TYPE_CHIP_TONE } from "./taskType";
import { completeTask, reopenTask } from "./actions";
import {
  TaskDialog,
  type TaskAccountOption,
  type TaskContactOption,
} from "./TaskDialog";
import type { RepOption } from "../accounts/CompanyDialog";
import { IconCheck } from "../_shell/icons";
import { BTN_ACTION, BTN_NEUTRAL } from "../_shell/ui";

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
   * — now every surface (dashboard, global Tasks, company profile) resolves
   * it, since the shared card always shows a linked contact + its phone. */
  contact_id?: string | null;
  contactName?: string | null;
  /** crm_contacts.title (free-text job title) — rendered next to the
   * contact's name, e.g. "Dave Kowalski · Purchasing". */
  contactTitle?: string | null;
  /** Every task list resolves this (dashboard, global Tasks, company
   * profile) — tasks are shared org-wide, not per-user, so the row always
   * needs to show who actually owns the task. */
  assigneeName?: string | null;
  /** First phone number for the linked contact (or the company, as a
   * fallback) — drives the meta row's PHONE readout and the action row's
   * Call button for call-type tasks. Same `parsePhones(...)[0]?.number ||
   * phone` resolution used everywhere else in the CRM a single "best"
   * number is needed. */
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

type UrgencyBucket = "overdue" | "today" | "upcoming" | "done";

/** Rail/meta urgency bucket — a simpler 4-way split than the countdown pill
 * below (no "no due date" state of its own; an undated open task reads as
 * "upcoming" blue, same as a far-future one) since the rail/meta-row only
 * needs a color, not a message. */
function urgencyBucket(task: CrmTaskItem, done: boolean): UrgencyBucket {
  if (done) return "done";
  const ms = timestampMs(task.due_at);
  if (ms === null) return "upcoming";
  const { startMs, endMs } = centralDayRange();
  if (ms < startMs) return "overdue";
  if (ms <= endMs) return "today";
  return "upcoming";
}

/** Left rail color — literal hex per the approved mockup (distinct from the
 * app's --bad/--warn/--ok design tokens, which are close but not identical). */
const RAIL_COLOR: Record<UrgencyBucket, string> = {
  overdue: "bg-[#b91c1c]",
  today: "bg-[#b45309]",
  upcoming: "bg-[#2563eb]",
  done: "bg-[#15803d]",
};

const DUE_TEXT_COLOR: Record<UrgencyBucket, string> = {
  overdue: "text-bad",
  today: "text-warn",
  upcoming: "text-accent",
  done: "text-ok",
};

/** Compact urgency pill label ("OVERDUE 1d" / "TODAY" / "TOMORROW" /
 * "IN 2 DAYS") — reuses dueCountdown's tone/wording, reshaped to the short
 * all-caps style of the mockup's pill (only the leading word gets forced
 * caps for the overdue case, so "1d"/"3h" stay lowercase per the spec). */
function urgencyPill(task: CrmTaskItem, done: boolean): { label: string; tone: "danger" | "warning" | "accent" } | null {
  if (done) return null;
  const { text, tone } = dueCountdown(task.due_at);
  if (tone === "muted") return null;
  if (tone === "danger") return { label: text.replace(/^\S+/, (w) => w.toUpperCase()), tone };
  if (tone === "warning") return { label: text === "Tomorrow" ? "TOMORROW" : "TODAY", tone };
  return { label: text.toUpperCase(), tone };
}

const URGENCY_PILL_TONE: Record<"danger" | "warning" | "accent", string> = {
  danger: "bg-bad-bg text-bad",
  warning: "bg-warn-bg text-warn",
  accent: "bg-accent/10 text-accent",
};

/** Type pill color — Call/voicemail tasks read blue, email neutral, a bare
 * "follow-up" (no call/email keyword) neutral/purple, everything else the
 * shared neutral chip tone. */
function typePillTone(taskType: string | null | undefined): string {
  const t = (taskType ?? "").toLowerCase();
  if (t.includes("call") || t.includes("voicemail")) return "bg-[#2563eb]/10 text-[#2563eb]";
  if (t.includes("email")) return TASK_TYPE_CHIP_TONE;
  if (t.includes("follow")) return "bg-violet-100 text-violet-700";
  return TASK_TYPE_CHIP_TONE;
}

const PILL = "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold";

const ACTION_BTN =
  "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-60";

/** Light-blue action tone (Reschedule, and the Call/Email context action) —
 * distinct from BTN_ACTION's solid fill (Done) and BTN_NEUTRAL's light
 * neutral (Edit), matching the mockup's three-tier action-row color scheme. */
const BTN_LIGHT_BLUE =
  "border border-[#2563eb]/30 bg-[#2563eb]/10 text-[#2563eb] hover:bg-[#2563eb]/20 disabled:opacity-60";

/**
 * One task CARD — the shared "H1" layout (Brent's approved mockup): a left
 * urgency rail, a big tappable complete circle, title + type/priority/
 * urgency pills, company + contact (both linking to their profiles), a
 * divider, a due/phone-or-rep meta row, and a pill action row (Done,
 * Reschedule, Edit, plus a task_type-driven Call/Email). Shared by the
 * dashboard's What's-next queue, the global Tasks page, and the company
 * profile's Tasks tab — every caller passes the same dialog data (reps/
 * contacts/canAssignOthers/currentUser) it already loads for its own "Add
 * task" entry point, so Edit/Reschedule reuse the exact same TaskDialog +
 * actions rather than duplicating a second form.
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

  const bucket = urgencyBucket(task, optimisticDone);
  const pill = urgencyPill(task, optimisticDone);
  const context = contextAction(task);
  const isHighPriority = normalizePriority(task.priority) === "high";
  const phone = task.contactPhone || task.companyPhone || null;

  const hasCompanyOrContact = (showCompany && task.account_id) || task.contactName;

  const cardContent = (
    <div className="flex min-w-0 flex-1 items-stretch gap-0">
      <span aria-hidden className={`w-1.5 shrink-0 ${RAIL_COLOR[bucket]}`} />

      <div className="flex min-w-0 flex-1 gap-3 p-3">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
          disabled={pending}
          aria-label={optimisticDone ? "Reopen task" : "Mark task complete"}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 transition-colors disabled:opacity-60 ${
            optimisticDone
              ? "border-[#15803d] bg-[#15803d] text-white"
              : "border-line-strong bg-card text-transparent hover:border-[#2563eb]"
          }`}
        >
          {optimisticDone && <IconCheck width={18} height={18} />}
        </button>

        <div className="min-w-0 flex-1">
          <p
            className={`text-[14.5px] font-bold ${
              optimisticDone ? "text-fg-subtle line-through" : "text-fg"
            }`}
          >
            {task.title}
          </p>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {task.task_type && (
              <span className={`${PILL} ${typePillTone(task.task_type)}`}>{task.task_type}</span>
            )}
            {isHighPriority && <span className={`${PILL} bg-warn-bg text-warn`}>HIGH</span>}
            {pill && <span className={`${PILL} ${URGENCY_PILL_TONE[pill.tone]}`}>{pill.label}</span>}
          </div>

          {hasCompanyOrContact ? (
            <div className="mt-1.5 min-w-0">
              {showCompany && task.account_id && (
                <Link
                  href={`/crm/accounts/${task.account_id}`}
                  prefetch={false}
                  className="block truncate text-[13.5px] font-bold text-fg hover:underline"
                >
                  {task.companyName || "Company"}
                </Link>
              )}
              {task.contactName && (
                <Link
                  href={task.contact_id ? `/crm/contacts/${task.contact_id}` : "#"}
                  prefetch={false}
                  onClick={(e) => {
                    if (!task.contact_id) e.preventDefault();
                  }}
                  className={`block truncate text-[12.5px] font-semibold text-fg-muted ${
                    task.contact_id ? "hover:underline hover:text-fg" : ""
                  }`}
                >
                  {task.contactName}
                  {task.contactTitle ? ` · ${task.contactTitle}` : ""}
                </Link>
              )}
            </div>
          ) : null}

          {task.notes && (
            <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed text-fg-muted">
              {task.notes}
            </p>
          )}

          {error && <p className="mt-1.5 text-[12px] text-bad">{error}</p>}

          <div className="mt-2.5 grid grid-cols-2 gap-3 border-t border-line pt-2">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">Due</p>
              {task.due_at ? (
                <p className={`truncate text-[12.5px] font-semibold ${DUE_TEXT_COLOR[bucket]}`}>
                  {formatDateTime(task.due_at)}
                </p>
              ) : (
                <p className="text-[12.5px] text-fg-subtle">No due date</p>
              )}
            </div>
            <div className="min-w-0 text-right">
              {phone ? (
                <>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">Phone</p>
                  <a
                    href={`tel:${digitsForTel(phone)}`}
                    onClick={(e) => e.stopPropagation()}
                    className="truncate text-[12.5px] font-semibold text-accent hover:underline"
                  >
                    {formatPhone(phone)}
                  </a>
                </>
              ) : task.assigneeName ? (
                <>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">Rep</p>
                  <p className="truncate text-[12.5px] font-semibold text-fg">{task.assigneeName}</p>
                </>
              ) : null}
            </div>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggle();
              }}
              disabled={pending}
              className={`${ACTION_BTN} ${optimisticDone ? BTN_NEUTRAL : BTN_ACTION}`}
            >
              {optimisticDone ? "Reopen" : "Done"}
            </button>

            {context && (
              <a
                href={context.href}
                onClick={(e) => e.stopPropagation()}
                className={`${ACTION_BTN} ${BTN_LIGHT_BLUE}`}
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
                  className={`${ACTION_BTN} ${BTN_LIGHT_BLUE}`}
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
                  className={`${ACTION_BTN} ${BTN_NEUTRAL}`}
                >
                  Edit
                </button>
              )}
            />

            {children}
          </div>
        </div>
      </div>
    </div>
  );

  const cardClass = "relative flex overflow-hidden border border-line-strong bg-card shadow-e1";

  if (linkTo) {
    return (
      <ClickableListItem href={linkTo} className={`${cardClass} hover:border-accent/40`}>
        {cardContent}
      </ClickableListItem>
    );
  }

  return <li className={cardClass}>{cardContent}</li>;
}
