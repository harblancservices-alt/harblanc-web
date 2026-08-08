import { describe, it, expect } from "vitest";
import {
  monthlyBuckets,
  brokerStats,
  laneStats,
  laneKey,
  deadheadSplit,
  payTiming,
  daysBetween,
  summarize,
  monthKey,
  takeaways,
  rangeTrendBuckets,
  formatDelta,
  efficiencyTakeaways,
  type PerfLoad,
  type Takeaway,
} from "./performance";

/**
 * Executable definition of the Performance page's aggregation rules.
 *
 * The money itself (rate/net) is fuel.ts' output and is asserted in fuel.test —
 * what's pinned here is how those pre-costed figures are BUCKETED: the RPM
 * denominator (loaded miles only), the zero-fill of dead months, the deadhead
 * share being of total miles, and days-to-pay being calendar days.
 */

function load(p: Partial<PerfLoad> = {}): PerfLoad {
  return {
    id: "l1",
    rate: 1000,
    net: 700,
    loadedMiles: 500,
    deadheadMiles: 100,
    year: 2026,
    month: 6, // July
    date: "2026-07-10",
    broker: "Acme",
    origin: "Houston, TX",
    destination: "Dallas, TX",
    deliveryDate: "2026-07-10",
    paidAt: null,
    ...p,
  };
}

describe("monthlyBuckets", () => {
  it("sums gross/net/miles per month and derives $/mi over LOADED miles", () => {
    const [b] = monthlyBuckets([
      load({ rate: 1000, net: 700, loadedMiles: 500, deadheadMiles: 100 }),
      load({ rate: 2000, net: 1300, loadedMiles: 500, deadheadMiles: 200 }),
    ]);
    expect(b.loads).toBe(2);
    expect(b.gross).toBe(3000);
    expect(b.net).toBe(2000);
    expect(b.loadedMiles).toBe(1000);
    expect(b.deadheadMiles).toBe(300);
    // Deadhead miles are NOT in the denominator — same rule as the load board.
    expect(b.netRpm).toBe(2);
    expect(b.grossRpm).toBe(3);
  });

  it("zero-fills months with no loads so a gap year isn't drawn as continuous", () => {
    const out = monthlyBuckets([
      load({ year: 2026, month: 0 }),
      load({ year: 2026, month: 3 }),
    ]);
    expect(out.map((b) => b.key)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
    ]);
    expect(out[1].loads).toBe(0);
    expect(out[1].net).toBe(0);
    // A month that moved no miles has UNKNOWN $/mi, not $0.00/mi.
    expect(out[1].netRpm).toBeNull();
  });

  it("spans a year boundary in order", () => {
    const out = monthlyBuckets([
      load({ year: 2025, month: 11 }),
      load({ year: 2026, month: 1 }),
    ]);
    expect(out.map((b) => b.key)).toEqual(["2025-12", "2026-01", "2026-02"]);
    expect(out[0].longLabel).toBe("Dec ’25");
  });

  it("keeps only the most recent `limit` months", () => {
    const rows = Array.from({ length: 18 }, (_, i) =>
      load({ year: 2025 + Math.floor(i / 12), month: i % 12 }),
    );
    const out = monthlyBuckets(rows, 12);
    expect(out).toHaveLength(12);
    expect(out[out.length - 1].key).toBe(monthKey(2026, 5));
  });

  it("returns nothing for no loads", () => {
    expect(monthlyBuckets([])).toEqual([]);
  });
});

describe("brokerStats", () => {
  it("ranks by total net and carries load count + avg RPM", () => {
    const out = brokerStats([
      load({ broker: "Acme", net: 100, rate: 500, loadedMiles: 100 }),
      load({ broker: "Acme", net: 100, rate: 500, loadedMiles: 100 }),
      load({ broker: "Zenith", net: 900, rate: 1000, loadedMiles: 300 }),
    ]);
    expect(out.map((b) => b.name)).toEqual(["Zenith", "Acme"]);
    expect(out[1].loads).toBe(2);
    expect(out[1].netRpm).toBe(1); // 200 net ÷ 200 loaded mi
    expect(out[0].marginPct).toBe(90); // 900 ÷ 1000
  });
});

