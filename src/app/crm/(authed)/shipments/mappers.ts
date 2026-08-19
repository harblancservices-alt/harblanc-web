import type {
  CrmBillOfLading,
  CrmBillOfLadingRow,
  CrmBolLineItem,
  CrmBolLineItemRow,
  CrmCarrier,
  CrmCarrierContact,
  CrmCarrierContactRow,
  CrmCarrierRow,
  CrmRateConfirmation,
  CrmRateConfirmationLine,
  CrmRateConfirmationLineRow,
  CrmRateConfirmationRow,
  CrmShipment,
  CrmShipmentRow,
} from "./types";

/** DB row -> domain type for every new brokerage-document entity. Kept in one
 * file since every mapper here is a mechanical snake_case -> camelCase
 * rename with no business logic — actions.ts files import only what they use. */

export function mapShipmentRow(row: CrmShipmentRow): CrmShipment {
  return {
    id: row.id,
    orgId: row.org_id,
    shipmentNumber: row.shipment_number,
    status: row.status,
    accountId: row.account_id,
    customerName: row.customer_name,
    shipperLocationId: row.shipper_location_id,
    shipperName: row.shipper_name,
    shipperAddress: row.shipper_address,
    shipperCity: row.shipper_city,
    shipperState: row.shipper_state,
    shipperZip: row.shipper_zip,
    shipperContact: row.shipper_contact,
    shipperPhone: row.shipper_phone,
    consigneeLocationId: row.consignee_location_id,
    consigneeName: row.consignee_name,
    consigneeAddress: row.consignee_address,
    consigneeCity: row.consignee_city,
    consigneeState: row.consignee_state,
    consigneeZip: row.consignee_zip,
    consigneeContact: row.consignee_contact,
    consigneePhone: row.consignee_phone,
    pickupAt: row.pickup_at,
    pickupWindow: row.pickup_window,
    pickupNumber: row.pickup_number,
    pickupNotes: row.pickup_notes,
    deliveryAt: row.delivery_at,
    deliveryWindow: row.delivery_window,
    deliveryNumber: row.delivery_number,
    deliveryNotes: row.delivery_notes,
    commodity: row.commodity,
    description: row.description,
    weight: row.weight,
    pieces: row.pieces,
    equipment: row.equipment,
    poNumber: row.po_number,
    refNumbers: row.ref_numbers,
    specialInstructions: row.special_instructions,
    customerRate: row.customer_rate,
    carrierId: row.carrier_id,
    carrierRate: row.carrier_rate,
    carrierContactId: row.carrier_contact_id,
    carrierContactName: row.carrier_contact_name,
    carrierContactPhone: row.carrier_contact_phone,
    carrierContactEmail: row.carrier_contact_email,
    notes: row.notes,
    externalLoadRef: row.external_load_ref,
    truckNumber: row.truck_number,
    trailerNumber: row.trailer_number,
    lengthIn: row.length_in,
    widthIn: row.width_in,
    heightIn: row.height_in,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapCarrierRow(row: CrmCarrierRow): CrmCarrier {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    mcNumber: row.mc_number,
    dotNumber: row.dot_number,
    phone: row.phone,
    email: row.email,
    address: row.address,
    city: row.city,
    state: row.state,
    zip: row.zip,
    equipment: row.equipment,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapCarrierContactRow(row: CrmCarrierContactRow): CrmCarrierContact {
  return {
    id: row.id,
    carrierId: row.carrier_id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    role: row.role,
    notes: row.notes,
  };
}

export function mapRateConfirmationRow(row: CrmRateConfirmationRow): CrmRateConfirmation {
  return {
    id: row.id,
    orgId: row.org_id,
    shipmentId: row.shipment_id,
    rcNumber: row.rc_number,
    status: row.status,
    version: row.version,
    supersededBy: row.superseded_by,
    carrierId: row.carrier_id,
    carrierName: row.carrier_name,
    carrierMc: row.carrier_mc,
    carrierDot: row.carrier_dot,
    carrierContact: row.carrier_contact,
    carrierPhone: row.carrier_phone,
    carrierEmail: row.carrier_email,
    paymentTerms: row.payment_terms,
    quickPay: row.quick_pay,
    notes: row.notes,
    totalCarrierPay: row.total_carrier_pay,
    docSnapshot: row.doc_snapshot,
    pdfDocumentId: row.pdf_document_id,
    pdfStoragePath: row.pdf_storage_path,
    sentAt: row.sent_at,
    acceptedAt: row.accepted_at,
    completedAt: row.completed_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapRateConfirmationLineRow(row: CrmRateConfirmationLineRow): CrmRateConfirmationLine {
  return {
    id: row.id,
    rateConfirmationId: row.rate_confirmation_id,
    label: row.label,
    amount: row.amount,
    sortOrder: row.sort_order,
  };
}

export function mapBolRow(row: CrmBillOfLadingRow): CrmBillOfLading {
  return {
    id: row.id,
    orgId: row.org_id,
    shipmentId: row.shipment_id,
    bolNumber: row.bol_number,
    status: row.status,
    version: row.version,
    supersededBy: row.superseded_by,
    freightChargeTerms: row.freight_charge_terms,
    codAmount: row.cod_amount,
    declaredValue: row.declared_value,
    docSnapshot: row.doc_snapshot,
    pdfDocumentId: row.pdf_document_id,
    pdfStoragePath: row.pdf_storage_path,
    sentAt: row.sent_at,
    signedAt: row.signed_at,
    completedAt: row.completed_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapBolLineItemRow(row: CrmBolLineItemRow): CrmBolLineItem {
  return {
    id: row.id,
    bolId: row.bol_id,
    qty: row.qty,
    unitType: row.unit_type,
    description: row.description,
    weight: row.weight,
    nmfc: row.nmfc,
    freightClass: row.freight_class,
    hazmat: row.hazmat,
    sortOrder: row.sort_order,
  };
}
