"use client";

import { useEffect, useId, useRef, useState } from "react";
import { PerformanceCard } from "./PerformanceCard";
import { KpiGrid } from "./KpiGrid";
import { ChevronDownIcon, TrendIcon } from "./icons";
import { usd } from "./shared";

/**
 * The board's overview — the Monthly Performance card and the six KPI cards,
 * gated behind a collapse so the first load card is on screen without a scroll.
 *
 * COLLAPSED BY DEFAULT. The default view is a single compact strip: the label,
 * the month's net, the percent-to-goal, and a thin progress bar, with a chevron
 * that expands the full detail. Tapping it toggles React state (no browser
 * storage) — reload and the board is back to the compact strip.
 *
 * ANIMATION. The reveal animates max-height from 0 to the panel's MEASURED
 * content height (a ref + ResizeObserver, so the target tracks a responsive
 * reflow rather than clipping). max-height rather than height so the resting
 * open state can be released to its natural size; the exact measured target
 * means the ease neither clips short nor drags across empty space. The 0fr→1fr
 * grid trick was tried first and abandoned — the fr track does not interpolate
 * while a transition is declared and holds at 0 (verified in-engine). Motion is
 * dropped wholesale under prefers-reduced-motion, where the panel snaps.
 *
 * THEME SAFETY. The strip is a themed card (bg-card), so — like the KPI cards —
 * the net figure is themed text (text-fg), never text-bad/text-ok, which measure
 * ~2:1 on the dark admin card. A losing month carries its red on a fixed-tint
 * "Loss" pill and on the progress fill (a fixed color on the fixed inset track).
 *
 * Every prop is passed straight through to the two cards it wraps — the math and
 * behaviour (including the A/R drill-down link) are exactly as they were, just
 * revealed on tap.
 */
export function OverviewSection(props: {
  // Performance card
  net: number;
  goal: number;
  label: string;
  daysLeft: number | null;
  daysInMonth: number | null;
  // KPI grid
  arTotal: number;
  totalLoads: number;
  delivered: number;
  gross: number;
  avgNetPerMile: number;
  avgGrossPerMile: number;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  // Measured content height (px). Drives max-height while open; kept current by
  // a ResizeObserver so a breakpoint reflow (2-col → 3-col KPIs) or a data
  // change can't leave the panel clipped or padded with empty space.
  const [contentH, setContentH] = useState(0);

  useEffect(() => {
    if (!open) return;
    const el = contentRef.current;
    if (!el) return;
    const measure = () => setContentH(el.scrollHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  const target = props.goal > 0 ? props.goal : 10000;
  const pctRaw = (props.net / target) * 100;
  const pct = Math.max(0, Math.min(100, pctRaw));
  const loss = props.net < 0;
  const barFill = loss ? "bg-bad" : "bg-ok";

  return (
    <section>
      <style>{OVERVIEW_CSS}</style>

      {/* Compact summary strip — the whole overview when collapsed, and the
          toggle control when open. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="group flex w-full items-center gap-3 rounded-2xl border border-line bg-card p-3.5 text-left shadow-e2 transition-shadow hover:shadow-e3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:gap-4 sm:p-4"
      >
        <span
          aria-hidden
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-steel-bg text-steel shadow-e1"
        >
          <TrendIcon className="h-[18px] w-[18px]" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-fg-subtle">
              Monthly Performance
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">
              · {props.label}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[19px] font-bold leading-none tracking-[-0.01em] tabular-nums text-fg sm:text-[21px]">
              {usd(props.net)}
            </span>
            <span className="text-[12px] font-medium tabular-nums text-fg-subtle">
              {Math.round(pctRaw)}% to goal
            </span>
            {loss ? (
              <span className="rounded-full bg-bad-bg px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] leading-none text-bad">
                Loss
              </span>
            ) : null}
          </div>
          {/* Thin progress bar — fixed fill on the fixed inset track. */}
          <div className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-inset">
            <div
              className={"h-full rounded-full " + barFill}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <span className="flex shrink-0 items-center gap-1.5 text-fg-subtle">
          <span className="hidden text-[12px] font-semibold sm:inline">
            {open ? "Collapse" : "Expand"}
          </span>
          <ChevronDownIcon
            className={
              "h-5 w-5 transition-transform duration-300 motion-reduce:transition-none " +
              (open ? "rotate-180" : "")
            }
          />
        </span>
      </button>

      {/* The full overview, revealed on tap. overflow-hidden clips while the
          max-height animates; inert + aria-hidden keep the collapsed content out
          of the tab order and off screen readers. */}
      <div
        id={panelId}
        className="lb-overview-panel overflow-hidden"
        style={{ maxHeight: open ? contentH : 0 }}
        inert={!open}
        aria-hidden={!open}
      >
        <div
          ref={contentRef}
          className="grid gap-4 pt-4 sm:gap-5 sm:pt-5"
        >
          <PerformanceCard
            net={props.net}
            goal={props.goal}
            label={props.label}
            daysLeft={props.daysLeft}
            daysInMonth={props.daysInMonth}
          />
          <KpiGrid
            arTotal={props.arTotal}
            totalLoads={props.totalLoads}
            delivered={props.delivered}
            gross={props.gross}
            net={props.net}
            avgNetPerMile={props.avgNetPerMile}
            avgGrossPerMile={props.avgGrossPerMile}
          />
        </div>
      </div>
    </section>
  );
}

/**
 * The panel's height animation — max-height from 0 to the measured content
 * height. Suppressed under prefers-reduced-motion, where the panel snaps open.
 */
const OVERVIEW_CSS = `
.lb-overview-panel { transition: max-height 300ms ease-out; }
@media (prefers-reduced-motion: reduce) {
  .lb-overview-panel { transition: none; }
}
`;
