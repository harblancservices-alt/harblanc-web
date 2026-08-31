import { describe, expect, it } from "vitest";
import { stepNumbers } from "./WhatHappened";

/**
 * THE "1 … 4" BUG.
 *
 * Steps 2 and 3 of the call composer only appear once an outcome is
 * picked, but their numbers were written as literals — so a freshly opened
 * call showed "1 Did you get through?" followed by "4 Save it". Brent
 * spotted it in the new dialog; it was equally wrong on Overview and had
 * been since the steps were introduced.
 *
 * These tests pin the property that actually matters: the numbers a rep
 * can see always run 1, 2, 3… with nothing missing.
 */
describe("stepNumbers", () => {
  /** Every number that is actually drawn, in render order. A 0 means the
   * step is not on screen and carries no number at all. */
  function visible(shown: { result: boolean; followup: boolean }): number[] {
    const s = stepNumbers(shown);
    return [s.gotThrough, s.result, s.followup, s.save].filter((n) => n > 0);
  }

  it("numbers a freshly opened call 1 then 2 — never 1 then 4", () => {
    // The exact case in Brent's screenshot.
    expect(visible({ result: false, followup: false })).toEqual([1, 2]);
    expect(stepNumbers({ result: false, followup: false }).save).toBe(2);
  });

  it("numbers all four when every step is showing", () => {
    expect(visible({ result: true, followup: true })).toEqual([1, 2, 3, 4]);
  });

  it("keeps them sequential when only the middle step shows", () => {
    expect(visible({ result: true, followup: false })).toEqual([1, 2, 3]);
  });

  it("keeps them sequential when only the follow-up shows", () => {
    // Reachable: an outcome that warrants a follow-up without a result row.
    expect(visible({ result: false, followup: true })).toEqual([1, 2, 3]);
  });

  it("never skips or repeats a number, in any combination", () => {
    for (const result of [true, false]) {
      for (const followup of [true, false]) {
        const seen = visible({ result, followup });
        expect(seen).toEqual(seen.map((_, i) => i + 1));
      }
    }
  });

  it("gives a hidden step no number rather than a stale one", () => {
    const s = stepNumbers({ result: false, followup: false });
    expect(s.result).toBe(0);
    expect(s.followup).toBe(0);
  });

  it("always starts at 1 and always ends with Save", () => {
    for (const result of [true, false]) {
      for (const followup of [true, false]) {
        const s = stepNumbers({ result, followup });
        expect(s.gotThrough).toBe(1);
        expect(s.save).toBe(Math.max(s.gotThrough, s.result, s.followup) + 1);
      }
    }
  });
});
