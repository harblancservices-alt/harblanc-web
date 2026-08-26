import { redirect } from "next/navigation";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";

export const dynamic = "force-dynamic";

/**
 * THE STANDALONE CONTACT PROFILE IS GONE (Brent, 2026-08-26):
 *
 *   "i feel like contact profiles should be removed and just be company
 *    level. having contact list is good but the profile just opens their
 *    card on the profile of the company they work for"
 *
 * A contact only means anything in the context of their company, so this
 * route is now a REDIRECT rather than a page. Every existing link, bookmark
 * and pasted URL still works — it just lands on the company profile,
 * anchored and highlighted on that person's card.
 *
 * The rebuilt page that used to live here is not lost so much as relocated:
 * its Tasks and History sections were per-contact views of data the company
 * profile already shows in full, and its edit path, role/mood controls and
 * details moved onto the contact card itself (see ContactsWheel).
 *
 * THE UNREACHABLE CASE. A contact can have no company to send you to — two
 * ways, both real:
 *
 *   - account_id IS NULL. Zero contacts today, but the column is nullable
 *     and calls/actions.ts creates one this way on purpose when you log a
 *     call against a number that resolves to no company.
 *   - account_id points at a SOFT-DELETED company. One contact today.
 *
 * Neither can be anchored anywhere, so both fall back to the contacts list
 * rather than 404ing or crashing. That is a deliberately conservative
 * default and NOT a decision about what should happen to those records —
 * flagged for Brent, who has not been asked yet.
 */
export default async function ContactRedirectPage({
  params,
}: {
  params: Promise<{ contactId: string }>;
}) {
  const { contactId } = await params;
  await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { data: contact } = await supabase
    .from("crm_contacts")
    .select("id, account_id")
    .eq("id", contactId)
    .is("deleted_at", null)
    .maybeSingle();

  const accountId = (contact?.account_id as string | null) ?? null;
  if (!accountId) redirect("/crm/contacts");

  // The company itself has to still be there — a contact pointing at a
  // soft-deleted company would otherwise land on a profile that 404s.
  const { data: account } = await supabase
    .from("crm_accounts")
    .select("id")
    .eq("id", accountId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!account) redirect("/crm/contacts");

  // The hash is what the company profile's contact card anchors on. Plain
  // `:target` CSS does the scrolling and the highlight — no script, and it
  // works on a full navigation, which a server redirect always is.
  redirect(`/crm/accounts/${accountId}#contact-${contactId}`);
}
