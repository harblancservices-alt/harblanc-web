import { describe, expect, it } from "vitest";
import { parseScore, type ParseScoreInput } from "./parseScore";

/** Nothing came off the photo at all. */
const NOTHING: ParseScoreInput = {
  bolNumber: null,
  reference: null,
  shipperName: null,
  shipperAddress: null,
  consigneeName: null,
  consigneeAddress: null,
  commodity: null,
  weight: null,
  pickupDate: null,
  deliveryDate: null,
  companiesCreated: 0,
  phoneCount: 0,
  hasNamedContact: false,
  hasPhoneConflict: false,
};

/**
 * SNAPSHOT #1, exactly as crm_bol_entries holds it — BOL
 * M8LOG-LT2F-10648-LEG-2.1, photographed 2026-08-28.
 *
 * This is the anchor for the whole scale. If the weights are ever changed,
 * this test says what it did to the one real record.
 */
const SOLAR_LINK: ParseScoreInput = {
  bolNumber: "M8LOG-LT2F-10648-LEG-2.1",
  reference: "PO SO015699 / Trailer T213997 / PRO TDC04381",
  shipperName: "Solar Link",
  shipperAddress: "1715 South University Drive, Nacogdoches, TX, US 75961",
  // The document names no receiver: the destination block reads only
  // "Houston, TX, US" plus a note that the address comes the evening
  // before.
  consigneeName: null,
  consigneeAddress: "Houston, TX, US",
  commodity: "2.0 Camera Trailer, 9 linear feet",
  weight: "2000 lb",
  pickupDate: "2023-12-11",
  deliveryDate: "2023-12-12",
  // One: Solar-Link Global. M8 Logistics was the broker and brokers are
  // not companies.
  companiesCreated: 1,
  // (816) 652-0381 on the origin, (801) 803-6850 on the M8 header.
  phoneCount: 2,
  hasNamedContact: false,
  hasPhoneConflict: true,
};

describe("parseScore — the two anchors", () => {
  it("scores an unreadable photo 0", () => {
    expect(parseScore(NOTHING).score).toBe(0);
  });

  it("scores a complete, fully worked BOL 100", () => {
    expect(
      parseScore({
        bolNumber: "SIEMG2000191663",
        reference: "PO 4500123456",
        shipperName: "Siemens Energy, Inc.",
        shipperAddress: "5900 Highway 225, Deer Park, TX 77536",
        consigneeName: "TVA Ackerman",
        consigneeAddress: "1401 Old Highway 15, Ackerman, MS 39735",
        commodity: "Turbine parts",
        weight: "4,420 lb",
        pickupDate: "2026-07-09",
        deliveryDate: "2026-07-10",
        companiesCreated: 2,
        phoneCount: 1,
        hasNamedContact: true,
        hasPhoneConflict: false,
      }).score,
    ).toBe(100);
  });

  it("scores Snapshot #1 at 66, and can show its working", () => {
    const { score, lines } = parseScore(SOLAR_LINK);
    expect(score).toBe(66);

    // 15 identity + 17 shipper + 4 receiver + 15 load + 12 company
    // + 8 phone-without-a-name - 5 conflict.
    const by = (label: string) => lines.find((l) => l.label === label)!.points;
    expect(by("BOL number")).toBe(10);
    expect(by("Reference / PO")).toBe(5);
    expect(by("Shipper name")).toBe(10);
    expect(by("Shipper address")).toBe(7);
    // The two that cost it the most: no receiver named, and only one
    // company came out of a document that should name two.
    expect(by("Receiver name")).toBe(0);
    expect(by("Receiver address")).toBe(4); // a town, no street
    expect(by("Companies produced")).toBe(12);
    expect(by("Somebody to call")).toBe(8); // a number, nobody's name
    expect(by("Conflicting numbers, unconfirmed")).toBe(-5);
  });

  it("lands Snapshot #1 in the band the scale claims for it", () => {
    // 50-69 is documented as "a party missing outright, or only one
    // company came out of it" — which is exactly this document.
    const { score } = parseScore(SOLAR_LINK);
    expect(score).toBeGreaterThanOrEqual(50);
    expect(score).toBeLessThan(70);
  });
});

describe("parseScore — what moves the number", () => {
  it("would have reached 78 if somebody had answered the phone", () => {
    // Naming the contact is worth 7 and clears the 5-point conflict
    // penalty, since a confirmed number is no longer a conflict.
    const named = parseScore({
      ...SOLAR_LINK,
      hasNamedContact: true,
      hasPhoneConflict: false,
    }).score;
    expect(named).toBe(78);
  });

  it("charges a missing receiver twice, on purpose", () => {
    const withReceiver = parseScore({
      ...SOLAR_LINK,
      consigneeName: "Gulf Coast Staging",
      consigneeAddress: "4400 Navigation Blvd, Houston, TX 77011",
      companiesCreated: 2,
    }).score;
    // +10 name, +4 the rest of the address, +8 the second company.
    expect(withReceiver).toBe(66 + 10 + 4 + 8);
  });

  it("halves an address that is a town with no street", () => {
    const town = parseScore({ ...NOTHING, shipperAddress: "Houston, TX, US" });
    const street = parseScore({ ...NOTHING, shipperAddress: "1715 S University Dr, TX" });
    expect(town.score).toBe(4);
    expect(street.score).toBe(7);
  });

  it("gives nothing for a phone when there is no phone", () => {
    expect(parseScore({ ...NOTHING, phoneCount: 0, hasNamedContact: true }).score).toBe(0);
  });

  it("never goes below zero, however bad the parse", () => {
    // The conflict penalty on an otherwise empty parse.
    expect(parseScore({ ...NOTHING, hasPhoneConflict: true }).score).toBe(0);
  });

  it("never exceeds 100", () => {
    const perfect = parseScore({
      bolNumber: "X",
      reference: "X",
      shipperName: "X",
      shipperAddress: "1 X St",
      consigneeName: "X",
      consigneeAddress: "2 X St",
      commodity: "X",
      weight: "X",
      pickupDate: "X",
      deliveryDate: "X",
      companiesCreated: 9,
      phoneCount: 9,
      hasNamedContact: true,
      hasPhoneConflict: false,
    });
    expect(perfect.score).toBe(100);
  });

  it("treats whitespace as absent", () => {
    expect(parseScore({ ...NOTHING, bolNumber: "   " }).score).toBe(0);
  });

  it("scores one company at 12 and two at 20", () => {
    expect(parseScore({ ...NOTHING, companiesCreated: 1 }).score).toBe(12);
    expect(parseScore({ ...NOTHING, companiesCreated: 2 }).score).toBe(20);
    expect(parseScore({ ...NOTHING, companiesCreated: 5 }).score).toBe(20);
  });
});
