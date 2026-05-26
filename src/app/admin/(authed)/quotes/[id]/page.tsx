import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { formatDateFull, relativeTime } from "@/lib/admin/format";

/**
 * Local "Month DD, YYYY" formatter for the OperatorHeader received-at
 * strip. formatDateFull is kept (it's used by event logs and audit
 * trails that need the precise UTC timestamp) — the header just reads
 * better as freight paperwork in the friendly form. Built in UTC so
 * the day doesn't shift around timezones.
 */
function formatReceivedDate(iso: string): string {
  const d = new Date(iso);
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
import {
  LEAD_STATUS_CLASSES_LIGHT,
  LEAD_STATUS_LABELS,
  type LeadStatus,
} from "@/lib/dispatch/status";
import { IconArrowLeft } from "./icons";
import { OperatorHeader, type OperatorHeaderProps } from "./OperatorHeader";
import { QuoteRangeWorkspace } from "./QuoteRangeWorkspace";
import {
  LoadDetailsCard,
  type LoadDetailsInitial,
  type IntakeUploadAdminRow,
} from "./LoadDetailsCard";
import { WorkspaceTabs } from "./WorkspaceTabs";
import {
  DispatchLifecycle,
  type DispatchStageInput,
} from "./DispatchLifecycle";
import {
  FinalizedQuoteWorkspace,
  type FinalizedAccessorialSnapshot,
  type FinalizedQuoteDraftSnapshot,
  type FinalizedQuoteSentSnapshot,
  type FinalizedQuoteState,
} from "./FinalizedQuoteWorkspace";
import {
  BolWorkspace,
  type BolDraftSnapshot,
  type BolSentSnapshot,
  type BolState,
} from "./BolWorkspace";

const INTAKE_BUCKET = "intake-uploads";
/**
 * Signed URLs for admin viewing of customer-uploaded intake docs.
 * 1 hour TTL — long enough for an operator's session, short enough
 * that a copied URL doesn't leak indefinitely. Bucket is private; the
 * signed URL is the only way to reach the bytes.
 */
const UPLOAD_SIGNED_URL_TTL_SECONDS = 60 * 60;

type RawIntakeUpload = {
  id: string;
  original_filename: string;
  mime_type: string;
  size_bytes: string | number;
  note: string | null;
  created_at: string;
  storage_path: string;
  source: "quick_quote" | "customer_intake" | null;
};

async function loadIntakeUploadsForAdmin(
  quoteRequestId: string,
): Promise<IntakeUploadAdminRow[]> {
  const sb = createServiceRoleClient();
  const { data } = await sb
    .from("shipment_intake_uploads")
    .select(
      "id, original_filename, mime_type, size_bytes, note, created_at, storage_path, source",
    )
    .eq("quote_request_id", quoteRequestId)
    .order("created_at", { ascending: false })
    .returns<RawIntakeUpload[]>();

  const rows = data ?? [];
  if (rows.length === 0) return [];

  // Batch-sign all paths. Falls back to per-row null url if the batch
  // call fails — the admin still sees the upload list, just without
  // the open/copy URL.
  const paths = rows.map((r) => r.storage_path);
  const { data: signed } = await sb.storage
    .from(INTAKE_BUCKET)
    .createSignedUrls(paths, UPLOAD_SIGNED_URL_TTL_SECONDS);

  const urlByPath = new Map<string, string | null>();
  if (signed) {
    for (const entry of signed) {
      urlByPath.set(entry.path ?? "", entry.signedUrl ?? null);
    }
  }

  return rows.map((r) => ({
    id: r.id,
    originalFilename: r.original_filename,
    mimeType: r.mime_type,
    sizeBytes:
      typeof r.size_bytes === "number" ? r.size_bytes : Number(r.size_bytes),
    note: r.note,
    createdAt: r.created_at,
    signedUrl: urlByPath.get(r.storage_path) ?? null,
    // Fall back to "customer_intake" for any legacy row whose source
    // column is null (the migration backfills, but the cast is
    // defensive in case a row predates the column rollout).
    source: r.source ?? "customer_intake",
  }));
}

/**
 * Phase REBUILD-2 P1 â quote-detail page.
 *
 * New three-section structure replacing the prior contact-card layout:
 *
 *   Section 1: <OperatorHeader>        â identity + lane + tap-to-call/email
 *   Section 2: <QuoteRangeWorkspace>   â unified range proposal workflow (shell)
 *   Section 3: <LoadDetailsCard>       â auto-fill quote details (existing)
 *
 * Page is a server component that loads quote_requests + the latest
 * shipment_intake, shapes props for each section, and passes them down.
 * No server actions invoked here — those will land in REBUILD-2 P2
 * when the Quote Range Workspace wires its Send / Preview to backend.
 *
 * Preserved infrastructure (not touched in this phase):
 *   - server actions in actions.ts / finalized-quote-actions.ts /
 *     bol-actions.ts / payment-actions.ts
 *   - customer flows in /quote/* and /api/*
 *   - email rendering in src/lib/email
 *   - PDF rendering in src/lib/pdf
 *   - Supabase schema
 */

export const metadata: Metadata = {
  title: "Quote detail",
  robots: { index: false, follow: false },
};

type QuoteDetailRow = {
  id: string;
  created_at: string;
  name: string;
  email: string;
  phone: string;
  commodity: string;
  weight: string;
  pickup_date: string | null;
  pickup_zip: string | null;
  delivery_zip: string | null;
  pickup_city: string | null;
  pickup_state: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  calculated_miles: number | null;
  lead_status: LeadStatus;
  lead_status_updated_at: string | null;
  deleted_at: string | null;
  delete_after: string | null;
};

type IntakeRow = {
  id: string;
  status: "in_progress" | "submitted";
  submitted_at: string | null;
  pickup_company: string | null;
  pickup_contact_name: string | null;
  pickup_contact_phone: string | null;
  pickup_address_line1: string | null;
  pickup_address_line2: string | null;
  pickup_city: string | null;
  pickup_state: string | null;
  pickup_zip: string | null;
  pickup_window: string | null;
  pickup_window_start: string | null;
  pickup_window_end: string | null;
  delivery_company: string | null;
  delivery_contact_name: string | null;
  delivery_contact_phone: string | null;
  delivery_address_line1: string | null;
  delivery_address_line2: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  delivery_zip: string | null;
  delivery_window: string | null;
  delivery_window_start: string | null;
  delivery_window_end: string | null;
  appointment_status: string | null;
  commodity_details: string | null;
  length_in: number | null;
  width_in: number | null;
  height_in: number | null;
  exact_weight_lbs: number | null;
  special_requirements: string | null;
};

// ─── Finalized Quote state loader ────────────────────────────────────────
//
// Resolves the right rendering phase for the Finalized Quote tab. The
// finalized-quote workflow has hard prerequisites (a SENT range estimate
// and a SUBMITTED intake), and a single open draft per estimate; the
// loader collapses every combination into a discriminated union so the
// client workspace can switch cleanly.

type FinalizedQuoteRowForDraft = {
  id: string;
  finalized_quote_number: string;
  sent_at: string | null;
  expiration_at: string | null;
  payment_due_at: string | null;

  pickup_company: string | null;
  pickup_contact_name: string | null;
  pickup_contact_phone: string | null;
  pickup_contact_email: string | null;
  pickup_address_line1: string | null;
  pickup_address_line2: string | null;
  pickup_city: string | null;
  pickup_state: string | null;
  pickup_zip: string | null;
  pickup_window: string | null;
  pickup_loading_hours: string | null;

  delivery_company: string | null;
  delivery_contact_name: string | null;
  delivery_contact_phone: string | null;
  delivery_contact_email: string | null;
  delivery_address_line1: string | null;
  delivery_address_line2: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  delivery_zip: string | null;
  delivery_window: string | null;
  delivery_receiving_hours: string | null;

  commodity: string | null;
  length_in: string | number | null;
  width_in: string | number | null;
  height_in: string | number | null;
  exact_weight_lbs: string | number | null;
  quantity: number | null;
  handling_type: string | null;
  running_condition: string | null;
  securement_requirements: string | null;

  forklift_available: boolean | null;
  driver_assist_required: boolean | null;
  crane_required: boolean | null;
  permits_required: boolean | null;
  escort_required: boolean | null;
  tarp_required: boolean | null;
  special_instructions: string | null;

  linehaul: string | number | null;
  fuel_surcharge: string | number | null;
  permits_fee: string | number | null;
  accessorials: unknown;
  total_amount: string | number | null;

  preview_subject: string | null;
  preview_html: string | null;
  preview_to: string | null;
  preview_built_at: string | null;

  resent_from_id: string | null;
  confirmed_at: string | null;
};

const FINALIZED_QUOTE_COLUMNS =
  "id, finalized_quote_number, sent_at, expiration_at, payment_due_at, pickup_company, pickup_contact_name, pickup_contact_phone, pickup_contact_email, pickup_address_line1, pickup_address_line2, pickup_city, pickup_state, pickup_zip, pickup_window, pickup_loading_hours, delivery_company, delivery_contact_name, delivery_contact_phone, delivery_contact_email, delivery_address_line1, delivery_address_line2, delivery_city, delivery_state, delivery_zip, delivery_window, delivery_receiving_hours, commodity, length_in, width_in, height_in, exact_weight_lbs, quantity, handling_type, running_condition, securement_requirements, forklift_available, driver_assist_required, crane_required, permits_required, escort_required, tarp_required, special_instructions, linehaul, fuel_surcharge, permits_fee, accessorials, total_amount, preview_subject, preview_html, preview_to, preview_built_at, resent_from_id, confirmed_at";

function coerceNum(v: string | number | null): number | null {
  if (v == null) return null;
  const num = typeof v === "number" ? v : Number(v);
  return Number.isFinite(num) ? num : null;
}

function fieldString(v: string | null): string {
  return v ?? "";
}

function fieldNumString(v: string | number | null): string {
  const n = coerceNum(v);
  if (n === null) return "";
  return Number.isInteger(n) ? String(n) : String(n);
}

function fieldMoneyString(v: string | number | null): string {
  const n = coerceNum(v);
  if (n === null || n === 0) return "";
  return String(n);
}

function fieldTri(v: boolean | null): "" | "yes" | "no" {
  if (v === true) return "yes";
  if (v === false) return "no";
  return "";
}

function parseAccessorialsJson(v: unknown): FinalizedAccessorialSnapshot[] {
  if (!Array.isArray(v)) return [];
  const out: FinalizedAccessorialSnapshot[] = [];
  for (const entry of v) {
    if (entry && typeof entry === "object") {
      const e = entry as Record<string, unknown>;
      const label =
        typeof e.label === "string" ? e.label : null;
      const amountRaw = e.amount;
      const amount =
        typeof amountRaw === "number"
          ? amountRaw
          : typeof amountRaw === "string"
            ? Number(amountRaw)
            : NaN;
      if (label !== null && Number.isFinite(amount)) {
        out.push({ label, amount });
      }
    }
  }
  return out;
}

function rowToDraftSnapshot(
  row: FinalizedQuoteRowForDraft,
  recipientEmail: string,
): FinalizedQuoteDraftSnapshot {
  return {
    id: row.id,
    finalizedQuoteNumber: row.finalized_quote_number,
    recipientEmail,
    expirationAt: row.expiration_at,
    paymentDueAt: row.payment_due_at,
    pickup: {
      company: fieldString(row.pickup_company),
      contactName: fieldString(row.pickup_contact_name),
      contactPhone: fieldString(row.pickup_contact_phone),
      contactEmail: fieldString(row.pickup_contact_email),
      addressLine1: fieldString(row.pickup_address_line1),
      addressLine2: fieldString(row.pickup_address_line2),
      city: fieldString(row.pickup_city),
      state: fieldString(row.pickup_state),
      zip: fieldString(row.pickup_zip),
      window: fieldString(row.pickup_window),
      loadingHours: fieldString(row.pickup_loading_hours),
    },
    delivery: {
      company: fieldString(row.delivery_company),
      contactName: fieldString(row.delivery_contact_name),
      contactPhone: fieldString(row.delivery_contact_phone),
      contactEmail: fieldString(row.delivery_contact_email),
      addressLine1: fieldString(row.delivery_address_line1),
      addressLine2: fieldString(row.delivery_address_line2),
      city: fieldString(row.delivery_city),
      state: fieldString(row.delivery_state),
      zip: fieldString(row.delivery_zip),
      window: fieldString(row.delivery_window),
      receivingHours: fieldString(row.delivery_receiving_hours),
    },
    freight: {
      commodity: fieldString(row.commodity),
      lengthIn: fieldNumString(row.length_in),
      widthIn: fieldNumString(row.width_in),
      heightIn: fieldNumString(row.height_in),
      exactWeightLbs: fieldNumString(row.exact_weight_lbs),
      quantity: row.quantity === null ? "" : String(row.quantity),
      handlingType: fieldString(row.handling_type),
      runningCondition: fieldString(row.running_condition),
      securementRequirements: fieldString(row.securement_requirements),
    },
    ops: {
      forkliftAvailable: fieldTri(row.forklift_available),
      driverAssistRequired: fieldTri(row.driver_assist_required),
      craneRequired: fieldTri(row.crane_required),
      permitsRequired: fieldTri(row.permits_required),
      escortRequired: fieldTri(row.escort_required),
      tarpRequired: fieldTri(row.tarp_required),
      specialInstructions: fieldString(row.special_instructions),
    },
    pricing: {
      linehaul: fieldMoneyString(row.linehaul),
      fuelSurcharge: fieldMoneyString(row.fuel_surcharge),
      permitsFee: fieldMoneyString(row.permits_fee),
      accessorials: parseAccessorialsJson(row.accessorials),
    },
    previewBuiltAt: row.preview_built_at,
    previewHtml: row.preview_html,
    previewSubject: row.preview_subject,
    previewTo: row.preview_to,
  };
}

function rowToSentSnapshot(
  row: FinalizedQuoteRowForDraft,
  fallbackRecipient: string,
): FinalizedQuoteSentSnapshot {
  return {
    id: row.id,
    finalizedQuoteNumber: row.finalized_quote_number,
    totalAmount: coerceNum(row.total_amount),
    sentAt: row.sent_at ?? "",
    recipientEmail: row.preview_to ?? fallbackRecipient,
    expirationAt: row.expiration_at,
    paymentDueAt: row.payment_due_at,
    previewHtml: row.preview_html,
    previewSubject: row.preview_subject,
    resentFromId: row.resent_from_id,
    confirmedAt: row.confirmed_at,
  };
}

async function loadFinalizedQuoteState(
  quoteRequestId: string,
  recipientEmail: string,
): Promise<FinalizedQuoteState> {
  const sb = createServiceRoleClient();

  // 1) Most recent SENT estimate (gate for the finalized-quote workflow).
  const { data: estimate } = await sb
    .from("dispatch_estimates")
    .select("id, sent_at")
    .eq("quote_request_id", quoteRequestId)
    .not("sent_at", "is", null)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; sent_at: string | null }>();

  if (!estimate) {
    return { phase: "no_sent_estimate" };
  }

  // 2) The intake for that estimate. Existing draft or sent FQ can short-
  //    circuit past this check — once the workflow is underway the intake
  //    snapshot is already captured on the FQ row, so a status change on
  //    the intake should not yank the operator out of the composer.
  const { data: anyFq } = await sb
    .from("finalized_quotes")
    .select(FINALIZED_QUOTE_COLUMNS)
    .eq("quote_request_id", quoteRequestId)
    .order("created_at", { ascending: false })
    .returns<FinalizedQuoteRowForDraft[]>();

  const rows = anyFq ?? [];
  const draftRow = rows.find((r) => r.sent_at === null) ?? null;
  const sentRow = rows.find((r) => r.sent_at !== null) ?? null;

  if (draftRow) {
    return {
      phase: "draft",
      draft: rowToDraftSnapshot(draftRow, recipientEmail),
    };
  }

  if (sentRow) {
    return {
      phase: "sent",
      sent: rowToSentSnapshot(sentRow, recipientEmail),
    };
  }

  const { data: intake } = await sb
    .from("shipment_intake")
    .select("status")
    .eq("dispatch_estimate_id", estimate.id)
    .maybeSingle<{ status: "in_progress" | "submitted" }>();

  if (!intake) {
    return { phase: "intake_not_submitted", intakeStatus: "missing" };
  }
  if (intake.status !== "submitted") {
    return { phase: "intake_not_submitted", intakeStatus: "in_progress" };
  }

  return { phase: "ready_to_generate" };
}

