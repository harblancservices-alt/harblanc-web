import { describe, expect, it } from "vitest";
import { phoneKey, sharedNumbers } from "./sharedNumbers";

const p = (...numbers: string[]) => ({ phones: numbers.map((number) => ({ number })) });

describe("phoneKey", () => {
  it("treats the same number written three ways as one number", () => {
    // The live data mixes all three formats.
    expect(phoneKey("(713) 856-9696")).toBe("7138569696");
    expect(phoneKey("713-856-9696")).toBe("7138569696");
    expect(phoneKey("7138569696")).toBe("7138569696");
  });
});

describe("sharedNumbers", () => {
  it("marks the switchboard six people are all carrying", () => {
    // Metallic Products, exactly as it is in the database.
    const people = Array.from({ length: 6 }, () => p("(713) 856-9696"));
    expect([...sharedNumbers(people)]).toEqual(["7138569696"]);
  });

  it("leaves a direct line alone so it can stand out", () => {
    const people = [p("(713) 856-9696"), p("(713) 856-9696"), p("(713) 555-0142")];
    const shared = sharedNumbers(people);
    expect(shared.has(phoneKey("(713) 856-9696"))).toBe(true);
    expect(shared.has(phoneKey("(713) 555-0142"))).toBe(false);
  });

  it("catches the company line even when only one person carries it", () => {
    // Without the company's own numbers there is no way to know this is the
    // switchboard rather than that person's desk.
    const people = [p("(713) 856-9696"), p("(713) 555-0142")];
    const shared = sharedNumbers(people, [{ number: "713.856.9696" }]);
    expect(shared.has(phoneKey("7138569696"))).toBe(true);
    expect(shared.has(phoneKey("7135550142"))).toBe(false);
  });

  it("does not mark a company number nobody carries", () => {
    // Nothing on screen would be disambiguated by it.
    const shared = sharedNumbers([p("(713) 555-0142")], [{ number: "(713) 856-9696" }]);
    expect(shared.has(phoneKey("7138569696"))).toBe(false);
  });

  it("does not call one person's duplicate entry shared", () => {
    // Same number typed twice on one contact says nothing about anyone else.
    expect([...sharedNumbers([p("(713) 856-9696", "713-856-9696")])]).toEqual([]);
  });

  it("ignores blanks rather than grouping them together", () => {
    expect([...sharedNumbers([p(""), p(""), p("   ")])]).toEqual([]);
  });

  it("is empty for a company with one person", () => {
    expect([...sharedNumbers([p("(713) 856-9696")])]).toEqual([]);
  });
});
