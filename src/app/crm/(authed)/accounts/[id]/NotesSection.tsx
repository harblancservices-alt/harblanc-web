"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BTN_DANGER, BTN_NEUTRAL, Card, CardHead, ZEBRA_ROWS } from "../../_shell/ui";
import { IconNote } from "../../_shell/icons";
import { formatDateTime } from "../../_shell/format";
import { addNote, setNotePinned, deleteNote } from "../actions";

export type CrmNote = {
  id: string;
  body: string;
  is_pinned: boolean;
  is_ai: boolean;
  created_at: string;
  author: string | null;
  /** First name of the contact this note is about, when it's tied to one. */
  contactName?: string | null;
};

/**
 * Team Notes on the company profile — human-written notes only (is_ai=false).
 * AI-generated research briefs live in their own "AI Research" profile tab
 * (see AiResearchSection.tsx), never mixed in here. Styled as a primary,
 * high-visibility section (bold accent header chip, tinted composer, roomy
 * spacing) rather than a subdued afterthought, since this is where the team
 * actually reads/writes. Compose a note (optionally pinned); pinned notes
 * float to the top, then newest-first. Adding a note logs a timeline
 * activity via the server action and always writes is_ai=false.
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
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
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
    setRowError(null);
    startTransition(async () => {
      const res = await setNotePinned(note.id, accountId, !note.is_pinned);
      setBusyId(null);
      if (res.ok) router.refresh();
      else setRowError({ id: note.id, message: res.error });
    });
  }

  function remove(note: CrmNote) {
    if (!window.confirm("Delete this note? This can't be undone from here.")) return;
    setBusyId(note.id);
    setRowError(null);
    startTransition(async () => {
      const res = await deleteNote(note.id, accountId);
      setBusyId(null);
      if (res.ok) router.refresh();
      else setRowError({ id: note.id, message: res.error });
    });
  }

  return (
    <Card>
      <CardHead
        title="Team Notes"
        hint={notes.length ? `${notes.length} on file` : "Add the first note below"}
        right={
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-accent shadow-e1">
            <IconNote width={17} height={17} />
          </span>
        }
      />

      <div className="border-b-2 border-accent/15 bg-accent/[0.04] px-4 py-3.5">
        <form onSubmit={submit} className="flex flex-col gap-2.5">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a note about this company…"
            rows={2}
            className="resize-y rounded-lg border border-fg-subtle bg-card px-3.5 py-2.5 text-[14.5px] font-medium leading-relaxed text-fg outline-none focus:ring-2 focus:ring-accent/40"
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
              className="inline-flex h-10 items-center rounded-lg bg-accent px-5 text-[13.5px] font-bold text-white shadow-e1 transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              {pending ? "Saving…" : "Add note"}
            </button>
          </div>
        </form>
      </div>

      {notes.length === 0 ? (
        <p className="px-5 py-7 text-center text-[13.5px] text-fg-muted">
          No team notes yet. Jot the first one above.
        </p>
      ) : (
        <ul className={`max-h-[380px] divide-y divide-line-strong overflow-y-auto ${ZEBRA_ROWS}`}>
          {notes.map((n) => (
            <li key={n.id} className="px-4 py-3">
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-[12.5px] text-fg-subtle">
                  <span className="font-bold text-fg">{n.author || "Someone"}</span>
                  <span>·</span>
                  <span>{formatDateTime(n.created_at)}</span>
                  {n.contactName && <span>· {n.contactName}</span>}
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
                    className={`rounded-md px-2 py-0.5 text-[12px] font-semibold transition-colors ${BTN_NEUTRAL}`}
                  >
                    {busyId === n.id ? "…" : n.is_pinned ? "Unpin" : "Pin"}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(n)}
                    disabled={pending}
                    className={`rounded-md px-2 py-0.5 text-[12px] font-semibold transition-colors ${BTN_DANGER}`}
                  >
                    Delete
                  </button>
                </div>
              </div>
              <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-fg">
                {n.body}
              </p>
              {rowError?.id === n.id && (
                <p className="mt-1.5 text-[12.5px] text-bad">{rowError.message}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
