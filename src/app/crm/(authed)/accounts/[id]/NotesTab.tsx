"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FormError, SubmitButton } from "../../_shell/form";
import { CONTROL, CONTROL_SIZE } from "../../_shell/compactForm";
import { CompanyAvatar } from "../../_shell/InitialAvatar";
import { IconPin } from "../../_shell/icons";
import { formatDateTime, formatRelativeTime } from "../../_shell/format";
import { addNote, addContactNote, updateNote, deleteNote, setNotePinned } from "../actions";
import type { TaskContactOption } from "../../tasks/TaskDialog";

export type CrmNoteItem = {
  id: string;
  body: string;
  createdAt: string;
  author: string | null;
  contactId: string | null;
  contactName: string | null;
  isPinned: boolean;
};

/**
 * "Notes" — a pinned/recent feed, the company-wide Notes card AND (reused,
 * scoped) the selected contact's Notes sub-tab in ContactsMasterDetail.
 * `contactId` set = a per-contact note (addContactNote, same shape
 * QuickNoteDialog writes) and the composer's "Attach to contact" picker is
 * hidden (the note is already scoped to that one person); omitted = the
 * company-wide composer, where `contactOptions` drives a real picker of the
 * account's contacts so a company note can still be attributed to a specific
 * person (addContactNote) instead of the company at large (addNote). Notes
 * composed here are human (is_ai=false) — AI research notes have their own
 * AI Research card.
 *
 * 2026-08-12: rebuilt from a flat list into a feed — pinned notes (is_pinned)
 * float to their own amber-highlighted section above Recent, both newest
 * first. Edit/Delete keep their original inline-textarea / soft-delete
 * behavior; Pin/Unpin is new (setNotePinned).
 */
