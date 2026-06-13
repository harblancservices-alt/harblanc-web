import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { formatDateFull, formatDateShort, relativeTime } from "@/lib/admin/format";
import { estimateLaneMiles, lookupZip } from "@/lib/dispatch/distance";

/**
 * "Month DD, YYYY · HH:MM" formatter for the received-at line on the
 * Overview tab's Received card. Built in UTC so the day doesn't shift
 * around timezones; HH:MM is also UTC for the same reason.
 */
function formatReceivedDate(iso: string): string {
  const d = new Date(iso);
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const date = `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${date} · ${hh}:${mm}`;
}
import {
  LEAD_STATUS_CLASSES_LIGHT,
  LEAD_STATUS_LABELS,
  type LeadStatus,
} from "@/lib/dispatch/status";
import { LoadWorkspaceV2 } from "./LoadWorkspaceV2";
import { describeEvent } from "./tabs/TimelineTab";
import { ActivityRun } from "./ActivityRun";
import { formatLoadRate, nextAction } from "@/lib/dispatch/loads-view";
import { AttachmentsList } from "./AttachmentsList";
import {
  computeStageStates,
  headlineFromStates,
} from "./DispatchLifecycle";
// Level 5 wire-up: components for the old quote-detail surface are no
// longer rendered directly from this file. Their types stay imported
// because the loaders below still produce those shapes and the new V3
// tab bodies consume them. The old components themselves are mounted
// inside the new tab wrappers (PricingTab, DocumentsTab) or are kept on
// disk for a later cleanup pass (OperatorHeader, WorkspaceTabs,
// LoadDetailsCard, DispatchLifecycle direct render).
import { type OperatorHeaderProps } from "./OperatorHeader";
import {
  type LoadDetailsInitial,
  type IntakeUploadAdminRow,
} from "./LoadDetailsCard";
import { type DispatchStageInput } from "./DispatchLifecycle";
import {
  type FinalizedAccessorialSnapshot,
  type FinalizedQuoteDraftSnapshot,
  type FinalizedQuoteSentSnapshot,
  type FinalizedQuoteState,
} from "./FinalizedQuoteWorkspace";
import {
  type BolDraftSnapshot,
  type BolSentSnapshot,
  type BolState,
} from "./BolWorkspace";

// V3 surface
import { QuoteHero } from "./QuoteHero";
import { OverviewTab } from "./tabs/OverviewTab";
import { DetailsTab } from "./tabs/DetailsTab";
import { type SentDocumentRow } from "./tabs/DocumentsTab";
import { PricingTab } from "./tabs/PricingTab";
import { DocumentsTab } from "./tabs/DocumentsTab";
import { type TimelineEventRow } from "./tabs/TimelineTab";

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
  /** Operator-side Load Details edits, layered over intake + Quick
   *  Quote at render time. Null when the operator has never saved,
   *  and also null right after the customer submits intake (the
   *  submit action clears the override so the customer's data wins). */
  load_details_overrides: Record<string, string> | null;
  /** Customer-typed "Anything else?" notes from the public Quick Quote
   *  form. Stored on insert; surfaced in the admin quote page as a
   *  dedicated Customer-notes card so dispatch sees the context. */
  notes: string | null;
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
      "id, created_at, name, email, phone, commodity, weight, pickup_date, pickup_zip, delivery_zip, pickup_city, pickup_state, delivery_city, delivery_state, calculated_miles, lead_status, lead_status_updated_at, deleted_at, delete_after, notes",
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

/**
 * Read estimate fields for hydrating the Quote Range workspace on page
 * load.
 *
 * Two-tier lookup that mirrors how operators actually use the workspace:
 *   1. If a DRAFT row exists (sent_at IS NULL), return its fields. This
 *      is the in-progress estimate the operator is building.
 *   2. Otherwise, if a SENT row exists (sent_at IS NOT NULL), return
 *      the most recent sent estimate's fields. This lets the operator
 *      come back after sending and still see what was sent. Editing
 *      and pressing Preview/Send will create a NEW draft row alongside
 *      the sent one (the existing upsertDraftEstimate inserts when no
 *      sent_at-null row matches), which is the resend / follow-up
 *      workflow.
 *   3. Returns null if no estimate exists at all -- the workspace
 *      falls back to its built-in empty defaults.
 *
 * Only column-persisted fields are restored. Fuel surcharge and
 * accessorials are NOT stored as columns; they're baked into the
 * preview_html / preview_text snapshot at build time, so they cannot
 * be restored without a schema change.
 */
