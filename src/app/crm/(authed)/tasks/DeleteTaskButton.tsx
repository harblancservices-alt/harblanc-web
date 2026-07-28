"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteTask } from "./actions";

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
  const router = useRouter();

  function remove() {
    if (!window.confirm(`Delete "${title}"?`)) return;
    startTransition(async () => {
      const res = await deleteTask(taskId, accountId);
      if (res.ok) router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={pending}
      className="rounded-md px-2 py-1 text-[12px] font-semibold text-fg-subtle transition-colors hover:bg-bad/10 hover:text-bad disabled:opacity-60"
    >
      Delete
    </button>
  );
}
