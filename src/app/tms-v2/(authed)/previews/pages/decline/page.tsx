import type { Metadata } from "next";
import DeclinePreviewPage from "@/components/previews/DeclinePreview";

export const metadata: Metadata = {
  title: "Decline quote — preview",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <DeclinePreviewPage confirmShipmentHref="/tms-v2/previews/pages/confirm-shipment" />;
}
