import type { ReactNode } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import type {
  MonthBucket,
  PartyStat,
  PayTiming,
  PeriodSummary,
  DeadheadSplit,
  Delta,
  MonthDeltas,
  Takeaway,
  TakeawayTone,
} from "@/lib/dispatch/performance";
import { NetVsGoalChart, RpmTrendChart, DeadheadBar, usd, rpm, pct } from "./charts";
import { BrokerTable, LaneTable, LedgerTable } from "./Tables";

/**
 * Performance — the "what should I haul next" dashboard.
 *
 * Every figure here is aggregated from loads the server already costed with
 * the canonical loadDiesel + loadNet pair, so a net on this page is the SAME
 * net the load board and the trip cards show. Nothing in this file does money
 * math; it labels and lays out what it's handed.
 *
 * SCOPE: delivered loads only. A booked-but-not-yet-run load has a rate but no
 * odometer readings, so its "net" would be rate-minus-nothing — counting those
 * would inflate every average on the page. The header says so out loud.
 *
 * LAYOUT — the page reads top to bottom as an answer getting longer:
 *   1. Takeaways   — the sentence version. Two seconds, at a truck stop.
 *   2. KPI grid    — this month's numbers, each against last month.
 *   3. Tables      — brokers, lanes, months. The analytical depth; sortable.
 *   4. Charts      — shape over time, secondary and compact.
 *
 * The tables are the centre of gravity, not the charts. A bar chart of the top
 * eight brokers answers "who is biggest" and nothing else; the same eight rows
 * as a table answer that plus rate quality, margin and days-to-pay, and let the
 * operator re-rank on any of them. So the broker and lane BAR charts are gone —
 * the tables strictly contain them — and gross-vs-net went with them, being two
 * columns of the ledger drawn as a picture.
 *
 * VISUAL: the trip cards' V2 chrome (rounded-lg / border-line-strong / bg-card
 * / shadow-e2), tightened. A neutral page by default, with green and red
 * reserved for money that is actually good or bad.
 */

export type PerformanceData = {
  /** e.g. "July" — the month the KPI row is scoped to. */
  monthLabel: string;
  /** The actionable readings that head the page. Never empty — see `takeaways`. */
  takeaways: Takeaway[];
  currentMonth: PeriodSummary;
  allTime: PeriodSummary;
  /** How the current month moved against the one before it. */
  deltas: MonthDeltas;
  /** Days-to-pay is all-time: one month rarely has enough paid loads to mean anything. */
  pay: PayTiming;
  months: MonthBucket[];
  /** Index into `months` of the current month, or -1 if it isn't in the window. */
  highlightIndex: number;
  monthlyGoal: number;
  brokers: PartyStat[];
  lanes: PartyStat[];
  deadhead: DeadheadSplit;
  /** Rate owed on delivered-but-unpaid loads, all-time. */
  arTotal: number;
};

