"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { logActivity, CRM_ACTIVITY } from "@/lib/crm/activity";
import { formatDate } from "../_shell/format";
import { getBrokerProfile } from "../_shell/brokerProfile";
import { renderCrmRateConfirmationPdfBuffer } from "@/lib/pdf/renderCrmRateConfirmationPdf";
import type { CrmRateConfirmationPdfData } from "@/lib/pdf/CrmRateConfirmationPDF";
import { storeDocumentVersion } from "./document-lifecycle";
import { mapRateConfirmationRow, mapRateConfirmationLineRow } from "./mappers";
import type {
  CrmCarrierRow,
  CrmRateConfirmationDetail,
  CrmRateConfirmationLineRow,
  CrmRateConfirmationRow,
  CrmShipmentRow,
  RateConfirmationFields,
  RateConfirmationLineInput,
} from "./types";

/** "city, state zip" — blank pieces drop out cleanly, matching the
 * cityStateZip() helper the fillable BOL/RC forms use. */
function cityStateZip(city: string | null, state: string | null, zip: string | null): string | null {
  const csz = [city, state].filter(Boolean).join(", ");
  const full = [csz, zip].filter(Boolean).join(" ").trim();
  return full || null;
}

/**
 * Rate Confirmation = a document GENERATED FROM a shipment, snapshotting the
 * shipment + assigned carrier at that moment (doc_snapshot jsonb) so later
 * edits to the shipment/carrier never retroactively change an already-created
 * RC. total_carrier_pay is NEVER trusted from a caller — it's always the
 * server-side SUM of crm_rate_confirmation_lines.amount, recomputed after
 * every line change (recomputeTotal below). No PDF/send/lifecycle here yet —
 * status is a plain field for now; that phase comes later.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

function revalidateRc(rcId?: string, shipmentId?: string, accountId?: string | null) {
  revalidatePath("/crm/shipments");
  if (shipmentId) revalidatePath(`/crm/shipments/${shipmentId}`);
  if (rcId) revalidatePath(`/crm/shipments/rate-confirmations/${rcId}`);
  if (accountId) revalidatePath(`/crm/accounts/${accountId}`);
}

function rcFieldsToRow(fields: Partial<RateConfirmationFields>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  const set = (key: keyof RateConfirmationFields, column: string) => {
    if (key in fields) row[column] = fields[key];
  };
  set("status", "status");
  set("carrierId", "carrier_id");
  set("carrierName", "carrier_name");
  set("carrierMc", "carrier_mc");
  set("carrierDot", "carrier_dot");
  set("carrierContact", "carrier_contact");
  set("carrierPhone", "carrier_phone");
  set("carrierEmail", "carrier_email");
  set("paymentTerms", "payment_terms");
  set("quickPay", "quick_pay");
  set("notes", "notes");
  return row;
}

/** SUM(lines.amount) -> total_carrier_pay. The one place this column is ever
 * written — callers pass a total, this recomputes and overwrites it. */
async function recomputeTotal(supabase: SupabaseClient, rateConfirmationId: string): Promise<number> {
  const { data } = await supabase
    .from("crm_rate_confirmation_lines")
    .select("amount")
    .eq("rate_confirmation_id", rateConfirmationId);

  const total = ((data ?? []) as { amount: number }[]).reduce(
    (sum, line) => sum + Number(line.amount || 0),
    0,
  );

  await supabase
    .from("crm_rate_confirmations")
    .update({ total_carrier_pay: total })
    .eq("id", rateConfirmationId);

  return total;
}

async function loadDetail(
  supabase: SupabaseClient,
  rcId: string,
): Promise<CrmRateConfirmationDetail | null> {
  const [{ data: rcRow }, { data: lineRows }] = await Promise.all([
    supabase.from("crm_rate_confirmations").select("*").eq("id", rcId).is("deleted_at", null).maybeSingle(),
    supabase
      .from("crm_rate_confirmation_lines")
      .select("*")
      .eq("rate_confirmation_id", rcId)
      .order("sort_order", { ascending: true }),
  ]);
  if (!rcRow) return null;

  return {
    ...mapRateConfirmationRow(rcRow as CrmRateConfirmationRow),
    lines: ((lineRows ?? []) as CrmRateConfirmationLineRow[]).map(mapRateConfirmationLineRow),
  };
}

