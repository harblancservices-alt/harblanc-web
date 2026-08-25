"use client";

import { useState, type ReactNode } from "react";
import { SegmentedTabs } from "../../_shell/SegmentedTabs";

const TABS = [
  { key: "customers", label: "Active Customers" },
  { key: "shipments", label: "Shipments" },
  { key: "documents", label: "BOL / RC" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/**
 * The Active Clients hub's inner tab bar — client-side only, no route
 * change/reload when switching. Every panel is passed in already rendered
 * (server-fetched by the page above) and stays mounted, just hidden, same
 * "state survives tab switches" reasoning as accounts/[id]/ProfileCenterTabs.
 * A per-tab action button (New Shipment) renders in a small row above the
 * panel, only for the tab that owns it — Active Customers and BOL/RC are
 * read-only views with nothing to create.
 *
 * WAS FOUR TABS. "Carriers" came out 2026-08-22 when the carrier directory
 * became its own Operations sub-tab (../carriers) — the same directory in
 * two places inside one tab strip would have been a step backwards, not a
 * convenience. Nothing was lost: carrier CRUD, search and the detail route
 * are all intact one tab over.
 *
 * On mobile the strip is a 3-column grid so all tabs fit on screen with no
 * horizontal scroll (labels wrap to two lines if needed); at `sm:` it
 * reverts to the original horizontally-scrollable segmented control.
 */
export function ActiveCustomersTabs({
  activeCustomers,
  shipments,
  shipmentActions,
  documents,
}: {
  activeCustomers: ReactNode;
  shipments: ReactNode;
  shipmentActions?: ReactNode;
  documents: ReactNode;
}) {
  const [tab, setTab] = useState<TabKey>("customers");

  const actionsByTab: Partial<Record<TabKey, ReactNode>> = {
    shipments: shipmentActions,
  };
  const currentActions = actionsByTab[tab];

  return (
    <div className="space-y-4">
      {/* INNER row — the small size, under Operations' own large one. The
          old three-column mobile grid goes with the hand-rolled markup; the
          segmented track hugs its content and scrolls if it has to, which is
          what every other tab row in the CRM now does. */}
      <SegmentedTabs
        ariaLabel="Active Clients"
        items={TABS.map((t) => ({
          key: t.key,
          label: t.label,
          active: tab === t.key,
          onSelect: () => setTab(t.key),
        }))}
      />

      {currentActions && <div className="flex justify-end">{currentActions}</div>}

      <div className={tab === "customers" ? "" : "hidden"}>{activeCustomers}</div>
      <div className={tab === "shipments" ? "" : "hidden"}>{shipments}</div>
      <div className={tab === "documents" ? "" : "hidden"}>{documents}</div>
    </div>
  );
}
