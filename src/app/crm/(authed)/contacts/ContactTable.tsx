"use client";

import Link from "next/link";
import { ClickableRow } from "../_shell/ClickableRow";
import { BTN_ACTION, LIST_HEAD_ROW, ZEBRA_ROWS } from "../_shell/ui";
import { IconMail, IconPhone } from "../_shell/icons";
import { DueCountdown } from "../_shell/DueCountdown";
import { digitsForTel } from "../_shell/contactFields";
import { formatPhone } from "@/lib/domain/phone";
import type { ContactCardData } from "./ContactListCard";

const CELL_BTN =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 text-[12px] font-semibold transition-colors";

/**
 * Desktop (md+) table rendering of the global Contacts directory — same
 * ContactCardData the mobile ContactListCard grid already consumes, laid out
 * as left-to-right rows. There's no per-contact "last contacted" timestamp
 * tracked anywhere in the schema (only the account-level rollup Companies
 * uses), so this shows the real tracked field instead — next follow-up —
 * rather than a fabricated column.
 */
export function ContactTable({ contacts }: { contacts: ContactCardData[] }) {
  return (
    <table className="w-full table-fixed border-collapse text-[13px]">
      <colgroup>
        <col className="w-[18%]" />
        <col className="w-[14%]" />
        <col className="w-[16%]" />
        <col className="w-[15%]" />
        <col className="w-[17%]" />
        <col className="w-[10%]" />
        <col className="w-[10%]" />
      </colgroup>
      <thead>
        <tr className={LIST_HEAD_ROW}>
          <th className="px-5 py-2 text-left">Name</th>
          <th className="px-5 py-2 text-left">Role</th>
          <th className="px-5 py-2 text-left">Company</th>
          <th className="px-5 py-2 text-left">Phone</th>
          <th className="px-5 py-2 text-left">Email</th>
          <th className="px-5 py-2 text-left">Next follow-up</th>
          <th className="px-5 py-2 text-right">Actions</th>
        </tr>
      </thead>
      <tbody className={ZEBRA_ROWS}>
        {contacts.map((c) => (
          <ContactTableRow key={c.id} contact={c} />
        ))}
      </tbody>
    </table>
  );
}

function ContactTableRow({ contact }: { contact: ContactCardData }) {
  return (
    <ClickableRow href={`/crm/contacts/${contact.id}`}>
      <td className="truncate px-5 py-2.5 font-semibold text-fg">
        {contact.name}
        {contact.isDecisionMaker && (
          <span className="ml-1.5 inline-flex items-center bg-ok-bg px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-ok">
            DM
          </span>
        )}
      </td>
      <td className="truncate px-5 py-2.5 text-fg-muted">{contact.title || "—"}</td>
      <td className="truncate px-5 py-2.5">
        {contact.accountId && contact.companyName ? (
          <Link
            href={`/crm/accounts/${contact.accountId}`}
            prefetch={false}
            className="truncate text-accent hover:underline"
          >
            {contact.companyName}
          </Link>
        ) : (
          <span className="text-fg-subtle">No company</span>
        )}
      </td>
      <td className="truncate px-5 py-2.5 font-mono text-fg-muted">
        {contact.phone ? `${formatPhone(contact.phone)}${contact.extension ? ` ×${contact.extension}` : ""}` : "—"}
      </td>
      <td className="truncate px-5 py-2.5 text-fg-muted">{contact.email || "—"}</td>
      <td className="truncate px-5 py-2.5">
        {contact.nextFollowupAt ? (
          <DueCountdown iso={contact.nextFollowupAt} />
        ) : (
          <span className="text-fg-subtle">—</span>
        )}
      </td>
      <td className="px-5 py-2.5 text-right">
        <div className="flex items-center justify-end gap-1.5">
          {contact.phone ? (
            <a href={`tel:${digitsForTel(contact.phone)}`} className={`${CELL_BTN} ${BTN_ACTION}`}>
              <IconPhone width={12} height={12} />
            </a>
          ) : null}
          {contact.email ? (
            <a href={`mailto:${contact.email}`} className={`${CELL_BTN} ${BTN_ACTION}`}>
              <IconMail width={12} height={12} />
            </a>
          ) : null}
          {!contact.phone && !contact.email && <span className="text-[12px] text-fg-subtle">—</span>}
        </div>
      </td>
    </ClickableRow>
  );
}
