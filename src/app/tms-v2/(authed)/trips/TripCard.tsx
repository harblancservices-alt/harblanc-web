import Link from "next/link";
import { StatusPill } from "@/components/tms-v2/ui/StatusPill";
import { Money } from "@/components/tms-v2/ui/Money";
import { DateTimeCST } from "@/components/tms-v2/ui/DateTimeCST";
import type { TripWithFinancials } from "@/lib/data/trips";
import { marginTone } from "./trip-columns";

/** Mobile card for the Trips list — same rounded-card family as the Load
 * Board's LoadCard (name/route headline, status pill top-right, a boxed
 * revenue/expenses/net strip), replacing DataList's table/stacked-row
 * render on phones. No selection mode here (unlike LoadCard), so this is
 * just a plain <Link> card — no stretched-overlay click-through concerns.
 * Desktop keeps the existing DataList table (later PC pass owns that); the
 * call site wraps this in `lg:hidden` and DataList in `hidden lg:block`. */
export function TripCard({ trip }: { trip: TripWithFinancials }) {
  const tone = marginTone(trip.financials.net, trip.financials.profitPct);
  const netTone = tone === "warn" ? "none" : tone === "bad" ? "negative" : "positive";

  return (
    <Link
      href={`/tms-v2/trips/${trip.id}`}
      className="block rounded-xl border border-line bg-card p-4 shadow-e1 transition-shadow hover:shadow-e2"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-fg">{trip.name ?? "Untitled trip"}</p>
          <div className="mt-1 flex items-center gap-1.5 text-[13px] text-fg-muted">
            <span className="whitespace-nowrap">
              <DateTimeCST value={trip.startedAt} mode="date" />
              {trip.endedAt ? (
                <>
                  {" → "}
                  <DateTimeCST value={trip.endedAt} mode="date" />
                </>
              ) : null}
            </span>
            {!trip.endedAt ? (
              <span className="inline-flex shrink-0 items-center rounded-full border border-warn/40 bg-warn-bg px-2 py-0.5 text-[11px] font-medium text-warn">
                Ongoing
              </span>
            ) : null}
          </div>
        </div>
        <StatusPill status={trip.status} domain="trip" className="shrink-0" />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-inset/60 p-2.5">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-wide text-fg-muted">Revenue</div>
          <Money value={trip.financials.gross} tone="none" className="text-[13px] font-semibold" />
        </div>
        <div>
          <div className="text-[10px] font-medium uppercase tracking-wide text-fg-muted">Expenses</div>
          <Money value={trip.financials.spent} tone="none" className="text-[13px] font-semibold" />
        </div>
        <div>
          <div className="text-[10px] font-medium uppercase tracking-wide text-fg-muted">Net</div>
          <Money value={trip.financials.net} tone={netTone} className="text-[13px] font-bold" />
        </div>
      </div>
    </Link>
  );
}
