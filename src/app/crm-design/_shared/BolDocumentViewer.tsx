"use client";

import { useState } from "react";
import { Badge, TEXT } from "../_design/ui";
import { IconZoom } from "../_design/icons";
import { formatDateTime } from "../_lib/format";
import type { BolRecord } from "../_lib/types";

/**
 * The persistent LEFT-side document/photo viewer for a BOL under review.
 * The original scan is the source of truth for the whole review workflow —
 * it stays pinned and visible across every tab on the detail page (see
 * bol-center/[id]/page.tsx), and is never replaced by the extracted data
 * sitting next to it.
 *
 * Two rendering paths: most seed BOLs have no real image asset (this is a
 * mock prototype), so their "photo" is a stylized reconstruction of the BOL
 * form built from the record's own extracted values. A small number of
 * records (currently just BOL #000025029, a real scan Brent uploaded) carry
 * `bol.scanPages` — real rendered page images — and render those instead,
 * with a page switcher when there's more than one.
 */
export function BolDocumentViewer({ bol }: { bol: BolRecord }) {
  const [zoomed, setZoomed] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const isPending = bol.docNumber === "—";
  const scanPages = bol.scanPages;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-bold text-[var(--cd-text)]">{bol.fileName}</p>
          <p className={`${TEXT.micro} text-[var(--cd-text-muted)]`}>
            Uploaded {formatDateTime(bol.uploadedAt)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setZoomed((v) => !v)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--cd-radius-sm)] border border-[var(--cd-border-strong)] bg-[var(--cd-surface)] text-[var(--cd-text-muted)] transition-colors hover:bg-[var(--cd-surface-hover)] hover:text-[var(--cd-text)]"
          aria-label={zoomed ? "Zoom out" : "Zoom in"}
          aria-pressed={zoomed}
        >
          <IconZoom width={15} height={15} />
        </button>
      </div>

      {scanPages && scanPages.length > 1 && (
        <div className="flex gap-1.5">
          {scanPages.map((p, i) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setPageIndex(i)}
              className={`rounded-[var(--cd-radius-sm)] border px-2.5 py-1 text-[11.5px] font-semibold transition-colors ${
                i === pageIndex
                  ? "border-[var(--cd-admin)]/40 bg-[var(--cd-admin-soft)] text-[var(--cd-admin)]"
                  : "border-[var(--cd-border-strong)] bg-[var(--cd-surface)] text-[var(--cd-text-muted)] hover:bg-[var(--cd-surface-hover)]"
              }`}
            >
              {i + 1}. {p.label}
            </button>
          ))}
        </div>
      )}

      <div className="cd-scroll overflow-auto rounded-[var(--cd-radius-md)] border border-[var(--cd-border)] bg-[var(--cd-surface-2)] p-4" style={{ maxHeight: 620 }}>
        {isPending ? (
          <div className="flex aspect-[8.5/11] w-full flex-col items-center justify-center gap-2 rounded border border-dashed border-[var(--cd-border-strong)] bg-[var(--cd-surface)] text-[var(--cd-text-subtle)]">
            <span className={TEXT.micro}>Photo received — extraction hasn&rsquo;t run yet.</span>
          </div>
        ) : scanPages ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={scanPages[pageIndex]?.url}
            alt={`${bol.docNumber} — ${scanPages[pageIndex]?.label}`}
            className="mx-auto block w-full rounded shadow-[0_1px_6px_rgba(0,0,0,0.18)] transition-transform duration-200"
            style={{ transform: zoomed ? "scale(1.28)" : "scale(1)", transformOrigin: "top center" }}
          />
        ) : (
          <div
            className="mx-auto flex aspect-[8.5/11] w-full flex-col gap-2.5 overflow-hidden rounded border border-[#d9d5c9] bg-[#fbfaf6] p-5 text-[10px] text-[#1c1c1c] shadow-[0_1px_6px_rgba(0,0,0,0.18)] transition-transform duration-200"
            style={{ transform: zoomed ? "scale(1.28)" : "scale(1)", transformOrigin: "top center" }}
          >
            <div className="flex items-center justify-between border-b-2 border-[#1c1c1c] pb-1.5">
              <span className="text-[13px] font-black uppercase tracking-wide">Bill of Lading</span>
              <span className="text-[9px] text-[#555]">BOL # {bol.docNumber}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 border-b border-[#d9d5c9] pb-2">
              <MockField label="Ship From" value={bol.extraction.shipperName.value} />
              <MockField label="Ship To" value={bol.extraction.consigneeName.value} />
              <MockField label="Pickup Addr" value={`${bol.extraction.pickupAddress.value}, ${bol.extraction.pickupCity.value} ${bol.extraction.pickupState.value}`} />
              <MockField label="Delivery Addr" value={`${bol.extraction.deliveryAddress.value}, ${bol.extraction.deliveryCity.value} ${bol.extraction.deliveryState.value}`} />
            </div>
            <div className="grid grid-cols-2 gap-2 border-b border-[#d9d5c9] pb-2">
              <MockField label="Carrier" value={bol.extraction.carrierName.value} />
              <MockField label="Broker" value={bol.extraction.brokerName.value} />
              <MockField label="Pickup Date" value={bol.extraction.pickupDate.value} />
              <MockField label="Delivery Date" value={bol.extraction.deliveryDate.value} />
            </div>
            <div className="grid grid-cols-2 gap-2 border-b border-[#d9d5c9] pb-2">
              <MockField label="Commodity" value={bol.extraction.commodity.value} />
              <MockField label="Weight" value={bol.extraction.weight.value} />
              <MockField label="Reference #" value={bol.extraction.referenceNumber.value} />
            </div>
            <div className="mt-auto flex items-center justify-between pt-2 text-[8px] text-[#8a8676]">
              <span>Driver signature: ______________________</span>
              <span>Photo capture · {bol.fileName}</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <Badge tone="neutral">Original — read only</Badge>
        {!isPending && <span className={`${TEXT.micro} text-[var(--cd-text-subtle)]`}>Extracted data is on the right — this photo never changes.</span>}
      </div>
    </div>
  );
}

function MockField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[7.5px] font-bold uppercase tracking-wide text-[#8a8676]">{label}</p>
      <p className="truncate text-[10px] font-semibold text-[#1c1c1c]">{value || "—"}</p>
    </div>
  );
}
