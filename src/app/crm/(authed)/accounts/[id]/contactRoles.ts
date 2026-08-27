import type { CrmPersonRoleCategory } from "./roles";

/**
 * THE ROLE PRESETS — the job titles a freight agent actually meets, offered
 * as a dropdown instead of an empty "Title" box.
 *
 * Brent's call: typing a title free-hand produces "Purchasing Mgr", "purch.
 * manager" and "Manager, Purchasing" for the same job, which is exactly what
 * the live data already looks like. A closed list of the fifteen roles that
 * matter on a dock makes the field answerable in one click.
 *
 * ── THIS DOES NOT INTRODUCE A SECOND VOCABULARY ───────────────────────
 *
 * The CRM already has a role vocabulary: roles.ts's ten CrmPersonRoleCategory
 * buckets, which drive every colour-coded pill in the app. These fifteen are
 * not a replacement for those — they are the SPECIFIC titles, and each one
 * names the bucket it belongs to. Picking "Dock Supervisor" therefore writes
 * both: `title` = "Dock Supervisor" (what this person actually is) and
 * `role_category` = "shipping_receiving" (what colour their pill is).
 *
 * That mapping is the whole point. Without it the dropdown would either
 * abandon the existing pills or force a rep to answer the same question
 * twice.
 *
 * ── WHY "OTHER" EXISTS ────────────────────────────────────────────────
 *
 * A closed list that cannot describe the person in front of you is worse
 * than a text box, because it makes the rep either lie or give up. "Other"
 * reopens the free-text field and writes `title` verbatim with no category —
 * the same state every contact created before this dropdown is already in,
 * so nothing downstream has to learn a new case.
 */

export type ContactRolePreset = {
  /** Stored verbatim in crm_contacts.title. */
  title: string;
  /** The roles.ts bucket this title belongs to, written to role_category. */
  category: CrmPersonRoleCategory;
};

/** Ordered roughly by who an agent reaches first on a cold call: the people
 * who decide, then the people who move freight, then the back office. */
export const CONTACT_ROLE_PRESETS: ContactRolePreset[] = [
  { title: "Owner", category: "owner" },
  { title: "President", category: "executive" },
  { title: "Plant Manager", category: "manager" },
  { title: "Operations Manager", category: "operations" },
  { title: "Logistics Manager", category: "logistics" },
  { title: "Traffic Manager", category: "logistics" },
  { title: "Shipping Manager", category: "shipping_receiving" },
  { title: "Receiving Manager", category: "shipping_receiving" },
  { title: "Warehouse Manager", category: "shipping_receiving" },
  { title: "Dock Supervisor", category: "shipping_receiving" },
  { title: "Dispatcher", category: "dispatch" },
  { title: "Purchasing Manager", category: "purchasing" },
  { title: "Buyer", category: "purchasing" },
  { title: "Accounts Payable", category: "accounts_payable" },
  { title: "Safety Manager", category: "manager" },
];

/** The sentinel the dialog's <select> uses for the free-text escape. Not a
 * title and never stored — see roleFromTitle, which returns no category for
 * anything it does not recognise. */
export const ROLE_OTHER = "__other__";

/**
 * The category for a title, or null when the title is free text.
 *
 * Matching is case- and space-insensitive so a title that came from the old
 * free-text field ("purchasing manager", "  Buyer ") still lands in its
 * bucket, and so re-opening the dialog on an existing contact preselects the
 * dropdown rather than dropping every legacy contact into "Other".
 */
export function roleFromTitle(title: string | null | undefined): CrmPersonRoleCategory | null {
  const key = normalizeTitle(title);
  if (!key) return null;
  return CONTACT_ROLE_PRESETS.find((r) => normalizeTitle(r.title) === key)?.category ?? null;
}

/** True when a title is one of the presets — i.e. the dropdown can show it
 * rather than falling back to Other. */
export function isPresetTitle(title: string | null | undefined): boolean {
  const key = normalizeTitle(title);
  if (!key) return false;
  return CONTACT_ROLE_PRESETS.some((r) => normalizeTitle(r.title) === key);
}

function normalizeTitle(title: string | null | undefined): string {
  return (title ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}