export function NotesTab({
  accountId,
  contactId,
  contactName,
  accountName,
  notes,
  contactOptions,
  currentUser,
}: {
  /** Null on the contact detail page (surface 4) for a contact with no
   * company — addContactNote accepts that; addNote (the no-contactId,
   * company-wide branch) never runs in that case since this component is
   * only ever used without `contactId` from the company page, where an
   * account always exists. */
  accountId: string | null;
  contactId?: string | null;
  contactName?: string | null;
  /** Company name, for the company-wide composer's placeholder. Unused when
   * `contactId` is set (the per-contact placeholder uses `contactName`
   * instead). */
  accountName?: string | null;
  notes: CrmNoteItem[];
  /** This company's contacts, for the composer's "Attach to contact" picker.
   * Only rendered when `contactId` is not already set — on the per-contact
   * sub-tab the note is already scoped to one person and the picker would be
   * redundant. */
  contactOptions?: TaskContactOption[];
  /** Caller's session identity, for the composer's avatar initial. */
  currentUser?: { id: string; label: string };
}) {
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [composerPinned, setComposerPinned] = useState(false);
  const [attachContactId, setAttachContactId] = useState("");
  const router = useRouter();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const trimmed = String(new FormData(form).get("body") ?? "").trim();
    if (!trimmed) return;
    setError(null);
    const targetContactId = contactId ?? (attachContactId || null);
    startTransition(async () => {
      const res = targetContactId
        ? await addContactNote(targetContactId, accountId, trimmed, composerPinned)
        : await addNote(accountId as string, trimmed, composerPinned);
      if (res.ok) {
        form.reset();
        setComposerPinned(false);
        setAttachContactId("");
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

  function togglePin(note: CrmNoteItem) {
    setBusyId(note.id);
    setError(null);
    startTransition(async () => {
      const res = await setNotePinned(note.id, accountId, !note.isPinned);
      setBusyId(null);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  const composerPlaceholder =
    contactId && contactName
      ? `Add a note about ${contactName}…`
      : accountName
        ? `Add a note about ${accountName}…`
        : "Add a note…";

  const pinnedNotes = notes.filter((n) => n.isPinned);
  const recentNotes = notes.filter((n) => !n.isPinned);
  const showAttachPicker = !contactId && !!contactOptions && contactOptions.length > 0;

  function renderNote(n: CrmNoteItem, pinnedStyle: boolean) {
    const isEditing = editingId === n.id;
    return (
      <li
        key={n.id}
        className={`rounded-lg p-3 shadow-e2 ${
          pinnedStyle
            ? "border border-warn/30 border-l-4 border-l-warn bg-warn-bg/40"
            : "border border-line-strong bg-card"
        }`}
      >
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
          <div className="flex items-start gap-2.5">
            <CompanyAvatar name={n.author ?? "?"} className="mt-0.5 h-8 w-8 shrink-0 text-[11px]" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                <div className="flex min-w-0 items-baseline gap-1.5">
                  <span className="truncate text-[12.5px] font-bold text-fg">{n.author ?? "Unknown"}</span>
                  <span className="shrink-0 text-[11px] text-fg-subtle">{formatRelativeTime(n.createdAt)}</span>
                </div>
                <span className="shrink-0 text-[10.5px] text-fg-subtle" title={formatDateTime(n.createdAt)}>
                  {formatDateTime(n.createdAt)}
                </span>
              </div>
              {n.contactName && !contactId && (
                <span className="mt-1 inline-flex w-fit items-center rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10.5px] font-semibold text-accent">
                  re: {n.contactName}
                </span>
              )}
              <p className="mt-1.5 whitespace-pre-wrap text-[13.5px] leading-relaxed text-fg">{n.body}</p>
              <div className="mt-1.5 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => togglePin(n)}
                  disabled={pending}
                  className="text-[11px] font-semibold text-warn hover:underline disabled:opacity-60"
                >
                  {busyId === n.id ? "…" : n.isPinned ? "Unpin" : "Pin"}
                </button>
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
          </div>
        )}
      </li>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-4 sm:px-5">
      <form onSubmit={submit} className="flex flex-col gap-2.5 rounded-lg border border-line-strong bg-inset p-3 shadow-e2">
        <FormError message={error && !editingId && !busyId ? error : null} />
        <div className="flex items-start gap-2.5">
          <CompanyAvatar name={currentUser?.label ?? "?"} className="mt-0.5 h-8 w-8 shrink-0 text-[12px]" />
          <textarea
            name="body"
            rows={3}
            placeholder={composerPlaceholder}
            className={`w-full min-w-0 resize-y py-1.5 leading-snug sm:py-1 ${CONTROL} text-[13.5px] sm:text-[12.5px]`}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setComposerPinned((p) => !p)}
            aria-pressed={composerPinned}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors sm:py-1 ${
              composerPinned
                ? "border-warn bg-warn text-white"
                : "border-fg-subtle bg-card text-fg-muted hover:bg-inset"
            }`}
          >
            <IconPin width={12} height={12} />
            {composerPinned ? "Pinned" : "Pin"}
          </button>

          {showAttachPicker && (
            <select
              value={attachContactId}
              onChange={(e) => setAttachContactId(e.target.value)}
              aria-label="Attach to contact"
              className={`min-w-0 max-w-[220px] flex-1 sm:flex-initial ${CONTROL_SIZE} ${CONTROL}`}
            >
              <option value="">Attach to contact…</option>
              {contactOptions?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}

          <SubmitButton pending={pending && !editingId && !busyId}>Save note</SubmitButton>
        </div>
      </form>

      {notes.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-fg-muted">No notes yet.</p>
      ) : (
        <>
          {pinnedNotes.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="inline-flex w-fit items-center gap-1 bg-warn-bg px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-warn">
                <IconPin width={10} height={10} />
                Pinned
              </span>
              <ul className="flex flex-col gap-2">{pinnedNotes.map((n) => renderNote(n, true))}</ul>
            </div>
          )}

          {recentNotes.length > 0 && (
            <div className="flex flex-col gap-2">
              {pinnedNotes.length > 0 && (
                <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-fg-subtle">Recent</span>
              )}
              <ul className="flex flex-col gap-2">{recentNotes.map((n) => renderNote(n, false))}</ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
