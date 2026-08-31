import { describe, expect, it } from "vitest";
import {
  researchGuesses,
  siblingIndustry,
  nameStem,
  fitScoreFrom,
  descriptionWithoutFit,
  type GuessInput,
} from "./researchGuesses";
import { lookupsFor } from "./lookups";

/** A company with nothing on it. Each test turns on only what it is about. */
function company(over: Partial<GuessInput> = {}): GuessInput {
  return {
    id: "a1",
    name: "Test Co",
    industry: null,
    phone: null,
    website: null,
    contextNotes: null,
    contacts: [],
    siblings: [],
    marks: {},
    ...over,
  };
}

describe("nothing is offered without evidence", () => {
  it("offers nothing for a company with nothing on it", () => {
    expect(researchGuesses(company())).toEqual([]);
  });

  it("never guesses a website from the company name", () => {
    // The failures are silent and land somebody on a competitor's site.
    const g = researchGuesses(company({ name: "Core And Main Ww Lubbock" }));
    expect(g.find((x) => x.field === "website")).toBeUndefined();
  });

  it("does not invent a person from a bare team address", () => {
    // "sales@" names nobody. Offering it as a contact would create a
    // person called Sales who nobody can ask for.
    const g = researchGuesses(
      company({ contextNotes: "Belt conveyor sections. sales@rangerconveying.com." }),
    );
    expect(g.find((x) => x.field === "contact")).toBeUndefined();
  });
});

describe("a field that already has a value is left alone", () => {
  it("does not offer an industry when one is set", () => {
    const g = researchGuesses(
      company({
        name: "Core And Main Ww Lubbock",
        industry: "Waterworks",
        siblings: [{ id: "b", name: "Core And Main Ww Waco", industry: "Waterworks" }],
      }),
    );
    expect(g).toEqual([]);
  });

  it("does not offer a phone when the company has one", () => {
    const g = researchGuesses(
      company({ phone: "(806) 555-0000", contacts: [{ name: "A", phone: "(806) 283-9220", email: null }] }),
    );
    expect(g.find((x) => x.field === "phone")).toBeUndefined();
  });
});

describe("a dismissed guess is never offered again", () => {
  it("drops a field a person said no to", () => {
    const base = company({
      contacts: [{ name: "Alan Pribble", phone: "(806) 283-9220", email: null }],
    });
    expect(researchGuesses(base).map((g) => g.field)).toContain("phone");
    expect(
      researchGuesses({ ...base, marks: { phone: "dismissed" } }).map((g) => g.field),
    ).not.toContain("phone");
  });

  it("also drops one already accepted, so it cannot be offered twice", () => {
    const base = company({
      contacts: [{ name: "Alan Pribble", phone: "(806) 283-9220", email: null }],
    });
    expect(
      researchGuesses({ ...base, marks: { phone: "accepted" } }).map((g) => g.field),
    ).not.toContain("phone");
  });
});

describe("sibling branches", () => {
  it("takes the industry ten Core & Main branches agree on", () => {
    // Real: 10 branches in the org, 2 with an industry recorded.
    const g = siblingIndustry("Core And Main Ww Lubbock", [
      { name: "Core And Main Ww Waco", industry: "Waterworks distribution" },
      { name: "Core And Main Ww Weatherford", industry: "Waterworks distribution" },
      { name: "Advantage Steel Service", industry: "Steel" },
    ]);
    expect(g).toEqual({ value: "Waterworks distribution", count: 2 });
  });

  it("says nothing when the siblings disagree", () => {
    // Two branches recorded differently means they are not one business,
    // and picking a side would write a confident wrong answer.
    expect(
      siblingIndustry("Ws Building Houston", [
        { name: "Ws Building Dallas", industry: "Roofing supply" },
        { name: "Ws Building Okc", industry: "Steel buildings" },
      ]),
    ).toBeNull();
  });

  it("needs a two-word stem, so a one-word name never forms a family", () => {
    expect(nameStem("Metalform")).toBe("metalform");
    expect(siblingIndustry("Metalform", [{ name: "Metalform Two", industry: "X" }])).toBeNull();
  });

  it("ignores punctuation and case when matching a family", () => {
    expect(nameStem("Ranger Conveying & Supply")).toBe("ranger conveying");
    expect(nameStem("RANGER CONVEYING")).toBe("ranger conveying");
  });

  it("reports the count so the offer can say how many agree", () => {
    const g = researchGuesses(
      company({
        name: "Core And Main Ww Lubbock",
        siblings: [
          { id: "1", name: "Core And Main Ww Waco", industry: "Waterworks distribution" },
          { id: "2", name: "Core And Main Ww Belton", industry: "Waterworks distribution" },
        ],
      }),
    );
    expect(g[0].basis).toContain("2 other branches");
  });
});

