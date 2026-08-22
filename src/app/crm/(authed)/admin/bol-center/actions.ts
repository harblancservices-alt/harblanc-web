"use server";

import { revalidatePath } from "next/cache";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { logActivity, CRM_ACTIVITY } from "@/lib/crm/activity";
import { createAccount, createContact } from "../../accounts/actions";
import { createLocation } from "../../accounts/[id]/locations-actions";
import { normalizeStage, stageRank } from "../../accounts/lifecycle";
import { rankByName, billToPartyName, type ScoredMatch } from "./matching";

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
export type CompanySide = "shipper" | "consignee" | "bill_to";
/** Locations are real physical dock addresses — only shipper/consignee have
 * one; a Bill To party is a billing contact, never a pickup/delivery point. */
export type LocationSide = "shipper" | "consignee";
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

const ACCOUNT_COL_BY_SIDE = {
  shipper: "matched_shipper_account_id",
  consignee: "matched_consignee_account_id",
  bill_to: "matched_bill_to_account_id",
} as const;
function accountCol(side: CompanySide): "matched_shipper_account_id" | "matched_consignee_account_id" | "matched_bill_to_account_id" {
  return ACCOUNT_COL_BY_SIDE[side];
}
function locationCol(side: LocationSide): "matched_shipper_location_id" | "matched_consignee_location_id" {
  return side === "shipper" ? "matched_shipper_location_id" : "matched_consignee_location_id";
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

/** The reverse direction from syncDocumentAccount: if this BOL still has no
 * document attached, but the company just linked to it already has a BOL on
 * file (e.g. someone uploaded it straight to the company's own BOL tab
 * before ever touching BOL Center), adopt the most recent one instead of
 * leaving the BOL entry looking document-less. Never overwrites a document
 * BOL Center already has attached. */
async function adoptExistingCompanyDocument(supabase: Awaited<ReturnType<typeof createCrmServerClient>>, bolId: string, accountId: string) {
  const { data: bol } = await supabase.from("crm_bol_entries").select("document_id").eq("id", bolId).maybeSingle();
  if (bol?.document_id) return;

  const { data: existingDoc } = await supabase
    .from("crm_documents")
    .select("id")
    .eq("account_id", accountId)
    .eq("kind", "bol")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingDoc) {
    await supabase.from("crm_bol_entries").update({ document_id: existingDoc.id }).eq("id", bolId);
  }
}

/** Fans this BOL's attached document out to EVERY resolved company (shipper,
 * consignee, bill-to) — not just one preferred side. crm_documents already
 * supports many rows sharing one storage_path, so this reuses the file (no
 * duplicate upload) and just adds one lightweight metadata row per company
 * that doesn't already have one, so each company's own BolSection.tsx query
 * (account_id + kind='bol') independently finds it. The original document
 * row (BOL Center's canonical document_id) is never modified. */
async function propagateDocumentToResolvedCompanies(supabase: Awaited<ReturnType<typeof createCrmServerClient>>, bolId: string) {
  const { data: row } = await supabase
    .from("crm_bol_entries")
    .select("org_id, document_id, matched_shipper_account_id, matched_consignee_account_id, matched_bill_to_account_id")
    .eq("id", bolId)
    .maybeSingle();
  if (!row?.document_id) return;

  const { data: doc } = await supabase
    .from("crm_documents")
    .select("file_name, storage_path, mime_type")
    .eq("id", row.document_id)
    .maybeSingle();
  if (!doc) return;

  const accountIds = [row.matched_shipper_account_id, row.matched_consignee_account_id, row.matched_bill_to_account_id].filter(
    (id): id is string => Boolean(id),
  );

  for (const accountId of accountIds) {
    const { data: existing } = await supabase
      .from("crm_documents")
      .select("id")
      .eq("account_id", accountId)
      .eq("kind", "bol")
      .eq("storage_path", doc.storage_path)
      .is("deleted_at", null)
      .maybeSingle();
    if (existing) continue;

    await supabase.from("crm_documents").insert({
      org_id: row.org_id,
      account_id: accountId,
      kind: "bol",
      file_name: doc.file_name,
      storage_path: doc.storage_path,
      mime_type: doc.mime_type,
    });
  }
}

