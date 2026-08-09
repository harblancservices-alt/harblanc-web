"use client";

import { ClickableRow } from "../_shell/ClickableRow";
import { LIST_HEAD_ROW, ZEBRA_ROWS, GRID_TABLE, GRID_HEAD_CELL, GRID_CELL } from "../_shell/ui";
import { titleCaseWords, upperCaseState, formatDate } from "../_shell/format";
import { shipmentStatusLabel, shipmentStatusTone } from "./statusMeta";
import type { ShipmentListRow } from "./ShipmentsListClient";

function lane(row: ShipmentListRow): string {
  const from = [titleCaseWords(row.shipperCity), upperCaseState(row.shipperState)].filter(Boolean).join(", ");
  const to = [titleCaseWords(row.consigneeCity), upperCaseState(row.consigneeState)].filter(Boolean).join(", ");
  if (from && to) return `${from} → ${to}`;
  return from || to || "—";
}

/** Desktop (md+) table rendering of the Shipments list — same
 * ShipmentListRow the mobile ShipmentCard grid consumes, same ruled-grid
 * treatment as CompanyTable (GRID_TABLE/GRID_HEAD_CELL/GRID_CELL + zebra
 * stripes + ClickableRow). */
export function ShipmentTable({ shipments }: { shipments: ShipmentListRow[] }) {
  return (
    <table className={GRID_TABLE}>
      <colgroup>
        <col className="w-[12%]" />
        <col className="w-[16%]" />
        <col className="w-[22%]" />
        <col className="w-[14%]" />
        <col className="w-[10%]" />
        <col className="w-[10%]" />
        <col className="w-[8%]" />
        <col className="w-[8%]" />
      </colgroup>
      <thead>
        <tr className={LIST_HEAD_ROW}>
          <th className={GRID_HEAD_CELL}>Job #</th>
          <th className={GRID_HEAD_CELL}>Customer</th>
          <th className={GRID_HEAD_CELL}>Lane</th>
          <th className={GRID_HEAD_CELL}>Carrier</th>
          <th className={GRID_HEAD_CELL}>Status</th>
          <th className={GRID_HEAD_CELL}>Pickup</th>
          <th className={GRID_HEAD_CELL}>Delivery</th>
          <th className={`${GRID_HEAD_CELL} text-right`}>Docs</th>
        </tr>
      </thead>
      <tbody className={ZEBRA_ROWS}>
        {shipments.map((s) => (
          <ShipmentTableRow key={s.id} shipment={s} />
        ))}
      </tbody>
    </table>
  );
}

function ShipmentTableRow({ shipment }: { shipment: ShipmentListRow }) {
  return (
    <ClickableRow href={`/crm/shipments/${shipment.id}`}>
      <td className={`${GRID_CELL} truncate font-semibold text-fg`}>{shipment.shipmentNumber}</td>
      <td className={`${GRID_CELL} truncate text-fg-muted`}>
        {shipment.customerName ? titleCaseWords(shipment.customerName) : "—"}
      </td>
      <td className={`${GRID_CELL} truncate text-fg-muted`}>{lane(shipment)}</td>
      <td className={`${GRID_CELL} truncate text-fg-muted`}>
        {shipment.carrierName ? titleCaseWords(shipment.carrierName) : "—"}
      </td>
      <td className={GRID_CELL}>
        <span
          className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10.5px] font-semibold ${shipmentStatusTone(shipment.status)}`}
        >
          {shipmentStatusLabel(shipment.status)}
        </span>
      </td>
      <td className={`${GRID_CELL} truncate text-fg-muted`}>{formatDate(shipment.pickupAt)}</td>
      <td className={`${GRID_CELL} truncate text-fg-muted`}>{formatDate(shipment.deliveryAt)}</td>
      <td className={`${GRID_CELL} text-right tabular-nums text-fg-muted`}>
        {shipment.rateConfirmationCount + shipment.bolCount > 0
          ? `${shipment.rateConfirmationCount} RC · ${shipment.bolCount} BOL`
          : "—"}
      </td>
    </ClickableRow>
  );
}
