"use client";

import Link from "next/link";
import { ClickableRow } from "../_shell/ClickableRow";
import { BTN_ACTION, LIST_HEAD_ROW, ZEBRA_ROWS, GRID_TABLE, GRID_HEAD_CELL, GRID_CELL } from "../_shell/ui";
import { IconMail, IconPhone } from "../_shell/icons";
import { formatDate } from "../_shell/format";
import { digitsForTel } from "../_shell/contactFields";
import { formatPhone } from "@/lib/domain/phone";
import { ROLE_CATEGORIES, ROLE_LABEL, ROLE_TONE, type CrmPersonRoleCategory } from "../accounts/[id]/roles";
import type { ContactCardData } from "./ContactListCard";

const CELL_BTN =
  "inline-flex h-7 items-center justify-center gap-1.5 rounded-lg px-2 text-[12px] font-semibold transition-colors";

function knownRole(value: string | null): CrmPersonRoleCategory | null {
  return value && (ROLE_CATEGORIES as readonly string[]).includes(value) ? (value as CrmPersonRoleCategory) : null;
}

/**
 * Desktop (md+) table rendering of the global Contacts directory —
 * Excel/spreadsheet-style ruled grid (Brent's approved mockup), same
 * ContactCardData the mobile ContactListCard grid already consumes. "Role"
 * uses the real crm_contacts.role_category colored pill (roles.ts) rather
 * than the free-text job title, matching the "colored pills per existing
 * tokens" spec; "Last contacted" is the real crm_contacts.last_contacted_at
 * column (bumped by calls/actions.ts on every logged call).
 */
export function ContactTable({ contacts }: { contacts: ContactCardData[] }) {
  return (
    <table className={GRID_TABLE}>
      <colgroup>
        <col className="w-[18%]" />
        <col className="w-[13%]" />
        <col className="w-[16%]" />
        <col className="w-[15%]" />
        <col className="w-[17%]" />
        <col className="w-[11%]" />
        <col className="w-[10%]" />
      </colgroup>
      <thead>
        <tr className={LIST_HEAD_ROW}>
          <th className={GRID_HEAD_CELL}>Name</th>
          <th className={GRID_HEAD_CELL}>Role</th>
          <th className={GRID_HEAD_CELL}>Company</th>
          <th className={GRID_HEAD_CELL}>Phone</th>
          <th className={GRID_HEAD_CELL}>Email</th>
          <th className={GRID_HEAD_CELL}>Last contacted</th>
          <th className={`${GRID_HEAD_CELL} text-right`}>Actions</th>
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
  const role = knownRole(contact.roleCategory);

  return (
    <ClickableRow href={`/crm/contacts/${contact.id}`}>
      <td className={`${GRID_CELL} truncate font-semibold text-fg`}>
        {contact.name}
        {contact.isDecisionMaker && (
          <span className="ml-1.5 inline-flex items-center bg-ok-bg px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-ok">
            DM
          </span>
        )}
      </td>
      <td className={GRID_CELL}>
        {role ? (
          <span className={`inline-flex items-center px-2 py-0.5 text-[10.5px] font-semibold ${ROLE_TONE[role]}`}>
            {ROLE_LABEL[role]}
          </span>
        ) : (
          <span className="text-fg-subtle">—</span>
        )}
      </td>
      <td className={`${GRID_CELL} truncate`}>
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
      <td className={`${GRID_CELL} truncate font-mono text-fg-muted`}>
        {contact.phone ? `${formatPhone(contact.phone)}${contact.extension ? ` ×${contact.extension}` : ""}` : "—"}
      </td>
      <td className={`${GRID_CELL} truncate text-fg-muted`}>{contact.email || "—"}</td>
      <td className={`${GRID_CELL} truncate text-fg-muted`}>
        {contact.lastContactedAt ? formatDate(contact.lastContactedAt) : "—"}
      </td>
      <td className={`${GRID_CELL} text-right`}>
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
