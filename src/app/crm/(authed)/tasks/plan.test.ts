import { describe, it, expect } from "vitest";
import {
  buildPlanBoard,
  dueAtForColumn,
  dueDateInputForColumn,
  isOverdue,
  isRealPlanMove,
  planCardLabel,
  planColumnOf,
  PLAN_COLUMNS,
  type PlanTask,
} from "./plan";

/** Tue 2026-08-25 14:00 Central = 19:00Z (CDT, UTC-5). */
const NOW = new Date("2026-08-25T19:00:00.000Z");

function t(id: string, dueAt: string | null, title = `Task ${id}`): PlanTask {
  return {
    id,
    title,
    dueAt,
    accountId: null,
    companyName: null,
    provenance: null,
    contactName: null,
    isHigh: false,
    instructions: null,
    definitionOfDone: null,
  };
}

describe("planColumnOf", () => {
  it("puts an undated task in the inbox", () => {
    expect(planColumnOf(t("a", null), NOW)).toBe("inbox");
  });

  it("puts overdue in TODAY, not a column of its own", () => {
    expect(planColumnOf(t("a", "2026-08-21T17:00:00.000Z"), NOW)).toBe("today");
  });

  it("buckets today, tomorrow and the rest of the week", () => {
    expect(planColumnOf(t("a", "2026-08-25T22:00:00.000Z"), NOW)).toBe("today");
    expect(planColumnOf(t("b", "2026-08-26T17:00:00.000Z"), NOW)).toBe("tomorrow");
    expect(planColumnOf(t("c", "2026-08-28T17:00:00.000Z"), NOW)).toBe("week");
  });

  it("keeps far-future work in the fourth column rather than dropping it", () => {
    expect(planColumnOf(t("a", "2026-12-01T17:00:00.000Z"), NOW)).toBe("week");
  });

  it("respects the Central day boundary, not UTC", () => {
    // 04:59Z on the 26th is 11:59pm Central on the 25th — still today.
    expect(planColumnOf(t("a", "2026-08-26T04:59:00.000Z"), NOW)).toBe("today");
    // 05:01Z on the 26th is 12:01am Central on the 26th — tomorrow.
    expect(planColumnOf(t("b", "2026-08-26T05:01:00.000Z"), NOW)).toBe("tomorrow");
  });
});

describe("dueAtForColumn", () => {
  it("clears the date for the inbox", () => {
    expect(dueAtForColumn("inbox", NOW)).toBeNull();
  });

  it("THE INVARIANT: a card dropped in a column lands in that column", () => {
    for (const column of PLAN_COLUMNS) {
      const dueAt = dueAtForColumn(column, NOW);
      expect(planColumnOf(t("x", dueAt), NOW)).toBe(column);
    }
  });

  it("stores at Central midday so a timezone shift cannot roll the day", () => {
    // 12:00 Central on 2026-08-26 (CDT, UTC-5) is 17:00Z.
    expect(dueAtForColumn("tomorrow", NOW)).toBe("2026-08-26T17:00:00.000Z");
  });

  it("writes a week out for 'this week', never a colliding weekday", () => {
    expect(dueAtForColumn("week", NOW)).toBe("2026-09-01T17:00:00.000Z");
  });

  it("holds the invariant on a Saturday, where 'end of week' would break", () => {
    // Sat 2026-08-29 10:00 Central. A "Friday" rule would write the past.
    const sat = new Date("2026-08-29T15:00:00.000Z");
    for (const column of PLAN_COLUMNS) {
      expect(planColumnOf(t("x", dueAtForColumn(column, sat)), sat)).toBe(column);
    }
  });
});

describe("dueDateInputForColumn", () => {
  it("gives the composer a date the new task will land on", () => {
    expect(dueDateInputForColumn("inbox", NOW)).toBe("");
    expect(dueDateInputForColumn("today", NOW)).toBe("2026-08-25");
    expect(dueDateInputForColumn("tomorrow", NOW)).toBe("2026-08-26");
    expect(dueDateInputForColumn("week", NOW)).toBe("2026-09-01");
  });
});

