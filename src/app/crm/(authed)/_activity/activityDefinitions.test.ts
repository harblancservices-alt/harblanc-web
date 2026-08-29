import { describe, expect, it } from "vitest";
import { ACTIVITY_CATEGORIES, ACTIVITY_STYLE, kindsForCategory } from "./activityTypes";
import { CRM_ACTIVITY } from "@/lib/crm/activity";

/**
 * Brent could not tell what the tiles counted. These pin the two things
 * that fixed it: every number carries a definition, and the one label that
 * was actively misleading no longer claims to count companies.
 */
describe("every metric can explain itself", () => {
  it("gives every category a definition", () => {
    // A tile with no definition renders a number with nothing under it,
    // which is the state this whole change exists to remove.
    for (const c of ACTIVITY_CATEGORIES) {
      expect(ACTIVITY_STYLE[c].definition.trim().length).toBeGreaterThan(0);
    }
  });

  it("keeps every definition short enough to sit under a tile", () => {
    // Roughly one line at tile width. Longer than this and the scanning
    // surface turns into a wall of prose.
    for (const c of ACTIVITY_CATEGORIES) {
      expect(ACTIVITY_STYLE[c].definition.length).toBeLessThanOrEqual(45);
    }
  });

  it("writes definitions in lower case, so they read as a caption not a heading", () => {
    for (const c of ACTIVITY_CATEGORIES) {
      const d = ACTIVITY_STYLE[c].definition;
      expect(d[0]).toBe(d[0].toLowerCase());
    }
  });
});

describe("the company tile no longer claims to count companies", () => {
  it('is labelled "Company updates", not "Companies"', () => {
    // THE ACTUAL BUG. It counts events — one week read 42 for an agent of
    // which exactly one was a company created — while sitting next to
    // "Companies called", which really is a count of companies.
    expect(ACTIVITY_STYLE.company.label).toBe("Company updates");
    expect(ACTIVITY_STYLE.company.label).not.toBe("Companies");
  });

  it("says in its definition that it is edits, not creations", () => {
    expect(ACTIVITY_STYLE.company.definition).toContain("stage");
  });

  it("folds far more than creations into that one tile", () => {
    // The reason the label was wrong: eight different kinds land here, and
    // only one of them creates a company.
    const inCompany = kindsForCategory("company");
    expect(inCompany).toContain(CRM_ACTIVITY.accountCreated);
    expect(inCompany).toContain(CRM_ACTIVITY.lifecycleChanged);
    expect(inCompany).toContain(CRM_ACTIVITY.repChanged);
    expect(inCompany.length).toBeGreaterThan(3);
  });

  it("does not let a category label repeat its own definition", () => {
    for (const c of ACTIVITY_CATEGORIES) {
      expect(ACTIVITY_STYLE[c].definition.toLowerCase()).not.toBe(
        ACTIVITY_STYLE[c].label.toLowerCase(),
      );
    }
  });
});
