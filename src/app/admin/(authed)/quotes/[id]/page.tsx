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
  delivery_company: string | null;
  delivery_contact_name: string | null;
  delivery_contact_phone: string | null;
  delivery_address_line1: string | null;
  delivery_address_line2: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  delivery_zip: string | null;
  delivery_window: string | null;
  commodity_details: string | null;
  length_in: number | null;
  width_in: number | null;
  height_in: number | null;
  exact_weight_lbs: number | null;
  special_requirements: string | null;
};

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
      "id, status, submitted_at, pickup_company, pickup_contact_name, pickup_contact_phone, pickup_address_line1, pickup_address_line2, pickup_city, pickup_state, pickup_zip, pickup_window, delivery_company, delivery_contact_name, delivery_contact_phone, delivery_address_line1, delivery_address_line2, delivery_city, delivery_state, delivery_zip, delivery_window, commodity_details, length_in, width_in, height_in, exact_weight_lbs, special_requirements",
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
    pickup_window: pickString(intake?.pickup_window, row.pickup_date),
    // pickup_window_end intentionally left empty for now — the
    // shipment_intake schema doesn't store a separate end date yet.
    // Operator types the end manually in the workspace until a
    // future migration lands a pickup_window_end column.
    pickup_window_end: "",

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
    delivery_window: pickString(intake?.delivery_window),
    // delivery_window_end — same as pickup_window_end. Operator-typed
    // until the schema gains a delivery_window_end column.
    delivery_window_end: "",

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
      />
    </div>
  );
}
