import { Money } from "@/components/tms-v2/ui/Money";
import type { Freshness } from "@/lib/data/maintenance";

/**
 * Presentational building blocks colocated under maintenance/ (not the
 * shared components/tms-v2/ui kit) — v2-architecture.md's Phase 4b
 * concurrency scope keeps this build inside the tms-v2 maintenance route
 * only, so a maintenance-specific status/freshness vocabulary lives here
 * rather than extending <StatusPill>'s shared load/trip/lead domain union.
 *
 * The reminders-grid/recent-log status+row helpers that used to live here
 * (MaintenanceStatusBadge, IntervalBar, milesRemainingText, RecentEntryRow)
 * were removed 2026-08-08 once the Maintenance home was rebuilt around
 * per-service-type cards (ServiceCard.tsx) — that screen no longer renders
 * a reminders grid or a flat repair log. FreshnessBadge/MoneyLine stay:
 * [id]/page.tsx (the per-PART detail page, still reachable, unrelated to
 * the new per-type profile) uses both.
 */

const FRESHNESS_META: Record<Freshness, { label: string; badgeClass: string }> = {
  new: { label: "New", badgeClass: "bg-ok-bg text-ok" },
  aging: { label: "Aging", badgeClass: "bg-warn-bg text-warn" },
  original: { label: "Original", badgeClass: "bg-elevated text-fg-muted" },
};

export function FreshnessBadge({ freshness, className = "" }: { freshness: Freshness; className?: string }) {
  const m = FRESHNESS_META[freshness];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${m.badgeClass} ${className}`}>
      {m.label}
    </span>
  );
}

export function MoneyLine({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: number | null;
  bold?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between py-2.5 text-[14px] ${bold ? "font-semibold" : ""}`}>
      <span className="text-fg-muted">{label}</span>
      <Money value={value} tone="none" />
    </div>
  );
}
