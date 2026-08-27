import { describe, expect, it } from "vitest";
import { detectDate, draftFollowupTitle, warrantsFollowup } from "./followupDraft";

// A Wednesday. 2026-08-26T18:00Z is 13:00 Central Wed 26 Aug.
const WED = new Date("2026-08-26T18:00:00Z");

describe("detectDate — it notices, it never decides", () => {
  it("finds nothing in a note with no date, rather than inventing one", () => {
    expect(detectDate("Wants flatbed rates Mesquite to Houston", WED)).toBeNull();
    expect(detectDate("", WED)).toBeNull();
    expect(detectDate("   ", WED)).toBeNull();
  });

  it("reads tomorrow", () => {
    const d = detectDate("call them tomorrow", WED)!;
    expect(d.label).toBe("Tomorrow");
    expect(d.date).toBe("2026-08-27");
  });

  it("reads a weekday as the NEXT one, never today", () => {
    // Said on a Wednesday, "Friday" is this coming Friday.
    expect(detectDate("Call back Friday.", WED)!.date).toBe("2026-08-28");
    // And "Wednesday" said on Wednesday means next week, not this morning.
    expect(detectDate("Call back Wednesday.", WED)!.date).toBe("2026-09-02");
  });

  it("reads short weekday forms", () => {
    expect(detectDate("call back fri", WED)!.date).toBe("2026-08-28");
  });

  it("reads next week as the following Monday", () => {
    const d = detectDate("try again next week", WED)!;
    expect(d.label).toBe("Next week");
    expect(d.date).toBe("2026-08-31");
  });

  it("reads a month and day", () => {
    expect(detectDate("start of September 5", WED)!.date).toBe("2026-09-05");
    expect(detectDate("sept 5th", WED)!.date).toBe("2026-09-05");
  });

  it("rolls a month already gone into next year", () => {
    // February is behind us in August; they mean next February.
    expect(detectDate("february 3", WED)!.date).toBe("2027-02-03");
  });

  it("reads numeric dates with and without a year", () => {
    expect(detectDate("call 9/5", WED)!.date).toBe("2026-09-05");
    expect(detectDate("call 9/5/27", WED)!.date).toBe("2027-09-05");
  });

  it("ignores a numeric pattern that is not a date", () => {
    expect(detectDate("needs 20/30 pallets", WED)).toBeNull();
  });

  it("ignores a bare month with no day — that is context, not a date", () => {
    // "2-3 a week from September" is when the freight starts, not when to
    // call. A month on its own names a period; only month+day names a day.
    expect(detectDate("2-3 a week from September", WED)).toBeNull();
  });

  it("picks the instruction out of the mockup's real note", () => {
    // "Wants flatbed rates Mesquite → Houston, 2-3 a week from September.
    // Call back Friday." September is context; Friday is the instruction,
    // and Friday is what the mockup shows pre-selected.
    const d = detectDate(
      "Wants flatbed rates Mesquite to Houston, 2-3 a week from September. Call back Friday.",
      WED,
    )!;
    expect(d.label).toBe("Friday");
    expect(d.date).toBe("2026-08-28");
  });

  it("returns the matched text so the title can strip it", () => {
    expect(detectDate("Call back Friday.", WED)!.matched).toBe("friday");
  });
});

describe("warrantsFollowup", () => {
  it("does not propose chasing somebody who said no", () => {
    expect(warrantsFollowup("not_interested")).toBe(false);
    expect(warrantsFollowup("wrong_number")).toBe(false);
  });

  it("proposes one for every outcome that leaves something open", () => {
    for (const o of ["reached", "voicemail", "no_answer", "busy", "gatekeeper", "quote_requested"]) {
      expect(warrantsFollowup(o)).toBe(true);
    }
  });

  it("proposes nothing before an outcome is picked", () => {
    expect(warrantsFollowup(null)).toBe(false);
  });
});

describe("draftFollowupTitle", () => {
  it("uses the verb the outcome implies", () => {
    expect(draftFollowupTitle("", "quote_requested", null)).toBe("Send a quote");
    expect(draftFollowupTitle("", "voicemail", null)).toBe("Try again");
    expect(draftFollowupTitle("", "not_right_now", null)).toBe("Check back");
  });

  it("puts the rep's own words in the title, not a paraphrase", () => {
    const t = draftFollowupTitle("Wants flatbed rates Mesquite to Houston.", "quote_requested", null);
    expect(t).toBe("Send a quote — flatbed rates Mesquite to Houston");
  });

  it("strips a leading wants/needs/asked for", () => {
    expect(draftFollowupTitle("needs a rate to Laredo", "quote_requested", null)).toBe(
      "Send a quote — rate to Laredo",
    );
  });

  it("does not repeat the date the due date already carries", () => {
    const d = detectDate("Wants flatbed rates. Call back Friday.", WED)!;
    const t = draftFollowupTitle("Wants flatbed rates. Call back Friday.", "quote_requested", d);
    expect(t).toBe("Send a quote — flatbed rates");
    expect(t.toLowerCase()).not.toContain("friday");
  });

  it("stands on the verb alone rather than inventing detail", () => {
    expect(draftFollowupTitle("   ", "interested", null)).toBe("Follow up");
  });

  it("caps a rambling note so a title stays a title", () => {
    const long = "wants " + "flatbed ".repeat(30);
    const t = draftFollowupTitle(long, "quote_requested", null);
    expect(t.length).toBeLessThanOrEqual("Send a quote — ".length + 61);
    expect(t.endsWith("…")).toBe(true);
  });

  it("falls back to a generic verb for an outcome with no rule", () => {
    expect(draftFollowupTitle("", "something_new", null)).toBe("Follow up");
  });
});
