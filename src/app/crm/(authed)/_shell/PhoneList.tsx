"use client";

import { LogCallDialog } from "../calls/LogCallDialog";
import { digitsForTel, type PhoneEntry } from "./contactFields";
import { BTN_EDIT } from "./ui";

/**
 * Read-only display of a labeled phone-number list — tap-to-call (tel:) plus
 * a "Log call" action per row. Used for both the company's own numbers
 * (no contact attached) and a contact's numbers (defaultContactId set so the
 * log lands against that contact). A client component because it opens
 * LogCallDialog, which needs a render-prop trigger.
 */
export function PhoneList({
  accountId,
  phones,
  contactId,
  contactName,
  emptyText,
}: {
  accountId: string;
  phones: PhoneEntry[];
  contactId?: string | null;
  contactName?: string | null;
  emptyText?: string;
}) {
  if (!phones.length) {
    return emptyText ? <p className="text-[13px] text-fg-subtle">{emptyText}</p> : null;
  }

  const callContacts = contactId && contactName ? [{ id: contactId, name: contactName }] : [];

  return (
    <ul className="flex flex-col gap-2">
      {phones.map((p, i) => (
        <li
          key={i}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line-strong bg-inset px-3 py-2"
        >
          <div className="min-w-0">
            {p.label && (
              <p className="text-[10.5px] font-semibold uppercase tracking-wide text-fg-subtle">
                {p.label}
              </p>
            )}
            <a
              href={`tel:${digitsForTel(p.number)}`}
              className="font-mono text-[14px] font-semibold text-accent hover:underline"
            >
              {p.number}
            </a>
          </div>
          <LogCallDialog
            accountId={accountId}
            contacts={callContacts}
            defaultContactId={contactId ?? undefined}
            trigger={(open) => (
              <button
                type="button"
                onClick={open}
                className={`shrink-0 rounded-lg px-2.5 py-1 text-[12px] font-semibold transition-colors ${BTN_EDIT}`}
              >
                Log call
              </button>
            )}
          />
        </li>
      ))}
    </ul>
  );
}
