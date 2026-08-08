import { Money } from "@/components/tms-v2/ui/Money";
import type { PartyStat } from "@/lib/dispatch/performance";

/** Mobile's chart-forward take on PartyTable — a horizontal bar per
 * broker/lane, width proportional to NET (fixed per the audit: this used
 * to size bars by gross while brokerStats/laneStats rank by net — the
 * visual and the ranking now agree). A negative-net party still renders a
 * visible (red) bar rather than vanishing at zero width. Desktop keeps the
 * full PartyTable (all 9 columns, sortable) — this is mobile-only. */
export function PartyBarChart({ title, rows }: { title: string; rows: PartyStat[] }) {
  if (rows.length === 0) {
    return (
      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-semibold text-fg">{title}</h2>
        <p className="py-6 text-center text-[13px] text-fg-muted">No loads in this period yet.</p>
      </section>
    );
  }

  const max = Math.max(1, ...rows.map((r) => Math.abs(r.net)));

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[15px] font-semibold text-fg">{title}</h2>
      <div className="flex flex-col gap-3">
        {rows.map((r) => {
          const widthPct = Math.max(4, Math.round((Math.abs(r.net) / max) * 100));
          return (
            <div key={r.name} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2 text-[13px]">
                <span className="min-w-0 truncate font-medium text-fg">{r.name}</span>
                <Money value={r.net} className="shrink-0 font-semibold" />
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-elevated">
                <div className={`h-full rounded-full ${r.net < 0 ? "bg-bad" : "bg-accent"}`} style={{ width: `${widthPct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
