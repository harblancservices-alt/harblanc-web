import type { OtrStatus } from "./types";

/** OTR's funnel is shorter than BOL Center's — there's no extraction step
 * (no document to extract from), so it goes straight from "named" to
 * "researching" once an admin starts working it. */
export const OTR_STATUS_ORDER: OtrStatus[] = ["new", "researching", "ready_for_approval", "released", "rejected"];

export const OTR_STATUS_LABEL: Record<OtrStatus, string> = {
  new: "New",
  researching: "Researching",
  ready_for_approval: "Ready for Approval",
  released: "Released",
  rejected: "Rejected",
};

/** Same tone discipline as BOL_STATUS_TONE — admin = handed to Sales. */
export const OTR_STATUS_TONE: Record<OtrStatus, "neutral" | "accent" | "warning" | "admin" | "danger"> = {
  new: "neutral",
  researching: "accent",
  ready_for_approval: "warning",
  released: "admin",
  rejected: "danger",
};

export const OTR_STATUS_DESCRIPTION: Record<OtrStatus, string> = {
  new: "Named by Brent — research hasn't started yet.",
  researching: "An admin is actively investigating this company before deciding.",
  ready_for_approval: "Research is done — awaiting a Release / Reject decision.",
  released: "Released to Sales as a Prospect.",
  rejected: "Not worth pursuing — filed, not deleted.",
};
