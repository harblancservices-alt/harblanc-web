import { CRM_ACTIVITY } from "@/lib/crm/activity";

/**
 * THE ONE PLACE AN ACTIVITY TYPE IS DESCRIBED.
 *
 * Colour, label, grouping and navigation target for every kind of thing an
 * agent can do. Imported by the feed, the metric tiles, the filter chips and
 * the admin overview, so the same activity looks the same everywhere and a
 * new kind is added once.
 *
 * ── WHY TINTS, NOT FILLS ──────────────────────────────────────────────
 *
 * The composer already owns filled blue / green / red: blue means you can
 * pick this, green means you picked it, red means this button writes the
 * record. An activity type is a TAXONOMY, not a control, so it is drawn as
 * a tinted pill — background at ~8-12%, coloured ink — the pattern the CRM
 * already uses for source pills and status chips. A filled blue activity
 * badge would read as a button, which is the collision to avoid.
 *
 * Every token here already exists in .crm-light. No activity palette was
 * invented.
 */

export type ActivityCategory =
  | "call"
  | "task"
  /**
   * ── THE COMPANY SPLIT, 2026-08-29 ─────────────────────────────────
   *
   * One "company" category counted eight unrelated kinds, so the tile
   * could not tell selling from filing. Brent, after seeing the numbers:
   * split it.
   *
   *   pipeline       a stage change - a deal advancing or dying
   *   company_added  a company created - growing the book
   *   record         everything else about a company record
   *
   * The real figures made the shape obvious. In one week Tyler's old
   * "Companies 42" was 37 stage moves, 1 created and 4 owner changes -
   * almost entirely pipeline movement, which the blended tile hid.
   */
  | "pipeline"
  | "company_added"
  | "record"
  | "contact"
  | "note"
  | "deal"
  | "other";

export type ActivityTypeStyle = {
  category: ActivityCategory;
  /** Plural, for metric tiles and filter chips. */
  label: string;
  /**
   * WHAT THE NUMBER COUNTS, in one line, shown UNDER it.
   *
   * Brent, 2026-08-29: "i need to have a description of what each tally
   * means. 'companies' is 9 for tyler but companies called is 15 so idk
   * whats what."
   *
   * He was right to be confused, and a tooltip would have been the wrong
   * fix — see the note on the `company` entry below. These sentences are
   * rendered inline and always visible rather than on hover, because this
   * dashboard is read on a phone, where hover does not exist, and because
   * a definition nobody knows to look for is a definition nobody reads.
   *
   * Kept beside the label so the two cannot drift: a label that stops
   * matching its definition is exactly the bug this is fixing.
   */
  definition: string;
  /** Singular, for a row's type badge. */
  badge: string;
  /** Tinted pill classes — background + ink, never a fill. */
  tone: string;
  /** The dot on the timeline rail. */
  dot: string;
};

