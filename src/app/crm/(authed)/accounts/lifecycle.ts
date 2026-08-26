/**
 * The company lifecycle — the single ordered vocabulary the whole CRM shares.
 * A company moves LEFT → RIGHT through this 10-stage funnel; every surface
 * that renders or edits a lifecycle_status imports from here so the labels,
 * order, staleness clocks, and pill tones can never drift between the list,
 * the profile, the dashboard, and the create/edit form.
 *
 * 2026-08-26 rebuild (Brent): the 6-stage set is replaced by TEN — New Lead,
 * Qualified, Contacted, Engaged, Quoting, Setup, Active, Dormant, Lost,
 * Disqualified. A REPLACEMENT, not an addition.
 *
 * What the four new stages buy, in Brent's order:
 *   qualified     — we have decided they are worth pursuing, before anyone
 *                   has reached out. This takes over `researching`'s position
 *                   in the funnel, but describes a CONCLUSION ("worth
 *                   chasing") rather than an activity ("looking into it") —
 *                   which matters because under the current model research
 *                   happens after assignment, so it is not a stage at all.
 *   engaged       — they are talking back. The gap between "we called them"
 *                   and "we are quoting" used to be invisible.
 *   setup         — they said yes and are being onboarded. Won but not yet
 *                   earning, which is neither Quoting nor Active.
 *   dormant       — a customer who has gone quiet without being lost. The old
 *                   model had to call these Active (flatters the book) or
 *                   Lost (they never left). Both were wrong.
 *   disqualified  — we ruled them out, as opposed to losing them to somebody
 *                   else. Both are terminal, and conflating them destroys the
 *                   only signal saying whether the funnel or the pitch is the
 *                   problem.
 *
 * TWO STAGES NOW REQUIRE A REASON. Lost and Disqualified cannot be committed
 * without one (crm_accounts.stage_loss_reason) — see STAGES_NEEDING_REASON.
 *
 * NO DB CONSTRAINT, BY DESIGN. lifecycle_status is plain nullable text with
 * no CHECK (verified live). normalizeStage below is the enforcement point,
 * and it funnels values from EVERY past vocabulary onto a current stage. That
 * is what lets a rename ship before its data remap — `researching` and
 * `active_customer` are still on live rows right now, because the remap is
 * held for Brent's approval, and everything renders and behaves correctly
 * regardless.
 *
 * 2026-08-22 rebuild (CRM_URGENCY_AUDIT.md): the old 9-value set (lead,
 * researching, contacted, prospect, in_the_door, quoted, active_customer,
 * inactive, lost — with "quoted" silently rewritten to "active_customer" on
 * every write) was replaced with 6 REAL, independently-storable stages.
 * Nothing rewrites itself on write: clicking "Quoting" stores "quoting".
 *
 * The whole point of that rebuild, preserved here, is that each stage DOES
 * something (see STALE_DAYS_BY_STAGE and lib/crm/stageAutomation.ts) instead
 * of being a label + timeline entry.
 */
export const LIFECYCLE_STAGES = [
  "new_lead",
  "qualified",
  "contacted",
  "engaged",
  "quoting",
  "setup",
  "active",
  "dormant",
  "lost",
  "disqualified",
] as const;

export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

/** The ordered funnel the profile's stage buttons walk — every stage is
 * selectable directly (no hidden terminal bucket). */
export const SELECTABLE_LIFECYCLE_STAGES = LIFECYCLE_STAGES;

export const DEFAULT_LIFECYCLE: LifecycleStage = "new_lead";

/** Human label for a stage. */
export const LIFECYCLE_LABEL: Record<LifecycleStage, string> = {
  new_lead: "New Lead",
  qualified: "Qualified",
  contacted: "Contacted",
  engaged: "Engaged",
  quoting: "Quoting",
  setup: "Setup",
  active: "Active",
  dormant: "Dormant",
  lost: "Lost",
  disqualified: "Disqualified",
};

/**
 * Pill tone per stage. Grouped so the progression reads at a glance: cold
 * (slate) → in-motion (steel) → onboarding (amber) → won (green), with red
 * for the two terminal stages.
 *
 * Dormant is amber rather than red on purpose: a quiet customer is a problem
 * to work, not a loss to write off. Amber says "look at this", which is true.
 */
