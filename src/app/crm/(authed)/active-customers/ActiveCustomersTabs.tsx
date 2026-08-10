"use client";

import { useState, type ReactNode } from "react";

const TABS = [
  { key: "customers", label: "Active Customers" },
  { key: "carriers", label: "Carriers" },
  { key: "shipments", label: "Shipments" },
  { key: "documents", label: "BOL / RC" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/**
 * The Active Customers hub's top tab bar — client-side only, no route
 * change/reload when switching. Every panel is passed in already rendered
 * (server-fetched by the page above) and stays mounted, just hidden, same
 * "state survives tab switches" reasoning as accounts/[id]/ProfileCenterTabs.
 * A per-tab action button (Add carrier / New Shipment) renders in a small
 * row above the panel, only for the tab that owns it — Active Customers and
 * BOL/RC are read-only views with nothing to create.
 *
 * The tab strip's own `overflow-x-auto` doubles as the mobile layout: on a
 * narrow viewport it reads as a horizontally-scrollable segmented control
 * rather than wrapping, with generous mobile-first padding for tap targets.
 */
export function ActiveCustomersTabs({
  activeCustomers,
  carriers,
  carrierActions,
  shipments,
  shipmentActions,
  documents,
}: {
  activeCustomers: ReactNode;
  carriers: ReactNode;
  carrierActions?: ReactNode;
  shipments: ReactNode;
  shipmentActions?: ReactNode;
  documents: ReactNode;
}) {
  const [tab, setTab] = useState<TabKey>("customers");

  const actionsByTab: Partial<Record<TabKey, ReactNode>> = {
    carriers: carrierActions,
    shipments: shipmentActions,
  };
  const currentActions = actionsByTab[tab];

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Active Customers hub"
        className="flex gap-1 overflow-x-auto rounded-lg border border-line-strong bg-inset p-1.5 shadow-e2"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 rounded-md px-4 py-3 text-[13.5px] font-bold transition-all sm:py-2.5 ${
              tab === t.key
                ? "bg-card text-accent shadow-e2 ring-1 ring-line-strong"
                : "text-fg-muted hover:bg-card/60 hover:text-fg"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {currentActions && <div className="flex justify-end">{currentActions}</div>}

      <div className={tab === "customers" ? "" : "hidden"}>{activeCustomers}</div>
      <div className={tab === "carriers" ? "" : "hidden"}>{carriers}</div>
      <div className={tab === "shipments" ? "" : "hidden"}>{shipments}</div>
      <div className={tab === "documents" ? "" : "hidden"}>{documents}</div>
    </div>
  );
}
