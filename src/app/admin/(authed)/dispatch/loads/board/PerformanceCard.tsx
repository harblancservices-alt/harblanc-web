"use client";

import { abbrUsd, usd } from "./shared";
import { TargetIcon, TrendIcon, WalletIcon } from "./icons";

/**
 * Monthly performance — the board's executive summary, and the replacement for
 * the old one-line profit-toward-goal bar. Same two inputs it always had (the
 * selected month's net, and the editable goal from Settings); everything else
 * on the card is derived from those plus the calendar.
 *
 * THEME SAFETY. Every colored numeral on this card sits on the fixed bg-inset
 * panel with fixed ink (text-ink / text-ok / text-bad). The card surface itself
 * is themed (bg-card), so the only text directly on it is themed text — a
 * text-bad figure straight on the dark admin card measures ~2:1.
 */
export function PerformanceCard({
  net,
  goal,
  label,
  daysLeft,
  daysInMonth,
}: {
  /** The selected month's net profit — the same figure the KPI strip shows. */
  net: number;
  /** Monthly goal for a month view, annual goal for "All months". */
  goal: number;
  /** "July", or "All months". */
  label: string;
  /**
   * Days remaining in the month INCLUDING today, resolved server-side in
   * America/Chicago. Null when the selected month is not the current one —
   * a finished (or future) month has no pace to keep, so the per-week figure
   * shows an em dash instead of a fabricated number.
   */
  daysLeft: number | null;
  daysInMonth: number | null;
}) {
  const target = goal > 0 ? goal : 10000;
  const pctRaw = (net / target) * 100;
  const pct = Math.max(0, Math.min(100, pctRaw));
  const reached = net >= target;

  // Remaining to goal, floored at zero — a beaten goal owes nothing.
  const remaining = Math.max(0, target - net);

  // Weeks left, rounded UP and never below 1, so the per-week figure can't
  // divide by zero on the last few days of the month.
  const weeksLeft = daysLeft != null ? Math.max(1, Math.ceil(daysLeft / 7)) : null;
  const perWeek = weeksLeft != null ? remaining / weeksLeft : null;

  // Projected completion: today's run-rate carried to the end of the month.
  // Elapsed excludes today (which is still being earned), floored at 1 so the
  // 1st of the month projects off one day rather than dividing by zero. With no
  // calendar context (a past month, or "All months") the projection collapses
  // to the actual figure — which for a closed month is exactly right.
  const elapsed =
    daysLeft != null && daysInMonth != null
      ? Math.max(1, daysInMonth - daysLeft)
      : null;
  const projectedPct =
    elapsed != null && daysInMonth != null
      ? ((net / elapsed) * daysInMonth) / target * 100
      : pctRaw;

  const tone = net < 0 ? "bad" : "ok";
  const figure = tone === "bad" ? "text-bad" : "text-ink";
  const ringStroke = tone === "bad" ? "text-bad" : "text-ok";
  const barFill = tone === "bad" ? "bg-bad" : "bg-ok";

  // Tick labels derived from the goal, so the scale matches whatever target is
  // set in Settings ($10k monthly, $120k annual, or an edited value).
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => abbrUsd(target * f));

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-card shadow-e2">
      <div className="p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-fg-subtle">
            Monthly Performance
          </h2>
          <span className="shrink-0 rounded-full bg-inset px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.08em] leading-none text-ink-2">
            {label}
          </span>
        </div>

        {/* Hero — the ring and the headline number share one fixed inset panel
            so a losing month can render red without going illegible on dark. */}
        <div className="mt-4 flex items-center gap-4 rounded-xl bg-inset p-4 shadow-e1 sm:gap-6 sm:p-5">
          <ProgressRing pct={pct} className={ringStroke} />
          <div className="min-w-0">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-3">
              Monthly Net Profit
            </div>
            <div
              className={
                "mt-1.5 truncate text-[32px] font-bold leading-none tracking-[-0.02em] tabular-nums sm:text-[44px] " +
                figure
              }
            >
              {usd(net)}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-3">
              <span className="tabular-nums">of {usd(target)} Goal</span>
              {reached ? (
                <span className="rounded-full bg-ok-bg px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] leading-none text-ok">
                  Goal met
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* The same progress, drawn long. Track and ticks stay on the fixed
            inset so the tick labels keep their contrast. */}
        <div className="mt-5">
          <div className="flex items-end justify-between gap-3">
            <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-fg-subtle">
              Progress to Goal
            </span>
            <span className="shrink-0 text-[15px] font-bold tabular-nums leading-none text-fg">
              {Math.round(pctRaw)}%
            </span>
          </div>
          <div className="relative mt-2 h-3 overflow-hidden rounded-full bg-inset shadow-e1">
            {/* Resting style is already the CORRECT width — the keyframe only
                sweeps the fill in from the left on mount. If animations are
                suppressed the bar simply appears at its true length; the
                figure is never hostage to the motion. */}
            <div
              className={
                "h-full origin-left rounded-full transition-[width] duration-700 ease-out " +
                barFill
              }
              style={{ width: `${pct}%`, animation: "lb-grow 900ms ease-out" }}
            />
            {/* Quarter marks, punched through the fill in the card color. */}
            {[25, 50, 75].map((m) => (
              <span
                key={m}
                aria-hidden
                className="absolute top-0 h-full w-px bg-card/70"
                style={{ left: `${m}%` }}
              />
            ))}
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] font-semibold tabular-nums text-fg-subtle">
            {ticks.map((t, i) => (
              <span key={`${t}-${i}`}>{t}</span>
            ))}
          </div>
        </div>

        {/* Three derived figures — the pace question the big number can't
            answer on its own. */}
        <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <SubKpi
            icon={<TrendIcon className="h-4 w-4" />}
            label="Projected Goal Completion"
            value={`${Math.round(projectedPct)}%`}
          />
          <SubKpi
            icon={<TargetIcon className="h-4 w-4" />}
            label="Estimated Remaining"
            value={usd(remaining)}
          />
          <SubKpi
            icon={<WalletIcon className="h-4 w-4" />}
            label="Avg Needed Per Week"
            value={perWeek != null ? usd(perWeek) : "—"}
            hint={
              weeksLeft != null
                ? `${weeksLeft} week${weeksLeft === 1 ? "" : "s"} left`
                : "Not the current month"
            }
          />
        </div>
      </div>
    </section>
  );
}

