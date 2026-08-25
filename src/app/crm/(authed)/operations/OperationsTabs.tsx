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
  // Both moved in 2026-08-22 from their own destinations: Active Clients
  // was the top-level /crm/active-customers nav item, Active Carriers was
  // the standalone /crm/carriers list plus a tab inside that hub. Both old
  // routes now redirect here.
  { href: "/crm/operations/clients", label: "Active Clients", exact: false },
  { href: "/crm/operations/carriers", label: "Active Carriers", exact: false },
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
