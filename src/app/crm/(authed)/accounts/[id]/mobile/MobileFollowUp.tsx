"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CompleteTaskDialog } from "../../../tasks/CompleteTaskDialog";
import { formatDateTime } from "../../../_shell/format";
import { snoozeTask } from "../../../tasks/actions";
import { SNOOZE_PRESETS } from "../../../tasks/snooze";
import { M_BTN_SM } from "./ui";

/**
 * "Next follow-up" — the amber card naming the single soonest thing owed on
 * this company, with one-tap Mark done and Snooze.
 *
 * Backed by REAL data, not a new concept: page.tsx picks the earliest-due
 * OPEN crm_tasks row for this account, "Mark done" calls the same
 * `completeTask` the Style-C task card's Done button calls, and Snooze calls
 * the same `snoozeTask` with the same SNOOZE_PRESETS keys. Completing from
 * here, from the Tasks section below, or from /crm/tasks are all one write,
 * one activity-log entry, one refresh. Renders nothing when there's no open
 * dated task.
 *
 * The desktop profile has its own FollowUpBanner (desktop/FollowUpBanner.tsx)
 * — deliberately not shared: that one is a single-line strip sized for a
 * 1fr workspace column and has no Snooze. Desktop is locked; this is its
 * phone counterpart, not a replacement.
 */
export function MobileFollowUp({
  taskId,
  title,
  notes,
  dueAt,
}: {
  taskId: string;
  title: string;
  notes: string | null;
  dueAt: string;
}) {
  const [pending, startTransition] = useTransition();
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Opens the shared close-out dialog rather than completing outright —
  // completeTask requires a note and a plan, and this banner has neither to
  // give. Same dialog every other Done control in the CRM uses.
  const [closing, setClosing] = useState(false);
  function markDone() {
    setError(null);
    setClosing(true);
  }

  function snooze(preset: string) {
    setError(null);
    startTransition(async () => {
      const res = await snoozeTask(taskId, preset);
      setSnoozeOpen(false);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <div className="rounded-xl border border-warn/45 bg-warn-bg px-[13px] py-3 shadow-e1">
      <p className="text-[10.5px] font-extrabold uppercase tracking-[0.11em] text-warn">Next follow-up</p>
      <p className="mt-1 text-[14.5px] font-extrabold leading-[1.32] text-fg [overflow-wrap:anywhere]">
        {notes?.trim() || title}
      </p>
      <p className="crm-num mt-0.5 text-[12px] font-extrabold text-warn">{formatDateTime(dueAt)}</p>

      {error && <p className="mt-1.5 text-[12.5px] font-bold text-bad">{error}</p>}

      <div className="mt-2.5 flex gap-1.5">
        <button
          type="button"
          onClick={markDone}
          disabled={pending}
          className={`${M_BTN_SM} flex-1 border-accent bg-accent text-white hover:bg-accent-hover`}
        >
          {pending ? "…" : "Mark done"}
        </button>
        <button
          type="button"
          onClick={() => setSnoozeOpen((v) => !v)}
          disabled={pending}
          aria-expanded={snoozeOpen}
          className={`${M_BTN_SM} flex-1 border-line-strong bg-card text-fg hover:bg-inset`}
        >
          Snooze
        </button>
      </div>

      {snoozeOpen && (
        <div className="mt-1.5 flex gap-1.5">
          {SNOOZE_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => snooze(p.key)}
              disabled={pending}
              className={`${M_BTN_SM} flex-1 border-warn/45 bg-card text-warn hover:bg-warn/10`}
            >
              <span className="truncate">{p.label}</span>
            </button>
          ))}
        </div>
      )}

      {closing && (
        <CompleteTaskDialog
          taskId={taskId}
          title={title}
          dueAt={dueAt}
          onClose={() => setClosing(false)}
          onDone={() => {
            setClosing(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