// ─── Bill of Lading state loader ─────────────────────────────────────────
//
// BOL is gated by a SENT finalized_quote — the BOL inherits its scope
// from the rate confirmation that committed the freight. Phase resolution
// rule: any draft row wins over any sent row; either short-circuits past
// the gating check so a downstream change on the FQ cannot pull the
// operator out of the BOL composer.

type BolRowForDraft = {
  id: string;
  bol_number: string;
  sent_at: string | null;
  dispatch_reference: string | null;
  issue_date: string | null;

  shipper_company: string | null;
  shipper_contact_name: string | null;
  shipper_contact_phone: string | null;
  shipper_contact_email: string | null;
  shipper_address_line1: string | null;
  shipper_address_line2: string | null;
  shipper_city: string | null;
  shipper_state: string | null;
  shipper_zip: string | null;
  pickup_window: string | null;
  pickup_instructions: string | null;

  consignee_company: string | null;
  consignee_contact_name: string | null;
  consignee_contact_phone: string | null;
  consignee_contact_email: string | null;
  consignee_address_line1: string | null;
  consignee_address_line2: string | null;
  consignee_city: string | null;
  consignee_state: string | null;
  consignee_zip: string | null;
  delivery_window: string | null;
  delivery_instructions: string | null;

  commodity: string | null;
  quantity: number | null;
  handling_units_type: string | null;
  length_in: string | number | null;
  width_in: string | number | null;
  height_in: string | number | null;
  weight_lbs: string | number | null;
  nmfc_code: string | null;
  freight_class: string | null;
  hazmat: boolean | null;
  special_handling: string | null;

  driver_assist_required: boolean | null;
  tarp_required: boolean | null;
  permits_required: boolean | null;
  escort_required: boolean | null;
  rigging_required: boolean | null;
  appointment_required: boolean | null;
  special_instructions: string | null;

  dispatch_notes: string | null;

  preview_subject: string | null;
  preview_html: string | null;
  preview_to: string | null;
  preview_built_at: string | null;

  resent_from_id: string | null;
};