/**
 * The ONE place BOL Center ever writes lifecycle_status/source — every
 * "Add to Prospects"/"Quick add"/link/create path funnels through this, so
 * the no-downgrade guardrail (Brent, 2026-08-21) can never be bypassed by a
 * new call site forgetting to check it. Only advances a company to
 * 'prospect' when its current stage ranks BELOW prospect (lead/researching/
 * contacted) — a company already at or beyond prospect (in_the_door/quoted/
 * active_customer, or the terminal inactive/lost) is left exactly where it
 * is; BOL Center only ever links it. source is set to 'bol' only when the
 * account has no source yet, so a real existing source is never clobbered.
 * Only logs a "Added to Prospects" activity entry when it actually promotes
 * — a pure link (no stage change) doesn't spam the activity feed.
 */
async function promoteToProspectWithGuardrail(
  supabase: Awaited<ReturnType<typeof createCrmServerClient>>,
  user: { orgId: string; id: string },
  accountId: string,
): Promise<ActionResult> {
  const { data: account } = await supabase.from("crm_accounts").select("lifecycle_status, source").eq("id", accountId).maybeSingle();
  if (!account) return { ok: false, error: "Company not found." };

  const currentStage = normalizeStage(account.lifecycle_status as string | null);
  const willPromote = stageRank(currentStage) < stageRank("prospect");

  const fields: { lifecycle_status?: string; source?: string } = {};
  if (willPromote) fields.lifecycle_status = "prospect";
  if (!account.source) fields.source = "bol";

  if (Object.keys(fields).length > 0) {
    const { error } = await supabase.from("crm_accounts").update(fields).eq("id", accountId);
    if (error) return { ok: false, error: "Could not update the company." };
  }

  if (willPromote) {
    await logActivity(supabase, {
      orgId: user.orgId,
      userId: user.id,
      accountId,
      kind: CRM_ACTIVITY.lifecycleChanged,
      summary: "Added to Prospects from a BOL",
    });
    revalidatePath("/crm/accounts");
    revalidatePath(`/crm/accounts/${accountId}`);
  }

  return { ok: true };
}

/** Auto-attaches this side's still-unresolved crm_bol_contacts to the
 * account just linked/promoted — reuses resolveBolContact exactly (real
 * dedup match-or-create, never a parallel insert). A contact with no name
 * at all is skipped (nothing to attach); one with a name but no phone/email
 * is still attached (never silently dropped) — resolveBolContact doesn't
 * require either, only a name. */
async function autoAttachContactsForSide(
  supabase: Awaited<ReturnType<typeof createCrmServerClient>>,
  bolId: string,
  side: CompanySide,
) {
  const { data: contacts } = await supabase
    .from("crm_bol_contacts")
    .select("id, name")
    .eq("bol_id", bolId)
    .eq("role", side)
    .is("matched_contact_id", null);

  for (const c of (contacts ?? []) as { id: string; name: string | null }[]) {
    if (!c.name?.trim()) continue;
    await resolveBolContact(c.id);
  }
}

/** The retroactive counterpart to autoAttachContactsForSide — for a company
 * that was already linked to a BOL side before it's promoted (e.g. an older
 * BOL matched before this auto-attach existed, or addToProspects called
 * directly on an already-resolved side), finds every BOL side this account
 * is currently linked to and attaches each one's remaining contacts. */