describe("buildPlanBoard", () => {
  it("splits into four columns", () => {
    const board = buildPlanBoard(
      [
        t("inbox", null),
        t("late", "2026-08-21T17:00:00.000Z"),
        t("today", "2026-08-25T22:00:00.000Z"),
        t("tom", "2026-08-26T17:00:00.000Z"),
        t("week", "2026-08-28T17:00:00.000Z"),
      ],
      NOW,
    );
    expect(board.inbox.map((x) => x.id)).toEqual(["inbox"]);
    expect(board.today.map((x) => x.id)).toEqual(["late", "today"]);
    expect(board.tomorrow.map((x) => x.id)).toEqual(["tom"]);
    expect(board.week.map((x) => x.id)).toEqual(["week"]);
  });

  it("leads Today with the most overdue", () => {
    const board = buildPlanBoard(
      [
        t("late1", "2026-08-24T17:00:00.000Z"),
        t("today", "2026-08-25T22:00:00.000Z"),
        t("late4", "2026-08-21T17:00:00.000Z"),
      ],
      NOW,
    );
    expect(board.today.map((x) => x.id)).toEqual(["late4", "late1", "today"]);
  });

  it("orders the inbox by title, since it has no dates to sort on", () => {
    const board = buildPlanBoard([t("b", null, "Zebra"), t("a", null, "Apple")], NOW);
    expect(board.inbox.map((x) => x.title)).toEqual(["Apple", "Zebra"]);
  });

  it("sorts far-future work last inside the fourth column", () => {
    const board = buildPlanBoard(
      [t("far", "2026-12-01T17:00:00.000Z"), t("soon", "2026-08-28T17:00:00.000Z")],
      NOW,
    );
    expect(board.week.map((x) => x.id)).toEqual(["soon", "far"]);
  });
});

describe("planCardLabel", () => {
  it("says nothing for an undated task", () => {
    expect(planCardLabel(t("a", null), NOW)).toBeNull();
  });

  it("counts lateness in whole days", () => {
    expect(planCardLabel(t("a", "2026-08-24T17:00:00.000Z"), NOW)).toBe("1 day late");
    expect(planCardLabel(t("b", "2026-08-21T17:00:00.000Z"), NOW)).toBe("4 days late");
  });

  it("names today and tomorrow", () => {
    expect(planCardLabel(t("a", "2026-08-25T22:00:00.000Z"), NOW)).toBe("today");
    expect(planCardLabel(t("b", "2026-08-26T17:00:00.000Z"), NOW)).toBe("tomorrow");
  });

  it("uses a weekday inside the week and a date beyond it", () => {
    expect(planCardLabel(t("a", "2026-08-28T17:00:00.000Z"), NOW)).toBe("Fri");
    expect(planCardLabel(t("b", "2026-12-01T17:00:00.000Z"), NOW)).toBe("Dec 1");
  });
});

describe("isOverdue", () => {
  it("is true only past the start of today", () => {
    expect(isOverdue(t("a", "2026-08-24T17:00:00.000Z"), NOW)).toBe(true);
    expect(isOverdue(t("b", "2026-08-25T22:00:00.000Z"), NOW)).toBe(false);
    expect(isOverdue(t("c", null), NOW)).toBe(false);
  });
});

describe("isRealPlanMove", () => {
  it("rejects a drop back on the same column", () => {
    expect(isRealPlanMove(t("a", null), "inbox", NOW)).toBe(false);
    expect(isRealPlanMove(t("b", "2026-08-25T22:00:00.000Z"), "today", NOW)).toBe(false);
  });

  it("counts an overdue card dropped on Today as no move — it is already there", () => {
    expect(isRealPlanMove(t("a", "2026-08-21T17:00:00.000Z"), "today", NOW)).toBe(false);
  });

  it("accepts a real change, clearing the date included", () => {
    expect(isRealPlanMove(t("a", "2026-08-25T22:00:00.000Z"), "inbox", NOW)).toBe(true);
    expect(isRealPlanMove(t("b", null), "tomorrow", NOW)).toBe(true);
  });
});
