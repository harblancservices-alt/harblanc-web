import Link from "next/link";
import {
  LEAD_STATUS_CLASSES,
  LEAD_STATUS_LABELS,
  type LeadStatus,
} from "@/lib/dispatch/status";
import { WorkflowProgress } from "./WorkflowProgress";

/**
 * Dark workspace header for /admin/quotes/[id] (V2 Load surface).
 *
 * Informational only for Phase A — no action buttons. Action surfaces
 * (Send rate con, Send invoice, Resend, etc.) remain inside the
 * existing Pricing / Documents / Overview sections to avoid wiring
 * duplicates or accidentally calling the wrong flow.
 *
 * Header content (top → bottom):
 *   1. Back to all loads
 *   2. Eyebrow ("Load · RC-2026-0042 · received N ago") + customer name
 *      headline
 *   3. Status pill + lane "Pickup → Delivery · N mi" + rate (when known)
 *   4. WorkflowProgress strip (full-width, horizontally scrolls on
 *      narrow viewports)
 */

export type WorkspaceHeaderProps = {
  customerName: string;
  shortRequestId: string;
  receivedRelative: string;
  receivedFull: string;
  leadStatus: LeadStatus;
  pickupLabel: string;
  deliveryLabel: string;
  miles: number | null;
  /** Pre-formatted rate display ("$3,200" / "$2,500–$3,200" / null). */
  rateDisplay: string | null;
  /** Whether the lead is currently in trash. Drives the back-link target. */
  isTrashed: boolean;
};

export function WorkspaceHeader({
  customerName,
  shortRequestId,
  receivedRelative,
  receivedFull,
  leadStatus,
  pickupLabel,
  deliveryLabel,
  miles,
  rateDisplay,
  isTrashed,
}: WorkspaceHeaderProps) {
  const backHref = isTrashed
    ? "/admin/quotes/trash"
    : "/admin/operations?tab=quotes";
  const backLabel = isTrashed ? "All trash" : "All leads";
  const statusLabel = LEAD_STATUS_LABELS[leadStatus];
  const statusClasses = LEAD_STATUS_CLASSES[leadStatus];

  const lane =
    pickupLabel && deliveryLabel
      ? pickupLabel + " → " + deliveryLabel
      : pickupLabel || deliveryLabel || "Lane TBD";

  return (
    <header className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={backHref}
          prefetch={false}
          className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-fg-muted transition-colors hover:bg-card hover:text-fg"
        >
          <ArrowLeft />
          {backLabel}
        </Link>
        <p
          className="font-mono text-[10px] tabular-nums text-fg-subtle"
          title={receivedFull}
        >
          Received {receivedRelative}
        </p>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="font-mono text-[9px] font-bold uppercase tracking-[0.24em] text-fg-subtle">
          Load · {shortRequestId}
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-[24px] font-semibold leading-tight tracking-tight text-fg">
          {customerName}
        </h1>
        <div className="flex items-center gap-3">
          <StatusPill statusClasses={statusClasses} label={statusLabel} />
          {rateDisplay ? (
            <div className="text-right">
              <p className="font-mono text-[8.5px] uppercase tracking-[0.18em] text-fg-subtle">
                Rate
              </p>
              <p className="text-[18px] font-semibold tabular-nums leading-none text-fg">
                {rateDisplay}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 font-mono text-[11px] tabular-nums text-fg-subtle">
        <span className="text-fg-muted">{lane}</span>
        {miles != null ? (
          <>
            <span aria-hidden className="text-zinc-700">
              ·
            </span>
            <span>{miles.toLocaleString()} mi</span>
          </>
        ) : null}
      </div>

      <WorkflowProgress currentStatus={leadStatus} />
    </header>
  );
}

function StatusPill({
  statusClasses,
  label,
}: {
  statusClasses: string;
  label: string;
}) {
  return (
    <span
      className={
        "inline-flex items-center justify-center rounded-sm border px-2 py-[2px] font-mono text-[9px] font-medium uppercase tracking-[0.14em] " +
        statusClasses
      }
    >
      {label}
    </span>
  );
}

function ArrowLeft() {
  return (
    <svg
      width="11"
      height="11"
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