export type CreateRcResult =
  | { ok: true; id: string; rateConfirmation: CrmRateConfirmationDetail }
  | { ok: false; error: string };

/** Single-record read for the RC editor — fields + lines in one call. */
export async function getRateConfirmation(id: string): Promise<CrmRateConfirmationDetail | null> {
  await requireCrmUser();
  const supabase = await createCrmServerClient();
  return loadDetail(supabase, id);
}

/**
 * Create a draft RC from a shipment. Snapshots the shipment row + the
 * assigned carrier row (if any) into doc_snapshot, mirrors the carrier onto
 * the RC's own carrier_* columns (so it reads/edits independently of the
 * shipment from here on), and seeds one "Linehaul" line from the shipment's
 * carrier_rate (0 if unset). rc_number is DB-assigned; status defaults to
 * 'draft'.
 */
export async function createRateConfirmationFromShipment(shipmentId: string): Promise<CreateRcResult> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { data: shipmentData } = await supabase
    .from("crm_shipments")
    .select("*")
    .eq("id", shipmentId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!shipmentData) return { ok: false, error: "Shipment not found." };
  const shipmentRow = shipmentData as CrmShipmentRow;

  let carrierRow: CrmCarrierRow | null = null;
  if (shipmentRow.carrier_id) {
    const { data } = await supabase
      .from("crm_carriers")
      .select("*")
      .eq("id", shipmentRow.carrier_id)
      .maybeSingle();
    carrierRow = (data as CrmCarrierRow) ?? null;
  }

  const { data: rcData, error } = await supabase
    .from("crm_rate_confirmations")
    .insert({
      org_id: user.orgId,
      shipment_id: shipmentId,
      created_by: user.id,
      carrier_id: shipmentRow.carrier_id,
      carrier_name: carrierRow?.name ?? null,
      carrier_mc: carrierRow?.mc_number ?? null,
      carrier_dot: carrierRow?.dot_number ?? null,
      carrier_phone: carrierRow?.phone ?? null,
      carrier_email: carrierRow?.email ?? null,
      doc_snapshot: { shipment: shipmentRow, carrier: carrierRow },
      total_carrier_pay: 0,
    })
    .select("*")
    .single();

  if (error || !rcData) {
    return { ok: false, error: "Could not create the rate confirmation. Please try again." };
  }
  const rcRow = rcData as CrmRateConfirmationRow;

  const { error: lineError } = await supabase.from("crm_rate_confirmation_lines").insert({
    org_id: user.orgId,
    rate_confirmation_id: rcRow.id,
    label: "Linehaul",
    amount: shipmentRow.carrier_rate ?? 0,
    sort_order: 0,
  });
  if (lineError) {
    return { ok: false, error: "Rate confirmation created, but could not seed the linehaul line." };
  }
  await recomputeTotal(supabase, rcRow.id);

  if (shipmentRow.account_id) {
    await logActivity(supabase, {
      orgId: user.orgId,
      userId: user.id,
      accountId: shipmentRow.account_id,
      kind: CRM_ACTIVITY.rateConfirmationCreated,
      summary: `Rate confirmation created: ${rcRow.rc_number}`,
    });
  }

  const detail = await loadDetail(supabase, rcRow.id);
  revalidateRc(rcRow.id, shipmentId, shipmentRow.account_id);
  return { ok: true, id: rcRow.id, rateConfirmation: detail! };
}

/**
 * Update an RC's fields and/or fully replace its lines in one call. When
 * `lines` is provided, every existing line is deleted and replaced (simplest
 * correct semantics for a form that edits the whole line list at once — use
 * add/update/removeRateConfirmationLine below for single-row edits instead).
 * total_carrier_pay is always recomputed at the end regardless of whether
 * lines changed, so it can never drift from the DB's own SUM.
 */
