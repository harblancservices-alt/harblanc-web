/**
 * The company lifecycle — the single ordered vocabulary the whole CRM shares.
 * A company moves LEFT → RIGHT through these stages; the two terminal states
 * (inactive, lost) sit at the end. Every surface that renders or edits a
 * lifecycle_status imports from here so the labels, order, and pill tones can
 * never drift between the list, the profile, and the create/edit form.
 *
 * Tones are the design-system's FIXED status tints (bg-*-bg / text-*), which
 * are theme-independent aliases — safe to sit on a white .crm-light card per
 * the core rule (colour only on fixed surfaces).
 *
 * LIFECYCLE_STAGES is the full historical vocabulary — kept so normalize/
 * label/tone stay correct for any company already sitting in "qualified" (or
 * "inactive"/"lost"), stages dropped from the active funnel at various
 * points. SELECTABLE_LIFECYCLE_STAGES is the funnel the profile's chevron
 * stage tracker (StageTracker.tsx) actually walks — the approved 5-stage
 * pipeline (Lead → Researching → Contacted → Quoted → Customer). "quoted" is
 * a plain text column with no DB check constraint (confirmed live before
 * adding it here), so this needed no migration. A company already on
 * "qualified"/"inactive"/"lost" still displays correctly (normalizeStage
 * still recognizes it) but reads as a legacy stage outside the tracker.
 */
export const LIFECYCLE_STAGES = [
  "lead",
  "researching",
  "contacted",
  "quoted",
  "qualified",
  "customer",
  "inactive",
  "lost",
] as const;

export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

/** The ordered funnel the profile's chevron stage tracker walks. */
export const SELECTABLE_LIFECYCLE_STAGES = [
  "lead",
  "researching",
  "contacted",
  "quoted",
  "customer",
] as const satisfies readonly LifecycleStage[];

export const DEFAULT_LIFECYCLE: LifecycleStage = "lead";

/** Human label for a stage. */
export const LIFECYCLE_LABEL: Record<LifecycleStage, string> = {
  lead: "Lead",
  researching: "Researching",
  contacted: "Contacted",
  quoted: "Quoted",
  qualified: "Qualified",
  customer: "Customer",
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
  quoted: "bg-steel-bg text-steel",
  qualified: "bg-steel-bg text-steel",
  customer: "bg-ok-bg text-ok",
  inactive: "bg-warn-bg text-warn",
  lost: "bg-bad-bg text-bad",
};

/** Normalize an arbitrary stored value to a known stage (falls back to lead). */
export function normalizeStage(value: string | null | undefined): LifecycleStage {
  const v = (value ?? "").toLowerCase();
  return (LIFECYCLE_STAGES as readonly string[]).includes(v)
    ? (v as LifecycleStage)
    : DEFAULT_LIFECYCLE;
}

export function stageLabel(value: string | null | undefined): string {
  return LIFECYCLE_LABEL[normalizeStage(value)];
}

export function stageTone(value: string | null | undefined): string {
  return LIFECYCLE_TONE[normalizeStage(value)];
}
