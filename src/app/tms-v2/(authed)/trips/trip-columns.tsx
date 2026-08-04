import { Money } from "@/components/tms-v2/ui/Money";
import { StatusPill } from "@/components/tms-v2/ui/StatusPill";
import { DateTimeCST } from "@/components/tms-v2/ui/DateTimeCST";
import type { DataListColumn } from "@/components/tms-v2/ui/DataList";
import type { TripWithFinancials } from "@/lib/data/trips";

/**
 * Shared <DataList> column set for the Trips list (v2-design.md §6) — one
 * definition used by both the Server Component page (Active section) and
 * the "use client" ClosedTripsSection (Closed section, collapsible). Plain
 * functions can't cross the Server->Client prop boundary, so this lives in
 * its own module both sides import directly, rather than being passed down
 * as a prop.
 */

export type MarginTone = "ok" | "warn" | "bad";

/** Net-loss reads red; a thin (<15%) margin reads amber so it stands out
 * from a healthy run at a glance — same threshold as the approved /admin
 * trips redesign this page's information design follows. Presentation-only
 * bucketing of numbers `computeTripNet` already produced; not a re-derived
 * money calculation. */
export function marginTone(net: number, profitPct: number | null): MarginTone {
  if (net < 0) return "bad";
  if (profitPct != null && profitPct < 15) return "warn";
  return "ok";
}

const TONE_TEXT: Record<MarginTone, string> = {
  ok: "text-ok",
  warn: "text-warn",
  bad: "text-bad",
};

export function tripTotalMiles(t: TripWithFinancials): number {
  return t.financials.loadedMiles + t.financials.deadheadMiles + t.financials.pcMiles;
}

/** The date a trip is attributed to a calendar month by — started_at, with
 * created_at as a fallback for legacy rows, mirroring attributionDate()'s
 * fallback shape for loads (v2-architecture.md §3b). */
export function tripPeriodDate(t: TripWithFinancials): string | null {
  return t.startedAt ?? t.createdAt;
}

export const TRIP_COLUMNS: DataListColumn<TripWithFinancials>[] = [
  {
    key: "trip",
    header: "Trip",
    render: (t) => (
      <div>
        <div className="font-semibold text-fg">{t.name ?? "Untitled trip"}</div>
        {t.notes ? (
          <div className="mt-0.5 truncate text-[12px] text-fg-muted">{t.notes}</div>
        ) : null}
      </div>
    ),
  },
  {
    key: "dates",
    header: "Dates",
    render: (t) => (
      <div>
        <div className="whitespace-nowrap text-[13px] text-fg">
          <DateTimeCST value={t.startedAt} mode="date" />
          {t.endedAt ? (
            <>
              {" → "}
              <DateTimeCST value={t.endedAt} mode="date" />
            </>
          ) : null}
        </div>
        {!t.endedAt ? (
          <span className="mt-1 inline-flex w-fit items-center rounded-full border border-warn/40 bg-warn-bg px-2 py-0.5 text-[11px] font-medium text-warn">
            Ongoing · no end
          </span>
        ) : null}
      </div>
    ),
  },
  {
    key: "loads",
    header: "Loads",
    render: (t) => String(t.financials.loads),
    align: "right",
    hideOnMobile: true,
  },
  {
    key: "miles",
    header: "Miles",
    render: (t) => tripTotalMiles(t).toLocaleString("en-US"),
    align: "right",
    hideOnMobile: true,
  },
  {
    key: "gross",
    header: "Gross",
    render: (t) => <Money value={t.financials.gross} tone="none" />,
    align: "right",
  },
  {
    key: "net",
    header: "Net",
    render: (t) => {
      const tone = marginTone(t.financials.net, t.financials.profitPct);
      return (
        <Money value={t.financials.net} tone={tone === "warn" ? "none" : tone === "bad" ? "negative" : "positive"} />
      );
    },
    align: "right",
  },
  {
    key: "profit",
    header: "Profit %",
    render: (t) => {
      const tone = marginTone(t.financials.net, t.financials.profitPct);
      return (
        <span className={`font-mono text-[13px] font-semibold tabular-nums ${TONE_TEXT[tone]}`}>
          {t.financials.profitPct != null ? `${Math.round(t.financials.profitPct)}%` : "—"}
        </span>
      );
    },
    align: "right",
  },
  {
    key: "status",
    header: "Status",
    render: (t) => <StatusPill status={t.status} domain="trip" />,
  },
];
