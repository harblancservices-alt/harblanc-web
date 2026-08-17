import type { Metadata } from "next";
import { PagePreviewLab, type PageTarget } from "@/components/tms-v2/previews/PagePreviewLab";
import { PageScroll } from "@/components/tms-v2/ui/PageScroll";

/**
 * /tms-v2/previews/pages — ported from /admin/previews' AdminPreviewLab,
 * restricted to the "route" targets (customer forms/views). The preview
 * page content itself lives in src/components/previews/*.tsx, shared
 * with /admin/previews/... (retirement-readiness Objective 1D) — each
 * app has its own thin page.tsx wrapper at the matching route below, so
 * this viewer iframes tms-v2's own routes rather than admin's.
 */

export const metadata: Metadata = {
  title: "Page previews",
  robots: { index: false, follow: false },
};

const TARGETS: PageTarget[] = [
  { classification: "customer_form", quote: true, id: "quote", title: "Quick Quote — customer quote form", route: "/tms-v2/previews/pages/quote" },
  {
    classification: "customer_form",
    quote: true,
    id: "confirm-shipment",
    title: "Confirm shipment details — customer form",
    route: "/tms-v2/previews/pages/confirm-shipment",
  },
  {
    classification: "customer_form",
    quote: true,
    id: "finalize-pending",
    title: "Confirm rate — customer quote form",
    route: "/tms-v2/previews/pages/finalize-pending",
  },
  { classification: "customer_form", quote: true, id: "decline", title: "Decline quote — customer form", route: "/tms-v2/previews/pages/decline" },
  { classification: "customer_form", id: "payment", title: "Pay invoice — customer form (mockup)", route: "/tms-v2/previews/pages/payment" },
  { classification: "customer_view", id: "home", title: "Home page — customer view", route: "/tms-v2/previews/pages/home" },
  {
    classification: "customer_view",
    quote: true,
    id: "quote-success",
    title: "Quote request sent — customer view",
    route: "/tms-v2/previews/pages/quote-success",
  },
  {
    classification: "customer_view",
    quote: true,
    id: "finalize-confirmed",
    title: "Rate confirmed — customer view",
    route: "/tms-v2/previews/pages/finalize-confirmed",
  },
];

export default function PagePreviewsPage() {
  return (
    <PageScroll>
      <div className="mx-auto max-w-6xl">
        <PagePreviewLab targets={TARGETS} />
      </div>
    </PageScroll>
  );
}
