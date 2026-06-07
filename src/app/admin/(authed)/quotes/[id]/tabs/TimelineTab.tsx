import type {
  DispatchEventKind,
  DispatchEventPayloadByKind,
} from "@/lib/dispatch/events";

/**
 * Level 5 Step 5.4 - Event history rendering module (V4.7).
 *
 * Originally the Timeline tab. The Timeline tab was retired in V4.7;
 * its two sections (DispatchLifecycle pipeline + Event history feed)
 * moved into the Overview tab. This file now exports just the event-
 * history renderer as `EventHistorySection` so OverviewTab can mount
 * it directly. DispatchLifecycle is imported from ../DispatchLifecycle
 * by the caller.
 *
 * Read-only. No mutations. Operates as a dispatch audit trail.
 *
 * History architecture:
 *
 *   dispatch_events (DB row) -> kind: string -> label dictionary -> render
 *
 * Every DispatchEventKind in events.ts is mapped via a
 * Record<DispatchEventKind, ...> so TS catches any new kind that gets
 * added without a label here. Unknown kinds from the DB (forward
 * migrations / rogue inserts that arrive ahead of a code deploy) hit
 * a runtime fallback that prettifies the kind string itself - never
 * silently dropped.
 *
 * Risk: MEDIUM. Read-only SELECT cap (100). No DB writes.
 *
 * ---------------------------------------------------------------------------
 * REQUIRED READ-ONLY QUERY (added to page.tsx at wire-up time):
 *
 *   const { data: eventRows } = await sb
 *     .from("dispatch_events")
 *     .select("id, kind, payload, created_at")
 *     .eq("quote_request_id", id)
 *     .order("created_at", { ascending: false })
 *     .limit(100);
 *
 *   const events: TimelineEventRow[] = (eventRows ?? []).map((r) => ({
 *     id: r.id,
 *     kind: r.kind,
 *     payload: r.payload,
 *     createdAt: r.created_at,
 *   }));
 *
 * No SELECT * (explicit column list keeps the wire small). LIMIT 100
 * caps runaway queries on long-lived leads (Risk #9 from Level 0).
 * ORDER BY created_at DESC for newest-first display.
 * ---------------------------------------------------------------------------
 */

export type TimelineEventRow = {
  id: string;
  /**
   * Loose `string` rather than DispatchEventKind so DB-side forward
   * migrations don't crash this render path. The dictionary lookup
   * narrows to the typed union when the kind is known.
   */
  kind: string;
  payload: unknown;
  /** ISO 8601 from dispatch_events.created_at. */
  createdAt: string;
};

export type EventHistorySectionProps = {
  /** Newest first. Parent applies LIMIT 100. */
  events: TimelineEventRow[];
};

// ---------------------------------------------------------------------------
// Event label dictionary
//
// One entry per DispatchEventKind. TypeScript's Record<DispatchEventKind, ...>
// enforces exhaustive coverage - any new kind added to events.ts that isn't
// mapped here produces a compile error.
//
// Each describe receives the raw payload as `unknown` and casts to the
// kind-specific shape from DispatchEventPayloadByKind. Casts are local and
// explicit so a payload schema drift in events.ts surfaces as a TS error at
// this file, not a runtime null.
// ---------------------------------------------------------------------------

type EventDescriptor = {
  label: string;
  describe: (payload: unknown) => string;
};

