import type { Metadata } from "next";
import { PagePreviewLab, type PageTarget } from "@/components/tms-v2/previews/PagePreviewLab";
import { PageScroll } from "@/components/tms-v2/ui/PageScroll";

/**
 * /tms-v2/previews/pages — ported from /admin/previews' AdminPreviewLab,
 * restricted to the "route" targets (customer forms/views). The routes
 * themselves stay at /admin/previews/... — this viewer just iframes them
 * same-origin (shared auth session with /admin, per Phase 1), so no page
 * markup is duplicated into /tms-v2.
 */

export const metadata: Metadata = {
  title: "Page previews",
  robots: { index: false, follow: false },
};

const TARGETS: PageTarget[] = [
  { classification: "customer_form", quote: true, id: "quote", title: "Quick Quote — customer quote form", route: "/admin/previews/quote" },
  {
    classification: "customer_form",
    quote: true,
    id: "confirm-shipment",
    title: "Confirm shipment details — customer form",
    route: "/admin/previews/confirm-shipment",
  },
  {
    classification: "customer_form",
    quote: true,
    id: "finalize-pending",
    title: "Confirm rate — customer quote form",
    route: "/admin/previews/finalize-pending",
  },
  { classification: "customer_form", quote: true, id: "decline", title: "Decline quote — customer form", route: "/admin/previews/decline" },
  { classification: "customer_form", id: "payment", title: "Pay invoice — customer form (mockup)", route: "/admin/previews/payment" },
  { classification: "customer_view", id: "home", title: "Home page — customer view", route: "/admin/previews/home" },
  {
    classification: "customer_view",
    quote: true,
    id: "quote-success",
    title: "Quote request sent — customer view",
    route: "/admin/previews/quote-success",
  },
  {
    classification: "customer_view",
    quote: true,
    id: "finalize-confirmed",
    title: "Rate confirmed — customer view",
    route: "/admin/previews/finalize-confirmed",
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
