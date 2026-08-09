/**
 * The role/category vocabulary driving every contact's color-coded pill —
 * crm_contacts.role_category (text, applied directly, no migration needed).
 * Single shared source for the pill picker (ContactDialog), the card display
 * (PersonCard), and anywhere else a contact's role renders, so the CRM never
 * carries a second copy of this vocabulary that could drift. A plain data
 * module (no "use client", no component imports) specifically so both
 * PersonCard.tsx and PeopleSection.tsx/ContactsSection.tsx can depend on it
 * without a circular import between the card and its two callers.
 */
export type CrmPersonRoleCategory =
  | "purchasing"
  | "shipping_receiving"
  | "dispatch"
  | "manager_owner"
  | "sales";

export const ROLE_CATEGORIES: CrmPersonRoleCategory[] = [
  "purchasing",
  "shipping_receiving",
  "dispatch",
  "manager_owner",
  "sales",
];

export const ROLE_LABEL: Record<CrmPersonRoleCategory, string> = {
  purchasing: "Purchasing/Buyer",
  shipping_receiving: "Shipping/Receiving",
  dispatch: "Dispatch",
  manager_owner: "Manager/Owner",
  sales: "Sales",
};

/** Green/amber/grey reuse the CRM's existing fixed status tints; purple has
 * no existing token so it's a one-off arbitrary pastel pair matching the
 * same light-bg/saturated-text shape; "blue" reuses the brand accent (the
 * same bg-accent/10 text-accent pairing DueCountdown already uses for its
 * "accent" tone) rather than inventing a second blue. */
export const ROLE_TONE: Record<CrmPersonRoleCategory, string> = {
  purchasing: "bg-ok-bg text-ok",
  shipping_receiving: "bg-warn-bg text-warn",
  dispatch: "bg-[#f1e8fb] text-[#7c3aed]",
  manager_owner: "bg-slate-bg text-slate",
  sales: "bg-accent/10 text-accent",
};
