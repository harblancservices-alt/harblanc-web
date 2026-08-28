import { describe, expect, it } from "vitest";
import { buildSummary, callList, greetingFor, workQueue } from "./dashboardSummary";
import { groupAgentWork, type AgentTask, type AgentCompany } from "./agentWork";

const NOW = new Date("2026-08-27T15:00:00Z"); // 10:00 Central, a Thursday

function task(over: Partial<AgentTask> = {}): AgentTask {
  return {
    id: Math.random().toString(36).slice(2),
    title: "Follow up",
    dueAt: null,
    accountId: "a1",
    companyName: "Fritz Industries, Inc.",
    hint: null,
    contactName: null,
    isHigh: false,
    brief: null,
    doneWhen: null,
    ...over,
  };
}

function company(over: Partial<AgentCompany> = {}): AgentCompany {
  return {
    id: Math.random().toString(36).slice(2),
    name: "Fritz Industries, Inc.",
    city: null,
    state: null,
    source: "bol",
    stage: "new_lead",
    stageChangedMs: null,
    lastContactMs: null,
    contactName: null,
    contactTitle: null,
    contactPhone: null,
    openTasks: 0,
    createdMs: Date.parse("2026-08-21T12:00:00Z"),
    ...over,
  };
}

const base = { callsToday: 0, reachedToday: 0, now: NOW };

describe("greetingFor", () => {
  it("reads the org's timezone, not the server's", () => {
    // 15:00 UTC is 10:00 Central — morning, even though UTC says afternoon.
    expect(greetingFor(new Date("2026-08-27T15:00:00Z"))).toBe("Morning");
    expect(greetingFor(new Date("2026-08-27T19:00:00Z"))).toBe("Afternoon");
    expect(greetingFor(new Date("2026-08-28T01:00:00Z"))).toBe("Evening");
  });
});

describe("buildSummary — the empty day, which is the real one today", () => {
  it("reports zeros with plain-English sub-lines, never a dash", () => {
    const s = buildSummary({ ...base, tasks: [], companies: [] });
    expect(s.metrics.map((m) => m.value)).toEqual([0, 0, 0, 0, 0]);
    expect(s.metrics.map((m) => m.sub)).toEqual([
      "no calls yet",
      "nothing waiting",
      "nothing late",
      "nothing booked",
      "nothing scheduled",
    ]);
  });

  it("never leaves the sentence blank", () => {
    expect(buildSummary({ ...base, tasks: [], companies: [] }).line).toBe(
      "Nothing queued. A quiet one.",
    );
  });

  it("mentions undated tasks rather than claiming nothing to do", () => {
    // 27 of the 31 open tasks in the live database have no due date. A
    // dashboard that says "nothing queued" while 27 tasks sit undated is
    // technically true and practically a lie.
    const s = buildSummary({ ...base, tasks: [task(), task()], companies: [] });
    expect(s.line).toBe("Nothing scheduled. 2 tasks have no date on them yet.");
  });

  it("never marks an empty OVERDUE as an alarm", () => {
    const s = buildSummary({ ...base, tasks: [], companies: [] });
    expect(s.metrics.find((m) => m.key === "overdue")?.alarm).toBeFalsy();
  });
});

