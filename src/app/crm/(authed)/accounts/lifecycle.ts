/**
 * The company lifecycle — the single ordered vocabulary the whole CRM shares.
 * A company moves LEFT → RIGHT through this 6-stage funnel; every surface
 * that renders or edits a lifecycle_status imports from here so the labels,
 * order, staleness clocks, and pill tones can never drift between the list,
 * the profile, the dashboard, and the create/edit form.
 *
 * 2026-08-22 rebuild (CRM_URGENCY_AUDIT.md): the old 9-value set (lead,
 * researching, contacted, prospect, in_the_door, quoted, active_customer,
 * inactive, lost — with "quoted" silently rewritten to "active_customer" on
 * every write) is replaced with exactly 6 REAL, independently-storable
 * stages. Nothing rewrites itself on write anymore — clicking "Quoting"
 * stores "quoting"; clicking "Active Customer" stores "active_customer". The
 * old quoted→active_customer "graduation" special-case is gone along with
 * the extra confirm-modal it needed; each stage is now just a stage.
 *
 * The whole point of this rebuild is that each stage DOES something (see
 * STALE_DAYS_BY_STAGE and lib/crm/stageAutomation.ts) instead of being a
 * label + timeline entry — see CRM_URGENCY_AUDIT.md for the full trace of
 * what used to be inert.
 *
 * lifecycle_status is a plain text column with no DB check constraint
 * (confirmed live before "quoted" was ever added), so swapping the
 * vocabulary needed no migration — only a data remap of EXISTING rows,
 * which normalizeStage below makes safe to run whenever, since every reader
 * already tolerates old values mid-migration.
 */
export const LIFECYCLE_STAGES = [
  "new_lead",
  "researching",
  "contacted",
  "quoting",
  "active_customer",
  "lost",
] as const;

export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

/** The ordered funnel the profile's chevron stage tracker walks — every
 * stage is now selectable/clickable directly (no hidden terminal bucket). */
export const SELECTABLE_LIFECYCLE_STAGES = LIFECYCLE_STAGES;

export const DEFAULT_LIFECYCLE: LifecycleStage = "new_lead";

/** Human label for a stage. */
export const LIFECYCLE_LABEL: Record<LifecycleStage, string> = {
  new_lead: "New Lead",
  researching: "Researching",
  contacted: "Contacted",
  quoting: "Quoting",
  active_customer: "Active Customer",
  lost: "Lost",
};

/**
 * Pill tone per stage. Grouped so the progression reads at a glance:
 * cold (slate) → in-motion (steel) → won (green), with red for the terminal
 * drop-out stage.
 */
export const LIFECYCLE_TONE: Record<LifecycleStage, string> = {
  new_lead: "bg-slate-bg text-slate",
  researching: "bg-slate-bg text-slate",
  contacted: "bg-steel-bg text-steel",
  quoting: "bg-steel-bg text-steel",
  active_customer: "bg-ok-bg text-ok",
  lost: "bg-bad-bg text-bad",
};

/** Old, no-longer-selectable raw values mapped onto the current 6-stage
 * funnel. Anything not found here or in LIFECYCLE_STAGES falls back to
 * DEFAULT_LIFECYCLE. Covers both the pre-2026-08-09 5-stage vocabulary
 * ("qualified"/"customer") and the 2026-08-09..2026-08-22 7-stage vocabulary
 * this rebuild replaces (lead/prospect/in_the_door/quoted/inactive). */
function legacyAlias(value: string): LifecycleStage | null {
  if (value === "lead") return "new_lead";
  if (value === "prospect") return "new_lead";
  if (value === "qualified") return "new_lead"; // old alias resolved to "prospect", which now resolves to "new_lead"
  if (value === "in_the_door") return "contacted";
  if (value === "quoted") return "quoting";
  if (value === "customer") return "active_customer";
  // "inactive" was a second terminal/dropped-out state alongside "lost" in
  // the old model; the new model has one terminal stage, so it folds in.
  if (value === "inactive") return "lost";
  return null;
}

