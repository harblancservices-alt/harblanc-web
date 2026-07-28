"use server";

import { revalidatePath } from "next/cache";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { logActivity, CRM_ACTIVITY } from "@/lib/crm/activity";
import { DEFAULT_LIFECYCLE } from "../accounts/lifecycle";

/**
 * Field Capture — owner-only voice-to-lead tool. A field rep's dictated note
 * (one note can ramble across several companies) goes to the Anthropic
 * Messages API to be split into structured leads, each matched against the
 * org's existing companies so the review step can attach a contact to an
 * existing account instead of always creating a duplicate. Every write here
 * mirrors the org-scoping and activity-logging conventions in
 * accounts/actions.ts and ai-review/actions.ts.
 */

const LEAD_FIELDS = [
  "company_name",
  "website",
  "address",
  "city",
  "state",
  "zip",
  "industry",
  "commodities",
  "contact_name",
  "contact_title",
  "contact_phone",
  "contact_email",
  "notes",
] as const;

export type ParsedLead = {
  company_name: string;
  website: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  industry: string;
  commodities: string;
  contact_name: string;
  contact_title: string;
  contact_phone: string;
  contact_email: string;
  notes: string;
};

export type MatchedAccount = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
};

export type ParsedLeadWithMatches = ParsedLead & { matches: MatchedAccount[] };

export type ParseResult =
  | { ok: true; leads: ParsedLeadWithMatches[] }
  | { ok: false; error: string };

/** A reviewed lead ready to save. `companyChoice` is "" for a new company,
 * or an existing crm_accounts.id to attach the contact to that company. */
export type SaveLeadInput = ParsedLead & { companyChoice: string };

export type SaveSummary =
  | { ok: true; contactsAddedToExisting: number; newCompaniesForReview: number }
  | { ok: false; error: string };

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Escape LIKE/ILIKE wildcard characters so a company name containing "%" or
 * "_" can't turn a match lookup into an unintentionally broad scan. */
function escapeIlike(value: string): string {
  return value.replace(/[%_\\]/g, (m) => `\\${m}`);
}

function buildPrompt(transcript: string): string {
  return `You are extracting shipper-company sales leads from a field rep's rambling, unstructured voice note. The note may describe ONE or MULTIPLE companies and contacts, in no particular order, with filler words and false starts.

Return STRICT JSON ONLY — a single JSON array, with no markdown code fences and no commentary before or after it. Each array item is an object with EXACTLY these string fields (use "" for anything not mentioned, never null, never omit a field, never add extra fields):
${LEAD_FIELDS.map((f) => `"${f}"`).join(", ")}

Rules:
- One array item per distinct company/lead mentioned in the note.
- "commodities" is what freight/goods the shipper moves (e.g. "steel coils, machinery").
- Keep every value short and factual — never invent information the note doesn't contain.
- If the note mentions a person with no company name, still emit one item with the contact fields filled and company_name "".

VOICE NOTE:
"""
${transcript}
"""`;
}

async function callAnthropic(
  transcript: string,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "AI key not configured yet." };
  }

  const model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: [{ role: "user", content: buildPrompt(transcript) }],
      }),
    });
  } catch {
    return { ok: false, error: "Could not reach the AI service. Please try again." };
  }

  if (!res.ok) {
    return { ok: false, error: `AI service error (${res.status}). Please try again.` };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, error: "AI service returned an unreadable response." };
  }

  const content = (json as { content?: { type?: string; text?: string }[] } | null)
    ?.content;
  const text = Array.isArray(content)
    ? content.map((b) => (b?.type === "text" ? (b.text ?? "") : "")).join("")
    : "";

  if (!text.trim()) return { ok: false, error: "AI returned an empty response." };
  return { ok: true, text };
}

/** Parse the model's reply into leads, tolerating code fences and stray prose
 * around the JSON array. Returns null when the text isn't recoverable. */
function parseLeadsJson(raw: string): ParsedLead[] | null {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();

  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start !== -1 && end !== -1 && end > start) {
    s = s.slice(start, end + 1);
  }

  let data: unknown;
  try {
    data = JSON.parse(s);
  } catch {
    return null;
  }
  if (!Array.isArray(data)) return null;

  const leads: ParsedLead[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const lead: ParsedLead = {
      company_name: str(rec.company_name),
      website: str(rec.website),
      address: str(rec.address),
      city: str(rec.city),
      state: str(rec.state),
      zip: str(rec.zip),
      industry: str(rec.industry),
      commodities: str(rec.commodities),
      contact_name: str(rec.contact_name),
      contact_title: str(rec.contact_title),
      contact_phone: str(rec.contact_phone),
      contact_email: str(rec.contact_email),
      notes: str(rec.notes),
    };
    if (!lead.company_name && !lead.contact_name) continue;
    if (!lead.company_name) lead.company_name = lead.contact_name;
    leads.push(lead);
  }
  return leads;
}

/**
 * Parse a dictated field note into one or more leads, then look up each
 * lead's company against the org's existing accounts (case-insensitive
 * substring match on the name) so the review step can offer a match instead
 * of defaulting to a duplicate. Owner-only, matching every write below.
 */
