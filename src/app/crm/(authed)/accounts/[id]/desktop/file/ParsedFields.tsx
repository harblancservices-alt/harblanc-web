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

/**
 * WHAT THIS COMPANY DID ON THIS LOAD, in the words a broker would use.
 *
 * The entry query used to return shipper matches only, so this was never
 * ambiguous — every document on the panel had been tendered by the company
 * you were looking at. It now returns the receiver and the bill-to as well,
 * which is the whole point of the change, and that makes saying WHICH the
 * difference between informing somebody and misleading them: the same
 * scan appears on two companies' profiles meaning opposite things.
 */
const ROLE_LINE: Record<BolDoc["role"], string> = {
  shipper: "This company shipped this load",
  consignee: "This company received this load",
  bill_to: "This company was billed for this load",
};

/** The one row on the list that is this company. */
const ROLE_FIELD: Record<BolDoc["role"], string> = {
  shipper: "Shipper",
  consignee: "Consignee",
  bill_to: "Bill to",
};

/**
 * OUR OWN NAME NEVER RENDERS AS A FIELD ON A CUSTOMER'S PROFILE.
 *
 * Brent, twice: our name does not belong on these records. The Carrier row
 * on Solar-Link read "HARBLANC SERVICES LLC" — true of the load, useless on
 * their profile, and the second time he has had to point at it.
 *
 * The nine entries naming us were nulled in the database on 2026-08-29.
 * This is the guard that stops a future parse putting it back: the value is
 * dropped at RENDER, so it cannot reappear whatever gets written. It is not
 * a data fix pretending to be a display fix — both are in place, because
 * the data fix alone would have to be repeated after every parse.
 *
 * Only the Carrier row is filtered. A broker or a third-party carrier is a
 * fact about the load and still shows.
 */
function withoutUs(value: string | null): string | null {
  if (!value) return null;
  return /harblanc/i.test(value) ? null : value;
}

function Field({
  label,
  value,
  isThisCompany = false,
  note,
  absent,
}: {
  label: string;
  value: string | null;
  isThisCompany?: boolean;
  /** A caption under the value — used to say why a party is NOT a company. */
  note?: string;
  /** What to print when the document simply does not carry this field.
   * Supplied only for the parties a reader will go looking for; every
   * other blank field stays hidden rather than listing its own absence. */
  absent?: string;
}) {
  if (!value && !absent) return null;
  return (
    <div className="flex items-baseline gap-4 border-t border-line py-2 first:border-t-0">
      <span
        className={`w-[92px] shrink-0 text-[10px] font-bold uppercase tracking-[0.08em] ${
          isThisCompany ? "text-accent" : "text-fg-subtle"
        }`}
      >
        {label}
      </span>
      {/* max-w in CH, not px: letting Notes run the full width of a
          1000px+ column produces a 200-character line nobody can track back
          to the start of. The cap is on the VALUE, not the row, so the
          label column stays aligned. */}
      <span className="min-w-0 flex-1">
        <span
          className={`block whitespace-pre-wrap text-[12.5px] max-w-[80ch] ${
            value ? "text-fg" : "italic text-fg-subtle"
          } ${isThisCompany ? "font-bold" : ""}`}
        >
          {value ?? absent}
        </span>
        {note && (
          <span className="mt-0.5 block text-[11px] text-fg-subtle">{note}</span>
        )}
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

      <p className="mb-2 text-[12.5px] font-bold text-fg">{ROLE_LINE[doc.role]}</p>

      <div>
        <Field label="BOL no." value={doc.bolNumber} />
        <Field label="Reference" value={doc.reference} />
        <Field
          label="Shipper"
          value={doc.shipperName}
          isThisCompany={ROLE_FIELD[doc.role] === "Shipper"}
        />
        <Field label="From" value={doc.shipperAddress} />
        <Field
          label="Receiver"
          value={doc.consigneeName}
          isThisCompany={ROLE_FIELD[doc.role] === "Consignee"}
          /* AN UNNAMED RECEIVER IS ORDINARY, NOT A FAULT.
             Brokers routinely withhold the delivery address until the day
             of — Snapshot #1 says so in as many words: "Delivery address
             will be provided afternoon/evening prior to delivery." Left as
             a hidden row this looked like a parse failure or a bug. Said
             out loud it is just what the paperwork was. */
          absent="Not named on this document"
        />
        <Field label="To" value={doc.consigneeAddress} />
        <Field
          label="Bill to"
          value={doc.billTo}
          isThisCompany={ROLE_FIELD[doc.role] === "Bill to"}
          note="Broker or payer on this document."
        />
        <Field
          label="Carrier"
          value={withoutUs(doc.carrier)}
          note="Carrier named on this document."
        />
        <Field label="Commodity" value={doc.commodity} />
        <Field label="Weight" value={doc.weight} />
        <Field label="Picked up" value={doc.pickupDate} />
        <Field label="Delivered" value={doc.deliveryDate} />
        <Field label="Notes" value={doc.notes} />
      </div>
    </div>
  );
}
