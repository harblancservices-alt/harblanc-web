import { describe, expect, it } from "vitest";
import {
  ACTIVE_CUSTOMER_STAGE_VALUES,
  LIFECYCLE_BADGE_TONE,
  LIFECYCLE_LABEL,
  LIFECYCLE_TONE,
  STALE_DAYS_BY_STAGE,
  stageNeedsReason,
  stageRank,
  LEGACY_STAGE_ALIASES,
  LIFECYCLE_STAGES,
  isActiveCustomerStage,
  normalizeStage,
} from "./lifecycle";

/**
 * The load builder's Customer picker filters in SQL
 * (`.in("lifecycle_status", ACTIVE_CUSTOMER_STAGE_VALUES)`) while the Bill of
 * Lading customer directory filters in JS (isActiveCustomerStage). These
 * tests pin the two forms to each other so the picker can never start
 * offering a company the shared predicate would reject — that equivalence is
 * the whole reason the raw-value list is derived rather than typed out.
 */
describe("isActiveCustomerStage", () => {
  it("accepts the canonical stage", () => {
    expect(isActiveCustomerStage("active_customer")).toBe(true); // legacy raw value, pre-remap
  });

  it("accepts the legacy raw value the funnel remapped", () => {
    expect(isActiveCustomerStage("customer")).toBe(true);
  });

  it("rejects every other stage in the funnel", () => {
    for (const stage of LIFECYCLE_STAGES) {
      if (stage === "active") continue;
      expect(isActiveCustomerStage(stage)).toBe(false);
    }
  });

  it("rejects unset/unknown values instead of defaulting them in", () => {
    expect(isActiveCustomerStage(null)).toBe(false);
    expect(isActiveCustomerStage(undefined)).toBe(false);
    expect(isActiveCustomerStage("")).toBe(false);
    expect(isActiveCustomerStage("something_else")).toBe(false);
  });
});

describe("ACTIVE_CUSTOMER_STAGE_VALUES", () => {
  it("only contains values the predicate accepts", () => {
    for (const raw of ACTIVE_CUSTOMER_STAGE_VALUES) {
      expect(isActiveCustomerStage(raw)).toBe(true);
    }
  });

  it("contains every value the predicate accepts", () => {
    const accepted = [...LIFECYCLE_STAGES, ...Object.keys(LEGACY_STAGE_ALIASES)].filter((raw) =>
      isActiveCustomerStage(raw),
    );
    expect([...ACTIVE_CUSTOMER_STAGE_VALUES].sort()).toEqual(accepted.sort());
  });

  it("stays in step with normalizeStage", () => {
    for (const raw of ACTIVE_CUSTOMER_STAGE_VALUES) {
      expect(normalizeStage(raw)).toBe("active");
    }
  });
});

describe("the ten-stage vocabulary (2026-08-26)", () => {
  it("is exactly Brent's ten, in his order", () => {
    expect([...LIFECYCLE_STAGES]).toEqual([
      "new_lead",
      "qualified",
      "contacted",
      "engaged",
      "quoting",
      "setup",
      "active",
      "dormant",
      "lost",
      "disqualified",
    ]);
  });

  it("has a label, a tone and a badge tone for every stage", () => {
    for (const stage of LIFECYCLE_STAGES) {
      expect(LIFECYCLE_LABEL[stage]).toBeTruthy();
      expect(LIFECYCLE_TONE[stage]).toBeTruthy();
      expect(LIFECYCLE_BADGE_TONE[stage]).toBeTruthy();
    }
  });

  it("ranks the funnel in declared order, terminal stages last", () => {
    expect(stageRank("new_lead")).toBeLessThan(stageRank("qualified"));
    expect(stageRank("quoting")).toBeLessThan(stageRank("active"));
    for (const terminal of ["lost", "disqualified"] as const) {
      expect(stageRank(terminal)).toBeGreaterThan(stageRank("active"));
    }
  });
});

describe("legacy stage values still on live rows", () => {
  // The data remap is HELD for Brent's approval, so these two raw values are
  // in the database right now. If these break, 34 companies at `researching`
  // and 1 at `active_customer` silently fall back to New Lead.
  it("maps researching onto qualified, which took its funnel position", () => {
    expect(normalizeStage("researching")).toBe("qualified");
  });

  it("maps active_customer onto active", () => {
    expect(normalizeStage("active_customer")).toBe("active");
    expect(isActiveCustomerStage("active_customer")).toBe(true);
  });

  it("keeps pre-remap rows out of the New Lead bucket", () => {
    for (const raw of ["researching", "active_customer", "customer", "quoted", "inactive"]) {
      expect(normalizeStage(raw)).not.toBe("new_lead");
    }
  });

  it("still falls back to New Lead for a genuinely unknown value", () => {
    expect(normalizeStage("banana")).toBe("new_lead");
    expect(normalizeStage(null)).toBe("new_lead");
  });
});

describe("stageNeedsReason", () => {
  it("is true for exactly Lost and Disqualified", () => {
    for (const stage of LIFECYCLE_STAGES) {
      expect(stageNeedsReason(stage)).toBe(stage === "lost" || stage === "disqualified");
    }
  });

  it("resolves legacy values before deciding", () => {
    // "inactive" now means Dormant, which needs no reason — the old model
    // treated it as a second terminal state, and getting this wrong would
    // demand a reason for a company nobody has given up on.
    expect(stageNeedsReason("inactive")).toBe(false);
  });
});

describe("STALE_DAYS_BY_STAGE", () => {
  it("only ever names real stages", () => {
    for (const key of Object.keys(STALE_DAYS_BY_STAGE)) {
      expect(LIFECYCLE_STAGES as readonly string[]).toContain(key);
    }
  });

  it("leaves the four never-nag stages out", () => {
    for (const stage of ["active", "dormant", "lost", "disqualified"] as const) {
      expect(STALE_DAYS_BY_STAGE[stage]).toBeUndefined();
    }
  });

  it("gets more impatient as the funnel gets more expensive", () => {
    expect(STALE_DAYS_BY_STAGE.quoting!).toBeLessThan(STALE_DAYS_BY_STAGE.engaged!);
    expect(STALE_DAYS_BY_STAGE.engaged!).toBeLessThan(STALE_DAYS_BY_STAGE.contacted!);
  });
});
