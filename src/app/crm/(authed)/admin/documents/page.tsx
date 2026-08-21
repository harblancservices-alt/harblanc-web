import { requireCrmUser } from "@/lib/crm/auth";
import { listBlankTemplates, listOrgUploads } from "../documents-data";
import { AdminDocumentsGrid } from "./AdminDocumentsGrid";

export const dynamic = "force-dynamic";

/**
 * Admin Account "Documents" — the CRM's blank master templates (Rate
 * Confirmation, Bill of Lading) PLUS org-level uploaded documents (insurance
 * certs, W9s, agreements), together in one grid. See ../documents-data.ts
 * for the templates' history: this tab originally showed every RC/BOL
 * generated across shipments; Brent's correction was that this is a
 * template library, not a job-output library — uploads are a distinct,
 * later addition (kind=ORG_UPLOAD_KIND), not a return to that old design.
 */
export default async function AdminDocumentsPage() {
  const user = await requireCrmUser();
  const [templates, uploads] = await Promise.all([listBlankTemplates(), listOrgUploads()]);
  return <AdminDocumentsGrid templates={templates} uploads={uploads} orgId={user.orgId} />;
}
