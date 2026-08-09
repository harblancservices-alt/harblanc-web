"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BTN_DANGER,
  BTN_EDIT,
  BTN_NEUTRAL,
  BTN_PRIMARY,
  Card,
  CardHead,
  ZEBRA_ROWS,
} from "../../_shell/ui";
import { IconPlus, IconContacts } from "../../_shell/icons";
import { digitsForTel, type PhoneEntry, type LinkEntry } from "../../_shell/contactFields";
import { lastContactStatus, timestampMs } from "../../_shell/format";
import { formatPhone } from "@/lib/domain/phone";
import { ContactDialog, type ContactDefaults } from "./ContactDialog";
import { QuickNoteDialog } from "./QuickNoteDialog";
import { ROLE_LABEL, ROLE_TONE, type CrmPersonRoleCategory } from "./PeopleSection";
import { deleteContact, setPrimaryContact } from "../actions";

export type CrmContact = ContactDefaults & {
  id: string;
  name: string;
  phones: PhoneEntry[];
  links: LinkEntry[];
  last_contacted_at?: string | null;
};

/**
 * Contacts tab — the complete roster of everyone at this company (full CRUD),
 * richer than the Overview tab's People snippet because it's the whole list
 * rather than a compact preview. Each row: a square initial avatar, name +
 * color-coded role tag (same vocabulary as PeopleSection.tsx), the primary
 * labeled phone number, email, last-contacted, and Call/Note/Edit. Primary-
 * contact and delete stay available as smaller secondary controls — real
 * capabilities, just not the row's visual headline per the approved mockup.
 */
export function ContactsSection({
  accountId,
  contacts,
  primaryContactId,
  canDelete = false,
}: {
  accountId: string;
  contacts: CrmContact[];
  primaryContactId: string | null;
  /** Contacts are a shared record — deletion is owner-only, enforced again
   * server-side in deleteContact regardless of this UI gate. */
  canDelete?: boolean;
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
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${BTN_PRIMARY}`}
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
        <ul className={`divide-y divide-line-strong ${ZEBRA_ROWS}`}>
          {contacts.map((c) => {
            const isPrimary = c.id === primaryContactId;
            const isBusy = busyId === c.id;
            const primaryPhone = c.phones[0] ?? null;
            const role = (c.role_category ?? null) as CrmPersonRoleCategory | null;
            const roleLabel = role ? ROLE_LABEL[role] : null;
            const roleTone = role ? ROLE_TONE[role] : "bg-inset text-fg-subtle";
            const lastContacted = lastContactStatus(timestampMs(c.last_contacted_at)).text;

            return (
              <li key={c.id} className="px-5 py-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center bg-graphite text-[14px] font-semibold text-white">
                    {c.name.charAt(0).toUpperCase() || "?"}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[14.5px] font-semibold text-fg">{c.name}</span>
                      {roleLabel && (
                        <span
                          className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${roleTone}`}
                        >
                          {roleLabel}
                        </span>
                      )}
                      {isPrimary && (
                        <span className="bg-steel-bg px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-steel">
                          Primary
                        </span>
                      )}
                      {c.is_decision_maker && (
                        <span className="bg-ok-bg px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-ok">
                          Decision-maker
                        </span>
                      )}
                    </div>
                    {c.title && <p className="mt-0.5 text-[12.5px] text-fg-muted">{c.title}</p>}

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px]">
                      {primaryPhone && (
                        <span className="font-mono text-fg-muted">
                          {primaryPhone.label ? `${primaryPhone.label}: ` : ""}
                          {formatPhone(primaryPhone.number)}
                        </span>
                      )}
                      {c.email && (
                        <a href={`mailto:${c.email}`} className="text-accent hover:underline">
                          {c.email}
                        </a>
                      )}
                      <span className="text-fg-subtle">Last contacted: {lastContacted}</span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {primaryPhone && (
                        <a
                          href={`tel:${digitsForTel(primaryPhone.number)}`}
                          className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${BTN_EDIT}`}
                        >
                          Call
                        </a>
                      )}
                      <QuickNoteDialog
                        accountId={accountId}
                        contactId={c.id}
                        contactName={c.name}
                        trigger={(open) => (
                          <button
                            type="button"
                            onClick={open}
                            className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${BTN_EDIT}`}
                          >
                            Note
                          </button>
                        )}
                      />
                      <ContactDialog
                        accountId={accountId}
                        mode="edit"
                        defaults={c}
                        trigger={(open) => (
                          <button
                            type="button"
                            onClick={open}
                            className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${BTN_EDIT}`}
                          >
                            Edit
                          </button>
                        )}
                      />

                      {/* Secondary controls — real capabilities, kept out of
                          the row's visual headline per the approved mockup. */}
                      {isPrimary ? (
                        <button
                          type="button"
                          onClick={() => clearPrimary(c.id)}
                          disabled={pending}
                          className={`rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors ${BTN_NEUTRAL}`}
                        >
                          {isBusy ? "…" : "Unset primary"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => makePrimary(c.id)}
                          disabled={pending}
                          className={`rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors ${BTN_NEUTRAL}`}
                        >
                          {isBusy ? "…" : "Make primary"}
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => remove(c.id, c.name)}
                          disabled={pending}
                          className={`rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors ${BTN_DANGER}`}
                        >
                          {isBusy ? "…" : "Delete"}
                        </button>
                      )}
                    </div>
                    {errorId === c.id && error && (
                      <p className="mt-2 text-[12.5px] text-bad">{error}</p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
