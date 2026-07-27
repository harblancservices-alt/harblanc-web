"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHead } from "../../_shell/ui";
import { IconPlus, IconContacts } from "../../_shell/icons";
import { formatDateTime } from "../../_shell/format";
import { ContactDialog, type ContactDefaults } from "./ContactDialog";
import { deleteContact, setPrimaryContact } from "../actions";

export type CrmContact = ContactDefaults & { id: string; name: string };

/**
 * Contacts on the company profile — full CRUD. Add opens the contact dialog;
 * each contact card offers Edit, Make primary, and Delete (soft delete). The
 * company's primary contact is badged and can be set/cleared here.
 */
export function ContactsSection({
  accountId,
  contacts,
  primaryContactId,
}: {
  accountId: string;
  contacts: CrmContact[];
  primaryContactId: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const router = useRouter();

  function makePrimary(id: string) {
    setBusyId(id);
    startTransition(async () => {
      const res = await setPrimaryContact(accountId, id);
      setBusyId(null);
      if (res.ok) router.refresh();
    });
  }

  function clearPrimary() {
    startTransition(async () => {
      const res = await setPrimaryContact(accountId, null);
      if (res.ok) router.refresh();
    });
  }

  function remove(id: string, name: string) {
    if (!window.confirm(`Delete ${name}? This can't be undone from here.`)) return;
    setBusyId(id);
    startTransition(async () => {
      const res = await deleteContact(id, accountId);
      setBusyId(null);
      if (res.ok) router.refresh();
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
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-accent-hover"
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
        <ul className="divide-y divide-line">
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

                    <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-[13px] sm:grid-cols-2">
                      {c.email && (
                        <Line label="Email">
                          <a href={`mailto:${c.email}`} className="text-accent hover:underline">
                            {c.email}
                          </a>
                        </Line>
                      )}
                      {c.phone && (
                        <Line label="Phone">
                          <span className="font-mono">
                            {c.phone}
                            {c.extension ? ` ×${c.extension}` : ""}
                          </span>
                        </Line>
                      )}
                      {c.mobile && (
                        <Line label="Mobile">
                          <span className="font-mono">{c.mobile}</span>
                        </Line>
                      )}
                      {c.best_time_to_call && (
                        <Line label="Best time">{c.best_time_to_call}</Line>
                      )}
                      {c.next_followup_at && (
                        <Line label="Follow-up">
                          {formatDateTime(c.next_followup_at)}
                        </Line>
                      )}
                      {c.linkedin_url && (
                        <Line label="LinkedIn">
                          <a
                            href={c.linkedin_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent hover:underline"
                          >
                            Profile ↗
                          </a>
                        </Line>
                      )}
                    </dl>

                    {c.notes && (
                      <p className="mt-2 whitespace-pre-wrap rounded-lg bg-inset px-3 py-2 text-[12.5px] leading-relaxed text-fg-muted">
                        {c.notes}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <ContactDialog
                    accountId={accountId}
                    mode="edit"
                    defaults={c}
                    trigger={(open) => (
                      <button
                        type="button"
                        onClick={open}
                        className="rounded-lg border border-line-strong bg-card px-3 py-1.5 text-[12.5px] font-semibold text-fg transition-colors hover:bg-inset"
                      >
                        Edit
                      </button>
                    )}
                  />
                  {isPrimary ? (
                    <button
                      type="button"
                      onClick={clearPrimary}
                      disabled={pending}
                      className="rounded-lg border border-line-strong bg-card px-3 py-1.5 text-[12.5px] font-semibold text-fg-muted transition-colors hover:bg-inset disabled:opacity-60"
                    >
                      Unset primary
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => makePrimary(c.id)}
                      disabled={pending}
                      className="rounded-lg border border-line-strong bg-card px-3 py-1.5 text-[12.5px] font-semibold text-fg-muted transition-colors hover:bg-inset disabled:opacity-60"
                    >
                      {isBusy ? "…" : "Make primary"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(c.id, c.name)}
                    disabled={pending}
                    className="rounded-lg border border-bad/30 bg-bad-bg px-3 py-1.5 text-[12.5px] font-semibold text-bad transition-colors hover:bg-bad/10 disabled:opacity-60"
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-fg-subtle">{label}</dt>
      <dd className="min-w-0 truncate text-fg">{children}</dd>
    </div>
  );
}
