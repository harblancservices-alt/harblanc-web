import { listOperationalDocuments } from "../documents-data";
import { AdminDocumentsGrid } from "./AdminDocumentsGrid";

export const dynamic = "force-dynamic";

/**
 * Admin Account "Documents" — the Operational Documents library this
 * feature moves out of Settings (../../settings/page.tsx's OrgDocumentsSection
 * "Documents" card — the reference-document TYPE library: blank Bill of
 * Lading/Rate Confirmation templates, Carrier Agreement, Shipper Agreement —
 * removed from Settings, see that file's diff). This is a different set of
 * documents than what OrgDocumentsSection showed: every RC/BOL actually
 * GENERATED across every shipment, not blank reference templates. Existing
 * org_doc:* rows/files from the old Settings library are left in Storage/
 * crm_documents untouched (nothing reads them anymore, but nothing deletes
 * them either) — see this PR's summary for that call.
 */
export default async function AdminDocumentsPage() {
  const documents = await listOperationalDocuments();
  return <AdminDocumentsGrid documents={documents} />;
}
