"use client";

import { ClickableRow } from "../_shell/ClickableRow";
import { BTN_ACTION, LIST_HEAD_ROW, ZEBRA_ROWS, Badge } from "../_shell/ui";
import { IconPhone } from "../_shell/icons";
import { titleCaseWords, upperCaseState } from "../_shell/format";
import { digitsForTel } from "../_shell/contactFields";
import { formatPhone } from "@/lib/domain/phone";
import type { CarrierListRow } from "./CarriersListClient";

/**
 * 2026-08-20: rebuilt from the Excel/spreadsheet-style ruled grid to the
 * same clean, borderless zebra-striped table every other CRM list now uses,
 * matching crm-design exactly. Status renders through the shared Badge
 * component (rounded-full pill) instead of a hand-rolled rounded-md chip.
 */
export function CarrierTable({ carriers }: { carriers: CarrierListRow[] }) {
  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr className={LIST_HEAD_ROW}>
          <th className="px-4 py-2.5 text-left">Carrier</th>
          <th className="px-4 py-2.5 text-left">MC #</th>
          <th className="px-4 py-2.5 text-left">DOT #</th>
          <th className="px-4 py-2.5 text-left">City/State</th>
          <th className="px-4 py-2.5 text-left">Equipment</th>
          <th className="px-4 py-2.5 text-left">Status</th>
          <th className="px-4 py-2.5 text-right">Phone</th>
        </tr>
      </thead>
      <tbody className={ZEBRA_ROWS}>
        {carriers.map((c) => (
          <CarrierTableRow key={c.id} carrier={c} />
        ))}
      </tbody>
    </table>
  );
}

function CarrierTableRow({ carrier }: { carrier: CarrierListRow }) {
  const location = [titleCaseWords(carrier.city), upperCaseState(carrier.state)].filter(Boolean).join(", ");
  return (
    <ClickableRow href={`/crm/carriers/${carrier.id}`}>
      <td className="px-4 py-3 truncate font-semibold text-fg">{titleCaseWords(carrier.name)}</td>
      <td className="px-4 py-3 truncate text-fg-muted">{carrier.mcNumber || "—"}</td>
      <td className="px-4 py-3 truncate text-fg-muted">{carrier.dotNumber || "—"}</td>
      <td className="px-4 py-3 truncate text-fg-muted">{location || "—"}</td>
      <td className="px-4 py-3 truncate text-fg-muted">{carrier.equipment || "—"}</td>
      <td className="px-4 py-3">
        <Badge tone={carrier.status === "active" ? "success" : "warning"}>
          {carrier.status === "active" ? "Active" : "Inactive"}
        </Badge>
      </td>
      <td className="px-4 py-3 text-right">
        {carrier.phone ? (
          <a
            href={`tel:${digitsForTel(carrier.phone)}`}
            className={`inline-flex h-7 items-center justify-center gap-1.5 rounded-lg px-2.5 text-[12px] font-semibold transition-colors ${BTN_ACTION}`}
          >
            <IconPhone width={12} height={12} />
            {formatPhone(carrier.phone)}
          </a>
        ) : (
          <span className="text-[12px] text-fg-subtle">—</span>
        )}
      </td>
    </ClickableRow>
  );
}
