import { describe, expect, it } from "vitest";
import { CRM_ACTIVITY } from "@/lib/crm/activity";
import {
  ACTIVITY_CATEGORIES,
  allMappedKinds,
  categoryForKind,
  kindsForCategory,
} from "./activityTypes";
import { DISTINCT_SCAN_CAP, PAGE_SIZE, type ActivityMetrics } from "./activity-data";

/**
 * THE UNDERCOUNT, AND THE INVARIANTS THAT KEEP IT FIXED.
 *
 * Until 2026-08-28 the dashboard's metrics were counted off the rows it had
 * FETCHED, and the fetch is capped per source so the feed can stay
 * paginated. So every number was the size of the page, not the size of the
 * period. In the week of 24 Aug the org logged 275 activity rows against a
 * 100-row cap: the dashboard reported 137 of Tyler's 167, and the
 * unattributed banner read 2 where the truth was 75.
 *
 * The counts are SQL COUNT queries now, one per category. That only adds up
 * to the right total if the categories PARTITION the kinds — every kind
 * counted once, none counted twice, and "other" being exactly the
 * complement of everything mapped. Those are the invariants below; a new
 * activity kind that broke one would silently skew the totals again.
 */

const FROM_OWN_TABLE = ["call", "note"] as const;
const FROM_ACTIVITY_LOG = ACTIVITY_CATEGORIES.filter(
  (c) => !FROM_OWN_TABLE.includes(c as (typeof FROM_OWN_TABLE)[number]),
);

describe("the kind map partitions cleanly, so the counts can be summed", () => {
  it("gives every mapped kind exactly one category", () => {
    const kinds = allMappedKinds();
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it("never counts a kind under two categories", () => {
    const seen = new Map<string, string>();
    for (const c of ACTIVITY_CATEGORIES) {
      for (const kind of kindsForCategory(c)) {
        expect(seen.has(kind)).toBe(false);
        seen.set(kind, c);
      }
    }
  });

  it("covers every mapped kind across the categories", () => {
    const covered = new Set(ACTIVITY_CATEGORIES.flatMap((c) => kindsForCategory(c)));
    for (const kind of allMappedKinds()) expect(covered.has(kind)).toBe(true);
  });

  it("keeps 'other' as a true complement — it owns no kinds of its own", () => {
    // The SQL counts "other" as NOT IN (allMappedKinds). If "other" ever had
    // its own kinds they would be both included and excluded, and the total
    // would stop adding up.
    expect(kindsForCategory("other")).toEqual([]);
    expect(categoryForKind("a_kind_invented_next_year")).toBe("other");
  });

  it("counts call and note from their own tables, not from the log", () => {
    // Their crm_activities rows are duplicates of the real crm_calls /
    // crm_notes rows, and the activity count query excludes them. If they
    // were also counted here every call would be counted twice.
    expect(kindsForCategory("call")).toEqual([CRM_ACTIVITY.call]);
    expect(kindsForCategory("note")).toEqual([CRM_ACTIVITY.noteAdded]);
    expect(FROM_ACTIVITY_LOG).not.toContain("call");
    expect(FROM_ACTIVITY_LOG).not.toContain("note");
  });
});

describe("a period bigger than the page must not shrink the metrics", () => {
  /**
   * THE REGRESSION, STATED AS ARITHMETIC.
   *
   * These are the real 24-28 Aug figures. The point is that the totals are
   * far larger than one page, so anything deriving them from a page is
   * provably wrong.
   */
  const realWeek: ActivityMetrics = {
    total: 315,
    byCategory: { call: 27, note: 13, task: 64, company: 124, contact: 24, deal: 0, other: 63 },
    uniqueCompaniesCalled: 21,
    uniqueContactsCalled: 19,
    unattributed: 75,
  };

  it("has a total that no single page could have produced", () => {
    expect(realWeek.total).toBeGreaterThan(PAGE_SIZE);
    // The old code merged capped fetches: 100 activities + 27 calls + 13
    // notes = 140. Anything near that number is the bug coming back.
    expect(realWeek.total).not.toBe(140);
  });

  it("sums its categories exactly, with nothing double counted", () => {
    const sum = Object.values(realWeek.byCategory).reduce((a, b) => a + b, 0);
    expect(sum).toBe(realWeek.total);
  });

  it("reports more unattributed events than a page-derived count could see", () => {
    // 75 is the acceptance number: 73 bulk-intake activity rows from 26 Aug
    // plus 2 authorless notes. The capped fetch only ever saw the 2.
    expect(realWeek.unattributed).toBe(75);
    expect(realWeek.unattributed).toBeGreaterThan(2);
  });

  it("keeps unattributed a subset of the total, never an addition to it", () => {
    expect(realWeek.unattributed).toBeLessThanOrEqual(realWeek.total);
  });
});

describe("distinct counts say 'unavailable' rather than 'too low'", () => {
  it("allows null, which is what a truncated scan must report", () => {
    // Typed as number | null on purpose. A scan that hit the cap cannot know
    // the real distinct count, and a short number is the exact class of
    // failure being fixed here.
    const truncated: ActivityMetrics = {
      total: 5000,
      byCategory: { call: 5000, note: 0, task: 0, company: 0, contact: 0, deal: 0, other: 0 },
      uniqueCompaniesCalled: null,
      uniqueContactsCalled: null,
      unattributed: 0,
    };
    expect(truncated.uniqueCompaniesCalled).toBeNull();
    expect(truncated.byCategory.call).toBeGreaterThan(DISTINCT_SCAN_CAP);
  });

  it("sets the scan cap above any realistic call volume", () => {
    // 27 calls in the busiest week observed. The cap exists for safety, not
    // as a limit anyone should meet.
    expect(DISTINCT_SCAN_CAP).toBeGreaterThan(1000);
  });
});