describe("reading the description back", () => {
  // The real Contractors Access Equipment row, verbatim.
  const CAE =
    "[Fit 8/10] HQ 3005 Roy Orr Blvd, Grand Prairie (972) 857-3310. " +
    "David Chamberlain, dchamberlain@contractorsaccess.com. 12 locations; " +
    "TX: DFW, Houston, San Antonio, Austin. One account, not two.";

  it("finds the person, the phone and the domain in one real description", () => {
    const g = researchGuesses(company({ name: "Contractors Access Equipment", contextNotes: CAE }));
    const by = Object.fromEntries(g.map((x) => [x.field, x]));

    expect(by.contact.value).toBe("David Chamberlain");
    expect(by.contact.email).toBe("dchamberlain@contractorsaccess.com");
    expect(by.phone.value).toBe("(972) 857-3310");
    expect(by.website.value).toBe("contractorsaccess.com");
  });

  it("carries a basis on every guess, so nothing reads as verified fact", () => {
    const g = researchGuesses(company({ contextNotes: CAE }));
    expect(g.length).toBeGreaterThan(0);
    for (const guess of g) expect(guess.basis.trim().length).toBeGreaterThan(0);
  });

  it("reads the dashed phone shape too", () => {
    const g = researchGuesses(company({ contextNotes: "direct line is 817-636-3350" }));
    expect(g.find((x) => x.field === "phone")?.value).toBe("(817) 636-3350");
  });

  it("prefers a contact's own number over one in the prose", () => {
    const g = researchGuesses(
      company({
        contextNotes: "main switchboard (972) 857-3310",
        contacts: [{ name: "Alan Pribble", phone: "(806) 283-9220", email: null }],
      }),
    );
    expect(g.find((x) => x.field === "phone")?.value).toBe("(806) 283-9220");
  });

  it("does not offer a person when the company already has one", () => {
    const g = researchGuesses(
      company({ contextNotes: CAE, contacts: [{ name: "Someone", phone: null, email: null }] }),
    );
    expect(g.find((x) => x.field === "contact")).toBeUndefined();
  });

  it("ignores a mailbox provider when guessing the website", () => {
    const g = researchGuesses(
      company({ contacts: [{ name: "A", phone: null, email: "someguy@gmail.com" }] }),
    );
    expect(g.find((x) => x.field === "website")).toBeUndefined();
  });
});

describe("the fit score", () => {
  it("reads the score 38 companies already have written down", () => {
    expect(fitScoreFrom("[Fit 9/10] Lafayette LA")).toBe(9);
    expect(fitScoreFrom("no score here")).toBeNull();
    expect(fitScoreFrom(null)).toBeNull();
  });

  it("strips the marker from the prose, so the number is not shown twice", () => {
    expect(descriptionWithoutFit("[Fit 8/10] HQ Grand Prairie")).toBe("HQ Grand Prairie");
  });

  it("is never offered as a write — it is display only", () => {
    const g = researchGuesses(company({ contextNotes: "[Fit 9/10] Something" }));
    expect(g.map((x) => x.field)).not.toContain("fit");
  });
});

