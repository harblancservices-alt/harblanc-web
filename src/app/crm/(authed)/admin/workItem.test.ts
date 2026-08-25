import { describe, expect, it } from "vitest";
import {
  countBySource,
  itemKey,
  matchesFilter,
  needsLabel,
  parseItemKey,
  partitionBySource,
  sortByLongestWaiting,
  splitEvenly,
  waitingLabel,
  waitingUrgency,
  type WorkItem,
} from "./workItem";

const NOW = Date.parse("2026-08-25T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function item(over: Partial<WorkItem> = {}): WorkItem {
  return {
    id: "a1",
    source: "prospect",
    company: "Core And Main",
    city: "Dallas",
    state: "TX",
    needs: "Claim and start research",
    waitingSince: ago(2 * HOUR),
    ownable: true,
    ...over,
  };
}

describe("itemKey / parseItemKey", () => {
  it("namespaces an id by its source and round-trips", () => {
    const k = itemKey({ source: "otr", id: "abc-123" });
    expect(k).toBe("otr:abc-123");
    expect(parseItemKey(k)).toEqual({ source: "otr", id: "abc-123" });
  });

  it("survives a uuid containing no colon and keeps the full id", () => {
    const id = "f267e2a5-767a-4478-a34d-0622d9442172";
    expect(parseItemKey(itemKey({ source: "bol", id })).id).toBe(id);
  });
});

describe("needsLabel", () => {
  it("speaks plainly per source", () => {
    expect(needsLabel("prospect")).toBe("Claim and start research");
    expect(needsLabel("otr")).toBe("Research, then release");
  });

  it("counts the unmatched parties on a BOL entry", () => {
    expect(needsLabel("bol", { unmatched: 2, named: 3 })).toBe("Match 2 of 3 companies");
  });

  it("falls back when a BOL entry names nobody", () => {
    expect(needsLabel("bol", { unmatched: 0, named: 0 })).toBe("Match its companies");
    expect(needsLabel("bol")).toBe("Match its companies");
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

describe("countBySource / matchesFilter", () => {
  const items = [
    item({ id: "1", source: "prospect" }),
    item({ id: "2", source: "prospect" }),
    item({ id: "3", source: "otr" }),
    item({ id: "4", source: "bol" }),
  ];

  it("counts every source plus the total", () => {
    expect(countBySource(items)).toEqual({ all: 4, prospect: 2, otr: 1, bol: 1 });
  });

  it("reports zero for a source with no items", () => {
    expect(countBySource([item({ source: "prospect" })])).toEqual({ all: 1, prospect: 1, otr: 0, bol: 0 });
  });

  it("filters by source, and 'all' keeps everything", () => {
    expect(items.filter((i) => matchesFilter(i, "otr")).map((i) => i.id)).toEqual(["3"]);
    expect(items.filter((i) => matchesFilter(i, "all"))).toHaveLength(4);
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

describe("partitionBySource", () => {
  const items = [
    item({ id: "p1", source: "prospect", ownable: true }),
    item({ id: "o1", source: "otr", ownable: false }),
    item({ id: "b1", source: "bol", ownable: false }),
  ];

  it("splits a mixed selection into what can own and what cannot", () => {
    const keys = new Set(items.map(itemKey));
    const { selected, ownable, taskOnly } = partitionBySource(items, keys);
    expect(selected).toHaveLength(3);
    expect(ownable.map((i) => i.id)).toEqual(["p1"]);
    expect(taskOnly.map((i) => i.id)).toEqual(["o1", "b1"]);
  });

  it("ignores keys that match nothing in the list", () => {
    const { selected } = partitionBySource(items, new Set(["prospect:ghost"]));
    expect(selected).toEqual([]);
  });
});
