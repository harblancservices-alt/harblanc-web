"use client";

import { useState } from "react";
import { downloadFromUrl } from "@/lib/storage/client-download";

const ACTION_BUTTON =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-line-strong bg-card px-3 text-[13px] font-medium text-fg shadow-e1 transition-colors hover:bg-elevated disabled:opacity-60";

/**
 * Replaces the old "Record" button (Brent: "what is this, I think it
 * should be Download" — 2026-08-08). "Record" used to jump to the file's
 * parent load/service/quote, but via a hardcoded /admin/... href even when
 * viewed from /tms-v2/files — a cross-portal jump that never felt like
 * part of this app, which was the real source of the confusion. A real
 * Download (same fetch-to-blob-then-force-save technique
 * DocumentPreviewModal/DocViewer use, since a bare `download` attribute is
 * ignored on the storage host's cross-origin signed URL) is what he
 * actually wants here — a standalone Client Component since it needs
 * onClick + fetch, unlike the rest of this page's plain server-rendered
 * cards.
 */
export function FileDownloadButton({ url, name }: { url: string; name: string }) {
  const [downloading, setDownloading] = useState(false);

  async function onClick() {
    if (downloading) return;
    setDownloading(true);
    await downloadFromUrl(url, name);
    setDownloading(false);
  }

  return (
    <button type="button" onClick={() => void onClick()} disabled={downloading} aria-busy={downloading} className={ACTION_BUTTON}>
      {downloading ? "Saving…" : "Download"}
    </button>
  );
}
