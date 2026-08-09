"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BTN_RED, Card, CardHead } from "../../_shell/ui";
import { IconPlus, IconContacts } from "../../_shell/icons";
import { ContactDialog } from "./ContactDialog";
import { PersonCard, type CrmContact } from "./PersonCard";
import { deleteContact, setPrimaryContact } from "../actions";
import type { TaskContactOption } from "../../tasks/TaskDialog";
import type { RepOption } from "../CompanyDialog";

export type { CrmContact };

/**
 * Contacts tab — the complete roster of everyone at this company (full CRUD),
 * same PersonCard grid as the Overview tab's People section but with the
 * primary-contact toggle and Delete, since this is the full directory.
 */
export function ContactsSection({
  accountId,
  contacts,
  primaryContactId,
  canDelete = false,
  reps,
  contactOptions,
  canAssignOthers,
  currentUser,
}: {
  accountId: string;
  contacts: CrmContact[];
  primaryContactId: string | null;
  /** Contacts are a shared record — deletion is owner-only, enforced again
   * server-side in deleteContact regardless of this UI gate. */
  canDelete?: boolean;
  reps: RepOption[];
  contactOptions: TaskContactOption[];
  canAssignOthers: boolean;
  currentUser: { id: string; label: string };
}) {
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function makePrimary(id: string) {
    setBusyId(id);
    setErrorId(null);
    startTransition(async () => {
      const res = await setPrimaryContact(accountId, id);
      setBusyId(null);
      if (res.ok) router.refresh();
      else {
        setErrorId(id);
        setError(res.error);
      }
    });
  }

  function clearPrimary(id: string) {
    setBusyId(id);
    setErrorId(null);
    startTransition(async () => {
      const res = await setPrimaryContact(accountId, null);
      setBusyId(null);
      if (res.ok) router.refresh();
      else {
        setErrorId(id);
        setError(res.error);
      }
    });
  }

  function remove(id: string, name: string) {
    if (!window.confirm(`Delete ${name}? This can't be undone from here.`)) return;
    setBusyId(id);
    setErrorId(null);
    startTransition(async () => {
      const res = await deleteContact(id, accountId);
      setBusyId(null);
      if (res.ok) router.refresh();
      else {
        setErrorId(id);
        setError(res.error);
      }
    });
  }

  return (
    <Card>
      <CardHead
        title="Contacts"
        hint={contacts.length ? `${contacts.length} on file` : undefined}
        right={
          <ContactDialog
            accountId={accountId}
            mode="create"
            trigger={(open) => (
              <button
                type="button"
                onClick={open}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${BTN_RED}`}
              >
                <IconPlus width={14} height={14} />
                Add person
              </button>
            )}
          />
        }
      />

      {contacts.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
          <span className="flex h-11 w-11 items-center justify-center bg-inset text-fg-subtle">
            <IconContacts />
          </span>
          <p className="text-[14px] font-semibold text-fg">No contacts yet</p>
          <p className="max-w-xs text-[13px] text-fg-muted">
            Add the decision-makers you work with at this company.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 p-3 [grid-template-columns:repeat(auto-fill,minmax(min(340px,100%),1fr))]">
          {contacts.map((c) => {
            const isPrimary = c.id === primaryContactId;
            const isBusy = busyId === c.id;
            return (
              <PersonCard
                key={c.id}
                accountId={accountId}
                person={c}
                reps={reps}
                contactOptions={contactOptions}
                canAssignOthers={canAssignOthers}
                currentUser={currentUser}
                isPrimary={isPrimary}
                onMakePrimary={() => makePrimary(c.id)}
                onClearPrimary={() => clearPrimary(c.id)}
                canDelete={canDelete}
                onDelete={() => remove(c.id, c.name)}
                busy={pending && isBusy}
                errorMessage={errorId === c.id ? error : null}
              />
            );
          })}
        </ul>
      )}
    </Card>
  );
}