export async function updateRateConfirmation(
  id: string,
  fields: Partial<RateConfirmationFields>,
  lines?: RateConfirmationLineInput[],
): Promise<ActionResult> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { data: prior } = await supabase
    .from("crm_rate_confirmations")
    .select("shipment_id, org_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!prior) return { ok: false, error: "Rate confirmation not found." };

  const row = rcFieldsToRow(fields);
  if (Object.keys(row).length > 0) {
    const { error } = await supabase.from("crm_rate_confirmations").update(row).eq("id", id);
    if (error) return { ok: false, error: "Could not update the rate confirmation. Please try again." };
  }

  if (lines) {
    await supabase.from("crm_rate_confirmation_lines").delete().eq("rate_confirmation_id", id);
    if (lines.length) {
      const { error: lineError } = await supabase.from("crm_rate_confirmation_lines").insert(
        lines.map((line, i) => ({
          org_id: user.orgId,
          rate_confirmation_id: id,
          label: line.label,
          amount: line.amount,
          sort_order: line.sortOrder ?? i,
        })),
      );
      if (lineError) return { ok: false, error: "Could not save the line items. Please try again." };
    }
  }

  await recomputeTotal(supabase, id);
  revalidateRc(id, prior.shipment_id as string);
  return { ok: true };
}

/** Alias for the common "save the draft as-is" call shape — identical to
 * updateRateConfirmation, kept as its own name so a draft-autosave call site
 * reads as intent rather than a generic update. */
export async function saveRateConfirmationDraft(
  id: string,
  fields: Partial<RateConfirmationFields>,
  lines?: RateConfirmationLineInput[],
): Promise<ActionResult> {
  return updateRateConfirmation(id, fields, lines);
}

export async function addRateConfirmationLine(
  rateConfirmationId: string,
  line: RateConfirmationLineInput,
): Promise<ActionResult> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { error } = await supabase.from("crm_rate_confirmation_lines").insert({
    org_id: user.orgId,
    rate_confirmation_id: rateConfirmationId,
    label: line.label,
    amount: line.amount,
    sort_order: line.sortOrder ?? 0,
  });
  if (error) return { ok: false, error: "Could not add the line. Please try again." };

  await recomputeTotal(supabase, rateConfirmationId);
  revalidateRc(rateConfirmationId);
  return { ok: true };
}

export async function updateRateConfirmationLine(
  lineId: string,
  rateConfirmationId: string,
  fields: Partial<RateConfirmationLineInput>,
): Promise<ActionResult> {
  await requireCrmUser();
  const supabase = await createCrmServerClient();

  const row: Record<string, unknown> = {};
  if ("label" in fields) row.label = fields.label;
  if ("amount" in fields) row.amount = fields.amount;
  if ("sortOrder" in fields) row.sort_order = fields.sortOrder;

  const { error } = await supabase.from("crm_rate_confirmation_lines").update(row).eq("id", lineId);
  if (error) return { ok: false, error: "Could not update the line. Please try again." };

  await recomputeTotal(supabase, rateConfirmationId);
  revalidateRc(rateConfirmationId);
  return { ok: true };
}

export async function removeRateConfirmationLine(
  lineId: string,
  rateConfirmationId: string,
): Promise<ActionResult> {
  await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { error } = await supabase.from("crm_rate_confirmation_lines").delete().eq("id", lineId);
  if (error) return { ok: false, error: "Could not remove the line. Please try again." };

  await recomputeTotal(supabase, rateConfirmationId);
  revalidateRc(rateConfirmationId);
  return { ok: true };
}

/** Create a fresh, independent RC (new rc_number, version 1, status 'draft')
 * copying another RC's carrier fields, doc_snapshot, and lines. Not a
 * supersede/version-bump — that belongs to the later lifecycle/PDF phase. */
