import { describe, it, expect } from "vitest";
import {
  lateLabel,
  longestOverdue,
  reportByAssignee,
  summarizeDue,
  UNASSIGNED_KEY,
  type DueTaskRow,
} from "./dueReport";

/** Tue 2026-08-25 14:00 Central = 19:00Z (CDT, UTC-5). */
const NOW = new Date("2026-08-25T19:00:00.000Z");

function t(
  id: string,
  dueAt: string | null,
  assigneeId: string | null = null,
  title = `Task ${id}`,
): DueTaskRow {
  return { id, title, dueAt, assigneeId, accountId: null, companyName: null };
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
});

describe("reportByAssignee", () => {
  const people = [
    { id: "u1", name: "Alice" },
    { id: "u2", name: "Bob" },
  ];

  it("gives everyone a row even at zero", () => {
    const rows = reportByAssignee([t("a", TODAY, "u1")], people, NOW);
    expect(rows.map((r) => r.name)).toEqual(["Alice", "Bob"]);
    expect(rows[1].counts.total).toBe(0);
  });

  it("pins the unassigned pile first when it has anything in it", () => {
    const rows = reportByAssignee([t("a", TODAY, null), t("b", TODAY, "u1")], people, NOW);
    expect(rows[0].key).toBe(UNASSIGNED_KEY);
    expect(rows[0].counts.total).toBe(1);
  });

  it("omits the unassigned row entirely when nothing is unowned", () => {
    const rows = reportByAssignee([t("a", TODAY, "u1")], people, NOW);
    expect(rows.some((r) => r.key === UNASSIGNED_KEY)).toBe(false);
  });

  it("sorts people by who is furthest behind, not alphabetically", () => {
    const rows = reportByAssignee(
      [t("a", LATE_4, "u2"), t("b", LATE_1, "u2"), t("c", LATE_1, "u1")],
      people,
      NOW,
    );
    expect(rows.map((r) => r.name)).toEqual(["Bob", "Alice"]);
  });

  it("breaks an overdue tie on due-today, then on name", () => {
    const rows = reportByAssignee([t("a", TODAY, "u2")], people, NOW);
    expect(rows.map((r) => r.name)).toEqual(["Bob", "Alice"]);
  });

  it("lands a task owned by someone off the team in the unassigned pile", () => {
    // An orphaned task still needs an owner — it must not vanish from the
    // totals just because its assignee left.
    const rows = reportByAssignee([t("a", LATE_1, "ghost")], people, NOW);
    expect(rows[0].key).toBe(UNASSIGNED_KEY);
    expect(rows[0].counts.overdue).toBe(1);
  });
});

describe("longestOverdue", () => {
  it("returns only overdue tasks, worst first", () => {
    const rows = longestOverdue([t("a", LATE_1), t("b", TODAY), t("c", LATE_4)], NOW);
    expect(rows.map((r) => r.id)).toEqual(["c", "a"]);
  });

  it("respects the limit", () => {
    const rows = longestOverdue([t("a", LATE_4), t("b", LATE_1)], NOW, 1);
    expect(rows.map((r) => r.id)).toEqual(["a"]);
  });

  it("never counts an undated task as overdue", () => {
    expect(longestOverdue([t("a", null)], NOW)).toEqual([]);
  });
});

describe("lateLabel", () => {
  it("singularises one day", () => {
    expect(lateLabel(LATE_1, NOW)).toBe("1 day late");
    expect(lateLabel(LATE_4, NOW)).toBe("4 days late");
  });
});
