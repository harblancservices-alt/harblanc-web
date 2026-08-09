"use client";

import { ClickableRow } from "../_shell/ClickableRow";
import { BTN_ACTION, LIST_HEAD_ROW, ZEBRA_ROWS } from "../_shell/ui";
import { IconPhone } from "../_shell/icons";
import { stageLabel, stageTone } from "../accounts/lifecycle";
import { lastContactStatus } from "../_shell/format";
import { digitsForTel } from "../_shell/contactFields";
import { formatPhone } from "@/lib/domain/phone";
import type { CustomerCardData } from "./CustomerListCard";

/**
 * Desktop (md+) table rendering of Active Customers — same CustomerCardData
 * the mobile CustomerListCard grid consumes. "Last load/contact" reads the
 * same crm_calls + crm_activities rollup Companies already uses; there is no
 * per-account load-volume metric anywhere in the current schema, so rep
 * ownership is shown instead of a fabricated load count.
 */
export function CustomerTable({ customers }: { customers: CustomerCardData[] }) {
  return (
    <table className="w-full table-fixed border-collapse text-[13px]">
      <colgroup>
        <col className="w-[22%]" />
        <col className="w-[22%]" />
        <col className="w-[16%]" />
        <col className="w-[14%]" />
        <col className="w-[13%]" />
        <col className="w-[13%]" />
      </colgroup>
      <thead>
        <tr className={LIST_HEAD_ROW}>
          <th className="px-5 py-2 text-left">Company</th>
          <th className="px-5 py-2 text-left">Primary contact</th>
          <th className="px-5 py-2 text-left">Phone</th>
          <th className="px-5 py-2 text-left">Rep</th>
          <th className="px-5 py-2 text-left">Last contact</th>
          <th className="px-5 py-2 text-right">Actions</th>
        </tr>
      </thead>
      <tbody className={ZEBRA_ROWS}>
        {customers.map((c) => (
          <CustomerTableRow key={c.id} customer={c} />
        ))}
      </tbody>
    </table>
  );
}

function CustomerTableRow({ customer }: { customer: CustomerCardData }) {
  const lastContact = lastContactStatus(customer.lastContactMs);

  return (
    <ClickableRow href={`/crm/accounts/${customer.id}`}>
      <td className="truncate px-5 py-2.5 font-semibold text-fg">
        {customer.name}
        <span
          className={`ml-1.5 inline-flex items-center px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide ${stageTone("customer")}`}
        >
          {stageLabel("customer")}
        </span>
      </td>
      <td className="truncate px-5 py-2.5 text-fg-muted">
        {customer.primaryContactName || <span className="text-fg-subtle">No contact on file</span>}
      </td>
      <td className="truncate px-5 py-2.5 font-mono text-fg-muted">
        {customer.phone ? formatPhone(customer.phone) : "—"}
      </td>
      <td className="truncate px-5 py-2.5 text-fg-muted">{customer.repName || "Unassigned"}</td>
      <td className="truncate px-5 py-2.5 text-fg-muted">
        {lastContact.freshness === "never" ? "Never" : lastContact.text}
      </td>
      <td className="px-5 py-2.5 text-right">
        {customer.phone ? (
          <a
            href={`tel:${digitsForTel(customer.phone)}`}
            className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-[12px] font-semibold transition-colors ${BTN_ACTION}`}
          >
            <IconPhone width={12} height={12} />
            Call
          </a>
        ) : (
          <span className="text-[12px] text-fg-subtle">—</span>
        )}
      </td>
    </ClickableRow>
  );
}
