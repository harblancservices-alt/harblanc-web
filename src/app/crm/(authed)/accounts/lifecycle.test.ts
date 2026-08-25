import { describe, expect, it } from "vitest";
import {
  ACTIVE_CUSTOMER_STAGE_VALUES,
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
    expect(isActiveCustomerStage("active_customer")).toBe(true);
  });

  it("accepts the legacy raw value the funnel remapped", () => {
    expect(isActiveCustomerStage("customer")).toBe(true);
  });

  it("rejects every other stage in the funnel", () => {
    for (const stage of LIFECYCLE_STAGES) {
      if (stage === "active_customer") continue;
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
      expect(normalizeStage(raw)).toBe("active_customer");
    }
  });
});