export function PerformanceView({ data }: { data: PerformanceData }) {
  const {
    monthLabel,
    takeaways,
    currentMonth: m,
    allTime,
    deltas,
    pay,
    months,
    highlightIndex,
    monthlyGoal,
    brokers,
    lanes,
    deadhead,
    arTotal,
  } = data;

  // Nothing has been delivered yet — a page of zeroes and empty axes is worse
  // than one honest sentence, so bail to a single card.
  if (allTime.loads === 0) {
    return (
      <Page>
        <div className="rounded-lg border border-dashed border-line-strong bg-card px-4 py-12 text-center shadow-e1">
          <p className="text-[14px] font-semibold text-fg">No delivered loads yet.</p>
          <p className="mx-auto mt-1.5 max-w-md text-[13px] text-fg-muted">
            This page builds itself out of delivered loads — rates, odometer
            readings and pay dates. Run and deliver a load, and the numbers
            start here.
          </p>
          <Link
            href="/admin/dispatch/loads"
            /* bg-canvas, NOT bg-inset: --inset is a fixed light gray that the
               dark theme never overrides, so an inset button with text-fg on it
               is near-white on near-white once the operator flips to dark. */
            className="mt-4 inline-flex items-center rounded-md border border-line-strong bg-canvas px-3 py-1.5 text-[13px] font-semibold text-fg shadow-e1 transition-colors hover:border-accent hover:text-accent"
          >
            Go to the load board
          </Link>
        </div>
      </Page>
    );
  }

  const currentKey = months[highlightIndex]?.key ?? null;
  const hasPrior = highlightIndex > 0;

  return (
    <Page>
      {/* 1 — Takeaways. The quick read; the tables below are the depth. */}
      <Takeaways items={takeaways} />

      {/* 2 — KPI grid. Money reads green (red when it's a loss); counts and
          ratios stay neutral, because "7 loads" isn't good or bad. The first
          five carry a month-over-month delta — the rest are all-time or
          point-in-time figures that have nothing to compare against. */}
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-fg-subtle">
          {monthLabel} · month to date
        </h2>
        <span className="text-[10.5px] text-fg-subtle">
          {hasPrior ? "Δ vs last month" : "no prior month to compare"}
        </span>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi
          label="Net"
          value={usd(m.net)}
          tone={m.net < 0 ? "bad" : "ok"}
          delta={deltas.net}
          strong
        />
        <Kpi label="Gross" value={usd(m.gross)} tone="neutral" delta={deltas.gross} />
        <Kpi
          label="Net $/mi"
          value={rpm(m.netRpm)}
          tone="ok"
          delta={deltas.netRpm}
          sub={`${rpm(m.grossRpm)} gross`}
        />
        <Kpi
          label="Margin"
          value={pct(m.marginPct)}
          tone="neutral"
          delta={deltas.margin}
        />
        <Kpi
          label="Deadhead"
          value={pct(m.deadheadPct)}
          tone={m.deadheadPct != null && m.deadheadPct >= 25 ? "warn" : "neutral"}
          delta={deltas.deadhead}
          sub={
            m.deadheadPct == null
              ? "no miles logged"
              : `${Math.round(m.deadheadMiles).toLocaleString("en-US")} empty mi`
          }
        />

        <Kpi label="Loads" value={String(m.loads)} tone="neutral" />
        <Kpi
          label="Net / load"
          value={m.netPerLoad == null ? "—" : usd(m.netPerLoad)}
          tone="neutral"
        />
        <Kpi
          label="Days to pay · all"
          value={pay.avgDays == null ? "—" : `${pay.avgDays.toFixed(0)}d`}
          tone="neutral"
          sub={
            pay.sample === 0
              ? "no paid loads yet"
              : `median ${pay.medianDays?.toFixed(0)}d · ${pay.sample} paid`
          }
        />
        <Kpi
          label="Miles · all time"
          value={Math.round(
            allTime.loadedMiles + allTime.deadheadMiles,
          ).toLocaleString("en-US")}
          tone="neutral"
          sub={`${Math.round(allTime.loadedMiles).toLocaleString("en-US")} loaded`}
        />
        <Kpi
          label="A/R outstanding"
          value={usd(arTotal)}
          tone={arTotal > 0 ? "bad" : "neutral"}
          href="/admin/dispatch/receivables"
          sub={arTotal > 0 ? "delivered, unpaid" : "all caught up"}
        />
      </div>

      {/* 3 — The tables. */}
      <div className="space-y-3">
        <Panel
          title="Broker leaderboard"
          hint="All time · sorted by net — tap any column header to re-rank"
        >
          <BrokerTable rows={brokers} />
        </Panel>

        <Panel
          title="Lane leaderboard"
          hint="All time · sorted by net $/mi — the rate question, not the volume one"
        >
          <LaneTable rows={lanes} />
        </Panel>

        <Panel
          title="Monthly ledger"
          hint={`Last ${months.length} month${months.length === 1 ? "" : "s"}, newest first · MTD is still in progress`}
        >
          <LedgerTable rows={months} currentKey={currentKey} />
        </Panel>

        {/* 4 — Charts. Secondary: shape over time, which a table of numbers
            genuinely doesn't show. Side by side once there's room. */}
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title="Net vs goal" hint={`Monthly net against the ${usd(monthlyGoal)} goal`} padded>
            {months.length === 0 ? (
              <Empty>Not enough delivered loads to chart a month yet.</Empty>
            ) : (
              <NetVsGoalChart
                data={months.map((b) => ({
                  key: b.key,
                  label: b.label,
                  value: b.net,
                }))}
                goal={monthlyGoal}
                highlightIndex={highlightIndex}
              />
            )}
          </Panel>

          <Panel title="Rate trend" hint="Average $/mi by month, over loaded miles" padded>
            {months.length < 2 ? (
              <Empty>
                A trend needs at least two months — {months.length === 1
                  ? "there's one so far."
                  : "there are none yet."}
              </Empty>
            ) : (
              <RpmTrendChart
                net={months.map((b) => ({
                  key: `n-${b.key}`,
                  label: b.label,
                  value: b.netRpm,
                }))}
                gross={months.map((b) => ({
                  key: `g-${b.key}`,
                  label: b.label,
                  value: b.grossRpm,
                }))}
                highlightIndex={highlightIndex}
              />
            )}
          </Panel>
        </div>

        {/* 5 — Deadhead split, all time. The one mile figure the ledger's
            per-month column can't give: the lifetime loaded/empty ratio. */}
        <Panel
          title="Deadhead"
          hint="Loaded vs empty miles, all time — empty miles burn fuel and earn nothing"
          padded
        >
          {deadhead.total === 0 ? (
            <Empty>
              No odometer readings logged yet, so miles can&rsquo;t be split.
            </Empty>
          ) : (
            <DeadheadBar
              loaded={deadhead.loaded}
              deadhead={deadhead.deadhead}
              total={deadhead.total}
            />
          )}
        </Panel>
      </div>
    </Page>
  );
}

