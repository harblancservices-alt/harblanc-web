"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
    <div
      role="tablist"
      aria-label="Operations sections"
      className="flex gap-6 overflow-x-auto border-b border-line"
    >
      {TABS.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            prefetch={false}
            role="tab"
            aria-selected={active}
            className={`relative flex shrink-0 items-center gap-1.5 pb-2.5 pt-1 text-[13.5px] transition-colors ${
              active ? "font-semibold text-fg" : "font-normal text-fg-muted hover:text-fg"
            }`}
          >
            {t.label}
            {active && <span aria-hidden className="absolute inset-x-0 -bottom-px h-[3px] rounded-full bg-[#c0272d]" />}
          </Link>
        );
      })}
    </div>
  );
}
