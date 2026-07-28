"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHead } from "../../_shell/ui";
import { formatDateTime } from "../../_shell/format";
import { addNote, setNotePinned, deleteNote } from "../actions";

export type CrmNote = {
  id: string;
  body: string;
  is_pinned: boolean;
  created_at: string;
  author: string | null;
};

/**
 * Notes on the company profile. Compose a note (optionally pinned); pinned
 * notes float to the top, then newest-first. Each note carries its author and
 * timestamp and can be pinned/unpinned in place. Adding a note logs a timeline
 * activity via the server action.
 */
export function NotesSection({
  accountId,
  notes,
}: {
  accountId: string;
  notes: CrmNote[];
}) {
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const router = useRouter();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      const res = await addNote(accountId, trimmed, pinned);
      if (res.ok) {
        setBody("");
        setPinned(false);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  function togglePin(note: CrmNote) {
    setBusyId(note.id);
    startTransition(async () => {
      const res = await setNotePinned(note.id, accountId, !note.is_pinned);
      setBusyId(null);
      if (res.ok) router.refresh();
    });
  }

  function remove(note: CrmNote) {
    if (!window.confirm("Delete this note? This can't be undone from here.")) return;
    setBusyId(note.id);
    startTransition(async () => {
      const res = await deleteNote(note.id, accountId);
      setBusyId(null);
      if (res.ok) router.refresh();
    });
  }

  return (
    <Card>
      <CardHead
        title="Notes"
        hint={notes.length ? `${notes.length} on file` : undefined}
      />

      <div className="border-b border-line-strong px-5 py-4">
        <form onSubmit={submit} className="flex flex-col gap-2.5">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a note about this company…"
            rows={3}
            className="resize-y rounded-lg border border-line-strong bg-card px-3 py-2.5 text-[14px] leading-relaxed text-fg outline-none focus:ring-2 focus:ring-accent/40"
          />
          {error && <p className="text-[12.5px] text-bad">{error}</p>}
          <div className="flex items-center justify-between gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-fg-muted">
              <input
                type="checkbox"
                checked={pinned}
                onChange={(e) => setPinned(e.target.checked)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              Pin to top
            </label>
            <button
              type="submit"
              disabled={pending || !body.trim()}
              className="inline-flex h-9 items-center rounded-lg bg-accent px-4 text-[13px] font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              {pending ? "Saving…" : "Add note"}
            </button>
          </div>
        </form>
      </div>

      {notes.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13px] text-fg-muted">
          No notes yet. Jot the first one above.
        </p>
      ) : (
        <ul className="divide-y divide-line-strong">
          {notes.map((n) => (
            <li key={n.id} className="px-5 py-3.5">
              <div className="mb-1 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-[12px] text-fg-subtle">
                  <span className="font-semibold text-fg-muted">
                    {n.author || "Someone"}
                  </span>
                  <span>·</span>
                  <span>{formatDateTime(n.created_at)}</span>
                  {n.is_pinned && (
                    <span className="rounded-full bg-steel-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-steel">
                      Pinned
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => togglePin(n)}
                    disabled={pending}
                    className="rounded-md px-2 py-0.5 text-[12px] font-semibold text-fg-subtle transition-colors hover:bg-inset hover:text-fg disabled:opacity-60"
                  >
                    {busyId === n.id ? "…" : n.is_pinned ? "Unpin" : "Pin"}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(n)}
                    disabled={pending}
                    className="rounded-md px-2 py-0.5 text-[12px] font-semibold text-fg-subtle transition-colors hover:bg-bad/10 hover:text-bad disabled:opacity-60"
                  >
                    Delete
                  </button>
                </div>
              </div>
              <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-fg">
                {n.body}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
