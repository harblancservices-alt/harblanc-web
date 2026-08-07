import { Money } from "@/components/tms-v2/ui/Money";
import { formatMoney } from "@/lib/domain/money";

/**
 * Load Board's goal card — period-dependent, per Brent's correction: a
 * specific MONTH selected targets the $10,000 MONTHLY goal
 * (dispatch_settings.monthly_net_goal), while "Year to date" and "All"
 * both target the $120,000 ANNUAL goal (dispatch_settings.annual_net_goal)
 * — both figures come from Settings via getDispatchSettingsSummary, never
 * hardcoded here. page.tsx resolves which goal/net pair applies for the
 * current MonthDropdown selection and hands them down; this component
 * only renders whatever it's given.
 *
 * Deliberately simpler than tms-v2's old single-goal card (deleted
 * earlier, along with lib/domain/goal-pace.ts's month-only pace math):
 * no day-pace verdict, since that math doesn't generalize across three
 * different scope lengths (a month, a partial year, all-time) without a
 * new pace engine — out of scope for this pass, flagged not faked. Shows
 * plain net-vs-target progress instead.
 */
export function LoadBoardGoalCard({ label, goal, net }: { label: string; goal: number; net: number }) {
  const pct = goal > 0 ? Math.min(100, Math.max(0, (net / goal) * 100)) : 0;
  const remaining = Math.max(0, goal - net);
  const met = goal > 0 && net >= goal;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-card p-3 shadow-e1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-fg-muted">{label}</span>
        {met ? <span className="text-[12px] font-semibold text-ok">Goal met</span> : null}
      </div>
      <div className="flex items-baseline gap-1.5">
        <Money value={net} tone="none" className="text-[20px] font-semibold" />
        <span className="text-[13px] text-fg-muted">of {formatMoney(goal)}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-elevated">
        <div className={`h-full ${met ? "bg-ok" : "bg-accent"}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[12px] text-fg-muted">
        {met ? "Goal met." : `${formatMoney(remaining)} to go · ${Math.round(pct)}% of goal`}
      </p>
    </div>
  );
}