export const LIFECYCLE_TONE: Record<LifecycleStage, string> = {
  new_lead: "bg-slate-bg text-slate",
  qualified: "bg-slate-bg text-slate",
  contacted: "bg-steel-bg text-steel",
  engaged: "bg-steel-bg text-steel",
  quoting: "bg-steel-bg text-steel",
  setup: "bg-warn-bg text-warn",
  active: "bg-ok-bg text-ok",
  dormant: "bg-warn-bg text-warn",
  lost: "bg-bad-bg text-bad",
  disqualified: "bg-bad-bg text-bad",
};

/**
 * Old, no-longer-selectable raw values mapped onto the current funnel.
 * Anything not found here or in LIFECYCLE_STAGES falls back to
 * DEFAULT_LIFECYCLE.
 *
 * The two entries added on 2026-08-26 are LOAD-BEARING TODAY, not historical
 * trivia: `researching` and `active_customer` are on live rows right now,
 * because the data remap is held for Brent's approval.
 */
export const LEGACY_STAGE_ALIASES: Record<string, LifecycleStage> = {
  lead: "new_lead",
  prospect: "new_lead",
  in_the_door: "contacted",
  quoted: "quoting",
  customer: "active",
  /** Retired 2026-08-26. Qualified inherits its position in the funnel. */
  researching: "qualified",
  /** Retired 2026-08-26. A pure rename. */
  active_customer: "active",
  // "inactive" was a second terminal state alongside "lost" in the old model.
  // The ten-stage model has a better home for it: a customer who went quiet
  // without being lost is exactly what Dormant means.
  inactive: "dormant",
};

function legacyAlias(value: string): LifecycleStage | null {
  return LEGACY_STAGE_ALIASES[value] ?? null;
}

/** Normalize an arbitrary stored value to a known stage (falls back to
 * new_lead). The ONLY place old-vocabulary values (from any prior rebuild)
 * converge on the current canonical stage — every reader goes through this,
 * so old rows render and behave correctly before the data remap runs. */
export function normalizeStage(value: string | null | undefined): LifecycleStage {
  const v = (value ?? "").trim().toLowerCase();
  return (LIFECYCLE_STAGES as readonly string[]).includes(v)
    ? (v as LifecycleStage)
    : (legacyAlias(v) ?? DEFAULT_LIFECYCLE);
}

/**
 * The two stages that cannot be set without a reason.
 *
 * Both are terminal and both are a JUDGEMENT — "we lost them" and "we ruled
 * them out" are conclusions someone reached, and a conclusion with no
 * recorded why is worth very little three months later. The dialog enforces
 * it before the write; the server action re-checks, because a UI gate is not
 * enforcement.
 */
export const STAGES_NEEDING_REASON: readonly LifecycleStage[] = ["lost", "disqualified"];

export function stageNeedsReason(value: string | null | undefined): boolean {
  return STAGES_NEEDING_REASON.includes(normalizeStage(value));
}

export function stageLabel(value: string | null | undefined): string {
  return LIFECYCLE_LABEL[normalizeStage(value)];
}

export function stageTone(value: string | null | undefined): string {
  return LIFECYCLE_TONE[normalizeStage(value)];
}

/** Stage → shared Badge tone, matching the 6-tone Badge set — neutral for
 * cold stages, accent for in-motion, warning for onboarding and gone-quiet,
 * success for won, danger for the two terminal stages. */
export const LIFECYCLE_BADGE_TONE: Record<LifecycleStage, "neutral" | "accent" | "success" | "warning" | "danger"> = {
  new_lead: "neutral",
  qualified: "neutral",
  contacted: "accent",
  engaged: "accent",
  quoting: "accent",
  setup: "warning",
  active: "success",
  dormant: "warning",
  lost: "danger",
  disqualified: "danger",
};

export function stageBadgeTone(value: string | null | undefined): "neutral" | "accent" | "success" | "warning" | "danger" {
  return LIFECYCLE_BADGE_TONE[normalizeStage(value)];
}

