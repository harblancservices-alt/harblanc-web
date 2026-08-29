import { describe, expect, it } from "vitest";
import { findNoteViolations, noteIsClean } from "./notePolicy";

/**
 * THE REGRESSION CORPUS. Every string below was really written into a
 * company, contact or BOL-entry note on 2026-08-28/29 and really had to be
 * taken out again. If the check ever stops catching one of these, the rule
 * has quietly stopped working.
 */
describe("the notes that broke the rule", () => {
  it("catches our own name as the carrier — the line Brent quoted", () => {
    const v = findNoteViolations("Carrier was us - Harblanc Service LLC, DOT# 3918509, SCAC UJ63.");
    expect(v.map((x) => x.kind)).toContain("our-company");
  });

  it("catches our name buried mid-sentence in a legacy note", () => {
    expect(
      noteIsClean("BOL names Avenger Logistics as carrier but Harblanc Services (MC 1467901) hauled it."),
    ).toBe(false);
  });

  it("catches an agent named in a contact note", () => {
    const v = findNoteViolations(
      "Replace with the shipping/dock contact from the Houston pickup — Brent picked up water-purifying equipment here.",
    );
    expect(v.map((x) => x.kind)).toContain("agent-name");
  });

  it("catches an internal rule stated as if it were about the company", () => {
    const v = findNoteViolations(
      "Bill-to is PLS Logistics Services, a BROKER: read and shown here for context, not created as a company.",
    );
    expect(v.map((x) => x.kind)).toContain("internal-process");
  });

  it("catches 'our lane', which names us without naming us", () => {
    expect(noteIsClean("Heat exchangers are heavy and time-sensitive. Exactly our lane.")).toBe(false);
  });

  it("catches a decision about how we recorded the row", () => {
    expect(
      noteIsClean("Recorded as references; bol_number left null rather than promoting one of them."),
    ).toBe(false);
    expect(noteIsClean("NOT FOUND — and deliberately left blank:")).toBe(false);
  });

  it("catches our internal capture id", () => {
    const v = findNoteViolations("FROM SNAPSHOT #4 - Darr Equipment bill of lading dated 27 Nov 2023.");
    expect(v.map((x) => x.kind)).toContain("internal-id");
    expect(noteIsClean("Named on BOL FZMK1424474 (Snapshot #6) as the SHIPPER CONTACT.")).toBe(false);
  });

  it("catches our call activity", () => {
    expect(noteIsClean("Neither number has been dialled.")).toBe(false);
    expect(noteIsClean("Nobody has been reached here and no name is published anywhere.")).toBe(false);
    expect(noteIsClean("The BOL itself carries no phone, so this number has not been called.")).toBe(false);
  });
});

/**
 * The other half, and the more important one: the rule must not eat the
 * content the notes exist for. Every string below is from a note as it
 * stands now, after the rewrite.
 */
describe("what a good note is still allowed to say", () => {
  it("allows provenance, which is how an agent judges a number", () => {
    expect(noteIsClean("(832) 286-4826 is what the BOL printed for this ship-from location.")).toBe(true);
    expect(
      noteIsClean("281-602-4100 is carried on trade listings for this address. Directory-sourced only, NOT confirmed."),
    ).toBe(true);
    expect(noteIsClean("FROM THEIR OWN SITE (wcrhx.com): Founded 1980. Worldwide service network.")).toBe(true);
  });

  it("allows the data-confidence wording that replaced the activity log", () => {
    expect(noteIsClean("Both kept, both unverified. Try the 936 first.")).toBe(true);
    expect(noteIsClean("Not yet verified.")).toBe(true);
  });

  it("allows a conflict spelled out in full", () => {
    expect(
      noteIsClean(
        "The BOL prints jdally@sunriseplastics.com but the website is sunriseplastic.com, WITHOUT the s. One of the two is wrong.",
      ),
    ).toBe(true);
  });

  it("allows the commercial read", () => {
    expect(
      noteIsClean(
        "A polymer recovery business since 1988. Published services include vacuum truck and hopper truck. They move resin. Worth a call about the resin, not the forklift.",
      ),
    ).toBe(true);
  });

  it("allows naming a broker or another carrier on the document", () => {
    // Third parties on the paperwork are facts about the load. Only OUR
    // name is barred.
    expect(noteIsClean("Bill-to is FitzMark, Inc (866-944-8717) - a broker, shown for context.")).toBe(true);
    expect(noteIsClean("BOL names Avenger Logistics as carrier.")).toBe(true);
  });

  it("allows a real document reference as provenance", () => {
    expect(noteIsClean("FROM BOL FZMK1424474, picked up 21 Nov 2023. Photographed 2026-08-28.")).toBe(true);
  });

  it("passes every rewritten note shape", () => {
    expect(noteIsClean(null)).toBe(true);
    expect(noteIsClean("")).toBe(true);
    expect(noteIsClean("   ")).toBe(true);
  });
});

describe("findNoteViolations reports enough to act on", () => {
  it("names the offending text and what to do instead", () => {
    const [v] = findNoteViolations("Carrier was us - Harblanc Services LLC.");
    expect(v.match.toLowerCase()).toBe("harblanc");
    expect(v.guidance.length).toBeGreaterThan(20);
  });

  it("reports every rule a note breaks, not just the first", () => {
    const v = findNoteViolations(
      "FROM SNAPSHOT #2. Carrier was us - Harblanc. Not created as a company. Has not been called.",
    );
    expect(new Set(v.map((x) => x.kind))).toEqual(
      new Set(["our-company", "internal-process", "internal-id", "activity-log"]),
    );
  });

  it("flags a customer contact who shares an agent's first name, rather than silently allowing it", () => {
    // A known false positive, and the right way round: a warning to look at
    // beats letting a real agent name through.
    expect(noteIsClean("Spoke to Tyler Brooks in their receiving office.")).toBe(false);
  });
});
