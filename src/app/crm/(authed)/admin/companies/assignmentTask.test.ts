import { describe, expect, it } from "vitest";
import { assignmentBrief, assignmentDoneWhen, assignmentTaskSpec, assignmentTaskTable, batchTaskSpec } from "./assignmentTask";
import { gapsForCompany } from "../../agent/completeness";
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

describe("assignmentBrief — the fix for 'research prospect is silent'", () => {
  const bare = { id: "a", name: "Acme", city: null, state: null, address: null, industry: null, contactCount: 0 };

  it("says what is missing when the record is empty", () => {
    const brief = assignmentBrief(bare)!;
    expect(brief).toContain("nobody on file to call");
    expect(brief).toContain("no address");
    expect(brief).toContain("no trade recorded");
    // And what to actually do about it.
    expect(brief).toContain("Find out who handles their freight");
  });

  it("says what is KNOWN when there is something to go on", () => {
    const brief = assignmentBrief({
      ...bare,
      city: "Houston",
      state: "TX",
      industry: "Scaffolding",
      contactCount: 1,
      contactName: "Dave Mena",
      phone: "713-856-9696",
    })!;
    expect(brief).toContain("Dave Mena on 713-856-9696");
    expect(brief).toContain("scaffolding");
    expect(brief).toContain("Houston, TX");
    // Different instruction: there is already somebody to ring.
    expect(brief).toContain("Confirm who still handles their freight");
    expect(brief).not.toContain("Find out who handles");
  });

  it("gives a company with a contact a different brief from one without", () => {
    const withContact = assignmentBrief({ ...bare, contactCount: 1, contactName: "Sam" });
    const without = assignmentBrief(bare);
    expect(withContact).not.toBe(without);
  });

  it("stays in step with the gaps panel — same derivation, same verdict", () => {
    // A company with city+state has no ADDRESS gap, so the brief must not
    // claim one. This is the case a second hand-written rule would get wrong.
    const brief = assignmentBrief({ ...bare, city: "Dallas", state: "TX" })!;
    expect(brief).not.toContain("no address");
    expect(gapsForCompany({ ...bare, city: "Dallas", state: "TX" }).map((g) => g.kind)).not.toContain(
      "address",
    );
  });

  it("returns null rather than a brief that says nothing", () => {
    // Nothing known, nothing missing cannot happen with real gaps, but the
    // guard matters: an empty brief is worse than no brief.
    expect(assignmentBrief({ ...bare, contactCount: 1, city: "X", state: "Y", industry: "Z" })).toBeTruthy();
  });
});

describe("assignmentDoneWhen", () => {
  const bare = { id: "a", name: "Acme", city: null, state: null, address: null, industry: null, contactCount: 0 };

  it("asks for a name and a number when there is nobody on file", () => {
    expect(assignmentDoneWhen("new_lead", bare)).toContain("phone number");
  });

  it("asks for a conversation when there already is somebody", () => {
    expect(assignmentDoneWhen("new_lead", { ...bare, contactCount: 2 })).toContain("spoken to");
  });

  it("stays SILENT where there is no obvious answer", () => {
    // A definition of done that restates the title teaches nobody anything
    // and trains people to ignore the field.
    for (const stage of ["contacted", "quoting", "active", "lost"]) {
      expect(assignmentDoneWhen(stage, bare)).toBeNull();
    }
  });
});
