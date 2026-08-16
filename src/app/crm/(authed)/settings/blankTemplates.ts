import type { SupabaseClient } from "@supabase/supabase-js";
import type { CrmUser } from "@/lib/crm/auth";
import type { BrokerProfile } from "../_shell/brokerProfile";
import { renderCrmRateConfirmationPdfBuffer } from "@/lib/pdf/renderCrmRateConfirmationPdf";
import type { CrmRateConfirmationPdfData } from "@/lib/pdf/CrmRateConfirmationPDF";
import { renderCrmShipmentBolPdfBuffer } from "@/lib/pdf/renderCrmShipmentBolPdf";
import type { CrmShipmentBolPdfData } from "@/lib/pdf/CrmShipmentBolPDF";
import { renderPdfFirstPageToPng } from "@/lib/pdf/pdfPageThumbnail";
import type { GeneratedTemplateLabel } from "./templateLabels";

/**
 * The two Documents-tab cards backed by a code-generated PDF (as opposed to
 * an admin-uploaded file) — Brent's "billing template" (Bill of Lading) and
 * "ratecon" request: a blank copy of the real shipment-generated RC/BOL,
 * rendered through the exact same @react-pdf/renderer components
 * (CrmRateConfirmationPDF / CrmShipmentBolPDF) the live generator in
 * shipments/rate-confirmation-actions.ts / bol-actions.ts uses, just with
 * every shipment/carrier/line field left blank instead of real transaction
 * data. Not a "use server" file — see document-lifecycle.ts for why this
 * plain-helper split exists: it's called directly from settings/page.tsx's
 * render (auto-seeding a missing template on first admin visit), where
 * calling revalidatePath during render throws Next 16's E7 — see
 * crm-shipments-new-create-on-render-crash-fix memory. There's no admin
 * button that calls this — Brent's call was a filled Documents-tab card is
 * just preview + View doc, nothing to regenerate from.
 *
 * SERVER-ONLY — pulls in @react-pdf/renderer's Node-only PDF components
 * (brandLogo.ts reads the logo file off disk via `fs`). Never import this
 * from a "use client" file; see templateLabels.ts for the client-safe label
 * list/type-guard split that exists specifically to avoid that.
 */

/** Every stop/party field left null so the PDF's own "—" blank-field
 * fallback renders — same shape both RC (StopInfo) and BOL (PartyInfo)
 * blank cards need, pickup/delivery/shipper/consignee are structurally
 * identical minus RC's extra window/number/notes fields. */
const BLANK_STOP = {
  name: null,
  address: null,
  city: null,
  state: null,
  zip: null,
  contact: null,
  phone: null,
  window: null,
  number: null,
  notes: null,
};

const BLANK_PARTY = {
  name: null,
  address: null,
  city: null,
  state: null,
  zip: null,
  contact: null,
  phone: null,
};

function slugify(label: string): string {
  const cleaned = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "document";
}

async function buildBlankTemplateBuffer(
  label: GeneratedTemplateLabel,
  broker: BrokerProfile,
): Promise<{ buffer: Buffer; fileName: string }> {
  if (label === "Rate Confirmation") {
    const pdfData: CrmRateConfirmationPdfData = {
      rcNumber: "",
      issuedDate: "",
      broker,
      shipment: {
        shipmentNumber: "",
        equipment: null,
        commodity: null,
        weight: null,
        pieces: null,
        poNumber: null,
        refNumbers: null,
        lengthIn: null,
        widthIn: null,
        heightIn: null,
      },
      pickup: BLANK_STOP,
      delivery: BLANK_STOP,
      carrier: { name: null, mc: null, dot: null, contact: null, phone: null, email: null },
      specialInstructions: null,
      lines: [],
      totalCarrierPay: 0,
      paymentTerms: null,
      quickPay: null,
      notes: null,
    };
    const buffer = await renderCrmRateConfirmationPdfBuffer(pdfData);
    return { buffer, fileName: "Rate Confirmation Template.pdf" };
  }

  const pdfData: CrmShipmentBolPdfData = {
    bolNumber: "",
    date: "",
    loadRef: null,
    broker,
    shipper: BLANK_PARTY,
    consignee: BLANK_PARTY,
    pickupDate: null,
    deliveryDate: null,
    poNumber: null,
    refNumbers: null,
    carrier: { name: null, mc: null, dot: null, truckNumber: null, trailerNumber: null },
    dimensions: { lengthIn: null, widthIn: null, heightIn: null },
    billToName: null,
    billToAddress: null,
    freightChargeTerms: null,
    specialInstructions: null,
    lineItems: [],
    codAmount: null,
    declaredValue: null,
  };
  const buffer = await renderCrmShipmentBolPdfBuffer(pdfData);
  return { buffer, fileName: "Bill of Lading Template.pdf" };
}

export type CreateBlankTemplateResult =
  | {
      ok: true;
      row: {
        id: string;
        fileName: string;
        storagePath: string;
        mimeType: string | null;
        sizeBytes: number | null;
        createdAt: string;
      };
    }
  | { ok: false; error: string };

/** Render + store a blank RC/BOL template as this label's current org_doc —
 * same crm_documents row shape and `<org_id>/org-docs/<slug>/...` storage
 * path any other Documents-tab upload uses, just PDF bytes produced by the
 * real generator instead of a browser-picked file. Caller owns
 * revalidatePath (never called here — see file header). */
export async function createBlankTemplateDocument(
  supabase: SupabaseClient,
  user: CrmUser,
  label: GeneratedTemplateLabel,
  broker: BrokerProfile,
): Promise<CreateBlankTemplateResult> {
  let buffer: Buffer;
  let fileName: string;
  try {
    ({ buffer, fileName } = await buildBlankTemplateBuffer(label, broker));
  } catch {
    return { ok: false, error: "Could not generate the template PDF. Please try again." };
  }

  const storagePath = `${user.orgId}/org-docs/${slugify(label)}/${crypto.randomUUID()}-${fileName}`;
  const { error: uploadError } = await supabase.storage
    .from("crm-documents")
    .upload(storagePath, buffer, { contentType: "application/pdf", upsert: false });
  if (uploadError) {
    return { ok: false, error: "Could not save the generated template. Please try again." };
  }

  // Card thumbnail — best-effort, at `<storagePath>.thumb.png` (a sibling
  // object, same org folder, no schema change needed). A failure here never
  // fails the template itself; the card just falls back to its category
  // icon (see page.tsx's thumbUrlByPath lookup / OrgDocumentsSection.tsx).
  const thumbResult = await renderPdfFirstPageToPng(buffer);
  if (thumbResult.ok) {
    await supabase.storage
      .from("crm-documents")
      .upload(`${storagePath}.thumb.png`, thumbResult.png, { contentType: "image/png", upsert: false });
  }

  const { data, error } = await supabase
    .from("crm_documents")
    .insert({
      org_id: user.orgId,
      user_id: user.id,
      kind: `org_doc:${label}`,
      file_name: fileName,
      storage_path: storagePath,
      mime_type: "application/pdf",
      size_bytes: buffer.byteLength,
    })
    .select("id, file_name, storage_path, mime_type, size_bytes, created_at")
    .single();

  if (error || !data) {
    return { ok: false, error: "Template generated, but could not save the document record." };
  }

  return {
    ok: true,
    row: {
      id: data.id as string,
      fileName: data.file_name as string,
      storagePath: data.storage_path as string,
      mimeType: data.mime_type as string | null,
      sizeBytes: data.size_bytes as number | null,
      createdAt: data.created_at as string,
    },
  };
}
