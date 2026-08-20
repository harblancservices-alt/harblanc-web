"use server";

import { revalidatePath } from "next/cache";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { logActivity, CRM_ACTIVITY } from "@/lib/crm/activity";
import { createAccount, createContact } from "../../accounts/actions";
import { createLocation } from "../../accounts/[id]/locations-actions";
import { normalizeStage } from "../../accounts/lifecycle";
import { rankByName, type ScoredMatch } from "./matching";

/**
 * BOL Center (/crm/admin/bol-center) — the DOWNSTREAM review workflow for a
 * BOL that an upstream Claude session already extracted/researched and
 * inserted into crm_bol_entries (+ crm_bol_contacts, + an attached
 * crm_documents row). This file never extracts anything itself — every
 * action here resolves an already-captured row against real
 * crm_accounts/crm_contacts/crm_account_locations records (link existing, or
 * create new through the SAME actions the rest of the CRM uses —
 * createAccount/createContact/createLocation — never a parallel insert), and
 * every write is admin-only, independently re-verified per this repo's
 * crm/admin/**\/actions.ts convention.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };
export type BolStatus = "new" | "needs_review" | "ready" | "processed" | "ignored";
export type CompanySide = "shipper" | "consignee";
export type BolContactRole = "shipper" | "consignee" | "bill_to" | "other";

async function requireAdminUser() {
  const user = await requireCrmUser();
  if (user.role !== "owner") throw new Error("Only an admin can work BOL Center.");
  return user;
}

function revalidateBol(bolId?: string) {
  revalidatePath("/crm/admin/bol-center");
  revalidatePath("/crm/admin");
  if (bolId) revalidatePath(`/crm/admin/bol-center/${bolId}`);
}

function accountCol(side: CompanySide): "matched_shipper_account_id" | "matched_consignee_account_id" {
  return side === "shipper" ? "matched_shipper_account_id" : "matched_consignee_account_id";
}
function locationCol(side: CompanySide): "matched_shipper_location_id" | "matched_consignee_location_id" {
  return side === "shipper" ? "matched_shipper_location_id" : "matched_consignee_location_id";
}
function nameField(side: CompanySide): "shipper_name" | "consignee_name" {
  return side === "shipper" ? "shipper_name" : "consignee_name";
}
function addressField(side: CompanySide): "shipper_address" | "consignee_address" {
  return side === "shipper" ? "shipper_address" : "consignee_address";
}

/** Both sides resolved and status hasn't been manually pinned elsewhere ->
 * status becomes 'ready' automatically. This is a computed fact (both FKs
 * are non-null), never a manual label-flip. 'needs_review'/'processed'/
 * 'ignored' are sticky — only their own explicit actions change them. */
async function recomputeReadyStatus(supabase: Awaited<ReturnType<typeof createCrmServerClient>>, bolId: string) {
  const { data: row } = await supabase
    .from("crm_bol_entries")
    .select("status, matched_shipper_account_id, matched_consignee_account_id")
    .eq("id", bolId)
    .maybeSingle();
  if (!row) return;
  if (row.status !== "new" && row.status !== "ready") return;
  const bothResolved = Boolean(row.matched_shipper_account_id) && Boolean(row.matched_consignee_account_id);
  const nextStatus = bothResolved ? "ready" : "new";
  if (nextStatus !== row.status) {
    await supabase.from("crm_bol_entries").update({ status: nextStatus }).eq("id", bolId);
  }
}

/** Keep the attached document's account_id pointed at whichever company is
 * resolved (shipper preferred), so it shows up on that company's own BOL tab
 * for free (BolSection.tsx reads crm_documents where account_id = X). */
async function syncDocumentAccount(supabase: Awaited<ReturnType<typeof createCrmServerClient>>, bolId: string) {
  const { data: row } = await supabase
    .from("crm_bol_entries")
    .select("document_id, matched_shipper_account_id, matched_consignee_account_id")
    .eq("id", bolId)
    .maybeSingle();
  if (!row?.document_id) return;
  const accountId = row.matched_shipper_account_id ?? row.matched_consignee_account_id ?? null;
  await supabase.from("crm_documents").update({ account_id: accountId }).eq("id", row.document_id);
}

// ── Company matching ─────────────────────────────────────────────────────────

export type CompanyCandidate = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  address: string | null;
};

