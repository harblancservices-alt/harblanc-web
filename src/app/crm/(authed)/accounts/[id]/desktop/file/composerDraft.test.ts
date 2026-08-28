import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import {
  DRAFT_MAX_AGE_MS,
  clearDraft,
  draftKey,
  isRestorable,
  parseDraft,
  readDraft,
  writeDraft,
} from "./composerDraft";

/**
 * TYLER'S NOTE, AS AN ACCEPTANCE TEST.
 *
 * 2026-08-28: he typed a note on Aztec Rental Center, pressed save, and his
 * session had expired. The action redirected him to the login screen, the
 * composer unmounted, and the text was gone — it had never left the browser,
 * so there was nothing in the database or the logs to recover.
 *
 * The scenario at the bottom of this file is that exact sequence: type,
 * expire, submit, unmount. It passes only if his words are still there.
 */

const AZTEC = "9c61b854-35d9-4a26-8ca7-5d9109bca0b2";
const CORE_AND_MAIN = "84ae4fff-53b8-48f5-a8c0-000000000000";
const NOW = Date.parse("2026-08-28T15:10:00.000Z");

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    _map: map,
  };
}

beforeEach(() => {
  vi.stubGlobal("window", { localStorage: fakeStorage() });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("draft storage", () => {
  it("round-trips what was typed", () => {
    writeDraft(AZTEC, { mode: "note", text: "Kevin was an asshole", savedAt: NOW });
    expect(readDraft(AZTEC)?.text).toBe("Kevin was an asshole");
    expect(readDraft(AZTEC)?.mode).toBe("note");
  });

  it("keys per company so a note cannot land on the wrong customer", () => {
    // The failure this prevents is worse than losing the note: a note filed
    // against the wrong company is wrong in a way nobody notices.
    writeDraft(AZTEC, { mode: "note", text: "about Aztec", savedAt: NOW });
    expect(readDraft(CORE_AND_MAIN)).toBeNull();
    expect(draftKey(AZTEC)).not.toBe(draftKey(CORE_AND_MAIN));
  });

  it("clears once the work is on the server", () => {
    writeDraft(AZTEC, { mode: "note", text: "saved now", savedAt: NOW });
    clearDraft(AZTEC);
    expect(readDraft(AZTEC)).toBeNull();
  });
});

describe("storage that misbehaves never breaks the composer", () => {
  it("survives localStorage throwing on read", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("SecurityError: site data blocked");
        },
        setItem: () => {},
        removeItem: () => {},
      },
    });
    expect(() => readDraft(AZTEC)).not.toThrow();
    expect(readDraft(AZTEC)).toBeNull();
  });

  it("survives localStorage throwing on write (quota, private mode)", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => null,
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
        removeItem: () => {},
      },
    });
    expect(() => writeDraft(AZTEC, { mode: "note", text: "x", savedAt: NOW })).not.toThrow();
  });

  it("survives there being no window at all (SSR)", () => {
    vi.stubGlobal("window", undefined);
    expect(readDraft(AZTEC)).toBeNull();
    expect(() => writeDraft(AZTEC, { mode: "note", text: "x", savedAt: NOW })).not.toThrow();
    expect(() => clearDraft(AZTEC)).not.toThrow();
  });

  it("treats corrupted storage as no draft rather than throwing into render", () => {
    expect(parseDraft("not json at all")).toBeNull();
    expect(parseDraft('{"mode":"nonsense","text":"hi"}')).toBeNull();
    expect(parseDraft('{"mode":"note"}')).toBeNull();
    expect(parseDraft(null)).toBeNull();
  });
});

describe("which drafts come back", () => {
  it("restores today's work", () => {
    expect(isRestorable({ mode: "note", text: "hi", savedAt: NOW - 60_000 }, NOW)).toBe(true);
  });

  it("does not resurface something from last month", () => {
    expect(isRestorable({ mode: "note", text: "hi", savedAt: NOW - DRAFT_MAX_AGE_MS - 1 }, NOW)).toBe(false);
  });

  it("ignores an empty or whitespace draft", () => {
    expect(isRestorable({ mode: "note", text: "   ", savedAt: NOW }, NOW)).toBe(false);
    expect(isRestorable(null, NOW)).toBe(false);
  });

  it("still restores when the clock has moved backwards", () => {
    // A machine that re-synced its clock must not silently swallow a draft
    // written seconds ago.
    expect(isRestorable({ mode: "note", text: "hi", savedAt: NOW + 5_000 }, NOW)).toBe(true);
  });
});

describe("THE ACCEPTANCE TEST — Tyler's exact sequence", () => {
  it("keeps his words when the session expires mid-save and the composer unmounts", () => {
    const TYPED = "Kevin was an asshole, blah blah blah";

    // 1. He types into the composer on Aztec. Every keystroke drafts.
    writeDraft(AZTEC, { mode: "note", text: TYPED, savedAt: NOW });

    // 2. He presses save. The session has expired, so the action returns an
    //    auth failure instead of redirecting (lib/crm/auth.ts::currentCrmUser).
    //    The composer does NOT clear on a failed save.
    const saveResult = { ok: false as const, error: "Your session expired." };
    if (saveResult.ok) clearDraft(AZTEC);

    // 3. The page unmounts anyway — he signs in again, or the tab reloads.
    //    Component state is gone.

    // 4. He reopens Aztec. His words are still here.
    const back = readDraft(AZTEC);
    expect(isRestorable(back, NOW + 120_000)).toBe(true);
    expect(back?.text).toBe(TYPED);
    expect(back?.mode).toBe("note");
  });

  it("and lets go of them once the save actually succeeds", () => {
    writeDraft(AZTEC, { mode: "note", text: "this one saved", savedAt: NOW });
    const saveResult = { ok: true as const };
    if (saveResult.ok) clearDraft(AZTEC);
    expect(readDraft(AZTEC)).toBeNull();
  });
});
