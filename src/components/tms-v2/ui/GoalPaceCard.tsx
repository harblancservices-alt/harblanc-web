import { Money } from "./Money";
import { formatMoney } from "@/lib/domain/money";
import type { GoalPace } from "@/lib/domain/goal-pace";

/**
 * The one shared net-vs-goal pace display — consumes `computeGoalPace()`
 * (lib/domain/goal-pace.ts) verbatim, never a page-local remaining/required-
 * rate calculation. Used by both Performance's goal card and Today's
 * dashboard widget so the two can't disagree (audit §H).
 */

const VERDICT_LABEL: Record<GoalPace["verdict"], string> = {
  met: "Goal met",
  ahead: "Ahead of pace",
  "on-pace": "On pace",
  behind: "Behind pace",
};

const VERDICT_TONE: Record<GoalPace["verdict"], string> = {
  met: "text-ok",
  ahead: "text-ok",
  "on-pace": "text-fg-muted",
  behind: "text-bad",
};

export function GoalPaceCard({ label, pace }: { label: string; pace: GoalPace }) {
  const pct = pace.goal > 0 ? Math.min(100, Math.max(0, (pace.currentNet / pace.goal) * 100)) : 0;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-card p-3.5 shadow-e1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-fg-muted">{label}</span>
        <span className={`text-[12px] font-semibold ${VERDICT_TONE[pace.verdict]}`}>{VERDICT_LABEL[pace.verdict]}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <Money value={pace.currentNet} tone="none" className="text-[20px] font-semibold" />
        <span className="text-[13px] text-fg-muted">of {formatMoney(pace.goal)}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-elevated">
        <div className={`h-full ${pace.verdict === "behind" ? "bg-bad" : "bg-ok"}`} style={{ width: `${pct}%` }} />
      </div>
      {pace.verdict === "met" ? (
        <p className="text-[12px] text-fg-muted">{formatMoney(pace.currentNet - pace.goal)} over goal.</p>
      ) : (
        <p className="text-[12px] text-fg-muted">
          {formatMoney(pace.remaining)} to go · need {formatMoney(pace.requiredDailyPace)}/day ({formatMoney(pace.requiredWeeklyPace)}/wk) over the next{" "}
          {pace.daysRemaining} day{pace.daysRemaining === 1 ? "" : "s"}
        </p>
      )}
    </div>
  );
}