/** Normalize an arbitrary stored value to a known stage (falls back to
 * new_lead). The ONLY place old-vocabulary values (from any prior rebuild)
 * converge on the current canonical stage — every reader goes through this,
 * so old rows render/behave correctly even before Dispatch runs the data
 * remap (see the recommended remap SQL in the rebuild's commit/report). */
export function normalizeStage(value: string | null | undefined): LifecycleStage {
  const v = (value ?? "").trim().toLowerCase();
  return (LIFECYCLE_STAGES as readonly string[]).includes(v)
    ? (v as LifecycleStage)
    : (legacyAlias(v) ?? DEFAULT_LIFECYCLE);
}

export function stageLabel(value: string | null | undefined): string {
  return LIFECYCLE_LABEL[normalizeStage(value)];
}

export function stageTone(value: string | null | undefined): string {
  return LIFECYCLE_TONE[normalizeStage(value)];
}

/** Stage → shared Badge tone, matching /crm-design's 6-tone Badge set —
 * neutral for cold/not-yet-moving stages, accent for in-motion, success for
 * won, danger for the terminal drop-out stage. */
export const LIFECYCLE_BADGE_TONE: Record<LifecycleStage, "neutral" | "accent" | "success" | "warning" | "danger"> = {
  new_lead: "neutral",
  researching: "neutral",
  contacted: "accent",
  quoting: "accent",
  active_customer: "success",
  lost: "danger",
};

export function stageBadgeTone(value: string | null | undefined): "neutral" | "accent" | "success" | "warning" | "danger" {
  return LIFECYCLE_BADGE_TONE[normalizeStage(value)];
}

/** Position of a stage within the ordered funnel — lower rank = earlier
 * stage. The single place any caller should compare two stages' progress,
 * so "is this company far enough along that I shouldn't touch its stage"
 * checks (e.g. the BOL/OTR promote-to-Prospects no-downgrade guardrail —
 * never re-set a company that's already further along than New Lead) stay
 * centralized instead of each caller re-deriving an index into
 * LIFECYCLE_STAGES itself. "lost" sits last, so it naturally ranks "at or
 * beyond" everything else here too — a dropped-out company is never
 * silently revived by a rank comparison alone. */
export function stageRank(stage: LifecycleStage): number {
  return LIFECYCLE_STAGES.indexOf(stage);
}

/**
 * Per-stage staleness clocks (CRM_URGENCY_AUDIT.md P0) — the single source
 * of truth for "how many days of no contact/activity before this account
 * resurfaces on the dashboard's Next Best Action queue as going stale."
 * Every stage below has a real, distinct threshold instead of the old flat
 * 7-day rule that treated a brand-new Lead the same as an account that had
 * already been Quoted. A stage with NO entry here never nags (active_customer
 * — a won account has nothing to chase) and "lost" is handled separately by
 * the win-back clock below, not this table.
 *
 * new_lead is measured differently from every other stage: it has no contact
 * to be stale FROM (it's unclaimed, sitting in the Prospects queue), so its
 * clock runs off crm_accounts.created_at ("how long has this sat unclaimed")
 * rather than last-contact activity — see the dashboard's staleness builder
 * for exactly where that split happens.
 */
export const STALE_DAYS_BY_STAGE: Partial<Record<LifecycleStage, number>> = {
  new_lead: 3,
  researching: 5,
  contacted: 5,
  quoting: 1,
};

/** Lost win-back clock (days of quiet before a dropped-out account resurfaces
 * as a "reach back out" candidate) — see lib/crm/stageAutomation.ts for the
 * read-time lazy task creation this drives. Kept here alongside
 * STALE_DAYS_BY_STAGE since it's the same "per-stage clock" concept, just for
 * the one stage that isn't part of the active funnel. */
export const LOST_WINBACK_DAYS = 45;
