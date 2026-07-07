import { describe, expect, it } from "vitest";
import { parseLoadLine } from "./parse";

describe("parseLoadLine", () => {
  it("reads the canonical 'Origin  <deadhead>  Destination' line", () => {
    expect(parseLoadLine("Dallas, TX 45 Atlanta, GA")).toEqual({
      origin: "Dallas, TX",
      destination: "Atlanta, GA",
      deadhead: 45,
      confident: true,
    });
  });

  it("is robust to tabs and runs of whitespace", () => {
    expect(parseLoadLine("  Dallas,   TX\t\t45\tAtlanta,\tGA  ")).toEqual({
      origin: "Dallas, TX",
      destination: "Atlanta, GA",
      deadhead: 45,
      confident: true,
    });
  });

  it("handles multi-word cities", () => {
    const r = parseLoadLine("San Antonio, TX 120 Fort Worth, TX");
    expect(r.origin).toBe("San Antonio, TX");
    expect(r.destination).toBe("Fort Worth, TX");
    expect(r.deadhead).toBe(120);
    expect(r.confident).toBe(true);
  });

  it("upper-cases a lowercased state", () => {
    const r = parseLoadLine("dallas, tx 45 atlanta, ga");
    expect(r.origin).toBe("dallas, TX");
    expect(r.destination).toBe("atlanta, GA");
    expect(r.confident).toBe(true);
  });

  it("still reads a line with no deadhead number", () => {
    expect(parseLoadLine("Dallas, TX Atlanta, GA")).toEqual({
      origin: "Dallas, TX",
      destination: "Atlanta, GA",
      deadhead: null,
      confident: true,
    });
  });

  it("handles an arrow separator", () => {
    const r = parseLoadLine("Dallas, TX → Atlanta, GA");
    expect(r.origin).toBe("Dallas, TX");
    expect(r.destination).toBe("Atlanta, GA");
    expect(r.confident).toBe(true);
  });

  it("strips a leading 'to' connector on the destination", () => {
    const r = parseLoadLine("Dallas, TX to Atlanta, GA");
    expect(r.origin).toBe("Dallas, TX");
    expect(r.destination).toBe("Atlanta, GA");
    expect(r.confident).toBe(true);
  });

  it("flags a single-token paste as not confident", () => {
    const r = parseLoadLine("Dallas, TX");
    expect(r.confident).toBe(false);
    expect(r.origin).toBe("Dallas, TX");
    expect(r.destination).toBe("");
  });

  it("flags empty input as not confident", () => {
    expect(parseLoadLine("")).toEqual({
      origin: "",
      destination: "",
      deadhead: null,
      confident: false,
    });
  });

  it("flags a 3+ token paste as not confident but guesses ends", () => {
    const r = parseLoadLine("Dallas, TX 45 Waco, TX 90 Atlanta, GA");
    expect(r.confident).toBe(false);
    expect(r.origin).toBe("Dallas, TX");
    expect(r.destination).toBe("Atlanta, GA");
  });
});
