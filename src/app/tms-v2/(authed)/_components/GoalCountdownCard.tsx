import { Money } from "@/components/tms-v2/ui/Money";
import { formatMoney } from "@/lib/domain/money";
import { computeGoalPace } from "@/lib/domain/goal-pace";

const VERDICT_COPY: Record<"met" | "on-pace" | "behind", { label: string; tone: string }> = {
  met: { label: "Goal hit", tone: "text-ok" },
  "on-pace": { label: "On pace", tone: "text-ok" },
  behind: { label: "Behind pace", tone: "text-warn" },
};

/** Single-goal countdown — a concrete dated target + pace verdict off
 * dispatch_settings.monthly_net_goal (editable via Settings). Turns "keep
 * the net up" into "$X/day the rest of the month" the way the legacy
 * dashboard's countdown widget did, without the multi-goal CRUD the phase
 * brief explicitly defers. */
export function GoalCountdownCard({ goal, net, periodLabel }: { goal: number; net: number; periodLabel: string }) {
  const pace = computeGoalPace(goal, net);
  const verdict = VERDICT_COPY[pace.verdict];
  const pct = pace.goal > 0 ? Math.min(100, Math.max(0, (pace.net / pace.goal) * 100)) : 0;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-card p-3 shadow-e1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-fg-muted">{periodLabel} net goal</span>
        <span className={`text-[12px] font-semibold ${verdict.tone}`}>{verdict.label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <Money value={pace.net} tone="none" className="text-[20px] font-semibold" />
        <span className="text-[13px] text-fg-muted">of {formatMoney(pace.goal)}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-elevated">
        <div className={`h-full ${pace.verdict === "behind" ? "bg-warn" : "bg-ok"}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[12px] text-fg-muted">
        {pace.verdict === "met"
          ? `Goal met with ${pace.daysLeft} day${pace.daysLeft === 1 ? "" : "s"} left in ${periodLabel}.`
          : pace.neededPerDay != null
            ? `${formatMoney(pace.neededPerDay)}/day needed the rest of the month · ${pace.daysLeft} day${pace.daysLeft === 1 ? "" : "s"} left`
            : `${pace.daysLeft} day${pace.daysLeft === 1 ? "" : "s"} left in ${periodLabel}.`}
      </p>
    </div>
  );
}
