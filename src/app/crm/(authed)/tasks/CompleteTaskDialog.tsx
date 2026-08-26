"use client";

import { useState, useTransition } from "react";
import { BTN_PRIMARY, BTN_NEUTRAL } from "../_shell/ui";
import { CONTROL, CONTROL_SIZE, LABEL } from "../_shell/compactForm";
import { completeTask } from "./actions";
import { dueDateInputForColumn } from "./plan";

/**
 * The close-out dialog. ONE component in front of every "Done" control in the
 * CRM, so the two standards get asked for the same way everywhere.
 *
 * WHAT IT ASKS FOR
 *   - the NOTE, always. Required by completeTask; this is where it comes from.
 *   - the DAY, only when the task has no due date — an undated task cannot be
 *     closed, and this is where that gets fixed.
 *
 * ONE STEP, TWO FIELDS (Brent, 2026-08-26). An earlier cut made planning a
 * separate button you pressed before the note became usable; that was a
 * refusal with a chore attached. Now the date input simply appears next to
 * the note, pre-filled with today, and one submit does both — completeTask
 * takes the date and applies it in the same write.
 *
 * The date is still SHOWN and still editable rather than being applied
 * silently. The rule exists so a person says which day the work belonged to;
 * back-filling it invisibly would satisfy the check and lose the point.
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
  const needsDate = dueAt === null;
  const [note, setNote] = useState("");
  /** Only meaningful when the task has no date. Defaults to today, which is
   * the honest answer nine times out of ten — you are closing it now. */
  const [day, setDay] = useState(() =>
    needsDate ? dueDateInputForColumn("today", new Date()) : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    if (needsDate && !day) {
      setError("Pick the day this was for.");
      return;
    }
    if (!note.trim()) {
      setError("Say what happened before closing this.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await completeTask(taskId, note, needsDate ? day : null);
      if (!result.ok) {
        setError(result.error);
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

        {needsDate && (
          <label className="mt-3 flex flex-col gap-1">
            <span className={LABEL}>Which day was this for</span>
            <input
              type="date"
              value={day}
              onChange={(e) => setDay(e.target.value)}
              className={`w-full ${CONTROL_SIZE} ${CONTROL}`}
            />
            <span className="text-[11.5px] text-fg-subtle">
              It was never planned, so it needs a day before it can close.
            </span>
          </label>
        )}

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
            disabled={pending || !note.trim() || (needsDate && !day)}
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
