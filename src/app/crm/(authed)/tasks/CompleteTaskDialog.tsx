"use client";

import { useState, useTransition } from "react";
import { BTN_PRIMARY, BTN_NEUTRAL } from "../_shell/ui";
import { CONTROL, CONTROL_SIZE, LABEL } from "../_shell/compactForm";
import { completeTask, planTask } from "./actions";

/**
 * The close-out dialog. ONE component in front of every "Done" control in the
 * CRM, so the two standards get asked for the same way everywhere.
 *
 * WHAT IT ASKS FOR
 *   - the NOTE, always. Required by completeTask; this is where it comes from.
 *   - a PLAN, only when the task has no due date. completeTask refuses to
 *     close work that was never planned, so rather than bounce the person off
 *     a server error, the dialog notices first and offers the one thing that
 *     fixes it.
 *
 * THE PLAN STEP IS DELIBERATELY NOT AUTOMATIC. It would be trivial to date
 * the task silently on close and never mention it, and that would defeat the
 * rule — the point is that a person decides when work happens. So it is an
 * explicit button with its own label, and the note field is still required
 * alongside it.
 *
 * The server checks both regardless (tasks/actions.ts::completeTask). This
 * dialog exists to make the rules easy to satisfy, never to be the thing that
 * enforces them.
 */
export function CompleteTaskDialog({
  taskId,
  title,
  /** The task's current due_at — null means it was never planned. */
  dueAt,
  /** What the goal was, if one was stated. Shown so the note can answer it. */
  definitionOfDone,
  onClose,
  onDone,
}: {
  taskId: string;
  title: string;
  dueAt: string | null;
  definitionOfDone?: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [planned, setPlanned] = useState(dueAt !== null);
  const [pending, startTransition] = useTransition();

  function planToday() {
    setError(null);
    startTransition(async () => {
      const result = await planTask(taskId, "today");
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPlanned(true);
    });
  }

  function save() {
    if (!note.trim()) {
      setError("Say what happened before closing this.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await completeTask(taskId, note);
      if (!result.ok) {
        setError(result.error);
        // The server saw something the dialog didn't — most likely the task
        // was un-planned in another tab. Re-open the plan step rather than
        // leaving a dead Done button.
        if (result.reason === "not_planned") setPlanned(false);
        return;
      }
      onDone();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Close out "${title}"`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-lg border border-line-strong bg-card p-4 shadow-e2">
        <p className="text-[15px] font-bold tracking-tight text-fg">Close this out</p>
        <p className="mt-0.5 truncate text-[12.5px] text-fg-muted">{title}</p>

        {definitionOfDone && (
          <p className="mt-2 rounded-md bg-inset px-2.5 py-1.5 text-[12px] text-fg-muted">
            <span className="font-bold text-fg">Done when:</span> {definitionOfDone}
          </p>
        )}

        {!planned ? (
          <div className="mt-3 rounded-md border border-warn/40 bg-warn-bg px-3 py-2.5">
            <p className="text-[12.5px] font-semibold text-fg">This was never planned.</p>
            <p className="mt-0.5 text-[12px] text-fg-muted">
              It has no date, so it is still sitting in your Inbox. Put it on a day before
              closing it.
            </p>
            <button
              type="button"
              onClick={planToday}
              disabled={pending}
              className={`mt-2 rounded-md px-3 py-1.5 text-[12.5px] font-bold transition-colors ${BTN_PRIMARY}`}
            >
              {pending ? "Planning…" : "Plan it for today"}
            </button>
          </div>
        ) : null}

        <label className="mt-3 flex flex-col gap-1">
          <span className={LABEL}>What happened</span>
          <textarea
            value={note}
            autoFocus
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            placeholder="Spoke to Tom — quoted the Dallas lane at $1,850, he's comparing until Friday."
            className={`w-full resize-y ${CONTROL_SIZE} ${CONTROL}`}
          />
        </label>

        {error && <p className="mt-1.5 text-[12px] font-semibold text-bad">{error}</p>}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={pending || !planned || !note.trim()}
            className={`rounded-md px-3.5 py-2 text-[13px] font-bold transition-colors disabled:pointer-events-none disabled:opacity-50 ${BTN_PRIMARY}`}
          >
            {pending ? "Closing…" : "Mark it done"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-md px-3 py-2 text-[12.5px] font-semibold ${BTN_NEUTRAL}`}
          >
            Cancel
          </button>
          <span className="text-[11.5px] text-fg-subtle">
            The note is kept on the company&rsquo;s timeline.
          </span>
        </div>
      </div>
    </div>
  );
}
