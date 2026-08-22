"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDateTime, dueCountdown } from "../_shell/format";
import { digitsForTel } from "../_shell/contactFields";
import { formatPhone } from "@/lib/domain/phone";
import { normalizePriority } from "./priority";
import { taskUrgencyBucket } from "@/lib/crm/taskUrgency";
import { TASK_TYPE_CHIP_TONE } from "./taskType";
import { SNOOZE_PRESETS } from "./snooze";
import { completeTask, reopenTask, snoozeTask, deleteTask } from "./actions";
import { LogCallDialog } from "../calls/LogCallDialog";
import { Modal } from "../_shell/Modal";
import { IconMore, IconPhone, IconMail, IconChevronDown } from "../_shell/icons";
import {
  TaskDialog,
  type TaskAccountOption,
  type TaskContactOption,
} from "./TaskDialog";
import type { RepOption } from "../accounts/CompanyDialog";
import {
  DEPTH_PRIMARY,
  DEPTH_SUCCESS,
  DEPTH_EDIT,
  DEPTH_WARNING,
  DEPTH_NEUTRAL,
  BTN_DANGER,
  BTN_NEUTRAL,
} from "../_shell/ui";

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
  /** Contact linkage. EVERY surface resolves these now — the card is
   * phone-first, so a surface that skips them produces a card with no primary
   * action at all. (The contact profile used to do exactly that; fixed in the
   * Style-C pass — see contacts/[contactId]/page.tsx.) */
  contact_id?: string | null;
  contactName?: string | null;
  /** crm_contacts.title (free-text job title) — the muted "role · company"
   * line under the name, e.g. "Purchasing · Blue Star Stamping". */
  contactTitle?: string | null;
  /** Tasks are shared org-wide, not per-user, so the card always names who
   * actually owns it. */
  assigneeName?: string | null;
  /** First phone for the linked contact (or the company, as a fallback) —
   * drives the big primary Call button. Same `parsePhones(...)[0]?.number ||
   * phone` resolution used everywhere else a single "best" number is needed. */
  contactPhone?: string | null;
  companyPhone?: string | null;
  /** crm_contacts.email — there's no equivalent column on crm_accounts, so an
   * Email action only ever appears when a contact is linked. */
  contactEmail?: string | null;
};

/* ─────────────────────────── urgency + tone ─────────────────────────── */

type UrgencyBucket = "overdue" | "today" | "upcoming" | "done";

/** Rail/chip urgency bucket — the shared overdue/today/upcoming split (see
 * lib/crm/taskUrgency.ts, also used by the global Tasks page's groups and the
 * dashboard's counters so all three agree) plus "done" on top. */
function urgencyBucket(task: CrmTaskItem, done: boolean): UrgencyBucket {
  if (done) return "done";
  return taskUrgencyBucket(task.due_at);
}

/** Left rail color. Semantic `.crm-light` tokens only — the pre-Style-C card
 * hard-coded four literal hexes here; those are gone. */
const RAIL_COLOR: Record<UrgencyBucket, string> = {
  overdue: "bg-bad",
  today: "bg-warn",
  upcoming: "bg-accent",
  done: "bg-ok",
};

const DUE_TEXT_COLOR: Record<UrgencyBucket, string> = {
  overdue: "text-bad",
  today: "text-warn",
  upcoming: "text-accent",
  done: "text-ok",
};

/** The single urgency chip — "OVERDUE 1d" / "DUE TODAY" / "TOMORROW" /
 * "IN 5 DAYS". Reuses dueCountdown's tone/wording, reshaped to the short
 * all-caps chip Style C calls for. */
function urgencyChip(
  task: CrmTaskItem,
  done: boolean,
): { label: string; tone: "danger" | "warning" | "accent" } | null {
  if (done) return null;
  const { text, tone } = dueCountdown(task.due_at);
  if (tone === "muted") return null;
  if (tone === "danger") return { label: text.replace(/^\S+/, (w) => w.toUpperCase()), tone };
  if (tone === "warning") return { label: text === "Tomorrow" ? "TOMORROW" : "DUE TODAY", tone };
  return { label: text.toUpperCase(), tone };
}

