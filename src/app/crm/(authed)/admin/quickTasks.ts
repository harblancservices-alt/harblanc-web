/**
 * Validation for Admin → Overview's one-click task buttons.
 *
 * PERSISTED as of 2026-08-25 in public.crm_quick_tasks, one row per button,
 * shared org-wide and soft-deleted. This module holds only the pure rules;
 * the reads and writes live in quick-task-actions.ts.
 *
 * localStorage was ruled out: it is per-browser, so one rep's additions would
 * be invisible to everyone else — worse than not having the feature.
 *
 * WORDING of the seeded set (see the migration). These are what a freight
 * salesperson would actually write on a follow-up, not generic CRM verbs.
 * "Call them back" became "Call or reach out" — a rep emails and texts at
 * least as often as they dial, and "back" wrongly implies the customer called
 * first.
 *
 * DEFAULT_QUICK_TASKS is kept as the seed's mirror so the migration's list
 * has one place to be read from in tests. It is NOT what the UI renders —
 * the UI renders rows.
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
