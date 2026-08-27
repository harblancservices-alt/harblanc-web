"use client";

import { useEffect, useState } from "react";
import { getSignedPdfUrl } from "../../../../shipments/pdfClient";

/**
 * THE BOL ITSELF — the left half of "What we know", and nothing else.
 *
 * Brent: "the BOL needs to be a full version good quality still on the side
 * there. no side boarders or anything just the viewer itself."
 *
 * ── A REAL EMBED, NOT A RASTER ────────────────────────────────────────
 *
 * This used to be DocThumb, which rasters page one at 320 CSS px wide. That
 * is a thumbnail: fine for a document tile in a list, useless for reading a
 * scanned dock receipt — you could see there was a form, not what it said.
 * And it is page ONE only, which would silently hide pages 2-n of a
 * multi-page BOL.
 *
 * So the PDF is embedded natively instead. The browser's own PDF viewer
 * renders it at full resolution from the vector/scan data, gives every page
 * with scroll and page navigation, and brings zoom, search, print and save
 * with it. There is no resolution to quote because there is no raster — it
 * re-renders as you zoom, exactly like opening the file. Nothing we could
 * draw to a canvas would beat that, and a canvas would have needed a
 * page-picker, a zoom control and a scroll container written by hand.
 *
 * It also deletes work: the Open/Download buttons this panel used to carry
 * are in the viewer's own toolbar now, which is why they are gone.
 *
 * ── NO CHROME ─────────────────────────────────────────────────────────
 *
 * No card, no header bar, no padding frame, no border of its own. The
 * document sits directly on the column, edge to edge; the only line near it
 * is the divider between the two halves, which belongs to the layout rather
 * than to the viewer. The multi-BOL switcher floats OVER the top-left of
 * the document rather than sitting in a bar above it, so it cannot
 * reintroduce the frame that was just removed — and it only exists at all
 * when there is more than one document to switch between.
 *
 * ── LOADED ONLY WHEN LOOKED AT ────────────────────────────────────────
 *
 * These scans are 288KB-5.2MB and 93 of 99 companies have no BOL at all, so
 * fetching one on every company page load would be waste on almost every
 * visit. Neither the signed URL nor the PDF is requested until the What we
 * know tab is actually opened; once opened the iframe stays mounted, so
 * switching away and back is instant.
 *
 * The gate is an explicit `active` prop threaded down from FileBody, which
 * owns the open tab — NOT an IntersectionObserver. The observer was tried
 * first and does not fire reliably when an ancestor's `hidden` attribute is
 * removed: the element gains a box, but the callback did not run, so the
 * viewer stayed blank on a tab that was plainly on screen. A boolean that
 * says "this tab is open" is the thing actually being asked about, and it
 * cannot be wrong about it.
 */

export type BolDoc = {
  entryId: string;
  bolNumber: string | null;
  pickupDate: string | null;
  fileName: string;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
  /** ── The rest of the parse. Rendered by the fields column beside this,
   * not here; carried on the same object because they describe the same
   * document and splitting them would let the two halves disagree. */
  carrier: string | null;
  shipperName: string | null;
  shipperAddress: string | null;
  consigneeName: string | null;
  consigneeAddress: string | null;
  billTo: string | null;
  commodity: string | null;
  weight: string | null;
  deliveryDate: string | null;
  reference: string | null;
  notes: string | null;
};

export function BolViewer({
  docs,
  index,
  onIndex,
  active,
}: {
  docs: BolDoc[];
  index: number;
  onIndex: (i: number) => void;
  /** True once the What we know tab has been opened. Nothing is fetched
   * before that — see the note above. */
  active: boolean;
}) {
  const current = docs[index] ?? null;
  const path = current?.storagePath ?? null;

  /**
   * The signed URL, carrying the path it belongs to.
   *
   * This doubles as the "already loaded" latch, which is why there is no
   * second piece of state for that: the panel is HIDDEN rather than
   * unmounted when you leave the tab, so once this is set it survives, the
   * iframe stays mounted, and coming back is instant. Gating only the FETCH
   * on `active` therefore gets the latch for free — and a `setState` inside
   * an effect body to track "has been active", which is what the extra
   * state would have needed, is exactly what react-hooks/set-state-in-effect
   * forbids.
   *
   * Every setState here happens in an async callback, and staleness is
   * handled by comparing the path rather than clearing on change.
   */
  const [signed, setSigned] = useState<{ path: string; url: string | null } | null>(null);

  useEffect(() => {
    if (!active || !path) return;
    let live = true;
    getSignedPdfUrl(path)
      .then((u) => {
        if (live) setSigned({ path, url: u });
      })
      .catch(() => {
        if (live) setSigned({ path, url: null });
      });
    return () => {
      live = false;
    };
  }, [active, path]);

  const resolved = signed && signed.path === path ? signed : null;

  // ── The normal case: 93 of 99 companies. Deliberate, not broken. ──
  if (docs.length === 0) {
    return (
      <div className="flex h-full min-h-[420px] flex-col items-center justify-center px-6 py-12 text-center">
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
          and the fields read off it fill the panel beside this one.
        </p>
      </div>
    );
  }

  return (
    /* FILLS ITS COLUMN. This was a flat min-h-[680px], which on a
       1256-tall screen clipped the portrait document while leaving ~400px
       of dead grey below the panel; then briefly calc(100vh-300px), which
       is right only for whatever header height it was measured against.
       Now it simply fills, via a flex chain from CompanyFile's
       min-h-screen, so it grows with the screen and does not care how tall
       the chrome above it happens to be. The min is a floor for short
       laptops, not the mechanism. */
    <div className="relative h-full min-h-[520px] bg-inset">
      {resolved?.url ? (
        <iframe
          // Remount per document so the viewer resets to page one rather
          // than holding the previous file's scroll position.
          key={current!.storagePath}
          src={resolved.url}
          title={current!.bolNumber ? `BOL ${current!.bolNumber}` : current!.fileName}
          className="h-full w-full border-0"
        />
      ) : resolved && !resolved.url ? (
        <p className="px-6 py-16 text-center text-[12.5px] text-fg-subtle">
          This document could not be opened. The record still points at{" "}
          <span className="font-semibold">{current!.fileName}</span> — it may have
          been removed from storage.
        </p>
      ) : (
        <p className="px-6 py-16 text-center text-[12.5px] text-fg-subtle">
          {active ? "Opening the document…" : ""}
        </p>
      )}

      {/* Floats OVER the document rather than sitting in a bar above it —
          a bar would be exactly the frame that was just taken away. Only
          rendered when there is something to switch between. */}
      {docs.length > 1 && (
        <div className="absolute left-3 top-3 flex items-center gap-1 rounded-md bg-graphite/85 p-1 shadow-e1 backdrop-blur-sm">
          {docs.map((d, i) => (
            <button
              key={d.entryId}
              type="button"
              onClick={() => onIndex(i)}
              aria-pressed={i === index}
              title={d.bolNumber ? `BOL #${d.bolNumber}` : d.fileName}
              className={`rounded px-2 py-1 text-[11px] font-bold transition-colors crm-num ${
                i === index ? "bg-card text-fg" : "text-white/70 hover:text-white"
              }`}
            >
              {d.bolNumber ? `#${d.bolNumber}` : i + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
