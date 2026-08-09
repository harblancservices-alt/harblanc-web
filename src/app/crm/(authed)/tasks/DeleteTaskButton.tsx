"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteTask } from "./actions";
import { BTN_DANGER } from "../_shell/ui";
import { TASK_ACTION_BTN } from "./TaskRow";

/**
 * Delete control for a task row rendered from a Server Component (the global
 * Tasks page) — a small standalone "use client" component receiving only
 * plain string props, so no function crosses the Server->Client boundary
 * (the RSC-boundary bug this codebase has hit twice before: fbfabd7,
 * 0462e2f). TasksSection.tsx (already "use client") builds its own inline
 * delete handler instead; this exists specifically for server-rendered rows.
 */
export function DeleteTaskButton({
  taskId,
  accountId,
  title,
}: {
  taskId: string;
  accountId: string | null;
  title: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function remove() {
    if (!window.confirm(`Delete "${title}"?`)) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteTask(taskId, accountId);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        className={`${TASK_ACTION_BTN} ${BTN_DANGER}`}
      >
        Delete
      </button>
      {error && <span className="text-[11px] text-bad">{error}</span>}
    </span>
  );
}