export async function duplicateRateConfirmation(id: string): Promise<CreateRcResult> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const source = await loadDetail(supabase, id);
  if (!source) return { ok: false, error: "Rate confirmation not found." };

  const { data: rcData, error } = await supabase
    .from("crm_rate_confirmations")
    .insert({
      org_id: user.orgId,
      shipment_id: source.shipmentId,
      created_by: user.id,
      carrier_id: source.carrierId,
      carrier_name: source.carrierName,
      carrier_mc: source.carrierMc,
      carrier_dot: source.carrierDot,
      carrier_contact: source.carrierContact,
      carrier_phone: source.carrierPhone,
      carrier_email: source.carrierEmail,
      payment_terms: source.paymentTerms,
      quick_pay: source.quickPay,
      notes: source.notes,
      doc_snapshot: source.docSnapshot,
      total_carrier_pay: 0,
    })
    .select("*")
    .single();
  if (error || !rcData) return { ok: false, error: "Could not duplicate the rate confirmation." };
  const rcRow = rcData as CrmRateConfirmationRow;

  if (source.lines.length) {
    await supabase.from("crm_rate_confirmation_lines").insert(
      source.lines.map((line) => ({
        org_id: user.orgId,
        rate_confirmation_id: rcRow.id,
        label: line.label,
        amount: line.amount,
        sort_order: line.sortOrder,
      })),
    );
  }
  await recomputeTotal(supabase, rcRow.id);

  const detail = await loadDetail(supabase, rcRow.id);
  revalidateRc(rcRow.id, source.shipmentId);
  return { ok: true, id: rcRow.id, rateConfirmation: detail! };
}

/** Soft-delete an RC. Any org member may delete (operational record). */
export async function softDeleteRateConfirmation(id: string): Promise<ActionResult> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { data: prior } = await supabase
    .from("crm_rate_confirmations")
    .select("rc_number, shipment_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!prior) return { ok: false, error: "Rate confirmation not found." };

  const { error } = await supabase
    .from("crm_rate_confirmations")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: "Could not delete the rate confirmation." };

  const { data: shipment } = await supabase
    .from("crm_shipments")
    .select("account_id")
    .eq("id", prior.shipment_id as string)
    .maybeSingle();

  if (shipment?.account_id) {
    await logActivity(supabase, {
      orgId: user.orgId,
      userId: user.id,
      accountId: shipment.account_id as string,
      kind: CRM_ACTIVITY.rateConfirmationDeleted,
      summary: `Rate confirmation deleted: ${prior.rc_number as string}`,
    });
  }

  revalidateRc(id, prior.shipment_id as string, (shipment?.account_id as string | null) ?? null);
  return { ok: true };
}

// ── PDF generation & lifecycle ──────────────────────────────────────────────

export type GenerateDocResult =
  | { ok: true; pdfDocumentId: string; pdfStoragePath: string; version: number }
  | { ok: false; error: string };

/**
 * Render this RC's current fields + lines into a PDF and store it as a new,
 * immutable version — never overwrites a previously generated file. Builds
 * the doc_snapshot fresh from the shipment + broker profile + RC + lines
 * RIGHT NOW (not whatever was snapshotted at draft-creation time), so a
 * generated PDF always reflects the RC as it stood the moment it was
 * generated, even if the shipment or carrier changes later. The first
 * generate call produces version 1 (the column's create-time default); every
 * call after that increments it.
 */
