import type { Metadata } from "next";
import { renderAcknowledgementEmail, renderEstimateEmail } from "@/lib/email/render";
import { renderFinalizedQuoteEmail } from "@/lib/email/finalized-quote";
import { renderBolEmail } from "@/lib/email/bill-of-lading";
import {
  SAMPLE_ACKNOWLEDGEMENT_PAYLOAD,
  SAMPLE_BOL_PAYLOAD,
  SAMPLE_ESTIMATE_PAYLOAD,
  SAMPLE_FINALIZED_QUOTE_PAYLOAD,
} from "@/lib/preview/sample-data";
import { PageHeader } from "@/components/ui/PageHeader";
import { AdminPreviewLab, type PreviewTarget } from "./AdminPreviewLab";

/**
 * Admin Preview Lab — server entry point at /admin/previews.
 *
 * This page renders every customer-facing email template AND the
 * Confirm Shipment Details intake page using sample data, so the
 * operator can do visual QA from one place without sending real emails,
 * creating real loads, or mutating any production records.
 *
 * Rendering strategy:
 *   - Email previews go through the EXACT renderer the production send
 *     path uses (renderAcknowledgementEmail, renderEstimateEmail,
 *     renderFinalizedQuoteEmail, renderBolEmail). The rendered HTML
 *     is passed as a string to the client component and shown via
 *     iframe srcDoc — identical bytes the recipient would see if the
 *     same payload reached Resend.
 *   - The customer-page previews are separate admin-only routes under
 *     /admin/previews/... that recreate the customer page's chrome with
 *     sample data and disable every form via <fieldset disabled> so no
 *     server actions can fire. The Lab loads them in the modal iframe.
 *
 * Finalized Quote and BOL ship as email-only documents in the current
 * workflow, so the email preview IS the document.
 */

export const metadata: Metadata = {
  title: "Preview lab",
  robots: { index: false, follow: false },
};

export default function AdminPreviewsPage() {
  // Render every email server-side with sample payloads. Each call
  // returns the full {subject, html, text, to, from, replyTo, preheader}
  // bundle the production send path consumes — we just keep the bytes
  // local instead of handing them to Resend.
  const ack = renderAcknowledgementEmail(SAMPLE_ACKNOWLEDGEMENT_PAYLOAD);
  const estimate = renderEstimateEmail(SAMPLE_ESTIMATE_PAYLOAD);
  const fq = renderFinalizedQuoteEmail(SAMPLE_FINALIZED_QUOTE_PAYLOAD);
  const bol = renderBolEmail(SAMPLE_BOL_PAYLOAD);

  // Classification answers "who sees this, and do they type into it?".
  // Titles are written to stand alone — the name should tell the operator
  // what the asset is and who it is for without opening it.
  const targets: PreviewTarget[] = [
    // ── Customer forms — the customer fills these in and submits ──
    {
      kind: "route",
      classification: "customer_form",
      quote: true,
      id: "quote",
      title: "Quick Quote — customer quote form",
      route: "/admin/previews/quote",
    },
    {
      kind: "route",
      classification: "customer_form",
      quote: true,
      id: "confirm-shipment",
      title: "Confirm shipment details — customer form",
      route: "/admin/previews/confirm-shipment",
    },
    {
      kind: "route",
      classification: "customer_form",
      quote: true,
      id: "finalize-pending",
      title: "Confirm rate — customer quote form",
      route: "/admin/previews/finalize-pending",
    },
    {
      kind: "route",
      classification: "customer_form",
      quote: true,
      id: "decline",
      title: "Decline quote — customer form",
      route: "/admin/previews/decline",
    },
    {
      kind: "route",
      classification: "customer_form",
      id: "payment",
      title: "Pay invoice — customer form (mockup)",
      route: "/admin/previews/payment",
    },
    // ── Customer views — the customer reads these, no input ──
    {
      kind: "route",
      classification: "customer_view",
      id: "home",
      title: "Home page — customer view",
      route: "/admin/previews/home",
    },
    {
      kind: "route",
      classification: "customer_view",
      quote: true,
      id: "quote-success",
      title: "Quote request sent — customer view",
      route: "/admin/previews/quote-success",
    },
    {
      kind: "route",
      classification: "customer_view",
      quote: true,
      id: "finalize-confirmed",
      title: "Rate confirmed — customer view",
      route: "/admin/previews/finalize-confirmed",
    },
    // ── Emails — sent to the customer's inbox, in send order ──
    {
      kind: "email",
      classification: "email",
      quote: true,
      id: "acknowledgement",
      title: "Quote request received — email",
      subject: ack.subject,
      to: ack.to,
      html: ack.html,
    },
    {
      kind: "email",
      classification: "email",
      quote: true,
      id: "estimate",
      title: "Quote range proposal — email",
      subject: estimate.subject,
      to: estimate.to,
      html: estimate.html,
    },
    {
      kind: "email",
      classification: "email",
      quote: true,
      id: "finalized-quote",
      title: "Rate confirmation — email",
      subject: fq.subject,
      to: fq.to,
      html: fq.html,
    },
    // ── Backend / internal — staff only, never served to a customer ──
    {
      kind: "email",
      classification: "internal",
      id: "bol",
      title: "Bill of lading — internal carrier paperwork",
      subject: bol.subject,
      to: bol.to,
      html: bol.html,
    },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <PageHeader eyebrow="Settings" title="Preview lab" className="mb-4" />
      <AdminPreviewLab targets={targets} />
    </div>
  );
}
