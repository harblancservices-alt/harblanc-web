import type { ReactNode } from "react";
import { Card, CardHead } from "../../_shell/ui";
import { formatMoney } from "../../_shell/format";
import { stageLabel, stageTone } from "../lifecycle";

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">{label}</p>
      <p className="mt-1 break-words text-[14px] text-fg">{value}</p>
    </div>
  );
}

/**
 * RIGHT column — "Company Details": Company Type, Industry, Employees,
 * Annual Revenue, Lifecycle Stage, Source, Description (context_notes), plus
 * two real fields the reference layout doesn't name but that must still
 * display somewhere per "preserve all data" — Commodities and MC/DOT
 * (dot_number/mc_number, existing columns never surfaced in the UI before
 * this rebuild). Rows without data are hidden outright, not shown as "—" —
 * Brent's explicit call for this card. No Edit button here — the top bar's
 * Edit is the one entry point for all of this.
 */
export function CompanyDetailsCard({
  companyType,
  industry,
  companySize,
  annualFreightSpend,
  stage,
  source,
  description,
  commodities,
  dotNumber,
  mcNumber,
}: {
  companyType: string | null;
  industry: string | null;
  companySize: string | null;
  annualFreightSpend: number | null;
  stage: string;
  source: string | null;
  description: string | null;
  commodities: string | null;
  dotNumber: string | null;
  mcNumber: string | null;
}) {
  const mcDot = [dotNumber ? `DOT ${dotNumber}` : null, mcNumber ? `MC ${mcNumber}` : null].filter(Boolean).join(" · ");

  return (
    <Card>
      <CardHead title="Company details" />
      <div className="flex flex-col gap-4 p-5">
        {companyType && <Fact label="Company type" value={companyType} />}
        {industry && <Fact label="Industry" value={industry} />}
        {companySize && <Fact label="Employees" value={companySize} />}
        {annualFreightSpend != null && <Fact label="Annual revenue" value={formatMoney(annualFreightSpend)} />}
        <Fact
          label="Lifecycle stage"
          value={
            <span className={`inline-flex items-center px-2.5 py-0.5 text-[11px] font-semibold ${stageTone(stage)}`}>
              {stageLabel(stage)}
            </span>
          }
        />
        {source && <Fact label="Source" value={source} />}
        {commodities && <Fact label="Commodities" value={commodities} />}
        {mcDot && <Fact label="MC / DOT" value={<span className="font-mono">{mcDot}</span>} />}
        {description && (
          <Fact label="Description" value={<span className="whitespace-pre-wrap leading-relaxed">{description}</span>} />
        )}
      </div>
    </Card>
  );
}
