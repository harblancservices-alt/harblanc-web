import type { Metadata } from "next";
import FinalizePendingPreviewPage from "@/components/previews/FinalizePendingPreview";

export const metadata: Metadata = {
  title: "Confirm Finalized Quote — preview (pending)",
  robots: { index: false, follow: false },
};

export default FinalizePendingPreviewPage;
