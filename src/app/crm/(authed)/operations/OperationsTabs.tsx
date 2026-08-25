"use client";

import { usePathname } from "next/navigation";
import { SegmentedTabs } from "../_shell/SegmentedTabs";

const TABS: { href: string; label: string; exact: boolean }[] = [
  // Quote Calculator is the section's landing tab, so it owns the bare
  // /crm/operations route (exact match) rather than sitting on its own
  // sub-path — same shape as AdminTabs' "Overview".
  { href: "/crm/operations", label: "Quote Calculator", exact: true },
  { href: "/crm/operations/documents", label: "Documents", exact: false },
  { href: "/crm/operations/loads", label: "Active Loads", exact: false },
  // Shipments and BOL / RC came UP here 2026-08-25 from a second tab row
  // nested inside Active Clients. Operations had two stacked tab rows and the
  // lower one's first tab ("Active Customers") was just this section's own
  // Active Clients tab restated, so it went; these two are real destinations
  // that existed nowhere else, so they moved rather than being deleted.
  //
  // "All Shipments", not "Shipments" — the bare name read as a duplicate of
  // "Active Loads" and the two are not the same set. Both query
  // crm_shipments through listShipments(); ../loads then filters to
  // isActiveShipmentStatus (open/dispatched/in_transit), so a delivered,
  // invoiced or cancelled shipment appears HERE and nowhere else. Active
  // Loads is a strict SUBSET of this tab. The label now says so.
  { href: "/crm/operations/shipments", label: "All Shipments", exact: false },
  // Both moved in 2026-08-22 from their own destinations: Active Clients
  // was the top-level /crm/active-customers nav item, Active Carriers was
  // the standalone /crm/carriers list plus a tab inside that hub. Both old
  // routes now redirect here.
  { href: "/crm/operations/clients", label: "Active Clients", exact: false },
  { href: "/crm/operations/carriers", label: "Active Carriers", exact: false },
  // Generated shipment paperwork. Deliberately last and deliberately NOT
  // merged with "Documents" above — that tab is the uploaded org library
  // (crm_documents); this is crm_rate_confirmations + crm_bills_of_lading.
  { href: "/crm/operations/bol-rc", label: "BOL / RC", exact: false },
];

/**
 * Top-row tab strip for the Operations section — real routes (Link +
 * pathname-based active state), not client-only tab state, following
 * ../admin/AdminTabs.tsx's rule: use routes when a tab drills into its own
 * detail route and needs a real back-navigable URL. Documents kicks off a
 * download, and Active Loads will drill into /crm/shipments/[id] (Phase 3),
 * so both want addressable URLs.
 *
 * Same pill-in-an-inset-bar chrome as AdminTabs, with one difference: the
 * active pill reads in the workspace `text-accent` (steel blue), not
 * `text-admin` (violet) — Operations is visible to every CRM user, so it
 * must not borrow the admin section's reserved color.
 */
export function OperationsTabs() {
  const pathname = usePathname() ?? "";

  return (
    <SegmentedTabs
      ariaLabel="Operations sections"
      size="lg"
      items={TABS.map((t) => ({
        key: t.href,
        label: t.label,
        href: t.href,
        active: t.exact ? pathname === t.href : pathname.startsWith(t.href),
      }))}
    />
  );
}
