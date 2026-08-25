"use server";

import { revalidatePath } from "next/cache";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { logActivity, CRM_ACTIVITY } from "@/lib/crm/activity";
import { ACTIVE_CUSTOMER_STAGE_VALUES } from "../accounts/lifecycle";
import { mapShipmentRow, mapCarrierRow } from "./mappers";
import type {
  AccountLocationFields,
  CrmAccountLocation,
  CrmCarrierRow,
  CrmShipment,
  CrmShipmentDetail,
  CrmShipmentRow,
  CrmShipmentSummary,
  CustomerSearchResult,
  ShipmentFields,
} from "./types";

/**
 * The shipment is the parent record of the brokerage document system: a
 * shipment is created once (from a customer, or from scratch), then a Rate
 * Confirmation and/or Bill of Lading are generated FROM it (see
 * rate-confirmation-actions.ts / bol-actions.ts) — each one snapshotting the
 * shipment's fields at that moment rather than referencing them live. Same
 * write contract as every CRM action: resolve the caller with
 * requireCrmUser(), run through the RLS-scoped client, stamp org_id/
 * created_by from the SESSION, soft-delete via deleted_at.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };
export type CreateShipmentResult =
  | { ok: true; id: string; shipment: CrmShipment }
  | { ok: false; error: string };

function revalidateShipments(shipmentId?: string, accountId?: string | null) {
  revalidatePath("/crm/shipments");
  revalidatePath("/crm");
  if (shipmentId) revalidatePath(`/crm/shipments/${shipmentId}`);
  if (accountId) revalidatePath(`/crm/accounts/${accountId}`);
}

/**
 * Builds the DB update/insert payload from a Partial<ShipmentFields>, but
 * ONLY includes a key when it's actually present on the object (checked with
 * `in`, not `!== undefined`) — so a caller can pass `{ shipperName: null }`
 * to explicitly clear the field, while simply omitting a key leaves the
 * column untouched. This is what makes `applyLocationToShipment` a "concept"
 * rather than a dedicated action: the UI picks a crm_account_location, reads
 * its fields (via listAccountLocations), and passes shipperLocationId
 * together with the snapshot fields (shipperName/address/city/state/zip) in
 * one createShipment/updateShipment call — the location id and the snapshot
 * are just two more fields in the same partial update, and later edits to
 * either never retroactively change the other.
 */
function shipmentFieldsToRow(fields: Partial<ShipmentFields>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  const set = (key: keyof ShipmentFields, column: string) => {
    if (key in fields) row[column] = fields[key];
  };
  set("accountId", "account_id");
  set("customerName", "customer_name");
  set("shipperLocationId", "shipper_location_id");
  set("shipperName", "shipper_name");
  set("shipperAddress", "shipper_address");
  set("shipperCity", "shipper_city");
  set("shipperState", "shipper_state");
  set("shipperZip", "shipper_zip");
  set("shipperContact", "shipper_contact");
  set("shipperPhone", "shipper_phone");
  set("consigneeLocationId", "consignee_location_id");
  set("consigneeName", "consignee_name");
  set("consigneeAddress", "consignee_address");
  set("consigneeCity", "consignee_city");
  set("consigneeState", "consignee_state");
  set("consigneeZip", "consignee_zip");
  set("consigneeContact", "consignee_contact");
  set("consigneePhone", "consignee_phone");
  set("pickupAt", "pickup_at");
  set("pickupWindow", "pickup_window");
  set("pickupNumber", "pickup_number");
  set("pickupNotes", "pickup_notes");
  set("deliveryAt", "delivery_at");
  set("deliveryWindow", "delivery_window");
  set("deliveryNumber", "delivery_number");
  set("deliveryNotes", "delivery_notes");
  set("commodity", "commodity");
  set("description", "description");
  set("weight", "weight");
  set("pieces", "pieces");
  set("equipment", "equipment");
  set("poNumber", "po_number");
  set("refNumbers", "ref_numbers");
  set("specialInstructions", "special_instructions");
  set("customerRate", "customer_rate");
  set("carrierId", "carrier_id");
  set("carrierRate", "carrier_rate");
  set("carrierContactId", "carrier_contact_id");
  set("carrierContactName", "carrier_contact_name");
  set("carrierContactPhone", "carrier_contact_phone");
  set("carrierContactEmail", "carrier_contact_email");
  set("notes", "notes");
  set("externalLoadRef", "external_load_ref");
  set("truckNumber", "truck_number");
  set("trailerNumber", "trailer_number");
  set("lengthIn", "length_in");
  set("widthIn", "width_in");
  set("heightIn", "height_in");
  set("status", "status");
  return row;
}

