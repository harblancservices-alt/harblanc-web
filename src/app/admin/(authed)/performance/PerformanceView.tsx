import type { ReactNode } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import type {
  MonthBucket,
  PartyStat,
  PayTiming,
  PeriodSummary,
  DeadheadSplit,
  Takeaway,
  TakeawayTone,
} from "@/lib/dispatch/performance";
import {
  NetVsGoalChart,
  RpmTrendChart,
  GrossVsNetChart,
  RankedBars,
  DeadheadBar,
  usd,
  rpm,
  pct,
} from "./charts";

/**
 * Performance — the "what should I haul next" page.
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
 * VISUAL: the trip cards' V2 chrome (rounded-lg / border-line-strong / bg-card
 * / shadow-e2), a neutral page by default, with green and red reserved for
 * money that is actually good or bad. Charts are inline SVG (see ./charts).
 */

export type PerformanceData = {
  /** e.g. "July" — the month the KPI row is scoped to. */
  monthLabel: string;
  /** The actionable readings that head the page. Never empty — see `takeaways`. */
  takeaways: Takeaway[];
  currentMonth: PeriodSummary;
  allTime: PeriodSummary;
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

  return (
    <Page>
      {/* 0 — Takeaways. The one part of the page that says what to DO; it
          leads because a number the owner has to interpret is a number he
          reads on a phone at a truck stop and doesn't act on. */}
      <Takeaways items={takeaways} />

      {/* 1 — KPI row. Money reads green (red when it's a loss); counts and
          ratios stay neutral, because "7 loads" isn't good or bad. */}
      <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi
          label={`Net · ${monthLabel}`}
          value={usd(m.net)}
          tone={m.net < 0 ? "bad" : "ok"}
          strong
        />
        <Kpi label={`Gross · ${monthLabel}`} value={usd(m.gross)} tone="ok" />
        <div className={KPI_CARD}>
          <KpiLabel>Avg / mi</KpiLabel>
          <div className="mt-1 truncate text-[16px] font-bold leading-none tabular-nums text-ok sm:text-[18px]">
            {rpm(m.netRpm)}
            <span className="ml-1 text-[10px] font-medium text-fg-subtle">net</span>
          </div>
          <div className="mt-1 truncate text-[13px] font-bold leading-none tabular-nums text-steel">
            {rpm(m.grossRpm)}
            <span className="ml-1 text-[10px] font-medium text-fg-subtle">gross</span>
          </div>
        </div>
        <Kpi label="Loads delivered" value={String(m.loads)} tone="neutral" />
        <Kpi
          label="Deadhead"
          value={pct(m.deadheadPct)}
          tone="neutral"
          sub={
            m.deadheadPct == null
              ? "no miles logged"
              : `${Math.round(m.deadheadMiles).toLocaleString("en-US")} empty mi`
          }
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
      </div>

      {/* Secondary strip — the same slice, one line, no chart. Margin and
          net-per-load are the two figures that decide whether a rate is worth
          taking; A/R is what's still owed regardless of month. */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MiniKpi label={`Margin · ${monthLabel}`} value={pct(m.marginPct)} />
        <MiniKpi
          label="Net / load"
          value={m.netPerLoad == null ? "—" : usd(m.netPerLoad)}
        />
        <MiniKpi
          label="Miles · all time"
          value={Math.round(
            allTime.loadedMiles + allTime.deadheadMiles,
          ).toLocaleString("en-US")}
        />
        <MiniKpi
          label="A/R outstanding"
          value={usd(arTotal)}
          href="/admin/dispatch/receivables"
          tone={arTotal > 0 ? "bad" : "neutral"}
        />
      </div>

      <div className="space-y-3">
        {/* 2 — Net vs goal. */}
        <Section
          title="Net vs goal"
          hint={`Monthly net profit against the ${usd(monthlyGoal)} goal · last ${months.length} month${months.length === 1 ? "" : "s"}`}
        >
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
        </Section>

        {/* 3 — RPM trend. */}
        <Section
          title="Rate trend"
          hint="Average $/mi by month, over loaded miles"
        >
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
        </Section>

        {/* 4 — Gross vs net. */}
        <Section
          title="Gross vs net"
          hint="Revenue against take-home — the gap is what the run cost"
        >
          {months.length === 0 ? (
            <Empty>No months to compare yet.</Empty>
          ) : (
            <GrossVsNetChart
              data={months.map((b) => ({
                key: b.key,
                label: b.label,
                gross: b.gross,
                net: b.net,
              }))}
              highlightIndex={highlightIndex}
            />
          )}
        </Section>

        {/* 5 + 6 — the two rankings sit side by side once there's room; they
            answer the same question (what's worth taking) from either end. */}
        <div className="grid gap-3 lg:grid-cols-2">
          <Section title="Top brokers" hint="By total net, all time">
            {brokers.length === 0 ? (
              <Empty>No brokers to rank yet.</Empty>
            ) : (
              <RankedBars
                rows={brokers.map((b) => ({
                  key: b.name,
                  name: b.name,
                  value: b.net,
                  primary: usd(b.net),
                  negative: b.net < 0,
                  meta: `${b.loads} load${b.loads === 1 ? "" : "s"} · ${rpm(b.netRpm)}/mi net · ${pct(b.marginPct)} margin`,
                }))}
              />
            )}
          </Section>

          <Section title="Best lanes" hint="By average net $/mi, all time">
            {lanes.length === 0 ? (
              <Empty>
                Lanes need loaded miles on a delivered load to rank.
              </Empty>
            ) : (
              <RankedBars
                rows={lanes.map((l) => ({
                  key: l.name,
                  name: l.name,
                  value: l.netRpm ?? 0,
                  primary: `${rpm(l.netRpm)}/mi`,
                  negative: (l.netRpm ?? 0) < 0,
                  meta: `${l.loads} load${l.loads === 1 ? "" : "s"} · ${usd(l.net)} net · ${Math.round(l.loadedMiles).toLocaleString("en-US")} mi`,
                }))}
              />
            )}
          </Section>
        </div>

        {/* 7 — Deadhead. */}
        <Section
          title="Deadhead"
          hint="Loaded vs empty miles, all time — empty miles burn fuel and earn nothing"
        >
          {deadhead.total === 0 ? (
            <Empty>
              No odometer readings logged yet, so miles can&rsquo;t be split.
            </Empty>
          ) : (
            <>
              <div className="mb-2 flex items-baseline gap-2">
                <span
                  className={
                    "text-[26px] font-bold leading-none tabular-nums " +
                    (deadhead.pct != null && deadhead.pct >= 25
                      ? "text-warn"
                      : "text-fg")
                  }
                >
                  {pct(deadhead.pct, 1)}
                </span>
                <span className="text-[13px] text-fg-muted">
                  of every mile ran empty
                </span>
              </div>
              <DeadheadBar
                loaded={deadhead.loaded}
                deadhead={deadhead.deadhead}
                total={deadhead.total}
              />
            </>
          )}
        </Section>
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
 * nothing here scales with how much data exists, so a line is 13px on a phone
 * whether there are three takeaways or six.
 */
function Takeaways({ items }: { items: Takeaway[] }) {
  return (
    <section className="mb-2 overflow-hidden rounded-lg border border-line-strong bg-card shadow-e2">
      <div className="border-b border-line px-3.5 py-2.5">
        <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-fg">
          Takeaways
        </h2>
        <p className="mt-0.5 text-[11.5px] leading-snug text-fg-subtle">
          What the numbers below say to do next
        </p>
      </div>
      <ul className="divide-y divide-line">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-2.5 px-3.5 py-2.5">
            <span
              className={
                "mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full " + dotClass(item.tone)
              }
              aria-hidden="true"
            />
            <p className="text-[13px] leading-[1.45] text-fg-muted">
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
      <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 lg:px-8">
        <PageHeader eyebrow="Insights" title="Performance" className="mb-1.5" />
        <p className="mb-3 text-[13px] text-fg-muted">
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
 */
function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-line-strong bg-card shadow-e2">
      <div className="border-b border-line px-3.5 py-2.5">
        <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-fg">
          {title}
        </h2>
        {hint ? (
          <p className="mt-0.5 text-[11.5px] leading-snug text-fg-subtle">{hint}</p>
        ) : null}
      </div>
      <div className="p-3.5">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-line-strong bg-canvas px-3 py-7 text-center text-[12.5px] text-fg-muted">
      {children}
    </div>
  );
}

/** The KPI tiles' shared surface — the trip cards' chrome exactly. */
const KPI_CARD =
  "rounded-lg border border-line-strong bg-card px-3 py-2.5 shadow-e2";

function KpiLabel({ children }: { children: ReactNode }) {
  return (
    <div className="truncate font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-fg-subtle">
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
 * One KPI tile. `strong` is the headline Net — it out-weighs its neighbours on
 * size alone (20px vs 16px), no filled tile and no accent rail.
 */
function Kpi({
  label,
  value,
  tone,
  sub,
  strong = false,
}: {
  label: string;
  value: string;
  tone: Tone;
  sub?: string;
  strong?: boolean;
}) {
  return (
    <div className={KPI_CARD}>
      <KpiLabel>{label}</KpiLabel>
      <div
        className={
          "mt-1 truncate font-bold leading-none tabular-nums " +
          (strong ? "text-[19px] sm:text-[21px] " : "text-[16px] sm:text-[18px] ") +
          toneClass(tone)
        }
      >
        {value}
      </div>
      {sub ? (
        <div className="mt-1 truncate text-[10px] leading-tight text-fg-subtle">
          {sub}
        </div>
      ) : null}
    </div>
  );
}

/** Compact secondary metric — half the height of a KPI tile, same language. */
function MiniKpi({
  label,
  value,
  tone = "neutral",
  href,
}: {
  label: string;
  value: string;
  tone?: Tone;
  href?: string;
}) {
  const inner = (
    <>
      <KpiLabel>{label}</KpiLabel>
      <div
        className={
          "mt-0.5 truncate font-mono text-[14px] font-bold leading-tight tabular-nums " +
          toneClass(tone)
        }
      >
        {value}
      </div>
    </>
  );
  const cls =
    "rounded-md border border-line bg-card px-2.5 py-1.5 shadow-e1";
  if (href) {
    return (
      <Link
        href={href}
        className={cls + " block transition-shadow hover:shadow-e2"}
      >
        {inner}
      </Link>
    );
  }
  return <div className={cls}>{inner}</div>;
}
