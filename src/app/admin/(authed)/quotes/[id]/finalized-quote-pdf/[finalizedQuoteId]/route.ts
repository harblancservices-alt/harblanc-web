import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  renderFinalizedQuotePdfBuffer,
} from "@/lib/pdf/renderFinalizedQuotePdf";
import type { FinalizedQuotePdfData } from "@/lib/pdf/FinalizedQuotePDF";

/**
 * On-demand Finalized Quote PDF download — admin only.
 *
 *   GET /admin/quotes/<quoteRequestId>/finalized-quote-pdf/<finalizedQuoteId>
 *
 * Generates a fresh PDF from current row state and streams it back as
 * application/pdf with a Content-Disposition filename derived from
 * the finalized quote number. Not stored, not attached to email —
 * Phase 2C smallest-safe-path. The email send pipeline is untouched
 * and continues to ship HTML-only.
 *
 * Auth: requireAdmin() at the route level (this segment sits under
 * the /admin/(authed) folder which already runs the gate in its
 * layout, but we re-check here defensively since route handlers
 * don't compose with layouts the way pages do).
 *
 * Idempotent: every GET re-renders. The FQ row is the source of
 * truth, so calling this after the row has changed reflects current
 * data. The "what was actually sent" record stays in
 * finalized_quotes.preview_html — unaltered by this route.
 */

type FqPdfRow = {
  id: string;
  quote_request_id: string;
  finalized_quote_number: string;
  issue_date: string | null;
  expiration_at: string | null;
  payment_due_at: string | null;

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

  prepared_by: string | null;
};

type LeadRow = {
  id: string;
  name: string;
  email: string;
};

function num(v: string | number | null): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Mirror of the shortRef helper used by the email renderer + the FQ
 * actions — last 8 hex chars of the lead UUID, upper-case, hyphenated.
 * Kept inline rather than imported because email/shell.ts is the canonical
 * holder and we don't want this route taking an email-layer dependency.
 */
function shortRef(uuid: string): string {
  const hex = uuid.replace(/-/g, "");
  if (hex.length < 8) return uuid.toUpperCase();
  const tail = hex.slice(-8).toUpperCase();
  return `${tail.slice(0, 4)}-${tail.slice(4)}`;
}

function parseAccessorials(
  v: unknown,
): Array<{ label: string; amount: number }> {
  if (!Array.isArray(v)) return [];
  const out: Array<{ label: string; amount: number }> = [];
  for (const entry of v) {
    if (entry && typeof entry === "object") {
      const e = entry as Record<string, unknown>;
      const label = typeof e.label === "string" ? e.label : null;
      const amount =
        typeof e.amount === "number"
          ? e.amount
          : typeof e.amount === "string"
            ? Number(e.amount)
            : NaN;
      if (label !== null && Number.isFinite(amount)) {
        out.push({ label, amount });
      }
    }
  }
  return out;
}

