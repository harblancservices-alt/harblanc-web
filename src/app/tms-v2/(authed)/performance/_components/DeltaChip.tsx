import { formatDelta, type Delta } from "@/lib/dispatch/performance";

/** MoM-style delta chip for a <KpiTile> — reuses `lib/dispatch/performance
 * .ts`'s `Delta` shape/sign logic verbatim (v2-design.md §23), never a
 * page-local percent calculation. Renders nothing when the underlying delta
 * was suppressed (no prior period, or the move rounds to noise). */
export function DeltaChip({ delta }: { delta: Delta | null }) {
  if (!delta) return null;
  return (
    <span className={delta.good ? "text-ok" : "text-bad"}>
      {delta.good ? "▲" : "▼"} {formatDelta(delta)} vs prior period
    </span>
  );
}
