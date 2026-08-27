import { describe, expect, it } from "vitest";
import {
  CALL_OUTCOMES,
  QUICK_OUTCOMES,
  callOutcomeLabel,
  callOutcomeTone,
  callOutcomeWeight,
} from "./outcomes";

describe("callOutcomeWeight", () => {
  it("reads each outcome's own tone rather than a second opinion", () => {
    // If these ever disagree, the timeline is drawing a chip one colour
    // while the button that recorded it draws another.
    for (const o of CALL_OUTCOMES) {
      const weight = callOutcomeWeight(o.value);
      if (o.tone.includes("text-ok")) expect(weight).toBe("good");
      else if (o.tone.includes("text-bad")) expect(weight).toBe("bad");
      else if (o.tone.includes("text-warn")) expect(weight).toBe("warn");
      else expect(weight).toBe("neutral");
    }
  });

  it("separates the outcome you want from the one that kills the number", () => {
    expect(callOutcomeWeight("reached")).toBe("good");
    expect(callOutcomeWeight("wrong_number")).toBe("bad");
    expect(callOutcomeWeight("reached")).not.toBe(callOutcomeWeight("wrong_number"));
  });

  it("leaves the genuinely neutral ones neutral", () => {
    expect(callOutcomeWeight("voicemail")).toBe("neutral");
    expect(callOutcomeWeight("no_answer")).toBe("neutral");
  });

  it("does not invent a weight for an unknown or missing value", () => {
    expect(callOutcomeWeight(null)).toBe("neutral");
    expect(callOutcomeWeight("something_else")).toBe("neutral");
  });
});

describe("the quick row stays part of the one vocabulary", () => {
  it("every quick outcome is a real outcome", () => {
    const known = new Set(CALL_OUTCOMES.map((o) => o.value));
    for (const q of QUICK_OUTCOMES) expect(known.has(q.value)).toBe(true);
  });

  it("shortened labels never become a second set of names", () => {
    // `short` may abbreviate, but the stored value must resolve to the
    // canonical label everywhere else it renders.
    for (const q of QUICK_OUTCOMES) {
      expect(callOutcomeLabel(q.value)).toBeTruthy();
      expect(callOutcomeTone(q.value)).toBeTruthy();
    }
  });

  it("gives the row exactly one good outcome to aim at", () => {
    const good = QUICK_OUTCOMES.filter((q) => callOutcomeWeight(q.value) === "good");
    expect(good.map((q) => q.short)).toEqual(["Reached"]);
  });
});
