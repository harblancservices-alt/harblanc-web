import { describe, expect, it } from "vitest";
import { assignmentTaskSpec, assignmentTaskTable, batchTaskSpec } from "./assignmentTask";
import { LIFECYCLE_STAGES } from "../../accounts/lifecycle";
import { TASK_TYPES } from "../../tasks/taskType";

/**
 * Rewritten 2026-08-26 when the spec became STAGE-first instead of
 * source-first. The old suite asserted per-source behaviour ("sends a BOL
 * company to party matching", "treats free-typed source as ordinary"); source
 * no longer participates at all, so those cases could not be adapted — they
 * were assertions about a parameter that has gone.
 */

describe("assignmentTaskSpec", () => {
  it("gives a New Lead research — Brent's rule, whatever the source", () => {
    expect(assignmentTaskSpec("new_lead").title).toBe("Research and qualify this company");
  });

  it("no longer tells anyone to cold-call a company nobody has researched", () => {
    // The bug this rewrite fixed: a New Lead sourced manual/bol/null used to
    // get "Make first contact" because only source='otr' hit the research
    // branch. Source is not an argument any more, so it cannot recur.
    expect(assignmentTaskSpec("new_lead").title).not.toBe("Make first contact");
  });

  it("does not ask for research on a company already spoken to", () => {
    expect(assignmentTaskSpec("contacted").title).toBe("Follow up with this company");
    expect(assignmentTaskSpec("quoting").title).toBe("Follow up on the quote");
    for (const stage of ["contacted", "engaged", "quoting", "setup", "active"]) {
      expect(assignmentTaskSpec(stage).title).not.toMatch(/research/i);
    }
  });

  it("asks for first contact once research is done", () => {
    expect(assignmentTaskSpec("qualified").title).toBe("Make first contact");
  });

  it("resolves legacy stored values before choosing", () => {
    // `researching` maps to New Lead per Brent's ruling, so a row that has
    // not been remapped yet still gets the research task.
    expect(assignmentTaskSpec("researching").title).toBe("Research and qualify this company");
    expect(assignmentTaskSpec("active_customer").title).toBe("Check in with this customer");
  });

  it("falls back to New Lead work for an unknown or missing stage", () => {
    expect(assignmentTaskSpec(null).title).toBe("Research and qualify this company");
    expect(assignmentTaskSpec("banana").title).toBe("Research and qualify this company");
  });

  it("covers every stage — no gaps in the map", () => {
    for (const stage of LIFECYCLE_STAGES) {
      expect(assignmentTaskSpec(stage).title).toBeTruthy();
      expect(assignmentTaskSpec(stage).taskType).toBeTruthy();
    }
    expect(assignmentTaskTable()).toHaveLength(LIFECYCLE_STAGES.length);
  });

  it("only ever uses task types the rest of the CRM already knows", () => {
    for (const row of assignmentTaskTable()) {
      expect(TASK_TYPES as readonly string[]).toContain(row.taskType);
    }
  });

  it("never puts a company name in the title — a bulk assign shares one", () => {
    for (const row of assignmentTaskTable()) {
      expect(row.title).toMatch(/^[^{}]*$/);
    }
  });
});

describe("batchTaskSpec", () => {
  it("uses the shared spec when every company is at the same stage", () => {
    expect(batchTaskSpec([{ stage: "contacted" }, { stage: "contacted" }]).title).toBe(
      "Follow up with this company",
    );
  });

  it("takes the LEAST advanced company when the batch is mixed", () => {
    // Erring toward work that definitely has not been done: telling somebody
    // to follow up on a company nobody has contacted implies a conversation
    // that never happened, which is worse than a redundant research task.
    expect(batchTaskSpec([{ stage: "quoting" }, { stage: "new_lead" }]).title).toBe(
      "Research and qualify this company",
    );
    expect(batchTaskSpec([{ stage: "active" }, { stage: "contacted" }]).title).toBe(
      "Follow up with this company",
    );
  });

  it("is order-independent", () => {
    const a = batchTaskSpec([{ stage: "new_lead" }, { stage: "quoting" }]).title;
    const b = batchTaskSpec([{ stage: "quoting" }, { stage: "new_lead" }]).title;
    expect(a).toBe(b);
  });

  it("handles an empty selection without throwing", () => {
    expect(batchTaskSpec([]).title).toBe("Research and qualify this company");
  });
});
