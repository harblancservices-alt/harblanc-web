import { getAdminContactsData } from "./contacts-data";
import { ContactsTable } from "./ContactsTable";

export const dynamic = "force-dynamic";

/**
 * Admin → Contacts — every contact in the org, whoever owns the company
 * behind it. The sibling of Admin → Companies under Admin Account.
 *
 * Exists because the workspace Contacts directory is now scoped to the
 * companies you own (Brent, 2026-08-25). That closed the last big hole in
 * the agent-facing gate, and it needed an org-wide counterpart or the org's
 * contacts would have had nowhere to be seen whole. Same split as Companies:
 * the workspace shows you your book, the admin section shows the universe.
 *
 * Owner-only by the same gate as the rest of the section — ../layout.tsx
 * awaits requireCrmAdmin() before any child renders.
 */
export default async function AdminContactsPage() {
  const { rows, ownerNames } = await getAdminContactsData();
  return <ContactsTable rows={rows} ownerNames={ownerNames} />;
}
