import { describe, expect, it } from "vitest";
import {
  DEFAULT_TASK_TIME,
  TASK_MINUTES,
  formatTime12,
  isQuarterHour,
  quarterHourOptions,
  timeOptionsFor,
  timeFromInput,
} from "./taskTime";
import { TASK_DAY_START } from "./snooze";

describe("the minutes Brent asked for", () => {
  it("offers only :00, :15, :30 and :45", () => {
    expect([...TASK_MINUTES]).toEqual([0, 15, 30, 45]);
    for (const o of quarterHourOptions()) {
      expect([0, 15, 30, 45]).toContain(Number(o.value.split(":")[1]));
    }
  });

  it("covers the whole day — 24 hours at four a piece", () => {
    expect(quarterHourOptions()).toHaveLength(96);
  });

  it("labels every option on a 12-hour clock with AM or PM", () => {
    for (const o of quarterHourOptions()) expect(o.label).toMatch(/^\d{1,2}:\d{2} (AM|PM)$/);
  });
});

describe("12-hour formatting", () => {
  it("reads the way somebody says it out loud", () => {
    expect(formatTime12("09:00")).toBe("9:00 AM");
    expect(formatTime12("13:30")).toBe("1:30 PM");
    expect(formatTime12("08:45")).toBe("8:45 AM");
  });

  it("gets midnight and noon right — the two everyone gets wrong", () => {
    expect(formatTime12("00:00")).toBe("12:00 AM");
    expect(formatTime12("12:00")).toBe("12:00 PM");
    expect(formatTime12("00:15")).toBe("12:15 AM");
    expect(formatTime12("12:45")).toBe("12:45 PM");
  });

  it("hands back anything it cannot read rather than inventing a time", () => {
    expect(formatTime12("nonsense")).toBe("nonsense");
  });
});

describe("the default", () => {
  it("is 9am, as asked", () => {
    expect(DEFAULT_TASK_TIME).toBe("09:00");
    expect(formatTime12(DEFAULT_TASK_TIME)).toBe("9:00 AM");
  });

  it("DISAGREES WITH TASK_DAY_START, deliberately and visibly", () => {
    /* This is the flag, pinned as a test so it cannot be forgotten.
     *
     * Every other path that dates a task without a picker uses
     * TASK_DAY_START — the snooze presets, defaultTaskDueIso, the call
     * follow-up reminder, and the 34 tasks back-dated on 2026-08-29. Brent
     * asked for this control at 9am, so it is 9am, and nothing else was
     * moved unasked.
     *
     * The consequence: a task typed in the composer lands an hour later
     * than the identical task created anywhere else.
     *
     * If this test ever fails because the two were unified, that is the
     * intended fix and this test should be deleted with the same commit
     * that unifies them — not "corrected" to keep them apart. */
    expect(DEFAULT_TASK_TIME).not.toBe(TASK_DAY_START);
    expect(TASK_DAY_START).toBe("08:00");
  });
});

describe("editing a task that already has a time", () => {
  it("keeps an off-grid time instead of snapping it", () => {
    // A task due at 1:07 PM is a commitment. Snapping the picker to 1:00
    // would move it the moment anything saved — the same harm as
    // defaulting an edit to 9am.
    const options = timeOptionsFor("13:07");
    expect(options.map((o) => o.value)).toContain("13:07");
    expect(options).toHaveLength(97);
  });

  it("puts the odd time in clock order, where a reader looks for it", () => {
    const values = timeOptionsFor("13:07").map((o) => o.value);
    expect(values.indexOf("13:07")).toBe(values.indexOf("13:00") + 1);
    expect(values.indexOf("13:07")).toBeLessThan(values.indexOf("13:15"));
  });

  it("adds nothing when the existing time is already on the grid", () => {
    expect(timeOptionsFor("09:30")).toHaveLength(96);
    expect(timeOptionsFor(null)).toHaveLength(96);
  });

  it("handles an odd time after the last option without dropping it", () => {
    const values = timeOptionsFor("23:59").map((o) => o.value);
    expect(values[values.length - 1]).toBe("23:59");
  });
});

describe("isQuarterHour", () => {
  it("accepts the grid and rejects everything else", () => {
    expect(isQuarterHour("09:00")).toBe(true);
    expect(isQuarterHour("23:45")).toBe(true);
    expect(isQuarterHour("09:07")).toBe(false);
    expect(isQuarterHour("24:00")).toBe(false);
    expect(isQuarterHour("rubbish")).toBe(false);
  });
});

describe("timeFromInput", () => {
  it("pulls the clock time out of a stored datetime-local value", () => {
    expect(timeFromInput("2026-09-01T13:07")).toBe("13:07");
    expect(timeFromInput("2026-09-01T13:07:00")).toBe("13:07");
  });

  it("returns null rather than a guess when there is no time", () => {
    expect(timeFromInput("2026-09-01")).toBeNull();
    expect(timeFromInput(null)).toBeNull();
    expect(timeFromInput("")).toBeNull();
  });
});
