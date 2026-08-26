import { describe, it, expect } from "vitest";
import { buildPipeline, isRealStageMove, isStage, sortColumn, type PipelineCard } from "./pipeline";
import { LIFECYCLE_STAGES } from "../accounts/lifecycle";

const NOW = 1_787_000_000_000;
const DAY = 86_400_000;

function c(
  id: string,
  stage: string | null,
  lastContactMs: number | null = NOW,
  name = `Co ${id}`,
): PipelineCard {
  return { id, name, city: null, state: null, stage, lastContactMs, openTasks: 0 };
}

describe("buildPipeline", () => {
  it("always renders every stage, in the funnel's own order", () => {
    const board = buildPipeline([]);
    expect(board.map((col) => col.stage)).toEqual([...LIFECYCLE_STAGES]);
  });

  it("keeps an empty stage as a column — it is a drop target and information", () => {
    const board = buildPipeline([c("a", "quoting")]);
    expect(board.find((col) => col.stage === "contacted")!.cards).toEqual([]);
    expect(board).toHaveLength(LIFECYCLE_STAGES.length);
  });

  it("buckets each company by its stage", () => {
    const board = buildPipeline([c("a", "new_lead"), c("b", "quoting"), c("d", "lost")]);
    expect(board.find((col) => col.stage === "new_lead")!.cards.map((x) => x.id)).toEqual(["a"]);
    expect(board.find((col) => col.stage === "quoting")!.cards.map((x) => x.id)).toEqual(["b"]);
    expect(board.find((col) => col.stage === "lost")!.cards.map((x) => x.id)).toEqual(["d"]);
  });

  it("lands a legacy stage value in a real column, never a seventh one", () => {
    // "quoted" and "customer" are pre-2026-08-09 vocabulary.
    const board = buildPipeline([c("old", "quoted"), c("older", "customer")]);
    expect(board.find((col) => col.stage === "quoting")!.cards.map((x) => x.id)).toEqual(["old"]);
    expect(board.find((col) => col.stage === "active")!.cards.map((x) => x.id)).toEqual([
      "older",
    ]);
    expect(board).toHaveLength(LIFECYCLE_STAGES.length);
  });

  it("treats an unknown or null stage as new_lead rather than dropping it", () => {
    const board = buildPipeline([c("a", null), c("b", "wat")]);
    expect(board.find((col) => col.stage === "new_lead")!.cards.map((x) => x.id)).toEqual([
      "a",
      "b",
    ]);
  });
});

describe("sortColumn", () => {
  it("puts the coldest company at the top", () => {
    const rows = sortColumn([
      c("fresh", "contacted", NOW),
      c("cold", "contacted", NOW - 30 * DAY),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["cold", "fresh"]);
  });

  it("sorts never-contacted as coldest, not as a missing value", () => {
    const rows = sortColumn([c("old", "contacted", NOW - 90 * DAY), c("never", "contacted", null)]);
    expect(rows.map((r) => r.id)).toEqual(["never", "old"]);
  });

  it("breaks ties by name so columns do not reshuffle between renders", () => {
    const rows = sortColumn([
      c("z", "contacted", NOW, "Zebra"),
      c("a", "contacted", NOW, "Apple"),
    ]);
    expect(rows.map((r) => r.name)).toEqual(["Apple", "Zebra"]);
  });
});

describe("isRealStageMove", () => {
  it("rejects a drop back on the same column", () => {
    expect(isRealStageMove(c("a", "quoting"), "quoting")).toBe(false);
  });

  it("rejects a drop that only differs by legacy spelling", () => {
    // "quoted" normalises to "quoting" — moving it there changes nothing.
    expect(isRealStageMove(c("a", "quoted"), "quoting")).toBe(false);
  });

  it("accepts a genuine advance or drop-out", () => {
    expect(isRealStageMove(c("a", "contacted"), "quoting")).toBe(true);
    expect(isRealStageMove(c("a", "quoting"), "lost")).toBe(true);
  });
});

describe("isStage", () => {
  it("accepts every real stage and nothing else", () => {
    for (const s of LIFECYCLE_STAGES) expect(isStage(s)).toBe(true);
    expect(isStage("quoted")).toBe(false);
    expect(isStage("")).toBe(false);
  });
});
