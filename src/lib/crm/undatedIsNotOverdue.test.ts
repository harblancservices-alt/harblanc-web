import { describe, it, expect } from "vitest";
import { taskUrgencyBucket, taskDueBucket, daysLate } from "./taskUrgency";
import { summarizeDue } from "@/app/crm/(authed)/admin/dueReport";
import { buildBoard, sortByUrgency } from "@/app/crm/(authed)/admin/tasks/taskBoard";
import { groupAgentWork, dueLabel, dueTint } from "@/app/crm/(authed)/agent/agentWork";
import { buildPlanBoard, isOverdue, planColumnOf, planCardLabel } from "@/app/crm/(authed)/tasks/plan";
import { dueCountdown } from "@/app/crm/(authed)/_shell/format";

/**
 * ONE RULE, PINNED ACROSS EVERY SURFACE: an undated task is UNPLANNED, never
 * overdue.
 *
 * This matters as of 2026-08-25, when assignment stopped setting a due date —
 * every task an admin hands out is now born with due_at = null, so anything
 * that mistook "no date" for "past due" would light the whole org red on the
 * day the change shipped.
 *
 * Deliberately a cross-module test rather than five separate ones. Each of
 * these files guards null on its own today; the point here is that they must
 * ALL keep doing so, and a single file that fails loudly is how a future
 * change to any one of them gets caught.
 */

const NOW = new Date("2026-08-25T19:00:00.000Z");

describe("an undated task is never overdue", () => {
  it("lib/crm/taskUrgency", () => {
    expect(taskUrgencyBucket(null, NOW)).toBe("upcoming");
    expect(taskDueBucket(null, NOW)).toBe("none");
    expect(daysLate(null, NOW)).toBe(0);
  });

  it("Admin → Tasks counters (dueReport.summarizeDue)", () => {
    const counts = summarizeDue(
      [{ id: "a", title: "A", dueAt: null, assigneeId: "u1", accountId: null, companyName: null, isHigh: false }],
      NOW,
    );
    expect(counts.overdue).toBe(0);
    expect(counts.none).toBe(1);
  });

  it("Admin → Tasks board columns", () => {
    const board = buildBoard(
      [{ id: "a", title: "A", dueAt: null, assigneeId: "u1", accountId: null, companyName: null, isHigh: false }],
      [{ id: "u1", name: "Agent" }],
      NOW,
    );
    const col = board.find((c) => c.key === "u1")!;
    expect(col.counts.overdue).toBe(0);
    expect(col.counts.total).toBe(1);
  });

  it("Admin → Tasks card order puts undated last, not first", () => {
    const rows = sortByUrgency(
      [
        { id: "undated", title: "U", dueAt: null, assigneeId: null, accountId: null, companyName: null, isHigh: false },
        {
          id: "late",
          title: "L",
          dueAt: "2026-08-21T17:00:00.000Z",
          assigneeId: null,
          accountId: null,
          companyName: null,
          isHigh: false,
        },
      ],
      NOW,
    );
    expect(rows.map((r) => r.id)).toEqual(["late", "undated"]);
  });

  it("the agent dashboard", () => {
    const groups = groupAgentWork(
      [
        {
          id: "a",
          title: "A",
          dueAt: null,
          accountId: null,
          companyName: null,
          hint: null,
          contactName: null,
          isHigh: false,
          brief: null,
          doneWhen: null,
        },
      ],
      NOW,
    );
    expect(groups.overdue).toHaveLength(0);
    expect(groups.later.map((t) => t.id)).toEqual(["a"]);
    expect(dueLabel(null, NOW)).toBe("no date");
    expect(dueTint(null, NOW)).toBe("calm");
  });

  it("the Tasks planning board", () => {
    const task = {
      id: "a",
      title: "A",
      dueAt: null,
      accountId: null,
      companyName: null,
      provenance: null,
      contactName: null,
      isHigh: false,
      instructions: null,
      definitionOfDone: null,
    };
    expect(isOverdue(task, NOW)).toBe(false);
    expect(planColumnOf(task, NOW)).toBe("inbox");
    expect(planCardLabel(task, NOW)).toBeNull();
    const board = buildPlanBoard([task], NOW);
    expect(board.inbox).toHaveLength(1);
    expect(board.today).toHaveLength(0);
  });

  it("the shared due-date readout", () => {
    const { text, tone } = dueCountdown(null, NOW);
    expect(text).toBe("No due date");
    expect(tone).toBe("muted");
  });
});
