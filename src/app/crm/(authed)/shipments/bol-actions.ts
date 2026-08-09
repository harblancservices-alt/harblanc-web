"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { logActivity, CRM_ACTIVITY } from "@/lib/crm/activity";
import { formatDate } from "../_shell/format";
import { getBrokerProfile } from "../_shell/brokerProfile";
import { renderCrmShipmentBolPdfBuffer } from "@/lib/pdf/renderCrmShipmentBolPdf";
import type { CrmShipmentBolPdfData } from "@/lib/pdf/CrmShipmentBolPDF";
import { storeDocumentVersion } from "./document-lifecycle";
import { mapBolRow, mapBolLineItemRow } from "./mappers";
import type {
  BolFields,
  BolLineItemInput,
  CrmBillOfLadingDetail,
  CrmBillOfLadingRow,
  CrmBolLineItemRow,
  CrmCarrierRow,
  CrmShipmentRow,
} from "./types";

/** "city, state zip" — blank pieces drop out cleanly, matching the
 * cityStateZip() helper the fillable BOL/RC forms use. */
function cityStateZip(city: string | null, state: string | null, zip: string | null): string | null {
  const csz = [city, state].filter(Boolean).join(", ");
  const full = [csz, zip].filter(Boolean).join(" ").trim();
  return full || null;
}

/**
 * Bill of Lading = a document GENERATED FROM a shipment, same shape/contract
 * as rate-confirmation-actions.ts (this is the sibling module — see that
 * file's header for the shared reasoning on snapshotting and the write
 * contract). Unlike the RC, crm_bills_of_lading has no carrier_* scalar
 * columns of its own — the carrier only ever appears inside doc_snapshot.
 * This is a NEW, separate table/flow from the account-profile "upload or
 * generate a quick BOL" feature in accounts/[id]/bol-actions.ts — that one
 * writes a crm_documents row directly; this one is the shipment-parented
 * structured BOL the later PDF/lifecycle phase will render from.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

function revalidateBol(bolId?: string, shipmentId?: string, accountId?: string | null) {
  revalidatePath("/crm/shipments");
  if (shipmentId) revalidatePath(`/crm/shipments/${shipmentId}`);
  if (bolId) revalidatePath(`/crm/shipments/bills-of-lading/${bolId}`);
  if (accountId) revalidatePath(`/crm/accounts/${accountId}`);
}

function bolFieldsToRow(fields: Partial<BolFields>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  const set = (key: keyof BolFields, column: string) => {
    if (key in fields) row[column] = fields[key];
  };
  set("status", "status");
  set("freightChargeTerms", "freight_charge_terms");
  set("codAmount", "cod_amount");
  set("declaredValue", "declared_value");
  return row;
}

async function loadDetail(
  supabase: SupabaseClient,
  bolId: string,
): Promise<CrmBillOfLadingDetail | null> {
  const [{ data: bolRow }, { data: lineRows }] = await Promise.all([
    supabase.from("crm_bills_of_lading").select("*").eq("id", bolId).is("deleted_at", null).maybeSingle(),
    supabase
      .from("crm_bol_line_items")
      .select("*")
      .eq("bol_id", bolId)
      .order("sort_order", { ascending: true }),
  ]);
  if (!bolRow) return null;

  return {
    ...mapBolRow(bolRow as CrmBillOfLadingRow),
    lineItems: ((lineRows ?? []) as CrmBolLineItemRow[]).map(mapBolLineItemRow),
  };
}

export type CreateBolResult =
  | { ok: true; id: string; bol: CrmBillOfLadingDetail }
  | { ok: false; error: string };

/**
 * Create a draft BOL from a shipment. Snapshots the shipment (shipper/
 * consignee/pickup/delivery) + assigned carrier (if any) into doc_snapshot,
 * and seeds one line item from the shipment's commodity/weight/pieces.
 * bol_number is DB-assigned; status defaults to 'draft'.
 */