const DESCRIBERS: Record<DispatchEventKind, EventDescriptor> = {
  lead_received: {
    label: "Lead received",
    describe: (p) => {
      const x = p as DispatchEventPayloadByKind["lead_received"];
      return x?.source ? `from ${x.source}` : "";
    },
  },
  ack_sent: {
    label: "Acknowledgement sent",
    describe: (p) => {
      const x = p as DispatchEventPayloadByKind["ack_sent"];
      return x?.to ? `to ${x.to}` : "";
    },
  },
  ack_failed: {
    label: "Acknowledgement failed",
    describe: (p) => {
      const x = p as DispatchEventPayloadByKind["ack_failed"];
      const to = x?.to ? `to ${x.to}` : "";
      const reason = x?.reason ?? "";
      return joinPieces([to, reason]);
    },
  },
  dispatch_alert_sent: {
    label: "Internal dispatch alert sent",
    describe: () => "",
  },
  dispatch_alert_failed: {
    label: "Internal dispatch alert failed",
    describe: (p) => {
      const x = p as DispatchEventPayloadByKind["dispatch_alert_failed"];
      return x?.reason ?? "";
    },
  },
  status_changed: {
    label: "Status changed",
    describe: (p) => {
      const x = p as DispatchEventPayloadByKind["status_changed"];
      if (!x?.from || !x?.to) return "";
      return `${x.from} → ${x.to}`;
    },
  },
  estimate_draft_saved: {
    label: "Range draft saved",
    describe: (p) => {
      const x = p as DispatchEventPayloadByKind["estimate_draft_saved"];
      return formatRange(x?.linehaulLow, x?.linehaulHigh);
    },
  },
  estimate_sent: {
    label: "Range proposal sent",
    describe: (p) => {
      const x = p as DispatchEventPayloadByKind["estimate_sent"];
      const to = x?.to ? `to ${x.to}` : "";
      const range = formatRange(x?.linehaulLow, x?.linehaulHigh);
      return joinPieces([to, range]);
    },
  },
  estimate_send_failed: {
    label: "Range proposal send failed",
    describe: (p) => {
      const x = p as DispatchEventPayloadByKind["estimate_send_failed"];
      const to = x?.to ? `to ${x.to}` : "";
      const reason = x?.reason ?? "";
      return joinPieces([to, reason]);
    },
  },
  estimate_accepted: {
    label: "Range proposal accepted",
    describe: (p) => {
      const x = p as DispatchEventPayloadByKind["estimate_accepted"];
      return x?.mode ?? "";
    },
  },
  estimate_declined: {
    label: "Range proposal declined",
    describe: (p) => {
      const x = p as DispatchEventPayloadByKind["estimate_declined"];
      return x?.reason ?? "";
    },
  },
  intake_submitted: {
    label: "Intake submitted",
    describe: () => "",
  },
  intake_upload_added: {
    label: "File uploaded",
    describe: (p) => {
      const x = p as DispatchEventPayloadByKind["intake_upload_added"];
      return x?.originalFilename ?? "";
    },
  },
  intake_upload_removed: {
    label: "File removed",
    describe: () => "",
  },
  finalized_quote_draft_started: {
    label: "Finalized quote started",
    describe: (p) => {
      const x = p as DispatchEventPayloadByKind["finalized_quote_draft_started"];
      return x?.finalizedQuoteNumber ? `#${x.finalizedQuoteNumber}` : "";
    },
  },
  finalized_quote_draft_saved: {
    label: "Finalized quote draft saved",
    describe: (p) => {
      const x = p as DispatchEventPayloadByKind["finalized_quote_draft_saved"];
      const num = x?.finalizedQuoteNumber ? `#${x.finalizedQuoteNumber}` : "";
      const total = formatUsd(x?.totalAmount);
      return joinPieces([num, total]);
    },
  },
  finalized_quote_preview_built: {
    label: "Finalized quote preview built",
    describe: (p) => {
      const x = p as DispatchEventPayloadByKind["finalized_quote_preview_built"];
      const num = x?.finalizedQuoteNumber ? `#${x.finalizedQuoteNumber}` : "";
      const total = formatUsd(x?.totalAmount);
      return joinPieces([num, total]);
    },
  },
  finalized_quote_sent: {
    label: "Finalized quote sent",
    describe: (p) => {
      const x = p as DispatchEventPayloadByKind["finalized_quote_sent"];
      const num = x?.finalizedQuoteNumber ? `#${x.finalizedQuoteNumber}` : "";
      const to = x?.to ? `to ${x.to}` : "";
      const total = formatUsd(x?.totalAmount);
      return joinPieces([num, to, total]);
    },
  },
  finalized_quote_send_failed: {
    label: "Finalized quote send failed",
    describe: (p) => {
      const x = p as DispatchEventPayloadByKind["finalized_quote_send_failed"];
      const num = x?.finalizedQuoteNumber ? `#${x.finalizedQuoteNumber}` : "";
      const to = x?.to ? `to ${x.to}` : "";
      const reason = x?.reason ?? "";
      return joinPieces([num, to, reason]);
    },
  },
  finalized_quote_confirmed: {
    label: "Finalized quote confirmed",
    describe: (p) => {
      const x = p as DispatchEventPayloadByKind["finalized_quote_confirmed"];
      return x?.finalizedQuoteNumber ? `#${x.finalizedQuoteNumber}` : "";
    },
  },
  bol_draft_started: {
    label: "BOL started",
    describe: (p) => {
      const x = p as DispatchEventPayloadByKind["bol_draft_started"];
      return x?.bolNumber ? `#${x.bolNumber}` : "";
    },
  },
  bol_draft_saved: {
    label: "BOL draft saved",
    describe: (p) => {
      const x = p as DispatchEventPayloadByKind["bol_draft_saved"];
      return x?.bolNumber ? `#${x.bolNumber}` : "";
    },
  },
  bol_preview_built: {
    label: "BOL preview built",
    describe: (p) => {
      const x = p as DispatchEventPayloadByKind["bol_preview_built"];
      return x?.bolNumber ? `#${x.bolNumber}` : "";
    },
  },
  bol_sent: {
    label: "BOL sent",
    describe: (p) => {
      const x = p as DispatchEventPayloadByKind["bol_sent"];
      const num = x?.bolNumber ? `#${x.bolNumber}` : "";
      const to = x?.to ? `to ${x.to}` : "";
      return joinPieces([num, to]);
    },
  },
  bol_send_failed: {
    label: "BOL send failed",
    describe: (p) => {
      const x = p as DispatchEventPayloadByKind["bol_send_failed"];
      const num = x?.bolNumber ? `#${x.bolNumber}` : "";
      const to = x?.to ? `to ${x.to}` : "";
      const reason = x?.reason ?? "";
      return joinPieces([num, to, reason]);
    },
  },
  pdf_generated: {
    label: "PDF generated",
    describe: (p) => {
      const x = p as DispatchEventPayloadByKind["pdf_generated"];
      return x?.quoteNumber ?? "";
    },
  },
  payment_recorded: {
    label: "Payment recorded",
    describe: (p) => {
      const x = p as DispatchEventPayloadByKind["payment_recorded"];
      const amt = formatUsd(x?.amount);
      const method = x?.method ? `via ${x.method}` : "";
      return joinPieces([amt, method]);
    },
  },
  payment_completed: {
    label: "Payment completed",
    describe: (p) => {
      const x = p as DispatchEventPayloadByKind["payment_completed"];
      const paid = formatUsd(x?.paidTotal);
      const total = formatUsd(x?.totalAmount);
      if (paid && total) return `${paid} of ${total}`;
      return paid;
    },
  },
  payment_session_created: {
    label: "Payment session created",
    describe: (p) => {
      const x = p as DispatchEventPayloadByKind["payment_session_created"];
      return formatUsd(x?.amount);
    },
  },
  payment_received: {
    label: "Payment received",
    describe: (p) => {
      const x = p as DispatchEventPayloadByKind["payment_received"];
      return formatUsd(x?.amount);
    },
  },
  estimate_resent: {
    label: "Range proposal resent",
    describe: (p) => {
      const x = p as DispatchEventPayloadByKind["estimate_resent"];
      const to = x?.to ? `to ${x.to}` : "";
      const reason = x?.reason ?? "";
      return joinPieces([to, reason]);
    },
  },
  finalized_quote_resent: {
    label: "Finalized quote resent",
    describe: (p) => {
      const x = p as DispatchEventPayloadByKind["finalized_quote_resent"];
      const num = x?.finalizedQuoteNumber ? `#${x.finalizedQuoteNumber}` : "";
      const to = x?.to ? `to ${x.to}` : "";
      const reason = x?.reason ?? "";
      return joinPieces([num, to, reason]);
    },
  },
  bol_resent: {
    label: "BOL resent",
    describe: (p) => {
      const x = p as DispatchEventPayloadByKind["bol_resent"];
      const num = x?.bolNumber ? `#${x.bolNumber}` : "";
      const to = x?.to ? `to ${x.to}` : "";
      const reason = x?.reason ?? "";
      return joinPieces([num, to, reason]);
    },
  },
  estimate_bounced: {
    label: "Range proposal bounced",
    describe: (p) => {
      const x = p as DispatchEventPayloadByKind["estimate_bounced"];
      const kind = x?.kind ? `${x.kind} bounce` : "bounce";
      const to = x?.to ? `to ${x.to}` : "";
      return joinPieces([kind, to]);
    },
  },
  finalized_quote_bounced: {
    label: "Finalized quote bounced",
    describe: (p) => {
      const x = p as DispatchEventPayloadByKind["finalized_quote_bounced"];
      const num = x?.finalizedQuoteNumber ? `#${x.finalizedQuoteNumber}` : "";
      const kind = x?.kind ? `${x.kind} bounce` : "bounce";
      const to = x?.to ? `to ${x.to}` : "";
      return joinPieces([num, kind, to]);
    },
  },
  bol_bounced: {
    label: "BOL bounced",
    describe: (p) => {
      const x = p as DispatchEventPayloadByKind["bol_bounced"];
      const num = x?.bolNumber ? `#${x.bolNumber}` : "";
      const kind = x?.kind ? `${x.kind} bounce` : "bounce";
      const to = x?.to ? `to ${x.to}` : "";
      return joinPieces([num, kind, to]);
    },
  },
  email_complained: {
    label: "Email complaint",
    describe: (p) => {
      const x = p as DispatchEventPayloadByKind["email_complained"];
      const doc = x?.docType ?? "";
      const num = x?.docNumber ? `#${x.docNumber}` : "";
      const to = x?.to ? `to ${x.to}` : "";
      return joinPieces([doc, num, to]);
    },
  },
  note: {
    label: "Note",
    describe: (p) => {
      const x = p as DispatchEventPayloadByKind["note"];
      const body = x?.body ?? "";
      return body.length > 80 ? `${body.slice(0, 80).trim()}…` : body;
    },
  },
};

