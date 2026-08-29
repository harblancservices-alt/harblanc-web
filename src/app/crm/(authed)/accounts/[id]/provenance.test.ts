import { describe, expect, it } from "vitest";
import {
  isBolRole,
  provenancePills,
  ROLE_ABBREV,
  ROLE_FULL,
  ROLE_TONE_ON_LIGHT,
  BOL_ROLES,
} from "./provenance";

describe("provenancePills", () => {
  it("puts the role before the source, because the role is what changes behaviour", () => {
    const pills = provenancePills({ source: "bol", bolRole: "shipper" });
    expect(pills.map((p) => p.text)).toEqual(["Possible shipper", "From a bill of lading"]);
  });

  it("says 'possible' on every role", () => {
    // The wording is the honesty: these are unverified reads off a
    // photographed document. Dropping "possible" would turn a guess into
    // a claim nobody has stood behind.
    for (const role of ["shipper", "receiver", "broker"] as const) {
      const [pill] = provenancePills({ source: "bol", bolRole: role });
      expect(pill.text.startsWith("Possible ")).toBe(true);
    }
  });

  it("uses the sales word 'receiver', not the freight-document word", () => {
    const [pill] = provenancePills({ source: "bol", bolRole: "receiver" });
    expect(pill.text).toBe("Possible receiver");
    expect(pill.text).not.toContain("onsignee");
  });

  it("gives broker its own tone and leaves shipper and receiver sharing one", () => {
    // An agent treats a shipper and a receiver the same way and a broker
    // differently, so the visual difference tracks the behavioural one.
    const tone = (r: string) => provenancePills({ source: "bol", bolRole: r })[0].tone;
    expect(tone("shipper")).toBe("lead");
    expect(tone("receiver")).toBe("lead");
    expect(tone("broker")).toBe("broker");
  });

  it("warns off pitching in the broker hint", () => {
    const [pill] = provenancePills({ source: "bol", bolRole: "broker" });
    expect(pill.hint.toLowerCase()).toContain("before pitching");
  });

  it("keeps the source pill neutral so it cannot compete with the role", () => {
    const pills = provenancePills({ source: "bol", bolRole: "broker" });
    expect(pills[1].tone).toBe("neutral");
  });

  it("shows a source pill for non-BOL companies too", () => {
    expect(provenancePills({ source: "otr", bolRole: null })).toEqual([
      expect.objectContaining({ text: "From OTR", tone: "neutral" }),
    ]);
    expect(provenancePills({ source: "manual", bolRole: null })).toEqual([
      expect.objectContaining({ text: "Added by hand", tone: "neutral" }),
    ]);
  });

  it("does not claim OTR companies are customers", () => {
    // A company can be in that import without ever having shipped with us.
    const [pill] = provenancePills({ source: "otr", bolRole: null });
    expect(pill.text.toLowerCase()).not.toContain("customer");
  });

  it("renders nothing rather than an 'Unknown' pill when the source is null", () => {
    // 6 live companies have no source. A pill saying so would be chrome.
    expect(provenancePills({ source: null, bolRole: null })).toEqual([]);
    expect(provenancePills({ source: "", bolRole: null })).toEqual([]);
  });

  it("ignores a source value nobody has wording for", () => {
    expect(provenancePills({ source: "carrier_pigeon", bolRole: null })).toEqual([]);
  });

  it("ignores a bol_role value outside the three", () => {
    // The column has a CHECK, but the reader does not get to assume the
    // writer was the app.
    expect(provenancePills({ source: "bol", bolRole: "consignee" })).toEqual([
      expect.objectContaining({ text: "From a bill of lading" }),
    ]);
  });

  it("still shows the role when the source is missing", () => {
    expect(provenancePills({ source: null, bolRole: "broker" })).toEqual([
      expect.objectContaining({ text: "Possible broker" }),
    ]);
  });
});

describe("isBolRole", () => {
  it("accepts the three and nothing else", () => {
    expect(isBolRole("shipper")).toBe(true);
    expect(isBolRole("receiver")).toBe(true);
    expect(isBolRole("broker")).toBe(true);
    expect(isBolRole("consignee")).toBe(false);
    expect(isBolRole(null)).toBe(false);
    expect(isBolRole(undefined)).toBe(false);
    expect(isBolRole(3)).toBe(false);
  });
});

/**
 * The short form used in Admin -> Work to assign. These letters are only
 * safe because the colour and the spelled-out label carry the meaning; the
 * tests below pin exactly that.
 */
describe("the PS / PR / PB short form", () => {
  it("abbreviates each role the way Brent asked", () => {
    expect(ROLE_ABBREV.shipper).toBe("PS");
    expect(ROLE_ABBREV.receiver).toBe("PR");
    expect(ROLE_ABBREV.broker).toBe("PB");
  });

  it("has an abbreviation and a full wording for every role", () => {
    // A role with no short form would render a blank pill; one with no full
    // wording would render two undecodable letters.
    for (const role of BOL_ROLES) {
      expect(ROLE_ABBREV[role]).toMatch(/^P[SRB]$/);
      expect(ROLE_FULL[role].startsWith("Possible ")).toBe(true);
    }
  });

  it("keeps every abbreviation two characters, so the column cannot jitter", () => {
    for (const role of BOL_ROLES) expect(ROLE_ABBREV[role]).toHaveLength(2);
  });

  it("gives no two roles the same letters", () => {
    expect(new Set(BOL_ROLES.map((r) => ROLE_ABBREV[r])).size).toBe(BOL_ROLES.length);
  });

  it("spells the short form out to exactly what the profile pill says", () => {
    // THE DECODER. If these two ever disagree, "PS" stops being teachable
    // by the profile and becomes two letters nobody can read.
    for (const role of BOL_ROLES) {
      const [pill] = provenancePills({ source: "bol", bolRole: role });
      expect(pill.text).toBe(ROLE_FULL[role]);
    }
  });

  it("gives the abbreviation the same colour as the full-word pill", () => {
    // The other half of the decoder: gold is a lead on both surfaces, red
    // is a broker on both. Shipper and receiver share a tone; broker does
    // not share it with either.
    expect(ROLE_TONE_ON_LIGHT.shipper).toBe(ROLE_TONE_ON_LIGHT.receiver);
    expect(ROLE_TONE_ON_LIGHT.broker).not.toBe(ROLE_TONE_ON_LIGHT.shipper);
    expect(ROLE_TONE_ON_LIGHT.broker).toContain("bad");
    expect(ROLE_TONE_ON_LIGHT.shipper).toContain("amber");
  });

  it("carries no ring WIDTH, so each surface can pick its own", () => {
    // 2px on the roomy profile header, 1px on a dense table row. The hue is
    // shared; the weight is not, and baking one in here would force both.
    for (const role of BOL_ROLES) {
      expect(ROLE_TONE_ON_LIGHT[role]).not.toMatch(/ring-\d/);
    }
  });
});

describe("the profile spells things out", () => {
  it("never abbreviates BOL in a pill", () => {
    // Brent's bar for this surface: an agent who has never had it
    // explained still understands it. "BOL" is jargon; the profile has the
    // room to say it properly. The dense Work-to-assign list keeps PS/PR,
    // which is a different surface with a different constraint.
    const [pill] = provenancePills({ source: "bol", bolRole: null });
    expect(pill.text).toBe("From a bill of lading");
    expect(pill.text).not.toMatch(/BOL/);
  });

  it("still says 'possible' on the role, so nothing reads as confirmed", () => {
    const [role] = provenancePills({ source: "bol", bolRole: "receiver" });
    expect(role.text).toBe("Possible receiver");
  });
});
