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
 *   - The Confirm Shipment Details preview is a separate admin-only
 *     route at /admin/previews/confirm-shipment that recreates the
 *     customer page's chrome with sample data and disables the form
 *     via <fieldset disabled> so no server actions can fire. The Lab
 *     loads it inside the modal's iframe.
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
      subtitle:
        "Public-facing landing page at /. Renders the real Home component along with the public Navbar and Footer so the operator sees what a first-time visitor would. No forms - preview is read-only by nature.",
      route: "/admin/previews/home",
    },
    {
      kind: "route",
      classification: "customer_page",
      id: "quote",
      title: "Quick Quote form",
      subtitle:
        "Public-facing Quick Quote landing page. The QuoteForm component is wrapped in <fieldset disabled> so submission, uploads, and validation cannot fire in preview mode.",
      route: "/admin/previews/quote",
    },
    {
      kind: "route",
      classification: "customer_page",
      id: "quote-success",
      title: "Quick Quote success",
      subtitle:
        "Confirmation page the customer lands on after submitting the Quick Quote form. Sets the within-the-hour dispatch reply expectation and exposes a direct phone CTA.",
      route: "/admin/previews/quote-success",
    },
{
      kind: "route",
      classification: "customer_page",
      id: "confirm-shipment",
      title: "Confirm shipment details",
      subtitle:
        "Customer-facing intake screen the recipient lands on after clicking Accept Range. Inputs are disabled in preview mode — no submission can fire.",
      route: "/admin/previews/confirm-shipment",
    },
    {
      kind: "route",
      classification: "customer_page",
      id: "finalize-pending",
      title: "Confirm Finalized Quote (pending)",
      subtitle:
        "Rate-confirmation page in its pre-confirm state — Confirm button visible. The ConfirmButton component is wrapped in <fieldset disabled> so the confirmFinalizedQuote server action cannot fire in preview mode.",
      route: "/admin/previews/finalize-pending",
    },
    {
      kind: "route",
      classification: "customer_page",
      id: "finalize-confirmed",
      title: "Finalized Quote Confirmed (success)",
      subtitle:
        "Rate-confirmation page in its post-confirm success state — green Confirmed panel with timestamp. No interactive controls render in this state on the production page.",
      route: "/admin/previews/finalize-confirmed",
    },
    {
      kind: "route",
      classification: "customer_page",
      id: "payment",
      title: "Payment (awaiting)",
      subtitle:
        "Customer-facing payment screen shown inline after Confirm Finalized Quote. Mockup only \u2014 Stripe SDK not loaded, no payment can occur. Used to iterate on the visual + copy before wiring real payments.",
      route: "/admin/previews/payment",
    },
    {
      kind: "route",
      classification: "customer_page",
      id: "decline",
      title: "Decline quote",
      subtitle:
        "Customer-facing decline page. The DeclineForm is wrapped in <fieldset disabled> so the declineEstimate server action cannot fire in preview mode. Shows the primary decline state — already-declined and already-accepted branches are not previewed.",
      route: "/admin/previews/decline",
    },
    {
      kind: "email",
      classification: "customer_email",
      order: 1,
      id: "acknowledgement",
      title: "Request acknowledged",
      subtitle:
        "Sent immediately after a customer submits the Quick Quote form — confirms the request landed and sets the dispatch SLA expectation.",
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
      subtitle:
        "Range proposal sent from the Quote Range workspace. Sample payload omits accept/decline URLs to mirror Build Preview before send time.",
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
      subtitle:
        "Rate confirmation sent from the Finalized Quote workspace after the customer submits intake. Sample includes a single accessorial line.",
      subject: fq.subject,
      to: fq.to,
      html: fq.html,
    },
    {
      kind: "email",
      classification: "in_house_doc",
      id: "bol",
      title: "Bill of lading",
      subtitle:
        "In-house only — internal carrier paperwork generated from a sent Finalized Quote. Includes NMFC, freight class, dispatch reference, and handling instructions. Reuses the email renderer for layout but ships internally rather than as a customer email.",
      subject: bol.subject,
      to: bol.to,
      html: bol.html,
    },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="mb-4">
        <p className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-red-600">
          <span aria-hidden className="inline-block h-3 w-1 bg-red-600" />
          Preview lab
        </p>
        <h1 className="mt-2 text-2xl font-bold text-fg">
          Visual QA for every customer-facing asset.
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-fg">
          Click Preview on any tile to open the asset full-screen. Email
          previews render the exact bytes the production renderer
          produces from the sample payload. The Confirm shipment details
          tile loads the real customer page with submission disabled.
        </p>
      </header>
      <AdminPreviewLab targets={targets} />
    </div>
  );
}
