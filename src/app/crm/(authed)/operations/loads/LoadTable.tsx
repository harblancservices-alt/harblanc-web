"use client";

import { ClickableRow } from "../../_shell/ClickableRow";
import { LIST_HEAD_ROW, ZEBRA_ROWS } from "../../_shell/ui";
import { formatDate, titleCaseWords } from "../../_shell/format";
import { IconChevronDown } from "../../_shell/icons";
import { CarrierCell, DocPills, LoadStatusBadge, laneLabel } from "./loadCells";
import type { LoadRow, SortDir, SortKey } from "./loadRow";

/**
 * DESKTOP (lg+) table for the Load Center — the CRM's own list chrome
 * (LIST_HEAD_ROW header band, ZEBRA_ROWS body, ClickableRow navigation),
 * the same primitives Shipments/Companies/Carriers already use. Nothing
 * here is imported from or modelled on /tms-v2.
 *
 * NO MONEY COLUMN. There is deliberately no customer rate, carrier rate or
 * margin — sales agents work this screen, and LoadRow doesn't even carry
 * those fields (see loadRow.ts).
 *
 * Dates render tabular so the Pickup/Delivery columns stay in a straight
 * line as rows change.
 */

const COLUMNS: { key: SortKey | null; label: string; align?: "right" }[] = [
  { key: "loadNumber", label: "Load #" },
  { key: "status", label: "Status" },
  { key: "pickup", label: "Pickup" },
  { key: "delivery", label: "Delivery" },
  { key: "customer", label: "Customer" },
  { key: null, label: "Lane" },
  { key: "carrier", label: "Carrier" },
  { key: null, label: "Docs" },
];

export function LoadTable({
  loads,
  sortKey,
  sortDir,
  onSort,
}: {
  loads: LoadRow[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr className={LIST_HEAD_ROW}>
          {COLUMNS.map((col) => {
            const active = col.key !== null && col.key === sortKey;
            return (
              <th
                key={col.label}
                scope="col"
                aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
                className={`px-4 py-2.5 text-left ${col.align === "right" ? "text-right" : ""}`}
              >
                {col.key === null ? (
                  col.label
                ) : (
                  <button
                    type="button"
                    onClick={() => onSort(col.key as SortKey)}
                    className={`inline-flex items-center gap-1 transition-colors hover:text-fg ${
                      active ? "text-fg" : ""
                    }`}
                  >
                    {col.label}
                    {active && (
                      <IconChevronDown
                        width={12}
                        height={12}
                        className={sortDir === "asc" ? "rotate-180" : ""}
                      />
                    )}
                  </button>
                )}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody className={ZEBRA_ROWS}>
        {loads.map((row) => (
          <ClickableRow key={row.id} href={`/crm/shipments/${row.id}`}>
            <td className="truncate px-4 py-3 font-semibold text-fg">{row.loadNumber}</td>
            <td className="px-4 py-3">
              <LoadStatusBadge status={row.status} />
            </td>
            <td className="crm-num whitespace-nowrap px-4 py-3 tabular-nums text-fg-muted">
              {formatDate(row.pickupAt)}
            </td>
            <td className="crm-num whitespace-nowrap px-4 py-3 tabular-nums text-fg-muted">
              {formatDate(row.deliveryAt)}
            </td>
            <td className="truncate px-4 py-3 text-fg">
              {row.customerName ? titleCaseWords(row.customerName) : "—"}
            </td>
            <td className="truncate px-4 py-3 text-fg-muted">{laneLabel(row)}</td>
            <td className="truncate px-4 py-3">
              <CarrierCell carrierName={row.carrierName} />
            </td>
            <td className="px-4 py-3">
              <DocPills row={row} />
            </td>
          </ClickableRow>
        ))}
      </tbody>
    </table>
  );
}
