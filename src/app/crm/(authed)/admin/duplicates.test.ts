import { describe, expect, it } from "vitest";
import { findDuplicates, looksLikeSameCompany, nameKey } from "./duplicates";

describe("nameKey", () => {
  it("ignores case, punctuation and legal form", () => {
    expect(nameKey("A&R Rent-A-Fence")).toBe(nameKey("a r rentafence"));
    expect(nameKey("Vortech Contracting LLC")).toBe(nameKey("Vortech Contracting"));
    expect(nameKey("The Fence Company, Inc.")).toBe(nameKey("Fence"));
  });

  it("drops a trailing s — the real BETCO case", () => {
    expect(nameKey("BETCO Scaffolds")).toBe(nameKey("Betco Scaffold"));
  });
});

describe("looksLikeSameCompany", () => {
  it("matches the pair that prompted the feature", () => {
    expect(looksLikeSameCompany("BETCO Scaffolds", "Betco Scaffold")).toBe(true);
  });

  it("matches a second location by prefix", () => {
    expect(looksLikeSameCompany("BETCO Scaffolds", "Betco Scaffold San Antonio")).toBe(true);
  });

  it("does not match genuinely different companies", () => {
    expect(looksLikeSameCompany("Houston Hydraulic", "TLR Hydraulics")).toBe(false);
    expect(looksLikeSameCompany("Griffin Fence", "Fence Rental Company")).toBe(false);
    expect(looksLikeSameCompany("Peerless Pump Services", "Houston Pump & Gear")).toBe(false);
  });

  it("will not flag on a short key by prefix alone", () => {
    // "TNT" is 3 characters — prefix-matching it would catch anything
    // beginning "tnt". Exact equality still counts, prefix does not.
    expect(looksLikeSameCompany("TNT", "TNT Equipment")).toBe(false);
    expect(looksLikeSameCompany("TNT", "TNT")).toBe(true);
  });

  it("is not confused by an empty or punctuation-only name", () => {
    expect(looksLikeSameCompany("", "Betco Scaffold")).toBe(false);
    expect(looksLikeSameCompany("---", "Betco Scaffold")).toBe(false);
  });

  it("is symmetric", () => {
    expect(looksLikeSameCompany("Betco Scaffold San Antonio", "BETCO Scaffolds")).toBe(true);
  });
});

describe("findDuplicates", () => {
  const all = [
    { id: "1", name: "BETCO Scaffolds" },
    { id: "2", name: "Betco Scaffold" },
    { id: "3", name: "Betco Scaffold San Antonio" },
    { id: "4", name: "Houston Hydraulic" },
  ];

  it("names what a subject collides with", () => {
    const found = findDuplicates([{ id: "1", name: "BETCO Scaffolds" }], all);
    expect(found.get("1")).toEqual(["Betco Scaffold", "Betco Scaffold San Antonio"]);
  });

  it("leaves a company with no collision out of the map entirely", () => {
    const found = findDuplicates([{ id: "4", name: "Houston Hydraulic" }], all);
    expect(found.has("4")).toBe(false);
  });

  it("never matches a row against itself", () => {
    const found = findDuplicates([{ id: "4", name: "Houston Hydraulic" }], [
      { id: "4", name: "Houston Hydraulic" },
    ]);
    expect(found.size).toBe(0);
  });

  it("compares by id, so two distinct rows sharing a name still flag", () => {
    const found = findDuplicates([{ id: "a", name: "Same Name Co" }], [
      { id: "a", name: "Same Name Co" },
      { id: "b", name: "Same Name Co" },
    ]);
    expect(found.get("a")).toEqual(["Same Name Co"]);
  });
});