/**
 * Circular progress. Two stacked arcs on one SVG: a track and a fill whose
 * dash offset animates from empty on mount, which is what gives the ring its
 * sweep. `className` supplies the fill's color via currentColor, so it inherits
 * the same ok/bad decision the bar made.
 */
function ProgressRing({ pct, className }: { pct: number; className: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.max(0, Math.min(100, pct)) / 100) * c;
  return (
    <div className="relative h-[84px] w-[84px] shrink-0 sm:h-[96px] sm:w-[96px]">
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          strokeWidth="7"
          className="stroke-line-strong opacity-40"
        />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          // The keyframe sweeps FROM an empty ring (offset = the full
          // circumference, handed to CSS as a variable) TO the resting offset
          // already set above — so the arc is correct with or without motion.
          style={
            {
              "--lb-ring-empty": c,
              animation: "lb-ring 1100ms ease-out",
            } as React.CSSProperties
          }
          className={
            "stroke-current transition-[stroke-dashoffset] duration-1000 ease-out " +
            className
          }
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[15px] font-bold tabular-nums text-ink sm:text-[17px]">
        {Math.round(pct)}%
      </span>
    </div>
  );
}

/** One of the three pace figures under the bar. Fixed inset panel, fixed ink. */
function SubKpi({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0 rounded-xl bg-inset px-3.5 py-3 shadow-e1">
      <div className="flex items-center gap-1.5 text-ink-3">
        <span className="shrink-0">{icon}</span>
        <span className="truncate text-[9.5px] font-bold uppercase tracking-[0.1em]">
          {label}
        </span>
      </div>
      <div className="mt-1.5 truncate text-[20px] font-bold leading-none tabular-nums text-ink">
        {value}
      </div>
      {hint ? (
        <div className="mt-1.5 truncate text-[10.5px] text-ink-3">{hint}</div>
      ) : null}
    </div>
  );
}
