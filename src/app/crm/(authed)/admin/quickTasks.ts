/**
 * The one-click task labels on Admin → Overview's composer.
 *
 * ⚠️ NOT PERSISTED YET. Buttons added or deleted through the UI live in React
 * state for the session only — reload and this list is back. That is
 * deliberate: custom quick tasks have to be shared by everyone in the org, so
 * they belong in the database, and adding a table or a column is a schema
 * change Brent has not approved. The UI is built and wired so it can be felt;
 * the moment a store exists, DEFAULT_QUICK_TASKS becomes the seed and the
 * component's local state becomes a fetch. See the report for the two shapes
 * on offer.
 *
 * localStorage was ruled out explicitly: it is per-browser, so one rep's
 * additions would be invisible to everyone else, which is worse than not
 * having the feature.
 *
 * WORDING. These are what a freight salesperson would actually write on a
 * follow-up, not generic CRM verbs. "Call them back" was replaced with "Call
 * or reach out" — a rep emails and texts at least as often as they dial, and
 * "back" wrongly implies the customer called first.
 */
export const DEFAULT_QUICK_TASKS: readonly string[] = [
  "Call or reach out",
  "Follow up",
  "Research this company",
  "Send a quote",
  "Ask about upcoming loads",
  "Get their lanes",
  "Chase the PO",
  "Confirm pickup details",
  "Send the carrier packet",
  "Re-engage — gone quiet",
  "Update contact info",
  "Schedule a check-in",
];

/** Trim, collapse inner whitespace, and cap length so a pasted paragraph
 * can't become a button. Returns null when there is nothing usable left. */
export function normalizeQuickTask(raw: string): string | null {
  const cleaned = raw.trim().replace(/\s+/g, " ");
  if (!cleaned) return null;
  return cleaned.slice(0, 40);
}

/** Case-insensitive duplicate check — two buttons reading "Follow up" and
 * "follow up" are the same button to the person clicking them. */
export function isDuplicateQuickTask(existing: readonly string[], candidate: string): boolean {
  const c = candidate.toLowerCase();
  return existing.some((e) => e.toLowerCase() === c);
}
