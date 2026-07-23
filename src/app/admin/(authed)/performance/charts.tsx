import type { ReactNode } from "react";
import { usd, usdCompact, rpm, pct } from "@/lib/dispatch/format";

/**
 * Chart primitives for the Performance page — dependency-free, server-rendered.
 *
 * LAYOUT RULE (learned the hard way): nothing here scales a coordinate space.
 *
 * The first cut drew each chart into a fixed-width viewBox and let `w-full`
 * stretch it. That makes the scale factor `containerWidth ÷ viewBoxWidth`, which
 * grows as the data SHRINKS — two months produced a 174px viewBox in a 930px
 * card, a 5.3× blow-up that rendered 10px labels at ~53px. Every label on the
 * page was sized by how much history happened to exist.
 *
 * So the geometry is now plain HTML/CSS: columns are flex children, bar heights
 * are percentages of a fixed-height plot, and every label is real HTML text at a
 * real CSS size. A percentage is resolution-independent by construction, so the
 * charts fill their card at any width while the type stays exactly the size it
 * says it is — 10px on a phone, 11px from `sm`, whatever the data does.
 *
 * The one genuine SVG is the RPM line, which needs real line segments. It uses
 * `preserveAspectRatio="none"` over a 0–100 box so its coordinates behave as
 * percentages too, plus `vector-effect="non-scaling-stroke"` so the distortion
 * that would otherwise smear the stroke can't. Its dots and labels are HTML
 * overlays for the same reason as everything else.
 *
 * Bars are width-capped (`max-w-*`), so a two-month chart draws two normal bars
 * with space around them rather than two giant blocks.
 *
 * COLOR: only theme tokens. Text uses the `fg` tiers, which flip with the admin
 * dark theme; money uses `ok`/`bad`/`steel`, readable on both surfaces.
 */

// ---------------------------------------------------------------- formatting

/**
 * These now live in the framework-free @/lib/dispatch/format so the takeaway
 * sentences in performance.ts phrase money exactly the way these charts label
 * it. Re-exported here because the page and view import them from ./charts.
 */
export { usd, usdCompact, rpm, pct };

// ------------------------------------------------------------------- scaling

/**
 * A "nice" axis top — rounded up to 1/2/2.5/5 × a power of ten so ticks land on
 * readable numbers ($5k, $10k) instead of the raw data max ($8,431.72).
 */
function niceCeil(v: number): number {
  if (v <= 0) return 0;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const norm = v / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return step * mag;
}

/**
 * Vertical scale as PERCENTAGES of the plot box. Always includes zero so the
 * baseline is meaningful and a losing month can draw below it.
 */
type Scale = {
  min: number;
  max: number;
  /** Distance from the plot's bottom edge, 0–100. */
  fromBottom: (v: number) => number;
  /** Distance from the plot's top edge, 0–100. */
  fromTop: (v: number) => number;
  /** Where the zero baseline sits, measured from the bottom. */
  zero: number;
  ticks: number[];
};

function makeScale(values: number[], extra: number[] = []): Scale {
  const finite = [...values, ...extra].filter((v) => Number.isFinite(v));
  const max = niceCeil(Math.max(0, ...finite)) || 1;
  const rawMin = Math.min(0, ...finite);
  const min = rawMin < 0 ? -niceCeil(-rawMin) : 0;
  const span = max - min || 1;
  const fromBottom = (v: number) => ((v - min) / span) * 100;
  return {
    min,
    max,
    fromBottom,
    fromTop: (v) => 100 - fromBottom(v),
    zero: fromBottom(0),
    ticks:
      min < 0 ? [max, max / 2, 0, min / 2, min] : [max, (max * 2) / 3, max / 3, 0],
  };
}

// -------------------------------------------------------------------- shell

/**
 * Fixed plot height — a real CSS height, not something derived from the data.
 * Slightly taller once there's room, which is the only thing that changes
 * between phone and desktop.
 */
const PLOT_H = "h-[152px] sm:h-[188px]";
/** Left gutter holding the value ticks. */
const GUTTER = "w-9 shrink-0 sm:w-12";

/**
 * Grid + axis chrome shared by the time-series charts. `columns` is the
 * plot content: one flex child per month, each `relative` so its bars can be
 * positioned against the shared baseline.
 *
 * `pt-4` gives the tallest bar's value label somewhere to render — the plot has
 * visible overflow, so a label at 100% height spills into the padding instead of
 * being clipped.
 */
