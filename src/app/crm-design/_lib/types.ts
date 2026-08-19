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