export async function createBolFromShipment(shipmentId: string): Promise<CreateBolResult> {
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

  const { data: bolData, error } = await supabase
    .from("crm_bills_of_lading")
    .insert({
      org_id: user.orgId,
      shipment_id: shipmentId,
      created_by: user.id,
      doc_snapshot: { shipment: shipmentRow, carrier: carrierRow },
    })
    .select("*")
    .single();

  if (error || !bolData) {
    return { ok: false, error: "Could not create the bill of lading. Please try again." };
  }
  const bolRow = bolData as CrmBillOfLadingRow;

  const { error: lineError } = await supabase.from("crm_bol_line_items").insert({
    org_id: user.orgId,
    bol_id: bolRow.id,
    qty: shipmentRow.pieces,
    unit_type: null,
    description: shipmentRow.commodity,
    weight: shipmentRow.weight,
    nmfc: null,
    freight_class: null,
    hazmat: false,
    sort_order: 0,
  });
  if (lineError) {
    return { ok: false, error: "Bill of lading created, but could not seed the line item." };
  }

  if (shipmentRow.account_id) {
    await logActivity(supabase, {
      orgId: user.orgId,
      userId: user.id,
      accountId: shipmentRow.account_id,
      kind: CRM_ACTIVITY.bolCreated,
      summary: `Bill of lading created: ${bolRow.bol_number}`,
    });
  }

  const detail = await loadDetail(supabase, bolRow.id);
  revalidateBol(bolRow.id, shipmentId, shipmentRow.account_id);
  return { ok: true, id: bolRow.id, bol: detail! };
}

/**
 * Update a BOL's fields and/or fully replace its line items in one call.
 * When `lineItems` is provided, every existing line is deleted and replaced
 * (use add/removeBolLineItem below for single-row edits instead).
 */
export async function updateBol(
  id: string,
  fields: Partial<BolFields>,
  lineItems?: BolLineItemInput[],
): Promise<ActionResult> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { data: prior } = await supabase
    .from("crm_bills_of_lading")
    .select("shipment_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!prior) return { ok: false, error: "Bill of lading not found." };

  const row = bolFieldsToRow(fields);
  if (Object.keys(row).length > 0) {
    const { error } = await supabase.from("crm_bills_of_lading").update(row).eq("id", id);
    if (error) return { ok: false, error: "Could not update the bill of lading. Please try again." };
  }

  if (lineItems) {
    await supabase.from("crm_bol_line_items").delete().eq("bol_id", id);
    if (lineItems.length) {
      const { error: lineError } = await supabase.from("crm_bol_line_items").insert(
        lineItems.map((item, i) => ({
          org_id: user.orgId,
          bol_id: id,
          qty: item.qty,
          unit_type: item.unitType,
          description: item.description,
          weight: item.weight,
          nmfc: item.nmfc,
          freight_class: item.freightClass,
          hazmat: item.hazmat,
          sort_order: item.sortOrder ?? i,
        })),
      );
      if (lineError) return { ok: false, error: "Could not save the line items. Please try again." };
    }
  }

  revalidateBol(id, prior.shipment_id as string);
  return { ok: true };
}

/** Alias for the common "save the draft as-is" call shape — identical to
 * updateBol, kept as its own name so a draft-autosave call site reads as
 * intent rather than a generic update. */
export async function saveBolDraft(
  id: string,
  fields: Partial<BolFields>,
  lineItems?: BolLineItemInput[],
): Promise<ActionResult> {
  return updateBol(id, fields, lineItems);
}

export async function addBolLineItem(
  bolId: string,
  item: BolLineItemInput,
): Promise<ActionResult> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { error } = await supabase.from("crm_bol_line_items").insert({
    org_id: user.orgId,
    bol_id: bolId,
    qty: item.qty,
    unit_type: item.unitType,
    description: item.description,
    weight: item.weight,
    nmfc: item.nmfc,
    freight_class: item.freightClass,
    hazmat: item.hazmat,
    sort_order: item.sortOrder ?? 0,
  });
  if (error) return { ok: false, error: "Could not add the line item. Please try again." };

  revalidateBol(bolId);
  return { ok: true };
}