describe("laneStats", () => {
  it("ranks lanes by avg net $/mi, breaking ties on total net", () => {
    const out = laneStats([
      // 1.00/mi, run twice
      load({ origin: "A", destination: "B", net: 100, loadedMiles: 100 }),
      load({ origin: "A", destination: "B", net: 100, loadedMiles: 100 }),
      // 2.00/mi, run once — better rate, so it leads
      load({ origin: "C", destination: "D", net: 200, loadedMiles: 100 }),
    ]);
    expect(out.map((l) => l.name)).toEqual(["C → D", "A → B"]);
    expect(out[0].netRpm).toBe(2);
    expect(out[1].loads).toBe(2);
  });

  it("drops lanes with no measurable loaded miles rather than ranking them at zero", () => {
    const out = laneStats([load({ origin: "A", destination: "B", loadedMiles: 0 })]);
    expect(out).toEqual([]);
  });

  it("formats a lane key with an arrow, falling back per side", () => {
    expect(laneKey("Houston, TX", "Dallas, TX")).toBe("Houston, TX → Dallas, TX");
    expect(laneKey("", "Dallas, TX")).toBe("— → Dallas, TX");
    expect(laneKey("", "")).toBe("");
  });
});

describe("deadheadSplit", () => {
  it("reports empty miles as a share of TOTAL miles", () => {
    const d = deadheadSplit([load({ loadedMiles: 300, deadheadMiles: 100 })]);
    expect(d.total).toBe(400);
    expect(d.pct).toBe(25); // 100 ÷ 400, not 100 ÷ 300
  });

  it("is null (not zero) when nothing moved", () => {
    expect(deadheadSplit([]).pct).toBeNull();
  });
});

describe("payTiming", () => {
  it("counts calendar days from delivery to paid, ignoring the paid timestamp's clock", () => {
    expect(daysBetween("2026-07-03", "2026-07-24T23:15:00Z")).toBe(21);
  });

  it("averages and medians only over loads that actually got paid", () => {
    const t = payTiming([
      load({ deliveryDate: "2026-07-01", paidAt: "2026-07-11" }), // 10
      load({ deliveryDate: "2026-07-01", paidAt: "2026-07-21" }), // 20
      load({ deliveryDate: "2026-07-01", paidAt: "2026-10-29" }), // 120 straggler
      load({ deliveryDate: "2026-07-01", paidAt: null }), // still owed — excluded
    ]);
    expect(t.sample).toBe(3);
    expect(t.avgDays).toBe(50);
    expect(t.medianDays).toBe(20); // the straggler can't drag the median
  });

  it("has no answer when nothing has been paid", () => {
    expect(payTiming([load({ paidAt: null })])).toEqual({
      avgDays: null,
      medianDays: null,
      sample: 0,
    });
  });
});

describe("summarize", () => {
  it("derives margin, net-per-load and deadhead % off the same totals", () => {
    const s = summarize([
      load({ rate: 1000, net: 600, loadedMiles: 400, deadheadMiles: 100 }),
      load({ rate: 1000, net: 400, loadedMiles: 400, deadheadMiles: 100 }),
    ]);
    expect(s.gross).toBe(2000);
    expect(s.net).toBe(1000);
    expect(s.marginPct).toBe(50);
    expect(s.netPerLoad).toBe(500);
    expect(s.netRpm).toBe(1.25); // 1000 ÷ 800 loaded
    expect(s.deadheadPct).toBe(20); // 200 ÷ 1000 total
  });

  it("leaves rate-based figures null rather than dividing by zero", () => {
    const s = summarize([]);
    expect(s.netRpm).toBeNull();
    expect(s.marginPct).toBeNull();
    expect(s.netPerLoad).toBeNull();
  });
});

