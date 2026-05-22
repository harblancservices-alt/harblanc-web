import {
  LEAD_STATUS_LABELS,
  LEAD_STATUS_CLASSES,
  type LeadStatus,
} from "@/lib/dispatch/status";

/**
 * Lightweight status pill. Read-only display — interactive switching
 * lives in StatusSelector. Tier-1 design language: small caps mono
 * label, hard 1px border, no rounded corners.
 */
export function StatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 border px-2.5 py-1 font-mono text-[9px] tracking-[0.22em] uppercase " +
        LEAD_STATUS_CLASSES[status]
      }
    >
      <span aria-hidden className="inline-block h-1.5 w-1.5 shrink-0 bg-current opacity-60" />
      {LEAD_STATUS_LABELS[status]}
    </span>
  );
}
