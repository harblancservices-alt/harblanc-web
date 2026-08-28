import { describe, expect, it } from "vitest";
import { CRM_ACTIVITY } from "@/lib/crm/activity";
import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_STYLE,
  categoryForKind,
  kindsForCategory,
  viewHref,
} from "./activityTypes";

describe("activity categories", () => {
  it("maps the kinds an agent actually generates", () => {
    expect(categoryForKind(CRM_ACTIVITY.call)).toBe("call");
    expect(categoryForKind(CRM_ACTIVITY.noteAdded)).toBe("note");
    expect(categoryForKind(CRM_ACTIVITY.accountCreated)).toBe("company");
    expect(categoryForKind(CRM_ACTIVITY.contactAdded)).toBe("contact");
    expect(categoryForKind(CRM_ACTIVITY.taskCreated)).toBe("task");
    expect(categoryForKind(CRM_ACTIVITY.taskCompleted)).toBe("task");
  });

  it("falls an unknown kind to 'other' rather than dropping it", () => {
    // A kind added later must still appear in the feed. Silently hiding a
    // real event is the one thing an accountability log must never do.
    expect(categoryForKind("something_invented_next_year")).toBe("other");
    expect(categoryForKind(null)).toBe("other");
  });

  it("gives every category a style, so no badge can render unthemed", () => {
    for (const c of ACTIVITY_CATEGORIES) {
      expect(ACTIVITY_STYLE[c]).toBeDefined();
      expect(ACTIVITY_STYLE[c].tone.length).toBeGreaterThan(0);
    }
  });

  it("uses TINTS, never a solid accent fill", () => {
    // The composer owns filled blue/green/red for controls. An activity
    // badge that rendered as `bg-accent` would read as a button.
    // Compare exact class tokens, not substrings: a regex word boundary
    // treats the hyphen in `bg-accent-bg` as a break, so /\bbg-accent\b/
    // would flag the tint as if it were the solid fill.
    const SOLID = new Set(["bg-accent", "bg-ok", "bg-bad", "bg-warn", "bg-admin"]);
    for (const c of ACTIVITY_CATEGORIES) {
      for (const cls of ACTIVITY_STYLE[c].tone.split(/\s+/)) {
        expect(SOLID.has(cls)).toBe(false);
      }
    }
  });

  it("never spends RED on an activity type", () => {
    // Red is taken. It means overdue / destructive across the CRM, so any
    // badge wearing it would claim an urgency the event does not have.
    for (const c of ACTIVITY_CATEGORIES) {
      const style = ACTIVITY_STYLE[c];
      expect(`${style.tone} ${style.dot}`).not.toContain("bad");
    }
  });

  it("gives every category a visually distinct tone", () => {
    // Two categories sharing a tone makes the badge decorative rather than
    // informative. Grey is the deliberate exception: note and other are
    // both "no strong signal", and saying so twice is correct.
    const tones = ACTIVITY_CATEGORIES.filter((c) => c !== "note" && c !== "other").map(
      (c) => ACTIVITY_STYLE[c].tone,
    );
    expect(new Set(tones).size).toBe(tones.length);
  });

  it("round-trips a category through its kinds", () => {
    for (const kind of kindsForCategory("task")) {
      expect(categoryForKind(kind)).toBe("task");
    }
    expect(kindsForCategory("task")).toContain(CRM_ACTIVITY.taskCreated);
  });
});

describe("viewHref — no dead ends", () => {
  it("sends a contact event to that contact", () => {
    expect(viewHref({ category: "contact", accountId: "a1", contactId: "c1" })).toBe(
      "/crm/contacts/c1",
    );
  });

  it("deep-links a call about a person to their card on the company", () => {
    expect(viewHref({ category: "call", accountId: "a1", contactId: "c1" })).toBe(
      "/crm/accounts/a1#contact-c1",
    );
  });

  it("sends a task to the company, where tasks are actually worked", () => {
    // There is no per-task route in this CRM; the company profile's Tasks
    // card is the real destination.
    expect(viewHref({ category: "task", accountId: "a1", contactId: null })).toBe(
      "/crm/accounts/a1",
    );
  });

  it("falls back to the contact when there is no company", () => {
    expect(viewHref({ category: "note", accountId: null, contactId: "c1" })).toBe(
      "/crm/contacts/c1",
    );
  });

  it("returns null rather than a button that goes nowhere", () => {
    expect(viewHref({ category: "other", accountId: null, contactId: null })).toBeNull();
  });
});
