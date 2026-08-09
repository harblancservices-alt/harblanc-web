"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TextareaField, SubmitButton, FormError } from "../../_shell/form";
import { formatDateTime } from "../../_shell/format";
import { addNote, addContactNote, deleteNote } from "../actions";

export type CrmNoteItem = {
  id: string;
  body: string;
  createdAt: string;
  author: string | null;
  contactId: string | null;
  contactName: string | null;
};

/**
 * "Notes" — the company-wide Notes tab AND (reused, scoped) the selected
 * contact's Notes sub-tab in ContactsMasterDetail. `contactId` set = a
 * per-contact note (addContactNote, same shape QuickNoteDialog writes);
 * omitted = a general company note (addNote — finally gets a UI home; it's
 * existed unused since the original CRM build). Notes composed here are
 * human (is_ai=false) — AI research notes have their own AI Research card.
 */
export function NotesTab({
  accountId,
  contactId,
  contactName,
  notes,
}: {
  accountId: string;
  contactId?: string | null;
  contactName?: string | null;
  notes: CrmNoteItem[];
}) {
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const trimmed = String(new FormData(form).get("body") ?? "").trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      const res = contactId ? await addContactNote(contactId, accountId, trimmed) : await addNote(accountId, trimmed, false);
      if (res.ok) {
        form.reset();
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  function remove(noteId: string) {
    if (!window.confirm("Delete this note? This can't be undone from here.")) return;
    setBusyId(noteId);
    setError(null);
    startTransition(async () => {
      const res = await deleteNote(noteId, accountId);
      setBusyId(null);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-4 px-5 py-4">
      <form onSubmit={submit} className="flex flex-col gap-2">
        <FormError message={error} />
        <TextareaField
          label="Add a note"
          name="body"
          rows={3}
          placeholder={contactName ? `What's worth knowing about ${contactName}?` : "What's worth knowing about this company?"}
        />
        <SubmitButton pending={pending}>Save note</SubmitButton>
      </form>

      {notes.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-fg-muted">No notes yet.</p>
      ) : (
        <ul className="flex flex-col gap-3 border-t border-line-strong pt-4">
          {notes.map((n) => (
            <li key={n.id} className="border border-line-strong bg-inset p-3">
              <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-fg">{n.body}</p>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <p className="text-[11.5px] text-fg-subtle">
                  {n.author ? `${n.author} · ` : ""}
                  {formatDateTime(n.createdAt)}
                  {n.contactName ? ` · ${n.contactName}` : ""}
                </p>
                <button
                  type="button"
                  onClick={() => remove(n.id)}
                  disabled={pending}
                  className="shrink-0 text-[11px] font-semibold text-bad hover:underline disabled:opacity-60"
                >
                  {busyId === n.id ? "…" : "Delete"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