export async function GET(
  _request: Request,
  context: {
    params: Promise<{ id: string; finalizedQuoteId: string }>;
  },
): Promise<Response> {
  await requireAdmin();

  const { id: quoteRequestId, finalizedQuoteId } = await context.params;
  if (!quoteRequestId || !finalizedQuoteId) {
    return NextResponse.json({ error: "Missing identifiers." }, { status: 400 });
  }

  const sb = createServiceRoleClient();

  // Load the FQ row. We require it to belong to the lead in the URL
  // so an admin can't accidentally render an FQ from a different
  // lead context (defensive — the admin gate already restricts who
  // gets here at all).
  const { data: fq, error: fqErr } = await sb
    .from("finalized_quotes")
    .select(
      "id, quote_request_id, finalized_quote_number, issue_date, expiration_at, payment_due_at, pickup_company, pickup_contact_name, pickup_contact_phone, pickup_address_line1, pickup_address_line2, pickup_city, pickup_state, pickup_zip, pickup_window, delivery_company, delivery_contact_name, delivery_contact_phone, delivery_address_line1, delivery_address_line2, delivery_city, delivery_state, delivery_zip, delivery_window, commodity, length_in, width_in, height_in, exact_weight_lbs, quantity, handling_type, running_condition, securement_requirements, forklift_available, driver_assist_required, crane_required, permits_required, escort_required, tarp_required, special_instructions, linehaul, fuel_surcharge, permits_fee, accessorials, total_amount, prepared_by",
    )
    .eq("id", finalizedQuoteId)
    .eq("quote_request_id", quoteRequestId)
    .maybeSingle<FqPdfRow>();

  if (fqErr) {
    return NextResponse.json(
      { error: `Finalized quote lookup failed: ${fqErr.message}` },
      { status: 500 },
    );
  }
  if (!fq) {
    return NextResponse.json({ error: "Finalized quote not found." }, { status: 404 });
  }

  // Load the lead so we can populate the "Prepared for" block.
  const { data: lead } = await sb
    .from("quote_requests")
    .select("id, name, email")
    .eq("id", fq.quote_request_id)
    .maybeSingle<LeadRow>();
  if (!lead) {
    return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  }

  // Linehaul drives total math in the renderer payload — refuse to
  // render a PDF for an FQ that doesn't have a positive linehaul. The
  // builder would render a $—.00 total which would look wrong on a
  // carrier-issued document.
  const linehaul = num(fq.linehaul);
  const totalAmount = num(fq.total_amount);
  if (linehaul === null || totalAmount === null) {
    return NextResponse.json(
      {
        error:
          "Rate breakdown is incomplete on this finalized quote. Open the workspace and build a preview first.",
      },
      { status: 422 },
    );
  }

  const data: FinalizedQuotePdfData = {
    quoteNumber: fq.finalized_quote_number,
    dispatchReference: `HS-${shortRef(lead.id)}`,
    issuedAt: fq.issue_date ?? new Date().toISOString().slice(0, 10),
    expirationAt: fq.expiration_at,
    paymentDueAt: fq.payment_due_at,

    customerName: lead.name,
    customerEmail: lead.email ?? null,

    pickup: {
      company: fq.pickup_company,
      contactName: fq.pickup_contact_name,
      contactPhone: fq.pickup_contact_phone,
      addressLine1: fq.pickup_address_line1,
      addressLine2: fq.pickup_address_line2,
      city: fq.pickup_city,
      state: fq.pickup_state,
      zip: fq.pickup_zip,
      window: fq.pickup_window,
    },
    delivery: {
      company: fq.delivery_company,
      contactName: fq.delivery_contact_name,
      contactPhone: fq.delivery_contact_phone,
      addressLine1: fq.delivery_address_line1,
      addressLine2: fq.delivery_address_line2,
      city: fq.delivery_city,
      state: fq.delivery_state,
      zip: fq.delivery_zip,
      window: fq.delivery_window,
    },
    freight: {
      commodity: fq.commodity,
      lengthIn: num(fq.length_in),
      widthIn: num(fq.width_in),
      heightIn: num(fq.height_in),
      weightLbs: num(fq.exact_weight_lbs),
      quantity: fq.quantity,
      handlingType: fq.handling_type,
      runningCondition: fq.running_condition,
      securementRequirements: fq.securement_requirements,
    },
    ops: {
      forkliftAvailable: fq.forklift_available,
      driverAssistRequired: fq.driver_assist_required,
      craneRequired: fq.crane_required,
      permitsRequired: fq.permits_required,
      escortRequired: fq.escort_required,
      tarpRequired: fq.tarp_required,
      specialInstructions: fq.special_instructions,
    },
    rate: {
      linehaul,
      fuelSurcharge: num(fq.fuel_surcharge),
      permitsFee: num(fq.permits_fee),
      accessorials: parseAccessorials(fq.accessorials),
      totalAmount,
    },
    preparedBy: fq.prepared_by,
  };

  let buffer: Buffer;
  try {
    buffer = await renderFinalizedQuotePdfBuffer(data);
  } catch (e) {
    console.error("[finalized-quote-pdf] render failed", {
      finalizedQuoteId: fq.id,
      message: e instanceof Error ? e.message : "unknown",
    });
    return NextResponse.json(
      { error: "Could not render the finalized quote PDF." },
      { status: 500 },
    );
  }

  const filename = `${fq.finalized_quote_number}.pdf`;
  return new Response(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      // Don't cache — the FQ row may change between requests, and we
      // want the latest data every time the operator clicks Download.
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
