import { describe, it, expect } from "vitest";
import {
  activityStatus,
  companyFlag,
  dueLabel,
  dueTint,
  groupAgentWork,
  sortAgentCompanies,
  type AgentCompany,
  type AgentTask,
} from "./agentWork";

/**
 * Every instant here is expressed as a CENTRAL wall-clock time converted to
 * UTC, because that is the boundary taskUrgencyBucket bucket edges sit on.
 * NOW is Tue 2026-08-25 14:00 Central = 19:00Z (CDT, UTC-5).
 */
const NOW = new Date("2026-08-25T19:00:00.000Z");

function task(id: string, dueAt: string | null, title = `Task ${id}`): AgentTask {
  return { id, title, dueAt, accountId: null, companyName: null, hint: null };
}

function company(name: string, lastContactMs: number | null, stage: string | null): AgentCompany {
  return { id: name, name, city: null, state: null, stage, lastContactMs };
}

const DAY = 86_400_000;

describe("groupAgentWork", () => {
  it("splits by due date into overdue / today / this week / later", () => {
    const groups = groupAgentWork(
      [
        task("late", "2026-08-21T17:00:00.000Z"),
        task("today", "2026-08-25T22:00:00.000Z"),
        task("thu", "2026-08-27T17:00:00.000Z"),
        task("far", "2026-10-01T17:00:00.000Z"),
        task("undated", null),
      ],
      NOW,
    );
    expect(groups.overdue.map((t) => t.id)).toEqual(["late"]);
    expect(groups.today.map((t) => t.id)).toEqual(["today"]);
    expect(groups.thisWeek.map((t) => t.id)).toEqual(["thu"]);
    // Undated work is still the agent's work — it lands in the tail, not
    // nowhere.
    expect(groups.later.map((t) => t.id)).toEqual(["far", "undated"]);
  });

  it("orders each group soonest-first with undated last", () => {
    const groups = groupAgentWork(
      [task("b", null), task("a", "2026-09-20T17:00:00.000Z"), task("c", "2026-09-10T17:00:00.000Z")],
      NOW,
    );
    expect(groups.later.map((t) => t.id)).toEqual(["c", "a", "b"]);
  });

  it("keeps a task due at 11:59pm Central today out of overdue", () => {
    // 2026-08-26T04:59Z is 11:59pm Central on the 25th.
    const groups = groupAgentWork([task("edge", "2026-08-26T04:59:00.000Z")], NOW);
    expect(groups.today.map((t) => t.id)).toEqual(["edge"]);
    expect(groups.overdue).toHaveLength(0);
  });

  it("puts a task due at 12:01am Central today in today, not overdue", () => {
    const groups = groupAgentWork([task("edge", "2026-08-25T05:01:00.000Z")], NOW);
    expect(groups.today.map((t) => t.id)).toEqual(["edge"]);
  });
});

describe("dueLabel", () => {
  it("counts overdue in whole calendar days late", () => {
    expect(dueLabel("2026-08-24T17:00:00.000Z", NOW)).toBe("1 day late");
    expect(dueLabel("2026-08-21T17:00:00.000Z", NOW)).toBe("4 days late");
  });

  it("counts lateness off the day boundary, not elapsed hours", () => {
    // Due 11pm Central yesterday. Only 15 hours ago, but it IS a day late.
    expect(dueLabel("2026-08-25T04:00:00.000Z", NOW)).toBe("1 day late");
  });

  it("names today and tomorrow rather than abbreviating them", () => {
    expect(dueLabel("2026-08-25T22:00:00.000Z", NOW)).toBe("today");
    expect(dueLabel("2026-08-26T17:00:00.000Z", NOW)).toBe("tomorrow");
  });

  it("uses a weekday inside the week and a date past it", () => {
    expect(dueLabel("2026-08-27T17:00:00.000Z", NOW)).toBe("Thu");
    expect(dueLabel("2026-10-01T17:00:00.000Z", NOW)).toBe("Oct 1");
  });

  it("says so when a task has no due date", () => {
    expect(dueLabel(null, NOW)).toBe("no date");
  });
});

