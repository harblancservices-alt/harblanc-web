"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { relativeTime, formatDateFull } from "@/lib/admin/format";
import { addDispatchNote } from "../actions";
import { LEAD_STATUS_LABELS, type LeadStatus } from "@/lib/dispatch/status";

/**
 * Communication timeline — append-only event log for a lead.
 *
 * Renders dispatch_events newest-first. Each event is one row with:
 *   - a colored event marker dot
 *   - relative timestamp + tooltip with full timestamp
 *   - kind label
 *   - short payload-derived description
 *
 * Includes a "Add note" composer at top for free-form operational notes.
 *
 * Phase 5C audit fix: added render branches for estimate_accepted,
 * estimate_declined, intake_submitted, and the full finalized_quote_* /
 * bol_* event families. Previously they fell through to the default
 * (raw kind name + neutral dot + no description).
 */

export type DispatchEvent = {
  id: string;
  kind: string;
  payload: Record<string, unknown> | null;
  created_at: string;
};

const KIND_LABELS: Record<string, string> = {
  lead_received: "Lead received",
  ack_sent: "Acknowledgement sent",
  ack_failed: "Acknowledgement failed",
  dispatch_alert_sent: "Dispatch alert sent",
  dispatch_alert_failed: "Dispatch alert failed",
  status_changed: "Status changed",
  estimate_draft_saved: "Draft saved",
  estimate_sent: "Estimate sent",
  estimate_send_failed: "Estimate send failed",
  estimate_accepted: "Customer accepted estimate",
  estimate_declined: "Customer declined estimate",
  intake_submitted: "Customer submitted intake",
  finalized_quote_draft_started: "Finalized quote draft started",
  finalized_quote_draft_saved: "Finalized quote draft saved",
  finalized_quote_preview_built: "Finalized quote preview built",
  finalized_quote_sent: "Finalized quote sent",
  finalized_quote_send_failed: "Finalized quote send failed",
  bol_draft_started: "BOL draft started",
  bol_draft_saved: "BOL draft saved",
  bol_preview_built: "BOL preview built",
  bol_sent: "BOL sent",
  bol_send_failed: "BOL send failed",
  pdf_generated: "Quote PDF generated",
  // Phase P1A: payment event labels reserved for when payment-actions
  // start emitting them (Phase P1B). Declared here so CommTimeline
  // renders them with the correct label/dot from day one.
  payment_recorded: "Payment recorded",
  payment_completed: "Paid in full",
  // Phase Q1: redelivery of a sent document using the original's
  // persisted preview bytes (preview/send byte parity preserved).
  estimate_resent: "Estimate resent",
  finalized_quote_resent: "Finalized quote resent",
  bol_resent: "BOL resent",
  // Phase Q2: bounce ingestion. Labels stay neutral — the dot class and
  // the describe() text carry the severity (hard vs soft) and the
  // upstream reason string.
  estimate_bounced: "Estimate bounced",
  finalized_quote_bounced: "Finalized quote bounced",
  bol_bounced: "BOL bounced",
  email_complained: "Recipient marked as spam",
  note: "Note",
};

