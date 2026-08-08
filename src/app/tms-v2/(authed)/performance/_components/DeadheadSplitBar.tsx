import type { DeadheadSplit } from "@/lib/dispatch/performance";

/** Proportional loaded/empty split (audit §C/§E: "a % alone hides its own
 * denominator") — the bare Deadhead KPI percent stays, this adds the mile
 * counts behind it so "22% empty" reads next to "1,400 of 6,300 mi". */
export function DeadheadSplitBar({ split }: { split: DeadheadSplit }) {
  if (split.total <= 0) {
    return <p className="text-[13px] text-fg-muted">No miles moved in this period yet.</p>;
  }
  const deadheadPct = Math.max(0, Math.min(100, split.pct ?? 0));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-elevated">
        <div className="h-full bg-accent" style={{ width: `${100 - deadheadPct}%` }} />
        <div className="h-full bg-bad" style={{ width: `${deadheadPct}%` }} />
      </div>
      <div className="flex items-center justify-between text-[12px] text-fg-muted">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-accent" /> Loaded — {Math.round(split.loaded).toLocaleString("en-US")} mi
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-bad" /> Deadhead — {Math.round(split.deadhead).toLocaleString("en-US")} mi
        </span>
      </div>
    </div>
  );
}
