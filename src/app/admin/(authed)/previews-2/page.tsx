import type { Metadata } from "next";
import {
  renderAcknowledgementEmail,
  renderEstimateEmail,
} from "@/lib/email/render";
import { renderFinalizedQuoteEmail } from "@/lib/email/finalized-quote";
import { renderBolEmail } from "@/lib/email/bill-of-lading";
import {
  SAMPLE_ACKNOWLEDGEMENT_PAYLOAD,
  SAMPLE_BOL_PAYLOAD,
  SAMPLE_ESTIMATE_PAYLOAD,
  SAMPLE_FINALIZED_QUOTE_PAYLOAD,
} from "@/lib/preview/sample-data";
import { EmailComparisonLab } from "./EmailComparisonLab";

/**
 * /admin/previews-2 — Email uniformity staging lab.
 *
 * Renders all 4 email templates side-by-side at native 600px width
 * for visual comparison and iteration. Same render functions as the
 * production send path AND the standard /admin/previews lab — there
 * is no separate email code here.
 *
 * Workflow:
 *   1. Iterate on shared shell.ts + per-email templates
 *   2. Confirm uniform header, typography, CTA, footer, spacing in this lab
 *   3. Verify in standard /admin/previews (responsive mobile + desktop)
 *   4. Push to production
 */

export const metadata: Metadata = {
  title: "Previews 2 — email uniformity lab",
  robots: { index: false, follow: false },
};

export default function PreviewsTwoPage() {
  const ack = renderAcknowledgementEmail(SAMPLE_ACKNOWLEDGEMENT_PAYLOAD);
  const estimate = renderEstimateEmail(SAMPLE_ESTIMATE_PAYLOAD);
  const fq = renderFinalizedQuoteEmail(SAMPLE_FINALIZED_QUOTE_PAYLOAD);
  const bol = renderBolEmail(SAMPLE_BOL_PAYLOAD);

  const emails = [
    {
      id: "acknowledgement",
      title: "Request acknowledged",
      subject: ack.subject,
      html: ack.html,
    },
    {
      id: "estimate",
      title: "Quote range",
      subject: estimate.subject,
      html: estimate.html,
    },
    {
      id: "finalized-quote",
      title: "Finalized quote",
      subject: fq.subject,
      html: fq.html,
    },
    {
      id: "bol",
      title: "Bill of lading",
      subject: bol.subject,
      html: bol.html,
    },
  ];

  return <EmailComparisonLab emails={emails} />;
}
