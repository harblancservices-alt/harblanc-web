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
      className="flex gap-1 overflow-x-auto rounded-lg border border-line-strong bg-inset p-1.5 shadow-e1"
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
            className={`flex shrink-0 items-center gap-1.5 rounded-md px-3.5 py-2 text-[13px] font-bold transition-all ${
              active
                ? "bg-card text-accent shadow-e2 ring-1 ring-line-strong"
                : "text-fg-muted hover:bg-card/60 hover:text-fg"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
