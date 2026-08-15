"use client";

import { useState } from "react";
import { DocumentPreviewModal, type PreviewDoc } from "@/components/tms-v2/ui/DocumentPreviewModal";
import type { LoadRateConDoc } from "@/lib/data/loads";

/** Dashboard's single "View rate con" quick action on the active-load card
 * (Brent, 2026-08-15) — opens the same signed-URL doc viewer Load Detail's
 * Documents section and the Broker profile's LoadDocButtons already use
 * (DocumentPreviewModal), not a new mechanism. Its own click has to
 * stopPropagation() out of the card's enclosing stretched <Link>, same
 * trick ActiveLoadRowAction/LoadDocButtons use. */
export function ActiveLoadRateConButton({ doc }: { doc: LoadRateConDoc }) {
  const [open, setOpen] = useState(false);
  const previewDoc: PreviewDoc = { name: doc.name, url: doc.url, isImage: (doc.mime ?? "").startsWith("image/") };

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className="h-7 shrink-0 rounded-md bg-info px-2.5 text-[12px] font-medium text-white hover:bg-info-hover"
      >
        View rate con
      </button>
      <DocumentPreviewModal open={open} onClose={() => setOpen(false)} doc={previewDoc} />
    </>
  );
}