const BOL_COLUMNS =
  "id, bol_number, sent_at, dispatch_reference, issue_date, shipper_company, shipper_contact_name, shipper_contact_phone, shipper_contact_email, shipper_address_line1, shipper_address_line2, shipper_city, shipper_state, shipper_zip, pickup_window, pickup_instructions, consignee_company, consignee_contact_name, consignee_contact_phone, consignee_contact_email, consignee_address_line1, consignee_address_line2, consignee_city, consignee_state, consignee_zip, delivery_window, delivery_instructions, commodity, quantity, handling_units_type, length_in, width_in, height_in, weight_lbs, nmfc_code, freight_class, hazmat, special_handling, driver_assist_required, tarp_required, permits_required, escort_required, rigging_required, appointment_required, special_instructions, dispatch_notes, preview_subject, preview_html, preview_to, preview_built_at, resent_from_id";

function bolRowToDraftSnapshot(
  row: BolRowForDraft,
  recipientEmail: string,
): BolDraftSnapshot {
  return {
    id: row.id,
    bolNumber: row.bol_number,
    recipientEmail,
    dispatchReference: fieldString(row.dispatch_reference),
    issueDate: row.issue_date ?? "",
    shipper: {
      company: fieldString(row.shipper_company),
      contactName: fieldString(row.shipper_contact_name),
      contactPhone: fieldString(row.shipper_contact_phone),
      contactEmail: fieldString(row.shipper_contact_email),
      addressLine1: fieldString(row.shipper_address_line1),
      addressLine2: fieldString(row.shipper_address_line2),
      city: fieldString(row.shipper_city),
      state: fieldString(row.shipper_state),
      zip: fieldString(row.shipper_zip),
      pickupWindow: fieldString(row.pickup_window),
      pickupInstructions: fieldString(row.pickup_instructions),
    },
    consignee: {
      company: fieldString(row.consignee_company),
      contactName: fieldString(row.consignee_contact_name),
      contactPhone: fieldString(row.consignee_contact_phone),
      contactEmail: fieldString(row.consignee_contact_email),
      addressLine1: fieldString(row.consignee_address_line1),
      addressLine2: fieldString(row.consignee_address_line2),
      city: fieldString(row.consignee_city),
      state: fieldString(row.consignee_state),
      zip: fieldString(row.consignee_zip),
      deliveryWindow: fieldString(row.delivery_window),
      deliveryInstructions: fieldString(row.delivery_instructions),
    },
    freight: {
      commodity: fieldString(row.commodity),
      quantity: row.quantity === null ? "" : String(row.quantity),
      handlingUnitsType: fieldString(row.handling_units_type),
      lengthIn: fieldNumString(row.length_in),
      widthIn: fieldNumString(row.width_in),
      heightIn: fieldNumString(row.height_in),
      weightLbs: fieldNumString(row.weight_lbs),
      nmfcCode: fieldString(row.nmfc_code),
      freightClass: fieldString(row.freight_class),
      hazmat: row.hazmat === true,
      specialHandling: fieldString(row.special_handling),
    },
    ops: {
      driverAssistRequired: row.driver_assist_required === true,
      tarpRequired: row.tarp_required === true,
      permitsRequired: row.permits_required === true,
      escortRequired: row.escort_required === true,
      riggingRequired: row.rigging_required === true,
      appointmentRequired: row.appointment_required === true,
      specialInstructions: fieldString(row.special_instructions),
    },
    dispatchNotes: fieldString(row.dispatch_notes),
    previewBuiltAt: row.preview_built_at,
    previewHtml: row.preview_html,
    previewSubject: row.preview_subject,
    previewTo: row.preview_to,
  };
}

