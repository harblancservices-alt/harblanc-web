import type { ReactNode } from "react";

/**
 * Chart primitives for the Performance page — hand-rolled inline SVG.
 *
 * NO charting dependency on purpose. recharts/chart.js would add ~100kB+ to a
 * bundle this app serves to a phone on truck-stop wifi, and both want a
 * measured DOM container, which forces the whole page to "use client" and
 * re-render on hydrate. Everything here is a pure function of its props with
 * fixed SVG coordinates, so these render on the SERVER, ship zero JS, and have
 * no layout-measurement or SSR-mismatch failure mode at all.
 *
 * SIZING: each chart is drawn at a fixed intrinsic width, then wrapped in
 * `<ScrollX>` — an overflow-x-auto box whose inner min-width is that intrinsic
 * width. On a phone the chart keeps its legible size and the box scrolls
 * sideways; on desktop the container is wider than the min-width so the `w-full`
 * svg scales its viewBox up to fill. One geometry, both ends.
 *
 * COLOR: only theme tokens. Text/grid use the `fg`/`line` tiers, which flip
 * with the admin dark theme; money uses `ok`/`bad`, which are readable on both
 * surfaces. Nothing here hardcodes a hex.
 */

// ---------------------------------------------------------------- formatting

/** Sign outside the dollar sign — a losing month reads "-$310", not "$-310". */
export function usd(n: number): string {
  const r = Math.round(n);
  return (r < 0 ? "-$" : "$") + Math.abs(r).toLocaleString("en-US");
}

