import { describe, expect, it } from "vitest";
import { linkedCompanies } from "./bolLinks";

const SHIPPER = "11111111-1111-1111-1111-111111111111";
const RECEIVER = "22222222-2222-2222-2222-222222222222";
const BROKER = "33333333-3333-3333-3333-333333333333";

function entry(p: {
  shipper?: string | null;
  consignee?: string | null;
  billTo?: string | null;
  bol?: string | null;
}) {
  return {
    matched_shipper_account_id: p.shipper ?? null,
    matched_consignee_account_id: p.consignee ?? null,
    matched_bill_to_account_id: p.billTo ?? null,
    bol_number: p.bol ?? null,
  };
}

const NAMES = new Map([
  [SHIPPER, "Siemens Energy, Inc. (Deer Park)"],
  [RECEIVER, "TVA Ackerman"],
  [BROKER, "3rd Party (Siemens Energy TMS)"],
]);

describe("linkedCompanies", () => {
  it("links the receiver from the shipper's profile, with the role on that document", () => {
    const got = linkedCompanies(
      [entry({ shipper: SHIPPER, consignee: RECEIVER, bol: "SIEMG2000191663" })],
      SHIPPER,
      NAMES,
    );
    expect(got).toEqual([
      { id: RECEIVER, name: "TVA Ackerman", role: "receiver", bolNumber: "SIEMG2000191663" },
    ]);
  });

  it("links the shipper from the receiver's profile — the relationship reads both ways", () => {
    const got = linkedCompanies(
      [entry({ shipper: SHIPPER, consignee: RECEIVER, bol: "SIEMG2000191663" })],
      RECEIVER,
      NAMES,
    );
    expect(got.map((l) => [l.id, l.role])).toEqual([[SHIPPER, "shipper"]]);
  });

  it("never links a company to itself", () => {
    // A company shipping between its own sites is on both ends of the row.
    const got = linkedCompanies([entry({ shipper: SHIPPER, consignee: SHIPPER })], SHIPPER, NAMES);
    expect(got).toEqual([]);
  });

  it("returns all three when a BOL named three companies", () => {
    const got = linkedCompanies(
      [entry({ shipper: SHIPPER, consignee: RECEIVER, billTo: BROKER })],
      SHIPPER,
      NAMES,
    );
    expect(got.map((l) => l.role)).toEqual(["receiver", "broker"]);
  });

  it("drops a company that has since been deleted or merged", () => {
    // THE M8 CASE. The name map is built from a live-only query, so a
    // pointer at a soft-deleted company resolves to nothing and the link
    // simply is not offered. No dangling button, no special case.
    const liveOnly = new Map([[RECEIVER, "TVA Ackerman"]]);
    const got = linkedCompanies(
      [entry({ shipper: SHIPPER, consignee: RECEIVER, billTo: BROKER })],
      SHIPPER,
      liveOnly,
    );
    expect(got.map((l) => l.id)).toEqual([RECEIVER]);
  });

  it("returns nothing when the BOL only produced this one company", () => {
    // The common case, and the one Snapshot #1 actually produced: no
    // receiver was named on the document and the broker is not a company.
    expect(linkedCompanies([entry({ shipper: SHIPPER })], SHIPPER, NAMES)).toEqual([]);
  });

  it("returns nothing when there are no BOL entries at all", () => {
    expect(linkedCompanies([], SHIPPER, NAMES)).toEqual([]);
  });

  it("counts two companies sharing three BOLs as one link, naming the first", () => {
    const got = linkedCompanies(
      [
        entry({ shipper: SHIPPER, consignee: RECEIVER, bol: "NEWEST" }),
        entry({ shipper: SHIPPER, consignee: RECEIVER, bol: "MIDDLE" }),
        entry({ shipper: SHIPPER, consignee: RECEIVER, bol: "OLDEST" }),
      ],
      SHIPPER,
      NAMES,
    );
    expect(got).toHaveLength(1);
    expect(got[0].bolNumber).toBe("NEWEST");
  });

  it("treats a blank BOL number as absent rather than printing an empty string", () => {
    const got = linkedCompanies(
      [entry({ shipper: SHIPPER, consignee: RECEIVER, bol: "   " })],
      SHIPPER,
      NAMES,
    );
    expect(got[0].bolNumber).toBeNull();
  });

  it("finds links across several different BOLs", () => {
    const got = linkedCompanies(
      [
        entry({ shipper: SHIPPER, consignee: RECEIVER, bol: "A" }),
        entry({ shipper: SHIPPER, billTo: BROKER, bol: "B" }),
      ],
      SHIPPER,
      NAMES,
    );
    expect(got.map((l) => [l.name, l.bolNumber])).toEqual([
      ["TVA Ackerman", "A"],
      ["3rd Party (Siemens Energy TMS)", "B"],
    ]);
  });
});