async function autoAttachContactsForAccount(supabase: Awaited<ReturnType<typeof createCrmServerClient>>, accountId: string) {
  const { data: rows } = await supabase
    .from("crm_bol_entries")
    .select("id, matched_shipper_account_id, matched_consignee_account_id, matched_bill_to_account_id")
    .or(`matched_shipper_account_id.eq.${accountId},matched_consignee_account_id.eq.${accountId},matched_bill_to_account_id.eq.${accountId}`);

  for (const row of (rows ?? []) as {
    id: string;
    matched_shipper_account_id: string | null;
    matched_consignee_account_id: string | null;
    matched_bill_to_account_id: string | null;
  }[]) {
    if (row.matched_shipper_account_id === accountId) await autoAttachContactsForSide(supabase, row.id, "shipper");
    if (row.matched_consignee_account_id === accountId) await autoAttachContactsForSide(supabase, row.id, "consignee");
    if (row.matched_bill_to_account_id === accountId) await autoAttachContactsForSide(supabase, row.id, "bill_to");
  }
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

/**
 * Links a company to this BOL side AND promotes it (subject to the
 * no-downgrade guardrail) AND auto-attaches this side's contacts — every
 * caller (candidate "Use this", quick-add, create-and-prospect) gets all
 * three for free from this one function, so no path can link a company
 * without also promoting it (2026-08-21 fix: previously the candidate-review
 * "Use this" button called this function directly with no promotion at all,
 * which is why matched-but-unpromoted companies were getting stuck on Lead).
 */
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

  const promoteResult = await promoteToProspectWithGuardrail(supabase, user, accountId);
  if (!promoteResult.ok) return promoteResult;

  await autoAttachContactsForSide(supabase, bolId, side);
  await recomputeReadyStatus(supabase, bolId);
  await adoptExistingCompanyDocument(supabase, bolId, accountId);
  await propagateDocumentToResolvedCompanies(supabase, bolId);
  if (side === "shipper" || side === "consignee") {
    await autoResolveLocation(supabase, bolId, side, accountId);
  }
  revalidateBol(bolId);
  return { ok: true };
}

export type ResolveCompanyResult = { ok: true; accountId: string } | { ok: false; error: string };

/**
 * The single-click "Add to Prospects" path — collapses search, link-or-
 * create, and prospect promotion into one action so the UI never has to
 * show a pre-filled form for data the BOL already gave us. Still runs the
 * real matcher first (never skips dedup): only "exact"/"likely" tiers count
 * as confident enough to auto-link without a human picking from a list —
 * "possible" is too weak to auto-apply, so that case falls through to
 * create-new exactly like a genuine no-match would. A brand-new company is
 * created straight into 'prospect' (not the usual 'lead' default) since
 * that's the whole point of this button; an existing company gets promoted
 * the same way addToProspects always has.
 */
export async function resolveAndProspectCompany(bolId: string, side: CompanySide): Promise<ResolveCompanyResult> {
  await requireAdminUser();
  const supabase = await createCrmServerClient();

  const { data: bol } = await supabase
    .from("crm_bol_entries")
    .select("shipper_name, shipper_address, consignee_name, consignee_address, bill_to")
    .eq("id", bolId)
    .maybeSingle();
  if (!bol) return { ok: false, error: "BOL not found." };

  let queryName: string;
  let queryAddress: string | null;
  if (side === "shipper") {
    queryName = (bol.shipper_name as string | null) ?? "";
    queryAddress = bol.shipper_address as string | null;
  } else if (side === "consignee") {
    queryName = (bol.consignee_name as string | null) ?? "";
    queryAddress = bol.consignee_address as string | null;
  } else {
    queryName = billToPartyName(bol.bill_to as string | null);
    queryAddress = null;
  }
  if (!queryName.trim()) return { ok: false, error: "No name was extracted for this party." };

  const candidates = await searchCompanyMatches(queryName, queryAddress);
  const confident = candidates.find((c) => c.tier === "exact" || c.tier === "likely");

  let accountId: string;
  if (confident) {
    const linkResult = await linkCompany(bolId, side, confident.row.id);
    if (!linkResult.ok) return linkResult;
    accountId = confident.row.id;
  } else {
    const fd = new FormData();
    fd.set("name", queryName);
    if (queryAddress) fd.set("address", queryAddress);
    fd.set("source", "bol");
    fd.set("lifecycle_status", "prospect");
    const createResult = await createAccount(fd);
    if (!createResult.ok) return createResult;
    const linkResult = await linkCompany(bolId, side, createResult.id);
    if (!linkResult.ok) return linkResult;
    accountId = createResult.id;
  }

  // linkCompany already promotes (subject to the guardrail) and auto-attaches
  // contacts — no separate addToProspects call needed here.
  return { ok: true, accountId };
}

