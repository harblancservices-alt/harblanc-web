/**
 * Types for the CRM redesign prototype. Deliberately independent of the
 * real CRM's Supabase row shapes (crm_accounts, crm_contacts, ...) — this
 * is presentation-layer mock data, not a schema proposal.
 */

export type LifecycleStage =
  | "new_lead"
  | "contacted"
  | "qualified"
  | "quoted"
  | "negotiating"
  | "won"
  | "active_customer"
  | "lost";

export type UserRole = "owner" | "admin" | "agent";

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  title: string;
  role: UserRole;
  isPrimaryOwner: boolean;
  isActive: boolean;
  canViewAllCompanies: boolean;
  companiesOwned: number;
  openTasks: number;
  lastActiveAt: string; // ISO
  createdAt: string; // ISO
};

export type Company = {
  id: string;
  name: string;
  industry: string;
  city: string;
  state: string;
  stage: LifecycleStage;
  assignedUserId: string;
  phone: string;
  website: string;
  fitRating: 1 | 2 | 3 | 4 | 5;
  tags: string[];
  lastContactAt: string | null; // ISO
  createdAt: string; // ISO
  annualFreightSpend: string;
  primaryContactId: string | null;
  notes: string;
};

export type Contact = {
  id: string;
  companyId: string | null;
  name: string;
  title: string;
  email: string;
  phone: string;
  isDecisionMaker: boolean;
  lastContactedAt: string | null;
  nextFollowupAt: string | null;
};

export type ActivityKind = "call" | "note" | "email" | "stage_change" | "task" | "document";

export type ActivityItem = {
  id: string;
  kind: ActivityKind;
  companyId: string | null;
  contactId: string | null;
  authorId: string;
  title: string;
  body: string | null;
  occurredAt: string; // ISO
};

export type AuditAction =
  | "role_changed"
  | "user_suspended"
  | "user_reactivated"
  | "visibility_changed"
  | "user_invited"
  | "company_reassigned"
  | "org_settings_changed";

export type AuditLogItem = {
  id: string;
  action: AuditAction;
  actorId: string;
  targetUserId: string | null;
  targetCompanyId: string | null;
  summary: string; // "John changed Acme Logistics from Active to Suspended"
  detail: string | null;
  occurredAt: string; // ISO
};

export type DocType = "rate_confirmation" | "bill_of_lading";

export type CompanyDocument = {
  id: string;
  companyId: string;
  type: DocType;
  label: string;
  createdAt: string;
  createdByUserId: string;
  status: "draft" | "sent" | "signed";
};

export type TaskItem = {
  id: string;
  title: string;
  companyId: string | null;
  contactId: string | null;
  assignedUserId: string;
  dueAt: string | null;
  priority: "low" | "normal" | "high";
  status: "open" | "done";
};

/**
 * BOL Center — an admin-only intake/intelligence funnel, entirely separate
 * from the sales pipeline (Company.stage). Nothing here is a Company/Contact/
 * Task/pipeline record: a BolRecord only ever produces one when an admin
 * explicitly releases it (see store.releaseBolToSales). Uploading 400 of
 * these creates 400 BolRecords and zero companies/opportunities.
 */
export type BolStatus =
  | "new"
  | "needs_review"
  | "ai_extracted"
  | "researching"
  | "ready_for_approval"
  | "approved"
  | "rejected"
  | "archived";

export type ExtractConfidence = "high" | "review";

/** One extracted field — the AI's guess is never silently authoritative:
 * `corrected` flips true the moment an admin overrides `value` by hand. */
export type ExtractedField = {
  value: string;
  confidence: ExtractConfidence;
  corrected: boolean;
};

