import { describe, it, expect } from "vitest";
import {
  closeOutDate,
  goalMonthParts,
  currentGoalMonth,
  currentGoalMonthLabel,
  currentBusinessDate,
} from "./goal-month";

/**
 * Goal-month attribution rule for the $10k net-profit goal gauge. The
 * production implementation now lives in @/lib/dispatch/goal-month and is
 * imported directly here (previously mirrored inline). This spec is the
 * executable definition of the boundary rule + the timezone rule.
 */

// month is 0-based (0 = Jan … 11 = Dec)
describe("goal-month attribution (close-out date − 1 day)", () => {
  it("a load closed on the 1st counts toward the PREVIOUS month", () => {
    expect(goalMonthParts("2026-07-01")).toEqual({ year: 2026, month: 5 }); // June
    expect(goalMonthParts("2026-06-01")).toEqual({ year: 2026, month: 4 }); // May
  });

  it("a load closed on the 2nd counts toward the CURRENT month", () => {
    expect(goalMonthParts("2026-07-02")).toEqual({ year: 2026, month: 6 }); // July
  });

  it("mid-month closes stay in that month", () => {
    expect(goalMonthParts("2026-07-15")).toEqual({ year: 2026, month: 6 }); // July
    expect(goalMonthParts("2026-07-31")).toEqual({ year: 2026, month: 6 }); // July
  });

  it("Aug 1 counts toward July (next-month 1st rolls back)", () => {
    expect(goalMonthParts("2026-08-01")).toEqual({ year: 2026, month: 6 }); // July
  });

  it("Jan 1 rolls back across the year boundary to the previous December", () => {
    expect(goalMonthParts("2026-01-01")).toEqual({ year: 2025, month: 11 }); // Dec 2025
  });

  it("handles the non-leap-year Mar 1 → Feb 28 case", () => {
    // 2026 is not a leap year: Mar 1 − 1 day = Feb 28 → February
    expect(goalMonthParts("2026-03-01")).toEqual({ year: 2026, month: 1 });
  });

  it("returns null for a missing/invalid date", () => {
    expect(goalMonthParts(null)).toBeNull();
    expect(goalMonthParts("not-a-date")).toBeNull();
  });
});

describe("currentBusinessDate — today's calendar day in America/Chicago", () => {
  it("stays on the local day after UTC has already rolled over", () => {
    // 2026-07-16 02:00Z is still Jul 15, 9pm in Houston — the calendar's today
    // marker belongs on the 15th, which is the reported off-by-one.
    expect(currentBusinessDate(new Date("2026-07-16T02:00:00Z"))).toBe(
      "2026-07-15",
    );
  });

  it("agrees with UTC during Central daytime", () => {
    expect(currentBusinessDate(new Date("2026-07-15T17:00:00Z"))).toBe(
      "2026-07-15",
    );
  });

  it("advances once Central itself reaches midnight", () => {
    expect(currentBusinessDate(new Date("2026-07-16T05:01:00Z"))).toBe(
      "2026-07-16",
    );
  });

  it("zero-pads month and day so it string-compares to YYYY-MM-DD rows", () => {
    expect(currentBusinessDate(new Date("2026-03-05T18:00:00Z"))).toBe(
      "2026-03-05",
    );
  });

  it("rolls the year back across the New Year boundary", () => {
    // Jan 1 00:30Z is still Dec 31, 6:30pm in Houston.
    expect(currentBusinessDate(new Date("2026-01-01T00:30:00Z"))).toBe(
      "2025-12-31",
    );
  });
});

describe("close-out date selection", () => {
  it("prefers delivery_date, then pickup_date, then created_at", () => {
    expect(
      closeOutDate({
        delivery_date: "2026-07-10",
        pickup_date: "2026-07-08",
        created_at: "2026-07-01",
      }),
    ).toBe("2026-07-10");

    expect(
      closeOutDate({
        delivery_date: null,
        pickup_date: "2026-07-08",
        created_at: "2026-07-01",
      }),
    ).toBe("2026-07-08");

    expect(
      closeOutDate({
        delivery_date: null,
        pickup_date: null,
        created_at: "2026-07-01",
      }),
    ).toBe("2026-07-01");

    expect(
      closeOutDate({ delivery_date: null, pickup_date: null, created_at: null }),
    ).toBeNull();
  });

  it("a load delivered Jul 1 attributes to June; pickup-only Jul 2 to July", () => {
    const deliveredFirst = closeOutDate({
      delivery_date: "2026-07-01",
      pickup_date: "2026-06-20",
      created_at: "2026-06-15",
    });
    expect(goalMonthParts(deliveredFirst)).toEqual({ year: 2026, month: 5 }); // June

    const pickupSecond = closeOutDate({
      delivery_date: null,
      pickup_date: "2026-07-02",
      created_at: "2026-06-15",
    });
    expect(goalMonthParts(pickupSecond)).toEqual({ year: 2026, month: 6 }); // July
  });
});

/**
 * The gauge's "current month" is resolved in the BUSINESS timezone
 * (America/Chicago), NOT the server's UTC clock. This is the regression that
 * zeroed Brent's June figure: on 2026-07-01 01:31 UTC it was still 8:31 PM
 * June 30 in Central, but UTC-based new Date().getMonth() reported July, so the
 * June loads no longer matched and the gauge showed $0 / July.
 */
describe("current goal month (business-timezone)", () => {
  it("late June-30 evening Central (already Jul 1 UTC) is still JUNE — the bug", () => {
    const now = new Date("2026-07-01T01:31:00Z"); // 8:31 PM CDT, Jun 30
    expect(currentGoalMonth(now)).toEqual({ year: 2026, month: 5 }); // June
    expect(currentGoalMonthLabel(now)).toBe("June");
    // A naive UTC read would have said July (the bug):
    expect(now.getUTCMonth()).toBe(6);
  });

  it("rolls to JULY only at local Central midnight (Jul 1 05:00 UTC in CDT)", () => {
    const before = new Date("2026-07-01T04:59:00Z"); // 11:59 PM CDT, Jun 30
    const after = new Date("2026-07-01T05:00:00Z"); // 12:00 AM CDT, Jul 1
    expect(currentGoalMonth(before)).toEqual({ year: 2026, month: 5 }); // June
    expect(currentGoalMonth(after)).toEqual({ year: 2026, month: 6 }); // July
    expect(currentGoalMonthLabel(after)).toBe("July");
  });

  it("crosses the year boundary in Central (Jan 1 morning UTC still Dec 31)", () => {
    const now = new Date("2027-01-01T03:00:00Z"); // 9:00 PM CST, Dec 31 2026
    expect(currentGoalMonth(now)).toEqual({ year: 2026, month: 11 }); // Dec 2026
    expect(currentGoalMonthLabel(now)).toBe("December");
  });

  it("mid-month is unaffected by the timezone offset", () => {
    const now = new Date("2026-06-15T18:00:00Z");
    expect(currentGoalMonth(now)).toEqual({ year: 2026, month: 5 }); // June
  });
});
