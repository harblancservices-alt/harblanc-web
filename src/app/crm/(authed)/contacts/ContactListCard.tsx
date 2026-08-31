"use client";

import Link from "next/link";
import { ClickableListItem } from "../_shell/ClickableRow";
import { Badge, BTN_ACTION, BTN_EDIT } from "../_shell/ui";
import { ContactAvatar } from "../_shell/ContactAvatar";
import { IconMail, IconNote, IconPhone } from "../_shell/icons";
import { DueCountdown } from "../_shell/DueCountdown";
import { digitsForTel } from "../_shell/contactFields";
import { MOOD_LABEL, normalizeMood, type ContactMood } from "../_shell/mood";
import { ContactStar } from "./ContactStar";
import { lastContactStatus, timestampMs } from "../_shell/format";
import { LogCallDialog } from "../calls/LogCallDialog";

export type ContactCardData = {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  /** crm_contacts.starred_at is not null — "gets freight moved". */
  starred?: boolean;
  phone: string | null;
  /** Only meaningful alongside the office `phone` (mirrors the old table's
   * "x123" suffix) — never shown against a mobile number. */
  extension: string | null;
  isDecisionMaker: boolean;
  nextFollowupAt: string | null;
  accountId: string | null;
  companyName: string | null;
  /** crm_contacts.role_category — not shown on this list (the row only shows
   * the free-text `title`); still carried through to the detail page. */
  roleCategory: string | null;
  /** crm_contacts.last_contacted_at — drives the "Last: 3d ago" readout. */
  lastContactedAt: string | null;
  currentMood: string | null;
};

/**
 * Mood → avatar dot color. Semantic tokens only, matching mood.ts's own tone
 * map exactly (hot = danger red, warm = warning amber, cold = steel,
 * interested = success green, call back = accent blue) so the dot and the
 * mood chips in the toolbar can never drift apart. "Not interested" / "No"
 * deliberately get NO dot — a neutral-gray dot reads as "unset" anyway, and
 * an unset mood is by far the common case across a 60-row directory.
 */
const MOOD_DOT: Partial<Record<ContactMood, string>> = {
  interested: "bg-ok",
  call_back: "bg-accent",
  warm: "bg-warn",
  hot: "bg-bad",
  cold: "bg-steel",
};

/** Shared geometry for the three quick actions, so Call/Email/Log occupy the
 * exact same footprint on every row whether they're live or disabled. */
/* 44px on a phone, 32px from `sm` up. The floor exists because this row is
   used one-handed from a truck stop and the Call and Email targets sit 6px
   apart; desktop density is unchanged above the breakpoint, which is what
   Brent asked for. */
const ACTION_BASE =
  "inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-md px-2 text-[12px] font-semibold transition-colors sm:h-8 sm:min-w-0 sm:px-2.5";

/**
 * Disabled Call/Email. Deliberately NOT the BTN_* tokens' own
 * `disabled:opacity-60` treatment — a 60%-opacity accent-blue label on white
 * lands squarely in the faint-gray zone the CRM's contrast rule exists to
 * prevent. Instead the button drops its accent entirely and renders as a
 * sunken neutral chip: `text-fg-muted` (#454b5c) on `bg-inset` (#eef1f6) is
 * a ~8:1 pair — unmistakably "not blue, not clickable" while staying fully
 * readable. Existing tokens only.
 */
const ACTION_DISABLED = "border border-line-strong bg-inset text-fg-muted cursor-not-allowed";

/**
 * One contact row in the global Contacts directory — 2026-08-22 rebuild for
 * "find a contact fast" (Brent approved the mockup). What changed vs. the
 * previous row: a mood DOT on the avatar instead of a separate mood pill, a
 * spelled-out DECISION badge, NO PHONE / NO EMAIL flag chips, a "Last: Nd"
 * recency readout, and — the point of the pass — three quick actions
 * (Call / Email / Log) pinned in the SAME position on EVERY row, present
 * even when they can't fire, so the eye never has to hunt for them going
 * down the list. The follow-up DueCountdown indicator is unchanged.
 *
 * One unified row shape at every breakpoint (the mobile design system is
 * locked — nothing here is desktop-gated except the action LABELS, which
 * collapse to icon-only below `sm` so three buttons still fit a phone).
 */
