import { describe, it, expect } from "vitest";
import {
  attributionDate,
  periodOf,
  isInPeriod,
  currentPeriod,
  periodRange,
  periodLabel,
} from "./attribution";

describe("attributionDate", () => {
  it("uses pickup_date as the rule, always, when present", () => {
    expect(
      attributionDate({ pickup_date: "2026-08-01", delivery_date: "2026-08-05", created_at: "2026-07-20T00:00:00Z" }),
    ).toBe("2026-08-01");
  });

  it("falls back to delivery_date when pickup_date is missing", () => {
    expect(attributionDate({ pickup_date: null, delivery_date: "2026-08-05", created_at: "2026-07-20T00:00:00Z" })).toBe(
      "2026-08-05",
    );
  });

  it("falls back to created_at when both dates are missing", () => {
    expect(attributionDate({ pickup_date: null, delivery_date: null, created_at: "2026-07-20T00:00:00Z" })).toBe(
      "2026-07-20T00:00:00Z",
    );
  });

  it("returns null when nothing is available", () => {
    expect(attributionDate({ pickup_date: null, delivery_date: null, created_at: null })).toBeNull();
  });
});

describe("periodOf / isInPeriod", () => {
  it("parses the year/month from a YYYY-MM-DD prefix, 0-based month", () => {
    expect(periodOf("2026-08-01")).toEqual({ year: 2026, month: 7 });
  });

  it("returns null for a null/unparseable date", () => {
    expect(periodOf(null)).toBeNull();
    expect(periodOf("not-a-date")).toBeNull();
  });

  it("matches a date against its period", () => {
    expect(isInPeriod("2026-08-15", { year: 2026, month: 7 })).toBe(true);
    expect(isInPeriod("2026-09-01", { year: 2026, month: 7 })).toBe(false);
  });
});

describe("periodRange", () => {
  it("gives [start, end) bounds for a mid-year month", () => {
    expect(periodRange({ year: 2026, month: 7 })).toEqual({ start: "2026-08-01", end: "2026-09-01" });
  });

  it("rolls over the year at December", () => {
    expect(periodRange({ year: 2026, month: 11 })).toEqual({ start: "2026-12-01", end: "2027-01-01" });
  });
});

describe("currentPeriod", () => {
  it("resolves in Central time, not UTC — 7pm CDT (already tomorrow/next-month in UTC) still reads as the prior UTC-day's month", () => {
    // 2026-08-31 23:30 UTC == 2026-08-31 18:30 CDT (UTC-5) — same Central day/month.
    const now = new Date("2026-08-31T23:30:00Z");
    expect(currentPeriod(now)).toEqual({ year: 2026, month: 7 });
  });

  it("rolls to the next month once Central time itself crosses midnight", () => {
    // 2026-09-01 04:30 UTC == 2026-08-31 23:30 CDT — still August in Central.
    const stillAugust = new Date("2026-09-01T04:30:00Z");
    expect(currentPeriod(stillAugust)).toEqual({ year: 2026, month: 7 });

    // 2026-09-01 06:30 UTC == 2026-09-01 01:30 CDT — now September in Central.
    const nowSeptember = new Date("2026-09-01T06:30:00Z");
    expect(currentPeriod(nowSeptember)).toEqual({ year: 2026, month: 8 });
  });
});

describe("periodLabel", () => {
  it("formats a period as \"Month YYYY\"", () => {
    expect(periodLabel({ year: 2026, month: 7 })).toBe("August 2026");
  });
});
