import type { MaintStatus } from "@/lib/dispatch/maintenance";

/**
 * Interval progress bar — same look as the Load Board's net-profit goal bar
 * (rounded-full track on bg-elevated + a rounded-full coloured fill). Shows
 * how far through the current service interval the truck is. Colour follows
 * the item status; "baseline" (never serviced) renders an empty track.
 *
 * Pure presentational — used by the Maintenance cards (client) and the
 * dashboard widget (server).
 */

const FILL: Record<MaintStatus, string> = {
  overdue: "bg-red-600",
  soon: "bg-amber-500",
  ok: "bg-green-600",
  baseline: "bg-line-strong",
};

export function IntervalBar({
  pct,
  status,
  className = "h-2.5",
}: {
  pct: number;
  status: MaintStatus;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div
      className={
        "relative overflow-hidden rounded-full bg-elevated " + className
      }
    >
      {status === "baseline" ? null : (
        <div
          className={"h-full rounded-full transition-all " + FILL[status]}
          style={{ width: `${clamped}%` }}
        />
      )}
    </div>
  );
}
