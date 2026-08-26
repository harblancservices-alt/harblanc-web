import type { ReactNode } from "react";

export type CompanyDetails = {
  industry: string | null;
  dba: string | null;
  yearFounded: number | null;
  companyType: string | null;
  companySize: string | null;
  annualFreightSpend: number | null;
  ownershipType: string | null;
  linkedinUrl: string | null;
  source: string | null;
  dotNumber: string | null;
  mcNumber: string | null;
  contextNotes: string | null;
};

/**
 * Every slow-moving fact about the company, in ONE place.
 *
 * MERGED 2026-08-26 from two cards that showed overlapping halves of the
 * same thing: the left rail's "At a glance" (six firmographics) and the main
 * column's "Company profile" grid (ten fields). Six of the six were already
 * in the ten — the glance card was not a summary, it was a repeat, and both
 * rendered on the same screen. One of Brent's five merges.
 *
 * THE "AI" MARKERS ARE GONE. Both old cards drew a small badge on any value
 * that came from confirming an AI research suggestion, read from
 * `ai_confirmed_fields`. That column is empty on all 99 companies and the
 * stack that wrote it was deleted on 2026-08-26, so the badge could never
 * appear again. The column is untouched — this is presentation only.
 *
 * FILLED FIELDS ONLY, and the count in the section header says how many that
 * is before you open it. On this book that is usually two or three of twelve,
 * which is worth knowing rather than hiding behind a chevron.
 */

function money(n: number | null): string | null {
  if (n === null) return null;
  return `$${n.toLocaleString("en-US")}`;
}

/** The fields, in the order they read best — identity, then size, then
 * commercial, then the long one. Null entries drop out. */
export function detailRows(d: CompanyDetails): { label: string; value: string }[] {
  const rows: [string, string | null][] = [
    ["Industry", d.industry],
    ["Trading name", d.dba],
    ["Year founded", d.yearFounded === null ? null : String(d.yearFounded)],
    ["Entity type", d.companyType],
    ["Ownership", d.ownershipType],
    ["Headcount", d.companySize],
    ["Freight spend", money(d.annualFreightSpend)],
    ["Source", d.source],
    ["LinkedIn", d.linkedinUrl],
    // Carrier identifiers on a shipper record — kept because the columns
    // exist and somebody may yet use them, but they are zero-filled today.
    ["MC / DOT", [d.mcNumber, d.dotNumber].filter(Boolean).join(" / ") || null],
    ["Description", d.contextNotes],
  ];
  return rows
    .filter((r): r is [string, string] => typeof r[1] === "string" && r[1].trim().length > 0)
    .map(([label, value]) => ({ label, value }));
}

export function countFilled(d: CompanyDetails): number {
  return detailRows(d).length;
}

/** Total number of fields this grid can show — the denominator in "2 of 12". */
export const DETAIL_FIELD_COUNT = 11;

export function DetailsGrid({ details, editAction }: { details: CompanyDetails; editAction: ReactNode }) {
  const rows = detailRows(details);

  if (rows.length === 0) {
    return (
      <div className="text-[12.5px] text-fg-muted">
        Nothing recorded about this company yet. {editAction}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <dt className="text-[11px] font-bold uppercase tracking-[0.07em] text-fg-subtle">
              {r.label}
            </dt>
            <dd className="min-w-0 whitespace-pre-wrap text-[12.5px] text-fg">{r.value}</dd>
          </div>
        ))}
      </dl>
      <div>{editAction}</div>
    </div>
  );
}