describe("dueTint", () => {
  it("tracks the same buckets the labels do", () => {
    expect(dueTint("2026-08-21T17:00:00.000Z", NOW)).toBe("late");
    expect(dueTint("2026-08-25T22:00:00.000Z", NOW)).toBe("now");
    expect(dueTint("2026-08-27T17:00:00.000Z", NOW)).toBe("soon");
    expect(dueTint("2026-10-01T17:00:00.000Z", NOW)).toBe("calm");
    expect(dueTint(null, NOW)).toBe("calm");
  });
});

describe("companyFlag", () => {
  it("flags a never-contacted company as new", () => {
    expect(companyFlag(company("A", null, "contacted"), NOW)).toBe("new");
  });

  it("flags a company quiet longer than its own stage allows", () => {
    // contacted -> 5 days of patience (STALE_DAYS_BY_STAGE).
    expect(companyFlag(company("A", NOW.getTime() - 6 * DAY, "contacted"), NOW)).toBe("quiet");
    expect(companyFlag(company("A", NOW.getTime() - 2 * DAY, "contacted"), NOW)).toBeNull();
  });

  it("uses the per-stage threshold, not one flat number", () => {
    // quoting is impatient (1 day); researching is not (5).
    const twoDaysAgo = NOW.getTime() - 2 * DAY;
    expect(companyFlag(company("A", twoDaysAgo, "quoting"), NOW)).toBe("quiet");
    expect(companyFlag(company("A", twoDaysAgo, "researching"), NOW)).toBeNull();
  });

  it("never flags a stage that has no threshold", () => {
    const longAgo = NOW.getTime() - 400 * DAY;
    expect(companyFlag(company("A", longAgo, "active_customer"), NOW)).toBeNull();
    expect(companyFlag(company("A", longAgo, "lost"), NOW)).toBeNull();
  });
});

describe("sortAgentCompanies", () => {
  it("puts never-contacted first, then coldest, then by name", () => {
    const rows = [
      company("Fresh", NOW.getTime() - DAY, "contacted"),
      company("Cold", NOW.getTime() - 30 * DAY, "contacted"),
      company("Never B", null, "contacted"),
      company("Never A", null, "contacted"),
    ];
    expect(sortAgentCompanies(rows).map((c) => c.name)).toEqual([
      "Never A",
      "Never B",
      "Cold",
      "Fresh",
    ]);
  });

  it("does not mutate its input", () => {
    const rows = [company("B", null, null), company("A", NOW.getTime(), null)];
    sortAgentCompanies(rows);
    expect(rows.map((c) => c.name)).toEqual(["B", "A"]);
  });
});

describe("activityStatus", () => {
  it("keeps the Companies list's wording", () => {
    expect(activityStatus(company("A", null, "contacted"), NOW).text).toBe("Never contacted");
    expect(activityStatus(company("A", NOW.getTime(), "contacted"), NOW).text).toBe("Today");
    expect(activityStatus(company("A", NOW.getTime() - DAY, "contacted"), NOW).text).toBe("Yesterday");
  });

  it("lets the flag lead the colour, not the flat freshness scale", () => {
    // 8 days quiet reads "fresh"? No — contacted allows 5, so it is flagged
    // quiet and must not render green next to a red flag.
    const quiet = company("A", NOW.getTime() - 8 * DAY, "contacted");
    expect(companyFlag(quiet, NOW)).toBe("quiet");
    expect(activityStatus(quiet, NOW).tone).toBe("warn");
  });

  it("still reads green for a genuinely fresh, unflagged company", () => {
    const fresh = company("A", NOW.getTime() - DAY, "contacted");
    expect(companyFlag(fresh, NOW)).toBeNull();
    expect(activityStatus(fresh, NOW).tone).toBe("good");
  });

  it("reds a never-contacted company", () => {
    expect(activityStatus(company("A", null, "contacted"), NOW).tone).toBe("bad");
  });

  it("falls back to the generic scale for a stage that never flags", () => {
    const old = company("A", NOW.getTime() - 400 * DAY, "active_customer");
    expect(companyFlag(old, NOW)).toBeNull();
    expect(activityStatus(old, NOW).tone).toBe("bad");
  });
});
