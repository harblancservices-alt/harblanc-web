import { describe, expect, it } from "vitest";
import { formatStopDateShort, resolveStopTiming } from "./timing";

/**
 * Regression cover for the list/dispatch bug: Phase 1 moved timing to
 * pickup_date/pickup_timing_mode and stopped writing pickup_at, but the
 * Shipments list, the Load Card and Operations → Active Loads all still read
 * pickup_at. Every newly-scheduled load therefore rendered with no date and
 * sank to the bottom of a date sort as "unscheduled".
 *
 * These tests pin the two things those screens now depend on: that `sortKey`
 * is produced by BOTH branches in the same sortable shape, and that a legacy
 * row still renders exactly the string it rendered before.
 */

/** A row with every timing column null; spread over it to set just one stop. */
const EMPTY = {
  pickup_date: null,
  pickup_timing_mode: null,
  pickup_appointment_time: null,
  pickup_window_start: null,
  pickup_window_end: null,
  pickup_at: null,
  pickup_window: null,
  delivery_date: null,
  delivery_timing_mode: null,
  delivery_appointment_time: null,
  delivery_window_start: null,
  delivery_window_end: null,
  delivery_at: null,
  delivery_window: null,
} as const;

describe("resolveStopTiming sortKey", () => {
  it("returns the calendar day for a new-model stop", () => {
    const r = resolveStopTiming(
      { ...EMPTY, pickup_date: "2026-08-26", pickup_timing_mode: "tbd" },
      "pickup",
    );
    expect(r.source).toBe("model");
    expect(r.sortKey).toBe("2026-08-26");
  });

  it("returns a sortKey even when the time is not scheduled — a dated load is NOT unscheduled", () => {
    // This is the exact shape that used to sink to the bottom of a date sort.
    const r = resolveStopTiming({ ...EMPTY, pickup_date: "2026-08-26" }, "pickup");
    expect(r.sortKey).toBe("2026-08-26");
    expect(r.timeLabel).toBeNull();
  });

  it("returns the CENTRAL calendar day for a legacy timestamptz", () => {
    // 2026-08-24 14:00 UTC is 9:00 AM Central — same calendar day.
    const r = resolveStopTiming({ ...EMPTY, pickup_at: "2026-08-24T14:00:00.000Z" }, "pickup");
    expect(r.source).toBe("legacy");
    expect(r.sortKey).toBe("2026-08-24");
  });

  it("uses the Central day, not the UTC day, for a late-evening instant", () => {
    // 2026-08-25 02:00 UTC is 9:00 PM Central on Aug 24. Reading the ISO
    // string's date part would give Aug 25 and put the load on the wrong day.
    const r = resolveStopTiming({ ...EMPTY, pickup_at: "2026-08-25T02:00:00.000Z" }, "pickup");
    expect(r.sortKey).toBe("2026-08-24");
  });

  it("is null only when the stop genuinely has no date", () => {
    expect(resolveStopTiming({ ...EMPTY }, "pickup").sortKey).toBeNull();
  });

  it("orders a new-model stop and a legacy stop against each other", () => {
    const legacy = resolveStopTiming({ ...EMPTY, pickup_at: "2026-08-22T14:00:00.000Z" }, "pickup");
    const model = resolveStopTiming({ ...EMPTY, pickup_date: "2026-08-24" }, "pickup");
    expect([model.sortKey, legacy.sortKey].sort()).toEqual(["2026-08-22", "2026-08-24"]);
  });

  it("resolves each stop independently", () => {
    const row = { ...EMPTY, pickup_date: "2026-08-26", delivery_at: "2026-08-28T14:00:00.000Z" };
    expect(resolveStopTiming(row, "pickup").sortKey).toBe("2026-08-26");
    expect(resolveStopTiming(row, "delivery").sortKey).toBe("2026-08-28");
  });
});

describe("formatStopDateShort", () => {
  it("renders the compact form the list columns used before", () => {
    expect(formatStopDateShort("2026-08-24")).toBe("Aug 24, 2026");
    expect(formatStopDateShort("2026-01-01")).toBe("Jan 1, 2026");
    expect(formatStopDateShort("2026-12-31")).toBe("Dec 31, 2026");
  });

  it("uses the same em-dash placeholder formatDate() used for a missing date", () => {
    expect(formatStopDateShort(null)).toBe("—");
    expect(formatStopDateShort("")).toBe("—");
    expect(formatStopDateShort("not a date")).toBe("—");
  });
});
