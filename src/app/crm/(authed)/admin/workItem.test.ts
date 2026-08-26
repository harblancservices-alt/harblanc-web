import { describe, expect, it } from "vitest";
import { DEFAULT_QUICK_TASKS, isDuplicateQuickTask, normalizeQuickTask } from "./quickTasks";
import {
  itemHref,
  sortByLongestWaiting,
  splitEvenly,
  waitingLabel,
  waitingUrgency,
  type WorkItem,
} from "./workItem";

/**
 * Trimmed on 2026-08-26 with the module it covers. The suites for itemKey /
 * parseItemKey, itemOpenLabel, needsLabel, countBySource / matchesFilter and
 * partitionBySource went because those functions went: the assign pool draws
 * from one table now (unowned crm_accounts rows) instead of three, so there is
 * no source to namespace a key by, label, count or partition a mixed selection
 * against. What remains covers what survived.
 */

const NOW = Date.parse("2026-08-25T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function item(over: Partial<WorkItem> = {}): WorkItem {
  return {
    id: "a1",
    company: "Core And Main",
    city: "Dallas",
    state: "TX",
    needs: "Assign an owner",
    waitingSince: ago(2 * HOUR),
    ...over,
  };
}

describe("itemHref", () => {
  it("points at the company profile — every pooled item is a company now", () => {
    expect(itemHref({ id: "abc-123" })).toBe("/crm/accounts/abc-123");
  });
});

describe("quick task helpers", () => {
  it("trims, collapses whitespace and caps length", () => {
    expect(normalizeQuickTask("  Follow   up  ")).toBe("Follow up");
    expect(normalizeQuickTask("x".repeat(80))).toHaveLength(40);
  });

  it("rejects an empty or whitespace-only label", () => {
    expect(normalizeQuickTask("")).toBeNull();
    expect(normalizeQuickTask("   ")).toBeNull();
  });

  it("catches duplicates regardless of case", () => {
    expect(isDuplicateQuickTask(["Follow up"], "follow up")).toBe(true);
    expect(isDuplicateQuickTask(["Follow up"], "Follow up later")).toBe(false);
  });

  it("ships a default set with no duplicates", () => {
    const lower = DEFAULT_QUICK_TASKS.map((t) => t.toLowerCase());
    expect(new Set(lower).size).toBe(DEFAULT_QUICK_TASKS.length);
  });
});

describe("waitingLabel", () => {
  it("renders days, hours and singulars", () => {
    expect(waitingLabel(ago(9 * DAY), NOW)).toBe("9 days");
    expect(waitingLabel(ago(DAY), NOW)).toBe("1 day");
    expect(waitingLabel(ago(6 * HOUR), NOW)).toBe("6 hours");
    expect(waitingLabel(ago(HOUR), NOW)).toBe("1 hour");
  });

  it("collapses under an hour to 'just now'", () => {
    expect(waitingLabel(ago(5 * 60_000), NOW)).toBe("just now");
  });

  it("does not crash on an unparseable date", () => {
    expect(waitingLabel("not-a-date", NOW)).toBe("just now");
  });

  it("rounds down, so 47 hours is 1 day not 2", () => {
    expect(waitingLabel(ago(47 * HOUR), NOW)).toBe("1 day");
  });
});

describe("waitingUrgency", () => {
  it("escalates at a day and again at three", () => {
    expect(waitingUrgency(ago(2 * HOUR), NOW)).toBe("fresh");
    expect(waitingUrgency(ago(DAY), NOW)).toBe("warm");
    expect(waitingUrgency(ago(3 * DAY), NOW)).toBe("hot");
    expect(waitingUrgency(ago(9 * DAY), NOW)).toBe("hot");
  });
});

describe("sortByLongestWaiting", () => {
  it("puts the longest-waiting item first and does not mutate", () => {
    const input = [
      item({ id: "new", waitingSince: ago(HOUR) }),
      item({ id: "old", waitingSince: ago(9 * DAY) }),
      item({ id: "mid", waitingSince: ago(2 * DAY) }),
    ];
    const snapshot = input.map((i) => i.id);
    expect(sortByLongestWaiting(input).map((i) => i.id)).toEqual(["old", "mid", "new"]);
    expect(input.map((i) => i.id)).toEqual(snapshot);
  });

  it("sinks an unparseable date rather than floating it to the top", () => {
    const input = [
      item({ id: "bad", waitingSince: "nonsense" }),
      item({ id: "old", waitingSince: ago(5 * DAY) }),
    ];
    expect(sortByLongestWaiting(input).map((i) => i.id)).toEqual(["old", "bad"]);
  });

  it("breaks ties by company name so the order is stable", () => {
    const t = ago(DAY);
    const input = [
      item({ id: "b", company: "Zeta", waitingSince: t }),
      item({ id: "a", company: "Alpha", waitingSince: t }),
    ];
    expect(sortByLongestWaiting(input).map((i) => i.company)).toEqual(["Alpha", "Zeta"]);
  });
});

describe("splitEvenly", () => {
  it("deals round-robin, not in contiguous blocks", () => {
    const out = splitEvenly(["k1", "k2", "k3", "k4"], ["p1", "p2"]);
    expect(out).toEqual({ p1: ["k1", "k3"], p2: ["k2", "k4"] });
  });

  it("gives the remainder to the earliest people", () => {
    const out = splitEvenly(["k1", "k2", "k3", "k4", "k5"], ["p1", "p2"]);
    expect(out.p1).toHaveLength(3);
    expect(out.p2).toHaveLength(2);
  });

  it("omits a person who draws nothing", () => {
    const out = splitEvenly(["k1"], ["p1", "p2", "p3"]);
    expect(out).toEqual({ p1: ["k1"] });
    expect(out.p2).toBeUndefined();
  });

  it("returns nothing when there is no team", () => {
    expect(splitEvenly(["k1", "k2"], [])).toEqual({});
  });

  it("is deterministic", () => {
    const a = splitEvenly(["k1", "k2", "k3"], ["p1", "p2"]);
    const b = splitEvenly(["k1", "k2", "k3"], ["p1", "p2"]);
    expect(a).toEqual(b);
  });
});
