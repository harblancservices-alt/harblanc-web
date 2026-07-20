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
  type PerfLoad,
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
