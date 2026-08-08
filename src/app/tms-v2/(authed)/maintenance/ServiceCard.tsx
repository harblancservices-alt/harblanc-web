import Link from "next/link";
import { DateTimeCST } from "@/components/tms-v2/ui/DateTimeCST";
import type { ServiceTypeCard as ServiceTypeCardData } from "@/lib/data/maintenance";

/** Same overdue/soon/ok color scheme _components/parts.tsx's
 * MaintenanceStatusBadge already used for the old reminders grid — kept
 * consistent rather than inventing new colors, just displayed uppercase
 * per Brent's mockup (OK / DUE SOON / OVERDUE). "baseline" (has an
 * interval, never serviced) gets its own neutral label rather than being
 * forced into one of those three. */
const STATUS_META: Record<string, { label: string; badgeClass: string }> = {
  overdue: { label: "Overdue", badgeClass: "bg-bad-bg text-bad" },
  soon: { label: "Due soon", badgeClass: "bg-warn-bg text-warn" },
  ok: { label: "OK", badgeClass: "bg-ok-bg text-ok" },
  baseline: { label: "Set baseline", badgeClass: "bg-elevated text-fg-muted" },
};

/** "in 1,249 mi" (still ahead) / "851 mi ago" (past due) — Brent's exact
 * mockup phrasing, distinct from the old reminders grid's "X mi left"/"X mi
 * over" wording. */
export function dueLineText(milesRemaining: number | null): string | null {
  if (milesRemaining == null) return null;
  if (milesRemaining > 0) return `in ${milesRemaining.toLocaleString()} mi`;
  return `${Math.abs(milesRemaining).toLocaleString()} mi ago`;
}

export function ServiceCard({ type }: { type: ServiceTypeCardData }) {
  const meta = type.status ? STATUS_META[type.status] : null;
  const due = dueLineText(type.milesRemaining);

  return (
    <Link
      href={`/tms-v2/maintenance/type/${type.slug}`}
      className="flex items-center justify-between gap-3 rounded-xl border border-line bg-card px-4 py-3 shadow-e1 hover:bg-elevated"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold text-fg">{type.label}</div>
        <div className="mt-0.5 truncate text-[12.5px] text-fg-muted">
          {type.lastOdo != null ? (
            <>
              Last {type.lastOdo.toLocaleString()} mi
              {type.lastDate ? (
                <>
                  {" "}
                  · <DateTimeCST value={type.lastDate} mode="date" />
                </>
              ) : null}
            </>
          ) : (
            "Never serviced"
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {meta ? (
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${meta.badgeClass}`}>
            {meta.label}
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-elevated px-2.5 py-0.5 text-[11px] font-medium text-fg-muted">No interval set</span>
        )}
        {due ? <span className="text-[12px] font-medium text-fg-muted">{due}</span> : null}
      </div>
    </Link>
  );
}