export async function searchCompanyMatches(
  queryName: string,
  queryAddressText: string | null,
): Promise<ScoredMatch<CompanyCandidate>[]> {
  await requireAdminUser();
  if (!queryName.trim()) return [];
  const supabase = await createCrmServerClient();
  const { data } = await supabase
    .from("crm_accounts")
    .select("id, name, city, state, address")
    .is("deleted_at", null)
    .limit(500);

  const candidates = (data ?? []) as CompanyCandidate[];
  const addrLower = (queryAddressText ?? "").toLowerCase();
  return rankByName(
    candidates,
    queryName,
    (c) => c.name,
    (c) => Boolean(c.city && c.state && addrLower.includes(c.city.toLowerCase()) && addrLower.includes(c.state.toLowerCase())),
  );
}

export async function linkCompany(bolId: string, side: CompanySide, accountId: string): Promise<ActionResult> {
  const user = await requireAdminUser();
  const supabase = await createCrmServerClient();
  const { error } = await supabase.from("crm_bol_entries").update({ [accountCol(side)]: accountId }).eq("id", bolId);
  if (error) return { ok: false, error: "Could not link the company." };

  await logActivity(supabase, {
    orgId: user.orgId,
    userId: user.id,
    accountId,
    kind: CRM_ACTIVITY.lifecycleChanged,
    summary: `Linked as ${side} on a BOL`,
  });

  await recomputeReadyStatus(supabase, bolId);
  await syncDocumentAccount(supabase, bolId);
  revalidateBol(bolId);
  return { ok: true };
}

/** Creates a brand-new company via the SAME createAccount() every other
 * "Add company" flow in the CRM uses — no parallel insert path. */
export async function createCompanyFromBol(bolId: string, side: CompanySide, formData: FormData): Promise<ActionResult> {
  await requireAdminUser();
  const result = await createAccount(formData);
  if (!result.ok) return result;
  return linkCompany(bolId, side, result.id);
}

/** Non-destructive: only fills the matched company's address if it's
 * currently empty, then links. Never overwrites data that's already there. */
export async function updateExistingCompanyFromBol(bolId: string, side: CompanySide, accountId: string): Promise<ActionResult> {
  const user = await requireAdminUser();
  const supabase = await createCrmServerClient();

  const { data: bol } = await supabase.from("crm_bol_entries").select(addressField(side)).eq("id", bolId).maybeSingle();
  const bolAddress = bol ? ((bol as Record<string, unknown>)[addressField(side)] as string | null) : null;

  if (bolAddress) {
    const { data: account } = await supabase.from("crm_accounts").select("address").eq("id", accountId).maybeSingle();
    if (account && !account.address) {
      await supabase.from("crm_accounts").update({ address: bolAddress }).eq("id", accountId);
      await logActivity(supabase, {
        orgId: user.orgId,
        userId: user.id,
        accountId,
        kind: CRM_ACTIVITY.detailsUpdated,
        summary: "Address filled in from a BOL",
      });
    }
  }

  return linkCompany(bolId, side, accountId);
}

// ── Location matching ────────────────────────────────────────────────────────

export type LocationCandidate = {
  id: string;
  label: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

export async function searchLocationMatches(accountId: string, queryAddressText: string | null): Promise<ScoredMatch<LocationCandidate>[]> {
  await requireAdminUser();
  if (!queryAddressText?.trim()) return [];
  const supabase = await createCrmServerClient();
  const { data } = await supabase
    .from("crm_account_locations")
    .select("id, label, address, city, state, zip")
    .eq("account_id", accountId)
    .is("deleted_at", null)
    .limit(50);

  const candidates = (data ?? []) as LocationCandidate[];
  return rankByName(
    candidates,
    queryAddressText,
    (c) => c.address ?? "",
    (c) => Boolean(c.city && queryAddressText.toLowerCase().includes(c.city.toLowerCase())),
  );
}

export async function linkLocation(bolId: string, side: CompanySide, locationId: string): Promise<ActionResult> {
  await requireAdminUser();
  const supabase = await createCrmServerClient();
  const { error } = await supabase.from("crm_bol_entries").update({ [locationCol(side)]: locationId }).eq("id", bolId);
  if (error) return { ok: false, error: "Could not link the location." };
  revalidateBol(bolId);
  return { ok: true };
}

/** Creates a location via the existing createLocation() action (the same
 * one the Details tab's "Locations & docks" group uses), then links it. */
export async function createLocationFromBol(bolId: string, side: CompanySide, accountId: string, formData: FormData): Promise<ActionResult> {
  await requireAdminUser();
  const supabase = await createCrmServerClient();
  const result = await createLocation(accountId, formData);
  if (!result.ok) return result;

  const { data: created } = await supabase
    .from("crm_account_locations")
    .select("id")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!created) return { ok: false, error: "Location saved, but couldn't be linked. Please link it manually." };
  return linkLocation(bolId, side, created.id as string);
}

