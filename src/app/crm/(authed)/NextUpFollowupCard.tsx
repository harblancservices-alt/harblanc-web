"use client";

import Link from "next/link";
import { ClickableListItem } from "./_shell/ClickableRow";
import { DueCountdown } from "./_shell/DueCountdown";
import { digitsForTel } from "./_shell/contactFields";
import { IconPhone } from "./_shell/icons";
import { LogCallDialog } from "./calls/LogCallDialog";
import { BTN_ACTION, BTN_EDIT } from "./_shell/ui";

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

const ACTION_BTN =
  "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-60";

/**
 * One FOLLOW-UP card in the dashboard's "What's next" list — styled to match
 * TaskRow's card (left urgency bar, same padding/type scale) so a follow-up
 * and a task read as ONE consistent list rather than two visually different
 * row species stitched together. A small phone-icon medallion is the row's
 * "type" tell (tasks carry their own task_type chip instead). Call dials the
 * contact directly; Log call opens the same LogCallDialog every company
 * profile uses, pre-scoped to this contact.
 */
export function NextUpFollowupCard({ contact }: { contact: CallListContact }) {
  const urgencyBar = contact.overdue ? "bg-bad" : "bg-warn";

  const content = (
    <div className="flex min-w-0 flex-1 items-stretch gap-3">
      <span aria-hidden className={`w-1 shrink-0 ${urgencyBar}`} />

      <div className="min-w-0 flex-1 py-3 pr-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center bg-accent/10 text-accent">
            <IconPhone width={11} height={11} />
          </span>
          <p className="text-[14.5px] font-semibold text-fg">{contact.name}</p>
        </div>

        {contact.companyName && contact.account_id && (
          <p className="mt-0.5 text-[12.5px] text-fg-subtle">
            <Link
              href={`/crm/accounts/${contact.account_id}`}
              prefetch={false}
              onClick={(e) => e.stopPropagation()}
              className="font-medium text-accent hover:underline"
            >
              {contact.companyName}
            </Link>
          </p>
        )}

        {contact.notes && (
          <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-fg-muted">
            {contact.notes}
          </p>
        )}

        <div className="mt-1.5">
          <DueCountdown iso={contact.next_followup_at} />
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {contact.phone && (
            <a
              href={`tel:${digitsForTel(contact.phone)}`}
              onClick={(e) => e.stopPropagation()}
              className={`${ACTION_BTN} ${BTN_ACTION}`}
            >
              Call
            </a>
          )}
          {contact.account_id && (
            <LogCallDialog
              accountId={contact.account_id}
              contactId={contact.id}
              phone={contact.phone}
              trigger={(open) => (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    open();
                  }}
                  className={`${ACTION_BTN} ${BTN_EDIT}`}
                >
                  Log call
                </button>
              )}
            />
          )}
        </div>
      </div>
    </div>
  );

  const cardClass = "relative flex overflow-hidden border border-line-strong bg-card shadow-e1";

  if (contact.account_id) {
    return (
      <ClickableListItem href={`/crm/accounts/${contact.account_id}`} className={`${cardClass} hover:border-accent/40`}>
        {content}
      </ClickableListItem>
    );
  }
  return <li className={cardClass}>{content}</li>;
}
