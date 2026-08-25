import { listAllDocuments } from "../../shipments/document-history-actions";
import { AllDocumentsListClient } from "../clients/AllDocumentsListClient";

export const dynamic = "force-dynamic";

/**
 * Operations → BOL / RC — every Rate Confirmation and Bill of Lading
 * GENERATED from a shipment, org-wide.
 *
 * Promoted 2026-08-25 from a tab inside the Active Clients hub to a sub-tab
 * of Operations in its own right, so the section has ONE tab row instead of a
 * second row nested under it. Same component, same action, same data — the
 * panel moved, it was not rebuilt.
 *
 * NOT the same thing as Operations → Documents, despite the adjacent names.
 * That tab is the org's uploaded document LIBRARY (crm_documents — templates,
 * certificates, the folder compiler). This one is generated shipment
 * paperwork (crm_rate_confirmations + crm_bills_of_lading). Different tables,
 * different lifecycle, no overlap, which is why moving this up doesn't
 * duplicate anything already there.
 */
export default async function OperationsBolRcPage() {
  const documents = await listAllDocuments();
  return <AllDocumentsListClient documents={documents} />;
}
