"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BTN_DANGER, Card, CardHead } from "../../_shell/ui";
import { formatDateTime, historyBucketLabel, timestampMs } from "../../_shell/format";
import { deleteNote } from "../../accounts/actions";
import { deleteCall } from "../../calls/actions";

export type CrmContactHistoryItem = {
  id: string;
  /** "note"/"call" are deletable here (their own record); "activity" is the
   * append-only audit trail and is never deleted from this feed. */
  type: "note" | "call" | "activity";
  occurredAt: string;
  author: string | null;
  title: string;
  body: string | null;
};

const TYPE_TONE: Record<CrmContactHistoryItem["type"], string> = {
  note: "bg-warn",
  call: "bg-accent",
  activity: "bg-slate",
};

/**
 * The contact profile's "Activity" — calls and activity events for this one
 * person, newest first, date-grouped. Notes get their OWN card now (surface
 * 4 rebuild — see NotesTab.tsx below page.tsx), matching the company
 * profile's Timeline/Notes split, so the caller only ever passes "call"/
 * "activity" items here even though the type still allows "note" (kept for
 * the shared type shape / in case a future caller wants the merged view).
 */
export function ContactHistorySection({
  accountId,
  items,
}: {
  accountId: string | null;
  items: CrmContactHistoryItem[];
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function remove(item: CrmContactHistoryItem) {
    if (item.type === "activity" || !accountId) return;
    if (!window.confirm("Delete this entry? This can't be undone from here.")) return;
    setBusyId(item.id);
    setError(null);
    const action =
      item.type === "note" ? deleteNote(item.id, accountId) : deleteCall(item.id, accountId);
    void action.then((res) => {
      setBusyId(null);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  const buckets = items.map((item) => historyBucketLabel(timestampMs(item.occurredAt)));

  return (
    <Card>
      <CardHead title="Activity" hint={items.length ? `${items.length} events` : undefined} />
      {error && <p className="px-4 pt-3 text-[12.5px] text-bad">{error}</p>}

      {items.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13px] text-fg-muted">
          No activity yet. Calls and other events will show up here.
        </p>
      ) : (
        <ul className="max-h-[560px] overflow-y-auto px-4 py-2">
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
                  {item.type !== "activity" && accountId && (
                    <button
                      type="button"
                      onClick={() => remove(item)}
                      disabled={busyId === item.id}
                      className={`h-fit shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors ${BTN_DANGER}`}
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
    </Card>
  );
}
