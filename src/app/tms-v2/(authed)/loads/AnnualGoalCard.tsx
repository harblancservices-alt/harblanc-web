import { Money } from "@/components/tms-v2/ui/Money";
import { formatMoney } from "@/lib/domain/money";

/**
 * Load Board's goal card — per Brent's mobile review, scoped to the
 * $120,000 ANNUAL net goal (dispatch_settings.annual_net_goal, the same
 * single source Settings edits) instead of the $10,000 monthly goal the
 * board showed before. Net is YEAR-TO-DATE (Jan 1 of the current calendar
 * year through today), independent of whichever month the board's dropdown
 * is scoped to — the dropdown re-scopes the load list, not this card.
 *
 * Deliberately simpler than tms-v2's old single-goal card (now deleted,
 * along with its now-fully-unused lib/domain/goal-pace.ts pace math —
 * both had no other callers once this replaced their only usage): that
 * pace math was hardcoded to days-left-IN-THE-MONTH, which doesn't
 * generalize to a year-long goal without inventing a parallel annual-pace
 * engine — out of scope for this pass, flagged rather than faked. This
 * card shows the plain YTD-vs-target progress instead of a day-pace
 * verdict; easy to extend if Brent wants the fuller breakdown.
 */
export function AnnualGoalCard({ goal, ytdNet }: { goal: number; ytdNet: number }) {
  const pct = goal > 0 ? Math.min(100, Math.max(0, (ytdNet / goal) * 100)) : 0;
  const remaining = Math.max(0, goal - ytdNet);
  const met = goal > 0 && ytdNet >= goal;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-card p-3 shadow-e1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-fg-muted">Annual net goal · year to date</span>
        {met ? <span className="text-[12px] font-semibold text-ok">Goal met</span> : null}
      </div>
      <div className="flex items-baseline gap-1.5">
        <Money value={ytdNet} tone="none" className="text-[20px] font-semibold" />
        <span className="text-[13px] text-fg-muted">of {formatMoney(goal)}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-elevated">
        <div className={`h-full ${met ? "bg-ok" : "bg-accent"}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[12px] text-fg-muted">
        {met ? "Annual goal met." : `${formatMoney(remaining)} to go · ${Math.round(pct)}% of the year's goal`}
      </p>
    </div>
  );
}
