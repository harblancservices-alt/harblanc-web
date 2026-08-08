import Link from "next/link";
import { Money } from "@/components/tms-v2/ui/Money";
import type { AnalyticsLoad } from "@/lib/data/analytics";

/** Broker/lane drill-down (Phase 7's "where practical") — clicking a row in
 * PartyTable lands back here with the constituent loads for that party in
 * the current period, each linking to the real Load Detail page. No new
 * data plumbing: `loads` is the same array already fetched for the page's
 * own summary/trend/leaderboard figures, just filtered client-invisibly
 * (server-rendered) to one broker or lane. */
export function PartyDrillDown({ title, loads, closeHref }: { title: string; loads: AnalyticsLoad[]; closeHref: string }) {
  return (
    <div className="mb-6 rounded-xl border border-accent bg-card shadow-e1">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h3 className="text-[14px] font-semibold text-fg">
          {title} · {loads.length} load{loads.length === 1 ? "" : "s"}
        </h3>
        <Link href={closeHref} className="text-[12px] font-medium text-accent underline">
          Close
        </Link>
      </div>
      {loads.length === 0 ? (
        <p className="px-4 py-6 text-center text-[13px] text-fg-muted">No loads in this period.</p>
      ) : (
        <div className="flex flex-col divide-y divide-line">
          {loads.map((l) => (
            <Link
              key={l.id}
              href={`/tms-v2/loads/${l.id}`}
              className="grid grid-cols-[80px_1fr_auto_auto] items-center gap-3 px-4 py-2 text-[13px] hover:bg-elevated"
            >
              <span className="text-fg-muted">{l.date ?? "—"}</span>
              <span className="truncate text-fg">
                {l.loadNumber ? `#${l.loadNumber}` : "—"} · {l.origin} → {l.destination}
              </span>
              <Money value={l.rate} tone="none" />
              <Money value={l.net} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
