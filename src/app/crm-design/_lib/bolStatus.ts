import type { BolStatus } from "./types";

/** The funnel's natural left-to-right order — used for the Inbox's status
 * filter chips and the detail page's stage indicator. "Rejected" and
 * "Archived" are terminal side-exits, not steps in the main line, so they
 * render last and visually separated (see BOL_STATUS_ACTIVE below). */
export const BOL_STATUS_ORDER: BolStatus[] = [
  "new",
  "needs_review",
  "ai_extracted",
  "researching",
  "ready_for_approval",
  "approved",
  "rejected",
  "archived",
];

/** The "main line" of the funnel — excludes the two terminal side-exits, for
 * anywhere that wants to show forward progress (not a filter list). */
export const BOL_STATUS_ACTIVE: BolStatus[] = [
  "new",
  "needs_review",
  "ai_extracted",
  "researching",
  "ready_for_approval",
  "approved",
];

export const BOL_STATUS_LABEL: Record<BolStatus, string> = {
  new: "New",
  needs_review: "Needs Review",
  ai_extracted: "AI Extracted",
  researching: "Researching",
  ready_for_approval: "Ready for Approval",
  approved: "Approved",
  rejected: "Rejected",
  archived: "Archived",
};

/** Same three-tone-plus-danger discipline as STAGE_TONE in lifecycle.ts —
 * never a bespoke color per status. Neutral = not yet worked, accent =
 * actively in motion, success = approved, danger = rejected. */
export const BOL_STATUS_TONE: Record<BolStatus, "neutral" | "accent" | "warning" | "success" | "danger"> = {
  new: "neutral",
  needs_review: "warning",
  ai_extracted: "accent",
  researching: "accent",
  ready_for_approval: "warning",
  approved: "success",
  rejected: "danger",
  archived: "neutral",
};

export const BOL_STATUS_DESCRIPTION: Record<BolStatus, string> = {
  new: "Uploaded — extraction hasn't run yet.",
  needs_review: "AI extraction finished with low-confidence fields — needs a human pass.",
  ai_extracted: "AI extraction complete, high confidence — ready for a reviewer to confirm.",
  researching: "A reviewer is actively investigating this company before deciding.",
  ready_for_approval: "Research is done — awaiting an Approve / Reject decision.",
  approved: "Approved as real customer intelligence. May or may not be released to Sales yet.",
  rejected: "Not worth pursuing — filed, not deleted.",
  archived: "Resolved and put away (e.g. merged into another record).",
};
