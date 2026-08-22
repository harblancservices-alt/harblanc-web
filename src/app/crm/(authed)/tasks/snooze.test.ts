import { describe, it, expect } from "vitest";
import { snoozeDays, snoozedDueAt, SNOOZE_PRESETS } from "./snooze";

/**
 * The task card's Snooze dropdown writes due_at directly, with no confirming
 * form in between — so the branch that decides WHICH date it writes is worth
 * pinning down. The interesting case is the overdue one: shifting a stale due
 * date by N days just produces another overdue task, which is the single most
 * confusing thing a snooze button could do.
 *
 * Times are asserted in America/Chicago (the CRM's fixed display timezone),
 * never the machine's, so these pass on any runner.
 */

const CENTRAL = "America/Chicago";

function centralParts(iso: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour === "24" ? "00" : p.hour}:${p.minute}`,
  };
}

describe("snoozeDays", () => {
  it("resolves each preset the card renders", () => {
    expect(snoozeDays("1d")).toBe(1);
    expect(snoozeDays("3d")).toBe(3);
    expect(snoozeDays("week")).toBe(7);
  });

  it("rejects anything not on the preset list", () => {
    // The server action's only validation — a tampered request must not be
    // able to push a task an arbitrary distance out.
    expect(snoozeDays("999d")).toBeNull();
    expect(snoozeDays("")).toBeNull();
    expect(snoozeDays("1D")).toBeNull();
  });

  it("covers every exported preset", () => {
    for (const p of SNOOZE_PRESETS) expect(snoozeDays(p.key)).toBe(p.days);
  });
});

describe("snoozedDueAt", () => {
  // A Tuesday, 2:30 PM Central.
  const now = new Date("2026-08-18T19:30:00.000Z");

  it("shifts a FUTURE due date by N days and keeps the time of day", () => {
    const due = "2026-08-20T19:00:00.000Z"; // 2:00 PM Central, two days out
    const next = snoozedDueAt(due, 1, now)!;
    expect(centralParts(next)).toEqual({ date: "2026-08-21", time: "14:00" });
  });

  it("shifts a future due date by 3 days and by a week", () => {
    const due = "2026-08-20T19:00:00.000Z";
    expect(centralParts(snoozedDueAt(due, 3, now)!).date).toBe("2026-08-23");
    expect(centralParts(snoozedDueAt(due, 7, now)!).date).toBe("2026-08-27");
  });

  it("re-bases an OVERDUE task off NOW, not off its stale due date", () => {
    // 9 days late. Shifting the old date would land on 2026-08-10 — still a
    // week overdue. It must land tomorrow instead.
    const stale = "2026-08-09T14:00:00.000Z";
    const next = snoozedDueAt(stale, 1, now)!;
    expect(centralParts(next)).toEqual({ date: "2026-08-19", time: "08:00" });
  });

  it("gives an undated task a real due date", () => {
    const next = snoozedDueAt(null, 3, now)!;
    expect(centralParts(next)).toEqual({ date: "2026-08-21", time: "08:00" });
  });

  it("always lands strictly in the future", () => {
    for (const due of [null, "2026-08-01T00:00:00.000Z", "2026-08-19T12:00:00.000Z"]) {
      for (const days of [1, 3, 7]) {
        const next = snoozedDueAt(due, days, now)!;
        expect(new Date(next).getTime()).toBeGreaterThan(now.getTime());
      }
    }
  });
});
