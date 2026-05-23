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
      <header>
        <p className="text-[11px] font-semibold tracking-[0.18em] text-red-500 uppercase">
          Activity
        </p>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-300">
          Every operational moment on this lead, newest first. Use notes to
          capture phone calls, voicemails, and follow-ups handled outside
          the system.
        </p>
      </header>

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
          {events.map((event, i) => {
            const dotCls = KIND_DOT_CLASSES[event.kind] ?? "bg-neutral-500";
            const label = KIND_LABELS[event.kind] ?? event.kind;
            const detail = describe(event);
            const isLast = i === events.length - 1;
            return (
              <li
                key={event.id}
                className={
                  "grid grid-cols-[14px_minmax(0,1fr)] gap-x-4 px-4 py-3.5 " +
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
                      className="font-mono text-[10px] text-neutral-600"
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
