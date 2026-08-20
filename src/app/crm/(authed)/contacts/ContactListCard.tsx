"use client";

import Link from "next/link";
import { ClickableListItem } from "../_shell/ClickableRow";
import { Badge } from "../_shell/ui";
import { ContactAvatar } from "../_shell/ContactAvatar";
import { IconMail, IconPhone } from "../_shell/icons";
import { DueCountdown } from "../_shell/DueCountdown";
import { digitsForTel } from "../_shell/contactFields";

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
  /** crm_contacts.role_category — not shown on this list (crm-design's
   * Contacts row only shows the free-text `title`); still carried through
   * to the contact's own detail page. */
  roleCategory: string | null;
  /** crm_contacts.last_contacted_at — not shown on this list. */
  lastContactedAt: string | null;
};

const ICON_ACTION =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-accent hover:text-white";

/**
 * One contact row in the global Contacts directory — 2026-08-20 rebuild to
 * match /crm-design's Contacts list exactly: ONE unified row shape at every
 * breakpoint (avatar, name + DM badge, title · company, trailing meta),
 * not a separate desktop table + mobile card-grid split (that split doesn't
 * exist in the prototype at all — its Contacts list is a single `<ul>`, full
 * stop). Call/email stay as small icon actions on the right rather than the
 * old full-width labeled buttons — real, working quick-actions kept, just
 * re-shaped to fit a row instead of a card.
 */
export function ContactListCard({ contact }: { contact: ContactCardData }) {
  return (
    <ClickableListItem href={`/crm/contacts/${contact.id}`} className="flex items-center gap-3 px-4 py-3">
      <ContactAvatar className="h-9 w-9" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate text-[13.5px] font-semibold text-fg">{contact.name}</p>
          {contact.isDecisionMaker && <Badge tone="success">DM</Badge>}
        </div>
        <p className="truncate text-[12px] text-fg-muted">
          {contact.title ? `${contact.title} · ` : ""}
          {contact.accountId && contact.companyName ? (
            <Link
              href={`/crm/accounts/${contact.accountId}`}
              prefetch={false}
              onClick={(e) => e.stopPropagation()}
              className="text-accent hover:underline"
            >
              {contact.companyName}
            </Link>
          ) : (
            "No company"
          )}
        </p>
        {contact.nextFollowupAt && (
          <div className="mt-0.5 text-[11.5px]">
            <DueCountdown iso={contact.nextFollowupAt} />
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {contact.phone && (
          <a
            href={`tel:${digitsForTel(contact.phone)}`}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Call ${contact.name}`}
            className={ICON_ACTION}
          >
            <IconPhone width={14} height={14} />
          </a>
        )}
        {contact.email && (
          <a
            href={`mailto:${contact.email}`}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Email ${contact.name}`}
            className={ICON_ACTION}
          >
            <IconMail width={14} height={14} />
          </a>
        )}
      </div>
    </ClickableListItem>
  );
}
