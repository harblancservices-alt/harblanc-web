import { LEAD_STATUS_LABELS, isLeadStatus, type LeadStatus } from "@/lib/dispatch/status";

/**
 * Lead status → tone, scoped to the Operations screens. The real 13-state
 * pipeline (current-tms-audit.md §13, `src/lib/dispatch/status.ts`) is a
 * different vocabulary than `lib/domain/status.ts`'s "lead" domain (an
 * earlier, provisional 11-state guess from before this data layer existed)
 * — rather than overwrite that shared registry mid-phase while other
 * module sessions may depend on it, this stays a small, colocated
 * resolver, the same pattern the Brokers screens already use for their
 * own status vocabulary (`brokers/_lib/broker-status.tsx`).
 *
 * Tone mapping follows v2-design.md's semantic-color rule: neutral (gray)
 * for pre-commercial stages, ok (green) once the deal is booked or
 * delivered, info (blue) while it's actively dispatched/moving, warn
 * (orange) while money is outstanding, bad (red) only for a lost lead.
 * Per-lead time-sensitivity (a stale estimate, an overdue payment) is a
 * SEPARATE signal — see `<UrgencyPill>` — not baked into the status tone.
 */
const TONE_CLASSES = {
  ok: "bg-ok-bg text-ok",
  warn: "bg-warn-bg text-warn",
  bad: "bg-bad-bg text-bad",
  info: "bg-steel-bg text-steel",
  neutral: "bg-elevated text-fg-muted",
} as const;

type Tone = keyof typeof TONE_CLASSES;

const TONE_BY_STATUS: Record<LeadStatus, Tone> = {
  new: "neutral",
  contacted: "neutral",
  estimate_sent: "neutral",
  awaiting_confirmation: "neutral",
  booked: "ok",
  awaiting_payment: "warn",
  ready_to_dispatch: "info",
  dispatched: "info",
  picked_up: "info",
  in_transit: "info",
  delivered: "ok",
  archived: "neutral",
  lost: "bad",
};

export function LeadStatusPill({ status, className = "" }: { status: string; className?: string }) {
  const known = isLeadStatus(status);
  const label = known ? LEAD_STATUS_LABELS[status] : status;
  const tone: Tone = known ? TONE_BY_STATUS[status] : "neutral";
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-medium ${TONE_CLASSES[tone]} ${className}`}>
      {label}
    </span>
  );
}