describe("takeaways", () => {
  const ctx = { year: 2026, month: 6, monthlyGoal: 10_000, daysRemaining: 10 };
  /** Flatten a takeaway back to the sentence the owner reads. */
  const text = (t: Takeaway) => t.segs.map((s) => s.text).join("");
  const find = (ts: Takeaway[], id: string) => ts.find((t) => t.id === id);

  it("says one honest line rather than guessing from two loads", () => {
    const ts = takeaways([load(), load()], ctx);
    expect(ts).toHaveLength(1);
    expect(ts[0].id).toBe("seed");
    expect(ts[0].tone).toBe("neutral");
  });

  it("paces the goal off days remaining, using the canonical net", () => {
    // 3 loads × $700 = $2,100 of a $10k goal; $7,900 ÷ 10 days = $790/day.
    const ts = takeaways([load(), load(), load()], ctx);
    const goal = find(ts, "goal-pace");
    expect(goal?.tone).toBe("warn");
    expect(text(goal!)).toContain("$2,100");
    expect(text(goal!)).toContain("$790/day");
    expect(text(goal!)).toContain("10 days");
  });

  it("celebrates a cleared goal instead of asking for $0/day", () => {
    const ts = takeaways(
      [load({ net: 6000 }), load({ net: 6000 }), load({ net: 100 })],
      ctx,
    );
    const goal = find(ts, "goal-pace");
    expect(goal?.tone).toBe("good");
    expect(text(goal!)).toContain("cleared");
    expect(text(goal!)).toContain("$2,100"); // 12,100 − 10,000 over
  });

  it("names the best lane and the one clearly under the average", () => {
    const ts = takeaways(
      [
        // $2.00/mi
        load({ origin: "Houston, TX", destination: "Dallas, TX", net: 1000, loadedMiles: 500 }),
        // $1.60/mi
        load({ origin: "Dallas, TX", destination: "Tulsa, OK", net: 800, loadedMiles: 500 }),
        // $0.40/mi — well under the $1.33 blended average
        load({ origin: "Tulsa, OK", destination: "Joplin, MO", net: 200, loadedMiles: 500 }),
      ],
      ctx,
    );
    expect(text(find(ts, "best-lane")!)).toContain("Houston, TX → Dallas, TX");
    expect(text(find(ts, "best-lane")!)).toContain("$2.00/mi");
    const weak = find(ts, "weak-lane");
    expect(text(weak!)).toContain("Tulsa, OK → Joplin, MO");
    expect(text(weak!)).toContain("$0.40/mi");
  });

  it("ignores a lane too short to rate", () => {
    const ts = takeaways(
      [
        load({ origin: "A", destination: "B", net: 900, loadedMiles: 40 }), // 40mi
        load({ origin: "C", destination: "D", net: 800, loadedMiles: 500 }),
        load({ origin: "E", destination: "F", net: 700, loadedMiles: 500 }),
      ],
      ctx,
    );
    // The 40-mile lane rates $22.50/mi and would top the list on $/mi alone.
    expect(text(find(ts, "best-lane")!)).not.toContain("A → B");
  });

  it("flags an underpaying broker only with more than one load behind it", () => {
    const cheap = { broker: "Lowball", net: 200, loadedMiles: 500 };
    const ts = takeaways(
      [
        load({ broker: "Acme", net: 1000, loadedMiles: 500 }),
        load({ broker: "Acme", net: 1000, loadedMiles: 500 }),
        load(cheap),
        load(cheap),
      ],
      ctx,
    );
    expect(text(find(ts, "underpaying-broker")!)).toContain("Lowball");

    const oneOff = takeaways(
      [
        load({ broker: "Acme", net: 1000, loadedMiles: 500 }),
        load({ broker: "Acme", net: 1000, loadedMiles: 500 }),
        load(cheap),
      ],
      ctx,
    );
    expect(find(oneOff, "underpaying-broker")).toBeUndefined();
  });

  it("stays quiet on deadhead in the middle of the range", () => {
    // 20% empty — neither a win to keep up nor a problem to chase.
    const mid = takeaways(
      [
        load({ loadedMiles: 800, deadheadMiles: 200 }),
        load({ loadedMiles: 800, deadheadMiles: 200 }),
        load({ loadedMiles: 800, deadheadMiles: 200 }),
      ],
      ctx,
    );
    expect(find(mid, "deadhead")).toBeUndefined();

    const high = takeaways(
      [
        load({ loadedMiles: 600, deadheadMiles: 400 }),
        load({ loadedMiles: 600, deadheadMiles: 400 }),
        load({ loadedMiles: 600, deadheadMiles: 400 }),
      ],
      ctx,
    );
    expect(find(high, "deadhead")?.tone).toBe("warn");
    expect(text(find(high, "deadhead")!)).toContain("40%");
  });

  it("reads the rate trend against the immediately preceding month", () => {
    const ts = takeaways(
      [
        load({ year: 2026, month: 5, net: 500, loadedMiles: 500 }), // $1.00
        load({ year: 2026, month: 5, net: 500, loadedMiles: 500 }),
        load({ year: 2026, month: 6, net: 750, loadedMiles: 500 }), // $1.50
      ],
      ctx,
    );
    const trend = find(ts, "rpm-trend");
    expect(trend?.tone).toBe("good");
    expect(text(trend!)).toContain("up $0.50/mi");
  });

  it("never floods the strip", () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      load({
        broker: `Broker ${i % 5}`,
        origin: `City ${i % 7}`,
        destination: `City ${(i + 3) % 7}`,
        net: 200 + i * 40,
        loadedMiles: 400 + i * 10,
        deadheadMiles: 300,
        deliveryDate: "2026-07-01",
        paidAt: "2026-09-01",
      }),
    );
    expect(takeaways(many, ctx).length).toBeLessThanOrEqual(6);
  });
});

