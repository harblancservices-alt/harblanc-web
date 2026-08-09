"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BTN_DANGER, BTN_NEUTRAL, BTN_RED } from "../../_shell/ui";
import { ContactDialog, type ContactDefaults } from "../../accounts/[id]/ContactDialog";
import { QuickNoteDialog } from "../../accounts/[id]/QuickNoteDialog";
import { LogCallDialog } from "../../calls/LogCallDialog";
import { TaskDialog, type TaskContactOption } from "../../tasks/TaskDialog";
import { deleteContact } from "../../accounts/actions";
import type { RepOption } from "../../accounts/CompanyDialog";

/**
 * Every dialog-with-trigger action on the contact profile — thin client
 * wrappers so the server-rendered page can drop them in without handing a
 * render-prop closure across the Server->Client boundary (that's crashed
 * prod twice before on this codebase — see LogCallButton.tsx/
 * AddPersonButton.tsx for the same pattern). Three exports: the header's
 * Edit trigger, the Log call/Note/Email/Delete action row (Delete pinned to
 * the right, separated from the operational actions, confirm required), and
 * the Tasks card's "+ Add task" trigger.
 */
export function EditContactButton({
  accountId,
  defaults,
}: {
  accountId: string | null;
  defaults: ContactDefaults & { id: string };
}) {
  if (!accountId) return null;
  return (
    <ContactDialog
      accountId={accountId}
      mode="edit"
      defaults={defaults}
      trigger={(open) => (
        <button
          type="button"
          onClick={open}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${BTN_NEUTRAL}`}
        >
          Edit
        </button>
      )}
    />
  );
}

export function AddTaskButton({
  accountId,
  contactOptions,
  reps,
  canAssignOthers,
  currentUser,
  defaultContactId,
}: {
  accountId: string | null;
  contactOptions: TaskContactOption[];
  reps: RepOption[];
  canAssignOthers: boolean;
  currentUser: { id: string; label: string };
  defaultContactId: string;
}) {
  if (!accountId) return null;
  return (
    <TaskDialog
      mode="create"
      accountId={accountId}
      contacts={contactOptions}
      reps={reps}
      canAssignOthers={canAssignOthers}
      currentUser={currentUser}
      defaults={{ contact_id: defaultContactId }}
      trigger={(open) => (
        <button
          type="button"
          onClick={open}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${BTN_NEUTRAL}`}
        >
          + Add task
        </button>
      )}
    />
  );
}

const GRID_BTN =
  "inline-flex h-10 items-center justify-center rounded-lg px-3 text-[13px] font-semibold transition-colors";

export function ContactActionsRow({
  accountId,
  contactId,
  contactName,
  contactEmail,
  contactOptions,
  reps,
  canAssignOthers,
  currentUser,
  canDelete,
}: {
  accountId: string | null;
  contactId: string;
  contactName: string;
  contactEmail: string | null;
  contactOptions: TaskContactOption[];
  reps: RepOption[];
  canAssignOthers: boolean;
  currentUser: { id: string; label: string };
  canDelete: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function remove() {
    if (!window.confirm(`Delete ${contactName}? This can't be undone from here.`)) return;
    setBusy(true);
    setError(null);
    startTransition(async () => {
      const res = await deleteContact(contactId, accountId ?? "");
      setBusy(false);
      if (res.ok) {
        router.push(accountId ? `/crm/accounts/${accountId}` : "/crm/contacts");
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-[12.5px] text-bad">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {accountId && (
            <LogCallDialog
              accountId={accountId}
              contacts={contactOptions}
              defaultContactId={contactId}
              trigger={(open) => (
                <button type="button" onClick={open} className={`${GRID_BTN} ${BTN_RED}`}>
                  Log call
                </button>
              )}
            />
          )}
          {accountId && (
            <TaskDialog
              mode="create"
              accountId={accountId}
              contacts={contactOptions}
              reps={reps}
              canAssignOthers={canAssignOthers}
              currentUser={currentUser}
              defaults={{ contact_id: contactId }}
              trigger={(open) => (
                <button type="button" onClick={open} className={`${GRID_BTN} ${BTN_RED}`}>
                  Add task
                </button>
              )}
            />
          )}
          <QuickNoteDialog
            accountId={accountId}
            contactId={contactId}
            contactName={contactName}
            trigger={(open) => (
              <button type="button" onClick={open} className={`${GRID_BTN} ${BTN_RED}`}>
                Note
              </button>
            )}
          />
          {contactEmail ? (
            <a href={`mailto:${contactEmail}`} className={`${GRID_BTN} ${BTN_RED}`}>
              Email
            </a>
          ) : (
            <span aria-disabled title="No email on file" className={`${GRID_BTN} ${BTN_RED} cursor-not-allowed opacity-40`}>
              Email
            </span>
          )}
        </div>

        {canDelete && (
          <button
            type="button"
            onClick={remove}
            disabled={pending || busy}
            className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${BTN_DANGER}`}
          >
            {pending || busy ? "…" : "Delete"}
          </button>
        )}
      </div>
    </div>
  );
}
