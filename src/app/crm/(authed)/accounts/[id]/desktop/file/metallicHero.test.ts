import { describe, it, expect } from "vitest";
import { pickHero, type CallPerson } from "./WhoDoICall";

/**
 * METALLIC PRODUCTS CORPORATION leads with MIKE BISCHOF.
 *
 * Brent, 2026-08-28. The panel was leading with Travis Wendt: Metallic's
 * crm_accounts.primary_contact_id was NULL, so pickHero fell through rule 1
 * and landed on the first decision maker with a number. Travis is Owner &
 * President, which the rule can't know is the wrong person to ring about a
 * load -- Mike is the Purchasing Manager, and purchasing is who books freight.
 *
 * The fix was DATA, not logic: the flag rule 1 already reads is now set on
 * Mike in production. This test pins that the rule honours it, and -- via the
 * `withoutFlag` case -- reproduces the old behaviour so the reason the flag
 * is needed stays visible. Nobody should later "tidy up" that null.
 *
 * The roster below is Metallic's real one, shape-for-shape.
 */

const defaults = {} as CallPerson["defaults"];

function person(p: Partial<CallPerson> & { id: string; name: string }): CallPerson {
  return {
    nameUnknown: false,
    title: null,
    email: null,
    phones: [],
    isPrimary: false,
    lastContactLabel: "never called",
    defaults,
    role: null,
    isDecisionMaker: false,
    bestTimeToCall: null,
    ...p,
  };
}

// Every contact at Metallic shares the company switchboard.
const MAIN = [{ label: "Main", number: "(713) 856-9696" }];

const ROSTER: CallPerson[] = [
  person({ id: "henry", name: "Henry Angles", title: "National Sales Manager" }),
  person({ id: "kurt", name: "Kurt", phones: MAIN }),
  person({ id: "travis", name: "Travis Wendt", title: "Owner & President", isDecisionMaker: true, phones: MAIN }),
  person({ id: "samuel", name: "Samuel Gray", title: "VP Operations", isDecisionMaker: true }),
  person({ id: "mike", name: "Mike Bischof", title: "Purchasing Manager", isDecisionMaker: true, phones: MAIN, email: "mikeb@mpvent.com" }),
  person({ id: "stephen", name: "Stephen Mireles", title: "Manager, Purchasing" }),
];

describe("Who do I call — Metallic", () => {
  it("led with Travis while no hero was flagged (the reported bug)", () => {
    expect(pickHero(ROSTER)?.name).toBe("Travis Wendt");
  });

  it("leads with Mike once he carries the flag", () => {
    const flagged = ROSTER.map((p) => ({ ...p, isPrimary: p.id === "mike" }));
    expect(pickHero(flagged)?.name).toBe("Mike Bischof");
  });

  it("puts the flag ABOVE the owner, not merely ahead of non-decision-makers", () => {
    // The point of rule 1: a human's choice outranks every derived signal,
    // including a more senior title that is also a decision maker with a
    // number. If this ever inverts, Metallic silently reverts to Travis.
    const flagged = ROSTER.map((p) => ({ ...p, isPrimary: p.id === "mike" }));
    const hero = pickHero(flagged)!;
    const travis = flagged.find((p) => p.id === "travis")!;
    expect(travis.isDecisionMaker && travis.phones.length > 0).toBe(true);
    expect(hero.id).not.toBe(travis.id);
  });

  it("keeps the rest of the roster intact behind the hero", () => {
    const flagged = ROSTER.map((p) => ({ ...p, isPrimary: p.id === "mike" }));
    const hero = pickHero(flagged)!;
    const rest = flagged.filter((p) => p.id !== hero.id);
    expect(rest).toHaveLength(5);
    expect(rest.map((p) => p.name)).toContain("Travis Wendt");
  });
});
