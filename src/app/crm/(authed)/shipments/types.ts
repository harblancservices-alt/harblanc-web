/**
 * Domain types for the brokerage document system's data layer: a shipment is
 * the parent record; Rate Confirmations and Bills of Lading are documents
 * generated FROM a shipment (crm_shipments.id -> shipment_id on both). All
 * three, plus the carrier directory, share the same shape convention as the
 * rest of the CRM: a `*Row` type mirrors the DB columns 1:1 (snake_case, as
 * Supabase hands it back), and a camelCase domain type is what actions
 * return to callers. Money fields are always `number`, everything else is
 * `string | null` unless the column is genuinely typed otherwise (booleans,
 * integers, jsonb).
 */

// ── Carriers ─────────────────────────────────────────────────────────────────

export type CrmCarrierRow = {
  id: string;
  org_id: string;
  name: string;
  mc_number: string | null;
  dot_number: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  equipment: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CrmCarrier = {
  id: string;
  orgId: string;
  name: string;
  mcNumber: string | null;
  dotNumber: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  equipment: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CrmCarrierContactRow = {
  id: string;
  org_id: string;
  carrier_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  role: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CrmCarrierContact = {
  id: string;
  carrierId: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  role: string | null;
  notes: string | null;
};

export type CrmCarrierWithContacts = CrmCarrier & { contacts: CrmCarrierContact[] };

/** Fields a carrier create/update may set — every key optional so an update
 * only touches what's explicitly present (see fieldsPresent() in actions). */
export type CarrierFields = {
  name: string;
  mcNumber: string | null;
  dotNumber: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  equipment: string | null;
  status: string;
  notes: string | null;
};

export type CarrierContactFields = {
  name: string | null;
  phone: string | null;
  email: string | null;
  role: string | null;
  notes: string | null;
};

// ── Customers / locations ───────────────────────────────────────────────────

export type CustomerSearchResult = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
};

export type CrmAccountLocation = {
  id: string;
  accountId: string;
  label: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  receivingHours: string | null;
  dockNotes: string | null;
};

export type AccountLocationFields = {
  label: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  receivingHours: string | null;
  dockNotes: string | null;
};

// ── Shipments ────────────────────────────────────────────────────────────────

export type CrmShipmentRow = {
  id: string;
  org_id: string;
  shipment_number: string;
  status: string;
  account_id: string | null;
  customer_name: string | null;
  shipper_location_id: string | null;
  shipper_name: string | null;
  shipper_address: string | null;
  shipper_city: string | null;
  shipper_state: string | null;
  shipper_zip: string | null;
  shipper_contact: string | null;
  shipper_phone: string | null;
  consignee_location_id: string | null;
  consignee_name: string | null;
  consignee_address: string | null;
  consignee_city: string | null;
  consignee_state: string | null;
  consignee_zip: string | null;
  consignee_contact: string | null;
  consignee_phone: string | null;
  pickup_at: string | null;
  pickup_window: string | null;
  pickup_number: string | null;
  pickup_notes: string | null;
  delivery_at: string | null;
  delivery_window: string | null;
  delivery_number: string | null;
  delivery_notes: string | null;
  commodity: string | null;
  description: string | null;
  weight: string | null;
  pieces: string | null;
  equipment: string | null;
  po_number: string | null;
  ref_numbers: string | null;
  special_instructions: string | null;
  customer_rate: number | null;
  carrier_id: string | null;
  carrier_rate: number | null;
  notes: string | null;
  external_load_ref: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CrmShipment = {
  id: string;
  orgId: string;
  shipmentNumber: string;
  status: string;
  accountId: string | null;
  customerName: string | null;
  shipperLocationId: string | null;
  shipperName: string | null;
  shipperAddress: string | null;
  shipperCity: string | null;
  shipperState: string | null;
  shipperZip: string | null;
  shipperContact: string | null;
  shipperPhone: string | null;
  consigneeLocationId: string | null;
  consigneeName: string | null;
  consigneeAddress: string | null;
  consigneeCity: string | null;
  consigneeState: string | null;
  consigneeZip: string | null;
  consigneeContact: string | null;
  consigneePhone: string | null;
  pickupAt: string | null;
  pickupWindow: string | null;
  pickupNumber: string | null;
  pickupNotes: string | null;
  deliveryAt: string | null;
  deliveryWindow: string | null;
  deliveryNumber: string | null;
  deliveryNotes: string | null;
  commodity: string | null;
  description: string | null;
  weight: string | null;
  pieces: string | null;
  equipment: string | null;
  poNumber: string | null;
  refNumbers: string | null;
  specialInstructions: string | null;
  customerRate: number | null;
  carrierId: string | null;
  carrierRate: number | null;
  notes: string | null;
  externalLoadRef: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Row shown in the shipments list — the shipment plus cheap-to-compute
 * extras the list view needs so it doesn't re-fetch per row. */
export type CrmShipmentSummary = CrmShipment & {
  carrierName: string | null;
  rateConfirmationCount: number;
  bolCount: number;
};

/** Everything a shipment detail screen needs in one call. */
export type CrmShipmentDetail = CrmShipment & {
  carrier: CrmCarrier | null;
  customerAccount: { id: string; name: string } | null;
};

/** Every shipment field a create/update may set. All optional: create()
 * leaves unset fields as column defaults/null, update() only touches keys
 * actually present on the object (see fieldsPresent()) so a partial save can
 * never silently null out a field the caller didn't mean to touch. Pass
 * `null` explicitly to clear a field (e.g. un-set a shipper location). */
export type ShipmentFields = {
  accountId: string | null;
  customerName: string | null;
  shipperLocationId: string | null;
  shipperName: string | null;
  shipperAddress: string | null;
  shipperCity: string | null;
  shipperState: string | null;
  shipperZip: string | null;
  shipperContact: string | null;
  shipperPhone: string | null;
  consigneeLocationId: string | null;
  consigneeName: string | null;
  consigneeAddress: string | null;
  consigneeCity: string | null;
  consigneeState: string | null;
  consigneeZip: string | null;
  consigneeContact: string | null;
  consigneePhone: string | null;
  pickupAt: string | null;
  pickupWindow: string | null;
  pickupNumber: string | null;
  pickupNotes: string | null;
  deliveryAt: string | null;
  deliveryWindow: string | null;
  deliveryNumber: string | null;
  deliveryNotes: string | null;
  commodity: string | null;
  description: string | null;
  weight: string | null;
  pieces: string | null;
  equipment: string | null;
  poNumber: string | null;
  refNumbers: string | null;
  specialInstructions: string | null;
  customerRate: number | null;
  carrierId: string | null;
  carrierRate: number | null;
  notes: string | null;
  externalLoadRef: string | null;
  status: string;
};

// ── Rate confirmations ──────────────────────────────────────────────────────

export type CrmRateConfirmationRow = {
  id: string;
  org_id: string;
  shipment_id: string;
  rc_number: string;
  status: string;
  version: number;
  superseded_by: string | null;
  carrier_id: string | null;
  carrier_name: string | null;
  carrier_mc: string | null;
  carrier_dot: string | null;
  carrier_contact: string | null;
  carrier_phone: string | null;
  carrier_email: string | null;
  payment_terms: string | null;
  quick_pay: string | null;
  notes: string | null;
  total_carrier_pay: number;
  doc_snapshot: Record<string, unknown> | null;
  pdf_document_id: string | null;
  pdf_storage_path: string | null;
  sent_at: string | null;
  accepted_at: string | null;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CrmRateConfirmation = {
  id: string;
  orgId: string;
  shipmentId: string;
  rcNumber: string;
  status: string;
  version: number;
  supersededBy: string | null;
  carrierId: string | null;
  carrierName: string | null;
  carrierMc: string | null;
  carrierDot: string | null;
  carrierContact: string | null;
  carrierPhone: string | null;
  carrierEmail: string | null;
  paymentTerms: string | null;
  quickPay: string | null;
  notes: string | null;
  totalCarrierPay: number;
  docSnapshot: Record<string, unknown> | null;
  pdfDocumentId: string | null;
  pdfStoragePath: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
  completedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CrmRateConfirmationLineRow = {
  id: string;
  org_id: string;
  rate_confirmation_id: string;
  label: string;
  amount: number;
  sort_order: number;
  created_at: string;
};

export type CrmRateConfirmationLine = {
  id: string;
  rateConfirmationId: string;
  label: string;
  amount: number;
  sortOrder: number;
};

export type CrmRateConfirmationDetail = CrmRateConfirmation & {
  lines: CrmRateConfirmationLine[];
};

/** Fields a Rate Confirmation update may set — status/carrier/dollar fields.
 * Same "only present keys are touched" contract as ShipmentFields. Lines are
 * handled separately (add/update/remove line actions, or the `lines` param
 * on updateRateConfirmation for a full replace). */
export type RateConfirmationFields = {
  status: string;
  carrierId: string | null;
  carrierName: string | null;
  carrierMc: string | null;
  carrierDot: string | null;
  carrierContact: string | null;
  carrierPhone: string | null;
  carrierEmail: string | null;
  paymentTerms: string | null;
  quickPay: string | null;
  notes: string | null;
};

export type RateConfirmationLineInput = {
  label: string;
  amount: number;
  sortOrder?: number;
};

// ── Bills of lading ──────────────────────────────────────────────────────────

export type CrmBillOfLadingRow = {
  id: string;
  org_id: string;
  shipment_id: string;
  bol_number: string;
  status: string;
  version: number;
  superseded_by: string | null;
  freight_charge_terms: string | null;
  cod_amount: number | null;
  declared_value: string | null;
  doc_snapshot: Record<string, unknown> | null;
  pdf_document_id: string | null;
  pdf_storage_path: string | null;
  sent_at: string | null;
  signed_at: string | null;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CrmBillOfLading = {
  id: string;
  orgId: string;
  shipmentId: string;
  bolNumber: string;
  status: string;
  version: number;
  supersededBy: string | null;
  freightChargeTerms: string | null;
  codAmount: number | null;
  declaredValue: string | null;
  docSnapshot: Record<string, unknown> | null;
  pdfDocumentId: string | null;
  pdfStoragePath: string | null;
  sentAt: string | null;
  signedAt: string | null;
  completedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CrmBolLineItemRow = {
  id: string;
  org_id: string;
  bol_id: string;
  qty: string | null;
  unit_type: string | null;
  description: string | null;
  weight: string | null;
  nmfc: string | null;
  freight_class: string | null;
  hazmat: boolean;
  sort_order: number;
  created_at: string;
};

export type CrmBolLineItem = {
  id: string;
  bolId: string;
  qty: string | null;
  unitType: string | null;
  description: string | null;
  weight: string | null;
  nmfc: string | null;
  freightClass: string | null;
  hazmat: boolean;
  sortOrder: number;
};

export type CrmBillOfLadingDetail = CrmBillOfLading & {
  lineItems: CrmBolLineItem[];
};

/** Fields a BOL update may set. Same "only present keys are touched"
 * contract as ShipmentFields. Line items are handled separately. */
export type BolFields = {
  status: string;
  freightChargeTerms: string | null;
  codAmount: number | null;
  declaredValue: string | null;
};

export type BolLineItemInput = {
  qty: string | null;
  unitType: string | null;
  description: string | null;
  weight: string | null;
  nmfc: string | null;
  freightClass: string | null;
  hazmat: boolean;
  sortOrder?: number;
};
