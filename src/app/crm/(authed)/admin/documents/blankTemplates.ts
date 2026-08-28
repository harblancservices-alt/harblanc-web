import type { BrokerProfile } from "../../_shell/brokerProfile";
import { renderCrmRateConfirmationPdfBuffer } from "@/lib/pdf/renderCrmRateConfirmationPdf";
import type { CrmRateConfirmationPdfData } from "@/lib/pdf/CrmRateConfirmationPDF";
import { renderCrmShipmentBolPdfBuffer } from "@/lib/pdf/renderCrmShipmentBolPdf";
import type { CrmShipmentBolPdfData } from "@/lib/pdf/CrmShipmentBolPDF";
import type { AdminBlankTemplateType } from "../types";

/**
 * THE BLANK MASTER TEMPLATES — a blank copy of the real shipment-generated
 * BOL / Rate Confirmation, rendered through the exact same
 * @react-pdf/renderer components the live generator uses
 * (shipments/bol-actions.ts, shipments/rate-confirmation-actions.ts), with
 * every shipment/carrier/line field left blank instead of real transaction
 * data. That is the whole point: the master on file and the document a
 * carrier receives are the same document, produced by one renderer.
 *
 * ── WHY THIS FILE CAME BACK ───────────────────────────────────────────
 *
 * It used to live at settings/blankTemplates.ts and was deleted with the
 * Settings section in 966cc15, on the reasoning that a filled Documents-tab
 * card is just preview + View doc with nothing to regenerate from. The
 * consequence showed up on 2026-08-27: the stored masters were a frozen
 * render from 16 Aug, so a fix to the BOL's Third Party Bill To box (short,
 * misaligned) and the removal of its "N/A" placeholder reached every new
 * BOL while the master Brent keeps on file silently kept the old layout for
 * eleven days. Nobody could re-run the generator because it no longer
 * existed.
 *
 * So it is restored, next to the tab that owns these cards, and wired to a
 * Regenerate control — the durable answer to "the template drifted".
 *
 * SERVER-ONLY — pulls in @react-pdf/renderer's Node-only PDF components
 * (brandLogo.ts reads the logo off disk via `fs`). Never import from a
 * "use client" file. Deliberately NOT a "use server" module: it exports a
 * plain helper, and only ./actions.ts (which is "use server") calls it.
 */

/** Every stop/party field left null so the PDF's own "—" blank-field
 * fallback renders — same shape both RC (StopInfo) and BOL (PartyInfo)
 * blank cards need; pickup/delivery/shipper/consignee are structurally
 * identical minus RC's extra window/number/notes fields. */
const BLANK_STOP = {
  name: null,
  address: null,
  city: null,
  state: null,
  zip: null,
  contact: null,
  phone: null,
  dateLabel: null,
  timeLabel: null,
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

export const BLANK_TEMPLATE_FILE_NAME: Record<AdminBlankTemplateType, string> = {
  bill_of_lading: "Bill of Lading Template.pdf",
  rate_confirmation: "Rate Confirmation Template.pdf",
};

/** Storage folder segment, matching the paths the original generator wrote
 * (`<org>/org-docs/bill-of-lading/...`). Regeneration overwrites the row's
 * EXISTING path, so this is only used when a slot has no file at all. */
export const BLANK_TEMPLATE_SLUG: Record<AdminBlankTemplateType, string> = {
  bill_of_lading: "bill-of-lading",
  rate_confirmation: "rate-confirmation",
};

/**
 * Render one blank master template. `broker` is the live letterhead from
 * Settings → Broker Profile, so regenerating also picks up a corrected
 * address or MC number without any separate step.
 */
export async function buildBlankTemplateBuffer(
  docType: AdminBlankTemplateType,
  broker: BrokerProfile,
): Promise<Buffer> {
  if (docType === "rate_confirmation") {
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
    return renderCrmRateConfirmationPdfBuffer(pdfData);
  }

  const pdfData: CrmShipmentBolPdfData = {
    bolNumber: "",
    date: "",
    loadRef: null,
    broker,
    shipper: BLANK_PARTY,
    consignee: BLANK_PARTY,
    pickupDate: null,
    // Added to the type after this generator was first written; blank here
    // for the same reason every other field is.
    pickupTimeLabel: null,
    deliveryDate: null,
    deliveryTimeLabel: null,
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
  return renderCrmShipmentBolPdfBuffer(pdfData);
}