export const ACTIVITY_STYLE: Record<ActivityCategory, ActivityTypeStyle> = {
  call: {
    category: "call",
    label: "Calls",
    definition: "call write-ups logged",
    badge: "Call",
    tone: "bg-accent-bg text-accent",
    dot: "bg-accent",
  },
  task: {
    category: "task",
    label: "Tasks",
    definition: "created, completed or reopened",
    badge: "Task",
    tone: "bg-ok-bg text-ok",
    dot: "bg-ok",
  },
  pipeline: {
    category: "pipeline",
    label: "Pipeline",
    definition: "stage moved forward or lost",
    badge: "Stage",
    tone: "bg-admin-soft text-admin",
    dot: "bg-admin",
  },

  /* ── The other two halves of the old company tile ──────────────────
     ALL THREE KEEP THE COMPANY HUE. The palette carries one visual
     identity per type family, and these are all company events, so the
     split is told by the LABEL rather than by inventing two new colours
     for a distinction the eye does not need to make at a glance. */
  company_added: {
    category: "company_added",
    label: "Companies added",
    definition: "new companies created",
    badge: "Added",
    tone: "bg-admin-soft text-admin",
    dot: "bg-admin",
  },
  record: {
    category: "record",
    label: "Record keeping",
    definition: "owner, details, locations, removals",
    badge: "Record",
    /* bg-elevated, not bg-inset: note already owns inset, and two grey
       badges that cannot be told apart in the feed is exactly what the
       distinct-tone rule exists to stop. Still the neutral family - no new
       hue. */
    tone: "bg-elevated text-fg-muted",
    dot: "bg-line-strong",
  },
  contact: {
    category: "contact",
    label: "Contacts",
    definition: "people added, edited or removed",
    badge: "Contact",
    tone: "bg-warn-bg text-warn",
    dot: "bg-warn",
  },
  note: {
    category: "note",
    label: "Notes",
    definition: "notes written",
    badge: "Note",
    tone: "bg-inset text-fg-muted",
    dot: "bg-line-strong",
  },
  deal: {
    category: "deal",
    label: "Deals",
    definition: "deals created",
    badge: "Deal",
    // NOT the red family. Red means overdue / destructive everywhere else in
    // this CRM, and a won deal rendered in red reads as a problem. Steel is
    // an established CRM token (source pills, calendar tasks) that carries
    // no urgency meaning and is far enough off the accent blue to tell apart.
    tone: "bg-steel-bg text-steel",
    dot: "bg-steel",
  },
  other: {
    category: "other",
    label: "Other",
    definition: "anything not in the columns beside it",
    badge: "Other",
    tone: "bg-inset text-fg-subtle",
    dot: "bg-line-strong",
  },
};

/**
 * The categories offered as filters and metric tiles, in reading order.
 *
 * "deal" was missing from this list until 2026-08-28, which meant there was
 * no Deals tile, no Deals column on the admin scoreboard, and ?type=deal was
 * rejected as an unknown filter — even though ACTIVITY_STYLE defined the
 * badge and three kinds mapped to it. Nothing looked broken only because the
 * org has logged no deals yet; the first one would simply not have appeared.
 *
 * This list must stay complete: the metric counts are one SQL COUNT per
 * category, and a category missing here is a set of rows counted nowhere.
 * activityCounting.test.ts asserts that against the kind map.
 */
export const ACTIVITY_CATEGORIES: ActivityCategory[] = [
  "call",
  "task",
  "pipeline",
  "company_added",
  "contact",
  "note",
  "record",
  "deal",
  "other",
];

/**
 * THE CATEGORIES THAT GET A TILE AND A SCOREBOARD COLUMN.
 *
 * Splitting company into three took the tile count from 7 to 9, which is
 * the wall of numbers Brent warned about on a surface meant for scanning.
 * These six earn their place; the rest stay reachable through the type
 * filter, which lists every category.
 *
 * WHAT IS LEFT OFF, AND WHY:
 *   record   12 events in the whole database, 1 across the org this week.
 *            A tile that reads 0 for everybody every week is noise, and it
 *            would push the grid to a third row on a phone.
 *   deal     zero events. Nothing in this build writes one yet.
 *   other    the complement bucket; a number for "things we could not
 *            categorise" belongs in a filter, not on a dashboard.
 *
 * The total is NOT the sum of these six — it counts every category — which
 * is why the total's definition says "everything logged" rather than
 * naming the tiles.
 */
export const TILE_CATEGORIES: ActivityCategory[] = [
  "call",
  "task",
  "pipeline",
  "company_added",
  "contact",
  "note",
];

/**
 * A crm_activities.kind mapped to its category.
 *
 * Kinds NOT listed fall to "other" rather than being hidden, so a kind added
 * later still appears in the feed instead of vanishing silently — the feed
 * must never quietly drop a real event.
 */
