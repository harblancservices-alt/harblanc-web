import { describe, expect, it } from "vitest";
import {
  assignmentTaskSpec,
  batchTaskSpec,
  DEFAULT_DUE_DAYS,
  defaultDueDate,
  dueDateToInstant,
} from "./assignmentTask";
import { TASK_TYPES } from "../../tasks/taskType";

describe("assignmentTaskSpec", () => {
  it("sends an OTR company to research", () => {
    expect(assignmentTaskSpec("otr", "new_lead").title).toBe("Research and qualify this company");
  });

  it("sends a BOL company to party matching", () => {
    expect(assignmentTaskSpec("bol", "new_lead").title).toBe(
      "Match the companies on this bill of lading",
    );
  });

  it("asks for first contact on an untouched company", () => {
    expect(assignmentTaskSpec("manual", "new_lead").title).toBe("Make first contact");
    expect(assignmentTaskSpec(null, null).title).toBe("Make first contact");
  });

  it("asks for a follow-up once the company has moved past new_lead", () => {
    expect(assignmentTaskSpec("manual", "contacted").title).toBe("Follow up with this company");
    expect(assignmentTaskSpec("manual", "quoting").title).toBe("Follow up with this company");
  });

  it("lets source win over stage — an OTR entry needs research regardless", () => {
    expect(assignmentTaskSpec("otr", "contacted").title).toBe("Research and qualify this company");
  });

  it("treats free-typed source as ordinary, not as OTR or BOL", () => {
    expect(assignmentTaskSpec("Cold Call", "new_lead").title).toBe("Make first contact");
    expect(assignmentTaskSpec("Kermit Layman", "new_lead").title).toBe("Make first contact");
  });

  it("only ever uses task types the rest of the CRM already knows", () => {
    const used = [
      assignmentTaskSpec("otr", "new_lead"),
      assignmentTaskSpec("bol", "new_lead"),
      assignmentTaskSpec("manual", "new_lead"),
      assignmentTaskSpec("manual", "contacted"),
    ].map((s) => s.taskType);
    for (const t of used) expect(TASK_TYPES as readonly string[]).toContain(t);
  });

  it("never puts a company name in the title — bulk shares one title", () => {
    const titles = [
      assignmentTaskSpec("otr", "new_lead"),
      assignmentTaskSpec("bol", "new_lead"),
      assignmentTaskSpec("manual", "new_lead"),
      assignmentTaskSpec("manual", "contacted"),
    ].map((s) => s.title);
    for (const t of titles) expect(t).toMatch(/^[^{}]*$/);
  });
});

describe("batchTaskSpec", () => {
  it("uses the shared spec when every company wants the same thing", () => {
    expect(
      batchTaskSpec([
        { source: "otr", stage: "new_lead" },
        { source: "otr", stage: "contacted" },
      ]).title,
    ).toBe("Research and qualify this company");
  });

  it("falls back to first contact for a mixed batch", () => {
    // Applying "Match the bill of lading" to an OTR company would be wrong.
    expect(
      batchTaskSpec([
        { source: "otr", stage: "new_lead" },
        { source: "bol", stage: "new_lead" },
      ]).title,
    ).toBe("Make first contact");
  });

  it("handles an empty selection without throwing", () => {
    expect(batchTaskSpec([]).title).toBe("Make first contact");
  });
});

describe("defaultDueDate", () => {
  it("defaults a few days out", () => {
    expect(defaultDueDate(new Date("2026-08-25T09:00:00"))).toBe("2026-08-28");
    expect(DEFAULT_DUE_DAYS).toBe(3);
  });

  it("rolls over a month boundary", () => {
    expect(defaultDueDate(new Date("2026-08-30T09:00:00"))).toBe("2026-09-02");
  });

  it("uses LOCAL calendar parts, so a late-evening assign doesn't skip a day", () => {
    // toISOString() on 23:30 Central would already be tomorrow in UTC.
    expect(defaultDueDate(new Date("2026-08-25T23:30:00"), 1)).toBe("2026-08-26");
  });
});

describe("dueDateToInstant", () => {
  it("lands at local midday so a timezone shift can't move the day", () => {
    const iso = dueDateToInstant("2026-08-28");
    expect(iso).not.toBeNull();
    expect(new Date(iso as string).getDate()).toBe(28);
    expect(new Date(iso as string).getHours()).toBe(12);
  });

  it("returns null for empty or unparseable input", () => {
    expect(dueDateToInstant("")).toBeNull();
    expect(dueDateToInstant("   ")).toBeNull();
    expect(dueDateToInstant("not-a-date")).toBeNull();
  });
});
