"use client";

import { ClickableRow } from "../_shell/ClickableRow";
import { LIST_HEAD_ROW, ZEBRA_ROWS, Badge } from "../_shell/ui";
import { titleCaseWords, upperCaseState, formatDate } from "../_shell/format";
import { shipmentStatusLabel, shipmentStatusBadgeTone } from "./statusMeta";
import type { ShipmentListRow } from "./ShipmentsListClient";

function lane(row: ShipmentListRow): string {
  const from = [titleCaseWords(row.shipperCity), upperCaseState(row.shipperState)].filter(Boolean).join(", ");
  const to = [titleCaseWords(row.consigneeCity), upperCaseState(row.consigneeState)].filter(Boolean).join(", ");
  if (from && to) return `${from} → ${to}`;
  return from || to || "—";
}

/**
 * Desktop (lg+) table rendering of the Shipments list — same ShipmentListRow
 * the mobile ShipmentCard grid consumes.
 *
 * 2026-08-20: rebuilt from the Excel/spreadsheet-style ruled grid to the
 * same clean, borderless zebra-striped table every other CRM list now uses,
 * matching crm-design exactly (same change as CompanyTable/DocumentTable/
 * CarrierTable). Status renders through the shared Badge component.
 */
export function ShipmentTable({ shipments }: { shipments: ShipmentListRow[] }) {
  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr className={LIST_HEAD_ROW}>
          <th className="px-4 py-2.5 text-left">Job #</th>
          <th className="px-4 py-2.5 text-left">Customer</th>
          <th className="px-4 py-2.5 text-left">Lane</th>
          <th className="px-4 py-2.5 text-left">Carrier</th>
          <th className="px-4 py-2.5 text-left">Status</th>
          <th className="px-4 py-2.5 text-left">Pickup</th>
          <th className="px-4 py-2.5 text-left">Delivery</th>
          <th className="px-4 py-2.5 text-right">Docs</th>
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
      <td className="px-4 py-3 truncate font-semibold text-fg">{shipment.shipmentNumber}</td>
      <td className="px-4 py-3 truncate text-fg-muted">
        {shipment.customerName ? titleCaseWords(shipment.customerName) : "—"}
      </td>
      <td className="px-4 py-3 truncate text-fg-muted">{lane(shipment)}</td>
      <td className="px-4 py-3 truncate text-fg-muted">
        {shipment.carrierName ? titleCaseWords(shipment.carrierName) : "—"}
      </td>
      <td className="px-4 py-3">
        <Badge tone={shipmentStatusBadgeTone(shipment.status)}>{shipmentStatusLabel(shipment.status)}</Badge>
      </td>
      <td className="px-4 py-3 truncate text-fg-muted">{formatDate(shipment.pickupAt)}</td>
      <td className="px-4 py-3 truncate text-fg-muted">{formatDate(shipment.deliveryAt)}</td>
      <td className="px-4 py-3 text-right tabular-nums text-fg-muted">
        {shipment.rateConfirmationCount + shipment.bolCount > 0
          ? `${shipment.rateConfirmationCount} RC · ${shipment.bolCount} BOL`
          : "—"}
      </td>
    </ClickableRow>
  );
}
