import { PageHeader } from "@/components/tms-v2/ui/PageHeader";
import { PageScroll } from "@/components/tms-v2/ui/PageScroll";
import { LoadInquiryComposer } from "./LoadInquiryComposer";

/**
 * Load Inquiry — a fast, one-off broker email tool: paste a load-board
 * line, confirm origin/destination, send. Replaces the tms-v2/load-inquiry
 * placeholder; reuses V1's parse/content/send logic unchanged
 * (self-contained by design — no templates, no markets, no suppression log).
 */
export default function LoadInquiryPage() {
  return (
    <PageScroll
      header={
        <PageHeader
          title="Load Inquiry"
          description="Paste a load-board line, confirm the lane, send a one-off inquiry to the broker."
        />
      }
    >
      <LoadInquiryComposer />
    </PageScroll>
  );
}
