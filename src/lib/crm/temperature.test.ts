import { describe, expect, it } from "vitest";
import { temperatureOf, TEMPERATURE_DOT, TEMPERATURE_LABEL } from "./temperature";
import { LIFECYCLE_STAGES, STALE_DAYS_BY_STAGE } from "@/app/crm/(authed)/accounts/lifecycle";

const NOW = Date.parse("2026-08-26T12:00:00Z");
const DAY = 86_400_000;
const ago = (d: number) => NOW - d * DAY;

describe("temperatureOf", () => {
  it("calls never-contacted UNSTARTED, not cold", () => {
    // The distinction the whole scale turns on: cold means a relationship
    // went quiet; unstarted means there is no relationship yet. Different
    // action — start, not chase.
    expect(temperatureOf({ stage: "new_lead", lastContactMs: null, now: NOW })).toBe("unstarted");
    expect(temperatureOf({ stage: "quoting", lastContactMs: null, now: NOW })).toBe("unstarted");
  });

  it("reports unstarted even for a stage that has no clock", () => {
    // "Never contacted" is true regardless of whether the stage nags.
    expect(temperatureOf({ stage: "active", lastContactMs: null, now: NOW })).toBe("unstarted");
  });

  it("measures against the STAGE's clock, not a flat number of days", () => {
    // Three days of silence: fine for a new lead (3-day clock, exactly at
    // it), overdue for a quote (1-day clock).
    expect(temperatureOf({ stage: "quoting", lastContactMs: ago(3), now: NOW })).toBe("cold");
    expect(temperatureOf({ stage: "contacted", lastContactMs: ago(3), now: NOW })).toBe("warm");
  });

  it("is hot inside the first third of the stage's patience", () => {
    // contacted = 5 days, so a third is 1.67.
    expect(temperatureOf({ stage: "contacted", lastContactMs: ago(1), now: NOW })).toBe("hot");
    expect(temperatureOf({ stage: "contacted", lastContactMs: ago(4), now: NOW })).toBe("warm");
  });

  it("goes cold exactly AT the threshold, not after it", () => {
    const days = STALE_DAYS_BY_STAGE.contacted!;
    expect(temperatureOf({ stage: "contacted", lastContactMs: ago(days), now: NOW })).toBe("cold");
    expect(temperatureOf({ stage: "contacted", lastContactMs: ago(days - 0.1), now: NOW })).toBe("warm");
  });

  it("returns null for the stages that deliberately have no clock", () => {
    // A won account has nothing to chase, "gone quiet" IS what Dormant
    // means, and the two terminal stages are closed on purpose.
    for (const stage of ["active", "dormant", "lost", "disqualified"] as const) {
      expect(temperatureOf({ stage, lastContactMs: ago(400), now: NOW })).toBeNull();
    }
  });

  it("resolves legacy stored stages before deciding", () => {
    // `researching` maps to New Lead (3-day clock).
    expect(temperatureOf({ stage: "researching", lastContactMs: ago(5), now: NOW })).toBe("cold");
    // `active_customer` maps to Active, which has no clock.
    expect(temperatureOf({ stage: "active_customer", lastContactMs: ago(400), now: NOW })).toBeNull();
  });

  it("treats a future timestamp as hot rather than throwing or reading cold", () => {
    expect(temperatureOf({ stage: "contacted", lastContactMs: NOW + DAY, now: NOW })).toBe("hot");
  });

  it("never returns a temperature for a stage with no threshold, at any age", () => {
    for (const stage of LIFECYCLE_STAGES) {
      const hasClock = STALE_DAYS_BY_STAGE[stage] !== undefined;
      const t = temperatureOf({ stage, lastContactMs: ago(1), now: NOW });
      expect(t === null).toBe(!hasClock);
    }
  });
});

describe("the marker", () => {
  it("has a class and a plain-English meaning for every state", () => {
    for (const t of ["unstarted", "hot", "warm", "cold"] as const) {
      expect(TEMPERATURE_DOT[t]).toBeTruthy();
      expect(TEMPERATURE_LABEL[t]).toBeTruthy();
      // The label has to say WHY, not just repeat the colour name.
      expect(TEMPERATURE_LABEL[t].toLowerCase()).not.toBe(t);
    }
  });

  it("draws unstarted as a hollow ring, not a temperature colour", () => {
    expect(TEMPERATURE_DOT.unstarted).toContain("bg-transparent");
    for (const t of ["hot", "warm", "cold"] as const) {
      expect(TEMPERATURE_DOT[t]).not.toContain("transparent");
    }
  });
});
