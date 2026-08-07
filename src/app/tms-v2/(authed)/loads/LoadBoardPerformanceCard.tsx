"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/domain/money";
import { GoalCountdownCard } from "../_components/GoalCountdownCard";

/** Slim, collapsible "Monthly Performance" strip — replaces the six square
 * KPI tiles the old board opened with, mirroring legacy admin's
 * OverviewSection/PerformanceCard (board/OverviewSection.tsx): one line
 * (net + % to goal + a thin progress bar) collapsed by default, expanding
 * into the fuller breakdown on tap. The expanded panel reuses the
 * Dashboard's own GoalCountdownCard rather than re-deriving legacy's
 * separate ProgressRing/pace math a second time — same canonical
 * computeGoalPace() both screens now share. */
export function LoadBoardPerformanceCard({ goal, net, periodLabel }: { goal: number; net: number; periodLabel: string }) {
  const [open, setOpen] = useState(false);
  const pct = goal > 0 ? Math.max(0, Math.min(100, (net / goal) * 100)) : 0;

  return (
    <div className="rounded-xl border border-line bg-card shadow-e1">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full flex-col gap-1.5 px-3.5 py-3 text-left">
        <div className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-fg-muted">
            <span aria-hidden className={`transition-transform ${open ? "rotate-90" : ""}`}>
              ▸
            </span>
            Monthly Performance · {periodLabel}
          </span>
          <span className="shrink-0 text-[13px] font-semibold text-fg">
            {formatMoney(net)}
            {goal > 0 ? <span className="ml-1.5 font-normal text-fg-muted">{Math.round(pct)}% to goal</span> : null}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-elevated">
          <div className={`h-full ${pct >= 100 ? "bg-ok" : "bg-accent"}`} style={{ width: `${pct}%` }} />
        </div>
      </button>
      {open ? (
        <div className="border-t border-line px-3.5 pb-3.5 pt-3">
          <GoalCountdownCard goal={goal} net={net} periodLabel={periodLabel} />
        </div>
      ) : null}
    </div>
  );
}
