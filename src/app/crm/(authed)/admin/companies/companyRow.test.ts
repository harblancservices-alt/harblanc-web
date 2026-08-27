import { describe, expect, it } from "vitest";
import {
  countByOwner,
  matchesOwner,
  sortForAdmin,
  sourceBucket,
  sourceLabel,
  UNASSIGNED,
  type CompanyRow,
} from "./companyRow";

function row(over: Partial<CompanyRow> = {}): CompanyRow {
  return {
    id: "a1",
    name: "Acme Steel",
    city: "Dallas",
    state: "TX",
    ownerId: null,
    ownerName: null,
    contactName: null,
    callPhone: null,
    source: "manual",
    stage: "new_lead",
    lastContactMs: null,
    openWork: 0,
    ...over,
  };
}

describe("sourceBucket", () => {
  it("maps the tokens the code writes", () => {
    expect(sourceBucket("manual")).toBe("manual");
    expect(sourceBucket("bol")).toBe("bol");
    expect(sourceBucket("otr")).toBe("otr");
    expect(sourceBucket("ai_agent")).toBe("ai_agent");
  });

  it("is case- and whitespace-insensitive on known tokens", () => {
    expect(sourceBucket("  MANUAL ")).toBe("manual");
  });

  it("separates 'never recorded' from 'unrecognised'", () => {
    expect(sourceBucket(null)).toBe("unknown");
    expect(sourceBucket("")).toBe("unknown");
    expect(sourceBucket("   ")).toBe("unknown");
    expect(sourceBucket("Cold Call")).toBe("other");
  });

  it("buckets the real free-text values found in production", () => {
    expect(sourceBucket("Cold call from web research - Ken Patterson extension is 1303")).toBe("other");
    expect(sourceBucket("Kermit Layman")).toBe("other");
  });
});

describe("sourceLabel", () => {
  it("labels known tokens", () => {
    expect(sourceLabel("bol")).toBe("Bill of lading");
    expect(sourceLabel(null)).toBe("Not recorded");
  });

  it("shows unrecognised values VERBATIM rather than as 'Other'", () => {
    // The admin needs to see what the junk actually is to clean it up.
    expect(sourceLabel("Cold Call")).toBe("Cold Call");
    expect(sourceLabel("Kermit Layman")).toBe("Kermit Layman");
  });

  it("truncates long prose for the column only", () => {
    const long = "Cold call from web research - Ken Patterson extension is 1303";
    const out = sourceLabel(long);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(32);
  });
});

describe("matchesOwner / countByOwner", () => {
  const rows = [
    row({ id: "1", ownerId: null }),
    row({ id: "2", ownerId: null }),
    row({ id: "3", ownerId: "u1" }),
    row({ id: "4", ownerId: "u2" }),
  ];

  it("filters by unassigned, all, and a specific agent", () => {
    expect(rows.filter((r) => matchesOwner(r, UNASSIGNED)).map((r) => r.id)).toEqual(["1", "2"]);
    expect(rows.filter((r) => matchesOwner(r, "all"))).toHaveLength(4);
    expect(rows.filter((r) => matchesOwner(r, "u1")).map((r) => r.id)).toEqual(["3"]);
  });

  it("counts every agent, including one with nothing", () => {
    expect(countByOwner(rows, ["u1", "u2", "u3"])).toEqual({
      all: 4,
      [UNASSIGNED]: 2,
      u1: 1,
      u2: 1,
      u3: 0,
    });
  });

  it("ignores an owner who is not on the team list", () => {
    // A company assigned to a deactivated profile must not invent a column.
    const counts = countByOwner([row({ ownerId: "ghost" })], ["u1"]);
    expect(counts).toEqual({ all: 1, [UNASSIGNED]: 0, u1: 0 });
  });
});

describe("sortForAdmin", () => {
  it("puts unassigned first", () => {
    const out = sortForAdmin([row({ id: "owned", ownerId: "u1" }), row({ id: "free", ownerId: null })]);
    expect(out.map((r) => r.id)).toEqual(["free", "owned"]);
  });

  it("orders coldest first within a group, with never-contacted coldest", () => {
    const out = sortForAdmin([
      row({ id: "recent", ownerId: "u1", lastContactMs: 5_000 }),
      row({ id: "never", ownerId: "u1", lastContactMs: null }),
      row({ id: "old", ownerId: "u1", lastContactMs: 1_000 }),
    ]);
    expect(out.map((r) => r.id)).toEqual(["never", "old", "recent"]);
  });

  it("breaks ties by name and does not mutate", () => {
    const input = [row({ id: "z", name: "Zeta" }), row({ id: "a", name: "Alpha" })];
    const before = input.map((r) => r.id);
    expect(sortForAdmin(input).map((r) => r.name)).toEqual(["Alpha", "Zeta"]);
    expect(input.map((r) => r.id)).toEqual(before);
  });
});
