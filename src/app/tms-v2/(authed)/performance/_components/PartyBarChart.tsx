import { Money } from "@/components/tms-v2/ui/Money";
import { rpm } from "@/lib/dispatch/format";
import type { PartyStat } from "@/lib/dispatch/performance";

/** Itemized broker/lane row with a proportional bar underneath — a
 * horizontal bar per broker/lane, width proportional to the chosen metric.
 * `metric: "net"` (default) sizes/labels by total net, matching
 * brokerStats' own ranking; `metric: "rpm"` sizes/labels by net $/mi,
 * matching laneStats' own ranking ("best lanes" is a rate-quality question,
 * not a volume one). A negative value still renders a visible (red) bar
 * rather than vanishing at zero width. */
export function PartyBarChart({ title, rows, metric = "net" }: { title: string; rows: PartyStat[]; metric?: "net" | "rpm" }) {
  if (rows.length === 0) {
    return (
      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-semibold text-fg">{title}</h2>
        <p className="py-6 text-center text-[13px] text-fg-muted">No loads in this period yet.</p>
      </section>
    );
  }

  const valueOf = (r: PartyStat) => (metric === "rpm" ? (r.netRpm ?? 0) : r.net);
  const max = Math.max(1, ...rows.map((r) => Math.abs(valueOf(r))));

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[15px] font-semibold text-fg">{title}</h2>
      <div className="flex flex-col gap-3">
        {rows.map((r) => {
          const v = valueOf(r);
          const widthPct = Math.max(4, Math.round((Math.abs(v) / max) * 100));
          return (
            <div key={r.name} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2 text-[13px]">
                <span className="min-w-0 truncate font-medium text-fg">{r.name}</span>
                {metric === "rpm" ? (
                  <span className={`shrink-0 font-mono font-semibold tabular-nums ${v < 0 ? "text-bad" : "text-fg"}`}>{rpm(r.netRpm)}</span>
                ) : (
                  <Money value={r.net} className="shrink-0 font-semibold" />
                )}
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-elevated">
                <div className={`h-full rounded-full ${v < 0 ? "bg-bad" : "bg-accent"}`} style={{ width: `${widthPct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
