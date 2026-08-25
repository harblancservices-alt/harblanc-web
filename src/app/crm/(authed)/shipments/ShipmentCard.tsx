"use client";

import { ClickableListItem } from "../_shell/ClickableRow";
import { titleCaseWords, upperCaseState } from "../_shell/format";
import { shipmentStatusLabel, shipmentStatusTone } from "./statusMeta";
import { formatStopDateShort } from "./timing";
import type { ShipmentListRow } from "./ShipmentsListClient";

function lane(row: ShipmentListRow): string {
  const from = [titleCaseWords(row.shipperCity), upperCaseState(row.shipperState)].filter(Boolean).join(", ");
  const to = [titleCaseWords(row.consigneeCity), upperCaseState(row.consigneeState)].filter(Boolean).join(", ");
  if (from && to) return `${from} → ${to}`;
  return from || to || "Lane not set";
}

/** One shipment card in the mobile grid — mirrors CompanyListCard's shape
 * (uniform height, status pill top-right, key facts stacked below). */
export function ShipmentCard({ shipment }: { shipment: ShipmentListRow }) {
  const docCount = shipment.rateConfirmationCount + shipment.bolCount;
  return (
    <ClickableListItem
      href={`/crm/shipments/${shipment.id}`}
      className="flex h-full min-h-[172px] flex-col justify-between rounded-lg border border-line-strong bg-card p-4 shadow-e1 hover:border-accent/40"
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 truncate text-[14.5px] font-bold text-fg">{shipment.shipmentNumber}</p>
          <span
            className={`shrink-0 inline-flex items-center rounded-md px-2 py-0.5 text-[10.5px] font-semibold ${shipmentStatusTone(shipment.status)}`}
          >
            {shipmentStatusLabel(shipment.status)}
          </span>
        </div>

        <p className="truncate text-[13px] font-semibold text-fg">
          {shipment.customerName ? titleCaseWords(shipment.customerName) : "No customer"}
        </p>
        <p className="text-[12.5px] text-fg-muted">{lane(shipment)}</p>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-fg-subtle">
          <span>{shipment.carrierName ? titleCaseWords(shipment.carrierName) : "No carrier"}</span>
          <span>
            {docCount > 0
              ? `${shipment.rateConfirmationCount} RC · ${shipment.bolCount} BOL`
              : "No docs yet"}
          </span>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-x-3 gap-y-1 text-[11.5px] text-fg-subtle">
        <span>Pickup: {formatStopDateShort(shipment.pickupOn)}</span>
        <span>Delivery: {formatStopDateShort(shipment.deliveryOn)}</span>
      </div>
    </ClickableListItem>
  );
}
