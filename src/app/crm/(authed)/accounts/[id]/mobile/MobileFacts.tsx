import { formatMoney } from "../../../_shell/format";

export type MobileGlanceFacts = {
  annualFreightSpend: number | null;
  companySize: string | null;
  yearFounded: number | null;
  companyType: string | null;
  ownershipType: string | null;
  source: string | null;
};

/**
 * AT A GLANCE — the six commercial facts worth knowing before you dial,
 * as a 2-up grid (2 × 171px inside the 366px page width).
 *
 * Read-only by design: every value here is edited through the Edit dialog
 * (CompanyDialog) or the Company profile section's own CompanyProfileDialog,
 * both already on this page. Facts with no value are dropped rather than
 * rendered as an em-dash row, so a thin company shows a short grid instead
 * of six blanks. Renders nothing when the company has none of them.
 */
export function MobileFacts({ facts }: { facts: MobileGlanceFacts }) {
  const rows: { k: string; v: string }[] = [];
  if (facts.annualFreightSpend != null) rows.push({ k: "Freight spend", v: `${formatMoney(facts.annualFreightSpend)} / yr` });
  if (facts.companySize) rows.push({ k: "Company size", v: facts.companySize });
  if (facts.yearFounded != null) rows.push({ k: "Founded", v: String(facts.yearFounded) });
  if (facts.companyType) rows.push({ k: "Type", v: facts.companyType });
  if (facts.ownershipType) rows.push({ k: "Ownership", v: facts.ownershipType });
  if (facts.source) rows.push({ k: "Source", v: facts.source });

  if (rows.length === 0) return null;

  return (
    <div className="mt-[11px] grid grid-cols-2 gap-px border-t border-line bg-line">
      {rows.map((r) => (
        <div key={r.k} className="min-w-0 bg-card px-[13px] py-2.5">
          <p className="text-[9.5px] font-extrabold uppercase tracking-[0.09em] text-fg-muted">{r.k}</p>
          <p className="mt-0.5 text-[14px] font-extrabold tracking-[-0.01em] text-fg [overflow-wrap:anywhere]">{r.v}</p>
        </div>
      ))}
      {/* The grid draws its hairlines with `gap-px` over a bg-line
          container, so an odd number of facts would leave the trailing half
          of the last row showing as a solid line-colored block. */}
      {rows.length % 2 === 1 && <div aria-hidden className="bg-card" />}
    </div>
  );
}
