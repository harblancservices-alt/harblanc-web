import {
  LEAD_STATUS_LABELS,
  type LeadStatus,
} from "@/lib/dispatch/status";

/**
 * Lead status pill — Level 6.3 admin palette.
 *
 * Neutral black-outlined pill with a small black dot + uppercase label.
 * The label IS the signal — no color matrix per status. Optional `muted`
 * variant for archived / lost / delivered rows that surface in the
 * expanded-history view.
 */

export function StatusBadge({
  status,
  muted = false,
}: {
  status: LeadStatus;
  muted?: boolean;
}) {
  const label = LEAD_STATUS_LABELS[status] ?? String(status).replace(/_/g, " ");
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 border border-line bg-card px-2 py-0.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-fg " +
        (muted ? "opacity-55" : "")
      }
    >
      <span aria-hidden className="inline-block h-1.5 w-1.5 shrink-0 bg-canvas" />
      {label}
    </span>
  );
}
