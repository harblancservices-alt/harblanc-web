/**
 * The role/category vocabulary driving every contact's color-coded pill —
 * crm_contacts.role_category (text, applied directly, no migration needed).
 * Single shared source for the pill picker (RoleControl), the read-only
 * badges (ContactHeader, ContactTable, ContactsMasterDetail's avatar chip),
 * and anywhere else a contact's role renders, so the CRM never carries a
 * second copy of this vocabulary that could drift. A plain data module (no
 * "use client", no component imports).
 *
 * 2026-08-09: "manager_owner" (a single combined role) split into two real
 * roles, "manager" and "owner", and the set grew to 10 — Owner, Manager,
 * Operations, Dispatch, Purchasing, Shipping/Receiving, Logistics, Accounts
 * Payable, Sales, Executive. Old rows still holding the literal string
 * "manager_owner" aren't migrated in the DB — normalizeRoleCategory maps
 * that (and anything else unrecognized) so every surface that reads a
 * contact's role keeps rendering correctly without a migration.
 */
export type CrmPersonRoleCategory =
  | "owner"
  | "manager"
  | "operations"
  | "dispatch"
  | "purchasing"
  | "shipping_receiving"
  | "logistics"
  | "accounts_payable"
  | "sales"
  | "executive";

export const ROLE_CATEGORIES: CrmPersonRoleCategory[] = [
  "owner",
  "manager",
  "operations",
  "dispatch",
  "purchasing",
  "shipping_receiving",
  "logistics",
  "accounts_payable",
  "sales",
  "executive",
];

export const ROLE_LABEL: Record<CrmPersonRoleCategory, string> = {
  owner: "Owner",
  manager: "Manager",
  operations: "Operations",
  dispatch: "Dispatch",
  purchasing: "Purchasing",
  shipping_receiving: "Shipping / Receiving",
  logistics: "Logistics",
  accounts_payable: "Accounts Payable",
  sales: "Sales",
  executive: "Executive",
};

/** Tone for READ-ONLY role badges (ContactHeader, ContactTable, the
 * ContactsMasterDetail avatar chip) — each role keeps its own color so those
 * surfaces stay visually distinguishable at a glance. This is deliberately
 * separate from RoleControl's own selected/unselected pill treatment, which
 * is uniform green/outline (Brent's 2026-08-09 call, matching the Freight
 * profile and Tags pill pickers) rather than per-role tones. */
export const ROLE_TONE: Record<CrmPersonRoleCategory, string> = {
  owner: "bg-slate-bg text-slate",
  manager: "bg-steel-bg text-steel",
  operations: "bg-warn-bg text-warn",
  dispatch: "bg-[#f1e8fb] text-[#7c3aed]",
  purchasing: "bg-ok-bg text-ok",
  shipping_receiving: "bg-[#ccfbf1] text-[#0f766e]",
  logistics: "bg-[#e0e7ff] text-[#4338ca]",
  accounts_payable: "bg-[#fce7f3] text-[#be185d]",
  sales: "bg-accent/10 text-accent",
  executive: "bg-graphite text-white",
};

/** Solid (non-tint) version of ROLE_TONE's colors, for the small round
 * initials avatar (ContactsMasterDetail) which needs a filled circle rather
 * than a tinted pill. */
export const ROLE_AVATAR_BG: Record<CrmPersonRoleCategory, string> = {
  owner: "bg-slate",
  manager: "bg-steel",
  operations: "bg-warn",
  dispatch: "bg-[#7c3aed]",
  purchasing: "bg-ok",
  shipping_receiving: "bg-[#0f766e]",
  logistics: "bg-[#4338ca]",
  accounts_payable: "bg-[#be185d]",
  sales: "bg-accent",
  executive: "bg-graphite",
};

/** Old, no-longer-selectable raw values mapped onto the current role set —
 * same pattern as lifecycle.ts's legacy stage aliasing. */
function legacyRoleAlias(value: string): CrmPersonRoleCategory | null {
  if (value === "manager_owner") return "manager";
  return null;
}

/** Normalize an arbitrary stored role_category value. Returns null for
 * unset/unrecognized (surfaces that render a role badge treat null as "no
 * badge"), unlike lifecycle's normalizeStage which always falls back to a
 * default — a contact's role is optional, a company's stage isn't. */
export function normalizeRoleCategory(value: string | null | undefined): CrmPersonRoleCategory | null {
  if (!value) return null;
  if ((ROLE_CATEGORIES as readonly string[]).includes(value)) return value as CrmPersonRoleCategory;
  return legacyRoleAlias(value);
}
