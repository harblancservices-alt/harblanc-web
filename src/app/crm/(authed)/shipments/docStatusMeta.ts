/**
 * Status vocabulary shared by Rate Confirmations and Bills of Lading — both
 * lifecycles move through the same words (rate-confirmation-actions.ts /
 * bol-actions.ts's send/accept/complete/cancel actions), so one label/tone
 * map covers both document types. Same shape as shipments/statusMeta.ts.
 */
export const DOC_STATUSES = [
  "draft",
  "generated",
  "sent",
  "accepted",
  "completed",
  "cancelled",
] as const;

export type DocStatus = (typeof DOC_STATUSES)[number];

export const DOC_STATUS_LABEL: Record<DocStatus, string> = {
  draft: "Draft",
  generated: "Generated",
  sent: "Sent",
  accepted: "Accepted",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const DOC_STATUS_TONE: Record<DocStatus, string> = {
  draft: "bg-slate-bg text-slate",
  generated: "bg-steel-bg text-steel",
  sent: "bg-steel-bg text-steel",
  accepted: "bg-ok-bg text-ok",
  completed: "bg-ok-bg text-ok",
  cancelled: "bg-bad-bg text-bad",
};

function normalize(value: string | null | undefined): DocStatus {
  const v = (value ?? "").trim().toLowerCase();
  return (DOC_STATUSES as readonly string[]).includes(v) ? (v as DocStatus) : "draft";
}

export function docStatusLabel(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  if (!v) return "Draft";
  const known = (DOC_STATUSES as readonly string[]).includes(v.toLowerCase());
  return known ? DOC_STATUS_LABEL[normalize(v)] : v;
}

export function docStatusTone(value: string | null | undefined): string {
  return DOC_STATUS_TONE[normalize(value)];
}

/** Status -> shared Badge tone (2026-08-20, matching crm-design's Badge
 * set). Replaces DOC_STATUS_TONE's raw className strings (steel/slate hues
 * crm-design's palette doesn't have) at every Badge call site. */
export const DOC_STATUS_BADGE_TONE: Record<DocStatus, "neutral" | "accent" | "success" | "danger"> = {
  draft: "neutral",
  generated: "accent",
  sent: "accent",
  accepted: "success",
  completed: "success",
  cancelled: "danger",
};

export function docStatusBadgeTone(value: string | null | undefined): "neutral" | "accent" | "success" | "danger" {
  return DOC_STATUS_BADGE_TONE[normalize(value)];
}
