/**
 * The company lifecycle — the single ordered vocabulary the whole CRM shares.
 * A company moves LEFT → RIGHT through the 7-stage funnel; the two terminal
 * states (inactive, lost) sit outside it for companies that dropped out.
 * Every surface that renders or edits a lifecycle_status imports from here so
 * the labels, order, and pill tones can never drift between the list, the
 * profile, and the create/edit form.
 *
 * 2026-08-09 rebuild: the funnel grew from 5 stages to 7 — Lead → Researching
 * → Contacted → Prospect → In the Door → Quoted → Active Customer — and every
 * stage now stores a canonical lowercase slug (see LIFECYCLE_STAGES). Rows
 * already sitting on old free-text values (mixed-case "Lead", the old
 * "qualified"/"customer" slugs) still resolve correctly through
 * normalizeStage, which is the ONLY place old→new stage mapping happens:
 *   - "qualified"  → "prospect"        (closest analog in the new funnel)
 *   - "customer"   → "active_customer" (explicit final-stage rename)
 *   - "quoted"     → "active_customer" (see graduation rule below)
 * lifecycle_status is a plain text column with no DB check constraint
 * (confirmed live before adding "quoted" originally), so none of this needed
 * a migration.
 *
 * Graduation rule (Brent's call): sending a quote is this shop's real signal
 * that an account is active, so reaching "Quoted" immediately graduates the
 * company straight to "Active Customer" — normalizeStage never returns
 * "quoted" for ANY input, old or new. "quoted" stays a real funnel member
 * (SELECTABLE_LIFECYCLE_STAGES / LIFECYCLE_LABEL) purely so the profile's
 * stage tracker still has a "Quoted" chevron to click; clicking it writes
 * "active_customer", and Quoted then reads as the completed step right
 * before it, same as any other done stage.
 */
export const LIFECYCLE_STAGES = [
  "lead",
  "researching",
  "contacted",
  "prospect",
  "in_the_door",
  "quoted",
  "active_customer",
  "inactive",
  "lost",
] as const;

export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

/** The ordered funnel the profile's chevron stage tracker walks. */
export const SELECTABLE_LIFECYCLE_STAGES = [
  "lead",
  "researching",
  "contacted",
  "prospect",
  "in_the_door",
  "quoted",
  "active_customer",
] as const satisfies readonly LifecycleStage[];

export const DEFAULT_LIFECYCLE: LifecycleStage = "lead";

/** Human label for a stage. */
export const LIFECYCLE_LABEL: Record<LifecycleStage, string> = {
  lead: "Lead",
  researching: "Researching",
  contacted: "Contacted",
  prospect: "Prospect",
  in_the_door: "In the Door",
  quoted: "Quoted",
  active_customer: "Active Customer",
  inactive: "Inactive",
  lost: "Lost",
};

/**
 * Pill tone per stage. Grouped so the progression reads at a glance:
 * cold (slate) → in-motion (steel) → won (green), with amber/red terminals.
 */
export const LIFECYCLE_TONE: Record<LifecycleStage, string> = {
  lead: "bg-slate-bg text-slate",
  researching: "bg-slate-bg text-slate",
  contacted: "bg-steel-bg text-steel",
  prospect: "bg-steel-bg text-steel",
  in_the_door: "bg-steel-bg text-steel",
  quoted: "bg-steel-bg text-steel",
  active_customer: "bg-ok-bg text-ok",
  inactive: "bg-warn-bg text-warn",
  lost: "bg-bad-bg text-bad",
};

/** Old, no-longer-selectable raw values mapped onto the current 7-stage
 * funnel. Anything not found here or in LIFECYCLE_STAGES falls back to
 * DEFAULT_LIFECYCLE. */
function legacyAlias(value: string): LifecycleStage | null {
  if (value === "qualified") return "prospect";
  if (value === "customer") return "active_customer";
  return null;
}

/** Normalize an arbitrary stored value to a known stage (falls back to lead).
 * Also applies the "quoted" → "active_customer" graduation rule, so this is
 * the single place both old-vocabulary and new-vocabulary values converge on
 * the current canonical stage. */
export function normalizeStage(value: string | null | undefined): LifecycleStage {
  const v = (value ?? "").trim().toLowerCase();
  const resolved: LifecycleStage = (LIFECYCLE_STAGES as readonly string[]).includes(v)
    ? (v as LifecycleStage)
    : (legacyAlias(v) ?? DEFAULT_LIFECYCLE);
  return resolved === "quoted" ? "active_customer" : resolved;
}

export function stageLabel(value: string | null | undefined): string {
  return LIFECYCLE_LABEL[normalizeStage(value)];
}

export function stageTone(value: string | null | undefined): string {
  return LIFECYCLE_TONE[normalizeStage(value)];
}