export async function removeBolLineItem(lineItemId: string, bolId: string): Promise<ActionResult> {
  await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { error } = await supabase.from("crm_bol_line_items").delete().eq("id", lineItemId);
  if (error) return { ok: false, error: "Could not remove the line item. Please try again." };

  revalidateBol(bolId);
  return { ok: true };
}

/** Create a fresh, independent BOL (new bol_number, version 1, status
 * 'draft') copying another BOL's fields, doc_snapshot, and line items. Not a
 * supersede/version-bump — that belongs to the later lifecycle/PDF phase. */
export async function duplicateBol(id: string): Promise<CreateBolResult> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const source = await loadDetail(supabase, id);
  if (!source) return { ok: false, error: "Bill of lading not found." };

  const { data: bolData, error } = await supabase
    .from("crm_bills_of_lading")
    .insert({
      org_id: user.orgId,
      shipment_id: source.shipmentId,
      created_by: user.id,
      freight_charge_terms: source.freightChargeTerms,
      cod_amount: source.codAmount,
      declared_value: source.declaredValue,
      doc_snapshot: source.docSnapshot,
    })
    .select("*")
    .single();
  if (error || !bolData) return { ok: false, error: "Could not duplicate the bill of lading." };
  const bolRow = bolData as CrmBillOfLadingRow;

  if (source.lineItems.length) {
    await supabase.from("crm_bol_line_items").insert(
      source.lineItems.map((item) => ({
        org_id: user.orgId,
        bol_id: bolRow.id,
        qty: item.qty,
        unit_type: item.unitType,
        description: item.description,
        weight: item.weight,
        nmfc: item.nmfc,
        freight_class: item.freightClass,
        hazmat: item.hazmat,
        sort_order: item.sortOrder,
      })),
    );
  }

  const detail = await loadDetail(supabase, bolRow.id);
  revalidateBol(bolRow.id, source.shipmentId);
  return { ok: true, id: bolRow.id, bol: detail! };
}

/** Soft-delete a BOL. Any org member may delete (operational record). */
export async function softDeleteBol(id: string): Promise<ActionResult> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { data: prior } = await supabase
    .from("crm_bills_of_lading")
    .select("bol_number, shipment_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!prior) return { ok: false, error: "Bill of lading not found." };

  const { error } = await supabase
    .from("crm_bills_of_lading")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: "Could not delete the bill of lading." };

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
      kind: CRM_ACTIVITY.bolDeleted,
      summary: `Bill of lading deleted: ${prior.bol_number as string}`,
    });
  }

  revalidateBol(id, prior.shipment_id as string, (shipment?.account_id as string | null) ?? null);
  return { ok: true };
}

// ── PDF generation & lifecycle ──────────────────────────────────────────────

export type GenerateDocResult =
  | { ok: true; pdfDocumentId: string; pdfStoragePath: string; version: number }
  | { ok: false; error: string };

/**
 * Render this BOL's current fields + line items into a PDF and store it as
 * a new, immutable version — never overwrites a previously generated file.
 * Same "build doc_snapshot fresh, right now" contract as
 * rate-confirmation-actions.ts::generateRateConfirmation — see that
 * function's header for the full reasoning.
 */
