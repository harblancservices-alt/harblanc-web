import { describe, it, expect } from "vitest";
import { formatCentralDate, formatCentral, parseServerTimestamp } from "./dates";

// Regression coverage for the 2026-08-08 bug: a bare "YYYY-MM-DD" date-only
// value (pickup_date/delivery_date/service_date/...) silently rendered as
// "—" everywhere, because the timestamptz offset-fixup regex misread the
// day-of-month's trailing "-DD" as a UTC offset and corrupted it into an
// Invalid Date. Every date-only value ends in a 2-digit day, so this hit
// every load, not just one.
describe("parseServerTimestamp — date-only columns", () => {
  it("parses a bare YYYY-MM-DD without corrupting it", () => {
    const d = parseServerTimestamp("2026-08-05");
    expect(d).not.toBeNull();
    expect(Number.isNaN(d?.getTime())).toBe(false);
  });

  it("still parses a real timestamptz value correctly", () => {
    const d = parseServerTimestamp("2026-07-28 02:00:31.26295+00");
    expect(d).not.toBeNull();
    expect(Number.isNaN(d?.getTime())).toBe(false);
  });
});

describe("formatCentralDate — date-only columns", () => {
  it("renders a pickup_date-shaped value, not '—'", () => {
    expect(formatCentralDate("2026-08-04")).toBe("Aug 4, 2026");
  });

  it("renders a delivery_date-shaped value, not '—'", () => {
    expect(formatCentralDate("2026-08-05")).toBe("Aug 5, 2026");
  });

  it("does not shift the date back a day (midnight-UTC-in-Central pitfall)", () => {
    // Central is UTC-5/-6 — anchoring a date-only value at UTC midnight
    // instead of noon would land on the PREVIOUS calendar day here.
    expect(formatCentralDate("2026-01-15")).toBe("Jan 15, 2026");
    expect(formatCentralDate("2026-08-01")).toBe("Aug 1, 2026");
  });

  it("handles every day-of-month, including the ones that look like a UTC offset", () => {
    // "-01" through "-12" are exactly the trailing shapes the broken regex
    // misfired on.
    for (let day = 1; day <= 12; day++) {
      const iso = `2026-03-${String(day).padStart(2, "0")}`;
      expect(formatCentralDate(iso)).not.toBe("—");
    }
  });

  it("still returns '—' for null/blank", () => {
    expect(formatCentralDate(null)).toBe("—");
    expect(formatCentralDate("")).toBe("—");
  });
});

describe("formatCentral — unaffected timestamptz behavior", () => {
  it("still formats a real timestamp with time-of-day", () => {
    expect(formatCentral("2026-07-28 02:00:31.26295+00")).toContain("CST");
  });
});