export async function parseFieldCapture(transcript: string): Promise<ParseResult> {
  const user = await requireCrmUser();
  if (user.role !== "owner") {
    return { ok: false, error: "Only an admin can use Field Capture." };
  }

  const trimmed = transcript.trim();
  if (!trimmed) return { ok: false, error: "Record or type a note first." };

  const ai = await callAnthropic(trimmed);
  if (!ai.ok) return ai;

  const leads = parseLeadsJson(ai.text);
  if (!leads) {
    return { ok: false, error: "Could not parse the AI response. Try again or edit the note." };
  }
  if (!leads.length) {
    return { ok: false, error: "No leads found in that note. Try adding more detail." };
  }

  const supabase = await createCrmServerClient();

  const withMatches: ParsedLeadWithMatches[] = await Promise.all(
    leads.map(async (lead) => {
      if (!lead.company_name) return { ...lead, matches: [] };
      const { data } = await supabase
        .from("crm_accounts")
        .select("id, name, city, state")
        .eq("org_id", user.orgId)
        .is("deleted_at", null)
        .ilike("name", `%${escapeIlike(lead.company_name)}%`)
        .limit(5);
      return { ...lead, matches: (data ?? []) as MatchedAccount[] };
    }),
  );

  return { ok: true, leads: withMatches };
}

function revalidateFieldCapturePaths() {
  revalidatePath("/crm/ai-review");
  revalidatePath("/crm/accounts");
  revalidatePath("/crm/contacts");
  revalidatePath("/crm");
}

/**
 * Save the admin's reviewed leads. Each lead independently goes down one of
 * two paths:
 *  - Existing company (companyChoice set): insert just the contact (+ an
 *    optional non-pinned note) onto that account. No review-queue step.
 *  - New company (companyChoice ""): create the crm_account with
 *    source='field_capture' + ai_status='pending_review' so it lands in the
 *    same admin Review queue as AI-agent leads, plus its contact (set as
 *    primary) and a pinned note capturing the raw field note.
 * A lead that fails partway (bad account id, insert error) is skipped rather
 * than aborting the whole batch, so one bad row doesn't lose the rest.
 */
export async function saveFieldCapture(leads: SaveLeadInput[]): Promise<SaveSummary> {
  const user = await requireCrmUser();
  if (user.role !== "owner") {
    return { ok: false, error: "Only an admin can save Field Capture leads." };
  }
  if (!leads.length) return { ok: false, error: "Nothing to save." };

  const supabase = await createCrmServerClient();

  let contactsAddedToExisting = 0;
  let newCompaniesForReview = 0;

  for (const lead of leads) {
    const companyName = lead.company_name.trim();
    if (!companyName) continue;

    const existingId = lead.companyChoice.trim();

    if (existingId) {
      const { data: account } = await supabase
        .from("crm_accounts")
        .select("id")
        .eq("id", existingId)
        .eq("org_id", user.orgId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!account) continue;

      const contactName = lead.contact_name.trim();
      if (!contactName) continue;

      const { data: contact, error } = await supabase
        .from("crm_contacts")
        .insert({
          org_id: user.orgId,
          account_id: account.id,
          name: contactName,
          title: lead.contact_title.trim() || null,
          phone: lead.contact_phone.trim() || null,
          email: lead.contact_email.trim() || null,
        })
        .select("id")
        .single();
      if (error || !contact) continue;

      contactsAddedToExisting++;

      await logActivity(supabase, {
        orgId: user.orgId,
        userId: user.id,
        accountId: account.id as string,
        contactId: contact.id as string,
        kind: CRM_ACTIVITY.contactAdded,
        summary: `Contact added via Field Capture: ${contactName}`,
      });

      const noteBody = lead.notes.trim();
      if (noteBody) {
        await supabase.from("crm_notes").insert({
          org_id: user.orgId,
          account_id: account.id,
          user_id: user.id,
          body: noteBody,
          is_pinned: false,
        });
      }
    } else {
      const { data: newAccount, error } = await supabase
        .from("crm_accounts")
        .insert({
          org_id: user.orgId,
          name: companyName,
          website: lead.website.trim() || null,
          address: lead.address.trim() || null,
          city: lead.city.trim() || null,
          state: lead.state.trim() || null,
          zip: lead.zip.trim() || null,
          industry: lead.industry.trim() || null,
          commodities: lead.commodities.trim() || null,
          lifecycle_status: DEFAULT_LIFECYCLE,
          source: "field_capture",
          ai_status: "pending_review",
        })
        .select("id")
        .single();
      if (error || !newAccount) continue;

      const accountId = newAccount.id as string;
      newCompaniesForReview++;

      await logActivity(supabase, {
        orgId: user.orgId,
        userId: user.id,
        accountId,
        kind: CRM_ACTIVITY.accountCreated,
        summary: `Company added via Field Capture: ${companyName}`,
      });

      const contactName = lead.contact_name.trim();
      if (contactName) {
        const { data: contact, error: contactErr } = await supabase
          .from("crm_contacts")
          .insert({
            org_id: user.orgId,
            account_id: accountId,
            name: contactName,
            title: lead.contact_title.trim() || null,
            phone: lead.contact_phone.trim() || null,
            email: lead.contact_email.trim() || null,
          })
          .select("id")
          .single();

        if (!contactErr && contact) {
          const contactId = contact.id as string;
          await logActivity(supabase, {
            orgId: user.orgId,
            userId: user.id,
            accountId,
            contactId,
            kind: CRM_ACTIVITY.contactAdded,
            summary: `Contact added: ${contactName}`,
          });
          await supabase
            .from("crm_accounts")
            .update({ primary_contact_id: contactId })
            .eq("id", accountId);
        }
      }

      const noteBody = lead.notes.trim() || "Captured via Field Capture (no additional notes).";
      await supabase.from("crm_notes").insert({
        org_id: user.orgId,
        account_id: accountId,
        user_id: user.id,
        body: noteBody,
        is_pinned: true,
      });
    }
  }

  revalidateFieldCapturePaths();
  return { ok: true, contactsAddedToExisting, newCompaniesForReview };
}
