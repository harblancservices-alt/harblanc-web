import { describe, expect, it } from "vitest";
import { previewItems } from "./MobileActivity";
import type { CrmActivityLogItem } from "../ActivityLogSection";

/**
 * WHAT A PERSON WROTE IS NEVER BURIED BY THE AUDIT TRAIL.
 *
 * Tyler, 2026-08-28: logged a call and a note on Aztec Rental Center and
 * reported that the note "isn't appearing anywhere". Both rows were in the
 * database with his text intact. On a phone the inline preview took the
 * newest four items of ANY kind, and three automatic rows — "Task added",
 * "Task completed", "Task completed" — plus the call filled all four slots.
 * His note sorted seventh and fell off.
 *
 * The fixture below is that exact company, in that exact order.
 */

const mk = (
  id: string,
  type: CrmActivityLogItem["type"],
  occurredAt: string,
  title: string,
  body: string | null = null,
): CrmActivityLogItem => ({
  id, type, occurredAt, author: "Tyler Poland",
  contactId: null, contactName: null, title, body, followupAt: null,
});

const AZTEC: CrmActivityLogItem[] = [
  mk("a1", "activity", "2026-08-28T15:11:38.980Z", "Task completed: Follow up"),
  mk("a2", "activity", "2026-08-28T15:11:17.230Z", "Task completed: Research and qualify this company"),
  mk("a3", "activity", "2026-08-28T15:06:16.233Z", "Task added: Follow up with Sugarland Main Line"),
  mk("c1", "call", "2026-08-28T15:06:15.952Z", "Call", "Lenore _> Erick > OOO > Juan > an answering machine."),
  mk("a4", "activity", "2026-08-28T14:52:39.880Z", "Contact updated: Houston Main Line"),
  mk("a5", "activity", "2026-08-28T14:29:43.629Z", "Contact added: Sugarland Main Line"),
  mk("n1", "note", "2026-08-28T14:28:46.359Z", "Note", "Number off the website. contacting"),
  mk("a6", "activity", "2026-08-28T14:28:46.273Z", "Contact added: Houston Main Line"),
];

describe("the phone activity preview", () => {
  it("shows Tyler's note, which the old rule dropped", () => {
    const shown = previewItems(AZTEC);
    expect(shown.map((i) => i.id)).toContain("n1");
    expect(shown.map((i) => i.id)).toContain("c1");
  });

  it("would have dropped it under the old take-the-newest-four rule", () => {
    // Kept as the regression's fingerprint: if this ever stops being true,
    // the fixture no longer reproduces the bug and the test above proves
    // nothing.
    expect(AZTEC.slice(0, 4).map((i) => i.id)).not.toContain("n1");
  });

  it("gives every slot to calls and notes when there are any", () => {
    for (const i of previewItems(AZTEC)) {
      expect(["call", "note"]).toContain(i.type);
    }
  });

  it("keeps newest-first order among what it shows", () => {
    const shown = previewItems(AZTEC);
    const times = shown.map((i) => Date.parse(i.occurredAt));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it("still fills the preview when nobody has written anything yet", () => {
    // "Nothing has happened" and "nobody has written anything down" are
    // different statements. A company with only automatic events must not
    // render a blank panel.
    const eventsOnly = AZTEC.filter((i) => i.type === "activity");
    const shown = previewItems(eventsOnly);
    expect(shown).toHaveLength(4);
    expect(shown[0].id).toBe("a1");
  });

  it("returns nothing for a company with nothing on it", () => {
    expect(previewItems([])).toEqual([]);
  });

  it("never shows more than the preview count", () => {
    expect(previewItems(AZTEC, 2)).toHaveLength(2);
  });
});