// ── Contact matching (crm_bol_contacts, populated upstream) ─────────────────

export type ContactCandidate = {
  id: string;
  name: string;
  title: string | null;
  phone: string | null;
  email: string | null;
};

export async function searchContactMatches(accountId: string, queryName: string): Promise<ScoredMatch<ContactCandidate>[]> {
  await requireAdminUser();
  if (!queryName.trim()) return [];
  const supabase = await createCrmServerClient();
  const { data } = await supabase
    .from("crm_contacts")
    .select("id, name, title, phone, email")
    .eq("account_id", accountId)
    .is("deleted_at", null)
    .limit(200);

  const candidates = (data ?? []) as ContactCandidate[];
  return rankByName(candidates, queryName, (c) => c.name);
}

export async function linkBolContact(bolContactId: string, contactId: string): Promise<ActionResult> {
  await requireAdminUser();
  const supabase = await createCrmServerClient();
  const { error } = await supabase.from("crm_bol_contacts").update({ matched_contact_id: contactId }).eq("id", bolContactId);
  if (error) return { ok: false, error: "Could not link the contact." };
  const { data: row } = await supabase.from("crm_bol_contacts").select("bol_id").eq("id", bolContactId).maybeSingle();
  if (row) revalidateBol(row.bol_id as string);
  return { ok: true };
}

/** Creates the contact via createContact() under whichever company is
 * already resolved for this contact's role — a contact is never created
 * without an account_id. */
export async function createContactFromBolContact(bolContactId: string, formData: FormData): Promise<ActionResult> {
  await requireAdminUser();
  const supabase = await createCrmServerClient();

  const { data: bc } = await supabase.from("crm_bol_contacts").select("bol_id, role").eq("id", bolContactId).maybeSingle();
  if (!bc) return { ok: false, error: "Contact record not found." };

  const { data: bol } = await supabase
    .from("crm_bol_entries")
    .select("matched_shipper_account_id, matched_consignee_account_id")
    .eq("id", bc.bol_id as string)
    .maybeSingle();
  if (!bol) return { ok: false, error: "BOL not found." };

  const accountId =
    bc.role === "consignee" ? (bol.matched_consignee_account_id as string | null) : (bol.matched_shipper_account_id as string | null);
  if (!accountId) {
    return { ok: false, error: "Resolve the company for this side of the BOL before creating a contact." };
  }

  const result = await createContact(accountId, formData);
  if (!result.ok) return result;

  const { data: created } = await supabase
    .from("crm_contacts")
    .select("id")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!created) return { ok: false, error: "Contact saved, but couldn't be linked. Please link it manually." };
  return linkBolContact(bolContactId, created.id as string);
}

export async function updateBolContactFields(bolContactId: string, formData: FormData): Promise<ActionResult> {
  await requireAdminUser();
  const supabase = await createCrmServerClient();
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();

  const { error } = await supabase
    .from("crm_bol_contacts")
    .update({ name: name || null, phone: phone || null, email: email || null })
    .eq("id", bolContactId);
  if (error) return { ok: false, error: "Could not save." };

  const { data: row } = await supabase.from("crm_bol_contacts").select("bol_id").eq("id", bolContactId).maybeSingle();
  if (row) revalidateBol(row.bol_id as string);
  return { ok: true };
}

// ── Prospects ─────────────────────────────────────────────────────────────────

export async function addToProspects(accountId: string): Promise<ActionResult> {
  const user = await requireAdminUser();
  const supabase = await createCrmServerClient();
  const { error } = await supabase
    .from("crm_accounts")
    .update({ lifecycle_status: normalizeStage("prospect"), source: "bol" })
    .eq("id", accountId);
  if (error) return { ok: false, error: "Could not add to Prospects." };

  await logActivity(supabase, {
    orgId: user.orgId,
    userId: user.id,
    accountId,
    kind: CRM_ACTIVITY.lifecycleChanged,
    summary: "Added to Prospects from a BOL",
  });

  revalidatePath("/crm/accounts");
  revalidatePath(`/crm/accounts/${accountId}`);
  return { ok: true };
}

