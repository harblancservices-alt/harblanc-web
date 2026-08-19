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

/** One card in the Operational Documents library — every Rate Confirmation
 * or Bill of Lading generated across every shipment (crm_rate_confirmations /
 * crm_bills_of_lading, joined back to their parent crm_shipments + the
 * uploader's crm_profiles row). "pod" is a real filter option (matching the
 * approved mockup's RateCon/BOL/POD chip set) but the CRM has no POD source
 * of its own yet — proof-of-delivery only exists in tms-v2, which this
 * feature must never import from — so it never actually appears; see this
 * file's header note in documents-data.ts. */
export type AdminDocumentType = "rate_confirmation" | "bill_of_lading" | "pod";

export type AdminDocumentCard = {
  id: string;
  docType: AdminDocumentType;
  number: string;
  status: string;
  createdAt: string;
  shipmentId: string;
  shipmentNumber: string | null;
  companyId: string | null;
  companyName: string | null;
  uploadedById: string | null;
  uploadedByName: string | null;
  pdfStoragePath: string | null;
  thumbUrl: string | null;
};

export type ActionResult = { ok: true } | { ok: false; error: string };
