"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CompleteTaskDialog } from "../../../../tasks/CompleteTaskDialog";
import { snoozeTask, deleteTask } from "../../../../tasks/actions";
import { SNOOZE_PRESETS } from "../../../../tasks/snooze";
import { dueCountdown, timestampMs } from "../../../../_shell/format";
import type { RepOption } from "../../../CompanyDialog";
import { Modal } from "../../../../_shell/Modal";
import { BTN_DANGER, BTN_NEUTRAL } from "../../../../_shell/ui";
import { FileCard, SectionHead } from "./chrome";
import { TaskDialog, type TaskContactOption } from "../../../../tasks/TaskDialog";

/**
 * PANEL 03 — TASKS.
 *
 * What is owed on this company, and only what is still owed. Every card
 * carries its own actions, because a task you cannot act on from where you
 * are reading it is a task you will read again tomorrow.
 *
 * ── OVERDUE IS THE LOUD ONE, AND IT IS THE ONLY LOUD ONE ──────────────
 *
 * A red rule and a red line of text, exactly as drawn. Nothing else on this
 * page uses red: red means late or destructive across the whole CRM, and
 * spending it anywhere else would cost it its meaning here.
 *
 * ── "DONE" OPENS THE CLOSE-OUT, IT DOES NOT SILENTLY COMPLETE ─────────
 *
 * completeTask REQUIRES a note about what happened — enforced in the action
 * itself, so no caller can route around it. Wiring Done straight to the
 * action would therefore fail every time. It opens the shared
 * CompleteTaskDialog instead, which takes the note (and a date, when the
 * task never had one) in one step. Same dialog the dashboard and the task
 * hub use, so closing a task means the same thing everywhere.
 *
 * ── SNOOZE IS REAL AND IT IS NOT A DATE PICKER ────────────────────────
 *
 * Three presets from tasks/snooze.ts — tomorrow, three days, next week —
 * which is the whole vocabulary that module defines. It already handles the
 * thing that makes snooze confusing: an OVERDUE task snoozed "tomorrow"
 * lands tomorrow, rather than one day past a date that was already stale.
 *
 * ── REASSIGN IS ADMIN-ONLY ────────────────────────────────────────────
 *
 * reassignTask refuses a non-owner server-side. The control is hidden for
 * everyone else rather than shown and then failing.
 */

export type FileTask = {
  id: string;
  title: string;
  notes: string | null;
  definitionOfDone: string | null;
  dueAt: string | null;
  assigneeName: string | null;
  /** ── EVERYTHING ELSE THE EDIT DIALOG NEEDS TO OPEN FAITHFULLY.
   * All four already come back from the tasks query in page.tsx; they were
   * simply not carried this far, because until 2026-08-29 desktop could not
   * edit a task at all. Without them the dialog would open with blank
   * fields and saving would quietly wipe the priority, type or contact. */
  taskType: string | null;
  priority: string | null;
  assignedUserId: string | null;
  contactId: string | null;
};

