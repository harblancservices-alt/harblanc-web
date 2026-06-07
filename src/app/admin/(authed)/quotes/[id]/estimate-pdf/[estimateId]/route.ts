import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { renderRangeProposalPdfBuffer } from "@/lib/pdf/renderRangeProposalPdf";
import type { RangeProposalPdfData } from "@/lib/pdf/RangeProposalPDF";
import { lookupZip } from "@/lib/dispatch/distance";

/**
 * On-demand Range Proposal PDF download — admin only.
 *
 *   GET /admin/quotes/<quoteRequestId>/estimate-pdf/<estimateId>
 *
 * Generates a fresh PDF from the dispatch_estimates row + the parent
 * lead row and streams it back as application/pdf. Not stored, not
 * attached to email — the Range proposal continues to ship HTML-only.
 *
 * Same shape as the Finalized Quote PDF route. Idempotent — every GET
 * re-renders from current row state.
 */

type EstimatePdfRow = {
  id: string;
  quote_request_id: string;
  linehaul_low: string | number | null;
  linehaul_high: string | number | null;
  miles_estimate: number | null;
  pickup_timing_notes: string | null;
  equipment_notes: string | null;
  dispatch_notes: string | null;
  expiration_at: string | null;
  closing_line: string | null;
  fuel_surcharge: string | number | null;
  accessorials: unknown;
  preview_built_at: string | null;
  preview_to: string | null;
  sent_at: string | null;
};

type LeadRow = {
  id: string;
  name: string;
  email: string | null;
  pickup_zip: string | null;
  delivery_zip: string | null;
  commodity: string | null;
  weight: string | null;
  pickup_date: string | null;
};

function num(v: string | number | null): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

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

function zipToCityState(zip: string | null): {
  city: string | null;
  state: string | null;
  zip: string | null;
} {
  if (!zip) return { city: null, state: null, zip: null };
  const hit = lookupZip(zip);
  return {
    city: hit?.city ?? null,
    state: hit?.state ?? null,
    zip,
  };
}

export async function GET(
  _request: Request,
  context: {
    params: Promise<{ id: string; estimateId: string }>;
  },
): Promise<Response> {
  await requireAdmin();

  const { id: quoteRequestId, estimateId } = await context.params;
  if (!quoteRequestId || !estimateId) {
    return NextResponse.json(
      { error: "Missing identifiers." },
      { status: 400 },
    );
  }

  const sb = createServiceRoleClient();

  // Load the estimate row scoped to the lead in the URL (defensive — the
  // admin gate already restricts who gets here, but we don't want a
  // mis-pasted URL rendering a different lead's range).
  const { data: estimate, error: estErr } = await sb
    .from("dispatch_estimates")
    .select(
      "id, quote_request_id, linehaul_low, linehaul_high, miles_estimate, pickup_timing_notes, equipment_notes, dispatch_notes, expiration_at, closing_line, fuel_surcharge, accessorials, preview_built_at, preview_to, sent_at",
    )
    .eq("id", estimateId)
    .eq("quote_request_id", quoteRequestId)
    .maybeSingle<EstimatePdfRow>();
  if (estErr) {
    return NextResponse.json(
      { error: `Estimate lookup failed: ${estErr.message}` },
      { status: 500 },
    );
  }
  if (!estimate) {
    return NextResponse.json(
      { error: "Range proposal not found." },
      { status: 404 },
    );
  }

  const linehaulLow = num(estimate.linehaul_low);
  if (linehaulLow === null || linehaulLow <= 0) {
    return NextResponse.json(
      {
        error:
          "This range proposal has no linehaul value; nothing to render. Build a preview in the Pricing tab first.",
      },
      { status: 422 },
    );
  }

  // Load the lead for customer info + lane + freight context. The Range
  // PDF reads lane/freight from quote_requests since the estimate row
  // does not duplicate those fields.
  const { data: lead } = await sb
    .from("quote_requests")
    .select(
      "id, name, email, pickup_zip, delivery_zip, commodity, weight, pickup_date",
    )
    .eq("id", estimate.quote_request_id)
    .maybeSingle<LeadRow>();
  if (!lead) {
    return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  }

  const pickup = zipToCityState(lead.pickup_zip);
  const delivery = zipToCityState(lead.delivery_zip);

  // Issued date: prefer sent_at, fall back to preview_built_at, then today.
  const issuedSource =
    estimate.sent_at ?? estimate.preview_built_at ?? new Date().toISOString();

  const data: RangeProposalPdfData = {
    reference: `RG-${shortRef(estimate.id)}`,
    dispatchReference: `HS-${shortRef(lead.id)}`,
    issuedAt: issuedSource.slice(0, 10),
    expirationAt: estimate.expiration_at,

    customerName: lead.name,
    customerEmail: lead.email ?? estimate.preview_to,

    pickup,
    delivery,
    miles: estimate.miles_estimate,

    freight: {
      commodity: lead.commodity,
      weight: lead.weight,
      pickupWindow: lead.pickup_date,
    },

    rate: {
      linehaulLow,
      linehaulHigh: num(estimate.linehaul_high),
      fuelSurcharge: num(estimate.fuel_surcharge),
      accessorials: parseAccessorials(estimate.accessorials),
    },

    pickupTimingNotes: estimate.pickup_timing_notes,
    equipmentNotes: estimate.equipment_notes,
    dispatchNotes: estimate.dispatch_notes,
    closingLine: estimate.closing_line,

    preparedBy: null,
  };

  let buffer: Buffer;
  try {
    buffer = await renderRangeProposalPdfBuffer(data);
  } catch (e) {
    console.error("[estimate-pdf] render failed", {
      estimateId: estimate.id,
      message: e instanceof Error ? e.message : "unknown",
    });
    return NextResponse.json(
      { error: "Could not render the range proposal PDF." },
      { status: 500 },
    );
  }

  const filename = `range-proposal-${shortRef(estimate.id)}.pdf`;
  return new Response(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