describe("the lookups", () => {
  const co = { name: "Core And Main Ww Lubbock", city: "Lubbock", state: "TX", website: null };

  it("carries the company name and city, quoted as a phrase", () => {
    const google = lookupsFor(co).find((l) => l.key === "google")!;
    expect(decodeURIComponent(google.href)).toContain('"Core And Main Ww Lubbock" Lubbock TX');
  });

  it("offers the state's own registry, and nothing when we have no entry", () => {
    expect(lookupsFor(co).some((l) => l.key === "registry")).toBe(true);
    expect(lookupsFor({ ...co, state: "ZZ" }).some((l) => l.key === "registry")).toBe(false);
  });

  it("only offers their website when we actually have one", () => {
    expect(lookupsFor(co).some((l) => l.key === "site")).toBe(false);
    const withSite = lookupsFor({ ...co, website: "coreandmain.com" });
    expect(withSite.find((l) => l.key === "site")!.href).toBe("https://coreandmain.com");
  });

  it("does not double up a scheme the stored value already has", () => {
    const l = lookupsFor({ ...co, website: "https://x.com" }).find((s) => s.key === "site")!;
    expect(l.href).toBe("https://x.com");
  });

  it("explains what each one is FOR, not just what it is", () => {
    // The hint is the part that teaches somebody who started today.
    for (const l of lookupsFor(co)) expect(l.hint.length).toBeGreaterThan(10);
    expect(lookupsFor(co).find((l) => l.key === "fmcsa")!.hint).toMatch(/own trucks/i);
  });
});

/**
 * THE THREE REAL RECORDS the mockup was drawn on, as production actually
 * holds them. These are the regression guard for "does this do anything
 * useful on Brent's own book", and one of them already caught the design
 * being optimistic.
 */
describe("the real records", () => {
  it("offers Core And Main Ww Lubbock its branch manager's number, and nothing else", () => {
    const g = researchGuesses(
      company({
        name: "Core And Main Ww Lubbock",
        contacts: [{ name: "Alan Pribble", phone: "(806) 283-9220", email: null }],
        // The ten real branches. Only two carry an industry.
        siblings: [
          { id: "1", name: "Core And Main Ww Waco", industry: "water works" },
          { id: "2", name: "Core And Main Ww Austin", industry: "Construction" },
          { id: "3", name: "Core And Main Ww Belton", industry: null },
          { id: "4", name: "Core And Main Ww Odessa", industry: null },
        ],
      }),
    );
    expect(g.map((x) => x.field)).toEqual(["phone"]);
    expect(g[0].value).toBe("(806) 283-9220");
    expect(g[0].basis).toContain("Alan Pribble");
  });

  it("REFUSES the industry the mockup promised, because the branches disagree", () => {
    // The mockup showed "9 other Core And Main branches are recorded as
    // Waterworks distribution". In production the only two that carry an
    // industry say "water works" and "Construction" — so there is no
    // agreed answer and the panel must stay quiet rather than pick one.
    // If somebody tidies those two columns to match, this offer appears
    // on its own; that is the right order of events.
    expect(
      siblingIndustry("Core And Main Ww Lubbock", [
        { name: "Core And Main Ww Waco", industry: "water works" },
        { name: "Core And Main Ww Austin", industry: "Construction" },
      ]),
    ).toBeNull();
  });

  it("fills Contractors Access Equipment from its own description alone", () => {
    // Real: industry set, ZERO contacts, no phone, no website — and all
    // three of those sitting in the description.
    const g = researchGuesses(
      company({
        name: "Contractors Access Equipment",
        industry: "Access equipment rental",
        contextNotes:
          "[Fit 8/10] HQ 3005 Roy Orr Blvd, Grand Prairie (972) 857-3310. " +
          "David Chamberlain, dchamberlain@contractorsaccess.com. 12 locations.",
      }),
    );
    expect(g.map((x) => x.field).sort()).toEqual(["contact", "phone", "website"]);
  });

  it("offers Advantage Steel Service nothing — it is already answered", () => {
    // Real: address, phone, website and two named contacts on file.
    const g = researchGuesses(
      company({
        name: "Advantage Steel Service",
        phone: "(817) 284-9800",
        website: "advantagesteelservice.com",
        contextNotes: "Coworker-sourced (Discord), web-verified 2026-08-21.",
        contacts: [
          { name: "Pat Birdwell", phone: "(817) 284-1693", email: null },
          { name: "Tom Church", phone: "(817) 589-0088", email: null },
        ],
      }),
    );
    expect(g).toEqual([]);
  });
});