describe("buildSummary — with real work", () => {
  it("counts calls and says how many were reached", () => {
    const s = buildSummary({ ...base, tasks: [], companies: [], callsToday: 6, reachedToday: 2 });
    const m = s.metrics.find((x) => x.key === "logged")!;
    expect(m.value).toBe(6);
    expect(m.sub).toBe("calls · 2 reached");
  });

  it("names the oldest overdue task, not just the count", () => {
    const s = buildSummary({
      ...base,
      tasks: [
        task({ dueAt: "2026-08-24T15:00:00Z" }),
        task({ dueAt: "2026-08-26T15:00:00Z" }),
      ],
      companies: [],
    });
    const m = s.metrics.find((x) => x.key === "overdue")!;
    expect(m.value).toBe(2);
    expect(m.sub).toBe("oldest is 3 days late");
    expect(m.alarm).toBe(true);
  });

  it("names the next task due today by company and time", () => {
    const s = buildSummary({
      ...base,
      tasks: [task({ dueAt: "2026-08-27T20:00:00Z", companyName: "Sord Landfill" })],
      companies: [],
    });
    expect(s.metrics.find((x) => x.key === "dueToday")!.sub).toBe("next: Sord Landfill — 3:00 PM");
  });

  it("describes arrivals by their REAL source, not an assumed one", () => {
    const s = buildSummary({
      ...base,
      tasks: [],
      companies: [company({ source: "bol" }), company({ source: "otr" })],
    });
    const m = s.metrics.find((x) => x.key === "triage")!;
    expect(m.value).toBe(2);
    expect(m.sub).toBe("from BOL Center & OTR");
  });

  it("says nothing about provenance when the rows carry none", () => {
    const s = buildSummary({ ...base, tasks: [], companies: [company({ source: null })] });
    expect(s.metrics.find((x) => x.key === "triage")!.sub).toBeNull();
  });

  it("only counts a company as an arrival if nobody has ever spoken to it", () => {
    const s = buildSummary({
      ...base,
      tasks: [],
      companies: [company({ lastContactMs: Date.parse("2026-08-26T12:00:00Z") })],
    });
    expect(s.metrics.find((x) => x.key === "triage")!.value).toBe(0);
  });

  it("builds the sentence from clauses that are each true", () => {
    const s = buildSummary({
      ...base,
      tasks: [task({ dueAt: "2026-08-27T20:00:00Z" })],
      companies: [company(), company(), company()],
    });
    expect(s.line).toBe("3 new arrivals to triage, then 1 call today. Nothing after today yet.");
  });

  it("drops a clause entirely when its count is zero", () => {
    const s = buildSummary({ ...base, tasks: [], companies: [company()] });
    expect(s.line).toBe("1 new arrival to triage. Nothing after today yet.");
    expect(s.line).not.toMatch(/0 /);
  });
});

describe("workQueue", () => {
  it("puts admin-urgent first, then overdue, then arrivals, then today", () => {
    const urgent = task({ id: "urgent", isHigh: true, dueAt: "2026-09-30T15:00:00Z" });
    const late = task({ id: "late", dueAt: "2026-08-25T15:00:00Z" });
    const today = task({ id: "today", dueAt: "2026-08-27T20:00:00Z" });
    const arrival = company({ id: "arrival" });
    const q = workQueue([today, late, urgent], [arrival], NOW);
    expect(q.map((i) => (i.kind === "task" ? i.task.id : i.company.id))).toEqual([
      "urgent",
      "late",
      "arrival",
      "today",
    ]);
  });

  it("never lists the same task twice when it is both urgent and overdue", () => {
    const both = task({ id: "both", isHigh: true, dueAt: "2026-08-25T15:00:00Z" });
    const q = workQueue([both], [], NOW);
    expect(q).toHaveLength(1);
  });

  it("agrees with the count on the button", () => {
    const tasks = [task({ dueAt: "2026-08-27T20:00:00Z" }), task({ dueAt: "2026-08-25T15:00:00Z" })];
    const companies = [company()];
    const s = buildSummary({ ...base, tasks, companies });
    expect(s.queueCount).toBe(workQueue(tasks, companies, NOW).length);
  });

  it("is empty when there is genuinely nothing to work", () => {
    expect(workQueue([], [], NOW)).toEqual([]);
    expect(buildSummary({ ...base, tasks: [], companies: [] }).queueCount).toBe(0);
  });

  it("leaves undated tasks out of the queue but not out of the sentence", () => {
    // An undated task has nothing to sort it by, so it cannot take a place
    // in an ordered walk — but it must still be visible somewhere.
    const s = buildSummary({ ...base, tasks: [task(), task()], companies: [] });
    expect(s.queueCount).toBe(0);
    expect(s.line).toMatch(/no date on them yet/);
  });
});