const KIND_CATEGORY: Record<string, ActivityCategory> = {
  [CRM_ACTIVITY.call]: "call",
  [CRM_ACTIVITY.noteAdded]: "note",
  // ── The company split. Every kind still lands in exactly one place,
  //    so the totals reconcile unchanged.
  [CRM_ACTIVITY.accountCreated]: "company_added",
  [CRM_ACTIVITY.lifecycleChanged]: "pipeline",
  /**
   * OWNER CHANGED IS NOT SELLING, so it is not pipeline.
   *
   * It is filed under record keeping rather than dropped, because the
   * total has to keep reconciling and because it IS an act by the person
   * credited. It is deliberately not counted as progress: one rep_changed
   * row can mean an agent claiming work for themselves OR an admin moving
   * a company between people, and nothing on the event distinguishes the
   * two, so treating it as selling would flatter one of those cases.
   */
  [CRM_ACTIVITY.repChanged]: "record",
  /* Deleting a company is maintenance, not the inverse of adding one -
     it is almost always a duplicate or a bad record being tidied away. */
  [CRM_ACTIVITY.accountDeleted]: "record",
  [CRM_ACTIVITY.detailsUpdated]: "record",
  [CRM_ACTIVITY.locationAdded]: "record",
  [CRM_ACTIVITY.locationUpdated]: "record",
  [CRM_ACTIVITY.locationDeleted]: "record",
  [CRM_ACTIVITY.contactAdded]: "contact",
  [CRM_ACTIVITY.contactUpdated]: "contact",
  [CRM_ACTIVITY.contactDeleted]: "contact",
  [CRM_ACTIVITY.taskCreated]: "task",
  [CRM_ACTIVITY.taskCompleted]: "task",
  [CRM_ACTIVITY.taskReopened]: "task",
  [CRM_ACTIVITY.dealCreated]: "deal",
  [CRM_ACTIVITY.dealStageChanged]: "deal",
  [CRM_ACTIVITY.dealDeleted]: "deal",
};

export function categoryForKind(kind: string | null | undefined): ActivityCategory {
  if (!kind) return "other";
  return KIND_CATEGORY[kind] ?? "other";
}

/**
 * The crm_activities kinds behind each category, for server-side filtering.
 * Calls and notes are absent on purpose: they come from crm_calls and
 * crm_notes, which are queried directly — see activity-data.ts.
 */
export function kindsForCategory(category: ActivityCategory): string[] {
  return Object.entries(KIND_CATEGORY)
    .filter(([, c]) => c === category)
    .map(([kind]) => kind);
}

/**
 * Every kind this build knows how to categorise.
 *
 * "Other" is the unmapped remainder, which cannot be written as an IN list —
 * it is the complement of this one. Counting it in SQL needs exactly that:
 * NOT IN (everything mapped).
 */
export function allMappedKinds(): string[] {
  return Object.keys(KIND_CATEGORY);
}

/**
 * WHERE "VIEW" GOES.
 *
 * Never a dead end: an activity about a contact opens that contact, one
 * about a company opens the company, and anything else falls back to the
 * company it happened on. The one genuinely unnavigable case — an activity
 * with neither — returns null and the row renders without a link rather
 * than offering a button that goes nowhere.
 *
 * Tasks deliberately land on the COMPANY, not a task detail page: this CRM
 * has no per-task route, and the company profile's Tasks card is where a
 * task is actually read and worked.
 */
export function viewHref(item: {
  category: ActivityCategory;
  accountId: string | null;
  contactId: string | null;
}): string | null {
  if (item.category === "contact" && item.contactId) return `/crm/contacts/${item.contactId}`;
  if (item.accountId) {
    // A call or note about a person deep-links to their card on the profile,
    // which is where the conversation history lives.
    if (item.contactId && (item.category === "call" || item.category === "note")) {
      return `/crm/accounts/${item.accountId}#contact-${item.contactId}`;
    }
    return `/crm/accounts/${item.accountId}`;
  }
  if (item.contactId) return `/crm/contacts/${item.contactId}`;
  return null;
}