/**
 * Prettify a kind string that's NOT in DESCRIBERS into a human-readable
 * label without inventing meaning. Underscores -> spaces, first letter
 * capitalized. "future_unknown_kind" -> "Future unknown kind".
 *
 * The function does NOT attempt to infer a description from an unknown
 * payload shape - the row's payload is shown only when the kind is known.
 */
function formatUnknownKind(kind: string): string {
  const cleaned = kind.replace(/_/g, " ").trim();
  if (!cleaned) return "Event";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
}

export function describeEvent(
  rawKind: string,
  payload: unknown,
): { label: string; description: string } {
  if (rawKind in DESCRIBERS) {
    const entry = DESCRIBERS[rawKind as DispatchEventKind];
    return { label: entry.label, description: entry.describe(payload) };
  }
  return { label: formatUnknownKind(rawKind), description: "" };
}

// ---------------------------------------------------------------------------
// Formatting helpers (local; not extracted to a shared util at this step
// to keep the scope tight - Step 5.6 may consolidate when Pricing tab
// surfaces the same USD formatter from QuoteRangeWorkspace).
// ---------------------------------------------------------------------------

function joinPieces(parts: ReadonlyArray<string>): string {
  return parts.filter((s) => s && s.length > 0).join(" · ");
}

function formatRange(
  low: number | null | undefined,
  high: number | null | undefined,
): string {
  const lo = formatUsd(low);
  const hi = formatUsd(high);
  if (lo && hi) return `${lo}—${hi}`;
  return lo || hi;
}

function formatUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/**
 * Compact monospace timestamp for the event-history rail.
 *
 *   today:        "11:14"
 *   yesterday:    "Yest 14:08"
 *   this year:    "Jun 3 09:51"
 *   prior years:  "2025-12-31 14:00"
 *
 * Renders in the operator's local time (not UTC) because the audit log
 * is read in the operator's daily flow, not as a forensic timestamp -
 * cross-timezone correlation isn't the common case.
 */
function formatEventTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const wasYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();
  const sameYear = d.getFullYear() === now.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (sameDay) return `${hh}:${mm}`;
  if (wasYesterday) return `Yest ${hh}:${mm}`;
  if (sameYear) {
    const month = d.toLocaleString("en-US", { month: "short" });
    return `${month} ${d.getDate()} ${hh}:${mm}`;
  }
  const yyyy = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mo}-${da} ${hh}:${mm}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EventHistorySection({ events }: EventHistorySectionProps) {
  return (
    <section
      aria-label="Event history"
      className="border-2 border-black border-l-4 border-l-black bg-[#fafaf6] px-5 py-4 sm:px-6 sm:py-5"
    >
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-black">
        Event history
      </p>

      {events.length === 0 ? (
        <p className="mt-3 font-mono text-[12px] text-black">
          No events yet.
        </p>
      ) : (
        <ol className="mt-3 divide-y divide-black/10">
          {events.map((row) => {
            const { label, description } = describeEvent(
              row.kind,
              row.payload,
            );
            const ts = formatEventTime(row.createdAt);
            return (
              <li
                key={row.id}
                className="grid grid-cols-[64px_minmax(0,1fr)] gap-x-3 py-2 sm:grid-cols-[100px_minmax(0,1fr)]"
              >
                <span
                  className="font-mono text-[11px] font-bold tabular-nums text-red-700"
                  aria-label="Event timestamp"
                >
                  {ts || "—"}
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-black">
                    {label}
                  </p>
                  {description ? (
                    <p className="mt-0.5 break-words font-mono text-[11px] text-black">
                      {description}
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
