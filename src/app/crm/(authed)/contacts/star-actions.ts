"use server";

import { revalidatePath } from "next/cache";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { logActivity, CRM_ACTIVITY } from "@/lib/crm/activity";

/**
 * STARRING A CONTACT — "this person actually gets freight moved."
 *
 * ── IT IS NOT SENIORITY, AND THE WORDING MATTERS ──────────────────────
 *
 * Brent, 2026-08-31: "it's hard to know who's the real boss at these
 * places. Jeff might be the owner but Rodger might be the shipper guy, so
 * Jeff doesn't care about Rodger's job — so Rodger needs the star, not
 * Jeff."
 *
 * So nothing in this feature says "favourite" anywhere a user can read it.
 * A favourite is a preference; this is a judgement about who can actually
 * get a truck loaded, and it is valuable precisely when it disagrees with
 * the job title.
 *
 * ── IT IS NOT primary_contact_id, EITHER ──────────────────────────────
 *
 * See the note in ContactStar.tsx. Briefly: primary is a SLOT on the
 * company (exactly one, and setting it displaces whoever held it) that
 * decides which contact the Who do I call panel leads with. The star is a
 * PROPERTY of the person (zero-to-many per company, and its whole value is
 * aggregating across companies). Starring therefore does NOT set primary —
 * doing so would silently reorder a panel somebody had already arranged,
 * and Brent's own example is a company where the two should differ.
 *
 * ── PERMISSIONS ───────────────────────────────────────────────────────
 *
 * requireCrmUser() plus the cookie-bound RLS client, the same pair every
 * other contact write uses. crm_contacts is org-scoped by RLS, so a caller
 * can only ever star somebody inside their own org. Reading is narrowed
 * further per-caller in the loaders — see contacts/page.tsx.
 */

type Ok = { ok: true; starred: boolean };
type Err = { ok: false; error: string };
export type StarResult = Ok | Err;

/**
 * Toggle the star, and say which way it went.
 *
 * The NEXT state is sent by the caller rather than derived here, so two
 * people clicking at once converge on what each of them saw rather than
 * flipping each other's answer back and forth.
 */
export async function setContactStarred(input: {
  contactId: string;
  starred: boolean;
}): Promise<StarResult> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { data: contact } = await supabase
    .from("crm_contacts")
    .select("id, name, account_id")
    .eq("id", input.contactId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!contact) return { ok: false, error: "That contact no longer exists." };

  const { error } = await supabase
    .from("crm_contacts")
    .update(
      input.starred
        ? { starred_at: new Date().toISOString(), starred_by: user.id }
        : // Both cleared together: starred_at IS the flag, so leaving a
          // stale starred_by behind would imply somebody still stands
          // behind a judgement that has been withdrawn.
          { starred_at: null, starred_by: null },
    )
    .eq("id", input.contactId);

  if (error) return { ok: false, error: "Could not save that. Please try again." };

  /* ON THE COMPANY'S TIMELINE, because this is a judgement somebody made
     and not a field they corrected. In a year, "who decided Rodger was the
     one who matters, and when" is the difference between an asset and a
     list nobody trusts. */
  const accountId = contact.account_id as string | null;
  if (accountId) {
    await logActivity(supabase, {
      orgId: user.orgId,
      userId: user.id,
      accountId,
      kind: CRM_ACTIVITY.contactUpdated,
      summary: input.starred
        ? `Starred ${contact.name ?? "a contact"} — gets freight moved`
        : `Unstarred ${contact.name ?? "a contact"}`,
      contactId: input.contactId,
      meta: { starred: input.starred },
    });
    revalidatePath(`/crm/accounts/${accountId}`);
  }

  revalidatePath("/crm/contacts");
  return { ok: true, starred: input.starred };
}
