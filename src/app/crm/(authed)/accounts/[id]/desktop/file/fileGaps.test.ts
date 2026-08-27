import { describe, expect, it } from "vitest";
import { fileGaps } from "./fileGaps";
import { gapsForCompany } from "../../../../agent/completeness";

/** Fritz Industries as production actually holds it: an industry and an
 * address, and nothing else. 0 contacts, no carrier, no spend. */
const FRITZ = {
  id: "a0021560-e37b-4edf-b5e1-8ab269a87fbc",
  name: "Fritz Industries, Inc.",
  city: null,
  state: null,
  address: "500 N Sam Houston Rd, Entrance #3 Docks 8-11, Mesquite, Tx 75149",
  industry: "Industrial fabrication",
  contactCount: 0,
  currentCarrier: null,
  annualFreightSpend: null,
};

describe("fileGaps", () => {
  it("reports what the real Fritz record is missing", () => {
    const kinds = fileGaps(FRITZ).map((g) => g.kind);
    // Address and industry ARE on file, so neither is a gap.
    expect(kinds).toEqual(["contact", "carrier", "spend"]);
  });

  it("stays in step with the dashboard on the three shared gaps", () => {
    // The same derivation, not a second opinion — this is the property that
    // stops the company file and the dashboard disagreeing about one
    // company. Anything gapsForCompany reports must appear here.
    const bare = { ...FRITZ, address: null, industry: null };
    const shared = gapsForCompany(bare).map((g) => g.kind);
    const mine = fileGaps(bare).map((g) => g.kind);
    for (const kind of shared) expect(mine).toContain(kind);
    expect(mine.slice(0, shared.length)).toEqual(shared);
  });

  it("asks the record-hygiene gaps BEFORE the pitch-sharpening ones", () => {
    const kinds = fileGaps({ ...FRITZ, address: null, industry: null }).map((g) => g.kind);
    expect(kinds.indexOf("contact")).toBeLessThan(kinds.indexOf("carrier"));
    expect(kinds.indexOf("industry")).toBeLessThan(kinds.indexOf("spend"));
  });

  it("drops a gap the moment its column is filled", () => {
    expect(fileGaps({ ...FRITZ, currentCarrier: "Averitt" }).map((g) => g.kind)).not.toContain(
      "carrier",
    );
    expect(fileGaps({ ...FRITZ, annualFreightSpend: 250_000 }).map((g) => g.kind)).not.toContain(
      "spend",
    );
  });

  it("treats a whitespace-only carrier as missing", () => {
    expect(fileGaps({ ...FRITZ, currentCarrier: "   " }).map((g) => g.kind)).toContain("carrier");
  });

  it("treats a spend of ZERO as answered, not as missing", () => {
    // Somebody who ships nothing is a real answer and a useful one. Only
    // null means nobody has asked.
    expect(fileGaps({ ...FRITZ, annualFreightSpend: 0 }).map((g) => g.kind)).not.toContain("spend");
  });

  it("goes silent when the record is complete", () => {
    expect(
      fileGaps({ ...FRITZ, contactCount: 2, currentCarrier: "Averitt", annualFreightSpend: 1 }),
    ).toEqual([]);
  });

  it("sends only the contact gap to a real form", () => {
    const gaps = fileGaps({ ...FRITZ, address: null, industry: null });
    for (const gap of gaps) {
      expect(gap.needsForm).toBe(gap.kind === "contact");
      // Everything typeable has something to type into; the form gap does not.
      expect(gap.placeholder === null).toBe(gap.needsForm);
    }
  });

  it("gives every gap a reason, so the ask is never arbitrary", () => {
    for (const gap of fileGaps({ ...FRITZ, address: null, industry: null })) {
      expect(gap.label.trim()).toBeTruthy();
      expect(gap.why.trim()).toBeTruthy();
    }
  });

  it("never claims a gap blocks a stage — no such gate exists", () => {
    // updateLifecycleStatus refuses exactly one thing: Lost or Disqualified
    // with no reason. Chipping a gap "BLOCKS QUALIFIED" would state a rule
    // the app does not enforce.
    expect(JSON.stringify(fileGaps({ ...FRITZ, address: null }))).not.toMatch(/block/i);
  });
});
