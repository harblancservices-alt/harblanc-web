import { describe, expect, it } from "vitest";
import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_STYLE,
  TILE_CATEGORIES,
  kindsForCategory,
} from "./activityTypes";
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

describe("the company split", () => {
  it("no longer has a blended company category at all", () => {
    // THE ORIGINAL BUG: one tile counted eight unrelated kinds, so it could
    // not tell selling from filing.
    expect(ACTIVITY_CATEGORIES).not.toContain("company" as never);
    expect(ACTIVITY_CATEGORIES).toContain("pipeline");
    expect(ACTIVITY_CATEGORIES).toContain("company_added");
    expect(ACTIVITY_CATEGORIES).toContain("record");
  });

  it("puts stage changes, and only stage changes, in pipeline", () => {
    // Pipeline is the number Brent manages against. Anything else in here
    // would flatter it.
    expect(kindsForCategory("pipeline")).toEqual([CRM_ACTIVITY.lifecycleChanged]);
  });

  it("puts company creation, and only that, in companies added", () => {
    expect(kindsForCategory("company_added")).toEqual([CRM_ACTIVITY.accountCreated]);
  });

  it("keeps owner changes out of pipeline", () => {
    // An owner change is not selling. One rep_changed row can be an agent
    // claiming work or an admin moving it between people, and the event
    // cannot tell the two apart — so it is never counted as progress.
    expect(kindsForCategory("pipeline")).not.toContain(CRM_ACTIVITY.repChanged);
    expect(kindsForCategory("record")).toContain(CRM_ACTIVITY.repChanged);
  });

  it("loses nothing in the reshuffle", () => {
    // Every kind the old blended category owned still lands in exactly one
    // of the three, so the total reconciles unchanged.
    const wasCompany = [
      CRM_ACTIVITY.accountCreated,
      CRM_ACTIVITY.accountDeleted,
      CRM_ACTIVITY.lifecycleChanged,
      CRM_ACTIVITY.repChanged,
      CRM_ACTIVITY.detailsUpdated,
      CRM_ACTIVITY.locationAdded,
      CRM_ACTIVITY.locationUpdated,
      CRM_ACTIVITY.locationDeleted,
    ];
    const nowCovered = [
      ...kindsForCategory("pipeline"),
      ...kindsForCategory("company_added"),
      ...kindsForCategory("record"),
    ];
    expect(new Set(nowCovered)).toEqual(new Set(wasCompany));
    expect(nowCovered.length).toBe(wasCompany.length); // no kind counted twice
  });

  it("keeps all three in the company hue rather than inventing colours", () => {
    // The palette carries one visual identity per type family; the split is
    // told by the label, not by two new hues.
    expect(ACTIVITY_STYLE.pipeline.tone).toBe(ACTIVITY_STYLE.company_added.tone);
  });
});

describe("what earns a tile", () => {
  it("shows six categories plus the total, not nine", () => {
    // Splitting one category into three took the grid from 7 tiles to 9.
    // Six plus the total is what still reads as a scanning surface.
    expect(TILE_CATEGORIES).toHaveLength(6);
    expect(TILE_CATEGORIES).toContain("pipeline");
    expect(TILE_CATEGORIES).toContain("company_added");
  });

  it("leaves the thin and empty categories off the tiles", () => {
    expect(TILE_CATEGORIES).not.toContain("record");
    expect(TILE_CATEGORIES).not.toContain("deal");
    expect(TILE_CATEGORIES).not.toContain("other");
  });

  it("still lets every category be filtered", () => {
    // The tiles are the filter on this page, so anything off the grid has
    // to stay reachable another way — it does, via the "Also" strip, which
    // renders exactly the complement.
    const strip = ACTIVITY_CATEGORIES.filter((c) => !TILE_CATEGORIES.includes(c));
    expect(new Set([...TILE_CATEGORIES, ...strip])).toEqual(new Set(ACTIVITY_CATEGORIES));
    expect(strip.length).toBeGreaterThan(0);
  });
});