describe("callList — the middle column", () => {
  it("puts the whole book in one list, undated included", () => {
    // The bug this fixes: five of Brent's six open tasks were invisible on
    // his own dashboard because they had no due date.
    const list = callList([task(), task(), task()], NOW);
    expect(list).toHaveLength(3);
    expect(list.every((i) => i.band === "undated")).toBe(true);
  });

  it("orders overdue, then today, then undated — and drops future-dated work", () => {
    const undated = task({ id: "undated" });
    const later = task({ id: "later", dueAt: "2026-09-04T15:00:00Z" });
    const today = task({ id: "today", dueAt: "2026-08-27T20:00:00Z" });
    const late = task({ id: "late", dueAt: "2026-08-24T15:00:00Z" });
    const list = callList([undated, later, today, late], NOW);
    expect(list.map((i) => i.task.id)).toEqual(["late", "today", "undated"]);
    expect(list.map((i) => i.band)).toEqual(["overdue", "today", "undated"]);
  });

  it("a snoozed call leaves the list, and comes back when it comes due", () => {
    // Tyler, 2026-08-27: "snoozed till next week but still populates as a
    // top call". He had nothing overdue and nothing due today, so a task
    // pushed to next week was literally row one.
    const snoozed = task({ id: "snoozed", dueAt: "2026-09-03T13:00:00Z" });
    expect(callList([snoozed], NOW).map((i) => i.task.id)).toEqual([]);

    // The snooze lapses: same row, no write, no cleanup job — the clock
    // moved and taskDueBucket re-buckets it.
    const thatMorning = new Date("2026-09-03T12:00:00Z");
    const back = callList([snoozed], thatMorning);
    expect(back.map((i) => i.task.id)).toEqual(["snoozed"]);
    expect(back[0].band).toBe("today");
  });

  it("keeps a snoozed call out even when it is the agent's only work", () => {
    // The exact shape of Tyler's book: no overdue, no today, one future.
    const only = task({ id: "only", dueAt: "2026-09-15T16:10:00Z" });
    expect(callList([only], NOW)).toHaveLength(0);
  });

  it("puts the most overdue first, not the least", () => {
    const threeLate = task({ id: "three", dueAt: "2026-08-24T15:00:00Z" });
    const oneLate = task({ id: "one", dueAt: "2026-08-26T15:00:00Z" });
    expect(callList([oneLate, threeLate], NOW).map((i) => i.task.id)).toEqual(["three", "one"]);
  });

  it("sorts dated work soonest first", () => {
    // Both overdue now that future dates are excluded — the rule under test
    // is the ascending sort within a dated band, which is unchanged.
    const far = task({ id: "far", dueAt: "2026-08-20T15:00:00Z" });
    const near = task({ id: "near", dueAt: "2026-08-25T15:00:00Z" });
    expect(callList([far, near], NOW).map((i) => i.task.id)).toEqual(["far", "near"]);
  });

  it("keeps undated work in the order it arrived, so nothing reshuffles", () => {
    const a = task({ id: "a" });
    const b = task({ id: "b" });
    const c = task({ id: "c" });
    expect(callList([a, b, c], NOW).map((i) => i.task.id)).toEqual(["a", "b", "c"]);
    // And again — a comparator that returned 0 for ties without the index
    // fallback would be free to swap these between renders.
    expect(callList([a, b, c], NOW).map((i) => i.task.id)).toEqual(["a", "b", "c"]);
  });

  it("agrees with the Overdue column about what is late", () => {
    // The duplication is deliberate, but both surfaces must mean the same
    // thing by "overdue" — they share taskDueBucket for exactly this.
    const late = task({ id: "late", dueAt: "2026-08-24T15:00:00Z" });
    const groups = groupAgentWork([late], NOW);
    const list = callList([late], NOW);
    expect(groups.overdue.map((t) => t.id)).toEqual(["late"]);
    expect(list.filter((i) => i.band === "overdue").map((i) => i.task.id)).toEqual(["late"]);
  });

  it("does not invent a band for a task due later today", () => {
    const s = callList([task({ dueAt: "2026-08-27T23:30:00Z" })], NOW);
    expect(s[0].band).toBe("today");
  });

  it("is empty only when there is genuinely nothing open", () => {
    expect(callList([], NOW)).toEqual([]);
  });
});

describe("callList — the three columns do three different jobs", () => {
  it("hides an untriaged company's work, so it is not in two columns at once", () => {
    // Widening this column created the duplication: A&R Rent-A-Fence showed
    // as a New arrival AND as "Research and qualify this company" in the
    // call list on Brent's live dashboard.
    const t = task({ id: "research", accountId: "new-co" });
    expect(callList([t], NOW).map((i) => i.task.id)).toEqual(["research"]);
    expect(callList([t], NOW, new Set(["new-co"]))).toEqual([]);
  });

  it("still shows an untriaged company's work once it is LATE", () => {
    // Late beats tidy. A missed date must never be hidden for neatness.
    const late = task({ id: "late", accountId: "new-co", dueAt: "2026-08-24T15:00:00Z" });
    const out = callList([late], NOW, new Set(["new-co"]));
    expect(out.map((i) => i.task.id)).toEqual(["late"]);
    expect(out[0].band).toBe("overdue");
  });

  it("never hides a task that has no company", () => {
    const orphan = task({ id: "orphan", accountId: null });
    expect(callList([orphan], NOW, new Set(["new-co"])).map((i) => i.task.id)).toEqual(["orphan"]);
  });

  it("shows the work again once the company is triaged", () => {
    const t = task({ id: "research", accountId: "co" });
    expect(callList([t], NOW, new Set(["co"]))).toEqual([]);
    expect(callList([t], NOW, new Set()).map((i) => i.task.id)).toEqual(["research"]);
  });
});