export async function generateRateConfirmation(rcId: string): Promise<GenerateDocResult> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const detail = await loadDetail(supabase, rcId);
  if (!detail) return { ok: false, error: "Rate confirmation not found." };

  const { data: shipmentData } = await supabase
    .from("crm_shipments")
    .select("*")
    .eq("id", detail.shipmentId)
    .maybeSingle();
  if (!shipmentData) return { ok: false, error: "Shipment not found." };
  const shipmentRow = shipmentData as CrmShipmentRow;

  const broker = await getBrokerProfile();

  const pdfData: CrmRateConfirmationPdfData = {
    rcNumber: detail.rcNumber,
    issuedDate: formatDate(new Date().toISOString()),
    broker,
    shipment: {
      shipmentNumber: shipmentRow.shipment_number,
      equipment: shipmentRow.equipment,
      commodity: shipmentRow.commodity,
      weight: shipmentRow.weight,
      pieces: shipmentRow.pieces,
      poNumber: shipmentRow.po_number,
      refNumbers: shipmentRow.ref_numbers,
    },
    pickup: {
      name: shipmentRow.shipper_name,
      address: shipmentRow.shipper_address,
      cityStateZip: cityStateZip(shipmentRow.shipper_city, shipmentRow.shipper_state, shipmentRow.shipper_zip),
      contact: shipmentRow.shipper_contact,
      phone: shipmentRow.shipper_phone,
      window: shipmentRow.pickup_window,
      number: shipmentRow.pickup_number,
      notes: shipmentRow.pickup_notes,
    },
    delivery: {
      name: shipmentRow.consignee_name,
      address: shipmentRow.consignee_address,
      cityStateZip: cityStateZip(
        shipmentRow.consignee_city,
        shipmentRow.consignee_state,
        shipmentRow.consignee_zip,
      ),
      contact: shipmentRow.consignee_contact,
      phone: shipmentRow.consignee_phone,
      window: shipmentRow.delivery_window,
      number: shipmentRow.delivery_number,
      notes: shipmentRow.delivery_notes,
    },
    carrier: {
      name: detail.carrierName,
      mc: detail.carrierMc,
      dot: detail.carrierDot,
      contact: detail.carrierContact,
      phone: detail.carrierPhone,
      email: detail.carrierEmail,
    },
    specialInstructions: shipmentRow.special_instructions,
    lines: detail.lines.map((l) => ({ label: l.label, amount: l.amount })),
    totalCarrierPay: detail.totalCarrierPay,
    paymentTerms: detail.paymentTerms,
    quickPay: detail.quickPay,
    notes: detail.notes,
  };

  let buffer: Buffer;
  try {
    buffer = await renderCrmRateConfirmationPdfBuffer(pdfData);
  } catch {
    return { ok: false, error: "Could not generate the PDF. Please try again." };
  }

  const nextVersion = detail.pdfDocumentId ? detail.version + 1 : detail.version;
  const fileName = `${detail.rcNumber} v${nextVersion}.pdf`;

  const stored = await storeDocumentVersion(supabase, {
    orgId: user.orgId,
    userId: user.id,
    docType: "rate_confirmation",
    docId: rcId,
    shipmentId: detail.shipmentId,
    kind: "rate_con",
    fileName,
    storagePathPrefix: `${user.orgId}/rate-con/${detail.shipmentId}`,
    bytes: buffer,
    snapshot: { broker, shipment: shipmentRow, rc: pdfData },
    version: nextVersion,
    rateConfirmationId: rcId,
  });
  if (!stored.ok) return stored;

  const { error: updateError } = await supabase
    .from("crm_rate_confirmations")
    .update({
      pdf_document_id: stored.documentId,
      pdf_storage_path: stored.storagePath,
      version: nextVersion,
      status: "generated",
      doc_snapshot: { broker, shipment: shipmentRow, rc: pdfData },
    })
    .eq("id", rcId);
  if (updateError) {
    return { ok: false, error: "PDF generated, but could not update the rate confirmation record." };
  }

  if (shipmentRow.account_id) {
    await logActivity(supabase, {
      orgId: user.orgId,
      userId: user.id,
      accountId: shipmentRow.account_id,
      kind: CRM_ACTIVITY.rateConfirmationGenerated,
      summary: `Rate confirmation generated: ${detail.rcNumber} (v${nextVersion})`,
    });
  }

  revalidateRc(rcId, detail.shipmentId, shipmentRow.account_id);
  return { ok: true, pdfDocumentId: stored.documentId, pdfStoragePath: stored.storagePath, version: nextVersion };
}

async function loadRcForLifecycle(
  supabase: SupabaseClient,
  id: string,
): Promise<{ rcNumber: string; shipmentId: string; status: string; accountId: string | null } | null> {
  const { data: rc } = await supabase
    .from("crm_rate_confirmations")
    .select("rc_number, shipment_id, status")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!rc) return null;

  const { data: shipment } = await supabase
    .from("crm_shipments")
    .select("account_id")
    .eq("id", rc.shipment_id as string)
    .maybeSingle();

  return {
    rcNumber: rc.rc_number as string,
    shipmentId: rc.shipment_id as string,
    status: rc.status as string,
    accountId: (shipment?.account_id as string | null) ?? null,
  };
}

/**
 * Mark an RC as sent to the carrier. No real carrier-facing email exists in
 * this codebase yet (the CRM has no outbound send pipeline — src/lib/email
 * is entirely dispatch/admin-side) — this only records the state transition.
 * TODO: wire an actual email/SMS send once the CRM gets one.
 */
