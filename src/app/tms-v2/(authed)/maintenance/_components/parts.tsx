import Link from "next/link";
import { Money } from "@/components/tms-v2/ui/Money";
import { DateTimeCST } from "@/components/tms-v2/ui/DateTimeCST";
import type { Freshness, MaintStatus, RecentRepairEntry } from "@/lib/data/maintenance";

/**
 * Presentational building blocks colocated under maintenance/ (not the
 * shared components/tms-v2/ui kit) — v2-architecture.md's Phase 4b
 * concurrency scope keeps this build inside the tms-v2 maintenance route
 * only, so a maintenance-specific status/freshness vocabulary lives here
 * rather than extending <StatusPill>'s shared load/trip/lead domain union.
 */

const STATUS_META: Record<MaintStatus, { label: string; badgeClass: string; barClass: string }> = {
  overdue: { label: "Overdue", badgeClass: "bg-bad-bg text-bad", barClass: "bg-bad" },
  soon: { label: "Due soon", badgeClass: "bg-warn-bg text-warn", barClass: "bg-warn" },
  ok: { label: "OK", badgeClass: "bg-ok-bg text-ok", barClass: "bg-ok" },
  baseline: { label: "No baseline", badgeClass: "bg-elevated text-fg-muted", barClass: "bg-fg-muted" },
};

export function MaintenanceStatusBadge({ status, className = "" }: { status: MaintStatus; className?: string }) {
  const m = STATUS_META[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium ${m.badgeClass} ${className}`}>
      {m.label}
    </span>
  );
}

/** Miles-remaining progress through a reminder's interval — red past due,
 * amber near due, green with room to spare, neutral with no baseline yet. */
export function IntervalBar({ pct, status, className = "" }: { pct: number; status: MaintStatus; className?: string }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-elevated ${className}`}>
      <div className={`h-full rounded-full ${STATUS_META[status].barClass}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

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

export function milesRemainingText(milesRemaining: number | null): string {
  if (milesRemaining == null) return "set baseline";
  if (milesRemaining <= 0) return `${Math.abs(milesRemaining).toLocaleString()} mi over`;
  return `${milesRemaining.toLocaleString()} mi left`;
}

export function RecentEntryRow({ entry }: { entry: RecentRepairEntry }) {
  return (
    <Link
      href={`/tms-v2/maintenance/${entry.id}`}
      className="flex items-center justify-between gap-3 border-b border-line py-2.5 text-[14px] last:border-b-0 hover:bg-elevated"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="min-w-0 truncate font-medium text-fg">{entry.description}</span>
          {entry.receiptCount > 0 ? (
            <span className="shrink-0 text-fg-subtle" title="Has a receipt">
              📎
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-fg-muted">
          <span>{entry.category}</span>
          <span>·</span>
          <DateTimeCST value={entry.date} mode="date" />
          {entry.odometer != null ? <span>· {entry.odometer.toLocaleString()} mi</span> : null}
        </div>
      </div>
      {entry.freshness ? <FreshnessBadge freshness={entry.freshness} className="shrink-0" /> : null}
    </Link>
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
