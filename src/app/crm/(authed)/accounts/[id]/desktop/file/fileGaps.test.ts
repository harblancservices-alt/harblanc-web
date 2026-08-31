import { describe, expect, it } from "vitest";
import { fileGaps } from "./fileGaps";
import { gapsForCompany } from "../../../../agent/completeness";

/** Fritz Industries as production actually holds it: an industry and an
 * address, and nothing else. 0 contacts, no carrier, no phone, no site. */
const FRITZ = {
  id: "a0021560-e37b-4edf-b5e1-8ab269a87fbc",
  name: "Fritz Industries, Inc.",
  city: null,
  state: null,
  address: "500 N Sam Houston Rd, Entrance #3 Docks 8-11, Mesquite, Tx 75149",
  industry: "Industrial fabrication",
  contactCount: 0,
  currentCarrier: null,
  phone: null,
  website: null,
};

describe("fileGaps", () => {
  it("reports what the real Fritz record is missing", () => {
    const kinds = fileGaps(FRITZ).map((g) => g.kind);
    // Address and industry ARE on file, so neither is a gap. Spend is no
    // longer asked for at all (2026-08-31); phone and website replaced it.
    expect(kinds).toEqual(["contact", "phone", "website", "carrier"]);
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
    expect(kinds.indexOf("industry")).toBeLessThan(kinds.indexOf("carrier"));
  });

  it("drops a gap the moment its column is filled", () => {
    expect(fileGaps({ ...FRITZ, currentCarrier: "Averitt" }).map((g) => g.kind)).not.toContain(
      "carrier",
    );
    expect(fileGaps({ ...FRITZ, phone: "(806) 283-9220" }).map((g) => g.kind)).not.toContain(
      "phone",
    );
    expect(fileGaps({ ...FRITZ, website: "x.com" }).map((g) => g.kind)).not.toContain("website");
  });

  it("treats a whitespace-only carrier as missing", () => {
    expect(fileGaps({ ...FRITZ, currentCarrier: "   " }).map((g) => g.kind)).toContain("carrier");
  });

  it("no longer asks for freight spend at all", () => {
    // Dropped 2026-08-31 (Brent). 0 of 103 companies ever had it filled —
    // people do not tell a stranger their budget — and a chip nobody can
    // clear trains an agent to ignore the chips that do work.
    const kinds = fileGaps({ ...FRITZ, contactCount: 0, address: null, industry: null }).map(
      (g) => g.kind,
    );
    expect(kinds).not.toContain("spend");
  });

  it("treats a whitespace-only phone or website as missing", () => {
    expect(fileGaps({ ...FRITZ, phone: "  " }).map((g) => g.kind)).toContain("phone");
    expect(fileGaps({ ...FRITZ, website: "  " }).map((g) => g.kind)).toContain("website");
  });

  it("goes silent when the record is complete", () => {
    expect(
      fileGaps({
        ...FRITZ,
        contactCount: 2,
        currentCarrier: "Averitt",
        phone: "(806) 283-9220",
        website: "x.com",
      }),
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
    //
    // Checks the strings a REP READS, not the whole serialised object. The
    // object now carries a `blocking` flag — that is an internal ordering
    // and colour signal, and the distinction is the entire point of this
    // test: a boolean the layout reads is fine, a sentence promising the
    // app will stop you is not.
    for (const gap of fileGaps({ ...FRITZ, address: null, industry: null })) {
      expect(gap.label).not.toMatch(/block/i);
      expect(gap.why).not.toMatch(/block/i);
      expect(gap.placeholder ?? "").not.toMatch(/block/i);
    }
  });

  it("marks the blocking gap without inventing a second opinion about which", () => {
    // `blocking` is read straight off completeness.ts's GAP_BLOCKS_WORK.
    // If these drift, the dashboard and the company file disagree about
    // which gap is the one that stops you.
    const gaps = fileGaps({ ...FRITZ, address: null, industry: null });
    const blocking = gaps.filter((g) => g.blocking).map((g) => g.kind);
    expect(blocking).toEqual(["contact"]);
  });

  it("sorts the blocking gap first, whatever order it was built in", () => {
    const gaps = fileGaps({ ...FRITZ, address: null, industry: null });
    expect(gaps[0].kind).toBe("contact");
  });

  it("never marks the file-only gaps as blocking — they sharpen a pitch", () => {
    const gaps = fileGaps({ ...FRITZ, currentCarrier: null, phone: null, website: null });
    for (const g of gaps) {
      if (g.kind === "carrier" || g.kind === "phone" || g.kind === "website") {
        expect(g.blocking).toBe(false);
      }
    }
  });

  it("explains every gap in words somebody in their first week can act on", () => {
    // The bar Brent set: this screen is used at 9pm by a new hire with
    // nobody to ask. "not categorised" told her nothing.
    const gaps = fileGaps({ ...FRITZ, contactCount: 0, address: null, industry: null });
    expect(gaps.length).toBeGreaterThan(0);
    for (const g of gaps) {
      expect(g.why.length).toBeGreaterThan(24);
      expect(g.why).not.toMatch(/^not categorised$/);
    }
  });
});
