import { describe, expect, it } from "vitest";
import { recentFirst } from "./recentFirst";

const r = (name: string, lastContactMs: number | null) => ({ name, lastContactMs });
const DAY = 86_400_000;
const NOW = 1_800_000_000_000;

describe("recentFirst", () => {
  it("puts the person you spoke to today above the one from last week", () => {
    const out = recentFirst([r("Old", NOW - 7 * DAY), r("Today", NOW)]);
    expect(out.map((x) => x.name)).toEqual(["Today", "Old"]);
  });

  it("sinks never-contacted below everything that has been contacted", () => {
    // 51 of 99 companies have never been called. Sorting them as
    // "infinitely old" would bury the four that matter.
    const out = recentFirst([r("Never", null), r("Ancient", NOW - 400 * DAY)]);
    expect(out.map((x) => x.name)).toEqual(["Ancient", "Never"]);
  });

  it("orders the never-contacted block by name so it is not arbitrary", () => {
    const out = recentFirst([r("Zeta", null), r("Alpha", null), r("Mid", null)]);
    expect(out.map((x) => x.name)).toEqual(["Alpha", "Mid", "Zeta"]);
  });

  it("breaks same-timestamp ties by name, so renders do not reshuffle", () => {
    const out = recentFirst([r("Beta", NOW), r("Alpha", NOW)]);
    expect(out.map((x) => x.name)).toEqual(["Alpha", "Beta"]);
    expect(recentFirst(out).map((x) => x.name)).toEqual(["Alpha", "Beta"]);
  });

  it("does not mutate its input", () => {
    const rows = [r("B", null), r("A", NOW)];
    recentFirst(rows);
    expect(rows.map((x) => x.name)).toEqual(["B", "A"]);
  });

  it("handles an empty list", () => {
    expect(recentFirst([])).toEqual([]);
  });
});
