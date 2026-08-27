import type { BolDoc } from "./BolViewer";
import { Micro } from "./chrome";

/**
 * WHAT WE PULLED OFF THIS DOCUMENT — the top of the right column, sitting
 * directly beside the BOL it was read from.
 *
 * Brent: "the information next to it being the parsed information taken
 * from the BOL. place the fields on the right."
 *
 * ── PER-DOCUMENT, NOT PER-COMPANY ─────────────────────────────────────
 *
 * These are the fields of the BOL currently open in the viewer, and they
 * change when you switch documents. That is the entire point of putting
 * them here: you are meant to be able to read a value off the scan and
 * check it against what the parse recorded, without leaving the page. A
 * company-wide aggregate could not be checked against anything, because it
 * would not correspond to any one document.
 *
 * The company-wide view has not gone — lanes and commodities across every
 * BOL still render below, but only when there is more than one document,
 * since with a single BOL the aggregate is just these fields again.
 *
 * ── EMPTY FIELDS ARE NOT DRAWN ────────────────────────────────────────
 *
 * Every value is trimmed to null upstream, and a null is skipped rather
 * than rendered as a dash. A parse that missed the delivery date should
 * look like a shorter list, not like a field that exists and is empty —
 * and across the 14 real entries the misses are real: 13 of 14 have a
 * carrier, 12 a weight, 12 a delivery date, 8 a bill-to.
 *
 * Nothing is computed, inferred or filled in here. Every line is a column
 * out of crm_bol_entries exactly as the parse wrote it, which is why weight
 * shows as "4,080 lb (1,630 + 2,450)" rather than a tidied number.
 */

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline gap-4 border-t border-line py-2 first:border-t-0">
      <span className="w-[92px] shrink-0 text-[10px] font-bold uppercase tracking-[0.08em] text-fg-subtle">
        {label}
      </span>
      {/* max-w in CH, not px: letting Notes run the full width of a
          1000px+ column produces a 200-character line nobody can track back
          to the start of. The cap is on the VALUE, not the row, so the
          label column stays aligned. */}
      <span className="min-w-0 flex-1 whitespace-pre-wrap text-[12.5px] text-fg max-w-[80ch]">
        {value}
      </span>
    </div>
  );
}

export function ParsedFields({ doc, total }: { doc: BolDoc; total: number }) {
  return (
    <div className="px-4 py-3">
      <p className="mb-1">
        <Micro className="text-fg-muted">Parsed from this document</Micro>
        <span className="ml-2 text-[11.5px] text-fg-subtle">
          {doc.bolNumber ? `BOL #${doc.bolNumber}` : doc.fileName}
          {total > 1 ? ` · 1 of ${total}` : ""}
        </span>
      </p>

      <div>
        <Field label="BOL no." value={doc.bolNumber} />
        <Field label="Reference" value={doc.reference} />
        <Field label="Shipper" value={doc.shipperName} />
        <Field label="From" value={doc.shipperAddress} />
        <Field label="Consignee" value={doc.consigneeName} />
        <Field label="To" value={doc.consigneeAddress} />
        <Field label="Bill to" value={doc.billTo} />
        <Field label="Commodity" value={doc.commodity} />
        <Field label="Weight" value={doc.weight} />
        <Field label="Carrier" value={doc.carrier} />
        <Field label="Picked up" value={doc.pickupDate} />
        <Field label="Delivered" value={doc.deliveryDate} />
        <Field label="Notes" value={doc.notes} />
      </div>
    </div>
  );
}