/**
 * The reviewed-candidate path's "none of these — create new" fallback:
 * unlike resolveAndProspectCompany, this never re-runs the matcher (the human
 * already saw the candidate list and rejected it) and takes name/address from
 * an editable inline form instead of re-reading crm_bol_entries verbatim —
 * so a misparsed name can be fixed before the account is created. Deliberately
 * separate from updateExtractedFields: that action overwrites all 12 From-BOL
 * fields at once (built for a full-form submit) and would null out every
 * other field if called with just this row's two inputs.
 */
export async function createAndProspectCompany(bolId: string, side: CompanySide, formData: FormData): Promise<ResolveCompanyResult> {
  await requireAdminUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Company name is required." };
  const address = String(formData.get("address") ?? "").trim();

  const fd = new FormData();
  fd.set("name", name);
  if (address) fd.set("address", address);
  fd.set("source", "bol");
  fd.set("lifecycle_status", "prospect");
  const createResult = await createAccount(fd);
  if (!createResult.ok) return createResult;

  const linkResult = await linkCompany(bolId, side, createResult.id);
  if (!linkResult.ok) return linkResult;

  // linkCompany already promotes (subject to the guardrail) and auto-attaches
  // contacts — no separate addToProspects call needed here.
  return { ok: true, accountId: createResult.id };
}

/**
 * Real per-candidate context for the match-review list: how many shipments
 * this org already has on file for the account (crm_shipments.account_id),
 * and who currently owns it (crm_accounts.assigned_user_id -> crm_profiles).
 * Both are genuine columns already used elsewhere (listShipmentsForAccount,
 * the account profile's rep picker) — nothing here is estimated or faked.
 */
export type CandidateMeta = {
  accountId: string;
  priorLoadCount: number;
  currentOwnerName: string | null;
};

