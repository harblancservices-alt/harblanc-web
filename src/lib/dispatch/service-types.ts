/**
 * Canonical "service type" catalog for the Maintenance redesign (Brent's
 * approved per-service model, 2026-08-08): every service is tracked by its
 * TYPE (Engine Oil & Filter, Tire Rotation, Brakes, ...), each with its own
 * history and its own logging, instead of one combined log.
 *
 * No new schema for this — a "type" is just `repair_entries.part_group` /
 * `repair_reminders.part_group` (already the join key between a reminder's
 * interval and the entries logged against it, `groupKey()`-normalized).
 * This module supplies the fixed BASELINE list Brent named so the screen
 * still shows a sane starting set before anything's been logged for them;
 * `lib/data/maintenance.ts`'s type-resolution folds in whatever real
 * part_groups already exist in the data (reminders and/or entries) on top
 * of this list, preferring real data over a placeholder whenever the two
 * refer to the same thing (matched via `aliases` below).
 *
 * Deliberately NOT the full `SUB_CATEGORIES` tree (repair-log.ts) — that's
 * ~35 entries; showing all of them as cards (most with zero history) would
 * turn Screen 1 into noise instead of the short, scannable list Brent's
 * mockup shows. This is the curated set he actually named, not every
 * mechanically-possible sub-category.
 */

import type { Category } from "./repair-log";

export type ServiceTypeDef = {
  slug: string;
  /** Card/header display text — Brent's exact wording. */
  label: string;
  category: Category;
  /** groupKey()-normalized text (besides the label itself) that should be
   * treated as the same type when it already exists in real data — lets a
   * differently-worded existing reminder/entry (e.g. "Fuel filters (engine
   * + chassis)") claim this canonical slot instead of creating a duplicate
   * card. */
  aliases: string[];
};

export const CANONICAL_SERVICE_TYPES: ServiceTypeDef[] = [
  { slug: "engine-oil-filter", label: "Engine Oil & Filter", category: "Engine Bay", aliases: ["engine oil and filter", "oil change", "oil & filter"] },
  { slug: "engine-air-filter", label: "Engine Air Filter", category: "Engine Bay", aliases: ["air filter"] },
  { slug: "fuel-filter", label: "Fuel Filter", category: "Engine Bay", aliases: ["fuel filters", "fuel filter(s)", "fuel filters (engine + chassis)"] },
  { slug: "def-filter", label: "DEF Filter", category: "Engine Bay", aliases: ["def", "def fluid"] },
  { slug: "tire-rotation", label: "Tire Rotation", category: "Tires & Wheels", aliases: [] },
  { slug: "brakes", label: "Brakes", category: "Brakes", aliases: ["brake pads", "brake service"] },
  { slug: "transmission-fluid", label: "Transmission Fluid", category: "Drivetrain", aliases: ["transmission fluid & filter"] },
  { slug: "coolant", label: "Coolant", category: "Engine Bay", aliases: ["coolant / antifreeze", "coolant flush", "antifreeze"] },
  { slug: "grease-lube", label: "Grease/Lube", category: "Steering & Suspension", aliases: ["greasing", "grease", "lube", "chassis grease"] },
];

/** URL-safe slug for a real (non-canonical) part_group, so every service
 * type — canonical or ad hoc — resolves to a stable Screen 2 route. */
export function slugify(text: string): string {
  const s = text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
  return s || "type";
}
