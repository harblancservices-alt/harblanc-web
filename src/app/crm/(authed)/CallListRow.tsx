"use client";

import Link from "next/link";
import { formatDateTime } from "./_shell/format";
import { ClickableListItem } from "./_shell/ClickableRow";
import { digitsForTel } from "./_shell/contactFields";
import { LogCallDialog } from "./calls/LogCallDialog";
import { BTN_EDIT } from "./_shell/ui";

export type CallListContact = {
  id: string;
  name: string;
  account_id: string | null;
  companyName: string | null;
  next_followup_at: string | null;
  notes: string | null;
  phone: string | null;
  overdue: boolean;
};

/**
 * One row in the dashboard's Call list — a contact whose next_followup_at is
 * due today or overdue (the salesman's top-priority queue). Tap-to-call
 * dials the contact's primary number directly; "Log call" opens the same
 * LogCallDialog every company profile uses, pre-scoped to this contact. The
 * Log call action only renders when the contact has a company, since
 * LogCallDialog always writes against an account_id.
 */
export function CallListRow({ contact }: { contact: CallListContact }) {
  const content = (
    <>
      <span
        aria-hidden
        className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${contact.overdue ? "bg-bad" : "bg-warn"}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="text-[14px] font-semibold text-fg">{contact.name}</p>
          {contact.companyName && contact.account_id && (
            <Link
              href={`/crm/accounts/${contact.account_id}`}
              prefetch={false}
              className="text-[12.5px] font-medium text-accent hover:underline"
            >
              {contact.companyName}
            </Link>
          )}
        </div>
        {contact.notes && (
          <p className="mt-0.5 line-clamp-1 text-[12.5px] text-fg-muted">{contact.notes}</p>
        )}
        <p
          className={`mt-1 text-[12px] ${contact.overdue ? "font-semibold text-bad" : "text-fg-subtle"}`}
        >
          {contact.overdue ? "Overdue · " : "Due "}
          {formatDateTime(contact.next_followup_at)}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {contact.phone && (
          <a
            href={`tel:${digitsForTel(contact.phone)}`}
            className={`inline-flex h-8 items-center rounded-lg px-2.5 text-[12px] font-semibold transition-colors ${BTN_EDIT}`}
          >
            Call
          </a>
        )}
        {contact.account_id && (
          <LogCallDialog
            accountId={contact.account_id}
            contacts={[{ id: contact.id, name: contact.name }]}
            defaultContactId={contact.id}
            trigger={(open) => (
              <button
                type="button"
                onClick={open}
                className={`inline-flex h-8 items-center rounded-lg px-2.5 text-[12px] font-semibold transition-colors ${BTN_EDIT}`}
              >
                Log call
              </button>
            )}
          />
        )}
      </div>
    </>
  );

  if (contact.account_id) {
    return (
      <ClickableListItem
        href={`/crm/accounts/${contact.account_id}`}
        className="flex items-start gap-3 px-5 py-3.5"
      >
        {content}
      </ClickableListItem>
    );
  }
  return <li className="flex items-start gap-3 px-5 py-3.5">{content}</li>;
}