export type QuoteRangeAccessorialDefault = {
  label: string;
  amount: number;
};

export type QuoteRangeDefaults = {
  linehaul_low: number | null;
  linehaul_high: number | null;
  miles_estimate: number | null;
  pickup_timing_notes: string | null;
  equipment_notes: string | null;
  dispatch_notes: string | null;
  expiration_at: string | null;
  closing_line: string | null;
  // Phase REBUILD-3 persisted fields. accessorials is stored as JSONB
  // in dispatch_estimates; nulls and empty arrays are equivalent and
  // both render as the "no accessorials" empty state.
  fuel_surcharge: number | null;
  accessorials: QuoteRangeAccessorialDefault[] | null;
  payment_terms: string | null;
  special_instructions: string | null;
};

/**
 * Returns true when at least one dispatch_estimates row for this quote
 * request has a non-null sent_at. Used by the DispatchLifecycle to mark
 * the "Quote Range" stage as done.
 *
 * The earlier proxy (`intake !== null`) was wrong: it assumed the
 * estimate must have been sent because the intake existed, but the
 * customer can receive the range proposal email and never open the
 * intake form. The lifecycle therefore stayed stuck on Quote Range
 * even after the email was sent.
 */
async function loadEstimateSentFlag(
  quoteRequestId: string,
): Promise<boolean> {
  const sb = createServiceRoleClient();
  const { count } = await sb
    .from("dispatch_estimates")
    .select("id", { count: "exact", head: true })
    .eq("quote_request_id", quoteRequestId)
    .not("sent_at", "is", null);
  return (count ?? 0) > 0;
}

/**
 * Load every SENT document (Range proposal, Finalized Quote, BOL) for
 * this quote request, newest first. Duplicates are preserved on purpose:
 * a resent doc inserts a NEW row in its source table, so multiple sends
 * surface as separate list entries on the Documents tab.
 *
 * No deduplication, no filtering past sent_at IS NOT NULL. Sort order
 * is sent_at DESC after merging.
 *
 * Each row carries:
 *   - type: discriminator for resend action + PDF route routing
 *   - id: the row id on its source table
 *   - label: human-readable display string
 *   - sentAt: ISO timestamp
 *   - recipient: preview_to from the source row (fallback empty string)
 *   - pdfHref: existing PDF route href for FQ/BOL; null for estimates
 *     (which are email-only and have no PDF route).
 */
async function loadSentDocuments(
  quoteRequestId: string,
): Promise<SentDocumentRow[]> {
  const sb = createServiceRoleClient();

  const [estResp, fqResp, bolResp] = await Promise.all([
    sb
      .from("dispatch_estimates")
      .select("id, sent_at, preview_to")
      .eq("quote_request_id", quoteRequestId)
      .not("sent_at", "is", null)
      .order("sent_at", { ascending: false })
      .limit(100),
    sb
      .from("finalized_quotes")
      .select("id, finalized_quote_number, sent_at, preview_to")
      .eq("quote_request_id", quoteRequestId)
      .not("sent_at", "is", null)
      .order("sent_at", { ascending: false })
      .limit(100),
    sb
      .from("bills_of_lading")
      .select("id, bol_number, sent_at, preview_to")
      .eq("quote_request_id", quoteRequestId)
      .not("sent_at", "is", null)
      .order("sent_at", { ascending: false })
      .limit(100),
  ]);

  const estimates: SentDocumentRow[] = (estResp.data ?? []).map((r) => ({
    type: "estimate",
    id: r.id,
    label: "Range proposal",
    sentAt: r.sent_at ?? "",
    recipient: r.preview_to ?? "",
    pdfHref: `/admin/quotes/${quoteRequestId}/estimate-pdf/${r.id}`,
  }));

  const fqs: SentDocumentRow[] = (fqResp.data ?? []).map((r) => ({
    type: "finalized_quote",
    id: r.id,
    label: `Finalized Quote #${r.finalized_quote_number}`,
    sentAt: r.sent_at ?? "",
    recipient: r.preview_to ?? "",
    pdfHref: `/admin/quotes/${quoteRequestId}/finalized-quote-pdf/${r.id}`,
  }));

  const bols: SentDocumentRow[] = (bolResp.data ?? []).map((r) => ({
    type: "bol",
    id: r.id,
    label: `BOL #${r.bol_number}`,
    sentAt: r.sent_at ?? "",
    recipient: r.preview_to ?? "",
    pdfHref: `/admin/quotes/${quoteRequestId}/bol-pdf/${r.id}`,
  }));

  return [...estimates, ...fqs, ...bols].sort((a, b) =>
    a.sentAt < b.sentAt ? 1 : a.sentAt > b.sentAt ? -1 : 0,
  );
}

