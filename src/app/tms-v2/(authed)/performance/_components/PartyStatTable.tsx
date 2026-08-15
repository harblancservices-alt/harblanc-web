import { Money } from "@/components/tms-v2/ui/Money";
import { rpm } from "@/lib/dispatch/format";
import type { PartyStat } from "@/lib/dispatch/performance";

function fmtMiles(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/**
 * Desktop-only broker/lane leaderboard as a real data table — the same
 * `PartyStat[]` PartyBarChart consumes (brokerStats/laneStats' own default
 * ranking), just columned instead of bar-charted. `variant: "broker"` shows
 * Broker/Loads/Net/$-mi ranked by net (brokerStats' own order); `"lane"`
 * shows Lane/Miles/$-mi ranked by net $/mi (laneStats' own order), using
 * loadedMiles — the same denominator netRpm is built on.
 */
export function PartyStatTable({ title, rows, variant }: { title: string; rows: PartyStat[]; variant: "broker" | "lane" }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[15px] font-semibold text-fg">{title}</h2>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-fg-muted">No loads in this period yet.</p>
      ) : (
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line-strong text-left text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
              <th className="py-1.5 pr-2 font-semibold">{variant === "broker" ? "Broker" : "Lane"}</th>
              {variant === "broker" ? <th className="px-2 py-1.5 text-right font-semibold">Loads</th> : null}
              {variant === "broker" ? (
                <th className="px-2 py-1.5 text-right font-semibold">Net</th>
              ) : (
                <th className="px-2 py-1.5 text-right font-semibold">Miles</th>
              )}
              <th className="py-1.5 pl-2 text-right font-semibold">$/mi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.name}>
                <td className="max-w-0 truncate py-2 pr-2 font-medium text-fg" title={r.name}>
                  {r.name}
                </td>
                {variant === "broker" ? <td className="px-2 py-2 text-right tabular-nums text-fg-muted">{r.loads}</td> : null}
                {variant === "broker" ? (
                  <td className="px-2 py-2 text-right">
                    <Money value={r.net} className="font-semibold" />
                  </td>
                ) : (
                  <td className="px-2 py-2 text-right tabular-nums text-fg-muted">{fmtMiles(r.loadedMiles)}</td>
                )}
                <td className={`py-2 pl-2 text-right font-mono font-semibold tabular-nums ${(r.netRpm ?? 0) < 0 ? "text-bad" : "text-fg"}`}>
                  {rpm(r.netRpm)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