// ── Shipments ────────────────────────────────────────────────────────────────

/**
 * Create a shipment. shipment_number is DB-assigned (next_crm_shipment_number()),
 * status defaults to 'open'. If accountId is given and customerName isn't
 * explicitly set, the account's current name is snapshotted in as
 * customer_name — same "resolved at creation time, not looked up live"
 * pattern as the shipper/consignee snapshot fields.
 */
export async function createShipment(
  fields: Partial<ShipmentFields>,
): Promise<CreateShipmentResult> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const row = shipmentFieldsToRow(fields);

  if (fields.accountId && !("customerName" in fields)) {
    const { data: account } = await supabase
      .from("crm_accounts")
      .select("name")
      .eq("id", fields.accountId)
      .maybeSingle();
    if (account) row.customer_name = account.name as string;
  }

  const { data, error } = await supabase
    .from("crm_shipments")
    .insert({ org_id: user.orgId, created_by: user.id, ...row })
    .select("*")
    .single();

  if (error || !data) {
    return { ok: false, error: "Could not create the shipment. Please try again." };
  }

  const shipmentRow = data as CrmShipmentRow;

  if (shipmentRow.account_id) {
    await logActivity(supabase, {
      orgId: user.orgId,
      userId: user.id,
      accountId: shipmentRow.account_id,
      kind: CRM_ACTIVITY.shipmentCreated,
      summary: `Shipment created: ${shipmentRow.shipment_number}`,
    });
  }

  revalidateShipments(shipmentRow.id, shipmentRow.account_id);
  return { ok: true, id: shipmentRow.id, shipment: mapShipmentRow(shipmentRow) };
}

/**
 * Update a shipment. Only keys present on `fields` are written (see
 * shipmentFieldsToRow). If `status` is included and actually changes, logs a
 * timeline entry on the linked account (mirrors accounts/actions.ts's
 * lifecycle-change logging — every other field edit is silent, matching that
 * same file's convention of only logging meaningful state transitions).
 */
export async function updateShipment(
  id: string,
  fields: Partial<ShipmentFields>,
): Promise<ActionResult> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { data: prior } = await supabase
    .from("crm_shipments")
    .select("status, account_id, shipment_number")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!prior) return { ok: false, error: "Shipment not found." };

  const row = shipmentFieldsToRow(fields);
  if (Object.keys(row).length === 0) return { ok: true };

  const { error } = await supabase.from("crm_shipments").update(row).eq("id", id);
  if (error) return { ok: false, error: "Could not update the shipment. Please try again." };

  const nextAccountId =
    "accountId" in fields ? (fields.accountId ?? null) : (prior.account_id as string | null);

  if (
    "status" in fields &&
    fields.status !== prior.status &&
    nextAccountId
  ) {
    await logActivity(supabase, {
      orgId: user.orgId,
      userId: user.id,
      accountId: nextAccountId,
      kind: CRM_ACTIVITY.shipmentStatusChanged,
      summary: `Shipment ${prior.shipment_number as string} status changed: ${prior.status as string} → ${fields.status}`,
      meta: { from: prior.status, to: fields.status },
    });
  }

  revalidateShipments(id, nextAccountId);
  return { ok: true };
}

/** Full detail read — shipment + its carrier + its customer account name,
 * resolved in one call so a detail screen needs exactly one round trip. */