const CHIP_TONE: Record<"danger" | "warning" | "accent", string> = {
  danger: "bg-bad-bg text-bad",
  warning: "bg-warn-bg text-warn",
  accent: "bg-accent/10 text-accent",
};

const CHIP = "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold";

/** Type chip color. Call/voicemail reads accent — the same color as the big
 * Call button below it, so "this is a phone task" is one glance. A bare
 * "follow-up" (no call/email keyword) reads steel, everything else the shared
 * neutral chip tone. Semantic tokens only: the pre-Style-C card reached for a
 * literal `#2563eb` and Tailwind's stock violet-100/700 here. */
function typeChipTone(taskType: string | null | undefined): string {
  const t = (taskType ?? "").toLowerCase();
  if (t.includes("call") || t.includes("voicemail")) return "bg-accent/10 text-accent";
  if (t.includes("follow")) return "bg-steel-bg text-steel";
  return TASK_TYPE_CHIP_TONE;
}

/* ─────────────────────────── the primary action ─────────────────────────── */

type Primary =
  | { kind: "call"; label: string; href: string }
  | { kind: "email"; label: string; href: string }
  /** No reachable channel, but there IS someone to go fix that on — a muted
   * link to the profile rather than a dead card. */
  | { kind: "no-channel"; label: string; href: string }
  | null;