const KIND_DOT_CLASSES: Record<string, string> = {
  lead_received: "bg-red-500",
  ack_sent: "bg-green-500",
  ack_failed: "bg-red-500",
  dispatch_alert_sent: "bg-blue-500",
  dispatch_alert_failed: "bg-red-500",
  status_changed: "bg-amber-500",
  estimate_draft_saved: "bg-neutral-400",
  estimate_sent: "bg-green-500",
  estimate_send_failed: "bg-red-500",
  estimate_accepted: "bg-green-500",
  estimate_declined: "bg-red-500",
  intake_submitted: "bg-green-500",
  finalized_quote_draft_started: "bg-neutral-400",
  finalized_quote_draft_saved: "bg-neutral-400",
  finalized_quote_preview_built: "bg-amber-500",
  finalized_quote_sent: "bg-green-500",
  finalized_quote_send_failed: "bg-red-500",
  bol_draft_started: "bg-neutral-400",
  bol_draft_saved: "bg-neutral-400",
  bol_preview_built: "bg-amber-500",
  bol_sent: "bg-emerald-500",
  bol_send_failed: "bg-red-500",
  pdf_generated: "bg-blue-500",
  // Phase P1A: payment events use the same green family as other
  // commercial-success events (estimate_sent, intake_submitted, etc.).
  // "Paid in full" gets the strongest emerald to call out the moment
  // money settles and the load is cleared to dispatch.
  payment_recorded: "bg-green-500",
  payment_completed: "bg-emerald-500",
  // Phase Q1: resend events use the same blue family as other
  // outbound-delivery moments (dispatch_alert_sent) so they read as
  // "an email went out" without conflating with a fresh send.
  estimate_resent: "bg-blue-500",
  finalized_quote_resent: "bg-blue-500",
  bol_resent: "bg-blue-500",
  // Phase Q2: bounce events all use red — they represent a failed or
  // refused delivery. Operators should treat them with the same urgency
  // as send-failed events. We deliberately do NOT use amber for soft
  // bounces here, because the timeline is the operator's audit trail,
  // not a triage queue — the per-row badge in the Sent list carries the
  // hard/soft distinction visually.
  estimate_bounced: "bg-red-500",
  finalized_quote_bounced: "bg-red-500",
  bol_bounced: "bg-red-500",
  email_complained: "bg-red-500",
  note: "bg-neutral-400",
};

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function describe(event: DispatchEvent): string {
  const p = event.payload ?? {};
  switch (event.kind) {
    case "status_changed": {
      const from = String(p.from ?? "");
      const to = String(p.to ?? "");
      const fromLabel = LEAD_STATUS_LABELS[from as LeadStatus] ?? from;
      const toLabel = LEAD_STATUS_LABELS[to as LeadStatus] ?? to;
      return `${fromLabel} → ${toLabel}`;
    }
    case "ack_sent":
    case "estimate_sent":
      return p.to ? `to ${String(p.to)}` : "";
    case "ack_failed":
    case "dispatch_alert_failed":
    case "estimate_send_failed":
      return p.reason ? String(p.reason) : "";
    case "estimate_draft_saved": {
      const low = p.linehaulLow as number | null;
      const high = p.linehaulHigh as number | null;
      if (low == null) return "no rate set yet";
      if (high == null) return `$${low}`;
      return `$${low}–$${high}`;
    }
    case "estimate_accepted": {
      const mode = String(p.mode ?? "");
      if (mode === "submit") {
        return "accepted via Submit (intake also submitted)";
      }
      if (mode === "save") {
        return "accepted via Save Progress";
      }
      return "accepted";
    }
    case "estimate_declined":
      return p.reason ? String(p.reason) : "no reason given";
    case "intake_submitted":
      return "shipment details finalized";
    case "finalized_quote_draft_started":
    case "finalized_quote_draft_saved":
    case "finalized_quote_preview_built":
    case "finalized_quote_sent": {
      const num = p.finalizedQuoteNumber ? String(p.finalizedQuoteNumber) : "";
      const total = typeof p.totalAmount === "number" ? fmtUsd(p.totalAmount) : null;
      if (num && total) return `${num} · ${total}`;
      if (num) return num;
      if (total) return total;
      return "";
    }
    case "finalized_quote_send_failed":
      return p.reason ? String(p.reason) : "";
    case "bol_draft_started":
    case "bol_draft_saved":
    case "bol_preview_built":
    case "bol_sent": {
      const num = p.bolNumber ? String(p.bolNumber) : "";
      const to = p.to ? `to ${String(p.to)}` : "";
      if (num && to) return `${num} · ${to}`;
      return num || to;
    }
    case "bol_send_failed":
      return p.reason ? String(p.reason) : "";
    case "pdf_generated":
      return p.quoteNumber ? String(p.quoteNumber) : "";
    case "payment_recorded": {
      // Phase P1A: render the amount + method (+ reference if present).
      // Payload shape is set by the future payment-actions in Phase P1B;
      // this branch already handles partial payloads gracefully.
      const amount =
        typeof p.amount === "number" ? fmtUsd(p.amount) : null;
      const method = p.method ? String(p.method) : null;
      const reference = p.reference ? String(p.reference) : null;
      const parts: string[] = [];
      if (amount) parts.push(amount);
      if (method) parts.push(`via ${method.replace(/_/g, " ")}`);
      if (reference) parts.push(reference);
      return parts.join(" · ");
    }
    case "payment_completed": {
      // Phase P1A: rendered when the FQ flips paid-in-full. Show the
      // FQ number + total so the timeline anchors the dollar moment.
      // Payload key aligned with Phase P1B's typed payload schema in
      // src/lib/dispatch/events.ts (finalizedQuoteNumber, not fqNumber).
      const fqNum = p.finalizedQuoteNumber
        ? String(p.finalizedQuoteNumber)
        : "";
      const total =
        typeof p.totalAmount === "number" ? fmtUsd(p.totalAmount) : null;
      if (fqNum && total) return `${fqNum} · ${total}`;
      if (fqNum) return fqNum;
      if (total) return total;
      return "";
    }
    case "estimate_resent":
    case "finalized_quote_resent":
    case "bol_resent": {
      // Phase Q1: render the destination + (optional) operator note.
      // The doc number is in the payload for FQ/BOL but not estimates
      // (estimates have no number) — surface whatever is available.
      const to = p.to ? `to ${String(p.to)}` : "";
      const num = p.finalizedQuoteNumber
        ? String(p.finalizedQuoteNumber)
        : p.bolNumber
          ? String(p.bolNumber)
          : "";
      const reason = p.reason ? String(p.reason) : "";
      const parts: string[] = [];
      if (num) parts.push(num);
      if (to) parts.push(to);
      if (reason) parts.push(reason);
      return parts.join(" · ");
    }
    case "estimate_bounced":
    case "finalized_quote_bounced":
    case "bol_bounced": {
      // Phase Q2: render kind + recipient + upstream reason. The kind
      // ("hard"/"soft"/"complaint") is the most important fact since it
      // determines what the operator should do next (chase a new
      // address vs wait out a transient failure).
      const kind = p.kind ? String(p.kind) : "";
      const to = p.to ? `to ${String(p.to)}` : "";
      const num = p.finalizedQuoteNumber
        ? String(p.finalizedQuoteNumber)
        : p.bolNumber
          ? String(p.bolNumber)
          : "";
      const reason = p.reason ? String(p.reason) : "";
      const parts: string[] = [];
      if (kind) parts.push(`${kind} bounce`);
      if (num) parts.push(num);
      if (to) parts.push(to);
      if (reason) parts.push(reason);
      return parts.join(" · ");
    }
    case "email_complained": {
      // Phase Q2: complaint is "this recipient marked our mail as spam".
      // No hard/soft kind — render the doc number (if any) and recipient.
      const to = p.to ? `to ${String(p.to)}` : "";
      const num = p.docNumber ? String(p.docNumber) : "";
      const parts: string[] = [];
      if (num) parts.push(num);
      if (to) parts.push(to);
      return parts.join(" · ");
    }
    case "note":
      return p.body ? String(p.body) : "";
    default:
      return "";
  }
}

