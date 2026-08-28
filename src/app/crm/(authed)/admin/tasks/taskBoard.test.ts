import { describe, it, expect } from "vitest";
import {
  assigneeIdForColumn,
  boardTotals,
  buildBoard,
  initialsOf,
  isRealMove,
  sortByUrgency,
  UNASSIGNED_KEY,
} from "./taskBoard";
import type { DueTaskRow } from "../dueReport";

/** Tue 2026-08-25 14:00 Central = 19:00Z (CDT, UTC-5). */
const NOW = new Date("2026-08-25T19:00:00.000Z");

const LATE_4 = "2026-08-21T17:00:00.000Z";
const LATE_1 = "2026-08-24T17:00:00.000Z";
const TODAY = "2026-08-25T22:00:00.000Z";
const THIS_WEEK = "2026-08-27T17:00:00.000Z";
const LATER = "2026-10-01T17:00:00.000Z";

function t(
  id: string,
  dueAt: string | null,
  assigneeId: string | null = null,
  title = `Task ${id}`,
): DueTaskRow {
  return { id, title, dueAt, assigneeId, accountId: null, companyName: null, isHigh: false };
}

const PEOPLE = [
  { id: "u1", name: "Alice Adams" },
  { id: "u2", name: "Bob Brown" },
];

describe("sortByUrgency", () => {
  it("orders overdue, then today, then this week, then the rest", () => {
    const rows = sortByUrgency(
      [t("later", LATER), t("today", TODAY), t("late", LATE_1), t("week", THIS_WEEK)],
      NOW,
    );
    expect(rows.map((r) => r.id)).toEqual(["late", "today", "week", "later"]);
  });

  it("puts the most overdue first inside the overdue group", () => {
    const rows = sortByUrgency([t("a", LATE_1), t("b", LATE_4)], NOW);
    expect(rows.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("sorts undated with the rest, not with the late", () => {
    const rows = sortByUrgency([t("undated", null), t("late", LATE_1)], NOW);
    expect(rows.map((r) => r.id)).toEqual(["late", "undated"]);
  });

  it("is stable for same-day tasks so cards do not reshuffle on re-render", () => {
    const rows = sortByUrgency([t("b", TODAY, null, "Zebra"), t("a", TODAY, null, "Apple")], NOW);
    expect(rows.map((r) => r.title)).toEqual(["Apple", "Zebra"]);
  });

  it("does not mutate its input", () => {
    const input = [t("later", LATER), t("late", LATE_1)];
    sortByUrgency(input, NOW);
    expect(input.map((r) => r.id)).toEqual(["later", "late"]);
  });
});

describe("buildBoard", () => {
  it("is one column per person, in roster order, when nothing is orphaned", () => {
    const board = buildBoard([], PEOPLE, NOW);
    expect(board.map((c) => c.key)).toEqual(["u1", "u2"]);
  });

  it("keeps a column for someone with nothing on their plate", () => {
    const board = buildBoard([t("a", TODAY, "u1")], PEOPLE, NOW);
    const bob = board.find((c) => c.key === "u2")!;
    expect(bob.cards).toEqual([]);
    expect(bob.counts.total).toBe(0);
  });

  it("hides the unassigned column when nothing is unassigned", () => {
    // Tasks always have an owner as of 2026-08-28 — the pickers offer no
    // blank and both createTask and reassignTask refuse one — so an empty
    // Unassigned column would be dead furniture at the head of the board.
    const board = buildBoard([t("a", TODAY, "u1")], PEOPLE, NOW);
    expect(board.some((c) => c.key === UNASSIGNED_KEY)).toBe(false);
  });

  it("still shows it, and first, when a legacy row IS unassigned", () => {
    // Not deleted, because a row with a null assignee must be visible
    // somewhere rather than silently dropped off the board.
    const board = buildBoard([t("orphan", TODAY, null)], PEOPLE, NOW);
    expect(board[0].key).toBe(UNASSIGNED_KEY);
    expect(board[0].cards.map((c) => c.id)).toEqual(["orphan"]);
  });

  it("counts open and overdue per column", () => {
    const board = buildBoard(
      [t("a", LATE_4, "u1"), t("b", LATE_1, "u1"), t("c", TODAY, "u1")],
      PEOPLE,
      NOW,
    );
    const alice = board.find((c) => c.key === "u1")!;
    expect(alice.counts.total).toBe(3);
    expect(alice.counts.overdue).toBe(2);
    expect(alice.counts.today).toBe(1);
  });

  it("lands a task owned by someone off the team in the unassigned column", () => {
    const board = buildBoard([t("a", LATE_1, "ghost")], PEOPLE, NOW);
    expect(board[0].cards.map((c) => c.id)).toEqual(["a"]);
  });

  it("orders each column most urgent first", () => {
    const board = buildBoard(
      [t("later", LATER, "u1"), t("late", LATE_1, "u1"), t("today", TODAY, "u1")],
      PEOPLE,
      NOW,
    );
    expect(board.find((c) => c.key === "u1")!.cards.map((r) => r.id)).toEqual([
      "late",
      "today",
      "later",
    ]);
  });
});

describe("boardTotals", () => {
  it("counts the whole org, not one column", () => {
    const totals = boardTotals(
      [t("a", LATE_1, "u1"), t("b", TODAY, "u2"), t("c", LATER, null)],
      NOW,
    );
    expect(totals.total).toBe(3);
    expect(totals.overdue).toBe(1);
    expect(totals.today).toBe(1);
  });
});

describe("isRealMove", () => {
  it("rejects a card dropped back on its own column", () => {
    expect(isRealMove(t("a", TODAY, "u1"), "u1")).toBe(false);
    expect(isRealMove(t("a", TODAY, null), UNASSIGNED_KEY)).toBe(false);
  });

  it("accepts a move to a different column, un-assigning included", () => {
    expect(isRealMove(t("a", TODAY, "u1"), "u2")).toBe(true);
    expect(isRealMove(t("a", TODAY, "u1"), UNASSIGNED_KEY)).toBe(true);
    expect(isRealMove(t("a", TODAY, null), "u1")).toBe(true);
  });
});

describe("assigneeIdForColumn", () => {
  it("turns the unassigned column back into a null owner", () => {
    expect(assigneeIdForColumn(UNASSIGNED_KEY)).toBeNull();
    expect(assigneeIdForColumn("u1")).toBe("u1");
  });
});

describe("initialsOf", () => {
  it("takes first and last initials", () => {
    expect(initialsOf("Alice Adams")).toBe("AA");
    expect(initialsOf("Mary Jane Watson")).toBe("MW");
  });

  it("falls back for one word or none", () => {
    expect(initialsOf("Cher")).toBe("CH");
    expect(initialsOf("   ")).toBe("?");
  });
});
