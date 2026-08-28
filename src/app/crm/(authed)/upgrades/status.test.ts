import { describe, expect, it } from "vitest";
import {
  ACTIVE_STATUSES,
  UPGRADE_STATUSES,
  UPGRADE_STATUS_STYLE,
  isUpgradeStatus,
  statusStyle,
} from "./status";

/**
 * The Upgrades vocabulary, pinned.
 *
 * These four values are also a CHECK constraint in the database (migration
 * 20260828010000). The old set — new / in_review / done — drifted from what
 * the UI showed, and `in_review` sat in the code for months without a single
 * row ever using it. If this list and the constraint disagree, every status
 * write fails in production and passes every local test, so the exact
 * strings are asserted here rather than just their shape.
 */

describe("upgrade status vocabulary", () => {
  it("is exactly the four values the database allows", () => {
    expect([...UPGRADE_STATUSES]).toEqual(["open", "in_progress", "completed", "closed"]);
  });

  it("rejects the retired vocabulary", () => {
    // Rows carrying these were migrated. Nothing should write them again.
    expect(isUpgradeStatus("new")).toBe(false);
    expect(isUpgradeStatus("in_review")).toBe(false);
    expect(isUpgradeStatus("done")).toBe(false);
  });

  it("treats an unknown status as displayable rather than blank", () => {
    // A card that renders nothing is worse than one that says "unknown".
    const s = statusStyle("something_else");
    expect(s.label).toBe("something_else");
    expect(s.pill.length).toBeGreaterThan(0);
  });

  it("counts only open and in-progress as still waiting on someone", () => {
    expect([...ACTIVE_STATUSES]).toEqual(["open", "in_progress"]);
  });
});

describe("status colour keeps its meanings straight", () => {
  it("never paints OPEN red", () => {
    // Red is Delete on this very page, and overdue everywhere else in the
    // CRM. A correctly-filed report waiting its turn is not an error.
    const open = UPGRADE_STATUS_STYLE.open;
    expect(`${open.pill} ${open.dot}`).not.toContain("bad");
  });

  it("reserves green for completed, so 'fixed' reads at a glance", () => {
    const greens = UPGRADE_STATUSES.filter((s) =>
      UPGRADE_STATUS_STYLE[s].dot.includes("bg-ok"),
    );
    expect(greens).toEqual(["completed"]);
  });

  it("gives every status its own tone", () => {
    const pills = UPGRADE_STATUSES.map((s) => UPGRADE_STATUS_STYLE[s].pill);
    expect(new Set(pills).size).toBe(pills.length);
  });

  it("explains in plain words what each status means for the reporter", () => {
    for (const s of UPGRADE_STATUSES) {
      expect(UPGRADE_STATUS_STYLE[s].meaning.length).toBeGreaterThan(10);
    }
  });
});