function firstWord(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/**
 * Style C's ONE big primary action.
 *
 * Deliberately much wider than the old contextAction it replaces, which only
 * matched a task_type containing "call"/"email" and therefore left "Send
 * quote", "Check-in", "Site visit", "Onboarding" and every untyped task with
 * NO action button at all — while the card sat there showing a clickable
 * number in its meta row (TASK_CARD_AUDIT.md §4.3). Now every task resolves
 * something:
 *
 *   1. An email-oriented task_type WITH an email on file  -> Email
 *   2. Any phone on file (contact's, else the company's)  -> Call
 *   3. An email on file                                   -> Email
 *   4. A linked contact/company but no channel            -> "Add a phone number"
 *   5. A standalone task with nothing linked              -> no primary
 *
 * Phone beats email at step 2 because this is a call card: a rep working a
 * list wants the number under their thumb unless the task explicitly says
 * otherwise. Whichever channel loses is still one tap away in the ⋯ menu.
 */
function primaryAction(task: CrmTaskItem): Primary {
  const type = (task.task_type ?? "").toLowerCase();
  const phone = task.contactPhone || task.companyPhone || null;
  const email = task.contactEmail || null;
  const who = task.contactName ? firstWord(task.contactName) : task.companyName || "them";

  if (type.includes("email") && email) {
    return { kind: "email", label: `Email ${who}`, href: `mailto:${email}` };
  }
  if (phone) {
    return { kind: "call", label: `Call ${formatPhone(phone)}`, href: `tel:${digitsForTel(phone)}` };
  }
  if (email) {
    return { kind: "email", label: `Email ${who}`, href: `mailto:${email}` };
  }
  if (task.contact_id) {
    return { kind: "no-channel", label: "Add a phone number", href: `/crm/contacts/${task.contact_id}` };
  }
  if (task.account_id) {
    return { kind: "no-channel", label: "Add a contact", href: `/crm/accounts/${task.account_id}` };
  }
  return null;
}

/** The Email action for the ⋯ menu — only when an email exists AND it isn't
 * already the big primary (no point offering the same thing twice). */
function secondaryEmail(task: CrmTaskItem, primary: Primary): { label: string; href: string } | null {
  if (!task.contactEmail) return null;
  if (primary?.kind === "email") return null;
  const who = task.contactName ? firstWord(task.contactName) : "contact";
  return { label: `Email ${who}`, href: `mailto:${task.contactEmail}` };
}

/* ─────────────────────────── shared button shapes ─────────────────────────── */

/** The one big top button. Full width, comfortable tap target on mobile. */
const PRIMARY_BTN =
  "flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-[13.5px] font-bold transition-colors max-lg:min-h-[46px]";

/** The three bottom buttons — equal width, same height, no visual hierarchy
 * between them (the hierarchy is the primary above). */
const ROW_BTN =
  "flex min-w-0 items-center justify-center gap-1 rounded-lg px-2 py-2 text-[12.5px] font-semibold transition-colors disabled:opacity-60 max-lg:min-h-[42px]";

const MENU_ITEM =
  "block w-full px-3.5 py-2.5 text-left text-[13px] font-semibold text-fg transition-colors hover:bg-inset disabled:opacity-60";

/* ─────────────────────────── the card ─────────────────────────── */

/**
 * One task CARD — Brent's approved Style C, the phone-first "call card":
 *
 *   type chip · urgency chip                       rep · ⋯
 *   Dave Kowalski                                  <- who you're calling
 *   Purchasing · Blue Star Stamping                <- role · company (accent link)
 *   Call about Q3 pricing                          <- the task itself
 *   notes (2 lines) · Due Aug 22, 9:00 AM CST
 *   [        Call (313) 555-0142        ]          <- ONE big primary
 *   [ Done ] [ Log call ] [ Snooze ▾ ]             <- exactly three
 *
 * Done state drops the primary entirely and collapses the bottom row to
 * Reopen + ⋯ — the old card kept Call/Reschedule/Edit/Delete live on finished
 * tasks, which is what made the Done section unreadable (TASK_CARD_AUDIT.md
 * §4.8).
 *
 * Everything else (Email when it isn't the primary, Reschedule, Edit, Delete)
 * lives in the ⋯ menu. Both dialogs the menu opens (TaskDialog for Reschedule/
 * Edit, the Modal for Delete) render OUTSIDE the conditionally-rendered menu
 * panel, driven through an `open` ref — Modal.tsx is not a portal, so a dialog
 * nested inside a panel that unmounts on click would never appear (the
 * modal-inside-hidden-popover bug this codebase has already shipped once).
 *
 * "use client" with only serializable props from every caller — no function
 * prop crosses a Server->Client boundary here (the RSC 500 this page has hit
 * three times before). Callers pass the same dialog rosters they already load
 * for their own "Add task" entry point.
 */
export function TaskRow({
  task,
  showCompany,
  reps,
  contacts,
  canAssignOthers,
  currentUser,
  accountId,
  accounts,
  className,
}: {
  task: CrmTaskItem;
  /** Show the company on the identity line. Off inside a company profile,
   * where naming it on every card is just noise. */
  showCompany?: boolean;
  /** Extra classes on the card's own <li> — the dashboard uses this for its
   * "top 4 on mobile" cap (`hidden lg:flex`), which has to be applied to the
   * list item itself, not a wrapper. */
  className?: string;
  reps: RepOption[];
  contacts: TaskContactOption[];
  canAssignOthers: boolean;
  currentUser: { id: string; label: string };
  /** Fixed company context for the edit dialog (company-profile usage). */
  accountId?: string;
  /** Company picker options for the edit dialog (dashboard/global usage,
   * where a task's company isn't fixed). */
  accounts?: TaskAccountOption[];
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const done = task.status === "completed";
  const [optimisticDone, setOptimisticDone] = useState(done);
  const [error, setError] = useState<string | null>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const snoozeRef = useRef<HTMLDivElement>(null);
  const openRescheduleRef = useRef<(() => void) | null>(null);
  const openEditRef = useRef<(() => void) | null>(null);

  // Close whichever popover is open on an outside click or Escape — the same
  // small-popover behavior every other CRM menu uses (CompanyMoreMenu et al).
  useEffect(() => {
    if (!menuOpen && !snoozeOpen) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(t)) setMenuOpen(false);
      if (snoozeRef.current && !snoozeRef.current.contains(t)) setSnoozeOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setSnoozeOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, snoozeOpen]);

  function toggleDone() {
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

  function snooze(preset: string) {
    setError(null);
    setSnoozeOpen(false);
    startTransition(async () => {
      const res = await snoozeTask(task.id, preset);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const res = await deleteTask(task.id, task.account_id);
      if (res.ok) {
        setConfirmDelete(false);
        router.refresh();
      } else {
        setConfirmDelete(false);
        setError(res.error);
      }
    });
  }

  const bucket = urgencyBucket(task, optimisticDone);
  const chip = urgencyChip(task, optimisticDone);
  const primary = primaryAction(task);
  const menuEmail = secondaryEmail(task, primary);
  const isHighPriority = normalizePriority(task.priority) === "high";

  const companyHref = task.account_id ? `/crm/accounts/${task.account_id}` : null;
  const showCompanyName = Boolean(showCompany && task.companyName && companyHref);

  const dialogProps = {
    accountId,
    accounts,
    contacts,
    reps,
    canAssignOthers,
    currentUser,
    defaults: task,
  };

  return (
    <li
      className={`relative overflow-hidden rounded-lg border border-line-strong bg-card shadow-e1 ${
        className ?? "flex"
      }`}
    >
      <span aria-hidden className={`w-1.5 shrink-0 ${RAIL_COLOR[bucket]}`} />

      <div className="min-w-0 flex-1 p-3">
        {/* ── Top line: type + one urgency chip, rep + ⋯ on the right ── */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {task.task_type && (
              <span className={`${CHIP} ${typeChipTone(task.task_type)}`}>{task.task_type}</span>
            )}
            {chip && <span className={`${CHIP} ${CHIP_TONE[chip.tone]}`}>{chip.label}</span>}
            {isHighPriority && <span className={`${CHIP} bg-bad-bg text-bad`}>HIGH</span>}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {task.assigneeName && (
              <span
                title={`Assigned to ${task.assigneeName}`}
                className="max-w-[84px] truncate rounded-full bg-inset px-2 py-0.5 text-[10.5px] font-semibold text-fg-muted"
              >
                {task.assigneeName}
              </span>
            )}

            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  setSnoozeOpen(false);
                  setMenuOpen((v) => !v);
                }}
                aria-label="More task actions"
                aria-expanded={menuOpen}
                className="flex h-7 w-7 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-inset hover:text-fg"
              >
                <IconMore width={16} height={16} />
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-full z-30 mt-1 w-48 overflow-hidden rounded-lg border border-line-strong bg-card shadow-e3">
                  {menuEmail && (
                    <a
                      href={menuEmail.href}
                      onClick={() => setMenuOpen(false)}
                      className={MENU_ITEM}
                    >
                      {menuEmail.label}
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      openRescheduleRef.current?.();
                    }}
                    className={`${MENU_ITEM} ${menuEmail ? "border-t border-line-strong" : ""}`}
                  >
                    {task.due_at ? "Reschedule…" : "Set due date…"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      openEditRef.current?.();
                    }}
                    className={`${MENU_ITEM} border-t border-line-strong`}
                  >
                    Edit task…
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setConfirmDelete(true);
                    }}
                    className="block w-full border-t border-line-strong px-3.5 py-2.5 text-left text-[13px] font-semibold text-bad transition-colors hover:bg-bad-bg"
                  >
                    Delete task
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Who: name prominent, then role · company muted ── */}
        {task.contactName ? (
          <div className="mt-1.5 min-w-0">
            {task.contact_id ? (
              <Link
                href={`/crm/contacts/${task.contact_id}`}
                prefetch={false}
                className="block truncate text-[15px] font-bold text-fg hover:underline"
              >
                {task.contactName}
              </Link>
            ) : (
              <p className="truncate text-[15px] font-bold text-fg">{task.contactName}</p>
            )}
            {(task.contactTitle || showCompanyName) && (
              <p className="truncate text-[12.5px] font-medium text-fg-muted">
                {task.contactTitle}
                {task.contactTitle && showCompanyName ? " · " : ""}
                {showCompanyName && companyHref && (
                  <Link href={companyHref} prefetch={false} className="text-accent hover:underline">
                    {task.companyName}
                  </Link>
                )}
              </p>
            )}
          </div>
        ) : showCompanyName && companyHref ? (
          <div className="mt-1.5 min-w-0">
            <Link
              href={companyHref}
              prefetch={false}
              className="block truncate text-[15px] font-bold text-fg hover:underline"
            >
              {task.companyName}
            </Link>
            <p className="truncate text-[12.5px] font-medium text-fg-muted">No contact linked</p>
          </div>
        ) : null}

        {/* ── What: the task itself ── */}
        <p
          className={`mt-1.5 text-[13.5px] font-semibold ${
            optimisticDone ? "text-fg-subtle line-through" : "text-fg"
          }`}
        >
          {task.title}
        </p>

        {task.notes && (
          <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-fg-muted">{task.notes}</p>
        )}

        <p className="mt-1 text-[11.5px] font-semibold">
          {task.due_at ? (
            <span className={DUE_TEXT_COLOR[bucket]}>Due {formatDateTime(task.due_at)}</span>
          ) : (
            <span className="text-fg-muted">No due date</span>
          )}
        </p>

        {error && <p className="mt-1.5 text-[12px] text-bad">{error}</p>}

        {/* ── ONE big primary action (open tasks only) ── */}
        {!optimisticDone && primary && (
          <a
            href={primary.href}
            className={`mt-2.5 ${PRIMARY_BTN} ${
              primary.kind === "no-channel" ? DEPTH_NEUTRAL : DEPTH_PRIMARY
            }`}
          >
            {primary.kind === "call" && <IconPhone width={15} height={15} />}
            {primary.kind === "email" && <IconMail width={15} height={15} />}
            <span className="truncate">{primary.label}</span>
          </a>
        )}

        {/* ── Bottom row: exactly three (open) / Reopen only (done) ── */}
        <div className={`mt-2 grid gap-1.5 ${optimisticDone ? "grid-cols-1" : "grid-cols-3"}`}>
          <button
            type="button"
            onClick={toggleDone}
            disabled={pending}
            className={`${ROW_BTN} ${optimisticDone ? DEPTH_NEUTRAL : DEPTH_SUCCESS}`}
          >
            {optimisticDone ? "Reopen" : "Done"}
          </button>

          {!optimisticDone && (
            <>
              <LogCallDialog
                accountId={task.account_id}
                contactId={task.contact_id ?? null}
                phone={task.contactPhone || task.companyPhone || null}
                completeTaskId={task.id}
                trigger={(openDialog) => (
                  <button type="button" onClick={openDialog} className={`${ROW_BTN} ${DEPTH_EDIT}`}>
                    <span className="truncate">Log call</span>
                  </button>
                )}
              />

              <div ref={snoozeRef} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setSnoozeOpen((v) => !v);
                  }}
                  disabled={pending}
                  aria-expanded={snoozeOpen}
                  className={`${ROW_BTN} w-full ${DEPTH_WARNING}`}
                >
                  <span className="truncate">Snooze</span>
                  <IconChevronDown width={13} height={13} />
                </button>

                {snoozeOpen && (
                  <div className="absolute right-0 top-full z-30 mt-1 w-40 overflow-hidden rounded-lg border border-line-strong bg-card shadow-e3">
                    {SNOOZE_PRESETS.map((p, i) => (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => snooze(p.key)}
                        disabled={pending}
                        className={`${MENU_ITEM} ${i > 0 ? "border-t border-line-strong" : ""}`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Both dialogs live OUTSIDE the ⋯ panel — see the component comment. */}
      <TaskDialog mode="edit" {...dialogProps} initialFocus="due_at" trigger={(open) => {
        openRescheduleRef.current = open;
        return null;
      }} />
      <TaskDialog mode="edit" {...dialogProps} trigger={(open) => {
        openEditRef.current = open;
        return null;
      }} />

      {confirmDelete && (
        <Modal open onClose={() => !pending && setConfirmDelete(false)} busy={pending} title="Delete task">
          <p className="text-[13.5px] leading-relaxed text-fg">
            Delete <span className="font-semibold">{task.title}</span>? This can&rsquo;t be undone from
            here.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              disabled={pending}
              className={`rounded-md px-3.5 py-2 text-[13px] font-semibold transition-colors ${BTN_NEUTRAL}`}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className={`rounded-md px-3.5 py-2 text-[13px] font-semibold transition-colors ${BTN_DANGER}`}
            >
              {pending ? "Deleting…" : "Delete task"}
            </button>
          </div>
        </Modal>
      )}
    </li>
  );
}