export function CommTimeline({
  quoteRequestId,
  events,
}: {
  quoteRequestId: string;
  events: DispatchEvent[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [noteBody, setNoteBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onAddNote() {
    setError(null);
    const trimmed = noteBody.trim();
    if (!trimmed) return;
    const fd = new FormData();
    fd.append("quote_request_id", quoteRequestId);
    fd.append("body", trimmed);
    startTransition(async () => {
      try {
        await addDispatchNote(fd);
        setNoteBody("");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not add note.");
      }
    });
  }

  return (
    <section className="space-y-5">
      <p className="max-w-2xl text-sm leading-relaxed text-neutral-400">
        Append-only event log. Add notes for phone calls or anything
        handled outside the system.
      </p>

      {/* Add note composer */}
      <div className="space-y-2.5 border border-neutral-700 bg-neutral-800/60 p-4">
        <label
          htmlFor="dispatch-note"
          className="block label-cap"
        >
          Add note
        </label>
        <textarea
          id="dispatch-note"
          rows={2}
          value={noteBody}
          onChange={(e) => setNoteBody(e.target.value)}
          className="block w-full bg-neutral-900 border border-neutral-800 px-3 py-2.5 text-base text-zinc-100 placeholder:text-neutral-600 focus:border-red-600 focus:outline-none resize-y"
          placeholder='e.g. "Called Mike — said he&rsquo;ll confirm dimensions by Wed."'
        />
        {error ? (
          <p
            role="alert"
            className="text-[11px] font-semibold tracking-[0.18em] text-red-400 uppercase"
          >
            {error}
          </p>
        ) : null}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onAddNote}
            disabled={isPending || noteBody.trim().length === 0}
            className="btn-outline-cut inline-flex items-center justify-center px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-100 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Saving..." : "Add note"}
          </button>
        </div>
      </div>

      {/* Event list */}
      {events.length === 0 ? (
        <p className="text-sm text-neutral-400">
          No activity yet. Events appear here as the lead progresses.
        </p>
      ) : (
        <ol className="border border-neutral-800 bg-neutral-950">
          {/* Phase UI-M1: reverse to chronological order (oldest at top,
              newest at bottom). Use slice() to avoid mutating the prop. */}
          {events.slice().reverse().map((event, i, arr) => {
            const dotCls = KIND_DOT_CLASSES[event.kind] ?? "bg-neutral-500";
            const label = KIND_LABELS[event.kind] ?? event.kind;
            const detail = describe(event);
            const isLast = i === arr.length - 1;
            return (
              <li
                key={event.id}
                className={
                  "grid grid-cols-[14px_minmax(0,1fr)] gap-x-3 px-3.5 py-3.5 sm:gap-x-4 sm:px-4 " +
                  (isLast ? "" : "border-b border-neutral-800")
                }
              >
                <span
                  aria-hidden
                  className={"mt-2 inline-block h-2.5 w-2.5 shrink-0 " + dotCls}
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="label-cap">
                      {label}
                    </span>
                    <time
                      dateTime={event.created_at}
                      title={formatDateFull(event.created_at)}
                      className="font-mono text-[10px] text-neutral-500"
                    >
                      {relativeTime(event.created_at)}
                    </time>
                  </div>
                  {detail ? (
                    <p className="mt-1 text-sm whitespace-pre-wrap text-neutral-200">
                      {detail}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