// ── BOL status / lifecycle ───────────────────────────────────────────────────

export async function markNeedsReview(bolId: string): Promise<ActionResult> {
  await requireAdminUser();
  const supabase = await createCrmServerClient();
  const { error } = await supabase.from("crm_bol_entries").update({ status: "needs_review" }).eq("id", bolId);
  if (error) return { ok: false, error: "Could not update status." };
  revalidateBol(bolId);
  return { ok: true };
}

export async function clearNeedsReview(bolId: string): Promise<ActionResult> {
  await requireAdminUser();
  const supabase = await createCrmServerClient();
  const { error } = await supabase.from("crm_bol_entries").update({ status: "new" }).eq("id", bolId);
  if (error) return { ok: false, error: "Could not update status." };
  await recomputeReadyStatus(supabase, bolId);
  revalidateBol(bolId);
  return { ok: true };
}

export async function markProcessed(bolId: string): Promise<ActionResult> {
  const user = await requireAdminUser();
  const supabase = await createCrmServerClient();
  const { error } = await supabase
    .from("crm_bol_entries")
    .update({ status: "processed", processed_at: new Date().toISOString(), processed_by_user_id: user.id })
    .eq("id", bolId);
  if (error) return { ok: false, error: "Could not mark this BOL processed." };
  revalidateBol(bolId);
  return { ok: true };
}

export async function ignoreBol(bolId: string): Promise<ActionResult> {
  await requireAdminUser();
  const supabase = await createCrmServerClient();
  const { error } = await supabase.from("crm_bol_entries").update({ status: "ignored" }).eq("id", bolId);
  if (error) return { ok: false, error: "Could not ignore this BOL." };
  revalidateBol(bolId);
  return { ok: true };
}

export async function reopenBol(bolId: string): Promise<ActionResult> {
  await requireAdminUser();
  const supabase = await createCrmServerClient();
  const { error } = await supabase.from("crm_bol_entries").update({ status: "new" }).eq("id", bolId);
  if (error) return { ok: false, error: "Could not reopen this BOL." };
  await recomputeReadyStatus(supabase, bolId);
  revalidateBol(bolId);
  return { ok: true };
}

// ── From-BOL fields + research notes (admin corrections) ───────────────────

export async function updateExtractedFields(bolId: string, formData: FormData): Promise<ActionResult> {
  await requireAdminUser();
  const supabase = await createCrmServerClient();
  const fields: Record<string, string | null> = {};
  for (const key of [
    "bol_number",
    "carrier",
    "shipper_name",
    "shipper_address",
    "consignee_name",
    "consignee_address",
    "bill_to",
    "commodity",
    "weight",
    "pickup_date",
    "delivery_date",
    "reference",
  ]) {
    const v = String(formData.get(key) ?? "").trim();
    fields[key] = v || null;
  }

  const { error } = await supabase.from("crm_bol_entries").update(fields).eq("id", bolId);
  if (error) return { ok: false, error: "Could not save changes." };
  revalidateBol(bolId);
  return { ok: true };
}

export async function saveResearchNotes(bolId: string, notes: string): Promise<ActionResult> {
  await requireAdminUser();
  const supabase = await createCrmServerClient();
  const { error } = await supabase.from("crm_bol_entries").update({ notes: notes || null }).eq("id", bolId);
  if (error) return { ok: false, error: "Could not save notes." };
  revalidateBol(bolId);
  return { ok: true };
}

// ── Document attachment (fallback — normally arrives already attached) ─────

export async function attachBolDocument(
  bolId: string,
  input: { fileName: string; storagePath: string; mimeType: string | null; sizeBytes: number | null },
): Promise<ActionResult> {
  const user = await requireAdminUser();
  const supabase = await createCrmServerClient();

  const { data: doc, error: docError } = await supabase
    .from("crm_documents")
    .insert({
      org_id: user.orgId,
      user_id: user.id,
      kind: "bol",
      file_name: input.fileName,
      storage_path: input.storagePath,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
    })
    .select("id")
    .single();

  if (docError || !doc) return { ok: false, error: "Could not save the file record." };

  const { error } = await supabase.from("crm_bol_entries").update({ document_id: doc.id }).eq("id", bolId);
  if (error) return { ok: false, error: "File uploaded, but couldn't be attached to this BOL." };

  await syncDocumentAccount(supabase, bolId);
  revalidateBol(bolId);
  return { ok: true };
}
