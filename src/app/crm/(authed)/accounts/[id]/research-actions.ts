"use server";

import { revalidatePath } from "next/cache";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { logActivity, CRM_ACTIVITY } from "@/lib/crm/activity";
import { GUESS_FIELDS, type GuessField } from "./desktop/file/researchGuesses";

/**
 * ACCEPTING AND DISMISSING THE RESEARCH PANEL'S GUESSES.
 *
 * ── THE ONE RULE ──────────────────────────────────────────────────────
 *
 * Nothing here writes a value the user did not press Yes to. The panel
 * offers; a person decides; this records the decision. There is no path in
 * this file that fills a column on its own, and there must never be one —
 * a silent wrong guess on a company record is worse than a blank, because
 * a blank is visibly a gap and a wrong value is invisibly a lie.
 *
 * ── PERMISSIONS ARE THE SAME ONES EVERY OTHER FIELD WRITE USES ────────
 *
 * requireCrmUser() plus the cookie-bound RLS client, exactly as
 * details-actions.ts's applyUpdate does. crm_accounts_rw scopes rows BY ORG,
 * so any CRM user may edit any company in their own org and nobody can
 * touch another org's. That is wider than "only companies assigned to me" —
 * it is the rule the whole app already runs on, and this feature does not
 * get to invent a narrower or wider one of its own.
 *
 * ── ACCEPTED IS NOT THE SAME AS TRUE ──────────────────────────────────
 *
 * An accepted value is written to its real column AND stamped into
 * research_marks with the basis it was inferred from, then logged to the
 * activity trail naming both. So the record shows the value, and anybody
 * asking where it came from gets "9 other branches of the same company are
 * recorded this way — accepted by Tyler on 31 Aug" rather than a fact with
 * no parent. Same honesty rule as the BOL provenance pills.
 */

type Ok = { ok: true };
type Err = { ok: false; error: string };
export type ResearchResult = Ok | Err;

/** Where an accepted guess lands. `contact` is absent on purpose: a person
 * is created through the real contact dialog, never written from here. */
const GUESS_COLUMN: Record<Exclude<GuessField, "contact">, string> = {
  industry: "industry",
  phone: "phone",
  website: "website",
};

function isGuessField(v: string): v is GuessField {
  return (GUESS_FIELDS as readonly string[]).includes(v);
}

/** Re-read the marks, merge one key, write the whole object back.
 *
 * Read-modify-write rather than a jsonb_set RPC because the object is tiny
 * and the loser of a genuine race is one guess mark, not a field value.
 * Both writers here are a person clicking a button on one company. */
async function mark(
  supabase: Awaited<ReturnType<typeof createCrmServerClient>>,
  accountId: string,
  field: GuessField,
  entry: Record<string, unknown>,
): Promise<boolean> {
  const { data } = await supabase
    .from("crm_accounts")
    .select("research_marks")
    .eq("id", accountId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return false;

  const marks = (data.research_marks as Record<string, unknown> | null) ?? {};
  const { error } = await supabase
    .from("crm_accounts")
    .update({ research_marks: { ...marks, [field]: entry } })
    .eq("id", accountId);
  return !error;
}

/**
 * Take the offered value: write the column, record where it came from.
 *
 * The value is re-sent by the client and NOT trusted as a free-text write —
 * it lands only in the column this field maps to, and `contact` (which has
 * no column) is refused outright rather than being quietly ignored.
 */
export async function acceptGuess(input: {
  accountId: string;
  field: string;
  value: string;
  basis: string;
}): Promise<ResearchResult> {
  const user = await requireCrmUser();
  if (!isGuessField(input.field)) return { ok: false, error: "Unknown field." };
  if (input.field === "contact") {
    return { ok: false, error: "Add the person with the contact form so their details are kept." };
  }

  const value = input.value.trim();
  if (!value) return { ok: false, error: "There is nothing to accept." };

  const supabase = await createCrmServerClient();
  const column = GUESS_COLUMN[input.field];

  const { data: account } = await supabase
    .from("crm_accounts")
    .select("id")
    .eq("id", input.accountId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!account) return { ok: false, error: "Company not found." };

  const { error } = await supabase
    .from("crm_accounts")
    .update({ [column]: value })
    .eq("id", input.accountId);
  if (error) return { ok: false, error: "Could not save. Please try again." };

  const basis = input.basis.trim().slice(0, 300);
  await mark(supabase, input.accountId, input.field, {
    state: "accepted",
    value,
    basis,
    at: new Date().toISOString(),
    by: user.id,
  });

  // The trail says it was inferred, not established. See the file note.
  await logActivity(supabase, {
    orgId: user.orgId,
    userId: user.id,
    accountId: input.accountId,
    kind: CRM_ACTIVITY.detailsUpdated,
    summary: `Suggested ${input.field} accepted: ${value}`,
    body: basis ? `Suggested because ${basis}. Accepted, not confirmed with the company.` : null,
    meta: { source: "research_guess", field: input.field, value, basis },
  });

  revalidatePath(`/crm/accounts/${input.accountId}`);
  return { ok: true };
}

/**
 * Turn the offer down, for good.
 *
 * No column is touched. The mark is the entire effect, and its entire
 * purpose: an agent who has already decided the guessed website is wrong
 * must not be asked about it again every time they open the company. A
 * suggestion that keeps coming back after you have said no is how a person
 * learns to stop reading suggestions.
 */
export async function dismissGuess(input: {
  accountId: string;
  field: string;
}): Promise<ResearchResult> {
  const user = await requireCrmUser();
  if (!isGuessField(input.field)) return { ok: false, error: "Unknown field." };

  const supabase = await createCrmServerClient();
  const ok = await mark(supabase, input.accountId, input.field, {
    state: "dismissed",
    at: new Date().toISOString(),
    by: user.id,
  });
  if (!ok) return { ok: false, error: "Could not save that. Please try again." };

  revalidatePath(`/crm/accounts/${input.accountId}`);
  return { ok: true };
}
