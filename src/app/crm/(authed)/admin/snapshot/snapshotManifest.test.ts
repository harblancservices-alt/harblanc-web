import { describe, expect, it } from "vitest";
import { buildManifest, defaultBatchLabel, MANIFEST_CONTRACT, type ManifestItem } from "./snapshotManifest";

const NOW = new Date("2026-08-27T15:00:00Z"); // 10:00 Central

function item(over: Partial<ManifestItem> = {}): ManifestItem {
  return {
    id: "s1",
    seq: 1,
    fileName: "bol.jpg",
    storagePath: "org/bol-snapshots/b1/s1.jpg",
    capturedAt: "2026-08-27T15:00:00Z",
    url: "https://signed/1",
    ...over,
  };
}

const batch = {
  id: "b1",
  label: "27 Aug",
  note: null,
  createdAt: "2026-08-27T14:00:00Z",
  closedAt: null,
};

describe("defaultBatchLabel", () => {
  it("uses the org's day, not the server's", () => {
    // 02:00 UTC on the 28th is still the evening of the 27th in Central. A
    // batch shot after 7pm must not be labelled tomorrow.
    expect(defaultBatchLabel(new Date("2026-08-28T02:00:00Z"), [])).toBe("27 Aug");
  });

  it("is just the date when it is the day's first sitting", () => {
    expect(defaultBatchLabel(NOW, [])).toBe("27 Aug");
  });

  it("adds a letter for each further sitting that day", () => {
    expect(defaultBatchLabel(NOW, ["27 Aug"])).toBe("27 Aug — A");
    expect(defaultBatchLabel(NOW, ["27 Aug", "27 Aug — A"])).toBe("27 Aug — B");
  });

  it("ignores other days entirely", () => {
    expect(defaultBatchLabel(NOW, ["26 Aug", "26 Aug — A"])).toBe("27 Aug");
  });

  it("never returns a label that is already taken", () => {
    const taken = ["27 Aug", ...[..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].map((l) => `27 Aug — ${l}`)];
    expect(taken).not.toContain(defaultBatchLabel(NOW, taken));
  });
});

describe("buildManifest", () => {
  it("orders items by shooting order, not by whatever the query returned", () => {
    // A multi-page BOL is consecutive shots. Out-of-order pages are how a
    // reader silently staples page 3 of one document onto page 1 of another.
    const m = buildManifest({
      batch,
      items: [item({ id: "c", seq: 3 }), item({ id: "a", seq: 1 }), item({ id: "b", seq: 2 })],
      total: 3,
      now: NOW,
      ttlSeconds: 3600,
    });
    expect(m.items.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the array it was given", () => {
    const items = [item({ id: "c", seq: 3 }), item({ id: "a", seq: 1 })];
    buildManifest({ batch, items, total: 2, now: NOW, ttlSeconds: 3600 });
    expect(items.map((i) => i.id)).toEqual(["c", "a"]);
  });

  it("counts unparsed separately from the batch total", () => {
    // items are the UNPARSED ones; total is everything shot. A reader that
    // conflates them thinks it has already finished.
    const m = buildManifest({ batch, items: [item()], total: 400, now: NOW, ttlSeconds: 3600 });
    expect(m.counts).toEqual({ total: 400, unparsed: 1 });
  });

  it("states when the links stop working", () => {
    const m = buildManifest({ batch, items: [item()], total: 1, now: NOW, ttlSeconds: 3600 });
    expect(m.generatedAt).toBe("2026-08-27T15:00:00.000Z");
    expect(m.urlsExpireAt).toBe("2026-08-27T16:00:00.000Z");
  });

  it("carries the contract, so a cold session knows the rules", () => {
    const m = buildManifest({ batch, items: [], total: 0, now: NOW, ttlSeconds: 3600 });
    expect(m.contract).toBe(MANIFEST_CONTRACT);
    expect(m.contract).toMatch(/parsed_at/);
    expect(m.contract).toMatch(/never parsed twice/);
  });

  it("survives a batch where every photo is already done", () => {
    const m = buildManifest({ batch, items: [], total: 400, now: NOW, ttlSeconds: 3600 });
    expect(m.items).toEqual([]);
    expect(m.counts.unparsed).toBe(0);
  });

  it("keeps a null url rather than dropping the photo", () => {
    // Signing can fail per-object. A dropped item would make the batch look
    // smaller than it is; a null url tells the reader to ask again.
    const m = buildManifest({
      batch,
      items: [item({ url: null })],
      total: 1,
      now: NOW,
      ttlSeconds: 3600,
    });
    expect(m.items).toHaveLength(1);
    expect(m.items[0].url).toBeNull();
  });
});