function bolRowToSentSnapshot(
  row: BolRowForDraft,
  fallbackRecipient: string,
): BolSentSnapshot {
  return {
    id: row.id,
    bolNumber: row.bol_number,
    sentAt: row.sent_at ?? "",
    recipientEmail: row.preview_to ?? fallbackRecipient,
    dispatchReference: row.dispatch_reference,
    issueDate: row.issue_date,
    previewHtml: row.preview_html,
    previewSubject: row.preview_subject,
    resentFromId: row.resent_from_id,
  };
}

async function loadBolState(
  quoteRequestId: string,
  recipientEmail: string,
): Promise<BolState> {
  const sb = createServiceRoleClient();

  // 1) Pull every BOL row for this lead so we can resolve draft / sent
  //    without re-issuing queries.
  const { data: bolRows } = await sb
    .from("bills_of_lading")
    .select(BOL_COLUMNS)
    .eq("quote_request_id", quoteRequestId)
    .order("created_at", { ascending: false })
    .returns<BolRowForDraft[]>();

  const rows = bolRows ?? [];
  const draftRow = rows.find((r) => r.sent_at === null) ?? null;
  const sentRow = rows.find((r) => r.sent_at !== null) ?? null;

  if (draftRow) {
    return {
      phase: "draft",
      draft: bolRowToDraftSnapshot(draftRow, recipientEmail),
    };
  }

  if (sentRow) {
    return {
      phase: "sent",
      sent: bolRowToSentSnapshot(sentRow, recipientEmail),
    };
  }

  // 2) No BOL rows yet. Gate by a sent finalized_quote.
  const { data: sentFq } = await sb
    .from("finalized_quotes")
    .select("id")
    .eq("quote_request_id", quoteRequestId)
    .not("sent_at", "is", null)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (!sentFq) {
    return { phase: "no_sent_finalized_quote" };
  }

  return { phase: "ready_to_generate" };
}

