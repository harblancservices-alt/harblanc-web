"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDateTime, historyBucketLabel, timestampMs } from "../../_shell/format";
import { deleteCall } from "../../calls/actions";
import { deleteNote } from "../actions";

export type CrmActivityLogItem = {
  id: string;
  /** "call"/"note" are deletable (their own record); "activity" is the
   * append-only audit trail and is never deleted from this feed. */
  type: "call" | "note" | "activity";
  occurredAt: string;
  author: string | null;
  contactId: string | null;
  contactName: string | null;
  title: string;
  body: string | null;
  /** Next follow-up, when a logged call flagged one. */
  followupAt: string | null;
};

const TYPE_TONE: Record<CrmActivityLogItem["type"], string> = {
  call: "bg-accent",
  note: "bg-warn",
  activity: "bg-slate",
};

/**
 * The Timeline tab's row list — reverse-chronological, date-bucketed feed
 * merging crm_calls + human crm_notes + crm_activities (page.tsx does the
 * merge/sort; this just renders it). Reused two ways: the company's full
 * Timeline tab (all items), and a contact's Activity sub-tab (the SAME items
 * array pre-filtered by contactId, in ContactsMasterDetail.tsx) — hence
 * `contactId` living on every item. Deliberately bare (no Card/CardHead) so
 * it drops straight into a tab panel without doubling up chrome.
 */
export function ActivityLogSection({
  accountId,
  items,
  emptyMessage = "No activity yet. Calls, notes, and other events will show up here.",
}: {
  accountId: string;
  items: CrmActivityLogItem[];
  emptyMessage?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function remove(item: CrmActivityLogItem) {
    if (item.type === "activity") return;
    if (!window.confirm("Delete this entry? This can't be undone from here.")) return;
    setBusyId(item.id);
    setError(null);
    startTransition(async () => {
      const res = item.type === "call" ? await deleteCall(item.id, accountId) : await deleteNote(item.id, accountId);
      setBusyId(null);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  const buckets = items.map((item) => historyBucketLabel(timestampMs(item.occurredAt)));

  if (items.length === 0) {
    return <p className="px-5 py-10 text-center text-[13.5px] text-fg-muted">{emptyMessage}</p>;
  }

  return (
    <div>
      {error && <p className="px-5 pt-3 text-[12.5px] text-bad">{error}</p>}
      <ul className="min-w-0 px-5">
        {items.map((item, i) => {
          const bucket = buckets[i];
          const showHeader = i === 0 || bucket !== buckets[i - 1];
          return (
            <li key={`${item.type}-${item.id}`} className="min-w-0">
              {showHeader && (
                <p className="-mx-5 bg-card px-5 pb-1.5 pt-3 text-[11px] font-bold uppercase tracking-[0.1em] text-fg-subtle">
                  {bucket}
                </p>
              )}
              <div className="flex min-w-0 gap-2.5 py-2.5">
                <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 ${TYPE_TONE[item.type]}`} />
                <div className="min-w-0 flex-1">
                  <p className="break-words text-[13.5px] font-medium text-fg">
                    {item.title}
                    {item.contactName && <span className="font-normal text-fg-muted"> · {item.contactName}</span>}
                  </p>
                  {item.body && (
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-fg-muted">
                      {item.body}
                    </p>
                  )}
                  {item.followupAt && (
                    <p className="mt-0.5 text-[12px] font-semibold text-warn">
                      Next follow-up: {formatDateTime(item.followupAt)}
                    </p>
                  )}
                  <p className="mt-0.5 text-[11.5px] text-fg-subtle">
                    {item.author ? `${item.author} · ` : ""}
                    {formatDateTime(item.occurredAt)}
                  </p>
                </div>
                {item.type !== "activity" && (
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
    </div>
  );
}
