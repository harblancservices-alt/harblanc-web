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

  const targets: PreviewTarget[] = [
    {
      kind: "route",
      classification: "customer_page",
      id: "home",
      title: "Home / landing page",
      route: "/admin/previews/home",
    },
    {
      kind: "route",
      classification: "customer_page",
      id: "quote",
      title: "Quick Quote form",
      route: "/admin/previews/quote",
    },
    {
      kind: "route",
      classification: "customer_page",
      id: "quote-success",
      title: "Quick Quote success",
      route: "/admin/previews/quote-success",
    },
    {
      kind: "route",
      classification: "customer_page",
      id: "confirm-shipment",
      title: "Confirm shipment details",
      route: "/admin/previews/confirm-shipment",
    },
    {
      kind: "route",
      classification: "customer_page",
      id: "finalize-pending",
      title: "Confirm Finalized Quote (pending)",
      route: "/admin/previews/finalize-pending",
    },
    {
      kind: "route",
      classification: "customer_page",
      id: "finalize-confirmed",
      title: "Finalized Quote Confirmed (success)",
      route: "/admin/previews/finalize-confirmed",
    },
    {
      kind: "route",
      classification: "customer_page",
      id: "payment",
      title: "Payment (awaiting)",
      route: "/admin/previews/payment",
    },
    {
      kind: "route",
      classification: "customer_page",
      id: "decline",
      title: "Decline quote",
      route: "/admin/previews/decline",
    },
    {
      kind: "email",
      classification: "customer_email",
      order: 1,
      id: "acknowledgement",
      title: "Request acknowledged",
      subject: ack.subject,
      to: ack.to,
      html: ack.html,
    },
    {
      kind: "email",
      classification: "customer_email",
      order: 2,
      id: "estimate",
      title: "Quote range / range proposal",
      subject: estimate.subject,
      to: estimate.to,
      html: estimate.html,
    },
    {
      kind: "email",
      classification: "customer_email",
      order: 3,
      id: "finalized-quote",
      title: "Finalized quote",
      subject: fq.subject,
      to: fq.to,
      html: fq.html,
    },
    {
      kind: "email",
      classification: "in_house_doc",
      id: "bol",
      title: "Bill of lading",
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
