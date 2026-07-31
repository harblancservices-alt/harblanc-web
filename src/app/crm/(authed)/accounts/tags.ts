/** Shared tag shape for the Companies list filter/columns (crm_tags /
 * crm_account_tags). The company profile no longer has a tag editor — the
 * owner doesn't use per-company tags there — but the Companies list still
 * filters and displays them, so the type lives here rather than inside a
 * profile-only component. */
export type CrmTag = { id: string; label: string; color: string | null };
