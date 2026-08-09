"use server";

import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import type { ShipmentDocumentSummary } from "./types";

type RcHistoryRow = {
  id: string;
  rc_number: string;
  status: string;
  version: number;
  superseded_by: string | null;
  carrier_name: string | null;
  total_carrier_pay: number;
  pdf_document_id: string | null;
  pdf_storage_path: string | null;
  sent_at: string | null;
  accepted_at: string | null;
  completed_at: string | null;
  created_at: string;
};

type BolHistoryRow = {
  id: string;
  bol_number: string;
  status: string;
  version: number;
  superseded_by: string | null;
  pdf_document_id: string | null;
  pdf_storage_path: string | null;
  sent_at: string | null;
  signed_at: string | null;
  completed_at: string | null;
  created_at: string;
  doc_snapshot: Record<string, unknown> | null;
};

/**
 * Every Rate Confirmation + Bill of Lading ever generated for a shipment, in
 * one call, newest first — what a shipment detail screen's "Documents" tab
 * needs to list, reopen, reprint, or download without a second round trip
 * per row. A BOL's carrier name isn't a column on crm_bills_of_lading (only
 * ever lived in its doc_snapshot — see bol-actions.ts's header comment), so
 * it's read out of the most recently generated snapshot when present.
 */
export async function listShipmentDocuments(shipmentId: string): Promise<ShipmentDocumentSummary[]> {
  await requireCrmUser();
  const supabase = await createCrmServerClient();

  const [{ data: rcRows }, { data: bolRows }] = await Promise.all([
    supabase
      .from("crm_rate_confirmations")
      .select(
        "id, rc_number, status, version, superseded_by, carrier_name, total_carrier_pay, pdf_document_id, pdf_storage_path, sent_at, accepted_at, completed_at, created_at",
      )
      .eq("shipment_id", shipmentId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("crm_bills_of_lading")
      .select(
        "id, bol_number, status, version, superseded_by, pdf_document_id, pdf_storage_path, sent_at, signed_at, completed_at, created_at, doc_snapshot",
      )
      .eq("shipment_id", shipmentId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  const rcDocs: ShipmentDocumentSummary[] = ((rcRows ?? []) as RcHistoryRow[]).map((r) => ({
    id: r.id,
    docType: "rate_confirmation",
    number: r.rc_number,
    status: r.status,
    version: r.version,
    supersededBy: r.superseded_by,
    carrierName: r.carrier_name,
    totalCarrierPay: r.total_carrier_pay,
    pdfDocumentId: r.pdf_document_id,
    pdfStoragePath: r.pdf_storage_path,
    sentAt: r.sent_at,
    acceptedAt: r.accepted_at,
    signedAt: null,
    completedAt: r.completed_at,
    createdAt: r.created_at,
  }));

  const bolDocs: ShipmentDocumentSummary[] = ((bolRows ?? []) as BolHistoryRow[]).map((r) => {
    const snapshotCarrier = r.doc_snapshot?.carrier as { name?: string | null } | null | undefined;
    return {
      id: r.id,
      docType: "bill_of_lading",
      number: r.bol_number,
      status: r.status,
      version: r.version,
      supersededBy: r.superseded_by,
      carrierName: snapshotCarrier?.name ?? null,
      totalCarrierPay: null,
      pdfDocumentId: r.pdf_document_id,
      pdfStoragePath: r.pdf_storage_path,
      sentAt: r.sent_at,
      acceptedAt: null,
      signedAt: r.signed_at,
      completedAt: r.completed_at,
      createdAt: r.created_at,
    };
  });

  return [...rcDocs, ...bolDocs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
