import { describe, it, expect } from "vitest";
import { taskUrgencyBucket, taskDueBucket, daysLate, overdueBoundaryMs } from "./taskUrgency";

/**
 * WEEKEND GRACE, pinned to the calendar.
 *
 * Brent, 2026-08-28: work due Friday must not read "overdue" on Saturday.
 * Nobody is behind for work nobody was in the office to do. The boundary
 * freezes on Friday night and jumps at Monday 00:00 CENTRAL.
 *
 * Every fixture below is written as a UTC instant with its Central wall-clock
 * time in the comment, because that gap IS the thing under test. Central in
 * August is CDT (UTC-5); in November after the 1st it is CST (UTC-6).
 *
 * The pairing of bucket and daysLate in almost every case is deliberate. The
 * two used to read off different boundaries, which put "3 days late" next to
 * a bucket that said "today". They must agree at every moment.
 */

// Fri 28 Aug 2026, 08:00 Central — the default due time for a new task.
const FRIDAY_TASK = "2026-08-28T13:00:00.000Z";
// Thu 27 Aug 2026, 08:00 Central — already late before the weekend began.
const THURSDAY_TASK = "2026-08-27T13:00:00.000Z";

const FRIDAY_PM = new Date("2026-08-28T20:00:00.000Z"); // Fri 15:00 Central
const SATURDAY = new Date("2026-08-29T15:00:00.000Z"); // Sat 10:00 Central
const SUNDAY = new Date("2026-08-30T15:00:00.000Z"); // Sun 10:00 Central
const MONDAY = new Date("2026-08-31T14:00:00.000Z"); // Mon 09:00 Central

describe("a Friday task across the weekend", () => {
  it("is 'today' on Friday", () => {
    expect(taskUrgencyBucket(FRIDAY_TASK, FRIDAY_PM)).toBe("today");
    expect(daysLate(FRIDAY_TASK, FRIDAY_PM)).toBe(0);
  });

  it("is still 'today' on Saturday, not overdue", () => {
    expect(taskUrgencyBucket(FRIDAY_TASK, SATURDAY)).toBe("today");
    expect(daysLate(FRIDAY_TASK, SATURDAY)).toBe(0);
  });

  it("is still 'today' on Sunday", () => {
    expect(taskUrgencyBucket(FRIDAY_TASK, SUNDAY)).toBe("today");
    expect(daysLate(FRIDAY_TASK, SUNDAY)).toBe(0);
  });

  it("turns overdue on Monday", () => {
    expect(taskUrgencyBucket(FRIDAY_TASK, MONDAY)).toBe("overdue");
    // Friday 08:00 -> Monday 00:00 Central is 64 hours: three calendar days.
    // Grace moves where the count STARTS, not how a day is counted.
    expect(daysLate(FRIDAY_TASK, MONDAY)).toBe(3);
  });

  it("agrees with itself at every one of those moments", () => {
    for (const now of [FRIDAY_PM, SATURDAY, SUNDAY, MONDAY]) {
      const overdue = taskUrgencyBucket(FRIDAY_TASK, now) === "overdue";
      expect(daysLate(FRIDAY_TASK, now) > 0).toBe(overdue);
    }
  });
});

describe("grace is one weekend, not an amnesty", () => {
  it("leaves genuinely late work late through the weekend", () => {
    // Thursday work was ALREADY overdue on Friday. The weekend does not
    // forgive it — the boundary only stops advancing, it never rolls back.
    expect(taskUrgencyBucket(THURSDAY_TASK, SATURDAY)).toBe("overdue");
    expect(daysLate(THURSDAY_TASK, SATURDAY)).toBe(1);
    expect(taskUrgencyBucket(THURSDAY_TASK, SUNDAY)).toBe("overdue");
  });

  it("still turns Monday work overdue on Tuesday", () => {
    const mondayTask = "2026-08-31T13:00:00.000Z"; // Mon 08:00 Central
    const tuesday = new Date("2026-09-01T14:00:00.000Z"); // Tue 09:00 Central
    expect(taskUrgencyBucket(mondayTask, tuesday)).toBe("overdue");
    expect(daysLate(mondayTask, tuesday)).toBe(1);
  });

  it("does not disturb an undated task", () => {
    expect(taskUrgencyBucket(null, SATURDAY)).toBe("upcoming");
    expect(taskDueBucket(null, SATURDAY)).toBe("none");
    expect(daysLate(null, SATURDAY)).toBe(0);
  });
});

describe("the boundary is CENTRAL, not UTC", () => {
  it("still grants grace when UTC has already rolled into Monday", () => {
    // Sun 30 Aug 21:00 Central. In UTC this instant is Monday the 31st, so a
    // UTC reading of the calendar would call the Friday task overdue while
    // the agent's own clock still says Sunday evening.
    const sundayNight = new Date("2026-08-31T02:00:00.000Z");
    expect(taskUrgencyBucket(FRIDAY_TASK, sundayNight)).toBe("today");
    expect(daysLate(FRIDAY_TASK, sundayNight)).toBe(0);
  });

  it("ends grace at Central midnight, not UTC midnight", () => {
    // Mon 31 Aug 01:00 Central — one hour into the working week.
    const mondayEarly = new Date("2026-08-31T06:00:00.000Z");
    expect(taskUrgencyBucket(FRIDAY_TASK, mondayEarly)).toBe("overdue");
    expect(daysLate(FRIDAY_TASK, mondayEarly)).toBe(3);
  });
});

describe("the boundary survives a DST change", () => {
  // Daylight saving ends Sun 1 Nov 2026: that Sunday is 25 hours long, so
  // stepping back a flat 24h from Central midnight would land on the wrong
  // day. The walk re-derives each midnight instead.
  const novFriday = "2026-10-30T13:00:00.000Z"; // Fri 30 Oct 08:00 CDT
  const novSunday = new Date("2026-11-01T16:00:00.000Z"); // Sun 1 Nov 10:00 CST
  const novMonday = new Date("2026-11-02T15:00:00.000Z"); // Mon 2 Nov 09:00 CST

  it("holds the Friday task at 'today' across the fall-back Sunday", () => {
    expect(taskUrgencyBucket(novFriday, novSunday)).toBe("today");
    expect(daysLate(novFriday, novSunday)).toBe(0);
  });

  it("lands the boundary on Friday midnight Central, not Thursday", () => {
    const boundary = overdueBoundaryMs(novSunday);
    expect(new Date(boundary).toISOString()).toBe("2026-10-30T05:00:00.000Z");
  });

  it("releases it on the Monday", () => {
    expect(taskUrgencyBucket(novFriday, novMonday)).toBe("overdue");
  });
});

describe("overdueBoundaryMs picks the right day", () => {
  const iso = (d: Date) => new Date(overdueBoundaryMs(d)).toISOString();

  it("is today's midnight on a weekday", () => {
    expect(iso(FRIDAY_PM)).toBe("2026-08-28T05:00:00.000Z"); // Fri 00:00 CDT
    expect(iso(MONDAY)).toBe("2026-08-31T05:00:00.000Z"); // Mon 00:00 CDT
  });

  it("holds at Friday midnight all weekend", () => {
    expect(iso(SATURDAY)).toBe("2026-08-28T05:00:00.000Z");
    expect(iso(SUNDAY)).toBe("2026-08-28T05:00:00.000Z");
  });
});
