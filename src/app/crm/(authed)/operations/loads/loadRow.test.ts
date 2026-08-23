import { describe, expect, it } from "vitest";
import {
  countByFilter,
  isLiveDoc,
  matchesFilter,
  matchesQuery,
  needsPaperwork,
  sortLoads,
  type LoadRow,
} from "./loadRow";

function load(over: Partial<LoadRow> = {}): LoadRow {
  return {
    id: "id-1",
    loadNumber: "HS-1001",
    status: "open",
    customerName: "Alamo Manufacturing",
    shipperCity: "Houston",
    shipperState: "TX",
    consigneeCity: "Dallas",
    consigneeState: "TX",
    carrierName: "Lone Star Hauling",
    pickupAt: "2026-08-24T14:00:00.000Z",
    deliveryAt: "2026-08-25T14:00:00.000Z",
    rcStatus: "sent",
    bolStatus: "draft",
    ...over,
  };
}

describe("LoadRow shape", () => {
  it("carries no money field at all — margin is not a sales-agent view", () => {
    const row = load() as Record<string, unknown>;
    for (const forbidden of ["customerRate", "carrierRate", "margin", "rate", "total"]) {
      expect(row).not.toHaveProperty(forbidden);
    }
  });
});

describe("isLiveDoc", () => {
  it("treats a missing document as not live", () => {
    expect(isLiveDoc(null)).toBe(false);
  });

  it("treats a cancelled document as not live", () => {
    expect(isLiveDoc("cancelled")).toBe(false);
    expect(isLiveDoc("  Cancelled ")).toBe(false);
  });

  it("counts every other lifecycle state as live", () => {
    for (const s of ["draft", "generated", "sent", "accepted", "completed"]) {
      expect(isLiveDoc(s)).toBe(true);
    }
  });
});

describe("needsPaperwork", () => {
  it("is false for a fully papered, carrier-assigned load", () => {
    expect(needsPaperwork(load())).toBe(false);
  });

  it("flags an unassigned carrier", () => {
    expect(needsPaperwork(load({ carrierName: null }))).toBe(true);
  });

  it("flags a missing RC or BOL", () => {
    expect(needsPaperwork(load({ rcStatus: null }))).toBe(true);
    expect(needsPaperwork(load({ bolStatus: null }))).toBe(true);
  });

  it("flags a load whose only RC was cancelled", () => {
    expect(needsPaperwork(load({ rcStatus: "cancelled" }))).toBe(true);
  });
});

describe("matchesFilter", () => {
  it("passes everything on 'all'", () => {
    expect(matchesFilter(load({ status: "in_transit" }), "all")).toBe(true);
  });

  it("matches a status chip exactly", () => {
    expect(matchesFilter(load({ status: "dispatched" }), "dispatched")).toBe(true);
    expect(matchesFilter(load({ status: "open" }), "dispatched")).toBe(false);
  });

  it("routes the paperwork chip through needsPaperwork, not status", () => {
    expect(matchesFilter(load({ status: "in_transit", rcStatus: null }), "paperwork")).toBe(true);
    expect(matchesFilter(load({ status: "in_transit" }), "paperwork")).toBe(false);
  });
});

describe("matchesQuery", () => {
  it("passes everything on an empty query", () => {
    expect(matchesQuery(load(), "   ")).toBe(true);
  });

  it("finds a load by number, customer, carrier and lane", () => {
    expect(matchesQuery(load(), "hs-10")).toBe(true);
    expect(matchesQuery(load(), "alamo")).toBe(true);
    expect(matchesQuery(load(), "lone star")).toBe(true);
    expect(matchesQuery(load(), "dallas")).toBe(true);
  });

  it("misses what isn't there", () => {
    expect(matchesQuery(load(), "peoria")).toBe(false);
  });

  it("survives null fields", () => {
    expect(matchesQuery(load({ customerName: null, carrierName: null }), "alamo")).toBe(false);
  });
});

describe("sortLoads", () => {
  const a = load({ id: "a", loadNumber: "HS-1001", pickupAt: "2026-08-24T00:00:00.000Z" });
  const b = load({ id: "b", loadNumber: "HS-1002", pickupAt: "2026-08-22T00:00:00.000Z" });
  const none = load({ id: "c", loadNumber: "HS-1003", pickupAt: null });

  it("does not mutate its input", () => {
    const rows = [a, b];
    sortLoads(rows, "pickup", "asc");
    expect(rows[0].id).toBe("a");
  });

  it("sorts a date column both ways", () => {
    expect(sortLoads([a, b], "pickup", "asc").map((r) => r.id)).toEqual(["b", "a"]);
    expect(sortLoads([a, b], "pickup", "desc").map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("sinks rows with no value to the bottom in BOTH directions", () => {
    expect(sortLoads([none, a, b], "pickup", "asc").map((r) => r.id)).toEqual(["b", "a", "c"]);
    expect(sortLoads([none, a, b], "pickup", "desc").map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("sorts status by lifecycle position, not alphabetically", () => {
    const open = load({ id: "o", loadNumber: "L1", status: "open" });
    const dispatched = load({ id: "d", loadNumber: "L2", status: "dispatched" });
    const transit = load({ id: "t", loadNumber: "L3", status: "in_transit" });
    // Alphabetically this would be dispatched, in_transit, open.
    expect(sortLoads([transit, open, dispatched], "status", "asc").map((r) => r.id)).toEqual([
      "o",
      "d",
      "t",
    ]);
  });
});

describe("countByFilter", () => {
  it("counts each status bucket and the paperwork queue in one pass", () => {
    const rows = [
      load({ id: "1", loadNumber: "A", status: "open" }),
      load({ id: "2", loadNumber: "B", status: "dispatched", rcStatus: null }),
      load({ id: "3", loadNumber: "C", status: "in_transit", carrierName: null }),
      load({ id: "4", loadNumber: "D", status: "in_transit" }),
    ];
    expect(countByFilter(rows)).toEqual({
      all: 4,
      open: 1,
      dispatched: 1,
      in_transit: 2,
      paperwork: 2,
    });
  });
});
