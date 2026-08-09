"use client";

import { ClickableRow } from "../_shell/ClickableRow";
import { BTN_ACTION, LIST_HEAD_ROW, ZEBRA_ROWS, GRID_TABLE, GRID_HEAD_CELL, GRID_CELL } from "../_shell/ui";
import { IconPhone } from "../_shell/icons";
import { titleCaseWords, upperCaseState } from "../_shell/format";
import { digitsForTel } from "../_shell/contactFields";
import { formatPhone } from "@/lib/domain/phone";
import type { CarrierListRow } from "./CarriersListClient";

export function CarrierTable({ carriers }: { carriers: CarrierListRow[] }) {
  return (
    <table className={GRID_TABLE}>
      <colgroup>
        <col className="w-[22%]" />
        <col className="w-[12%]" />
        <col className="w-[12%]" />
        <col className="w-[16%]" />
        <col className="w-[14%]" />
        <col className="w-[10%]" />
        <col className="w-[14%]" />
      </colgroup>
      <thead>
        <tr className={LIST_HEAD_ROW}>
          <th className={GRID_HEAD_CELL}>Carrier</th>
          <th className={GRID_HEAD_CELL}>MC #</th>
          <th className={GRID_HEAD_CELL}>DOT #</th>
          <th className={GRID_HEAD_CELL}>City/State</th>
          <th className={GRID_HEAD_CELL}>Equipment</th>
          <th className={GRID_HEAD_CELL}>Status</th>
          <th className={`${GRID_HEAD_CELL} text-right`}>Phone</th>
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
      <td className={`${GRID_CELL} truncate font-semibold text-fg`}>{titleCaseWords(carrier.name)}</td>
      <td className={`${GRID_CELL} truncate text-fg-muted`}>{carrier.mcNumber || "—"}</td>
      <td className={`${GRID_CELL} truncate text-fg-muted`}>{carrier.dotNumber || "—"}</td>
      <td className={`${GRID_CELL} truncate text-fg-muted`}>{location || "—"}</td>
      <td className={`${GRID_CELL} truncate text-fg-muted`}>{carrier.equipment || "—"}</td>
      <td className={GRID_CELL}>
        <span
          className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10.5px] font-semibold ${
            carrier.status === "active" ? "bg-ok-bg text-ok" : "bg-warn-bg text-warn"
          }`}
        >
          {carrier.status === "active" ? "Active" : "Inactive"}
        </span>
      </td>
      <td className={`${GRID_CELL} text-right`}>
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
