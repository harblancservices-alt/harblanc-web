import type { UrgencyChip } from "@/lib/dispatch/urgency";

/** Renders one lead's top urgency chip (src/lib/dispatch/urgency.ts,
 * reused as-is — v2-design.md §13 keeps `computeUrgency()` as the single
 * urgency vocabulary shared with the notification model, not a per-screen
 * reimplementation). "alert" maps to --bad, "warn" to --warning — the
 * same two severities the design doc's notification model defines. */
const SEVERITY_CLASSES = {
  warn: "bg-warn-bg text-warn",
  alert: "bg-bad-bg text-bad",
} as const;

export function UrgencyPill({ chip }: { chip: UrgencyChip | null }) {
  if (!chip) return null;
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${SEVERITY_CLASSES[chip.severity]}`}>
      {chip.label}
    </span>
  );
}
