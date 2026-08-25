"use client";

import { ClickableListItem } from "../../_shell/ClickableRow";
import { titleCaseWords } from "../../_shell/format";
import { formatStopDateShort } from "../../shipments/timing";
import { CarrierCell, DocPills, LoadStatusBadge, laneLabel } from "./loadCells";
import type { LoadRow } from "./loadRow";

/**
 * MOBILE (below lg) stacked row for the Load Center — the CRM's standard
 * "table on desktop, cards on mobile" fallback, same split ShipmentCard /
 * ShipmentTable already use, so a narrow screen never gets a horizontally
 * scrolling eight-column table.
 *
 * Same data, same components (LoadStatusBadge / DocPills / CarrierCell) as
 * the table — and, same as the table, NO money anywhere.
 */
export function LoadCard({ row }: { row: LoadRow }) {
  return (
    <ClickableListItem
      href={`/crm/shipments/${row.id}`}
      className="flex flex-col gap-2 rounded-lg border border-line-strong bg-card p-3.5 shadow-e1 hover:border-accent/40"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-[14.5px] font-bold text-fg">{row.loadNumber}</span>
        <LoadStatusBadge status={row.status} />
      </div>

      <div className="flex flex-col gap-0.5">
        <span className="truncate text-[13px] font-semibold text-fg">
          {row.customerName ? titleCaseWords(row.customerName) : "No customer"}
        </span>
        <span className="text-[12.5px] text-fg-muted">{laneLabel(row)}</span>
        <span className="text-[12.5px]">
          <CarrierCell carrierName={row.carrierName} />
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-fg-muted">
        <span>
          Pickup <span className="crm-num tabular-nums text-fg">{formatStopDateShort(row.pickupOn)}</span>
        </span>
        <span>
          Delivery <span className="crm-num tabular-nums text-fg">{formatStopDateShort(row.deliveryOn)}</span>
        </span>
      </div>

      <DocPills row={row} />
    </ClickableListItem>
  );
}
