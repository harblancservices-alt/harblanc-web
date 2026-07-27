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
 */
export const LIFECYCLE_STAGES = [
  "lead",
  "researching",
  "contacted",
  "qualified",
  "customer",
  "inactive",
  "lost",
] as const;

export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

export const DEFAULT_LIFECYCLE: LifecycleStage = "lead";

/** Human label for a stage. */
export const LIFECYCLE_LABEL: Record<LifecycleStage, string> = {
  lead: "Lead",
  researching: "Researching",
  contacted: "Contacted",
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
