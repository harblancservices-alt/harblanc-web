"use client";

import { useState } from "react";

export type GeneratedQuoteSummary = {
  id: string;
  quoteNumber: string;
  issuedAt: string;
  expiresAt: string | null;
  totalAmount: number | null;
  preparedBy: string | null;
  paymentTerms: string | null;
};

const ROW_LABEL =
  "font-mono text-[10px] tracking-[0.22em] text-neutral-500 uppercase";

function dateOnly(iso: string | null): string {
  if (!iso) return "\u2014";
  const d = new Date(iso);
  const yr = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dy = String(d.getUTCDate()).padStart(2, "0");
  return `${yr}-${mo}-${dy}`;
}

function currency(n: number | null): string {
  if (n === null) return "\u2014";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

export function GeneratedQuotePreview({
  quote,
  signedUrl,
}: {
  quote: GeneratedQuoteSummary;
  signedUrl: string;
}) {
  const [iframeFailed, setIframeFailed] = useState(false);

  return (
    <div className="space-y-5">
      {/* Summary strip */}
      <div className="grid grid-cols-1 gap-4 border border-neutral-800 bg-neutral-900/40 p-4 sm:grid-cols-4 sm:gap-6 sm:p-5">
        <div>
          <p className={ROW_LABEL}>Quote</p>
          <p className="mt-1 font-mono text-base font-semibold text-white">
            {quote.quoteNumber}
          </p>
        </div>
        <div>
          <p className={ROW_LABEL}>Issued</p>
          <p className="mt-1 font-mono text-base text-white">
            {dateOnly(quote.issuedAt)}
          </p>
        </div>
        <div>
          <p className={ROW_LABEL}>Expires</p>
          <p className="mt-1 font-mono text-base text-white">
            {dateOnly(quote.expiresAt)}
          </p>
        </div>
        <div>
          <p className={ROW_LABEL}>Total</p>
          <p className="mt-1 font-mono text-base font-semibold text-white">
            {currency(quote.totalAmount)}
          </p>
        </div>
      </div>

      {/* Action row */}
      <div className="flex flex-col items-stretch gap-2.5 sm:flex-row sm:items-center sm:gap-3">
        <a
          href={signedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-outline-cut inline-flex w-full items-center justify-center px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-100 transition-colors sm:w-auto"
        >
          Open PDF
        </a>
        <a
          href={signedUrl}
          download={`HARBLANC_Quote_${quote.quoteNumber}.pdf`}
          className="btn-outline-cut inline-flex w-full items-center justify-center px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-100 transition-colors sm:w-auto"
        >
          Download PDF
        </a>
        <button
          type="button"
          disabled
          title="Email sending arrives in Phase 2"
          className="inline-flex w-full items-center justify-center border border-neutral-800 px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500 transition-colors disabled:cursor-not-allowed sm:w-auto"
        >
          Send quote (coming soon)
        </button>
      </div>

      {/* Inline preview */}
      <div className="relative border border-neutral-800 bg-neutral-950">
        {iframeFailed ? (
          <div className="flex h-[480px] items-center justify-center p-6 text-center">
            <p className="text-sm text-neutral-400">
              Inline preview unavailable on this browser.
              <br />
              Use Open or Download above to view the PDF.
            </p>
          </div>
        ) : (
          <iframe
            src={signedUrl}
            title={`Quote ${quote.quoteNumber}`}
            className="block h-[640px] w-full bg-neutral-950 sm:h-[820px]"
            onError={() => setIframeFailed(true)}
          />
        )}
      </div>

      <p className="font-mono text-[10px] tracking-[0.22em] text-neutral-600 uppercase">
        Quote PDF stored in HARBLANC dispatch · {quote.quoteNumber}
      </p>
    </div>
  );
}
