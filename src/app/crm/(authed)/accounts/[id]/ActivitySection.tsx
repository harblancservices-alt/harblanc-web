"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDateTime, historyBucketLabel, timestampMs } from "../../_shell/format";
import { deleteCall } from "../../calls/actions";

export type CrmActivityItem = {
  id: string;
  /** "call" is deletable here (its own record); "activity" is the append-only
   * audit trail and is never deleted from this feed. Notes are deliberately
   * excluded from this type — they're still loggable per-person via the Note
   * action, just not surfaced here. See page.tsx's activityItems assembly. */
  type: "call" | "activity";
  occurredAt: string;
  author: string | null;
  title: string;
  body: string | null;
};

const TYPE_TONE: Record<CrmActivityItem["type"], string> = {
  call: "bg-accent",
  activity: "bg-slate",
};

/**
 * The left company card's "Activity" tab — calls + activity events (stage
 * changes, tasks created, people added, etc.), date-grouped newest first.
 * Read-only display (no note composer — that's what distinguishes this from
 * the old HistorySection it replaces).
 */
export function ActivitySection({
  accountId,
  items,
}: {
  accountId: string;
  items: CrmActivityItem[];
}) {
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function remove(item: CrmActivityItem) {
    if (item.type !== "call") return;
    if (!window.confirm("Delete this call? This can't be undone from here.")) return;
    setBusyId(item.id);
    setError(null);
    startTransition(async () => {
      const res = await deleteCall(item.id, accountId);
      setBusyId(null);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  const buckets = items.map((item) => historyBucketLabel(timestampMs(item.occurredAt)));

  return (
    <div className="p-4">
      {error && <p className="mb-2 text-[12.5px] text-bad">{error}</p>}
      {items.length === 0 ? (
        <p className="px-1 py-8 text-center text-[13px] text-fg-muted">
          No activity yet. Calls and other events will show up here.
        </p>
      ) : (
        <ul className="max-h-[420px] overflow-y-auto">
          {items.map((item, i) => {
            const bucket = buckets[i];
            const showHeader = i === 0 || bucket !== buckets[i - 1];
            return (
              <li key={`${item.type}-${item.id}`}>
                {showHeader && (
                  <p className="sticky top-0 -mx-4 bg-card px-4 pb-1.5 pt-3 text-[11px] font-bold uppercase tracking-[0.1em] text-fg-subtle">
                    {bucket}
                  </p>
                )}
                <div className="flex gap-2.5 py-2">
                  <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 ${TYPE_TONE[item.type]}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium text-fg">{item.title}</p>
                    {item.body && (
                      <p className="mt-0.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-fg-muted">
                        {item.body}
                      </p>
                    )}
                    <p className="mt-0.5 text-[11.5px] text-fg-subtle">
                      {item.author ? `${item.author} · ` : ""}
                      {formatDateTime(item.occurredAt)}
                    </p>
                  </div>
                  {item.type === "call" && (
                    <button
                      type="button"
                      onClick={() => remove(item)}
                      disabled={pending}
                      className="h-fit shrink-0 rounded-md border border-bad/30 bg-bad-bg px-2 py-0.5 text-[11px] font-semibold text-bad transition-colors hover:bg-bad/10 disabled:opacity-60"
                    >
                      {busyId === item.id ? "…" : "Delete"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
