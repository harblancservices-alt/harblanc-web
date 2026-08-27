import { describe, expect, it } from "vitest";
import { buildSummary, greetingFor, workQueue } from "./dashboardSummary";
import type { AgentTask, AgentCompany } from "./agentWork";

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
