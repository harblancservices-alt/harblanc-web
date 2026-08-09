"use client";

import Link from "next/link";
import { ClickableListItem } from "../_shell/ClickableRow";
import { BTN_ACTION } from "../_shell/ui";
import { IconMail, IconPhone } from "../_shell/icons";
import { DueCountdown } from "../_shell/DueCountdown";
import { digitsForTel } from "../_shell/contactFields";
import { formatPhone } from "@/lib/domain/phone";

export type ContactCardData = {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  /** Only meaningful alongside the office `phone` (mirrors the old table's
   * "×123" suffix) — never shown against a mobile number. */
  extension: string | null;
  isDecisionMaker: boolean;
  nextFollowupAt: string | null;
  accountId: string | null;
  companyName: string | null;
  /** crm_contacts.role_category — only rendered by the desktop ContactTable's
   * colored Role pill (ROLE_LABEL/ROLE_TONE); the mobile card keeps showing
   * the free-text `title` job title instead, unchanged. */
  roleCategory: string | null;
  /** crm_contacts.last_contacted_at — only rendered by the desktop
   * ContactTable; not part of the mobile card's layout. */
  lastContactedAt: string | null;
};

const ICON_BTN =
  "flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg text-[12.5px] font-semibold transition-colors";

/**
 * One contact card in the global Contacts directory grid — same mobile-first
 * card/grid treatment as the Companies list (CompanyListCard.tsx), same
 * BTN_ACTION blue tap-to-call/tap-to-email pair. Every contact now has its
 * own profile page (surface 4), so the card always links to
 * /crm/contacts/[id] — the old table's "only navigate if there's a company"
 * caveat no longer applies.
 */
export function ContactListCard({ contact }: { contact: ContactCardData }) {
  return (
    <ClickableListItem
      href={`/crm/contacts/${contact.id}`}
      className="flex h-full min-h-[172px] flex-col justify-between rounded-lg border border-line-strong bg-card p-4 shadow-e1 hover:border-accent/40"
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="min-w-0 truncate text-[14.5px] font-bold text-fg">{contact.name}</p>
          {contact.isDecisionMaker && (
            <span className="inline-flex items-center bg-ok-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ok">
              Decision-maker
            </span>
          )}
        </div>

        {contact.title && <p className="truncate text-[12.5px] text-fg-muted">{contact.title}</p>}

        {contact.accountId && contact.companyName ? (
          <Link href={`/crm/accounts/${contact.accountId}`} prefetch={false} className="w-fit truncate text-[12.5px] text-accent hover:underline">
            {contact.companyName}
          </Link>
        ) : (
          <span className="text-[12.5px] text-fg-subtle">No company</span>
        )}

        {contact.nextFollowupAt && (
          <div className="text-[12px]">
            <DueCountdown iso={contact.nextFollowupAt} />
          </div>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        {contact.phone ? (
          <a href={`tel:${digitsForTel(contact.phone)}`} className={`${ICON_BTN} ${BTN_ACTION}`}>
            <IconPhone width={13} height={13} />
            {formatPhone(contact.phone)}
            {contact.extension ? ` ×${contact.extension}` : ""}
          </a>
        ) : (
          <span aria-disabled className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-fg-subtle bg-card text-[12px] font-semibold text-fg-subtle opacity-50">
            <IconPhone width={13} height={13} />
            No phone
          </span>
        )}
        {contact.email ? (
          <a href={`mailto:${contact.email}`} className={`${ICON_BTN} ${BTN_ACTION}`}>
            <IconMail width={13} height={13} />
            Email
          </a>
        ) : (
          <span aria-disabled className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-fg-subtle bg-card text-[12px] font-semibold text-fg-subtle opacity-50">
            <IconMail width={13} height={13} />
            No email
          </span>
        )}
      </div>
    </ClickableListItem>
  );
}
