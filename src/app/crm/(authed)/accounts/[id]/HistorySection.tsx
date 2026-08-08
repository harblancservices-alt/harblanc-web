"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BTN_DANGER, Card, CardHead } from "../../_shell/ui";
import { formatDateTime, historyBucketLabel, timestampMs } from "../../_shell/format";
import { addNote, deleteNote } from "../actions";
import { deleteCall } from "../../calls/actions";

export type CrmHistoryItem = {
  id: string;
  /** "note"/"call" are deletable here (their own record); "activity" is the
   * append-only audit trail and is never deleted from this feed. */
  type: "note" | "call" | "activity";
  occurredAt: string;
  author: string | null;
  title: string;
  body: string | null;
};

const TYPE_TONE: Record<CrmHistoryItem["type"], string> = {
  note: "bg-warn",
  call: "bg-accent",
  activity: "bg-slate",
};

/**
 * The company profile's unified history — everything that's happened, one
 * feed, newest first, grouped under Today/Yesterday/This week/Last week/a
 * month name. Replaces the old three-way split (Team Notes card, Calls card,
 * Activity timeline): a call already carries its own outcome/summary, a note
 * carries its own body, so showing both AND a generic "Call logged"/"Note
 * added" activity line for the same event was pure duplication. page.tsx
 * builds this merged, pre-sorted array server-side (notes + calls + every
 * crm_activities row EXCEPT kind=call/note_added, which would just repeat
 * the richer record already included).
 */
export function HistorySection({
  accountId,
  items,
}: {
  accountId: string;
  items: CrmHistoryItem[];
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const router = useRouter();

  function submitNote(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      const res = await addNote(accountId, trimmed, false);
      if (res.ok) {
        setBody("");
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  function remove(item: CrmHistoryItem) {
    if (item.type === "activity") return;
    if (!window.confirm("Delete this entry? This can't be undone from here.")) return;
    setBusyId(item.id);
    setError(null);
    const action = item.type === "note" ? deleteNote(item.id, accountId) : deleteCall(item.id, accountId);
    void action.then((res) => {
      setBusyId(null);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  // Bucket headers fall out of a pure precomputed array (rather than a
  // mutable variable tracked across the render's .map callback) — a header
  // shows whenever the bucket label differs from the previous item's, and
  // `items` is already sorted newest-first so equal buckets stay adjacent.
  const buckets = items.map((item) => historyBucketLabel(timestampMs(item.occurredAt)));

  return (
    <Card>
      <CardHead title="History" hint={items.length ? `${items.length} events` : undefined} />

      <div className="border-b-2 border-accent/15 bg-accent/[0.04] px-4 py-3.5">
        <form onSubmit={submitNote} className="flex flex-col gap-2.5">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a note about this company…"
            rows={2}
            className="resize-y rounded-lg border border-fg-subtle bg-card px-3.5 py-2.5 text-[14.5px] font-medium leading-relaxed text-fg outline-none focus:ring-2 focus:ring-accent/40"
          />
          {error && <p className="text-[12.5px] text-bad">{error}</p>}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={pending || !body.trim()}
              className="inline-flex h-10 items-center rounded-lg bg-accent px-5 text-[13.5px] font-bold text-white shadow-e1 transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              {pending ? "Saving…" : "Add note"}
            </button>
          </div>
        </form>
      </div>

      {items.length === 0 ? (
        <p className="px-5 py-7 text-center text-[13px] text-fg-muted">
          No history yet. Calls, notes, and other activity will show up here.
        </p>
      ) : (
        <ul className="max-h-[420px] overflow-y-auto px-4 py-2">
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
                  <span
                    aria-hidden
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TYPE_TONE[item.type]}`}
                  />
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
                  {item.type !== "activity" && (
                    <button
                      type="button"
                      onClick={() => remove(item)}
                      disabled={pending}
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