function Btn({
  children,
  onClick,
  disabled,
  variant = "solid",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "solid" | "outline" | "link";
}) {
  const cls =
    variant === "solid"
      ? "bg-accent text-white hover:bg-accent-hover"
      : variant === "outline"
        ? "border border-line bg-card text-fg hover:bg-inset"
        : "text-accent hover:underline";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-3 py-1.5 text-[12px] font-bold transition-colors disabled:opacity-55 ${cls}`}
    >
      {children}
    </button>
  );
}

export function TasksPanel({
  accountId,
  tasks,
  reps,
  canReassign,
  contacts,
  currentUser,
  nowMs,
}: {
  /** Used to revalidate the company after a delete, and as the fixed
   * company on the edit dialog. */
  accountId: string;
  tasks: FileTask[];
  reps: RepOption[];
  /** role === "owner". Gates the assignee picker INSIDE the edit dialog —
   * see the note on the action row about why the separate Reassign control
   * is gone. */
  canReassign: boolean;
  contacts: TaskContactOption[];
  currentUser: { id: string; label: string };
  nowMs: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [closing, setClosing] = useState<FileTask | null>(null);
  const [snoozeFor, setSnoozeFor] = useState<string | null>(null);
  /** The task awaiting a delete confirmation. Held whole so the dialog can
   * name it — on a list of similar follow-ups, "Delete this task?" confirms
   * nothing a misclick would catch. */
  const [confirming, setConfirming] = useState<{ id: string; title: string } | null>(null);
  const [removing, setRemoving] = useState(false);

  async function remove() {
    if (!confirming) return;
    setRemoving(true);
    const res = await deleteTask(confirming.id, accountId);
    setRemoving(false);
    if (!res.ok) {
      setError(res.error);
      setConfirming(null);
      return;
    }
    setConfirming(null);
    router.refresh();
  }
  const [error, setError] = useState<string | null>(null);

  function doSnooze(taskId: string, preset: string) {
    setError(null);
    startTransition(async () => {
      const res = await snoozeTask(taskId, preset);
      setSnoozeFor(null);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }


  return (
    <FileCard className="flex flex-col">
      <SectionHead
        title="Tasks"
        count={tasks.length === 0 ? "nothing open" : `${tasks.length} open`}
      />

      <div className="flex-1 p-3">
        {error && (
          <p className="mb-2 rounded-md border border-bad/30 bg-bad-bg px-2.5 py-1.5 text-[12px] font-semibold text-bad">
            {error}
          </p>
        )}

        {tasks.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-[13px] font-bold text-fg">Nothing is owed here</p>
            <p className="mx-auto mt-1 max-w-[32ch] text-[12px] text-fg-subtle">
              Use the Task button above to put something on the clock.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {tasks.map((t) => {
              const due = dueCountdown(t.dueAt, new Date(nowMs));
              const ms = timestampMs(t.dueAt);
              const overdue = ms !== null && ms <= nowMs;
              const undated = t.dueAt === null;

              return (
                <div
                  key={t.id}
                  className={`border border-line bg-card p-3 ${
                    overdue ? "border-l-[3px] border-l-bad" : ""
                  }`}
                >
                  {overdue && (
                    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-bad">
                      Overdue — {due.text.replace(/^Overdue\s*/, "") || "past due"}
                    </p>
                  )}

                  <div className="flex items-start gap-2">
                    <p className="mt-0.5 min-w-0 flex-1 text-[13px] font-extrabold leading-snug text-fg">
                      {t.title}
                    </p>
                    {undated && (
                      <span className="shrink-0 text-[11px] text-fg-subtle">no due date</span>
                    )}
                    {!undated && !overdue && (
                      <span className="shrink-0 text-[11px] text-fg-subtle">{due.text}</span>
                    )}
                  </div>

                  {t.notes && (
                    <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-fg-muted">
                      {t.notes}
                    </p>
                  )}

                  {/* FOUR REAL BUTTONS, in the order Brent asked for:
                      Set date - Edit - Done - Delete.

                      Before this, "Set date" and "Reassign" rendered as bare
                      words and Delete as a naked icon, so only one of the
                      four looked pressable.

                      REASSIGN IS GONE AS A SEPARATE CONTROL, not dropped.
                      TaskDialog in edit mode shows a real "Assigned rep"
                      picker to exactly the people `canReassign` allowed --
                      role === "owner" -- and the server action re-enforces
                      that regardless of what the form sends. Keeping an
                      inline <select> beside it would be a second way to do
                      the same thing, which is what put two task-making
                      surfaces in this app once already. */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    {snoozeFor === t.id ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {SNOOZE_PRESETS.map((p) => (
                          <button
                            key={p.key}
                            type="button"
                            onClick={() => doSnooze(t.id, p.key)}
                            disabled={pending}
                            className="rounded-md border border-line bg-card px-2 py-1.5 text-[11.5px] font-semibold text-fg hover:bg-inset disabled:opacity-55"
                          >
                            {p.label}
                          </button>
                        ))}
                        <Btn variant="outline" onClick={() => setSnoozeFor(null)}>
                          cancel
                        </Btn>
                      </div>
                    ) : (
                      <Btn
                        variant="outline"
                        onClick={() => setSnoozeFor(t.id)}
                        disabled={pending}
                      >
                        {undated ? "Set date" : "Snooze"}
                      </Btn>
                    )}

                    {/* EDIT reuses the dialog the rest of the CRM uses --
                        title, notes, type, priority, due date, contact, and
                        the owner-only assignee picker. Not a second editor. */}
                    <TaskDialog
                      mode="edit"
                      accountId={accountId}
                      contacts={contacts}
                      reps={reps}
                      canAssignOthers={canReassign}
                      currentUser={currentUser}
                      defaults={{
                        id: t.id,
                        title: t.title,
                        notes: t.notes,
                        task_type: t.taskType,
                        due_at: t.dueAt,
                        priority: t.priority,
                        assigned_user_id: t.assignedUserId,
                        account_id: accountId,
                        contact_id: t.contactId,
                      }}
                      trigger={(open) => (
                        <Btn variant="outline" onClick={open} disabled={pending}>
                          Edit
                        </Btn>
                      )}
                    />

                    <Btn onClick={() => setClosing(t)} disabled={pending}>
                      Done
                    </Btn>

                    {/* Still the trash icon he knows, but wearing a button:
                        outlined red, which is this CRM's destructive
                        treatment (filled red means "creates a record").
                        Confirmation is unchanged. */}
                    <button
                      type="button"
                      onClick={() => setConfirming({ id: t.id, title: t.title })}
                      disabled={pending || removing}
                      aria-label={`Delete task "${t.title}"`}
                      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-bold transition-colors disabled:opacity-55 ${BTN_DANGER}`}
                    >
                      <svg
                        aria-hidden
                        viewBox="0 0 24 24"
                        className="h-3.5 w-3.5 fill-none stroke-current stroke-2"
                      >
                        <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
                      </svg>
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="border-t border-line px-4 py-2.5 text-[11.5px] text-fg-subtle">
        Finished tasks fold into history — nothing piles up here.
      </p>

      {closing && (
        <CompleteTaskDialog
          taskId={closing.id}
          title={closing.title}
          dueAt={closing.dueAt}
          definitionOfDone={closing.definitionOfDone}
          onClose={() => setClosing(null)}
          onDone={() => {
            setClosing(null);
            router.refresh();
          }}
        />
      )}

      {confirming && (
        <Modal
          open
          onClose={() => !removing && setConfirming(null)}
          busy={removing}
          title="Delete task"
        >
          <p className="text-[13.5px] leading-relaxed text-fg">
            Delete <span className="font-semibold">{confirming.title}</span>? It comes
            off this company and off whoever owns it straight away.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirming(null)}
              disabled={removing}
              className={`rounded-md px-3.5 py-2 text-[13px] font-semibold transition-colors ${BTN_NEUTRAL}`}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={removing}
              className={`rounded-md px-3.5 py-2 text-[13px] font-semibold transition-colors ${BTN_DANGER}`}
            >
              {removing ? "Deleting…" : "Delete task"}
            </button>
          </div>
        </Modal>
      )}
    </FileCard>
  );
}
