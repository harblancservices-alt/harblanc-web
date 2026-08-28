/**
 * Upgrade-request status vocabulary — deliberately its own plain module, NOT
 * declared in actions.ts. A "use server" file may only export async
 * functions at runtime (type exports are fine — they're erased at compile
 * time — but a runtime value like this const array is not); actions.ts
 * previously exported UPGRADE_STATUSES directly and it broke every action in
 * that file in production (passed tsc/next build clean, failed at runtime —
 * same class of bug as the RSC function-prop crashes, see
 * use-server-export-shape-rule). actions.ts now only IMPORTS from here.
 *
 * The vocabulary is locked to these four in the database too
 * (crm_upgrade_requests_status_check, migration 20260828010000). Adding a
 * fifth means a migration, on purpose — the old `new`/`in_review`/`done` set
 * drifted from what the UI actually showed and nobody noticed because
 * nothing enforced it.
 */
export const UPGRADE_STATUSES = ["open", "in_progress", "completed", "closed"] as const;
export type UpgradeStatus = (typeof UPGRADE_STATUSES)[number];

export function isUpgradeStatus(value: string): value is UpgradeStatus {
  return (UPGRADE_STATUSES as readonly string[]).includes(value);
}

/**
 * The three things a status has to say on a card, in one place so the board,
 * the detail view and the admin filters can never disagree about what
 * "open" looks like.
 *
 * On colour: OPEN IS NOT RED. Red means overdue or destructive across this
 * CRM — it is the Delete button on this very page — and an issue that was
 * reported correctly and is waiting its turn is not an error. Amber says
 * "waiting on someone" without shouting. Completed is the only green, so a
 * fixed issue reads as fixed at a glance, which is the whole point of
 * showing completed work instead of hiding it.
 */
export type UpgradeStatusStyle = {
  status: UpgradeStatus;
  /** Card pill + filter tab. */
  label: string;
  /** What the reporter is actually waiting for, in plain words. */
  meaning: string;
  pill: string;
  dot: string;
};

export const UPGRADE_STATUS_STYLE: Record<UpgradeStatus, UpgradeStatusStyle> = {
  open: {
    status: "open",
    label: "Open",
    meaning: "Submitted — waiting to be picked up",
    pill: "border-warn/40 bg-warn-bg text-warn",
    dot: "bg-warn",
  },
  in_progress: {
    status: "in_progress",
    label: "In progress",
    meaning: "Being worked on now",
    pill: "border-accent/40 bg-accent-bg text-accent",
    dot: "bg-accent",
  },
  completed: {
    status: "completed",
    label: "Completed",
    meaning: "Fixed and shipped",
    pill: "border-ok/40 bg-ok-bg text-ok",
    dot: "bg-ok",
  },
  closed: {
    status: "closed",
    label: "Closed",
    meaning: "No longer being pursued",
    pill: "border-line-strong bg-inset text-fg-muted",
    dot: "bg-line-strong",
  },
};

/** Rows an agent is still waiting on, for the "Open: 4, In progress: 2" line. */
export const ACTIVE_STATUSES: readonly UpgradeStatus[] = ["open", "in_progress"];

/**
 * A row whose status came out of the database as something this build does
 * not know. Cannot happen while the CHECK constraint holds, but a card that
 * renders nothing is worse than one that says "unknown", so every read path
 * goes through here rather than indexing the record directly.
 */
export function statusStyle(value: string): UpgradeStatusStyle {
  return isUpgradeStatus(value)
    ? UPGRADE_STATUS_STYLE[value]
    : { status: "open", label: value || "Unknown", meaning: "Unrecognised status", pill: "border-line-strong bg-inset text-fg-muted", dot: "bg-line-strong" };
}
