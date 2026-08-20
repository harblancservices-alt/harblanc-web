"use client";

import { useMemo, useState } from "react";
import { Card, CardHead, EmptyState } from "../_shell/ui";
import { CONTROL } from "../_shell/form";
import { IconTruck, IconSearch } from "../_shell/icons";
import { ShipmentCard } from "./ShipmentCard";
import { ShipmentTable } from "./ShipmentTable";

/** Plain-data shape ShipmentCard/ShipmentTable render — a subset of
 * CrmShipmentSummary's fields, passed down from the server page. */
export type ShipmentListRow = {
  id: string;
  shipmentNumber: string;
  status: string;
  customerName: string | null;
  shipperCity: string | null;
  shipperState: string | null;
  consigneeCity: string | null;
  consigneeState: string | null;
  carrierName: string | null;
  pickupAt: string | null;
  deliveryAt: string | null;
  rateConfirmationCount: number;
  bolCount: number;
};

function matches(row: ShipmentListRow, q: string): boolean {
  const haystack = [
    row.shipmentNumber,
    row.customerName,
    row.shipperCity,
    row.shipperState,
    row.consigneeCity,
    row.consigneeState,
    row.carrierName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

/** Client-side search over the org's shipments — the list is already
 * everything listShipments() returns (no server-side query param on that
 * action), so filtering here by number/customer/lane/carrier is instant and
 * needs no round trip. Mobile renders ShipmentCard's grid, desktop (md+)
 * renders ShipmentTable — same split as Companies/Active Customers. */
export function ShipmentsListClient({ shipments }: { shipments: ShipmentListRow[] }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const trimmed = q.trim().toLowerCase();
    if (!trimmed) return shipments;
    return shipments.filter((s) => matches(s, trimmed));
  }, [shipments, q]);

  return (
    <div className="space-y-4">
      <Card className="p-3">
        <label className="relative flex items-center">
          <IconSearch width={16} height={16} className="pointer-events-none absolute left-3 text-fg-subtle" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search job #, customer, lane, carrier…"
            className={`h-10 w-full pl-9 ${CONTROL}`}
          />
        </label>
      </Card>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconTruck />}
            title={shipments.length === 0 ? "No shipments yet" : "No shipments match"}
            body={
              shipments.length === 0
                ? "Create your first shipment to start building rate confirmations and BOLs from it."
                : "Try a different search."
            }
          />
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-2.5 lg:hidden">
            {filtered.map((s) => (
              <ShipmentCard key={s.id} shipment={s} />
            ))}
          </div>

          <Card className="hidden lg:block">
            <CardHead
              title="Shipments"
              hint={`${filtered.length} ${filtered.length === 1 ? "shipment" : "shipments"}`}
            />
            <div className="overflow-x-auto">
              <ShipmentTable shipments={filtered} />
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