export async function getCandidateMeta(accountIds: string[]): Promise<CandidateMeta[]> {
  await requireAdminUser();
  if (accountIds.length === 0) return [];
  const supabase = await createCrmServerClient();

  const [{ data: accounts }, { data: shipments }] = await Promise.all([
    supabase.from("crm_accounts").select("id, assigned_user_id").in("id", accountIds),
    supabase.from("crm_shipments").select("account_id").in("account_id", accountIds).is("deleted_at", null),
  ]);

  const accountRows = (accounts ?? []) as { id: string; assigned_user_id: string | null }[];
  const ownerIds = Array.from(new Set(accountRows.map((a) => a.assigned_user_id).filter((id): id is string => Boolean(id))));

  const { data: profiles } = ownerIds.length
    ? await supabase.from("crm_profiles").select("id, full_name, email").in("id", ownerIds)
    : { data: [] as { id: string; full_name: string | null; email: string | null }[] };
  const nameById = new Map(
    ((profiles ?? []) as { id: string; full_name: string | null; email: string | null }[]).map((p) => [p.id, p.full_name || p.email || "Unnamed"]),
  );
  const ownerByAccount = new Map(accountRows.map((a) => [a.id, a.assigned_user_id]));

  const loadCountByAccount = new Map<string, number>();
  for (const s of (shipments ?? []) as { account_id: string | null }[]) {
    if (!s.account_id) continue;
    loadCountByAccount.set(s.account_id, (loadCountByAccount.get(s.account_id) ?? 0) + 1);
  }

  return accountIds.map((id) => {
    const ownerId = ownerByAccount.get(id) ?? null;
    return {
      accountId: id,
      priorLoadCount: loadCountByAccount.get(id) ?? 0,
      currentOwnerName: ownerId ? (nameById.get(ownerId) ?? null) : null,
    };
  });
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

export async function linkLocation(bolId: string, side: LocationSide, locationId: string): Promise<ActionResult> {
  await requireAdminUser();
  const supabase = await createCrmServerClient();
  const { error } = await supabase.from("crm_bol_entries").update({ [locationCol(side)]: locationId }).eq("id", bolId);
  if (error) return { ok: false, error: "Could not link the location." };
  revalidateBol(bolId);
  return { ok: true };
}

/** Creates a location via the existing createLocation() action (the same
 * one the Details tab's "Locations & docks" group uses), then links it. */
export async function createLocationFromBol(bolId: string, side: LocationSide, accountId: string, formData: FormData): Promise<ActionResult> {
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

/** Called automatically whenever a shipper/consignee company resolves
 * (link existing, update & link, or create new) — the BOL's address for
 * that side was previously left to sit unattached until someone separately
 * clicked through the Locations section. Never overrides a location that's
 * already set. Searches the resolved company's existing locations first
 * (same real matcher as searchLocationMatches) and links a confident match;
 * only creates a new crm_account_locations row (via the same
 * createLocationFromBol path a manual "Add New Location" click uses) when
 * nothing on file is a good match. */
async function autoResolveLocation(
  supabase: Awaited<ReturnType<typeof createCrmServerClient>>,
  bolId: string,
  side: LocationSide,
  accountId: string,
) {
  const locCol = locationCol(side);
  const addrCol = side === "shipper" ? "shipper_address" : "consignee_address";

  const { data: bol } = await supabase.from("crm_bol_entries").select(`${addrCol}, ${locCol}`).eq("id", bolId).maybeSingle();
  const bolRecord = bol as Record<string, unknown> | null;
  if (!bolRecord || bolRecord[locCol]) return; // already has a location — never override
  const bolAddress = (bolRecord[addrCol] as string | null)?.trim();
  if (!bolAddress) return;

  const { data: locations } = await supabase
    .from("crm_account_locations")
    .select("id, label, address, city, state, zip")
    .eq("account_id", accountId)
    .is("deleted_at", null)
    .limit(50);

  const ranked = rankByName((locations ?? []) as LocationCandidate[], bolAddress, (l) => l.address ?? "");
  const existingMatch = ranked.find((m) => m.tier === "exact" || m.tier === "likely");

  if (existingMatch) {
    await linkLocation(bolId, side, existingMatch.row.id);
    return;
  }

  const fd = new FormData();
  fd.set("address", bolAddress);
  await createLocationFromBol(bolId, side, accountId, fd);
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

async function accountIdForBolContact(
  supabase: Awaited<ReturnType<typeof createCrmServerClient>>,
  bolContactId: string,
): Promise<{ ok: true; bolId: string; accountId: string; name: string | null; phone: string | null; email: string | null } | { ok: false; error: string }> {
  const { data: bc } = await supabase.from("crm_bol_contacts").select("bol_id, role, name, phone, email").eq("id", bolContactId).maybeSingle();
  if (!bc) return { ok: false, error: "Contact record not found." };

  const { data: bol } = await supabase
    .from("crm_bol_entries")
    .select("matched_shipper_account_id, matched_consignee_account_id, matched_bill_to_account_id")
    .eq("id", bc.bol_id as string)
    .maybeSingle();
  if (!bol) return { ok: false, error: "BOL not found." };

  const accountIdByRole: Record<string, string | null> = {
    shipper: bol.matched_shipper_account_id as string | null,
    consignee: bol.matched_consignee_account_id as string | null,
    bill_to: bol.matched_bill_to_account_id as string | null,
    other: null,
  };
  const accountId = accountIdByRole[bc.role as string] ?? null;
  if (!accountId) {
    return { ok: false, error: "Resolve the company for this side of the BOL before creating a contact." };
  }
  return { ok: true, bolId: bc.bol_id as string, accountId, name: bc.name as string | null, phone: bc.phone as string | null, email: bc.email as string | null };
}

export type ResolveContactResult = { ok: true; contactId: string } | { ok: false; error: string };

/** The single-click "Add Contact" path — searches the resolved company's
 * existing contacts first (real dedup, same matcher as searchContactMatches)
 * and links a confident match instead of creating a duplicate; only creates
 * a new crm_contacts row, straight from the fields the BOL already gave us,
 * when nothing on file is a good match. Never orphaned — always requires a
 * resolved company for this contact's role first. */
export async function resolveBolContact(bolContactId: string): Promise<ResolveContactResult> {
  await requireAdminUser();
  const supabase = await createCrmServerClient();

  const resolved = await accountIdForBolContact(supabase, bolContactId);
  if (!resolved.ok) return resolved;
  if (!resolved.name?.trim()) return { ok: false, error: "No name was extracted for this contact." };

  const candidates = await searchContactMatches(resolved.accountId, resolved.name);
  const confident = candidates.find((c) => c.tier === "exact" || c.tier === "likely");

  if (confident) {
    const linkResult = await linkBolContact(bolContactId, confident.row.id);
    if (!linkResult.ok) return linkResult;
    return { ok: true, contactId: confident.row.id };
  }

  const fd = new FormData();
  fd.set("name", resolved.name);
  if (resolved.phone) fd.set("phones", JSON.stringify([{ label: "Main", number: resolved.phone }]));
  if (resolved.email) fd.set("email", resolved.email);

  const createResult = await createContact(resolved.accountId, fd);
  if (!createResult.ok) return createResult;

  const { data: created } = await supabase
    .from("crm_contacts")
    .select("id")
    .eq("account_id", resolved.accountId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!created) return { ok: false, error: "Contact saved, but couldn't be linked. Please link it manually." };

  const linkResult = await linkBolContact(bolContactId, created.id as string);
  if (!linkResult.ok) return linkResult;
  return { ok: true, contactId: created.id as string };
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

/**
 * Standalone promote — used by CompanyRow's resolved-state "Add to
 * Prospects" button and the sticky dock's bulk "Send to Prospects", both of
 * which only have an accountId on hand (the link already happened earlier,
 * possibly in a prior session before auto-attach existed). Also runs the
 * retroactive contact auto-attach for every BOL side this account is
 * currently linked to, so re-promoting an already-linked-but-stuck company
 * picks up any contacts that were never attached the first time around.
 */
export async function addToProspects(accountId: string): Promise<ActionResult> {
  const user = await requireAdminUser();
  const supabase = await createCrmServerClient();
  const result = await promoteToProspectWithGuardrail(supabase, user, accountId);
  if (!result.ok) return result;
  await autoAttachContactsForAccount(supabase, accountId);
  return { ok: true };
}

/**
 * The carrier printed on a BOL is not a sales target by default (it's who
 * moved the freight, not who might ship with us) — this is the explicit
 * override for the rare case it's worth prospecting anyway: same real
 * matcher + create-or-link + promote-with-guardrail pipeline as
 * resolveAndProspectCompany, persisted onto
 * crm_bol_entries.matched_carrier_account_id (2026-08-21 migration
 * 20260821020000) so "View Company" survives a refresh, same as the other
 * three sides. Idempotent — if this BOL's carrier was already overridden,
 * returns the existing linked account instead of creating a duplicate.
 */
export type ProspectCarrierResult = { ok: true; accountId: string } | { ok: false; error: string };

export async function prospectCarrier(bolId: string): Promise<ProspectCarrierResult> {
  const user = await requireAdminUser();
  const supabase = await createCrmServerClient();
  const { data: bol } = await supabase
    .from("crm_bol_entries")
    .select("carrier, matched_carrier_account_id")
    .eq("id", bolId)
    .maybeSingle();
  if (!bol) return { ok: false, error: "BOL not found." };
  if (bol.matched_carrier_account_id) return { ok: true, accountId: bol.matched_carrier_account_id as string };

  const carrierName = ((bol.carrier as string | null) ?? "").trim();
  if (!carrierName) return { ok: false, error: "No carrier was extracted for this BOL." };

  const candidates = await searchCompanyMatches(carrierName, null);
  const confident = candidates.find((c) => c.tier === "exact" || c.tier === "likely");

  let accountId: string;
  if (confident) {
    accountId = confident.row.id;
  } else {
    const fd = new FormData();
    fd.set("name", carrierName);
    fd.set("source", "bol");
    fd.set("lifecycle_status", "prospect");
    const createResult = await createAccount(fd);
    if (!createResult.ok) return createResult;
    accountId = createResult.id;
  }

  const { error } = await supabase.from("crm_bol_entries").update({ matched_carrier_account_id: accountId }).eq("id", bolId);
  if (error) return { ok: false, error: "Could not link the carrier account." };

  const promoteResult = await promoteToProspectWithGuardrail(supabase, user, accountId);
  if (!promoteResult.ok) return promoteResult;

  revalidateBol(bolId);
  return { ok: true, accountId };
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

  await propagateDocumentToResolvedCompanies(supabase, bolId);
  revalidateBol(bolId);
  return { ok: true };
}
