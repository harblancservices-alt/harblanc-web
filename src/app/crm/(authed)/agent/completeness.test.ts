import { describe, it, expect } from "vitest";
import {
  countGaps,
  gapsForBook,
  gapsForCompany,
  GAP_KINDS,
  type CompletenessInput,
} from "./completeness";

function co(over: Partial<CompletenessInput> = {}): CompletenessInput {
  // A COMPLETE company by default, so each test turns exactly one thing off.
  return {
    id: "c1",
    name: "Acme Steel",
    city: "Dallas",
    state: "TX",
    address: "1 Main St",
    industry: "Fabrication",
    contactCount: 2,
    ...over,
  };
}

describe("gapsForCompany", () => {
  it("finds nothing on a complete company", () => {
    expect(gapsForCompany(co())).toEqual([]);
  });

  it("flags a company with nobody to call", () => {
    expect(gapsForCompany(co({ contactCount: 0 })).map((g) => g.kind)).toEqual(["contact"]);
  });

  it("flags a missing industry", () => {
    expect(gapsForCompany(co({ industry: null })).map((g) => g.kind)).toEqual(["industry"]);
    expect(gapsForCompany(co({ industry: "   " })).map((g) => g.kind)).toEqual(["industry"]);
  });

  it("treats city+state as a good enough address", () => {
    // No street address, but placeable — chasing a street address for a
    // prospect nobody has spoken to is noise, not work.
    expect(gapsForCompany(co({ address: null })).map((g) => g.kind)).toEqual([]);
  });

  it("flags an address only when the company cannot be placed at all", () => {
    expect(gapsForCompany(co({ address: null, city: null })).map((g) => g.kind)).toEqual([
      "address",
    ]);
    expect(gapsForCompany(co({ address: null, state: null })).map((g) => g.kind)).toEqual([
      "address",
    ]);
  });

  it("puts contact first when several things are missing", () => {
    const gaps = gapsForCompany(
      co({ contactCount: 0, industry: null, address: null, city: null }),
    );
    expect(gaps.map((g) => g.kind)).toEqual(["contact", "address", "industry"]);
  });

  it("gives each gap a stable id that cannot be mistaken for a task id", () => {
    const gaps = gapsForCompany(co({ contactCount: 0 }));
    expect(gaps[0].id).toBe("gap:contact:c1");
    // Twice in a row, same id — the surfaces key React lists on this.
    expect(gapsForCompany(co({ contactCount: 0 }))[0].id).toBe(gaps[0].id);
    expect(gaps[0].id).not.toMatch(/^[0-9a-f-]{36}$/);
  });

  it("links to the company that has the gap", () => {
    expect(gapsForCompany(co({ contactCount: 0 }))[0].href).toBe("/crm/accounts/c1#details");
  });

  it("covers every declared kind", () => {
    const all = gapsForCompany(
      co({ contactCount: 0, industry: null, address: null, city: null, state: null }),
    );
    expect(new Set(all.map((g) => g.kind))).toEqual(new Set(GAP_KINDS));
  });
});

describe("gapsForBook", () => {
  it("puts the most incomplete company first", () => {
    const rows = [
      co({ id: "one", name: "One Gap", industry: null }),
      co({ id: "three", name: "Three Gaps", contactCount: 0, industry: null, address: null, city: null }),
    ];
    expect(gapsForBook(rows).map((g) => g.companyId)).toEqual([
      "three",
      "three",
      "three",
      "one",
    ]);
  });

  it("breaks ties by name so the order is stable across renders", () => {
    const rows = [
      co({ id: "z", name: "Zebra Co", industry: null }),
      co({ id: "a", name: "Apple Co", industry: null }),
    ];
    expect(gapsForBook(rows).map((g) => g.companyId)).toEqual(["a", "z"]);
  });

  it("caps what a surface shows", () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      co({ id: `c${i}`, name: `Co ${i}`, industry: null }),
    );
    expect(gapsForBook(rows, 3)).toHaveLength(3);
  });

  it("returns nothing when the whole book is complete", () => {
    expect(gapsForBook([co(), co({ id: "c2" })])).toEqual([]);
  });
});

describe("countGaps", () => {
  it("counts past the display cap, so a surface can say 5 of N honestly", () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      co({ id: `c${i}`, name: `Co ${i}`, industry: null }),
    );
    expect(gapsForBook(rows, 3)).toHaveLength(3);
    expect(countGaps(rows)).toBe(10);
  });

  it("is zero for a complete book", () => {
    expect(countGaps([co()])).toBe(0);
  });
});
