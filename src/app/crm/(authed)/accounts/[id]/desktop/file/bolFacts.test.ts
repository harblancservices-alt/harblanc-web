import { describe, expect, it } from "vitest";
import { bolFacts, placeOf, type BolRow } from "./bolFacts";

/** The real Fritz Industries BOL, byte for byte out of production — the row
 * the design was drawn from. Every shape assertion below is against data
 * that actually exists rather than a convenient invention. */
const FRITZ: BolRow = {
  bolNumber: "B272258",
  shipperAddress: "500 N Sam Houston Rd, Entrance #3 Docks 8-11, Mesquite, TX 75149",
  consigneeName: "Industrial Terminal",
  consigneeAddress: "13901 Industrial Rd, Houston, TX 77015",
  commodity: "Losseal W/O D097 (2 pallets)",
  weight: "3,202 lb",
  carrier: null,
  pickupDate: "2026-07-22",
};

describe("placeOf", () => {
  it("reads the city and state off a real shipper address", () => {
    expect(placeOf(FRITZ.shipperAddress)).toBe("Mesquite, TX");
    expect(placeOf(FRITZ.consigneeAddress)).toBe("Houston, TX");
  });

  it("is not fooled by commas inside the street address", () => {
    // The Fritz address has THREE commas. Counting segments from the front
    // would pick "Entrance #3 Docks 8-11" as the city.
    expect(placeOf("500 N Sam Houston Rd, Entrance #3 Docks 8-11, Mesquite, TX 75149")).toBe(
      "Mesquite, TX",
    );
  });

  it("handles the other real addresses in the table", () => {
    expect(placeOf("10470 Deer Trail Dr, Houston, TX 77038")).toBe("Houston, TX");
    expect(placeOf("2620 Bells Ferry Rd NE, Marietta, GA 30066")).toBe("Marietta, GA");
    expect(placeOf("2305 E 57th St S, Wichita, KS 67216")).toBe("Wichita, KS");
    expect(placeOf("405 Deerwood Glen Dr, Deer Park, TX 77536")).toBe("Deer Park, TX");
  });

  it("uppercases the state and copes with a missing ZIP", () => {
    expect(placeOf("1 Main St, Mesquite, tx")).toBe("Mesquite, TX");
    expect(placeOf("1 Main St, Mesquite, Tx 75149")).toBe("Mesquite, TX");
  });

  it("returns null rather than guessing when there is no city/state tail", () => {
    expect(placeOf(null)).toBeNull();
    expect(placeOf("")).toBeNull();
    expect(placeOf("   ")).toBeNull();
    expect(placeOf("Somewhere out past the yard")).toBeNull();
    expect(placeOf("Houston")).toBeNull();
  });
});

describe("bolFacts", () => {
  it("is honestly empty when there are no BOLs — 93 of 99 companies", () => {
    expect(bolFacts([])).toEqual({ parsed: 0, lanes: [], ships: [], lastBol: null });
  });

  it("turns the one real Fritz BOL into one lane of one load", () => {
    const facts = bolFacts([FRITZ]);
    expect(facts.parsed).toBe(1);
    expect(facts.lanes).toHaveLength(1);
    expect(facts.lanes[0]).toMatchObject({
      from: "Mesquite, TX",
      to: "Houston, TX",
      loads: 1,
    });
    // NOT "4 loads · flatbed · structural steel" — that was the mockup.
    expect(facts.lanes[0].commodities).toEqual(["Losseal W/O D097 (2 pallets)"]);
  });

  it("counts repeat runs as ONE lane with a real load count", () => {
    const facts = bolFacts([FRITZ, { ...FRITZ, bolNumber: "B272259", commodity: "Steel beams" }]);
    expect(facts.lanes).toHaveLength(1);
    expect(facts.lanes[0].loads).toBe(2);
    expect(facts.lanes[0].commodities).toEqual(["Losseal W/O D097 (2 pallets)", "Steel beams"]);
  });

  it("separates a second destination into its own lane, busiest first", () => {
    const sanAntonio = {
      ...FRITZ,
      bolNumber: "B9",
      consigneeAddress: "1 Alamo Plaza, San Antonio, TX 78205",
    };
    const facts = bolFacts([sanAntonio, FRITZ, { ...FRITZ, bolNumber: "B10" }]);
    expect(facts.lanes).toHaveLength(2);
    expect(facts.lanes[0].to).toBe("Houston, TX");
    expect(facts.lanes[0].loads).toBe(2);
    expect(facts.lanes[1].to).toBe("San Antonio, TX");
    expect(facts.lanes[1].loads).toBe(1);
  });

  it("takes the NEWEST BOL as the last one, not the first row handed over", () => {
    const older = { ...FRITZ, bolNumber: "OLD", pickupDate: "2026-01-04" };
    const newer = { ...FRITZ, bolNumber: "NEW", pickupDate: "2026-08-19" };
    expect(bolFacts([older, newer]).lastBol?.number).toBe("NEW");
    expect(bolFacts([newer, older]).lastBol?.number).toBe("NEW");
  });

  it("sorts an unparseable or missing pickup date last instead of throwing", () => {
    const undated = { ...FRITZ, bolNumber: "NODATE", pickupDate: null };
    const dated = { ...FRITZ, bolNumber: "DATED", pickupDate: "2026-03-03" };
    expect(bolFacts([undated, dated]).lastBol?.number).toBe("DATED");
    expect(() => bolFacts([{ ...FRITZ, pickupDate: "not a date" }])).not.toThrow();
  });

  it("carries weight through VERBATIM and never averages it", () => {
    // The real values defeat arithmetic: a sum with its parts, and a
    // per-piece figure. Showing the string is the honest thing.
    const facts = bolFacts([{ ...FRITZ, weight: "4,080 lb (1,630 + 2,450)" }]);
    expect(facts.lastBol?.weight).toBe("4,080 lb (1,630 + 2,450)");
    expect(JSON.stringify(facts)).not.toMatch(/avg|average/i);
  });

  it("nulls a blank carrier rather than showing an empty 'hauled by'", () => {
    expect(bolFacts([FRITZ]).lastBol?.carrier).toBeNull();
    expect(bolFacts([{ ...FRITZ, carrier: "   " }]).lastBol?.carrier).toBeNull();
    expect(bolFacts([{ ...FRITZ, carrier: "Averitt" }]).lastBol?.carrier).toBe("Averitt");
  });

  it("keeps an unknown lane end as unknown", () => {
    const facts = bolFacts([{ ...FRITZ, consigneeAddress: "somewhere" }]);
    expect(facts.lanes[0].to).toBeNull();
    expect(facts.lanes[0].from).toBe("Mesquite, TX");
  });

  it("lists each commodity once across the whole history", () => {
    const facts = bolFacts([FRITZ, { ...FRITZ, bolNumber: "B2" }]);
    expect(facts.ships).toEqual(["Losseal W/O D097 (2 pallets)"]);
  });

  it("skips a blank commodity instead of listing an empty string", () => {
    const facts = bolFacts([{ ...FRITZ, commodity: "  " }]);
    expect(facts.ships).toEqual([]);
    expect(facts.lanes[0].commodities).toEqual([]);
  });
});
