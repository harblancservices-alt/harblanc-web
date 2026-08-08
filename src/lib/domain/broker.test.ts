import { describe, expect, it } from "vitest";
import { normalizeBrokerName, findBrokerByNormalizedName } from "./broker";

describe("normalizeBrokerName", () => {
  it("unifies punctuated and unpunctuated initials", () => {
    expect(normalizeBrokerName("C.H. Robinson")).toBe(normalizeBrokerName("CH Robinson"));
    expect(normalizeBrokerName("C.H. Robinson")).toBe("ch robinson");
  });

  it("strips common legal-entity suffixes", () => {
    expect(normalizeBrokerName("Acme, Inc.")).toBe(normalizeBrokerName("Acme Inc"));
    expect(normalizeBrokerName("Acme LLC")).toBe("acme");
    expect(normalizeBrokerName("Total Quality Logistics, LLC")).toBe("total quality logistics");
  });

  it("is case-insensitive", () => {
    expect(normalizeBrokerName("ACME TRUCKING")).toBe(normalizeBrokerName("acme trucking"));
  });

  it("collapses stray punctuation like hyphens without merging real words", () => {
    expect(normalizeBrokerName("J-B Hunt")).toBe(normalizeBrokerName("JB Hunt"));
    expect(normalizeBrokerName("A & B Trucking")).toBe("a b trucking");
  });

  it("doesn't strip a suffix word if it's the entire name", () => {
    expect(normalizeBrokerName("Co")).toBe("co");
    expect(normalizeBrokerName("Inc")).toBe("inc");
  });

  it("collapses internal whitespace", () => {
    expect(normalizeBrokerName("Acme   Trucking")).toBe("acme trucking");
  });

  it("returns empty string for blank/all-punctuation input", () => {
    expect(normalizeBrokerName("   ")).toBe("");
    expect(normalizeBrokerName("...")).toBe("");
  });
});

describe("findBrokerByNormalizedName", () => {
  const candidates = [
    { id: "1", name: "C.H. Robinson" },
    { id: "2", name: "Total Quality Logistics" },
  ];

  it("matches across punctuation/suffix differences", () => {
    expect(findBrokerByNormalizedName(candidates, "CH Robinson")?.id).toBe("1");
    expect(findBrokerByNormalizedName(candidates, "Total Quality Logistics LLC")?.id).toBe("2");
  });

  it("returns undefined when nothing matches", () => {
    expect(findBrokerByNormalizedName(candidates, "Landstar")).toBeUndefined();
  });

  it("returns undefined for a blank target name rather than matching everything", () => {
    expect(findBrokerByNormalizedName(candidates, "   ")).toBeUndefined();
  });
});