/** Position of a stage within the ordered funnel — lower rank = earlier
 * stage. The single place any caller should compare two stages' progress, so
 * "is this company far enough along that I shouldn't touch its stage" checks
 * stay centralized instead of each caller re-deriving an index into
 * LIFECYCLE_STAGES itself. The three terminal-ish stages (dormant, lost,
 * disqualified) sit last, so they naturally rank "at or beyond" everything
 * else — a dropped-out company is never silently revived by a rank
 * comparison alone. */
export function stageRank(stage: LifecycleStage): number {
  return LIFECYCLE_STAGES.indexOf(stage);
}

/**
 * The ONE "is this company an Active Customer?" predicate the whole CRM
 * shares. Anywhere a surface needs to show only won accounts — the Active
 * Customers list, the load builder's Customer picker — it asks this instead
 * of re-deriving its own string comparison, so a vocabulary change lands in
 * one place. Goes through normalizeStage, so legacy raw values (the
 * pre-2026-08-09 "customer" and the pre-2026-08-26 "active_customer") count
 * exactly like the canonical "active" does.
 *
 * NOTE it is deliberately NOT true for `dormant`. A customer who has gone
 * quiet is not someone to offer in a "pick a customer" list as though
 * nothing were wrong — that is the entire reason the stage exists.
 */
export function isActiveCustomerStage(value: string | null | undefined): boolean {
  return normalizeStage(value) === "active";
}

/**
 * Every RAW lifecycle_status value that isActiveCustomerStage() accepts —
 * the SQL-side twin of that predicate, for queries that must filter in the
 * database (an `.in("lifecycle_status", ...)` clause) instead of pulling
 * every account and filtering in JS. Derived from LEGACY_STAGE_ALIASES
 * rather than typed out, so adding or retiring an alias can never leave the
 * two forms out of sync — which is exactly what keeps the pre-remap
 * `active_customer` rows visible in the Active Customers list today.
 *
 * Note the asymmetry this deliberately does NOT paper over: a NULL or
 * unrecognized lifecycle_status normalizes to new_lead, so it is excluded by
 * both forms — an account has to be explicitly marked won to be offered.
 */
export const ACTIVE_CUSTOMER_STAGE_VALUES: readonly string[] = [
  "active",
  ...Object.keys(LEGACY_STAGE_ALIASES).filter((raw) => LEGACY_STAGE_ALIASES[raw] === "active"),
];

/**
 * Per-stage staleness clocks (CRM_URGENCY_AUDIT.md P0) — the single source of
 * truth for "how many days of no contact before this account resurfaces as
 * going stale."
 *
 * new_lead is measured differently from every other stage: it has no contact
 * to be stale FROM (nobody owns it yet), so its clock runs off
 * crm_accounts.created_at ("how long has this sat unassigned") rather than
 * last-contact activity.
 */
export const STALE_DAYS_BY_STAGE: Partial<Record<LifecycleStage, number>> = {
  new_lead: 3,
  qualified: 5, // inherited from `researching`, whose funnel position it takes
  contacted: 5,
  // Tighter than `contacted` on purpose: a conversation that was live and has
  // gone quiet is a worse sign than a cold record nobody has answered yet.
  engaged: 3,
  quoting: 1,
  // They have said yes and are being onboarded. Stalling here is the most
  // expensive kind of quiet — the deal is won and not yet earning — so it
  // nags nearly as fast as a live quote.
  setup: 2,
  // DELIBERATELY ABSENT, each for its own reason:
  //   active        a won account has nothing to chase (the original rule).
  //   dormant       "gone quiet" IS the stage. Nagging that a company marked
  //                 quiet has been quiet is circular; getting it OUT of
  //                 Dormant is the work, and that is a task, not a flag.
  //   lost          handled by LOST_WINBACK_DAYS below, not this table.
  //   disqualified  ruled out on purpose — never nag. That is the whole
  //                 difference between Disqualified and Lost.
};

/** Lost win-back clock (days of quiet before a dropped-out account resurfaces
 * as a "reach back out" candidate) — see lib/crm/stageAutomation.ts for the
 * read-time lazy task creation this drives. Applies to `lost` only, never to
 * `disqualified`: reaching back out to someone you deliberately ruled out is
 * the opposite of what that stage means. */
export const LOST_WINBACK_DAYS = 45;