/** Adaptive trend bucketing (Phase 2 item 2; day-level bucketing removed
 * 2026-08-08 — Brent thinks in weeks/months only) — buckets the SELECTED
 * range's own loads at week/month granularity, windowed by the range
 * itself (not by where loads happen to exist), so an empty week/month
 * inside the range still renders as a real zero bar. */
describe("rangeTrendBuckets", () => {
  it("week granularity chunks into 7-day windows anchored at range.start, zero-filled", () => {
    const loads = [
      load({ date: "2026-08-01", rate: 1000, net: 700, loadedMiles: 500, deadheadMiles: 100 }),
      load({ date: "2026-08-09", rate: 200, net: 100, loadedMiles: 100, deadheadMiles: 0 }),
    ];
    const buckets = rangeTrendBuckets(loads, { start: "2026-08-01", end: "2026-08-22" }, "week");
    expect(buckets).toHaveLength(3);
    expect(buckets[0].gross).toBe(1000);
    expect(buckets[0].net).toBe(700);
    expect(buckets[0].netRpm).toBe(1.4);
    expect(buckets[1].gross).toBe(200); // second week
    expect(buckets[2].gross).toBe(0); // third week, zero-filled not skipped
  });

  it("a single-week range collapses to one bucket — its own weekly total, not a daily breakdown", () => {
    const loads = [load({ date: "2026-08-03", rate: 1000, net: 700, loadedMiles: 500, deadheadMiles: 100 })];
    const buckets = rangeTrendBuckets(loads, { start: "2026-08-02", end: "2026-08-09" }, "week");
    expect(buckets).toHaveLength(1);
    expect(buckets[0].gross).toBe(1000);
  });

  it("month granularity windows by the RANGE, not by where loads exist — a full year shows 12 months even with 1 load", () => {
    const loads = [load({ date: "2026-03-15", year: 2026, month: 2, rate: 500, net: 300, loadedMiles: 200, deadheadMiles: 0 })];
    const buckets = rangeTrendBuckets(loads, { start: "2026-01-01", end: "2027-01-01" }, "month");
    expect(buckets).toHaveLength(12);
    expect(buckets[2].label).toBe("Mar");
    expect(buckets[2].gross).toBe(500);
    expect(buckets[0].gross).toBe(0);
  });
});

