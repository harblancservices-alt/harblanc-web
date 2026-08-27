"use client";

import { useEffect, useState } from "react";
import { DocThumb } from "../../../../_shell/DocThumb";
import { getSignedPdfUrl, openStoredPdf } from "../../../../shipments/pdfClient";
import { Micro } from "./chrome";

/**
 * THE BOL ITSELF — the left half of "What we know".
 *
 * "here's the document, here's what we pulled off it, here's what we know
 * beyond it." This is the first of those three.
 *
 * ── HOW IT FINDS THE FILE, AND WHY NOT THE OBVIOUS WAY ────────────────
 *
 * company -> crm_bol_entries -> crm_documents. NOT company ->
 * crm_documents, which is what every other document surface in the CRM
 * does, because `crm_documents.account_id` is NULL on 13 of the 14 BOL
 * PDFs — they were uploaded through the BOL Center and land under a
 * `bol-center/` storage path with no company on them. Filtering documents
 * by account_id finds one of the fourteen. Going through the parsed entry,
 * which carries both `matched_shipper_account_id` and `document_id`, finds
 * all of them. The join is done in page.tsx; this component receives the
 * result.
 *
 * ── NOTHING NEW WAS BUILT TO SHOW A PDF ───────────────────────────────
 *
 * DocThumb already resolves a stored document to a picture — a
 * server-rendered thumbnail when one exists, else a browser-side raster of
 * the first page via pdfjs, else a labelled file tile. getSignedPdfUrl and
 * openStoredPdf already handle the private `crm-documents` bucket. All
 * three are reused as-is. The signed URL is fetched on demand and is
 * short-lived (300s), which is why it is re-fetched when you switch
 * documents rather than held for the page's lifetime.
 *
 * ── BUILT FOR BULK ARRIVAL ────────────────────────────────────────────
 *
 * The parsing pipeline lives OUTSIDE this app by design: Brent photographs
 * BOL pages, they collect in storage, and a separate Claude session reads
 * and parses them into crm_bol_entries. So a company can go from zero BOLs
 * to a dozen between two page loads, and this has to cope with that
 * without a change. Hence a real document switcher rather than an
 * assumption of one file, ordered newest first, with the count stated.
 */

export type BolDoc = {
  entryId: string;
  bolNumber: string | null;
  /** Free text out of the parse — displayed, never parsed for sorting here
   * (page.tsx orders the list). */
  pickupDate: string | null;
  fileName: string;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
};

export function BolViewer({ docs }: { docs: BolDoc[] }) {
  const [index, setIndex] = useState(0);
  const current = docs[index] ?? null;
  const path = current?.storagePath ?? null;

  /**
   * ONE piece of state carrying the path it belongs to, rather than a `url`
   * plus a `failed` flag reset at the top of the effect.
   *
   * react-hooks/set-state-in-effect forbids a setState in an effect BODY,
   * and rightly — clearing the URL synchronously on every path change is a
   * second render whose only job is to undo the first. DocThumb solves the
   * same problem the same way (see its `startedFor` note): every setState
   * happens inside the async callback. Staleness is then handled by
   * COMPARING rather than clearing — if the resolved path is not the path
   * being displayed, it is simply ignored.
   */
  const [signed, setSigned] = useState<{
    path: string;
    url: string | null;
    failed: boolean;
  } | null>(null);

  useEffect(() => {
    if (!path) return;
    let live = true;
    getSignedPdfUrl(path)
      .then((u) => {
        if (live) setSigned({ path, url: u, failed: !u });
      })
      .catch(() => {
        if (live) setSigned({ path, url: null, failed: true });
      });
    return () => {
      live = false;
    };
  }, [path]);

  const resolved = signed && signed.path === path ? signed : null;
  const url = resolved?.url ?? null;
  const failed = resolved?.failed ?? false;

  // ── The normal case: 93 of 99 companies. Deliberate, not broken. ──
  if (docs.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="h-8 w-8 fill-none stroke-line-strong stroke-[1.5]"
        >
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
          <path d="M14 3v5h5" />
        </svg>
        <p className="mt-3 text-[13px] font-bold text-fg">No bill of lading on file</p>
        <p className="mx-auto mt-1 max-w-[38ch] text-[12.5px] leading-relaxed text-fg-subtle">
          When one of their BOLs is scanned and parsed, the document appears here
          and the facts read off it fill the panel beside this one.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* ── Switcher. Only drawn when there is something to switch. ── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
        <Micro className="text-fg-muted">Document</Micro>
        <span className="text-[11.5px] text-fg-subtle">
          {docs.length === 1 ? "1 on file" : `${index + 1} of ${docs.length}`}
        </span>

        {docs.length > 1 && (
          <div className="ml-auto flex items-center gap-1">
            {docs.map((d, i) => (
              <button
                key={d.entryId}
                type="button"
                onClick={() => setIndex(i)}
                aria-pressed={i === index}
                title={d.bolNumber ? `BOL #${d.bolNumber}` : d.fileName}
                className={`rounded-[3px] border px-2 py-1 text-[11px] font-bold transition-colors crm-num ${
                  i === index
                    ? "border-accent bg-accent text-white"
                    : "border-line bg-card text-fg-muted hover:border-accent hover:text-accent"
                }`}
              >
                {d.bolNumber ? `#${d.bolNumber}` : i + 1}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── The page image ────────────────────────────────────────── */}
      <div className="flex flex-1 items-start justify-center bg-inset p-4">
        {failed ? (
          <p className="py-10 text-center text-[12.5px] text-fg-subtle">
            The file could not be opened. It is still on the record — try Open
            below, or the document may have been removed from storage.
          </p>
        ) : (
          <DocThumb
            // Keyed on the path so switching documents remounts rather than
            // showing the previous page while the new URL is signed.
            key={current!.storagePath}
            previewUrl={url}
            fileName={current!.fileName}
            mimeType={current!.mimeType}
            sizeBytes={current!.sizeBytes}
            className="h-[420px] w-full max-w-[520px] rounded-md border border-line-strong bg-card"
          />
        )}
      </div>

      {/* ── What it is, and how to open it properly ───────────────── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-4 py-2.5">
        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-fg" title={current!.fileName}>
          {current!.bolNumber ? `BOL #${current!.bolNumber}` : current!.fileName}
        </span>
        {current!.pickupDate && (
          <span className="shrink-0 text-[11.5px] text-fg-subtle crm-num">
            {current!.pickupDate}
          </span>
        )}
        <button
          type="button"
          onClick={() => void openStoredPdf(current!.storagePath)}
          className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-[12px] font-bold text-white transition-colors hover:bg-accent-hover"
        >
          Open
        </button>
        <button
          type="button"
          onClick={() => void openStoredPdf(current!.storagePath, current!.fileName)}
          className="shrink-0 text-[12px] font-bold text-accent hover:underline"
        >
          Download
        </button>
      </div>
    </div>
  );
}