// --------------------------------------------------------------- takeaways

/** The dot only — text stays in the readable fg tiers so a whole line of amber
 *  doesn't shout. Tone lives in a 6px cue, which is enough to sort by. */
function dotClass(tone: TakeawayTone): string {
  return tone === "good"
    ? "bg-ok"
    : tone === "warn"
      ? "bg-warn"
      : tone === "bad"
        ? "bg-bad"
        : "bg-fg-subtle";
}

/**
 * The strip. Plain HTML text at real CSS sizes — same rule the charts learned:
 * nothing here scales with how much data exists, so a line is 12.5px on a phone
 * whether there are three takeaways or six.
 */
function Takeaways({ items }: { items: Takeaway[] }) {
  return (
    <section className="mb-3 overflow-hidden rounded-lg border border-line-strong bg-card shadow-e2">
      <ul className="divide-y divide-line">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-2 px-3 py-[7px]">
            <span
              className={
                "mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full " + dotClass(item.tone)
              }
              aria-hidden="true"
            />
            <p className="text-[12.5px] leading-[1.4] text-fg-muted">
              {item.segs.map((s, i) =>
                s.bold ? (
                  <strong key={i} className="font-bold tabular-nums text-fg">
                    {s.text}
                  </strong>
                ) : (
                  <span key={i}>{s.text}</span>
                ),
              )}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ------------------------------------------------------------------ chrome

function Page({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen border-t border-line bg-canvas text-fg">
      <div className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-6 lg:px-8">
        <PageHeader eyebrow="Insights" title="Performance" className="mb-1" />
        <p className="mb-3 text-[12px] text-fg-muted">
          Delivered loads only, net of diesel, factoring and expenses — the same
          math the load board and trips use.
        </p>
        {children}
      </div>
    </div>
  );
}

/**
 * A titled panel. Same chrome as a trip card so the page reads as one system:
 * the title bar is a mono uppercase label over a hairline, not a filled header.
 *
 * `padded` is for chart content. Tables want the panel's full width so their
 * rows run edge to edge and their pinned first column can sit flush.
 */
function Panel({
  title,
  hint,
  padded = false,
  children,
}: {
  title: string;
  hint?: string;
  padded?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-line-strong bg-card shadow-e2">
      <div className="border-b border-line px-3 py-2">
        <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-fg">
          {title}
        </h2>
        {hint ? (
          <p className="mt-0.5 text-[11px] leading-snug text-fg-subtle">{hint}</p>
        ) : null}
      </div>
      <div className={padded ? "p-3" : ""}>{children}</div>
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-line-strong bg-canvas px-3 py-6 text-center text-[12px] text-fg-muted">
      {children}
    </div>
  );
}

type Tone = "ok" | "bad" | "warn" | "neutral";

function toneClass(tone: Tone): string {
  return tone === "ok"
    ? "text-ok"
    : tone === "bad"
      ? "text-bad"
      : tone === "warn"
        ? "text-warn"
        : "text-fg";
}

/**
 * A month-over-month chip: "▲ +12%", "▼ −$0.14".
 *
 * The arrow tracks DIRECTION and the colour tracks GOOD/BAD, which are not the
 * same axis — deadhead going down is a down arrow in green. Sign uses a real
 * minus (−), not a hyphen, so it lines up with the digits in tabular-nums.
 */
function DeltaChip({ delta }: { delta: Delta }) {
  const up = delta.value > 0;
  const mag = Math.abs(delta.value);
  const body =
    delta.kind === "pct"
      ? `${mag.toFixed(0)}%`
      : delta.kind === "usd"
        ? usd(mag)
        : delta.kind === "rpm"
          ? rpm(mag)
          : `${mag.toFixed(1)} pts`;
  return (
    <span
      className={
        "inline-flex items-center gap-0.5 whitespace-nowrap font-mono text-[10px] font-bold tabular-nums " +
        (delta.good ? "text-ok" : "text-bad")
      }
      title={`${up ? "Up" : "Down"} ${body} vs last month`}
    >
      <span aria-hidden>{up ? "▲" : "▼"}</span>
      {up ? "+" : "−"}
      {body}
    </span>
  );
}

/**
 * One KPI tile — compact. `strong` is the headline Net, which out-weighs its
 * neighbours on size alone (18px vs 15px), no filled tile and no accent rail.
 */
function Kpi({
  label,
  value,
  tone,
  sub,
  delta,
  href,
  strong = false,
}: {
  label: string;
  value: string;
  tone: Tone;
  sub?: string;
  delta?: Delta | null;
  href?: string;
  strong?: boolean;
}) {
  const inner = (
    <>
      <div className="truncate font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-fg-subtle">
        {label}
      </div>
      <div className="mt-0.5 flex items-baseline justify-between gap-1.5">
        <span
          className={
            "truncate font-bold leading-none tabular-nums " +
            (strong ? "text-[17px] sm:text-[18px] " : "text-[15px] sm:text-[16px] ") +
            toneClass(tone)
          }
        >
          {value}
        </span>
        {delta ? <DeltaChip delta={delta} /> : null}
      </div>
      {sub ? (
        <div className="mt-0.5 truncate text-[9.5px] leading-tight text-fg-subtle">
          {sub}
        </div>
      ) : null}
    </>
  );
  const cls = "rounded-md border border-line-strong bg-card px-2.5 py-1.5 shadow-e1";
  if (href) {
    return (
      <Link href={href} className={cls + " block transition-shadow hover:shadow-e2"}>
        {inner}
      </Link>
    );
  }
  return <div className={cls}>{inner}</div>;
}
