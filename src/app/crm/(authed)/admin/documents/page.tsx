import { listBlankTemplates } from "../documents-data";
import { AdminDocumentsGrid } from "./AdminDocumentsGrid";

export const dynamic = "force-dynamic";

/**
 * Admin Account "Documents" — the CRM's blank master templates (Rate
 * Confirmation, Bill of Lading), not per-shipment generated output. See
 * ../documents-data.ts for the full history: this tab originally showed
 * every RC/BOL generated across shipments; Brent's correction was that this
 * is a template library, not a job-output library.
 */
export default async function AdminDocumentsPage() {
  const templates = await listBlankTemplates();
  return <AdminDocumentsGrid templates={templates} />;
}
