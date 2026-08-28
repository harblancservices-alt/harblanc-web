"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CompleteTaskDialog } from "../../../../tasks/CompleteTaskDialog";
import { snoozeTask, reassignTask, deleteTask } from "../../../../tasks/actions";
import { SNOOZE_PRESETS } from "../../../../tasks/snooze";
import { dueCountdown, timestampMs } from "../../../../_shell/format";
import type { RepOption } from "../../../CompanyDialog";
import { Modal } from "../../../../_shell/Modal";
import { BTN_DANGER, BTN_NEUTRAL, DeleteIconButton } from "../../../../_shell/ui";
import { FileCard, SectionHead } from "./chrome";

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
  nowMs,
}: {
  /** Only used to revalidate the company after a delete. */
  accountId: string;
  tasks: FileTask[];
  reps: RepOption[];
  canReassign: boolean;
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
  const [reassignFor, setReassignFor] = useState<string | null>(null);
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

  function doReassign(taskId: string, userId: string) {
    setError(null);
    // An empty pick used to mean "un-assign". Tasks always have an owner
    // now, so nothing to do rather than an ownerless task.
    if (!userId) {
      setReassignFor(null);
      return;
    }
    startTransition(async () => {
      const res = await reassignTask(taskId, userId);
      setReassignFor(null);
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

                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <Btn onClick={() => setClosing(t)} disabled={pending}>
                      Done
                    </Btn>

                    {/* Completing and deleting say different things. Until
                        2026-08-28 desktop offered only the first, so a task
                        raised by mistake had to be marked done -- which is a
                        claim that it happened. */}
                    <DeleteIconButton
                      label={`task "${t.title}"`}
                      onClick={() => setConfirming({ id: t.id, title: t.title })}
                      disabled={pending || removing}
                    />

                    {snoozeFor === t.id ? (
                      <div className="flex items-center gap-1.5">
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
                        <Btn variant="link" onClick={() => setSnoozeFor(null)}>
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

                    {canReassign &&
                      (reassignFor === t.id ? (
                        <select
                          autoFocus
                          defaultValue=""
                          disabled={pending}
                          onChange={(e) => doReassign(t.id, e.target.value)}
                          className="rounded-md border border-line bg-card px-2 py-1.5 text-[11.5px] font-semibold text-fg"
                        >
                          <option value="" disabled>
                            Give it to…
                          </option>
                          {reps.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Btn
                          variant="link"
                          onClick={() => setReassignFor(t.id)}
                          disabled={pending}
                        >
                          Reassign
                        </Btn>
                      ))}
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
