import { describe, it, expect } from "vitest";
import {
  addDays,
  assignLanes,
  federalHolidays,
  monthMatrix,
  weekdayOf,
} from "./calendar";

describe("date primitives", () => {
  it("weekdayOf is UTC-stable (no local-tz drift)", () => {
    expect(weekdayOf("2026-07-04")).toBe(6); // Saturday
    expect(weekdayOf("2026-07-11")).toBe(6);
    expect(weekdayOf("2026-01-01")).toBe(4); // Thursday
  });

  it("addDays crosses month + year boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("monthMatrix", () => {
  it("always starts on Sunday and covers the whole month", () => {
    const weeks = monthMatrix(2026, 6); // July 2026
    expect(weeks[0][0]).toBe("2026-06-28"); // Sunday before Jul 1
    expect(weeks.every((w) => weekdayOf(w[0]) === 0)).toBe(true);
    const flat = weeks.flat();
    expect(flat).toContain("2026-07-01");
    expect(flat).toContain("2026-07-31");
  });
});

describe("federalHolidays", () => {
  it("computes 2026 nth-weekday + fixed dates correctly", () => {
    const h = federalHolidays(2026);
    expect(h.get("2026-01-01")?.name).toBe("New Year's Day");
    expect(h.get("2026-01-19")?.name).toBe("MLK Day"); // 3rd Mon Jan
    expect(h.get("2026-02-16")?.name).toBe("Presidents' Day"); // 3rd Mon Feb
    expect(h.get("2026-05-25")?.name).toBe("Memorial Day"); // last Mon May
    expect(h.get("2026-06-19")?.name).toBe("Juneteenth");
    expect(h.get("2026-07-04")?.name).toBe("Independence Day");
    expect(h.get("2026-09-07")?.name).toBe("Labor Day"); // 1st Mon Sep
    expect(h.get("2026-10-12")?.name).toBe("Indigenous Peoples' Day"); // 2nd Mon Oct
    expect(h.get("2026-11-11")?.name).toBe("Veterans Day");
    expect(h.get("2026-11-26")?.name).toBe("Thanksgiving"); // 4th Thu Nov
    expect(h.get("2026-12-25")?.name).toBe("Christmas Day");
  });

  it("shifts fixed-date holidays observed on weekends", () => {
    // July 4, 2026 is a Saturday → observed Friday July 3.
    const h = federalHolidays(2026);
    expect(h.get("2026-07-03")?.name).toBe("Independence Day (observed)");
    // Nov 11, 2028 is a Saturday → observed Friday Nov 10.
    const h28 = federalHolidays(2028);
    expect(h28.get("2028-11-10")?.name).toBe("Veterans Day (observed)");
    // Jan 1, 2028 is a Saturday → New Year's observed back on Dec 31, 2027.
    const h27 = federalHolidays(2027);
    expect(h27.get("2027-12-31")?.name).toBe("New Year's Day (observed)");
  });
});

describe("assignLanes", () => {
  it("keeps overlapping spans on distinct lanes and reuses freed lanes", () => {
    const lanes = assignLanes([
      { id: "a", start: "2026-07-01", end: "2026-07-05" },
      { id: "b", start: "2026-07-03", end: "2026-07-08" }, // overlaps a
      { id: "c", start: "2026-07-10", end: "2026-07-12" }, // no overlap → lane 0
    ]);
    expect(lanes.get("a")).toBe(0);
    expect(lanes.get("b")).toBe(1);
    expect(lanes.get("c")).toBe(0);
  });
});
