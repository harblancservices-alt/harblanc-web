import { describe, expect, it } from "vitest";
import { isBolRole, provenancePills } from "./provenance";

describe("provenancePills", () => {
  it("puts the role before the source, because the role is what changes behaviour", () => {
    const pills = provenancePills({ source: "bol", bolRole: "shipper" });
    expect(pills.map((p) => p.text)).toEqual(["Possible shipper", "From a BOL"]);
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
      expect.objectContaining({ text: "From a BOL" }),
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