async function loadDraftEstimate(
  quoteRequestId: string,
): Promise<QuoteRangeDefaults | null> {
  const sb = createServiceRoleClient();
  const cols =
    "linehaul_low, linehaul_high, miles_estimate, pickup_timing_notes, equipment_notes, dispatch_notes, expiration_at, closing_line, fuel_surcharge, accessorials, payment_terms, special_instructions";

  // 1. Prefer the in-progress draft row.
  const { data: draft } = await sb
    .from("dispatch_estimates")
    .select(cols)
    .eq("quote_request_id", quoteRequestId)
    .is("sent_at", null)
    .maybeSingle<QuoteRangeDefaults>();
  if (draft) return draft;

  // 2. Fall back to the most recently sent estimate so the workspace
  //    reads back the values the customer actually received.
  const { data: sent } = await sb
    .from("dispatch_estimates")
    .select(cols)
    .eq("quote_request_id", quoteRequestId)
    .not("sent_at", "is", null)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle<QuoteRangeDefaults>();
  return sent ?? null;
}

// âââ Field-merge helpers (intake first, Quick Quote fallback) ââââââââ

// ─── Level 8.1 — action-surfacing data loaders ──────────────────────────
//
// Two small queries reused by Range/Finalized/BOL workspaces + Overview
// alert. No business logic, no schema changes, no new server actions.

/**
 * Next active lead (newest first), excluding the current one. Powers the
 * "Save & open next" CTA after a successful send. Returns null when this
 * is the only / last active lead — in which case the CTA hides.
 */
