import Link from "next/link";
import {
  LEAD_STATUS_CLASSES,
  LEAD_STATUS_LABELS,
  type LeadStatus,
} from "@/lib/dispatch/status";

/**
 * IdentityRow — slim top row above the LaneHero.
 *
 * Replaces the larger WorkspaceHeader as the at-top identity surface.
 * The hero (city → city) carries the visual weight now; this row only
 * holds the eyebrow breadcrumb, the customer name as a small caption,
 * the status pill, and the rate readout.
 *
 * Two stripes:
 *   1. Eyebrow row — back link + "RC-XXXX" + received-time
 *   2. Identity row — customer · status pill | rate
 */

export type IdentityRowProps = {
  customerName: string;
  shortRequestId: string;
  receivedRelative: string;
  receivedFull: string;
  leadStatus: LeadStatus;
  /** Pre-formatted rate display ("$3,200" / "$2,500 – $3,200" / null). */
  rateDisplay: string | null;
  /** Label to put above the rate (e.g. "Range", "Final"). */
  rateLabel?: string;
  /** Whether the lead is in trash — drives the back-link target. */
  isTrashed: boolean;
};

export function IdentityRow({
  customerName,
  shortRequestId,
  receivedFull,
  leadStatus,
  rateDisplay,
  rateLabel,
  isTrashed,
}: IdentityRowProps) {
  const backHref = isTrashed ? "/admin/quotes/trash" : "/admin/loads";
  const backLabel = isTrashed ? "All trash" : "All loads";
  const statusLabel = LEAD_STATUS_LABELS[leadStatus];
  const statusClasses = LEAD_STATUS_CLASSES[leadStatus];
  const showRate = Boolean(rateDisplay);

  return (
    <div>
      {/* Identity command bar (top breadcrumb/received bar removed). Back
          arrow + load id live inline here so navigation isn't lost. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-md bg-bar px-3.5 py-2.5 shadow-md">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Link
            href={backHref}
            prefetch={false}
            aria-label={backLabel}
            title={backLabel}
            className="inline-flex items-center text-bar-fg/55 transition-colors hover:text-bar-fg"
          >
            <ArrowLeft />
          </Link>
          <span className="text-[15px] font-semibold text-bar-fg xl:text-[17px]">{customerName}</span>
          <span
            className={
              "inline-flex items-center justify-center rounded-sm border px-2 py-[2px] font-mono text-[9px] font-semibold uppercase tracking-[0.16em] xl:text-[10.5px] xl:px-2.5 xl:py-[3px] " +
              statusClasses
            }
          >
            {statusLabel}
          </span>
          <span
            className="font-mono text-[10px] uppercase tracking-[0.12em] text-bar-fg/40"
            title={receivedFull}
          >
            {shortRequestId}
          </span>
        </div>
        {showRate ? (
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-bar-fg/55 xl:text-[11px]">
              {rateLabel ?? "Rate"}
            </span>
            <span className="font-mono text-[15px] font-bold tabular-nums text-emerald-300 xl:text-[17px]">
              {rateDisplay}
            </span>
          </div>
        ) : (
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-bar-fg/55 xl:text-[11px]">
              Rate
            </span>
            <span className="font-mono text-[15px] text-bar-fg/50 xl:text-[17px]">
              Not priced
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function ArrowLeft() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M19 12H5M11 18l-6-6 6-6" />
    </svg>
  );
}