export async function getShipment(id: string): Promise<CrmShipmentDetail | null> {
  await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { data } = await supabase
    .from("crm_shipments")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;

  const shipmentRow = data as CrmShipmentRow;

  const [carrierResult, accountResult] = await Promise.all([
    shipmentRow.carrier_id
      ? supabase
          .from("crm_carriers")
          .select("*")
          .eq("id", shipmentRow.carrier_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    shipmentRow.account_id
      ? supabase
          .from("crm_accounts")
          .select("id, name")
          .eq("id", shipmentRow.account_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    ...mapShipmentRow(shipmentRow),
    carrier: carrierResult.data ? mapCarrierRow(carrierResult.data as CrmCarrierRow) : null,
    customerAccount: accountResult.data
      ? { id: accountResult.data.id as string, name: accountResult.data.name as string }
      : null,
  };
}

/** Org-wide shipment list, newest first, with the carrier's name and
 * RC/BOL counts a list row needs — no per-row extra fetch. */
export async function listShipments(): Promise<CrmShipmentSummary[]> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { data: shipmentRows } = await supabase
    .from("crm_shipments")
    .select("*")
    .eq("org_id", user.orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const shipments = (shipmentRows ?? []) as CrmShipmentRow[];
  if (shipments.length === 0) return [];

  const shipmentIds = shipments.map((s) => s.id);
  const carrierIds = Array.from(
    new Set(shipments.map((s) => s.carrier_id).filter((v): v is string => Boolean(v))),
  );

  const [carriersResult, rcResult, bolResult] = await Promise.all([
    carrierIds.length
      ? supabase.from("crm_carriers").select("id, name").in("id", carrierIds)
      : Promise.resolve({ data: [] }),
    supabase
      .from("crm_rate_confirmations")
      .select("id, shipment_id")
      .in("shipment_id", shipmentIds)
      .is("deleted_at", null),
    supabase
      .from("crm_bills_of_lading")
      .select("id, shipment_id")
      .in("shipment_id", shipmentIds)
      .is("deleted_at", null),
  ]);

  const carrierNameById = new Map<string, string>(
    ((carriersResult.data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]),
  );

  const rcCountByShipment = new Map<string, number>();
  for (const row of (rcResult.data ?? []) as { shipment_id: string }[]) {
    rcCountByShipment.set(row.shipment_id, (rcCountByShipment.get(row.shipment_id) ?? 0) + 1);
  }
  const bolCountByShipment = new Map<string, number>();
  for (const row of (bolResult.data ?? []) as { shipment_id: string }[]) {
    bolCountByShipment.set(row.shipment_id, (bolCountByShipment.get(row.shipment_id) ?? 0) + 1);
  }

  return shipments.map((row) => ({
    ...mapShipmentRow(row),
    carrierName: row.carrier_id ? (carrierNameById.get(row.carrier_id) ?? null) : null,
    rateConfirmationCount: rcCountByShipment.get(row.id) ?? 0,
    bolCount: bolCountByShipment.get(row.id) ?? 0,
  }));
}

/** A single account's shipments (active + historical), newest first, with
 * the same carrier-name + RC/BOL-count enrichment listShipments() gives the
 * org-wide list — used by the Active Customers profile's Shipments tab. */
export async function listShipmentsForAccount(accountId: string): Promise<CrmShipmentSummary[]> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { data: shipmentRows } = await supabase
    .from("crm_shipments")
    .select("*")
    .eq("org_id", user.orgId)
    .eq("account_id", accountId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const shipments = (shipmentRows ?? []) as CrmShipmentRow[];
  if (shipments.length === 0) return [];

  const shipmentIds = shipments.map((s) => s.id);
  const carrierIds = Array.from(
    new Set(shipments.map((s) => s.carrier_id).filter((v): v is string => Boolean(v))),
  );

  const [carriersResult, rcResult, bolResult] = await Promise.all([
    carrierIds.length
      ? supabase.from("crm_carriers").select("id, name").in("id", carrierIds)
      : Promise.resolve({ data: [] }),
    supabase
      .from("crm_rate_confirmations")
      .select("id, shipment_id")
      .in("shipment_id", shipmentIds)
      .is("deleted_at", null),
    supabase
      .from("crm_bills_of_lading")
      .select("id, shipment_id")
      .in("shipment_id", shipmentIds)
      .is("deleted_at", null),
  ]);

  const carrierNameById = new Map<string, string>(
    ((carriersResult.data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]),
  );

  const rcCountByShipment = new Map<string, number>();
  for (const row of (rcResult.data ?? []) as { shipment_id: string }[]) {
    rcCountByShipment.set(row.shipment_id, (rcCountByShipment.get(row.shipment_id) ?? 0) + 1);
  }
  const bolCountByShipment = new Map<string, number>();
  for (const row of (bolResult.data ?? []) as { shipment_id: string }[]) {
    bolCountByShipment.set(row.shipment_id, (bolCountByShipment.get(row.shipment_id) ?? 0) + 1);
  }

  return shipments.map((row) => ({
    ...mapShipmentRow(row),
    carrierName: row.carrier_id ? (carrierNameById.get(row.carrier_id) ?? null) : null,
    rateConfirmationCount: rcCountByShipment.get(row.id) ?? 0,
    bolCount: bolCountByShipment.get(row.id) ?? 0,
  }));
}

/** Soft-delete a shipment. Any org member may delete — a shipment is
 * operational, same reasoning as calls/notes (no owner gate). */
export async function softDeleteShipment(id: string): Promise<ActionResult> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { data: prior } = await supabase
    .from("crm_shipments")
    .select("shipment_number, account_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!prior) return { ok: false, error: "Shipment not found." };

  const { error } = await supabase
    .from("crm_shipments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: "Could not delete the shipment." };

  if (prior.account_id) {
    await logActivity(supabase, {
      orgId: user.orgId,
      userId: user.id,
      accountId: prior.account_id as string,
      kind: CRM_ACTIVITY.shipmentDeleted,
      summary: `Shipment deleted: ${prior.shipment_number as string}`,
    });
  }

  revalidateShipments(id, prior.account_id as string | null);
  return { ok: true };
}

// ── Customer selection ──────────────────────────────────────────────────────

/**
 * The load builder's Customer picker — crm_accounts search by name, scoped
 * to ACTIVE CUSTOMERS ONLY (2026-08-24). You build a load for a company
 * you've already won, so the picker offers only accounts sitting at the
 * same active_customer stage the Active Customers list is built on; leads,
 * prospects and still-quoting companies are not selectable here. The stage
 * filter is the shared ACTIVE_CUSTOMER_STAGE_VALUES from
 * accounts/lifecycle.ts (the SQL twin of isActiveCustomerStage), so the
 * definition lives in one place instead of being re-spelled here.
 *
 * This narrows what can be PICKED, never what can be DISPLAYED: a shipment
 * already linked to a company that has since fallen out of the stage still
 * renders its linked-company chip from the shipment row's own
 * account_id/customer_name (see ShipmentWorkspace), which never consults
 * this search — so no saved value is ever blanked by this filter.
 *
 * Empty query returns the org's first 20 active customers alphabetically.
 */
export async function searchCustomers(query: string): Promise<CustomerSearchResult[]> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const trimmed = query.trim();
  let q = supabase
    .from("crm_accounts")
    .select("id, name, city, state")
    .eq("org_id", user.orgId)
    .in("lifecycle_status", ACTIVE_CUSTOMER_STAGE_VALUES)
    .is("deleted_at", null)
    .order("name")
    .limit(20);
  if (trimmed) q = q.ilike("name", `%${trimmed}%`);

  const { data } = await q;
  return ((data ?? []) as { id: string; name: string; city: string | null; state: string | null }[]).map(
    (r) => ({ id: r.id, name: r.name, city: r.city, state: r.state }),
  );
}

// ── Locations ────────────────────────────────────────────────────────────────

type AccountLocationRow = {
  id: string;
  account_id: string;
  label: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  receiving_hours: string | null;
  dock_notes: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  default_carrier_id: string | null;
  default_carrier_contact_id: string | null;
};

/** A customer's saved facilities, for the shipper/consignee location picker
 * when building a shipment off an existing account. Batch-resolves each
 * location's recurring carrier/contact (if set) the same way listShipments()
 * batches carrier names — one extra pair of queries, not one per row. */
export async function listAccountLocations(accountId: string): Promise<CrmAccountLocation[]> {
  await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { data } = await supabase
    .from("crm_account_locations")
    .select(
      "id, account_id, label, address, city, state, zip, receiving_hours, dock_notes, contact_name, contact_phone, contact_email, default_carrier_id, default_carrier_contact_id",
    )
    .eq("account_id", accountId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const rows = (data ?? []) as AccountLocationRow[];
  if (rows.length === 0) return [];

  const carrierIds = Array.from(
    new Set(rows.map((r) => r.default_carrier_id).filter((v): v is string => Boolean(v))),
  );
  const contactIds = Array.from(
    new Set(rows.map((r) => r.default_carrier_contact_id).filter((v): v is string => Boolean(v))),
  );

  const [carriersResult, contactsResult] = await Promise.all([
    carrierIds.length
      ? supabase.from("crm_carriers").select("id, name").in("id", carrierIds)
      : Promise.resolve({ data: [] }),
    contactIds.length
      ? supabase.from("crm_carrier_contacts").select("id, name, phone, email").in("id", contactIds)
      : Promise.resolve({ data: [] }),
  ]);

  const carrierNameById = new Map<string, string>(
    ((carriersResult.data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]),
  );
  const contactById = new Map<string, { name: string | null; phone: string | null; email: string | null }>(
    ((contactsResult.data ?? []) as { id: string; name: string | null; phone: string | null; email: string | null }[]).map(
      (c) => [c.id, { name: c.name, phone: c.phone, email: c.email }],
    ),
  );

  return rows.map((r) => {
    const contact = r.default_carrier_contact_id ? contactById.get(r.default_carrier_contact_id) : undefined;
    return {
      id: r.id,
      accountId: r.account_id,
      label: r.label,
      address: r.address,
      city: r.city,
      state: r.state,
      zip: r.zip,
      receivingHours: r.receiving_hours,
      dockNotes: r.dock_notes,
      contactName: r.contact_name,
      contactPhone: r.contact_phone,
      contactEmail: r.contact_email,
      defaultCarrierId: r.default_carrier_id,
      defaultCarrierContactId: r.default_carrier_contact_id,
      defaultCarrierName: r.default_carrier_id ? (carrierNameById.get(r.default_carrier_id) ?? null) : null,
      defaultCarrierContactName: contact?.name ?? null,
      defaultCarrierContactPhone: contact?.phone ?? null,
      defaultCarrierContactEmail: contact?.email ?? null,
    };
  });
}

/**
 * Save a new facility on a customer so it can be reused as a shipper/
 * consignee on future shipments — same crm_account_locations table the
 * account profile's Locations & docks card uses. Returns the new row's id so
 * the caller can immediately set it as shipperLocationId/consigneeLocationId
 * alongside the snapshot fields on the same shipment write.
 */
export async function createAccountLocation(
  accountId: string,
  fields: Partial<AccountLocationFields>,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { data, error } = await supabase
    .from("crm_account_locations")
    .insert({
      org_id: user.orgId,
      account_id: accountId,
      label: fields.label ?? null,
      address: fields.address ?? null,
      city: fields.city ?? null,
      state: fields.state ?? null,
      zip: fields.zip ?? null,
      receiving_hours: fields.receivingHours ?? null,
      dock_notes: fields.dockNotes ?? null,
      contact_name: fields.contactName ?? null,
      contact_phone: fields.contactPhone ?? null,
      contact_email: fields.contactEmail ?? null,
      default_carrier_id: fields.defaultCarrierId ?? null,
      default_carrier_contact_id: fields.defaultCarrierContactId ?? null,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: "Could not save the location. Please try again." };

  revalidatePath(`/crm/accounts/${accountId}`);
  return { ok: true, id: data.id as string };
}
