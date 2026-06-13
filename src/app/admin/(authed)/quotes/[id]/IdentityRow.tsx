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
  receivedRelative,
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
      {/* Eyebrow */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-zinc-400">
          <Link
            href={backHref}
            prefetch={false}
            className="inline-flex items-center gap-1.5 text-[12px] text-zinc-400 transition-colors hover:text-zinc-200 xl:text-[13px]"
          >
            <ArrowLeft />
            <span>{backLabel}</span>
          </Link>
          <span aria-hidden className="text-zinc-700">
            /
          </span>
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500 xl:text-[12px]">
            {shortRequestId}
          </span>
        </div>
        <p
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600 xl:text-[11px]"
          title={receivedFull}
        >
          Received {receivedRelative}
        </p>
      </div>

      {/* Identity */}
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-zinc-800 pb-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="text-[14px] text-zinc-200 xl:text-[16px]">{customerName}</span>
          <span
            className={
              "inline-flex items-center justify-center rounded-sm border px-2 py-[2px] font-mono text-[9px] font-medium uppercase tracking-[0.20em] xl:text-[10.5px] xl:px-2.5 xl:py-[3px] " +
              statusClasses
            }
          >
            {statusLabel}
          </span>
        </div>
        {showRate ? (
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[9px] font-medium uppercase tracking-[0.20em] text-zinc-500 xl:text-[10.5px]">
              {rateLabel ?? "Rate"}
            </span>
            <span className="font-mono text-[13px] tabular-nums text-white xl:text-[15px]">
              {rateDisplay}
            </span>
          </div>
        ) : (
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[9px] font-medium uppercase tracking-[0.20em] text-zinc-500 xl:text-[10.5px]">
              Rate
            </span>
            <span className="font-mono text-[13px] text-zinc-600 xl:text-[15px]">
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