export async function generateBol(bolId: string): Promise<GenerateDocResult> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const detail = await loadDetail(supabase, bolId);
  if (!detail) return { ok: false, error: "Bill of lading not found." };

  const { data: shipmentData } = await supabase
    .from("crm_shipments")
    .select("*")
    .eq("id", detail.shipmentId)
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

  const broker = await getBrokerProfile();

  const pdfData: CrmShipmentBolPdfData = {
    bolNumber: detail.bolNumber,
    date: formatDate(new Date().toISOString()),
    loadRef: shipmentRow.external_load_ref,
    broker,
    shipper: {
      name: shipmentRow.shipper_name,
      address: shipmentRow.shipper_address,
      cityStateZip: cityStateZip(shipmentRow.shipper_city, shipmentRow.shipper_state, shipmentRow.shipper_zip),
      refNumber: shipmentRow.pickup_number,
      contact: shipmentRow.shipper_contact,
      phone: shipmentRow.shipper_phone,
    },
    consignee: {
      name: shipmentRow.consignee_name,
      address: shipmentRow.consignee_address,
      cityStateZip: cityStateZip(
        shipmentRow.consignee_city,
        shipmentRow.consignee_state,
        shipmentRow.consignee_zip,
      ),
      refNumber: shipmentRow.delivery_number,
      contact: shipmentRow.consignee_contact,
      phone: shipmentRow.consignee_phone,
    },
    carrier: {
      name: carrierRow?.name ?? null,
      trailerNumber: null,
      sealNumber: null,
      scac: null,
      proNumber: null,
    },
    freightChargeTerms: detail.freightChargeTerms,
    specialInstructions: shipmentRow.special_instructions,
    lineItems: detail.lineItems.map((li) => ({
      qty: li.qty,
      unitType: li.unitType,
      description: li.description,
      weight: li.weight,
      freightClass: li.freightClass,
      hazmat: li.hazmat,
    })),
    codAmount: detail.codAmount,
    declaredValue: detail.declaredValue,
  };

  let buffer: Buffer;
  try {
    buffer = await renderCrmShipmentBolPdfBuffer(pdfData);
  } catch {
    return { ok: false, error: "Could not generate the PDF. Please try again." };
  }

  const nextVersion = detail.pdfDocumentId ? detail.version + 1 : detail.version;
  const fileName = `${detail.bolNumber} v${nextVersion}.pdf`;

  const stored = await storeDocumentVersion(supabase, {
    orgId: user.orgId,
    userId: user.id,
    docType: "bill_of_lading",
    docId: bolId,
    shipmentId: detail.shipmentId,
    kind: "bol",
    fileName,
    storagePathPrefix: `${user.orgId}/bol/${detail.shipmentId}`,
    bytes: buffer,
    snapshot: { broker, shipment: shipmentRow, carrier: carrierRow, bol: pdfData },
    version: nextVersion,
    billOfLadingId: bolId,
  });
  if (!stored.ok) return stored;

  const { error: updateError } = await supabase
    .from("crm_bills_of_lading")
    .update({
      pdf_document_id: stored.documentId,
      pdf_storage_path: stored.storagePath,
      version: nextVersion,
      status: "generated",
      doc_snapshot: { broker, shipment: shipmentRow, carrier: carrierRow, bol: pdfData },
    })
    .eq("id", bolId);
  if (updateError) {
    return { ok: false, error: "PDF generated, but could not update the bill of lading record." };
  }

  if (shipmentRow.account_id) {
    await logActivity(supabase, {
      orgId: user.orgId,
      userId: user.id,
      accountId: shipmentRow.account_id,
      kind: CRM_ACTIVITY.bolGenerated,
      summary: `Bill of lading generated: ${detail.bolNumber} (v${nextVersion})`,
    });
  }

  revalidateBol(bolId, detail.shipmentId, shipmentRow.account_id);
  return { ok: true, pdfDocumentId: stored.documentId, pdfStoragePath: stored.storagePath, version: nextVersion };
}

async function loadBolForLifecycle(
  supabase: SupabaseClient,
  id: string,
): Promise<{ bolNumber: string; shipmentId: string; status: string; accountId: string | null } | null> {
  const { data: bol } = await supabase
    .from("crm_bills_of_lading")
    .select("bol_number, shipment_id, status")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!bol) return null;

  const { data: shipment } = await supabase
    .from("crm_shipments")
    .select("account_id")
    .eq("id", bol.shipment_id as string)
    .maybeSingle();

  return {
    bolNumber: bol.bol_number as string,
    shipmentId: bol.shipment_id as string,
    status: bol.status as string,
    accountId: (shipment?.account_id as string | null) ?? null,
  };
}

