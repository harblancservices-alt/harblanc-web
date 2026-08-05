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
import { EmailPreviewLab } from "@/components/tms-v2/previews/EmailPreviewLab";

/**
 * /tms-v2/previews/email — ported from /admin/previews-2's email
 * uniformity lab (v2-architecture.md's Previews phase). Same render
 * functions as the production send path AND /admin's preview labs — no
 * separate email code lives here, this just calls the same renderers.
 */

export const metadata: Metadata = {
  title: "Email previews",
  robots: { index: false, follow: false },
};

export default function EmailPreviewsPage() {
  const ack = renderAcknowledgementEmail(SAMPLE_ACKNOWLEDGEMENT_PAYLOAD);
  const estimate = renderEstimateEmail(SAMPLE_ESTIMATE_PAYLOAD);
  const fq = renderFinalizedQuoteEmail(SAMPLE_FINALIZED_QUOTE_PAYLOAD);
  const bol = renderBolEmail(SAMPLE_BOL_PAYLOAD);

  const emails = [
    { id: "acknowledgement", title: "Request acknowledged", subject: ack.subject, html: ack.html },
    { id: "estimate", title: "Quote range", subject: estimate.subject, html: estimate.html },
    { id: "finalized-quote", title: "Finalized quote", subject: fq.subject, html: fq.html },
    { id: "bol", title: "Bill of lading", subject: bol.subject, html: bol.html },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <EmailPreviewLab emails={emails} />
    </div>
  );
}