async function loadQuoteRequest(id: string): Promise<QuoteDetailRow | null> {
  const sb = createServiceRoleClient();
  const { data } = await sb
    .from("quote_requests")
    .select(
      "id, created_at, name, email, phone, commodity, weight, pickup_date, pickup_zip, delivery_zip, pickup_city, pickup_state, delivery_city, delivery_state, calculated_miles, lead_status, lead_status_updated_at, deleted_at, delete_after",
    )
    .eq("id", id)
    .maybeSingle<QuoteDetailRow>();
  return data ?? null;
}

async function loadLatestIntake(
  quoteRequestId: string,
): Promise<IntakeRow | null> {
  const sb = createServiceRoleClient();
  const { data: est } = await sb
    .from("dispatch_estimates")
    .select("id")
    .eq("quote_request_id", quoteRequestId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (!est) return null;

  const { data: intake } = await sb
    .from("shipment_intake")
    .select(
      "id, status, submitted_at, pickup_company, pickup_contact_name, pickup_contact_phone, pickup_address_line1, pickup_address_line2, pickup_city, pickup_state, pickup_zip, pickup_window, pickup_window_start, pickup_window_end, delivery_company, delivery_contact_name, delivery_contact_phone, delivery_address_line1, delivery_address_line2, delivery_city, delivery_state, delivery_zip, delivery_window, delivery_window_start, delivery_window_end, appointment_status, commodity_details, length_in, width_in, height_in, exact_weight_lbs, special_requirements",
    )
    .eq("dispatch_estimate_id", est.id)
    .maybeSingle<IntakeRow>();
  return intake ?? null;
}

// âââ Field-merge helpers (intake first, Quick Quote fallback) ââââââââ

function pickString(...candidates: Array<string | null | undefined>): string {
  for (const c of candidates) {
    if (c != null && c !== "") return c;
  }
  return "";
}

function joinAddress(
  a: string | null | undefined,
  b: string | null | undefined,
): string {
  const out: string[] = [];
  if (a && a.trim()) out.push(a.trim());
  if (b && b.trim()) out.push(b.trim());
  return out.join(", ");
}

function formatCityStateZip(
  city: string | null | undefined,
  state: string | null | undefined,
  zip: string | null | undefined,
): string {
  if (city && state && zip) return `${city}, ${state} ${zip}`;
  if (city && state) return `${city}, ${state}`;
  if (zip) return zip;
  return "";
}

function formatWeight(
  lbs: number | null | undefined,
  fallback: string | null | undefined,
): string {
  if (lbs != null && Number.isFinite(lbs)) {
    return `${Math.round(Number(lbs)).toLocaleString()} lbs`;
  }
  return fallback ?? "";
}

function formatDimensions(
  l: number | null | undefined,
  w: number | null | undefined,
  h: number | null | undefined,
): string {
  if (l == null || w == null || h == null) return "";
  const fmt = (n: number) => {
    const num = Number(n);
    return Number.isInteger(num) ? String(num) : num.toFixed(1);
  };
  return `${fmt(l)}″ × ${fmt(w)}″ × ${fmt(h)}″`;
}

/**
 * Convert the stored appointment_status code (snake_case) into the
 * friendly text the admin Load Details row shows. Returns "" when the
 * customer hasn't answered — the row then renders as "Appointment: —".
 *
 * Keep in sync with APPOINTMENT_STATUS_OPTIONS in
 * src/app/quote/accept/[token]/intake-fields.tsx.
 */
function friendlyAppointmentStatus(code: string | null | undefined): string {
  switch (code) {
    case "flexible":
      return "Flexible";
    case "appointment_needed":
      return "Appointment needed";
    case "already_scheduled":
      return "Already scheduled";
    case "call_to_schedule":
      return "Call me to schedule";
    default:
      return "";
  }
}

function computeInitialValues(
  row: QuoteDetailRow,
  intake: IntakeRow | null,
): LoadDetailsInitial {
  return {
    pickup_company: pickString(intake?.pickup_company),
    pickup_address: joinAddress(
      intake?.pickup_address_line1,
      intake?.pickup_address_line2,
    ),
    pickup_city_zip: formatCityStateZip(
      pickString(intake?.pickup_city, row.pickup_city),
      pickString(intake?.pickup_state, row.pickup_state),
      pickString(intake?.pickup_zip, row.pickup_zip),
    ),
    pickup_contact: pickString(intake?.pickup_contact_name),
    pickup_phone: pickString(intake?.pickup_contact_phone),
    // Prefer the new typed start column when present; fall back to the
    // legacy text column (always a YYYY-MM-DD for intakes submitted via
    // the old single-date UI) and finally to the original Quick Quote
    // pickup_date. The display only shows what's set — no synthesis.
    pickup_window: pickString(
      intake?.pickup_window_start,
      intake?.pickup_window,
      row.pickup_date,
    ),
    pickup_window_end: pickString(intake?.pickup_window_end),

    delivery_company: pickString(intake?.delivery_company),
    delivery_address: joinAddress(
      intake?.delivery_address_line1,
      intake?.delivery_address_line2,
    ),
    delivery_city_zip: formatCityStateZip(
      pickString(intake?.delivery_city, row.delivery_city),
      pickString(intake?.delivery_state, row.delivery_state),
      pickString(intake?.delivery_zip, row.delivery_zip),
    ),
    delivery_contact: pickString(intake?.delivery_contact_name),
    delivery_phone: pickString(intake?.delivery_contact_phone),
    delivery_window: pickString(
      intake?.delivery_window_start,
      intake?.delivery_window,
    ),
    delivery_window_end: pickString(intake?.delivery_window_end),
    appointment_status: friendlyAppointmentStatus(intake?.appointment_status),

    freight_commodity: pickString(intake?.commodity_details, row.commodity),
    freight_weight: formatWeight(intake?.exact_weight_lbs, row.weight),
    freight_pieces: "",
    freight_dimensions: formatDimensions(
      intake?.length_in,
      intake?.width_in,
      intake?.height_in,
    ),
    freight_hazmat: "",
    freight_handling: pickString(intake?.special_requirements),
  };
}

function intakeStatusMessage(intake: IntakeRow | null): string {
  if (!intake) return "Awaiting customer intake";
  if (intake.status === "submitted" && intake.submitted_at) {
    return `Intake submitted ${relativeTime(intake.submitted_at)}`;
  }
  return "Intake in progress";
}

function laneLabel(
  city: string | null,
  state: string | null,
  zip: string | null,
): string {
  if (city && state) return `${city}, ${state}`;
  return zip ?? "—";
}

function shortRequestId(uuid: string): string {
  const hex = uuid.replace(/-/g, "");
  if (hex.length < 8) return uuid;
  return hex.slice(0, 8);
}

function buildOperatorHeaderProps(row: QuoteDetailRow): OperatorHeaderProps {
  return {
    customer: {
      name: row.name,
      phone: row.phone,
      email: row.email,
    },
    identity: {
      requestId: shortRequestId(row.id),
      requestIdFull: row.id,
      receivedRelative: relativeTime(row.created_at),
      receivedFull: formatReceivedDate(row.created_at),
      statusLabel:
        LEAD_STATUS_LABELS[row.lead_status] ??
        String(row.lead_status).replace(/_/g, " "),
      statusPillClasses:
        LEAD_STATUS_CLASSES_LIGHT[row.lead_status] ??
        "border-zinc-300 bg-zinc-100 text-black",
    },
    lane: {
      pickupLabel: laneLabel(row.pickup_city, row.pickup_state, row.pickup_zip),
      deliveryLabel: laneLabel(
        row.delivery_city,
        row.delivery_state,
        row.delivery_zip,
      ),
      pickupZip: row.pickup_zip,
      deliveryZip: row.delivery_zip,
      miles: row.calculated_miles ?? null,
      hasLane: Boolean(row.pickup_zip && row.delivery_zip),
    },
  };
}

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const row = await loadQuoteRequest(id);
  if (!row) notFound();

  const intake = await loadLatestIntake(id);
  const initialValues = computeInitialValues(row, intake);
  const statusMessage = intakeStatusMessage(intake);
  const intakeUploads = await loadIntakeUploadsForAdmin(row.id);
  const intakeSnapshotKey = intake
    ? `${intake.id}:${intake.status}:${intake.submitted_at ?? ""}`
    : "no_intake";
  const finalizedQuoteState = await loadFinalizedQuoteState(row.id, row.email);
  const bolState = await loadBolState(row.id, row.email);

  // Phase 3B — derive the operational lifecycle from data we already
  // loaded. The strip is a presentation layer over existing artifact
  // state; no new queries and no new lead_status values. The estimate
  // is implicitly sent when an intake row exists (the customer can
  // only reach the intake page through a token-gated estimate accept
  // link), so intake existence stands in for "range proposal sent."
  const lifecycleState: DispatchStageInput = {
    estimateSent: intake !== null,
    intakeSubmitted: intake?.status === "submitted",
    finalizedQuoteSent:
      finalizedQuoteState.phase === "sent" ||
      finalizedQuoteState.phase === "draft",
    finalizedQuoteConfirmed:
      finalizedQuoteState.phase === "sent" &&
      finalizedQuoteState.sent.confirmedAt !== null,
    bolGenerated:
      bolState.phase === "draft" || bolState.phase === "sent",
    bolSent: bolState.phase === "sent",
  };

  const isTrashed = Boolean(row.deleted_at);
  const headerProps = buildOperatorHeaderProps(row);

  return (
    <div className="mx-auto max-w-3xl space-y-2 px-4 py-5 sm:px-6 sm:py-7 lg:px-8 lg:py-8">
      {/* Back link */}
      <Link
        href={isTrashed ? "/admin/quotes/trash" : "/admin/quotes"}
        prefetch={false}
        className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-black transition-opacity hover:opacity-70"
      >
        <IconArrowLeft className="h-4 w-4 shrink-0" />
        Back to {isTrashed ? "trash" : "quotes"}
      </Link>

      {/* Trash banner */}
      {isTrashed ? (
        <div className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-4">
          <span
            aria-hidden
            className="mt-0.5 inline-block h-3 w-1 shrink-0 bg-red-600"
          />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
              In trash
            </p>
            <p className="mt-1 text-sm leading-relaxed text-red-800">
              Moved to trash {relativeTime(row.deleted_at!)}.{" "}
              {row.delete_after ? (
                <>
                  Auto-purge on{" "}
                  <span className="font-mono text-red-800">
                    {formatDateFull(row.delete_after)}
                  </span>
                  .
                </>
              ) : null}
            </p>
          </div>
        </div>
      ) : null}

      {/* Operator Header (above the tabs) */}
      <OperatorHeader {...headerProps} />

      {/* Phase 3B — Dispatch lifecycle strip. Aggregates artifact state
          (estimate / intake / FQ / confirmed / BOL) into one row so the
          operator knows where the shipment is and what the next move
          is without clicking through every tab. */}
      <DispatchLifecycle state={lifecycleState} />

      {/* Tabbed workspace */}
      <WorkspaceTabs
        quoteRangeContent={
          <QuoteRangeWorkspace
            quoteRequestId={row.id}
            miles={row.calculated_miles}
          />
        }
        loadDetailsContent={
          <LoadDetailsCard
            key={intakeSnapshotKey}
            initial={initialValues}
            intakeStatusMessage={statusMessage}
            uploads={intakeUploads}
          />
        }
        finalizedQuoteContent={
          <FinalizedQuoteWorkspace
            quoteRequestId={row.id}
            state={finalizedQuoteState}
          />
        }
        bolContent={
          <BolWorkspace quoteRequestId={row.id} state={bolState} />
        }
      />
    </div>
  );
}
