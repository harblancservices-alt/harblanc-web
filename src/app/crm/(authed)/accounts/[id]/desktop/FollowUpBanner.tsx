"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDateTime } from "../../../_shell/format";
import { IconBell } from "../../../_shell/icons";
import { D_MONO } from "./ui";
import { CompleteTaskDialog } from "../../../tasks/CompleteTaskDialog";

/**
 * DESKTOP-ONLY "Next follow-up" banner (design handoff §Main column) — the
 * amber strip above the workspace card naming the single soonest thing owed
 * on this company, with a one-click "Mark done".
 *
 * Backed by REAL data, not a new concept: page.tsx picks the earliest-due
 * OPEN crm_tasks row for this account and passes it here, and "Mark done"
 * calls the same `completeTask` server action the Style-C task card's Done
 * button uses — so completing from here and completing from the Tasks tab
 * are the same write, the same activity-log entry, and the same refresh.
 * Renders nothing when there's no open dated task.
 *
 * The date reads in the CRM's standard Central-time format (formatDateTime,
 * "· CST") and is set in IBM Plex Mono, matching every other timestamp in
 * this redesign.
 */
export function FollowUpBanner({
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

  return (
    <div className="flex items-center gap-3 rounded-lg border border-warn/45 bg-warn-bg px-4 py-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warn/20 text-warn">
        <IconBell width={15} height={15} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-bold text-warn">
          Next follow-up · <span className={D_MONO}>{formatDateTime(dueAt)}</span>
        </div>
        <div className="mt-px truncate text-[12px] font-medium text-warn">{notes?.trim() || title}</div>
        {error && <div className="mt-1 text-[12px] font-semibold text-bad">{error}</div>}
      </div>
      <button
        type="button"
        onClick={markDone}
        className="shrink-0 whitespace-nowrap rounded-md border border-warn/45 bg-card px-3 py-1.5 text-[12px] font-bold text-warn transition-colors hover:bg-warn/10 disabled:opacity-60"
      >
        Mark done
      </button>

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