export type BolExtraction = {
  customerName: ExtractedField;
  shipperName: ExtractedField;
  consigneeName: ExtractedField;
  brokerName: ExtractedField;
  carrierName: ExtractedField;
  pickupAddress: ExtractedField;
  pickupCity: ExtractedField;
  pickupState: ExtractedField;
  deliveryAddress: ExtractedField;
  deliveryCity: ExtractedField;
  deliveryState: ExtractedField;
  commodity: ExtractedField;
  weight: ExtractedField;
  pickupDate: ExtractedField;
  deliveryDate: ExtractedField;
  referenceNumber: ExtractedField;
  /** Optional — most BOLs don't carry a bill-to distinct from shipper/
   * consignee, but some do (freight paid by a third party, e.g. the
   * consignee's corporate AP office rather than the receiving warehouse
   * itself). Only rendered when present, and always kept visually distinct
   * from shipper/consignee — see bol-center/[id]/page.tsx's Extraction tab. */
  billToName?: ExtractedField;
  billToAddress?: ExtractedField;
  /** Optional — a proof-of-delivery signature, almost always handwritten
   * (confidence "review" in practice) and thus a different kind of field
   * than the printed/typed ones above. */
  receivedBySignature?: ExtractedField;
};

/** Detected people/orgs on the BOL — deliberately separate from `Contact`
 * (the real CRM contact book): a broker or carrier named on a BOL is not a
 * CRM contact until/unless an admin decides it should be. "bill_to_contact"
 * covers the (uncommon) case where the paying party is a distinct company
 * from both shipper and consignee — never conflated with either. */
export type BolContactRole = "shipper_contact" | "consignee_contact" | "bill_to_contact" | "broker" | "carrier";
export type BolContact = {
  role: BolContactRole;
  name: string;
  company: string;
  phone: string;
  email: string;
};

export type BolLocationRole = "pickup" | "delivery";
export type BolLocationCandidate = {
  role: BolLocationRole;
  address: string;
  city: string;
  state: string;
  matchStatus: "existing" | "new";
  matchedLocationId: string | null;
};

export type CustomerMatchStatus = "matched" | "potential_new" | "confirmed_new";

/** What Admin chooses to hand Sales at release time — a checkbox per field
 * group, not an all-or-nothing dump of the BOL record. */
export type BolReleaseSelection = {
  company: boolean;
  locations: boolean;
  generalContact: boolean;
  observedFreight: boolean;
  observedLanes: boolean;
  salesNotes: boolean;
  originalBol: boolean;
  internalResearch: boolean;
  sensitiveInfo: boolean;
  rawExtractedData: boolean;
};

export type BolRecord = {
  id: string;
  docNumber: string;
  fileName: string;
  uploadedAt: string;
  uploadedByUserId: string;
  status: BolStatus;
  assignedReviewerId: string | null;
  /** Real scanned page images, when one exists (a small handful of seed
   * records use an actual uploaded scan rather than the reconstructed mock
   * "photo" every other seed BOL renders — see BolDocumentViewer.tsx). Every
   * other record leaves this unset and falls back to the mock reconstruction
   * built from `extraction`, same as before. */
  scanPages?: { label: string; url: string }[];
  extraction: BolExtraction;
  contacts: BolContact[];
  locations: BolLocationCandidate[];
  customerMatch: { status: CustomerMatchStatus; companyId: string | null; candidateName: string };
  research: {
    notes: string;
    observedFreight: string[];
    observedLanes: string[];
    salesRelevance: "high" | "medium" | "low" | null;
  };
  /** Non-null the moment Admin clicks "Release to Sales" — separate from
   * `status === "approved"` on purpose (approval and release are different
   * decisions; an approved BOL can sit un-released indefinitely). */
  release: { releasedAt: string; releasedByUserId: string; selection: BolReleaseSelection } | null;
};

/**
 * A customer's known pickup/delivery location, sourced either manually or
 * from a released BOL. This is the "Customer → Locations" architecture the
 * BOL Center's Location Review step connects to (CRM_PROTOTYPE_MAP.md).
 */
export type CompanyLocation = {
  id: string;
  companyId: string;
  label: string;
  address: string;
  city: string;
  state: string;
  role: "pickup" | "delivery" | "both";
  source: "manual" | "bol";
  firstObservedAt: string;
  lastObservedAt: string;
  bolCount: number;
};
