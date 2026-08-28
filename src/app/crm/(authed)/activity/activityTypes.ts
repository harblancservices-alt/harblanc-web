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
  | "company"
  | "contact"
  | "note"
  | "deal"
  | "other";

export type ActivityTypeStyle = {
  category: ActivityCategory;
  /** Plural, for metric tiles and filter chips. */
  label: string;
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
    badge: "Call",
    tone: "bg-accent-bg text-accent",
    dot: "bg-accent",
  },
  task: {
    category: "task",
    label: "Tasks",
    badge: "Task",
    tone: "bg-ok-bg text-ok",
    dot: "bg-ok",
  },
  company: {
    category: "company",
    label: "Companies",
    badge: "Company",
    tone: "bg-admin-soft text-admin",
    dot: "bg-admin",
  },
  contact: {
    category: "contact",
    label: "Contacts",
    badge: "Contact",
    tone: "bg-warn-bg text-warn",
    dot: "bg-warn",
  },
  note: {
    category: "note",
    label: "Notes",
    badge: "Note",
    tone: "bg-inset text-fg-muted",
    dot: "bg-line-strong",
  },
  deal: {
    category: "deal",
    label: "Deals",
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
    badge: "Other",
    tone: "bg-inset text-fg-subtle",
    dot: "bg-line-strong",
  },
};

/** The categories offered as filters and metric tiles, in reading order. */
export const ACTIVITY_CATEGORIES: ActivityCategory[] = [
  "call",
  "task",
  "company",
  "contact",
  "note",
  "other",
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
  [CRM_ACTIVITY.accountCreated]: "company",
  [CRM_ACTIVITY.accountDeleted]: "company",
  [CRM_ACTIVITY.lifecycleChanged]: "company",
  [CRM_ACTIVITY.repChanged]: "company",
  [CRM_ACTIVITY.detailsUpdated]: "company",
  [CRM_ACTIVITY.locationAdded]: "company",
  [CRM_ACTIVITY.locationUpdated]: "company",
  [CRM_ACTIVITY.locationDeleted]: "company",
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