export function ContactListCard({ contact }: { contact: ContactCardData }) {
  const mood = normalizeMood(contact.currentMood);
  const dot = mood ? MOOD_DOT[mood] : undefined;
  const last = lastContactStatus(timestampMs(contact.lastContactedAt));
  const tel = contact.phone ? digitsForTel(contact.phone) : "";

  return (
    <ClickableListItem
      href={`/crm/contacts/${contact.id}`}
      className="flex items-center gap-2.5 px-3 py-2.5 sm:gap-3 sm:px-4"
    >
      <span className="relative inline-flex shrink-0">
        <ContactAvatar className="h-9 w-9" />
        {mood && dot && (
          <span
            className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${dot}`}
            title={MOOD_LABEL[mood]}
          />
        )}
        {mood && <span className="sr-only">Mood: {MOOD_LABEL[mood]}</span>}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate text-[13.5px] font-semibold text-fg">{contact.name}</p>
          {contact.isDecisionMaker && <Badge tone="success">Decision</Badge>}
          {!contact.phone && <Badge tone="neutral">No phone</Badge>}
          {!contact.email && <Badge tone="neutral">No email</Badge>}
        </div>
        <p className="truncate text-[12px] text-fg-muted">
          {contact.title ? `${contact.title} · ` : ""}
          {contact.accountId && contact.companyName ? (
            <Link
              href={`/crm/accounts/${contact.accountId}`}
              prefetch={false}
              onClick={(e) => e.stopPropagation()}
              className="font-semibold text-accent hover:underline"
            >
              {contact.companyName}
            </Link>
          ) : (
            "No company"
          )}
        </p>
        {/* THE PHONE AND THE EMAIL AS TEXT. This card carried Call and
            Email BUTTONS and printed neither value, so the one directory
            in the app that lists people could not tell you any of their
            details — you had to launch a dialler or a mail client to find
            out what they were. Tyler asked for exactly this on 31 Aug.
            select-text because reading is half of it and copying is the
            other half. */}
        {(contact.phone || contact.email) && (
          <p className="select-text truncate text-[11.5px] font-semibold text-fg-muted">
            {contact.phone && <span className="crm-num">{contact.phone}</span>}
            {contact.phone && contact.email && " · "}
            {contact.email}
          </p>
        )}
        <p className="truncate text-[11.5px] font-medium text-fg-muted">
          {last.text === "Never contacted" ? "Never contacted" : `Last: ${last.text}`}
        </p>
        {contact.nextFollowupAt && (
          <div className="mt-0.5 text-[11.5px]">
            <DueCountdown iso={contact.nextFollowupAt} />
          </div>
        )}
      </div>

      {/* Fixed three-slot action bar — same order, same position, every row. */}
      <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
        <ContactStar
          contactId={contact.id}
          starred={Boolean(contact.starred)}
          name={contact.name}
          size="sm"
        />
        {contact.phone ? (
          <a
            href={`tel:${tel}`}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Call ${contact.name}`}
            className={`${ACTION_BASE} ${BTN_EDIT}`}
          >
            <IconPhone width={13} height={13} />
            <span className="hidden sm:inline">Call</span>
          </a>
        ) : (
          <span
            aria-disabled
            title="No phone number on this contact"
            className={`${ACTION_BASE} ${ACTION_DISABLED}`}
          >
            <IconPhone width={13} height={13} />
            <span className="hidden sm:inline">Call</span>
          </span>
        )}

        {contact.email ? (
          <a
            href={`mailto:${contact.email}`}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Email ${contact.name}`}
            className={`${ACTION_BASE} ${BTN_EDIT}`}
          >
            <IconMail width={13} height={13} />
            <span className="hidden sm:inline">Email</span>
          </a>
        ) : (
          <span
            aria-disabled
            title="No email address on this contact"
            className={`${ACTION_BASE} ${ACTION_DISABLED}`}
          >
            <IconMail width={13} height={13} />
            <span className="hidden sm:inline">Email</span>
          </span>
        )}

        <LogCallDialog
          accountId={contact.accountId}
          contactId={contact.id}
          phone={contact.phone}
          trigger={(open) => (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                open();
              }}
              aria-label={`Log a call with ${contact.name}`}
              className={`${ACTION_BASE} ${BTN_ACTION}`}
            >
              <IconNote width={13} height={13} />
              <span className="hidden sm:inline">Log</span>
            </button>
          )}
        />
      </div>
    </ClickableListItem>
  );
}
