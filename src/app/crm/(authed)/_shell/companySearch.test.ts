import { describe, expect, it } from "vitest";
import { filterCompanies, matchesCompanySearch, searchTokens } from "./companySearch";

const co = (name: string, city?: string | null, state?: string | null) => ({ name, city, state });

const BOOK = [
  co("A&R Rent-A-Fence", "Dallas", "TX"),
  co("Griffin Fence", "Houston", "TX"),
  co("Fritz Industries, Inc.", null, null),
  co("Cdh Crane Rentals", "Lafayette", "LA"),
  co("Isco - Houston (tx) - 015", null, null),
];

describe("searchTokens", () => {
  it("treats an empty or whitespace query as no query", () => {
    expect(searchTokens("")).toEqual([]);
    expect(searchTokens("   ")).toEqual([]);
  });

  it("collapses runs of whitespace", () => {
    expect(searchTokens("  houston   fence ")).toEqual(["houston", "fence"]);
  });
});

describe("matchesCompanySearch", () => {
  it("finds a company by part of its name", () => {
    expect(matchesCompanySearch(co("Griffin Fence", "Houston", "TX"), "griff")).toBe(true);
  });

  it("ignores case, which is how anybody actually types", () => {
    expect(matchesCompanySearch(co("Griffin Fence"), "GRIFFIN")).toBe(true);
  });

  it("finds a company by city", () => {
    expect(matchesCompanySearch(co("Griffin Fence", "Houston", "TX"), "houston")).toBe(true);
  });

  it("finds a company by state", () => {
    expect(matchesCompanySearch(co("Cdh Crane Rentals", "Lafayette", "LA"), "la")).toBe(true);
  });

  it("requires EVERY token to match, so a second word narrows", () => {
    const griffin = co("Griffin Fence", "Houston", "TX");
    const arFence = co("A&R Rent-A-Fence", "Dallas", "TX");
    expect(matchesCompanySearch(griffin, "houston fence")).toBe(true);
    // Same trade, wrong city — a second word that did not narrow would make
    // typing more words useless.
    expect(matchesCompanySearch(arFence, "houston fence")).toBe(false);
  });

  it("does not let a token straddle two fields", () => {
    // name ends "Fence", city starts "Houston" — "fencehouston" is not a
    // real value and must not match just because the fields are adjacent.
    expect(matchesCompanySearch(co("Griffin Fence", "Houston", "TX"), "fencehouston")).toBe(false);
  });

  it("matches a company with no city or state on its name alone", () => {
    expect(matchesCompanySearch(co("Fritz Industries, Inc.", null, null), "fritz")).toBe(true);
    expect(matchesCompanySearch(co("Fritz Industries, Inc.", null, null), "houston")).toBe(false);
  });

  it("matches everything when the query is empty", () => {
    for (const c of BOOK) expect(matchesCompanySearch(c, "")).toBe(true);
  });
});

describe("filterCompanies", () => {
  it("returns the list untouched for an empty query", () => {
    expect(filterCompanies(BOOK, "  ")).toBe(BOOK);
  });

  it("keeps the order it was given", () => {
    // The caller has already sorted — unowned first, or by name. Search must
    // narrow, never reorder.
    const out = filterCompanies(BOOK, "tx");
    expect(out.map((c) => c.name)).toEqual([
      "A&R Rent-A-Fence",
      "Griffin Fence",
      "Isco - Houston (tx) - 015",
    ]);
  });

  it("finds the Houston companies a broker would ask for", () => {
    expect(filterCompanies(BOOK, "houston").map((c) => c.name)).toEqual([
      "Griffin Fence",
      "Isco - Houston (tx) - 015",
    ]);
  });

  it("returns nothing rather than everything when there is no match", () => {
    expect(filterCompanies(BOOK, "zzzz")).toEqual([]);
  });
});
