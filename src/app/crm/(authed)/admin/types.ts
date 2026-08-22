/**
 * Types for the Admin Account section (Overview/Accounts/Activity/Documents).
 * Mirrors the rest of the CRM's `*Row` (snake_case, straight off Supabase) ->
 * camelCase domain type convention.
 */

export type AdminTeamMemberRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  is_active: boolean;
  is_primary_owner: boolean;
  can_view_all_companies: boolean;
  created_at: string;
};

export type AdminTeamMember = {
  id: string;
  fullName: string | null;
  email: string | null;
  role: string;
  isActive: boolean;
  isPrimaryOwner: boolean;
  canViewAllCompanies: boolean;
  createdAt: string;
  companiesOwned: number;
  openTasks: number;
  lastActiveAt: string | null;
};

/** One row in the org-wide activity feed — the union of crm_activities
 * (excluding call/note kinds, which are represented by their own richer
 * rows below) + crm_calls + crm_notes, same "type" split as the per-company
 * ActivityTimeline/CrmActivityLogItem on accounts/[id]/page.tsx, just org-wide
 * and carrying the parent company's name/id so a row can be filtered by
 * company and its "View" link can route to the right profile. */
export type AdminActivityItem = {
  id: string;
  type: "call" | "note" | "activity";
  kind: string | null;
  title: string;
  body: string | null;
  occurredAt: string;
  authorId: string | null;
  authorName: string | null;
  accountId: string | null;
  accountName: string | null;
  contactId: string | null;
  contactName: string | null;
};

/** One card in the Admin Account "Documents" tab — the blank MASTER
 * templates the CRM's own RC/BOL generator is built from (crm_documents,
 * kind='org_doc:Rate Confirmation'/'org_doc:Bill of Lading', account_id/
 * deal_id both null — the exact rows ../settings/blankTemplates.ts used to
 * self-seed before that Settings section was removed), not per-shipment
 * generated output. POD is out of scope (Brent's call — no CRM POD source
 * exists anyway; see documents-data.ts header). `docType` distinguishes
 * which template a card is for card styling (icon/label), matching the
 * vocabulary the rest of the CRM's RC/BOL code already uses. */
export type AdminBlankTemplateType = "rate_confirmation" | "bill_of_lading";

export type AdminBlankTemplate = {
  /** crm_documents.id — null when no file has ever been uploaded for this
   * template slot yet (nothing to rename). */
  id: string | null;
  docType: AdminBlankTemplateType;
  label: string;
  fileName: string | null;
  storagePath: string | null;
  thumbUrl: string | null;
  createdAt: string | null;
};

/** One card in the Documents tab for an org-level uploaded file (insurance
 * certs, W9s, agreements, anything that isn't tied to a company) —
 * crm_documents rows with kind='org_doc:upload', account_id/deal_id both
 * null, distinct from the two fixed template kinds above so templates and
 * uploads never collide. Unlike AdminBlankTemplate these are user-managed:
 * deletable, no fixed docType/label. */
export type AdminOrgUpload = {
  id: string;
  fileName: string;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
};

export type ActionResult = { ok: true } | { ok: false; error: string };
