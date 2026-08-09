"use client";

import { LogCallDialog } from "../calls/LogCallDialog";
import { digitsForTel, type PhoneEntry } from "./contactFields";
import { BTN_EDIT } from "./ui";
import { formatPhone } from "@/lib/domain/phone";

/**
 * Read-only display of a labeled phone-number list — tap-to-call (tel:) plus
 * a "Log call" action per row. Used for both the company's own numbers
 * (no contact attached) and a contact's numbers (contactId hint set so the
 * log opens pre-linked to that contact, with that row's own number as the
 * phone hint). A client component because it opens LogCallDialog, which
 * needs a render-prop trigger. `contactName` is accepted for caller
 * compatibility but no longer needed — LogCallDialog now resolves the
 * contact's name itself from the id.
 */
export function PhoneList({
  accountId,
  phones,
  contactId,
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

  return (
    <ul className="flex flex-col gap-2">
      {phones.map((p, i) => (
        <li
          key={i}
          className="flex flex-wrap items-center justify-between gap-2 border border-line-strong bg-inset px-3 py-2"
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
              {formatPhone(p.number)}
            </a>
          </div>
          <LogCallDialog
            accountId={accountId}
            contactId={contactId}
            phone={p.number}
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
