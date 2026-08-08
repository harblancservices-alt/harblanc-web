import { describe, it, expect } from "vitest";
import { resolvePerformanceView } from "./range";

/**
 * Executable definition of Performance's range resolver — the preset
 * time-range system (Phase 2 item 1). "Now" is pinned to a fixed Central
 * instant so every case is deterministic: Sat 2026-08-08, 3pm Central
 * (2026-08-08T20:00:00Z), a Saturday.
 *
 * Day-level presets (Today/Yesterday) and "day" granularity were removed
 * 2026-08-08 — Brent thinks in weeks and months only, so a week-length
 * range resolves to its own single week bucket, never a daily breakdown.
 */
const NOW = new Date("2026-08-08T20:00:00Z");

describe("resolvePerformanceView — fixed presets", () => {
  it("this_week is Sunday-anchored (Calendar's own week-key convention) and buckets weekly", () => {
    // 2026-08-08 is a Saturday; the week's Sunday is 2026-08-02.
    const v = resolvePerformanceView({ range: "this_week" }, NOW);
    expect(v.mode).toBe("range");
    expect(v.range).toEqual({ start: "2026-08-02", end: "2026-08-09" });
    expect(v.prevRange).toEqual({ start: "2026-07-26", end: "2026-08-02" });
    expect(v.granularity).toBe("week");
  });

  it("last_week is the 7 days before this_week", () => {
    const v = resolvePerformanceView({ range: "last_week" }, NOW);
    expect(v.range).toEqual({ start: "2026-07-26", end: "2026-08-02" });
    expect(v.prevRange).toEqual({ start: "2026-07-19", end: "2026-07-26" });
    expect(v.granularity).toBe("week");
  });

  it("this_quarter is Jul 1 – Oct 1 (Q3) with prevRange = Q2", () => {
    const v = resolvePerformanceView({ range: "this_quarter" }, NOW);
    expect(v.range).toEqual({ start: "2026-07-01", end: "2026-10-01" });
    expect(v.prevRange).toEqual({ start: "2026-04-01", end: "2026-07-01" });
    expect(v.granularity).toBe("week");
  });

  it("a quarter boundary crossing into the next year rolls prevRange correctly", () => {
    // Q1 2026 (Jan–Mar) → prevRange should be Q4 2025.
    const jan = new Date("2026-02-15T20:00:00Z");
    const v = resolvePerformanceView({ range: "this_quarter" }, jan);
    expect(v.range).toEqual({ start: "2026-01-01", end: "2026-04-01" });
    expect(v.prevRange).toEqual({ start: "2025-10-01", end: "2026-01-01" });
  });

  it("no longer recognizes today/yesterday as presets — falls through to the default current month", () => {
    const v = resolvePerformanceView({ range: "today" }, NOW);
    expect(v.mode).toBe("month");
    const v2 = resolvePerformanceView({ range: "yesterday" }, NOW);
    expect(v2.mode).toBe("month");
  });
});

describe("resolvePerformanceView — year/YTD", () => {
  it("this_year (?year=2026) covers the full calendar year with prevRange = 2025", () => {
    const v = resolvePerformanceView({ year: "2026" }, NOW);
    expect(v.mode).toBe("year");
    expect(v.range).toEqual({ start: "2026-01-01", end: "2027-01-01" });
    expect(v.prevRange).toEqual({ start: "2025-01-01", end: "2026-01-01" });
    expect(v.granularity).toBe("month");
  });

  it("ytd is Jan 1 through today, prevRange is the SAME window one year earlier (YoY)", () => {
    const v = resolvePerformanceView({ range: "ytd" }, NOW);
    expect(v.mode).toBe("ytd");
    expect(v.range).toEqual({ start: "2026-01-01", end: "2026-08-09" });
    expect(v.prevRange).toEqual({ start: "2025-01-01", end: "2025-08-09" });
    expect(v.granularity).toBe("month");
  });
});

describe("resolvePerformanceView — month (unchanged) and custom", () => {
  it("defaults to the current Central month with no params, bucketed weekly", () => {
    const v = resolvePerformanceView({}, NOW);
    expect(v.mode).toBe("month");
    if (v.mode === "month") expect(v.period).toEqual({ year: 2026, month: 7 }); // August, 0-based
    expect(v.granularity).toBe("week");
  });

  it("?month= browses an explicit month with a calendar-month prevRange, bucketed weekly", () => {
    const v = resolvePerformanceView({ month: "2026-03" }, NOW);
    expect(v.mode).toBe("month");
    expect(v.range).toEqual({ start: "2026-03-01", end: "2026-04-01" });
    expect(v.prevRange).toEqual({ start: "2026-02-01", end: "2026-03-01" });
    expect(v.granularity).toBe("week");
  });

  it("custom from/to resolves an inclusive day range with an equal-length prevRange", () => {
    const v = resolvePerformanceView({ from: "2026-08-01", to: "2026-08-10" }, NOW);
    expect(v.mode).toBe("custom");
    expect(v.range).toEqual({ start: "2026-08-01", end: "2026-08-11" });
    expect(v.prevRange).toEqual({ start: "2026-07-22", end: "2026-08-01" });
  });

  it("custom precedence wins over year/month/range when all are present", () => {
    const v = resolvePerformanceView({ from: "2026-08-01", to: "2026-08-02", year: "2025", month: "2026-01", range: "this_week" }, NOW);
    expect(v.mode).toBe("custom");
  });

  it("even a short custom range buckets weekly, never daily", () => {
    const short = resolvePerformanceView({ from: "2026-08-01", to: "2026-08-05" }, NOW); // 5 days
    expect(short.granularity).toBe("week");
  });

  it("a wide custom range falls back to weekly, then monthly granularity — no daily tier", () => {
    const week = resolvePerformanceView({ from: "2026-01-01", to: "2026-03-01" }, NOW); // ~60 days
    expect(week.granularity).toBe("week");
    const month = resolvePerformanceView({ from: "2026-01-01", to: "2026-12-31" }, NOW); // ~365 days
    expect(month.granularity).toBe("month");
  });
});