export async function sendRateConfirmation(id: string): Promise<ActionResult> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const prior = await loadRcForLifecycle(supabase, id);
  if (!prior) return { ok: false, error: "Rate confirmation not found." };

  const { error } = await supabase
    .from("crm_rate_confirmations")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: "Could not mark the rate confirmation as sent." };

  if (prior.accountId) {
    await logActivity(supabase, {
      orgId: user.orgId,
      userId: user.id,
      accountId: prior.accountId,
      kind: CRM_ACTIVITY.rateConfirmationSent,
      summary: `Rate confirmation sent: ${prior.rcNumber}`,
    });
  }

  revalidateRc(id, prior.shipmentId, prior.accountId);
  return { ok: true };
}

export async function markRateConfirmationAccepted(id: string): Promise<ActionResult> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const prior = await loadRcForLifecycle(supabase, id);
  if (!prior) return { ok: false, error: "Rate confirmation not found." };

  const { error } = await supabase
    .from("crm_rate_confirmations")
    .update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: "Could not mark the rate confirmation as accepted." };

  if (prior.accountId) {
    await logActivity(supabase, {
      orgId: user.orgId,
      userId: user.id,
      accountId: prior.accountId,
      kind: CRM_ACTIVITY.rateConfirmationAccepted,
      summary: `Rate confirmation accepted: ${prior.rcNumber}`,
    });
  }

  revalidateRc(id, prior.shipmentId, prior.accountId);
  return { ok: true };
}

export async function markRateConfirmationCompleted(id: string): Promise<ActionResult> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const prior = await loadRcForLifecycle(supabase, id);
  if (!prior) return { ok: false, error: "Rate confirmation not found." };

  const { error } = await supabase
    .from("crm_rate_confirmations")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: "Could not mark the rate confirmation as completed." };

  if (prior.accountId) {
    await logActivity(supabase, {
      orgId: user.orgId,
      userId: user.id,
      accountId: prior.accountId,
      kind: CRM_ACTIVITY.rateConfirmationCompleted,
      summary: `Rate confirmation completed: ${prior.rcNumber}`,
    });
  }

  revalidateRc(id, prior.shipmentId, prior.accountId);
  return { ok: true };
}

export async function cancelRateConfirmation(id: string): Promise<ActionResult> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const prior = await loadRcForLifecycle(supabase, id);
  if (!prior) return { ok: false, error: "Rate confirmation not found." };

  const { error } = await supabase.from("crm_rate_confirmations").update({ status: "cancelled" }).eq("id", id);
  if (error) return { ok: false, error: "Could not cancel the rate confirmation." };

  if (prior.accountId) {
    await logActivity(supabase, {
      orgId: user.orgId,
      userId: user.id,
      accountId: prior.accountId,
      kind: CRM_ACTIVITY.rateConfirmationCancelled,
      summary: `Rate confirmation cancelled: ${prior.rcNumber}`,
    });
  }

  revalidateRc(id, prior.shipmentId, prior.accountId);
  return { ok: true };
}

/**
 * Create a fresh draft copy of an RC (new rc_number, version 1, status
 * 'draft' — same mechanics as duplicateRateConfirmation) and mark the
 * original as superseded by it. The original row, its PDF, and every past
 * crm_document_versions row it produced are left completely intact — this
 * is a forward pointer, not a delete or overwrite.
 */
export async function supersedeRateConfirmation(id: string): Promise<CreateRcResult> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const copy = await duplicateRateConfirmation(id);
  if (!copy.ok) return copy;

  const { error } = await supabase
    .from("crm_rate_confirmations")
    .update({ superseded_by: copy.id })
    .eq("id", id);
  if (error) return { ok: false, error: "New rate confirmation created, but could not link it as a replacement." };

  const prior = await loadRcForLifecycle(supabase, id);
  if (prior?.accountId) {
    await logActivity(supabase, {
      orgId: user.orgId,
      userId: user.id,
      accountId: prior.accountId,
      kind: CRM_ACTIVITY.rateConfirmationSuperseded,
      summary: `Rate confirmation superseded: ${prior.rcNumber} → ${copy.rateConfirmation.rcNumber}`,
    });
  }

  revalidateRc(id, copy.rateConfirmation.shipmentId);
  return copy;
}
