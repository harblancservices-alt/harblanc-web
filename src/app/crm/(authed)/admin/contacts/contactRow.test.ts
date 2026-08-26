import { describe, it, expect } from "vitest";
import {
  countContactsByOwner,
  matchesContactOwner,
  ownerNamesOf,
  sortContactsForAdmin,
  UNLINKED,
} from "./contactRow";
import type { AdminContactRow } from "./contacts-data";

const NOW = 1_787_000_000_000;
const DAY = 86_400_000;

function c(
  name: string,
  ownerName: string | null,
  lastContactMs: number | null = NOW,
): AdminContactRow {
  return {
    id: name,
    name,
    title: null,
    email: null,
    phone: null,
    isDecisionMaker: false,
    accountId: ownerName === null ? null : "acc",
    companyName: ownerName === null ? null : "Some Co",
    companyStage: null,
    ownerName,
    lastContactMs,
  };
}

describe("matchesContactOwner", () => {
  it("matches everything under 'all'", () => {
    expect(matchesContactOwner(c("A", "Tyler"), "all")).toBe(true);
    expect(matchesContactOwner(c("B", null), "all")).toBe(true);
  });

  it("treats an owner-less company and no company alike under UNLINKED", () => {
    expect(matchesContactOwner(c("A", null), UNLINKED)).toBe(true);
    expect(matchesContactOwner(c("B", "Tyler"), UNLINKED)).toBe(false);
  });

  it("matches a named owner exactly", () => {
    expect(matchesContactOwner(c("A", "Tyler"), "Tyler")).toBe(true);
    expect(matchesContactOwner(c("A", "Tyler"), "Kartik")).toBe(false);
  });
});

describe("countContactsByOwner", () => {
  it("counts all, unlinked, and each named owner", () => {
    const rows = [c("A", "Tyler"), c("B", "Tyler"), c("C", "Kartik"), c("D", null)];
    const counts = countContactsByOwner(rows, ["Tyler", "Kartik"]);
    expect(counts).toEqual({ all: 4, [UNLINKED]: 1, Tyler: 2, Kartik: 1 });
  });

  it("gives an owner with no contacts a zero rather than omitting them", () => {
    const counts = countContactsByOwner([c("A", "Tyler")], ["Tyler", "Brent"]);
    expect(counts.Brent).toBe(0);
  });

  it("does not invent a bucket for an owner not on the roster", () => {
    const counts = countContactsByOwner([c("A", "Ghost")], ["Tyler"]);
    expect(counts.Ghost).toBeUndefined();
    expect(counts.all).toBe(1);
  });
});

describe("sortContactsForAdmin", () => {
  it("puts owner-less first, then coldest, then by name", () => {
    const rows = [
      c("Fresh", "Tyler", NOW),
      c("Cold", "Tyler", NOW - 30 * DAY),
      c("Orphan", null, NOW),
    ];
    expect(sortContactsForAdmin(rows).map((r) => r.name)).toEqual(["Orphan", "Cold", "Fresh"]);
  });

  it("sorts never-contacted as the coldest, not as a missing value", () => {
    const rows = [c("Old", "Tyler", NOW - 90 * DAY), c("Never", "Tyler", null)];
    expect(sortContactsForAdmin(rows).map((r) => r.name)).toEqual(["Never", "Old"]);
  });

  it("does not mutate its input", () => {
    const rows = [c("B", "Tyler", NOW), c("A", null, NOW)];
    sortContactsForAdmin(rows);
    expect(rows.map((r) => r.name)).toEqual(["B", "A"]);
  });
});

describe("ownerNamesOf", () => {
  it("returns the distinct owners in name order, dropping nulls", () => {
    const rows = [c("A", "Tyler"), c("B", null), c("C", "Kartik"), c("D", "Tyler")];
    expect(ownerNamesOf(rows)).toEqual(["Kartik", "Tyler"]);
  });
});
