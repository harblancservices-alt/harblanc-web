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
    // Across TWO companies, not one, since 2026-08-29: `contact` and
    // `contact_name` are two states of the same question and never fire
    // together, so no single record can produce all four. The property
    // this test exists for is unchanged — every kind in GAP_KINDS is
    // reachable, and none is declared and then never emitted.
    const bare = { industry: null, address: null, city: null, state: null };
    const nobodyOnFile = gapsForCompany(co({ ...bare, contactCount: 0 }));
    const aNumberButNoName = gapsForCompany(
      co({ ...bare, contactCount: 1, namedContactCount: 0 }),
    );

    expect(
      new Set([...nobodyOnFile, ...aNumberButNoName].map((g) => g.kind)),
    ).toEqual(new Set(GAP_KINDS));

    // And the exclusivity that forced the split, stated outright.
    expect(nobodyOnFile.map((g) => g.kind)).toContain("contact");
    expect(nobodyOnFile.map((g) => g.kind)).not.toContain("contact_name");
    expect(aNumberButNoName.map((g) => g.kind)).toContain("contact_name");
    expect(aNumberButNoName.map((g) => g.kind)).not.toContain("contact");
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

/**
 * THE NAMELESS-CONTACT TRAP.
 *
 * Solar-Link Global, 2026-08-29. Its BOL printed a phone against a blank
 * Contact line. Recording that number as a contact is right — it is the
 * only callable thing we have — but it must not make the company read as
 * staffed, or the record that most needs chasing quietly leaves the
 * dashboard for having gained a phone number.
 */
describe("a contact with a number but no name", () => {
  const SOLAR_LINK = {
    id: "b39176ac-c79f-426c-93b8-7645385fade8",
    name: "Solar-Link Global",
    city: "Nacogdoches",
    state: "TX",
    address: "1715 S University Dr, Nacogdoches, TX 75961",
    industry: "Solar EPC",
    source: "bol",
  };

  it("was a blocking 'contact' gap before the number was recorded", () => {
    const gaps = gapsForCompany({ ...SOLAR_LINK, contactCount: 0, namedContactCount: 0 });
    expect(gaps.map((g) => g.kind)).toEqual(["contact"]);
    expect(gaps[0].blocking).toBe(true);
  });

  it("STILL HAS A GAP once the nameless number is on file", () => {
    // The acceptance test. Creating the contact must not make the company
    // look finished.
    const gaps = gapsForCompany({ ...SOLAR_LINK, contactCount: 1, namedContactCount: 0 });
    expect(gaps.map((g) => g.kind)).toEqual(["contact_name"]);
  });

  it("keeps the same gap COUNT, so it holds its place on the dashboard", () => {
    const before = gapsForCompany({ ...SOLAR_LINK, contactCount: 0, namedContactCount: 0 });
    const after = gapsForCompany({ ...SOLAR_LINK, contactCount: 1, namedContactCount: 0 });
    expect(after).toHaveLength(before.length);
  });

  it("STILL ASKS when a company has a real person AND a nameless number", () => {
    /* THE MIXED CASE, closed 2026-08-31 (Brent).
     *
     * The rule used to require namedContactCount === 0, so one real
     * person was enough to silence this — and the bare number sat on the
     * panel unremarked, which is exactly what he was looking at.
     *
     * No company in the org hits this today: all three nameless contacts
     * sit alone on their companies. This is the guard for the case
     * arriving, not a fix for a live symptom. */
    const gaps = gapsForCompany({ ...SOLAR_LINK, contactCount: 2, namedContactCount: 1 });
    expect(gaps.map((g) => g.kind)).toEqual(["contact_name"]);
  });

  it("goes quiet once every contact has a name", () => {
    const gaps = gapsForCompany({ ...SOLAR_LINK, contactCount: 4, namedContactCount: 4 });
    expect(gaps.map((g) => g.kind)).not.toContain("contact_name");
  });

  it("asks the smaller question now that there is a number to dial", () => {
    const [gap] = gapsForCompany({ ...SOLAR_LINK, contactCount: 1, namedContactCount: 0 });
    expect(gap.label).toBe("Find out who answers");
    // Not blocking: you CAN start. You dial it and ask.
    expect(gap.blocking).toBe(false);
  });

  it("clears the moment somebody puts a name to the number", () => {
    // Self-healing, like every other gap — no task to close by hand.
    expect(
      gapsForCompany({ ...SOLAR_LINK, contactCount: 1, namedContactCount: 1 }),
    ).toEqual([]);
  });

  it("never reports both contact gaps at once", () => {
    for (const [total, named] of [[0, 0], [1, 0], [2, 1], [3, 3]]) {
      const kinds = gapsForCompany({
        ...SOLAR_LINK,
        contactCount: total,
        namedContactCount: named,
      }).map((g) => g.kind);
      expect(kinds.filter((k) => k === "contact" || k === "contact_name").length).toBeLessThan(2);
    }
  });

  it("DOES fire when a named contact sits alongside a nameless number", () => {
    /* REVERSED 2026-08-31, by Brent, and worth recording as a reversal
     * rather than quietly rewriting.
     *
     * This test used to assert the opposite, on the reasoning that "one
     * person identified is enough to say somebody is on file here — the
     * loose number is a stray, not a company-level gap". That was a
     * defensible call and it is no longer the one we are making.
     *
     * His words: the gap "should reflect that there are unnamed contacts
     * to resolve, not just whether any named one exists". An unnamed row
     * sitting on the panel is work somebody has to do, and the record
     * having one good person on it does not make that row go away. */
    expect(
      gapsForCompany({ ...SOLAR_LINK, contactCount: 2, namedContactCount: 1 }).map((g) => g.kind),
    ).toEqual(["contact_name"]);
  });

  it("leaves every existing caller's behaviour exactly as it was", () => {
    // namedContactCount is optional and defaults to contactCount, so a
    // caller that does not load the flag can never produce this gap.
    expect(gapsForCompany({ ...SOLAR_LINK, contactCount: 1 })).toEqual([]);
    expect(gapsForCompany({ ...SOLAR_LINK, contactCount: 0 }).map((g) => g.kind)).toEqual([
      "contact",
    ]);
  });

  it("still counts toward the book total", () => {
    expect(countGaps([{ ...SOLAR_LINK, contactCount: 1, namedContactCount: 0 }])).toBe(1);
  });

  it("appears in the book's gap list rather than dropping off it", () => {
    const rows = gapsForBook([{ ...SOLAR_LINK, contactCount: 1, namedContactCount: 0 }]);
    expect(rows.map((g) => g.kind)).toEqual(["contact_name"]);
    expect(rows[0].companyName).toBe("Solar-Link Global");
  });
});