function Plot({
  scale,
  labels,
  highlightIndex,
  format,
  columns,
  overlay,
}: {
  scale: Scale;
  labels: string[];
  highlightIndex: number;
  format: (v: number) => string;
  columns: ReactNode;
  /** Drawn inside the plot box, over the columns (e.g. the goal line). */
  overlay?: ReactNode;
}) {
  return (
    <div className="pt-4">
      <div className="flex">
        {/* Value ticks. Each is centred on its gridline via -translate-y-1/2. */}
        <div className={GUTTER + " relative " + PLOT_H}>
          {scale.ticks.map((t) => (
            <span
              key={t}
              style={{ top: `${scale.fromTop(t)}%` }}
              className="absolute right-1.5 -translate-y-1/2 font-mono text-[10px] tabular-nums text-fg-subtle sm:text-[11px]"
            >
              {format(t)}
            </span>
          ))}
        </div>

        <div className={"relative min-w-0 flex-1 " + PLOT_H}>
          {scale.ticks.map((t) => (
            <div
              key={t}
              aria-hidden
              style={{ top: `${scale.fromTop(t)}%` }}
              className={
                "absolute inset-x-0 border-t " +
                (t === 0
                  ? "border-line-strong"
                  : "border-dashed border-line")
              }
            />
          ))}
          <div className="absolute inset-0 flex items-stretch">{columns}</div>
          {overlay ? (
            <div className="pointer-events-none absolute inset-0">{overlay}</div>
          ) : null}
        </div>
      </div>

      {/* Month labels, in a row that mirrors the plot's column widths exactly so
          each label stays under its bar. */}
      <div className="flex pt-1.5">
        <div className={GUTTER} />
        <div className="flex min-w-0 flex-1">
          {labels.map((l, i) => (
            <span
              key={`${l}-${i}`}
              className={
                "min-w-0 flex-1 truncate px-px text-center font-mono text-[10px] sm:text-[11px] " +
                (i === highlightIndex
                  ? "font-bold text-fg"
                  : "text-fg-subtle")
              }
            >
              {l}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * One bar, positioned against the shared zero baseline. Positive bars grow up
 * from it, negative bars hang below it, so a losing month is unmistakable.
 *
 * POSITIONING (learned the hard way, again): the bar is pinned by `top` AND
 * `bottom` percentages — never by a percentage `height`. A percentage height
 * only resolves when the containing block's height is *definite*, and this
 * bar's block is a flex-stretched column whose height some engines treat as
 * indefinite; there the height collapses to 0 and the bars vanish while the
 * goal line (which is `bottom`-positioned) still draws — the exact failure this
 * chart hit. `top`/`bottom` resolve against the block's *used* height instead,
 * the same robust scheme every gridline, tick and label here already uses, so
 * the bar's height is simply the gap the two insets leave. The bar is also its
 * own width-capped, centred element now — no intermediate wrapper to add
 * another definite-height assumption to the chain.
 */
function Bar({
  value,
  scale,
  className,
}: {
  value: number;
  scale: Scale;
  className: string;
}) {
  if (value === 0) return null;
  // Positive: top at the value, bottom on the zero line. Negative: top on the
  // zero line, bottom at the value. `fromTop`/`fromBottom` are 0–100 already.
  const top = scale.fromTop(Math.max(value, 0));
  const bottom = scale.fromBottom(Math.min(value, 0));
  return (
    <div
      aria-hidden
      style={{ top: `${top}%`, bottom: `${bottom}%` }}
      className={
        "absolute left-1/2 w-[62%] max-w-[30px] -translate-x-1/2 rounded-[3px] " +
        className
      }
    />
  );
}

/**
 * Value labels are shown only when there's room for them. Past ~8 months the
 * columns are narrower than the text, so the axis ticks carry the magnitude
 * instead and the bars stay clean.
 */
const LABEL_LIMIT = 8;

// ------------------------------------------------------- 1. net vs goal bars

export type MonthDatum = {
  key: string;
  label: string;
  value: number;
};

/**
 * Monthly NET as bars with a dashed reference line at the monthly goal.
 *
 * A month that beat the goal fills solid; a month that fell short fills at low
 * opacity, so clearing the line reads as WEIGHT and not only as height.
 */
export function NetVsGoalChart({
  data,
  goal,
  highlightIndex,
}: {
  data: MonthDatum[];
  goal: number;
  highlightIndex: number;
}) {
  // The goal line must be inside the scale or it can't be drawn.
  const scale = makeScale(
    data.map((d) => d.value),
    [goal],
  );
  const showValues = data.length <= LABEL_LIMIT;

  return (
    <div>
      <Plot
        scale={scale}
        labels={data.map((d) => d.label)}
        highlightIndex={highlightIndex}
        format={usdCompact}
        /* Inside the plot box, so the line lands on the scale exactly rather
           than at a hand-guessed offset from the chart's outer edge. */
        overlay={
          goal > 0 ? (
            <div
              style={{ bottom: `${scale.fromBottom(goal)}%` }}
              className="absolute inset-x-0 border-t-[1.5px] border-dashed border-accent"
            >
              <span className="absolute left-0 -top-[13px] font-mono text-[10px] font-bold tabular-nums text-accent sm:text-[11px]">
                GOAL {usdCompact(goal)}
              </span>
            </div>
          ) : null
        }
        columns={
          <>
            {data.map((d) => {
              const met = goal > 0 && d.value >= goal;
              return (
                <div key={d.key} className="relative min-w-0 flex-1">
                  {/* Bar width is capped (inside Bar) so a 2-month chart draws
                      two normal bars, not two slabs half the card wide. */}
                  <Bar
                    value={d.value}
                    scale={scale}
                    className={
                      d.value < 0
                        ? "bg-bad"
                        : met
                          ? "bg-ok"
                          : "bg-ok opacity-40"
                    }
                  />
                  {showValues && d.value !== 0 ? (
                    <span
                      style={
                        d.value > 0
                          ? {
                              bottom: `${scale.fromBottom(d.value)}%`,
                              marginBottom: 3,
                            }
                          : {
                              top: `${scale.fromTop(d.value)}%`,
                              marginTop: 3,
                            }
                      }
                      className={
                        "absolute inset-x-0 text-center font-mono text-[10px] font-bold tabular-nums sm:text-[11px] " +
                        (d.value < 0 ? "text-bad" : "text-fg-muted")
                      }
                    >
                      {usdCompact(d.value)}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </>
        }
      />
    </div>
  );
}

// ----------------------------------------------------------- 2. RPM trend

export type SeriesDatum = {
  key: string;
  label: string;
  /** Null = no measurable loaded miles that month; the line breaks there. */
  value: number | null;
};

/**
 * Two-line $/mi trend (net and gross).
 *
 * Months with no loaded miles are null and the line is drawn as SEGMENTS
 * between consecutive non-null points, so a dead month leaves a visible break
 * instead of a straight line implying rates that were never earned.
 */
export function RpmTrendChart({
  net,
  gross,
  highlightIndex,
}: {
  net: SeriesDatum[];
  gross: SeriesDatum[];
  highlightIndex: number;
}) {
  const all = [...net, ...gross]
    .map((d) => d.value)
    .filter((v): v is number => v != null);
  const scale = makeScale(all);
  const n = Math.max(net.length, 1);
  // Column centres, as percentages — the same positions the flex columns land on.
  const cx = (i: number) => ((i + 0.5) / n) * 100;

  const series = [
    { data: gross, stroke: "stroke-steel", dot: "bg-steel", text: "text-steel" },
    { data: net, stroke: "stroke-ok", dot: "bg-ok", text: "text-ok" },
  ];

  return (
    <div>
      <Plot
        scale={scale}
        labels={net.map((d) => d.label)}
        highlightIndex={highlightIndex}
        format={(v) => `$${v.toFixed(2)}`}
        columns={
          <div className="relative w-full">
            {/* preserveAspectRatio="none" turns the 0–100 box into percentages
                in both axes; non-scaling-stroke keeps the resulting distortion
                from smearing the line width. */}
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full overflow-visible"
              role="img"
              aria-label="Average dollars per mile by month, net and gross"
            >
              {series.map((s) =>
                s.data.map((d, i) => {
                  const next = s.data[i + 1];
                  if (d.value == null || !next || next.value == null) return null;
                  return (
                    <line
                      key={`${s.stroke}-${d.key}`}
                      x1={cx(i)}
                      y1={scale.fromTop(d.value)}
                      x2={cx(i + 1)}
                      y2={scale.fromTop(next.value)}
                      className={s.stroke}
                      strokeWidth={2}
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                }),
              )}
            </svg>

            {/* Dots and value labels are HTML so they stay circular and
                correctly sized under the SVG's non-uniform scaling. */}
            {series.map((s) =>
              s.data.map((d, i) =>
                d.value == null ? null : (
                  <span
                    key={`dot-${s.dot}-${d.key}`}
                    aria-hidden
                    style={{ left: `${cx(i)}%`, top: `${scale.fromTop(d.value)}%` }}
                    className={
                      "absolute h-[5px] w-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full " +
                      s.dot
                    }
                  />
                ),
              ),
            )}

            {/* Label the most recent point of each line — the number he's living
                in right now — rather than every point, which collides. */}
            {series.map((s) => {
              const i = lastNonNull(s.data);
              if (i < 0) return null;
              const v = s.data[i].value as number;
              return (
                <span
                  key={`lbl-${s.text}`}
                  style={{ right: `${100 - cx(i)}%`, top: `${scale.fromTop(v)}%` }}
                  className={
                    "absolute mr-1.5 -translate-y-1/2 whitespace-nowrap font-mono text-[10px] font-bold tabular-nums sm:text-[11px] " +
                    s.text
                  }
                >
                  {rpm(v)}
                </span>
              );
            })}
          </div>
        }
      />
      <Legend
        items={[
          { label: "Net $/mi", cls: "bg-ok" },
          { label: "Gross $/mi", cls: "bg-steel" },
        ]}
      />
    </div>
  );
}

function lastNonNull(d: SeriesDatum[]): number {
  for (let i = d.length - 1; i >= 0; i--) if (d[i].value != null) return i;
  return -1;
}

function Legend({ items }: { items: { label: string; cls: string }[] }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span aria-hidden className={"h-2 w-3 rounded-sm " + i.cls} />
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-subtle sm:text-[11px]">
            {i.label}
          </span>
        </span>
      ))}
    </div>
  );
}

// --------------------------------------------------------- 3. deadhead split

/**
 * Loaded vs empty miles as one split bar, with both shares called out on the
 * fill (green loaded, amber empty), then the three raw mile figures beneath.
 *
 * The bar sits on the fixed bg-inset track and its two segments are the fixed
 * ok/warn fills carrying white labels — legible on both admin themes, the same
 * rule the load board's status pills follow.
 */
export function DeadheadBar({
  loaded,
  deadhead,
  total,
}: {
  loaded: number;
  deadhead: number;
  total: number;
}) {
  const loadedPct = total > 0 ? (loaded / total) * 100 : 0;
  const deadPct = total > 0 ? (deadhead / total) * 100 : 0;
  return (
    <div>
      <div
        className="flex h-9 w-full overflow-hidden rounded-lg bg-inset ring-1 ring-inset ring-line-strong"
        role="img"
        aria-label={`${Math.round(loadedPct)}% loaded miles, ${Math.round(deadPct)}% deadhead`}
      >
        <div
          className="flex items-center justify-center bg-ok"
          style={{ width: `${loadedPct}%` }}
        >
          {loadedPct >= 20 ? (
            <span className="font-mono text-[10.5px] font-bold uppercase tracking-[0.06em] tabular-nums text-white">
              {loadedPct.toFixed(0)}% loaded
            </span>
          ) : null}
        </div>
        <div
          className="flex items-center justify-center bg-warn"
          style={{ width: `${deadPct}%` }}
        >
          {deadPct >= 20 ? (
            <span className="font-mono text-[10.5px] font-bold uppercase tracking-[0.06em] tabular-nums text-white">
              {deadPct.toFixed(0)}% empty
            </span>
          ) : null}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2.5">
        <MiniStat
          dot="bg-ok"
          label="Loaded Miles"
          value={Math.round(loaded).toLocaleString("en-US")}
        />
        <MiniStat
          dot="bg-warn"
          label="Empty Miles"
          value={Math.round(deadhead).toLocaleString("en-US")}
        />
        <MiniStat
          dot="bg-fg-subtle"
          label="Total Miles"
          value={Math.round(total).toLocaleString("en-US")}
        />
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  dot,
}: {
  label: string;
  value: string;
  dot?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-inset px-3 py-2.5 shadow-e1">
      <div className="flex items-center gap-1.5">
        {dot ? (
          <span aria-hidden className={"h-2 w-2 shrink-0 rounded-full " + dot} />
        ) : null}
        <span className="truncate font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-ink-3">
          {label}
        </span>
      </div>
      <div className="mt-1 truncate text-[16px] font-bold tabular-nums text-ink sm:text-[18px]">
        {value}
      </div>
    </div>
  );
}

// ----------------------------------------------------------- 4. goal ring

/**
 * Circular goal-completion gauge. A track arc plus a fill arc whose length is
 * `pct` of the circle. Drawn on the fixed inset panel in the goal card, so its
 * green/amber fill and the centred percentage stay legible on both themes.
 */
export function GoalRing({
  pct,
  size = 96,
  loss = false,
}: {
  /** 0–100+; the arc caps at a full circle but the centre label shows the raw %. */
  pct: number;
  size?: number;
  loss?: boolean;
}) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = c - (clamped / 100) * c;
  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
    >
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
          className={"stroke-current " + (loss ? "text-bad" : "text-ok")}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[16px] font-bold tabular-nums text-ink">
        {Math.round(pct)}%
      </span>
    </div>
  );
}
