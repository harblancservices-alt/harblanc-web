import type { LifecycleStage } from "./types";

export const STAGE_ORDER: LifecycleStage[] = [
  "new_lead",
  "contacted",
  "qualified",
  "quoted",
  "negotiating",
  "won",
  "active_customer",
];

export const STAGE_LABEL: Record<LifecycleStage, string> = {
  new_lead: "New Lead",
  contacted: "Contacted",
  qualified: "Qualified",
  quoted: "Quoted",
  negotiating: "Negotiating",
  won: "Won",
  active_customer: "Active Customer",
  lost: "Lost",
};

/** Every stage badge draws from the SAME three-tone family (neutral / accent
 * / success) — never a bespoke color per stage. "Lost" is the one true
 * negative state and is the only stage allowed to use the danger token. */
export const STAGE_TONE: Record<LifecycleStage, "neutral" | "accent" | "success" | "danger"> = {
  new_lead: "neutral",
  contacted: "neutral",
  qualified: "accent",
  quoted: "accent",
  negotiating: "accent",
  won: "success",
  active_customer: "success",
  lost: "danger",
};