/**
 * Mark a BOL as sent to the carrier/driver. Same "no real send pipeline yet"
 * posture as rate-confirmation-actions.ts::sendRateConfirmation — this only
 * records the state transition. TODO: wire an actual email/SMS send once
 * the CRM gets one.
 */
export async function sendBolDocument(id: string): Promise<ActionResult> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const prior = await loadBolForLifecycle(supabase, id);
  if (!prior) return { ok: false, error: "Bill of lading not found." };

  const { error } = await supabase
    .from("crm_bills_of_lading")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: "Could not mark the bill of lading as sent." };

  if (prior.accountId) {
    await logActivity(supabase, {
      orgId: user.orgId,
      userId: user.id,
      accountId: prior.accountId,
      kind: CRM_ACTIVITY.bolSent,
      summary: `Bill of lading sent: ${prior.bolNumber}`,
    });
  }

  revalidateBol(id, prior.shipmentId, prior.accountId);
  return { ok: true };
}

export async function markBolCompleted(id: string): Promise<ActionResult> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const prior = await loadBolForLifecycle(supabase, id);
  if (!prior) return { ok: false, error: "Bill of lading not found." };

  const { error } = await supabase
    .from("crm_bills_of_lading")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: "Could not mark the bill of lading as completed." };

  if (prior.accountId) {
    await logActivity(supabase, {
      orgId: user.orgId,
      userId: user.id,
      accountId: prior.accountId,
      kind: CRM_ACTIVITY.bolCompleted,
      summary: `Bill of lading completed: ${prior.bolNumber}`,
    });
  }

  revalidateBol(id, prior.shipmentId, prior.accountId);
  return { ok: true };
}

export async function cancelBolDocument(id: string): Promise<ActionResult> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const prior = await loadBolForLifecycle(supabase, id);
  if (!prior) return { ok: false, error: "Bill of lading not found." };

  const { error } = await supabase.from("crm_bills_of_lading").update({ status: "cancelled" }).eq("id", id);
  if (error) return { ok: false, error: "Could not cancel the bill of lading." };

  if (prior.accountId) {
    await logActivity(supabase, {
      orgId: user.orgId,
      userId: user.id,
      accountId: prior.accountId,
      kind: CRM_ACTIVITY.bolCancelled,
      summary: `Bill of lading cancelled: ${prior.bolNumber}`,
    });
  }

  revalidateBol(id, prior.shipmentId, prior.accountId);
  return { ok: true };
}

/**
 * Create a fresh draft copy of a BOL (new bol_number, version 1, status
 * 'draft' — same mechanics as duplicateBol) and mark the original as
 * superseded by it. The original row, its PDF, and every past
 * crm_document_versions row it produced are left completely intact.
 */
export async function supersedeBolDocument(id: string): Promise<CreateBolResult> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const copy = await duplicateBol(id);
  if (!copy.ok) return copy;

  const { error } = await supabase
    .from("crm_bills_of_lading")
    .update({ superseded_by: copy.id })
    .eq("id", id);
  if (error) return { ok: false, error: "New bill of lading created, but could not link it as a replacement." };

  const prior = await loadBolForLifecycle(supabase, id);
  if (prior?.accountId) {
    await logActivity(supabase, {
      orgId: user.orgId,
      userId: user.id,
      accountId: prior.accountId,
      kind: CRM_ACTIVITY.bolSuperseded,
      summary: `Bill of lading superseded: ${prior.bolNumber} → ${copy.bol.bolNumber}`,
    });
  }

  revalidateBol(id, copy.bol.shipmentId);
  return copy;
}
