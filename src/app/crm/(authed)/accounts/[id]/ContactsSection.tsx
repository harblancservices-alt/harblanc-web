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
import { IconPlus, IconContacts, IconNote } from "../../_shell/icons";
import { DueCountdown } from "../../_shell/DueCountdown";
import { PhoneList } from "../../_shell/PhoneList";
import { LinkList } from "../../_shell/LinkList";
import type { PhoneEntry, LinkEntry } from "../../_shell/contactFields";
import { ContactDialog, type ContactDefaults } from "./ContactDialog";
import { QuickNoteDialog } from "./QuickNoteDialog";
import { LogCallDialog, type CallContactOption } from "../../calls/LogCallDialog";
import { deleteContact, setPrimaryContact } from "../actions";

export type CrmContact = ContactDefaults & {
  id: string;
  name: string;
  phones: PhoneEntry[];
  links: LinkEntry[];
};

/**
 * Contacts on the company profile — full CRUD, the top card of the
 * operational RIGHT column. Add opens the contact dialog; each contact card
 * shows its labeled phone numbers (tap-to-call + Log call per number), its
 * labeled links, a follow-up date/time, and a quick Note button. The
 * company's primary contact is badged and can be set/cleared here.
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

  const callContacts: CallContactOption[] = contacts.map((c) => ({
    id: c.id,
    name: c.name,
  }));

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
                Add contact
              </button>
            )}
          />
        }
      />

      {contacts.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-inset text-fg-subtle">
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
            return (
              <li key={c.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14.5px] font-semibold text-fg">
                        {c.name}
                      </span>
                      {isPrimary && (
                        <span className="rounded-full bg-steel-bg px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-steel">
                          Primary
                        </span>
                      )}
                      {c.is_decision_maker && (
                        <span className="rounded-full bg-ok-bg px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-ok">
                          Decision-maker
                        </span>
                      )}
                    </div>
                    {c.title && (
                      <p className="mt-0.5 text-[12.5px] text-fg-muted">{c.title}</p>
                    )}
                    {c.email && (
                      <a
                        href={`mailto:${c.email}`}
                        className="mt-0.5 block text-[13px] text-accent hover:underline"
                      >
                        {c.email}
                      </a>
                    )}
                  </div>
                </div>

                <div className="mt-3">
                  <PhoneList
                    accountId={accountId}
                    phones={c.phones}
                    contactId={c.id}
                    contactName={c.name}
                  />
                </div>

                {c.links.length > 0 && (
                  <div className="mt-2">
                    <LinkList links={c.links} />
                  </div>
                )}

                <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[13px]">
                  {c.best_time_to_call && (
                    <div className="flex gap-2">
                      <dt className="shrink-0 text-fg-subtle">Best time</dt>
                      <dd className="text-fg">{c.best_time_to_call}</dd>
                    </div>
                  )}
                  {c.next_followup_at && (
                    <div className="flex items-start gap-2">
                      <dt className="shrink-0 pt-1 text-fg-subtle">Follow-up</dt>
                      <dd>
                        <DueCountdown iso={c.next_followup_at} />
                      </dd>
                    </div>
                  )}
                </dl>

                {c.notes && (
                  <p className="mt-2 whitespace-pre-wrap rounded-lg bg-inset px-3 py-2 text-[12.5px] leading-relaxed text-fg-muted">
                    {c.notes}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <LogCallDialog
                    accountId={accountId}
                    contacts={callContacts}
                    defaultContactId={c.id}
                    trigger={(open) => (
                      <button
                        type="button"
                        onClick={open}
                        className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${BTN_EDIT}`}
                      >
                        Log call
                      </button>
                    )}
                  />
                  <QuickNoteDialog
                    accountId={accountId}
                    contactId={c.id}
                    contactName={c.name}
                    trigger={(open) => (
                      <button
                        type="button"
                        onClick={open}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${BTN_EDIT}`}
                      >
                        <IconNote width={13} height={13} />
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
                  {isPrimary ? (
                    <button
                      type="button"
                      onClick={() => clearPrimary(c.id)}
                      disabled={pending}
                      className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${BTN_NEUTRAL}`}
                    >
                      {isBusy ? "…" : "Unset primary"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => makePrimary(c.id)}
                      disabled={pending}
                      className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${BTN_NEUTRAL}`}
                    >
                      {isBusy ? "…" : "Make primary"}
                    </button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => remove(c.id, c.name)}
                      disabled={pending}
                      className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${BTN_DANGER}`}
                    >
                      {isBusy ? "…" : "Delete"}
                    </button>
                  )}
                </div>
                {errorId === c.id && error && (
                  <p className="mt-2 text-[12.5px] text-bad">{error}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
