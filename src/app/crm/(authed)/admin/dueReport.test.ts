import { describe, it, expect } from "vitest";
import { summarizeDue, UNASSIGNED_KEY, type DueTaskRow } from "./dueReport";

/** Tue 2026-08-25 14:00 Central = 19:00Z (CDT, UTC-5). */
const NOW = new Date("2026-08-25T19:00:00.000Z");

function t(id: string, dueAt: string | null, assigneeId: string | null = null): DueTaskRow {
  return { id, title: `Task ${id}`, dueAt, assigneeId, accountId: null, companyName: null };
}

const LATE_4 = "2026-08-21T17:00:00.000Z";
const LATE_1 = "2026-08-24T17:00:00.000Z";
const TODAY = "2026-08-25T22:00:00.000Z";
const THIS_WEEK = "2026-08-27T17:00:00.000Z";
const LATER = "2026-10-01T17:00:00.000Z";

describe("summarizeDue", () => {
  it("counts every bucket and totals them", () => {
    const counts = summarizeDue(
      [t("a", LATE_4), t("b", LATE_1), t("c", TODAY), t("d", THIS_WEEK), t("e", LATER), t("f", null)],
      NOW,
    );
    expect(counts).toEqual({ overdue: 2, today: 1, thisWeek: 1, later: 1, none: 1, total: 6 });
  });

  it("gives undated tasks their own count rather than folding them into later", () => {
    const counts = summarizeDue([t("a", null), t("b", null)], NOW);
    expect(counts.none).toBe(2);
    expect(counts.later).toBe(0);
  });

  it("counts nothing for an empty list", () => {
    expect(summarizeDue([], NOW).total).toBe(0);
  });

  it("ignores who owns a task — that split is the board's job", () => {
    const mine = summarizeDue([t("a", TODAY, "u1"), t("b", TODAY, null)], NOW);
    expect(mine.today).toBe(2);
  });
});

describe("UNASSIGNED_KEY", () => {
  it("cannot collide with a real uuid", () => {
    expect(UNASSIGNED_KEY).toBe("__unassigned__");
    expect(UNASSIGNED_KEY).not.toMatch(/^[0-9a-f-]{36}$/);
  });
});