describe("formatDelta", () => {
  it("formats each Delta kind with the sign outside the unit", () => {
    expect(formatDelta({ kind: "pct", value: 8, good: true })).toBe("+8%");
    expect(formatDelta({ kind: "usd", value: -310, good: false })).toBe("-$310");
    expect(formatDelta({ kind: "rpm", value: -0.04, good: false })).toBe("-$0.04/mi");
    expect(formatDelta({ kind: "pts", value: 3, good: true })).toBe("+3.0pts");
  });
});

/** "Where to do better" efficiency-review sentences — Brent's reframe of
 * Insights around his named headline metrics (Deadhead %, Gross $/mi,
 * Net $/mi), phrased with absolute before/after values, not just a delta. */
describe("efficiencyTakeaways", () => {
  it("flags deadhead rising, phrased with the before/after percentages", () => {
    const cur = summarize([load({ net: 700, rate: 1000, loadedMiles: 860, deadheadMiles: 140 })]); // 14% deadhead
    const prev = summarize([load({ net: 700, rate: 1000, loadedMiles: 910, deadheadMiles: 90 })]); // 9% deadhead
    const items = efficiencyTakeaways(cur, prev, "last period");
    const deadhead = items.find((tk) => tk.id === "deadhead-change");
    expect(deadhead).toBeDefined();
    expect(deadhead!.tone).toBe("bad");
    const text = deadhead!.segs.map((s) => s.text).join("");
    expect(text).toContain("rose");
    expect(text).toContain("9%");
    expect(text).toContain("14%");
  });

  it("flags gross/mi improving while net/mi doesn't — costs ate the gain", () => {
    const cur = summarize([load({ net: 500, rate: 2000, loadedMiles: 1000, deadheadMiles: 0 })]); // gross/mi 2.00, net/mi 0.50
    const prev = summarize([load({ net: 700, rate: 1800, loadedMiles: 1000, deadheadMiles: 0 })]); // gross/mi 1.80, net/mi 0.70
    const items = efficiencyTakeaways(cur, prev, "last period");
    const divergence = items.find((tk) => tk.id === "rpm-divergence");
    expect(divergence).toBeDefined();
    expect(divergence!.tone).toBe("bad");
    expect(divergence!.segs.map((s) => s.text).join("")).toContain("costs ate the gain");
  });

  it("falls back to a plain net/mi sentence when net/mi and gross/mi move together", () => {
    const cur = summarize([load({ net: 900, rate: 2000, loadedMiles: 1000, deadheadMiles: 0 })]); // net/mi 0.90
    const prev = summarize([load({ net: 500, rate: 1600, loadedMiles: 1000, deadheadMiles: 0 })]); // net/mi 0.50
    const items = efficiencyTakeaways(cur, prev, "last period");
    const netChange = items.find((tk) => tk.id === "net-rpm-change");
    expect(netChange).toBeDefined();
    expect(netChange!.tone).toBe("good");
  });

  it("returns no items when nothing moved meaningfully", () => {
    const cur = summarize([load({ net: 700, rate: 1000, loadedMiles: 500, deadheadMiles: 100 })]);
    const prev = summarize([load({ net: 700, rate: 1000, loadedMiles: 500, deadheadMiles: 100 })]);
    expect(efficiencyTakeaways(cur, prev, "last period")).toEqual([]);
  });
});