/** Axis-tick money: $12.4k / $1.2M, so ticks don't collide on a phone. */
export function usdCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${trim(abs / 1_000_000)}M`;
  if (abs >= 1_000) return `${sign}$${trim(abs / 1_000)}k`;
  return `${sign}$${Math.round(abs)}`;
}

function trim(n: number): string {
  return n >= 10 ? String(Math.round(n)) : String(Math.round(n * 10) / 10);
}

/** Rate per mile, always two decimals — "$1.83". Null renders as an em-dash. */
export function rpm(n: number | null): string {
  if (n == null) return "—";
  return (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2);
}

export function pct(n: number | null, digits = 0): string {
  if (n == null) return "—";
  return `${n.toFixed(digits)}%`;
}

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
 * Vertical scale over a value range that may straddle zero (a losing month
 * draws BELOW the baseline). Always includes 0 so the baseline is meaningful.
 */
type Scale = {
  min: number;
  max: number;
  /** Value → y pixel. */
  y: (v: number) => number;
  /** y pixel of the zero baseline. */
  zero: number;
  ticks: number[];
};

function makeScale(values: number[], top: number, height: number): Scale {
  const finite = values.filter((v) => Number.isFinite(v));
  const rawMax = Math.max(0, ...finite);
  const rawMin = Math.min(0, ...finite);
  const max = niceCeil(rawMax) || 1;
  const min = rawMin < 0 ? -niceCeil(-rawMin) : 0;
  const span = max - min || 1;
  const y = (v: number) => top + height - ((v - min) / span) * height;
  const ticks =
    min < 0 ? [max, max / 2, 0, min / 2, min] : [max, (max * 2) / 3, max / 3, 0];
  return { min, max, y, zero: y(0), ticks };
}

// -------------------------------------------------------------------- layout

const SLOT = 56; // horizontal space per month
const AXIS_W = 48; // left gutter for value ticks
const PAD_R = 14;
const TOP = 16;
const PLOT_H = 158;
const LABEL_H = 26;
const SVG_H = TOP + PLOT_H + LABEL_H;

function chartWidth(n: number): number {
  return AXIS_W + Math.max(n, 1) * SLOT + PAD_R;
}

/**
 * Horizontal-scroll shell. `minWidth` keeps the chart at its legible intrinsic
 * size on a narrow screen rather than letting flexbox crush it.
 */
function ScrollX({ width, children }: { width: number; children: ReactNode }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <div style={{ minWidth: width }}>{children}</div>
    </div>
  );
}

/** Shared grid + y-axis ticks + x-axis month labels. */
function Frame({
  scale,
  labels,
  highlightIndex,
  format,
  width,
}: {
  scale: Scale;
  labels: string[];
  highlightIndex: number;
  format: (v: number) => string;
  width: number;
}) {
  return (
    <>
      {scale.ticks.map((t) => (
        <g key={t}>
          <line
            x1={AXIS_W}
            x2={width - PAD_R}
            y1={scale.y(t)}
            y2={scale.y(t)}
            className={t === 0 ? "stroke-line-strong" : "stroke-line"}
            strokeWidth={t === 0 ? 1.25 : 1}
            strokeDasharray={t === 0 ? undefined : "3 4"}
          />
          <text
            x={AXIS_W - 7}
            y={scale.y(t) + 3.5}
            textAnchor="end"
            className="fill-fg-subtle font-mono text-[10px] tabular-nums"
          >
            {format(t)}
          </text>
        </g>
      ))}
      {labels.map((l, i) => (
        <text
          key={`${l}-${i}`}
          x={AXIS_W + i * SLOT + SLOT / 2}
          y={TOP + PLOT_H + 17}
          textAnchor="middle"
          className={
            "font-mono text-[10px] " +
            (i === highlightIndex
              ? "fill-fg font-bold"
              : "fill-fg-subtle")
          }
        >
          {l}
        </text>
      ))}
    </>
  );
}

// ------------------------------------------------------- 1. net vs goal bars

export type MonthDatum = {
  key: string;
  label: string;
  value: number;
};

/**
 * Monthly NET as bars with a dashed reference line at the monthly goal — the
 * "which months cleared the bar" chart.
 *
 * A month that beat the goal fills solid green; a month that fell short fills
 * green at low opacity, so clearing the line is visible as WEIGHT and not only
 * as height. A losing month draws below the baseline in red.
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
  const width = chartWidth(data.length);
  // The goal line has to be inside the scale or it can't be drawn — include it.
  const scale = makeScale([...data.map((d) => d.value), goal], TOP, PLOT_H);
  const goalY = scale.y(goal);
  const barW = 26;

  return (
    <ScrollX width={width}>
      <svg
        viewBox={`0 0 ${width} ${SVG_H}`}
        width="100%"
        height={SVG_H}
        role="img"
        aria-label={`Monthly net profit against a ${usd(goal)} goal`}
        className="block h-auto w-full"
      >
        <Frame
          scale={scale}
          labels={data.map((d) => d.label)}
          highlightIndex={highlightIndex}
          format={usdCompact}
          width={width}
        />

        {data.map((d, i) => {
          const x = AXIS_W + i * SLOT + (SLOT - barW) / 2;
          const yv = scale.y(d.value);
          const y = Math.min(yv, scale.zero);
          const h = Math.max(Math.abs(scale.zero - yv), d.value === 0 ? 0 : 1.5);
          const met = d.value >= goal && goal > 0;
          return (
            <g key={d.key}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={h}
                rx={3}
                className={
                  d.value < 0 ? "fill-bad" : met ? "fill-ok" : "fill-ok opacity-40"
                }
              />
              {/* Value above the bar (below it when the month lost money). */}
              <text
                x={x + barW / 2}
                y={d.value < 0 ? y + h + 11 : y - 5}
                textAnchor="middle"
                className={
                  "font-mono text-[9px] font-bold tabular-nums " +
                  (d.value < 0 ? "fill-bad" : "fill-fg-muted")
                }
              >
                {d.value === 0 ? "" : usdCompact(d.value)}
              </text>
            </g>
          );
        })}

        {/* Goal reference line, drawn LAST so it sits over the bars. */}
        {goal > 0 ? (
          <g>
            <line
              x1={AXIS_W}
              x2={width - PAD_R}
              y1={goalY}
              y2={goalY}
              className="stroke-accent"
              strokeWidth={1.5}
              strokeDasharray="5 4"
            />
            <text
              x={AXIS_W + 4}
              y={goalY - 4}
              className="fill-accent font-mono text-[9px] font-bold tabular-nums"
            >
              GOAL {usdCompact(goal)}
            </text>
          </g>
        ) : null}
      </svg>
    </ScrollX>
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
 * Months with no loaded miles are null, and the polyline is drawn as SEGMENTS
 * between consecutive non-null points rather than one path across the gap — so
 * a dead month leaves a visible break instead of a straight line implying rates
 * that were never earned.
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
  const width = chartWidth(net.length);
  const all = [...net, ...gross]
    .map((d) => d.value)
    .filter((v): v is number => v != null);
  const scale = makeScale(all, TOP, PLOT_H);
  const cx = (i: number) => AXIS_W + i * SLOT + SLOT / 2;

  const series = [
    { data: gross, cls: "stroke-steel", dot: "fill-steel", name: "Gross $/mi" },
    { data: net, cls: "stroke-ok", dot: "fill-ok", name: "Net $/mi" },
  ];

  return (
    <ScrollX width={width}>
      <svg
        viewBox={`0 0 ${width} ${SVG_H}`}
        width="100%"
        height={SVG_H}
        role="img"
        aria-label="Average dollars per mile by month, net and gross"
        className="block h-auto w-full"
      >
        <Frame
          scale={scale}
          labels={net.map((d) => d.label)}
          highlightIndex={highlightIndex}
          format={(v) => `$${v.toFixed(2)}`}
          width={width}
        />

        {series.map((s) => (
          <g key={s.name}>
            {s.data.map((d, i) => {
              const next = s.data[i + 1];
              if (d.value == null || !next || next.value == null) return null;
              return (
                <line
                  key={`seg-${d.key}`}
                  x1={cx(i)}
                  y1={scale.y(d.value)}
                  x2={cx(i + 1)}
                  y2={scale.y(next.value)}
                  className={s.cls}
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              );
            })}
            {s.data.map((d, i) =>
              d.value == null ? null : (
                <circle
                  key={`dot-${d.key}`}
                  cx={cx(i)}
                  cy={scale.y(d.value)}
                  r={3}
                  className={s.dot}
                />
              ),
            )}
          </g>
        ))}

        {/* Label the most recent point of each line — the number he's living in
            right now — instead of every point, which overlaps at 12 months. */}
        {series.map((s) => {
          const lastIdx = lastNonNull(s.data);
          if (lastIdx < 0) return null;
          const v = s.data[lastIdx].value as number;
          return (
            <text
              key={`lbl-${s.name}`}
              x={Math.min(cx(lastIdx) + 7, width - PAD_R)}
              y={scale.y(v) - 6}
              textAnchor="end"
              className={
                "font-mono text-[9.5px] font-bold tabular-nums " +
                (s.cls === "stroke-ok" ? "fill-ok" : "fill-steel")
              }
            >
              {rpm(v)}
            </text>
          );
        })}
      </svg>
      <Legend
        items={[
          { label: "Net $/mi", cls: "bg-ok" },
          { label: "Gross $/mi", cls: "bg-steel" },
        ]}
      />
    </ScrollX>
  );
}

function lastNonNull(d: SeriesDatum[]): number {
  for (let i = d.length - 1; i >= 0; i--) if (d[i].value != null) return i;
  return -1;
}

// -------------------------------------------------- 3. gross vs net grouped

/**
 * Revenue against take-home, side by side per month.
 *
 * Grouped rather than stacked: stacking net on top of gross would double-count
 * (net is a SUBSET of gross, not an addition to it), and stacking "net + costs"
 * hides the number he actually cares about behind a baseline that moves. Two
 * bars from a shared baseline let him read both magnitudes directly and see the
 * gap between them as the cost of running the load.
 */
export function GrossVsNetChart({
  data,
  highlightIndex,
}: {
  data: { key: string; label: string; gross: number; net: number }[];
  highlightIndex: number;
}) {
  const width = chartWidth(data.length);
  const scale = makeScale(
    data.flatMap((d) => [d.gross, d.net]),
    TOP,
    PLOT_H,
  );
  const barW = 15;
  const gap = 4;

  return (
    <ScrollX width={width}>
      <svg
        viewBox={`0 0 ${width} ${SVG_H}`}
        width="100%"
        height={SVG_H}
        role="img"
        aria-label="Gross revenue against net profit by month"
        className="block h-auto w-full"
      >
        <Frame
          scale={scale}
          labels={data.map((d) => d.label)}
          highlightIndex={highlightIndex}
          format={usdCompact}
          width={width}
        />
        {data.map((d, i) => {
          const groupX =
            AXIS_W + i * SLOT + (SLOT - (barW * 2 + gap)) / 2;
          return (
            <g key={d.key}>
              {[
                { v: d.gross, x: groupX, cls: "fill-steel opacity-70" },
                {
                  v: d.net,
                  x: groupX + barW + gap,
                  cls: d.net < 0 ? "fill-bad" : "fill-ok",
                },
              ].map((b, bi) => {
                const yv = scale.y(b.v);
                const y = Math.min(yv, scale.zero);
                const h = Math.max(Math.abs(scale.zero - yv), b.v === 0 ? 0 : 1.5);
                return (
                  <rect
                    key={bi}
                    x={b.x}
                    y={y}
                    width={barW}
                    height={h}
                    rx={2.5}
                    className={b.cls}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
      <Legend
        items={[
          { label: "Gross", cls: "bg-steel opacity-70" },
          { label: "Net", cls: "bg-ok" },
        ]}
      />
    </ScrollX>
  );
}

function Legend({ items }: { items: { label: string; cls: string }[] }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span aria-hidden className={"h-2 w-3 rounded-sm " + i.cls} />
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
            {i.label}
          </span>
        </span>
      ))}
    </div>
  );
}

// ------------------------------------------------------------ 4. ranked bars

export type RankedRow = {
  key: string;
  name: string;
  /** Drives the bar width, relative to the largest row. */
  value: number;
  /** Big right-aligned figure. */
  primary: string;
  /** Small meta line under the name. */
  meta: string;
  negative?: boolean;
};

/**
 * Ranked horizontal bars (brokers, lanes).
 *
 * These are HTML, not SVG: a proportional-width div IS a horizontal bar, and
 * keeping the row as real text means the names wrap, truncate, and stay
 * selectable/copyable at any width — none of which SVG text does well when a
 * broker is called "Total Quality Logistics, LLC". Still zero-dependency and
 * zero-JS.
 */
export function RankedBars({ rows }: { rows: RankedRow[] }) {
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1);
  return (
    <ol className="space-y-2">
      {rows.map((r, i) => (
        <li key={r.key}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="shrink-0 font-mono text-[10px] font-bold tabular-nums text-fg-subtle">
                {i + 1}
              </span>
              <span className="min-w-0 truncate text-[13.5px] font-semibold leading-tight text-fg">
                {r.name}
              </span>
            </span>
            <span
              className={
                "shrink-0 font-mono text-[13px] font-bold tabular-nums " +
                (r.negative ? "text-bad" : "text-ok")
              }
            >
              {r.primary}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-canvas ring-1 ring-inset ring-line">
              <div
                className={"h-full rounded-full " + (r.negative ? "bg-bad" : "bg-ok")}
                style={{ width: `${(Math.abs(r.value) / max) * 100}%` }}
              />
            </div>
            <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-fg-subtle">
              {r.meta}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

// --------------------------------------------------------- 5. deadhead split

/** Loaded vs empty miles as one stacked bar, with the empty share called out. */
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
        className="flex h-7 w-full overflow-hidden rounded-md ring-1 ring-inset ring-line-strong"
        role="img"
        aria-label={`${Math.round(loadedPct)}% loaded miles, ${Math.round(deadPct)}% deadhead`}
      >
        <div
          className="flex items-center justify-center bg-ok"
          style={{ width: `${loadedPct}%` }}
        >
          {loadedPct >= 18 ? (
            <span className="font-mono text-[10px] font-bold tabular-nums text-white">
              {loadedPct.toFixed(0)}% loaded
            </span>
          ) : null}
        </div>
        <div
          className="flex items-center justify-center bg-warn"
          style={{ width: `${deadPct}%` }}
        >
          {deadPct >= 18 ? (
            <span className="font-mono text-[10px] font-bold tabular-nums text-white">
              {deadPct.toFixed(0)}% empty
            </span>
          ) : null}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <MiniStat label="Loaded mi" value={Math.round(loaded).toLocaleString("en-US")} />
        <MiniStat
          label="Deadhead mi"
          value={Math.round(deadhead).toLocaleString("en-US")}
        />
        <MiniStat label="Total mi" value={Math.round(total).toLocaleString("en-US")} />
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-canvas px-2 py-1.5">
      <div className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-fg-subtle">
        {label}
      </div>
      <div className="mt-0.5 truncate font-mono text-[13px] font-bold tabular-nums text-fg">
        {value}
      </div>
    </div>
  );
}
