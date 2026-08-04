import { Money } from "@/components/tms-v2/ui/Money";
import { rpm } from "@/lib/dispatch/format";
import type { PartyStat } from "@/lib/dispatch/performance";

/** Broker/lane leaderboard row list — reuses `lib/dispatch/performance.ts`'s
 * `PartyStat` shape (v2-design.md §23) for both Top brokers and Top lanes,
 * one hairline-row primitive instead of two bespoke tables. */
export function PartyStatList({ title, rows }: { title: string; rows: PartyStat[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[15px] font-semibold text-fg">{title}</h2>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-fg-muted">No loads in this period yet.</p>
      ) : (
        <div className="flex flex-col">
          {rows.map((r, i) => (
            <div
              key={r.name}
              className={`flex items-center justify-between gap-3 border-b border-line px-2 py-2 ${i % 2 === 1 ? "bg-elevated/50" : ""}`}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="text-[12px] font-medium text-fg-muted">{i + 1}</span>
                <span className="truncate text-[14px] text-fg">{r.name}</span>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-[13px] text-fg-muted">
                <span>
                  {r.loads} load{r.loads === 1 ? "" : "s"}
                </span>
                <span>{rpm(r.netRpm)}/mi</span>
                <Money value={r.net} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
