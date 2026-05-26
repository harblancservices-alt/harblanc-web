import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { renderBolPdfBuffer } from "@/lib/pdf/renderBolPdf";
import type { BillOfLadingPdfData } from "@/lib/pdf/BillOfLadingPDF";

/**
 * On-demand Bill of Lading PDF download — admin only.
 *
 *   GET /admin/quotes/<quoteRequestId>/bol-pdf/<bolId>
 *
 * Generates a fresh Straight BOL PDF from current row state and streams
 * it back as application/pdf with an inline Content-Disposition. Not
 * stored, not attached to email — Phase 3A smallest-safe-path. The
 * BOL email send pipeline is untouched and continues to ship HTML-only.
 *
 * Mirrors the Finalized Quote PDF route added in Phase 2C:
 *   src/app/admin/(authed)/quotes/[id]/finalized-quote-pdf/[finalizedQuoteId]/route.ts
 *
 * Auth: requireAdmin() at the route level (defensive — the segment
 * already lives under /admin/(authed) which gates at the layout level,
 * but route handlers don't compose with layouts the way pages do).
 */

type BolPdfRow = {
  id: string;
  bol_number: string;
  quote_request_id: string;
  finalized_quote_id: string;
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
  hazmat: boolean;
  special_handling: string | null;

  driver_assist_required: boolean;
  tarp_required: boolean;
  permits_required: boolean;
  escort_required: boolean;
  rigging_required: boolean;
  appointment_required: boolean;
  special_instructions: string | null;

  dispatch_notes: string | null;
  prepared_by: string | null;
};

function num(v: string | number | null): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; bolId: string }> },
): Promise<Response> {
  await requireAdmin();

  const { id: quoteRequestId, bolId } = await context.params;
  if (!quoteRequestId || !bolId) {
    return NextResponse.json(
      { error: "Missing identifiers." },
      { status: 400 },
    );
  }

  const sb = createServiceRoleClient();

  // Load the BOL row scoped by both quote_request_id and bol id so an
  // admin can't accidentally render a BOL from a different lead's
  // context (defensive — the admin gate already restricts who reaches
  // this route).
  const { data: bol, error: bolErr } = await sb
    .from("bills_of_lading")
    .select(
      "id, bol_number, quote_request_id, finalized_quote_id, dispatch_reference, issue_date, shipper_company, shipper_contact_name, shipper_contact_phone, shipper_contact_email, shipper_address_line1, shipper_address_line2, shipper_city, shipper_state, shipper_zip, pickup_window, pickup_instructions, consignee_company, consignee_contact_name, consignee_contact_phone, consignee_contact_email, consignee_address_line1, consignee_address_line2, consignee_city, consignee_state, consignee_zip, delivery_window, delivery_instructions, commodity, quantity, handling_units_type, length_in, width_in, height_in, weight_lbs, nmfc_code, freight_class, hazmat, special_handling, driver_assist_required, tarp_required, permits_required, escort_required, rigging_required, appointment_required, special_instructions, dispatch_notes, prepared_by",
    )
    .eq("id", bolId)
    .eq("quote_request_id", quoteRequestId)
    .maybeSingle<BolPdfRow>();

  if (bolErr) {
    return NextResponse.json(
      { error: `BOL lookup failed: ${bolErr.message}` },
      { status: 500 },
    );
  }
  if (!bol) {
    return NextResponse.json({ error: "BOL not found." }, { status: 404 });
  }

  // Resolve the finalized-quote cross-reference number — surfaces in
  // the meta strip so the BOL declares its parent commercial record.
  let finalizedQuoteNumber: string | null = null;
  if (bol.finalized_quote_id) {
    const { data: fq } = await sb
      .from("finalized_quotes")
      .select("finalized_quote_number")
      .eq("id", bol.finalized_quote_id)
      .maybeSingle<{ finalized_quote_number: string }>();
    finalizedQuoteNumber = fq?.finalized_quote_number ?? null;
  }

  const data: BillOfLadingPdfData = {
    bolNumber: bol.bol_number,
    dispatchReference: bol.dispatch_reference,
    finalizedQuoteNumber,
    issueDate: bol.issue_date ?? new Date().toISOString().slice(0, 10),

    shipper: {
      company: bol.shipper_company,
      contactName: bol.shipper_contact_name,
      contactPhone: bol.shipper_contact_phone,
      contactEmail: bol.shipper_contact_email,
      addressLine1: bol.shipper_address_line1,
      addressLine2: bol.shipper_address_line2,
      city: bol.shipper_city,
      state: bol.shipper_state,
      zip: bol.shipper_zip,
      pickupWindow: bol.pickup_window,
      pickupInstructions: bol.pickup_instructions,
    },
    consignee: {
      company: bol.consignee_company,
      contactName: bol.consignee_contact_name,
      contactPhone: bol.consignee_contact_phone,
      contactEmail: bol.consignee_contact_email,
      addressLine1: bol.consignee_address_line1,
      addressLine2: bol.consignee_address_line2,
      city: bol.consignee_city,
      state: bol.consignee_state,
      zip: bol.consignee_zip,
      deliveryWindow: bol.delivery_window,
      deliveryInstructions: bol.delivery_instructions,
    },
    freight: {
      commodity: bol.commodity,
      quantity: bol.quantity,
      handlingUnitsType: bol.handling_units_type,
      lengthIn: num(bol.length_in),
      widthIn: num(bol.width_in),
      heightIn: num(bol.height_in),
      weightLbs: num(bol.weight_lbs),
      nmfcCode: bol.nmfc_code,
      freightClass: bol.freight_class,
      hazmat: bol.hazmat,
      specialHandling: bol.special_handling,
    },
    ops: {
      driverAssistRequired: bol.driver_assist_required,
      tarpRequired: bol.tarp_required,
      permitsRequired: bol.permits_required,
      escortRequired: bol.escort_required,
      riggingRequired: bol.rigging_required,
      appointmentRequired: bol.appointment_required,
      specialInstructions: bol.special_instructions,
    },
    dispatchNotes: bol.dispatch_notes,
    preparedBy: bol.prepared_by,
  };

  let buffer: Buffer;
  try {
    buffer = await renderBolPdfBuffer(data);
  } catch (e) {
    console.error("[bol-pdf] render failed", {
      bolId: bol.id,
      message: e instanceof Error ? e.message : "unknown",
    });
    return NextResponse.json(
      { error: "Could not render the BOL PDF." },
      { status: 500 },
    );
  }

  const filename = `${bol.bol_number}.pdf`;
  return new Response(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
