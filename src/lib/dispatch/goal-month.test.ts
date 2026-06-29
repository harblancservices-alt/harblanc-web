import { describe, it, expect } from "vitest";

/**
 * Goal-month attribution rule for the $10k net-profit goal gauge.
 *
 * NOTE: the production implementation (`goalMonthParts` / `closeOutDate`) lives
 * NON-exported inside the server page
 *   src/app/admin/(authed)/dispatch/loads/page.tsx
 * which can't be imported into a unit test (it pulls in the Supabase service
 * client). These two functions are an EXACT mirror of that source, kept here as
 * the executable specification of the boundary rule. If the rule ever changes,
 * update both — and this test documents what "today" does.
 *
 * Recommendation (reported separately): extract these to a pure lib module so
 * the page and this test share one implementation.
 */

// Mirror of src/app/admin/(authed)/dispatch/loads/page.tsx
function closeOutDate(l: {
  delivery_date: string | null;
  pickup_date: string | null;
  created_at: string | null;
}): string | null {
  return l.delivery_date ?? l.pickup_date ?? l.created_at ?? null;
}

// Mirror of src/app/admin/(authed)/dispatch/loads/page.tsx
function goalMonthParts(
  dateStr: string | null,
): { year: number; month: number } | null {
  if (!dateStr) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() - 1);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}

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
