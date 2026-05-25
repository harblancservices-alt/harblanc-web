import {
  LEAD_STATUS_LABELS,
  LEAD_STATUS_CLASSES_LIGHT,
  type LeadStatus,
} from "@/lib/dispatch/status";

/**
 * Lightweight status pill. Read-only display — interactive switching
 * lives in StatusSelector. Tier-1 design language: small caps mono
 * label, hard 1px border, no rounded corners.
 *
 * Defensively falls back to a neutral pill if the DB returns a status
 * the code doesn't recognise (e.g. an old row from before the Phase 4A
 * migration ran). Prevents the workspace from crashing on legacy data.
 */
// Phase COLOR-4: light-mode fallback pill for unknown statuses (matches
// the zinc-100 family used by `archived` / `lost` in the light twin set).
const FALLBACK_CLASSES = "border-zinc-300 bg-zinc-100 text-black";

export function StatusBadge({ status }: { status: LeadStatus }) {
  const label = LEAD_STATUS_LABELS[status] ?? String(status).replace(/_/g, " ");
  const cls = LEAD_STATUS_CLASSES_LIGHT[status] ?? FALLBACK_CLASSES;
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 border px-2.5 py-1 font-mono text-xs tracking-[0.12em] uppercase " +
        cls
      }
    >
      <span aria-hidden className="inline-block h-1.5 w-1.5 shrink-0 bg-current opacity-60" />
      {label}
    </span>
  );
}