async function loadNextLeadId(currentId: string): Promise<string | null> {
  const sb = createServiceRoleClient();
  const { data } = await sb
    .from("quote_requests")
    .select("id")
    .is("deleted_at", null)
    .neq("id", currentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();
  return data?.id ?? null;
}

/**
 * Maps `quote_requests.lead_status` to the tab the operator should land
 * on. Active work states default to Details (operator wants to edit);
 * late states default to Overview (operator wants to read).
 */
function initialTabForLeadStatus(
  status: LeadStatus,
): "overview" | "details" | "pricing" | "documents" {
  const ACTIVE_WORK: LeadStatus[] = [
    "new",
    "contacted",
    "estimate_sent",
    "awaiting_confirmation",
    "awaiting_payment",
    "ready_to_dispatch",
  ];
  return ACTIVE_WORK.includes(status) ? "details" : "overview";
}

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

/**
 * "City, ST" only (no ZIP). Used to populate the City column of the
 * Load Details rows now that the ZIP renders in its own input on the
 * same line. When the city or state is missing the helper falls back
 * to whichever piece is present, or returns an empty string.
 */
function formatCityState(
  city: string | null | undefined,
  state: string | null | undefined,
): string {
  if (city && state) return `${city}, ${state}`;
  if (city) return city;
  if (state) return state;
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
  // Resolved ZIPs (intake first, Quick Quote fallback). Reused below so the
  // city/state fallback hits the same ZIP value the field is going to show.
  const pickupZipResolved = pickString(intake?.pickup_zip, row.pickup_zip);
  const deliveryZipResolved = pickString(
    intake?.delivery_zip,
    row.delivery_zip,
  );
  // City/state fallback chain: intake → Quick Quote row → ZIP-dataset
  // lookup. The final fallback means a fresh lead where the customer only
  // entered a ZIP comes up pre-filled with the dataset-resolved city/state
  // on initial render — no operator blur required.
  const pickupZipLookup = pickupZipResolved
    ? lookupZip(pickupZipResolved)
    : null;
  const deliveryZipLookup = deliveryZipResolved
    ? lookupZip(deliveryZipResolved)
    : null;
  const pickupCityResolved =
    pickString(intake?.pickup_city, row.pickup_city) ||
    (pickupZipLookup?.city ?? "");
  const pickupStateResolved =
    pickString(intake?.pickup_state, row.pickup_state) ||
    (pickupZipLookup?.state ?? "");
  const deliveryCityResolved =
    pickString(intake?.delivery_city, row.delivery_city) ||
    (deliveryZipLookup?.city ?? "");
  const deliveryStateResolved =
    pickString(intake?.delivery_state, row.delivery_state) ||
    (deliveryZipLookup?.state ?? "");

  return {
    pickup_company: pickString(intake?.pickup_company),
    pickup_address: joinAddress(
      intake?.pickup_address_line1,
      intake?.pickup_address_line2,
    ),
    pickup_city_state: formatCityState(pickupCityResolved, pickupStateResolved),
    pickup_zip: pickupZipResolved,
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
    delivery_city_state: formatCityState(
      deliveryCityResolved,
      deliveryStateResolved,
    ),
    delivery_zip: deliveryZipResolved,
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

/**
 * Compose the final LoadDetailsInitial from the computed-from-intake
 * baseline + the operator's saved overrides. Overrides win on every
 * key the operator has set (including empty strings -- cleared fields
 * stay cleared). Fields the operator never touched fall through to
 * the baseline so the customer's intake / Quick Quote data is the
 * default state.
 */
function applyLoadDetailsOverrides(
  baseline: LoadDetailsInitial,
  overrides: Record<string, string> | null,
): LoadDetailsInitial {
  if (!overrides) return baseline;
  const filtered: Partial<LoadDetailsInitial> = {};
  for (const key of Object.keys(baseline) as Array<keyof LoadDetailsInitial>) {
    const v = overrides[key];
    if (typeof v === "string") {
      filtered[key] = v;
    }
  }
  return { ...baseline, ...filtered };
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
  // Resolve city / state from the ZIP code when the DB row does not
  // already have them. The Quick Quote form only collects ZIPs, so
  // pickup_city / pickup_state are typically null on a fresh lead.
  // lookupZip uses the zipcodes dataset (server-side only) -- safe
  // here because page.tsx is a server component.
  const pickupZipLookup = row.pickup_zip ? lookupZip(row.pickup_zip) : null;
  const deliveryZipLookup = row.delivery_zip ? lookupZip(row.delivery_zip) : null;
  const pickupCity = row.pickup_city ?? pickupZipLookup?.city ?? null;
  const pickupState = row.pickup_state ?? pickupZipLookup?.state ?? null;
  const deliveryCity = row.delivery_city ?? deliveryZipLookup?.city ?? null;
  const deliveryState = row.delivery_state ?? deliveryZipLookup?.state ?? null;

  // Miles fall back to a server-side estimate when calculated_miles is
  // not yet stored. estimateLaneMiles returns the same driving-miles
  // number the dispatch composer uses so the lane chip stays consistent
  // with whatever the rate-per-mile widget shows.
  let miles: number | null = row.calculated_miles;
  if (miles == null && row.pickup_zip && row.delivery_zip) {
    const est = estimateLaneMiles(row.pickup_zip, row.delivery_zip);
    if (est.ok) miles = est.miles;
  }

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
      pickupLabel: laneLabel(pickupCity, pickupState, row.pickup_zip),
      deliveryLabel: laneLabel(deliveryCity, deliveryState, row.delivery_zip),
      pickupZip: row.pickup_zip,
      deliveryZip: row.delivery_zip,
      miles,
      hasLane: Boolean(row.pickup_zip && row.delivery_zip),
    },
  };
}

/**
 * Level 5 Step 5.4 wire-up — read-only SELECT for the Timeline tab's
 * Event history section. Explicit column list (no SELECT *), newest
 * first, capped at 100 rows so long-lived leads don't return thousands.
 * Maps row.created_at -> createdAt to match the TimelineEventRow shape.
 *
 * The component-level dictionary in TimelineTab.tsx covers all 38
 * DispatchEventKind variants; unknown kinds (forward-migration drift)
 * fall back to a generated label and never render an error.
 */
type DispatchEventDbRow = {
  id: string;
  kind: string;
  payload: unknown;
  created_at: string;
};

async function loadDispatchEventsForTimeline(
  quoteRequestId: string,
): Promise<TimelineEventRow[]> {
  const sb = createServiceRoleClient();
  const { data } = await sb
    .from("dispatch_events")
    .select("id, kind, payload, created_at")
    .eq("quote_request_id", quoteRequestId)
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<DispatchEventDbRow[]>();
  return (data ?? []).map((r) => ({
    id: r.id,
    kind: r.kind,
    payload: r.payload,
    createdAt: r.created_at,
  }));
}

/**
 * Sent-artifact index for the Overview Activity feed (newest-first lists
 * of {id, sentAt}). Powers the inline "View" link on
 * Range proposal sent / resent, Finalized quote sent / resent, BOL
 * sent / resent rows so dispatch can re-open the exact PDF that
 * went out. Sent-time is the source of truth for the displayed
 * timestamp on those rows — overrides dispatch_events.created_at so
 * two consecutive resends never collapse into the same minute.
 */
type SentArtifactRow = { id: string; sent_at: string };
export type SentArtifact = { id: string; sentAt: string };
export type SentArtifactIndex = {
  estimates: SentArtifact[];
  fqs: SentArtifact[];
  bols: SentArtifact[];
};

async function loadSentArtifactIndex(
  quoteRequestId: string,
): Promise<SentArtifactIndex> {
  const sb = createServiceRoleClient();
  const [{ data: estRows }, { data: fqRows }, { data: bolRows }] =
    await Promise.all([
      sb
        .from("dispatch_estimates")
        .select("id, sent_at")
        .eq("quote_request_id", quoteRequestId)
        .not("sent_at", "is", null)
        .order("sent_at", { ascending: false })
        .returns<SentArtifactRow[]>(),
      sb
        .from("finalized_quotes")
        .select("id, sent_at")
        .eq("quote_request_id", quoteRequestId)
        .not("sent_at", "is", null)
        .order("sent_at", { ascending: false })
        .returns<SentArtifactRow[]>(),
      sb
        .from("bills_of_lading")
        .select("id, sent_at")
        .eq("quote_request_id", quoteRequestId)
        .not("sent_at", "is", null)
        .order("sent_at", { ascending: false })
        .returns<SentArtifactRow[]>(),
    ]);
  const norm = (rows: SentArtifactRow[] | null): SentArtifact[] =>
    (rows ?? []).map((r) => ({ id: r.id, sentAt: r.sent_at }));
  return {
    estimates: norm(estRows),
    fqs: norm(fqRows),
    bols: norm(bolRows),
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
  const initialValues = applyLoadDetailsOverrides(
    computeInitialValues(row, intake),
    row.load_details_overrides,
  );
  // intakeStatusMessage is still defined above and may be re-surfaced
  // later; the old WorkspaceTabs header pill consumed it. Call once and
  // discard so it stays "used" without rendering.
  void intakeStatusMessage(intake);
  const intakeUploads = await loadIntakeUploadsForAdmin(row.id);
  const estimateDraft = await loadDraftEstimate(id);
  const estimateWasSent = await loadEstimateSentFlag(id);
  const sentDocuments = await loadSentDocuments(id);
  const intakeSnapshotKey = intake
    ? `${intake.id}:${intake.status}:${intake.submitted_at ?? ""}`
    : "no_intake";
  const finalizedQuoteState = await loadFinalizedQuoteState(row.id, row.email);
  const bolState = await loadBolState(row.id, row.email);
  // Level 5 Step 5.4 wire-up - dispatch_events feed for TimelineTab.
  const timelineEvents = await loadDispatchEventsForTimeline(row.id);
  // Sent-artifact index for Activity feed inline "View" links + sent-time
  // override on sent/resent rows.
  const sentArtifactIndex = await loadSentArtifactIndex(row.id);

  // Lifecycle artifact state. Shared by Overview tab (single stage
  // label via currentStageLabel) and Timeline tab (full 6-cell pipeline
  // via <DispatchLifecycle>). Both consumers derive from
  // computeStageStates() so they cannot drift.
  const lifecycleState: DispatchStageInput = {
    estimateSent: estimateWasSent,
    intakeSubmitted: intake?.status === "submitted",
    finalizedQuoteSent:
      finalizedQuoteState.phase === "sent" ||
      finalizedQuoteState.phase === "draft",
    finalizedQuoteConfirmed:
      finalizedQuoteState.phase === "sent" &&
      finalizedQuoteState.sent.confirmedAt !== null,
    bolGenerated:
      bolState.phase === "draft" || bolState.phase === "sent",
  };

  const isTrashed = Boolean(row.deleted_at);
  const headerProps = buildOperatorHeaderProps(row);

  // Level 8.1 — action-surfacing data plumbing (no new server actions).
  //
  // 1. nextLeadId: next active lead by created_at DESC, excluding this
  //    one. Powers the "Save & open next" CTA in Range/Finalized/BOL
  //    workspaces. Single small query.
  // 2. initialTab: Details for active work states (operator wants to
  //    edit immediately), Overview for late states (operator wants to
  //    read).
  const nextLeadId = await loadNextLeadId(row.id);
  const initialTab = initialTabForLeadStatus(row.lead_status);
  void initialTab;

  // ── V2 progressive-disclosure: section summaries + LoadSummaryCard ─────
  //
  // Computed server-side so each CollapsibleWorkspaceSection header
  // shows a meaningful at-a-glance string while the body is closed.
  // None of these touch business logic — they only read from values
  // already loaded above.

  const rateDisplay = formatLoadRate({
    finalizedTotal:
      finalizedQuoteState.phase === "sent"
        ? finalizedQuoteState.sent.totalAmount
        : null,
    estimateLow: estimateDraft?.linehaul_low ?? null,
    estimateHigh: estimateDraft?.linehaul_high ?? null,
  });

  const formatWindowSummary = (start: string, end: string): string | null => {
    const s = start.trim();
    const e = end.trim();
    if (!s && !e) return null;
    if (s && e && s !== e) return s + " — " + e;
    return s || e;
  };
  // YYYY-MM-DD -> "Mon D" (compact, for the OpsStrip + LaneHero date pill).
  // Anything that isn't a clean ISO date passes through unchanged so
  // hand-typed window strings like "Mon 0800-1200" still render.
  const formatCompactDate = (raw: string): string => {
    const t = raw.trim();
    if (!t) return "";
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
    if (!m) return t;
    const months = [
      "Jan","Feb","Mar","Apr","May","Jun",
      "Jul","Aug","Sep","Oct","Nov","Dec",
    ];
    const monthIdx = parseInt(m[2]!, 10) - 1;
    const day = parseInt(m[3]!, 10);
    if (!Number.isFinite(monthIdx) || monthIdx < 0 || monthIdx > 11) return t;
    return months[monthIdx]! + " " + day;
  };
  const formatCompactWindow = (
    start: string,
    end: string,
  ): string | null => {
    const s = formatCompactDate(start);
    const e = formatCompactDate(end);
    if (!s && !e) return null;
    if (s && e && s !== e) return s + " — " + e;
    return s || e;
  };
  const pickupWindowSummary = formatWindowSummary(
    initialValues.pickup_window,
    initialValues.pickup_window_end,
  );
  const deliveryWindowSummary = formatWindowSummary(
    initialValues.delivery_window,
    initialValues.delivery_window_end,
  );
  const pickupWindowCompact = formatCompactWindow(
    initialValues.pickup_window,
    initialValues.pickup_window_end,
  );
  const deliveryWindowCompact = formatCompactWindow(
    initialValues.delivery_window,
    initialValues.delivery_window_end,
  );

  const nextActionResult = nextAction(row.lead_status, null);

  // Details section summary — lane + miles (matches the row format in
  // /admin/loads so the operator's mental model stays consistent).
  const lanePieces: string[] = [];
  if (headerProps.lane.pickupLabel) lanePieces.push(headerProps.lane.pickupLabel);
  if (headerProps.lane.deliveryLabel) lanePieces.push(headerProps.lane.deliveryLabel);
  const laneText = lanePieces.length > 0 ? lanePieces.join(" → ") : "Lane TBD";
  const milesText =
    headerProps.lane.miles != null
      ? " · " + headerProps.lane.miles.toLocaleString() + " mi"
      : "";
  const detailsSectionSummary = laneText + milesText;

  // Documents section summary — sent count + BOL phase.
  const bolPhaseLabel = (() => {
    switch (bolState.phase) {
      case "no_sent_finalized_quote":
        return "BOL blocked";
      case "ready_to_generate":
        return "BOL ready";
      case "draft":
        return "BOL draft";
      case "sent":
        return "BOL sent";
    }
  })();
  const documentsSectionSummary =
    sentDocuments.length === 1
      ? "1 sent · " + bolPhaseLabel
      : sentDocuments.length + " sent · " + bolPhaseLabel;

  // Attachments — only surface a section when the load actually has
  // customer uploads. Reuses the existing intakeUploads array loaded
  // server-side; no new storage logic.
  const attachmentsContent =
    intakeUploads.length > 0 ? (
      <AttachmentsList uploads={intakeUploads} />
    ) : null;
  const attachmentsSummary =
    intakeUploads.length === 0
      ? null
      : intakeUploads.length === 1
        ? "1 file"
        : intakeUploads.length + " files";

  // Lifecycle headline — plain-English status reused from the legacy
  // DispatchLifecycle helpers. Surfaced as a thin alert row in
  // LoadWorkspaceV2 so the operator gets the same "what's blocking
  // me" cue the old OverviewTab provided.
  const lifecycleHeadline = headlineFromStates(
    computeStageStates(lifecycleState),
  );

  // Activity section summary — latest event + total count.
  const activitySectionSummary = (() => {
    if (timelineEvents.length === 0) return "No activity yet";
    const latest = timelineEvents[0]!;
    const described = describeEvent(latest.kind, latest.payload);
    const totalSuffix =
      timelineEvents.length === 1
        ? " \u00b7 1 event"
        : " \u00b7 " + timelineEvents.length + " events";
    return described.label + totalSuffix;
  })();

  // ── V4 workstation surface — prop builders ──────────────────────────
  //
  // The new LoadWorkspaceV2 takes a flat set of presentational props
  // (identity / lane / status / ops / bolBlockerPhase / notes). All of
  // them derive from values already computed above — no new server
  // queries, no schema changes.

  // Rate label — distinguishes Range vs Final in the IdentityRow.
  const rateLabel: "Range" | "Final" | null = (() => {
    if (finalizedQuoteState.phase === "sent" &&
        finalizedQuoteState.sent.totalAmount != null) {
      return "Final";
    }
    if (
      estimateDraft &&
      (estimateDraft.linehaul_low != null ||
        estimateDraft.linehaul_high != null)
    ) {
      return "Range";
    }
    return null;
  })();

  // LaneHero — city/state come from the existing pickupLabel /
  // deliveryLabel (which are already "City, ST" when available);
  // zips are surfaced separately.
  const pickupCityState = headerProps.lane.pickupLabel ?? null;
  const deliveryCityState = headerProps.lane.deliveryLabel ?? null;
  const driveTime =
    headerProps.lane.miles != null
      ? "~" + Math.max(1, Math.round(headerProps.lane.miles / 60)) + "h drive"
      : null;

  // Lifecycle -> StatusHero variant. amber = waiting on customer,
  // blue = action required from us, emerald = terminal success,
  // neutral = off-pipeline.
  const statusVariant: import("./StatusHero").StatusHeroVariant = (() => {
    switch (row.lead_status) {
      case "lost":
        return "neutral";
      case "archived":
        return "emerald";
      case "estimate_sent":
      case "awaiting_confirmation":
      case "awaiting_payment":
        return "amber";
      default:
        return "blue";
    }
  })();

  // Headline reuses the existing lifecycle helper. Fall back to the
  // status label if the helper has no opinion at this stage.
  const statusHeadline =
    lifecycleHeadline?.trim() ||
    LEAD_STATUS_LABELS[row.lead_status] ||
    "Load received";

  // Meta line — imperative next action surfaced as "Next: <verb>".
  const statusMeta = nextActionResult.verb
    ? "Next: " + nextActionResult.verb
    : null;

  // Notes -- surfaced as a quote block in its own collapsible card, no
  // longer crammed into the summary card.
  const customerNotesText = (row.notes ?? "").trim();
  const notesContent = customerNotesText ? (
    <div className="bg-zinc-900/40 px-3 py-2">
      <blockquote className="border-l-2 border-zinc-700 pl-3 text-[12px] leading-relaxed text-zinc-200">
        {customerNotesText}
      </blockquote>
    </div>
  ) : null;
  const notesSummary = customerNotesText
    ? customerNotesText.length > 60
      ? customerNotesText.slice(0, 60) + "\u2026"
      : customerNotesText
    : null;

  // OpsStrip -- next-action accent matches the status variant.
  const nextTone: "neutral" | "blue" | "amber" | "emerald" =
    statusVariant === "neutral" ? "neutral" : statusVariant;

  // Pricing default-open vs collapsed -- post-acceptance the rate is
  // locked in; operator now cares about BOL / documents / delivery
  // state, not the price composer.
  const pricingCollapsedByDefault =
    row.lead_status === "booked" ||
    row.lead_status === "ready_to_dispatch" ||
    row.lead_status === "dispatched" ||
    row.lead_status === "picked_up" ||
    row.lead_status === "in_transit" ||
    row.lead_status === "delivered" ||
    row.lead_status === "archived";

  return (
    <>
      {isTrashed ? (
        <div className="border-t border-zinc-800 bg-zinc-950">
          <div className="mx-auto flex max-w-7xl flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2 sm:px-6 lg:px-8">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-amber-400">
              In trash
            </p>
            <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-zinc-400">
              Moved {relativeTime(row.deleted_at!)}
              {row.delete_after
                ? " \u00b7 Auto-purge " +
                  formatDateShort(row.delete_after).slice(0, 10)
                : ""}
            </p>
          </div>
        </div>
      ) : null}
      <LoadWorkspaceV2
        identity={{
          customerName: row.name,
          shortRequestId: headerProps.identity.requestId,
          receivedRelative: headerProps.identity.receivedRelative,
          receivedFull: headerProps.identity.receivedFull,
          leadStatus: row.lead_status,
          rateDisplay,
          rateLabel: rateLabel ?? undefined,
          isTrashed,
        }}
        lane={{
          pickupCityState,
          pickupZip: row.pickup_zip,
          deliveryCityState,
          deliveryZip: row.delivery_zip,
          miles: headerProps.lane.miles,
          driveTime,
          pickupDateLabel: pickupWindowCompact || pickupWindowSummary,
          deliveryDateLabel: deliveryWindowCompact || deliveryWindowSummary,
        }}
        status={{
          variant: statusVariant,
          headline: statusHeadline,
          detail: null,
          meta: statusMeta,
        }}
        workflowStatus={row.lead_status}
        ops={{
          pickupLabel: pickupWindowCompact || pickupWindowSummary,
          deliveryLabel: deliveryWindowCompact || deliveryWindowSummary,
          contactLabel: row.phone || row.email || null,
          nextLabel: nextActionResult.verb || null,
          nextTone,
        }}
        bolBlockerPhase={bolState.phase}
        attachmentsContent={attachmentsContent}
        attachmentsSummary={attachmentsSummary}
        notesContent={notesContent}
        notesSummary={notesSummary}
        detailsContent={
          <DetailsTab
            key={intakeSnapshotKey}
            quoteRequestId={row.id}
            initial={initialValues}
            shipperOfRecord={{
              name: row.name,
              phone: row.phone,
              email: row.email,
            }}
            miles={headerProps.lane.miles}
          />
        }
        detailsSummary={detailsSectionSummary}
        pricingContent={
          <PricingTab
            quoteRequestId={row.id}
            miles={headerProps.lane.miles}
            rangeDefaults={estimateDraft}
            finalizedQuoteState={finalizedQuoteState}
            nextLeadId={nextLeadId}
          />
        }
        pricingSummary={rateDisplay ?? "\u2014"}
        pricingCollapsedByDefault={pricingCollapsedByDefault}
        documentsContent={
          <DocumentsTab
            quoteRequestId={row.id}
            bolState={bolState}
            sentDocuments={sentDocuments}
            nextLeadId={nextLeadId}
          />
        }
        documentsSummary={documentsSectionSummary}
        activityContent={<ActivityRun events={timelineEvents} />}
        activitySummary={activitySectionSummary}
      />
    </>
  );
}
