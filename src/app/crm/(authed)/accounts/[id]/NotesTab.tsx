"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TextareaField, SubmitButton, FormError } from "../../_shell/form";
import { CONTROL } from "../../_shell/compactForm";
import { formatDateTime } from "../../_shell/format";
import { addNote, addContactNote, updateNote, deleteNote } from "../actions";

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
 *
 * 2026-08-10: notes gained an Edit affordance (was Delete-only) — tapping it
 * swaps that one note's body for an inline textarea (updateNote), Save/
 * Cancel below it. Delete keeps its confirm prompt (window.confirm, same
 * pattern every destructive action in this CRM uses) and is still a
 * soft-delete (deleteNote sets deleted_at, never a hard DELETE).
 */
export function NotesTab({
  accountId,
  contactId,
  contactName,
  notes,
}: {
  /** Null on the contact detail page (surface 4) for a contact with no
   * company — addContactNote accepts that; addNote (the no-contactId,
   * company-wide branch) never runs in that case since this component is
   * only ever used without `contactId` from the company page, where an
   * account always exists. */
  accountId: string | null;
  contactId?: string | null;
  contactName?: string | null;
  notes: CrmNoteItem[];
}) {
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const router = useRouter();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const trimmed = String(new FormData(form).get("body") ?? "").trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      const res = contactId
        ? await addContactNote(contactId, accountId, trimmed)
        : await addNote(accountId as string, trimmed, false);
      if (res.ok) {
        form.reset();
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  function startEdit(note: CrmNoteItem) {
    setError(null);
    setEditingId(note.id);
    setEditText(note.body);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText("");
  }

  function saveEdit(noteId: string) {
    const trimmed = editText.trim();
    if (!trimmed) return;
    setError(null);
    setBusyId(noteId);
    startTransition(async () => {
      const res = await updateNote(noteId, accountId, trimmed);
      setBusyId(null);
      if (res.ok) {
        setEditingId(null);
        setEditText("");
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  function remove(noteId: string) {
    if (!window.confirm("Are you sure you want to delete this note?")) return;
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
      <form onSubmit={submit} className="flex flex-col items-start gap-2">
        <FormError message={error && !editingId ? error : null} />
        <TextareaField
          label="Add a note"
          name="body"
          rows={3}
          placeholder={contactName ? `What's worth knowing about ${contactName}?` : "What's worth knowing about this company?"}
        />
        <SubmitButton pending={pending && !editingId && !busyId}>Save note</SubmitButton>
      </form>

      {notes.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-fg-muted">No notes yet.</p>
      ) : (
        <ul className="flex flex-col gap-3 border-t border-line-strong pt-4">
          {notes.map((n) => {
            const isEditing = editingId === n.id;
            return (
              <li key={n.id} className="rounded-[5px] border border-line-strong bg-inset p-3">
                {isEditing ? (
                  <div className="flex flex-col items-start gap-2">
                    {error && <p className="text-[12px] text-bad">{error}</p>}
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={3}
                      autoFocus
                      className={`w-full min-w-0 resize-y py-1.5 leading-snug sm:py-1 ${CONTROL} text-[13.5px] sm:text-[12.5px]`}
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => saveEdit(n.id)}
                        disabled={pending || !editText.trim()}
                        className="inline-flex h-9 items-center justify-center rounded-md bg-accent px-3 text-[12.5px] font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
                      >
                        {busyId === n.id ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        disabled={pending}
                        className="inline-flex h-9 items-center justify-center rounded-md border border-fg-subtle bg-card px-3 text-[12.5px] font-semibold text-fg-muted transition-colors hover:bg-inset disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-fg">{n.body}</p>
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <p className="text-[11.5px] text-fg-subtle">
                        {n.author ? `${n.author} · ` : ""}
                        {formatDateTime(n.createdAt)}
                        {n.contactName ? ` · ${n.contactName}` : ""}
                      </p>
                      <div className="flex shrink-0 items-center gap-3">
                        <button
                          type="button"
                          onClick={() => startEdit(n)}
                          disabled={pending}
                          className="text-[11px] font-semibold text-accent hover:underline disabled:opacity-60"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(n.id)}
                          disabled={pending}
                          className="text-[11px] font-semibold text-bad hover:underline disabled:opacity-60"
                        >
                          {busyId === n.id ? "…" : "Delete"}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
