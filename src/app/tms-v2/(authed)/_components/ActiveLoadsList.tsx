import Link from "next/link";
import { Money } from "@/components/tms-v2/ui/Money";
import { StatusPill } from "@/components/tms-v2/ui/StatusPill";
import { ActiveLoadRowAction } from "./ActiveLoadRowAction";
import { AddLoadButton } from "../loads/AddLoadButton";
import { withReturnTo } from "@/lib/nav/return-to";
import type { LoadWithFinancials } from "@/lib/data/loads";

/** Dashboard's primary working list — rich stretched-link cards (status,
 * broker/lane, rate, inline odometer quick-action), mirroring legacy
 * admin's dashboard active-loads cards (src/app/admin/(authed)/
 * DashboardView.tsx) rather than a cramped table. The whole card opens
 * this load's own Load Detail page (the site's one convention for "go to
 * this load", per lib/nav/return-to.ts — not the Load Board list, which
 * has no drawer/`id` handling and would just land the user on the
 * unfiltered board); the odometer action sits above the stretched link
 * (relative z-10) so it acts as its own control and never navigates —
 * same layering trick legacy's cards use. The empty state hosts the red
 * "+ Add Load" button, matching legacy exactly: Add Load only appears
 * here, when the truck is empty — once a load exists, new ones are added
 * from the Load Board's own action row. */
export function ActiveLoadsList({
  loads,
  brokerNames,
  activeTripNames,
}: {
  loads: LoadWithFinancials[];
  brokerNames: string[];
  activeTripNames: string[];
}) {
  if (loads.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line-strong bg-card px-4 py-10 text-center shadow-e1">
        <p className="text-[13px] text-fg-muted">No active loads.</p>
        <AddLoadButton brokerNames={brokerNames} activeTripNames={activeTripNames} showFab={false} variant="destructive" />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-card shadow-e1">
      {loads.map((l, i) => (
        <div
          key={l.id}
          className={`relative px-3.5 py-3 transition-colors hover:bg-elevated ${i === loads.length - 1 ? "" : "border-b border-line"}`}
        >
          <Link
            href={withReturnTo(`/tms-v2/loads/${l.id}`, "/tms-v2")}
            aria-label={`Open load ${l.loadNumber ?? l.id.slice(0, 8)}`}
            className="absolute inset-0 z-0"
          />

          <div className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 flex-1 items-center gap-2.5">
              <StatusPill status={l.status} domain="load" />
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-semibold text-fg">{l.brokerName ?? "No broker"}</span>
                <span className="block truncate text-[12px] text-fg-muted">
                  {l.origin ?? "—"} → {l.destination ?? "—"}
                </span>
              </span>
            </span>
            <Money value={l.financials.gross} tone="none" className="shrink-0 text-[14px] font-semibold" />
          </div>

          <div className="relative z-10 mt-2.5 flex items-center justify-between gap-2">
            <span className="text-[12px] text-fg-muted">
              #{l.loadNumber ?? l.id.slice(0, 8)}
              {l.tripName ? <span> · {l.tripName}</span> : null}
            </span>
            <ActiveLoadRowAction load={l} />
          </div>
        </div>
      ))}
    </div>
  );
}
