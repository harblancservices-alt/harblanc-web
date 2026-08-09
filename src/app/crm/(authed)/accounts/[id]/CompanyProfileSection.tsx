import { createCrmServerClient } from "@/lib/crm/auth";
import { Card, CardHead } from "../../_shell/ui";
import { DetailFact } from "./DetailFact";
import { normalizeHref } from "../../_shell/contactFields";
import { formatMoney } from "../../_shell/format";
import { CompanyProfileDialog } from "./CompanyProfileDialog";

/**
 * Details tab — "Company profile" group. The fields the basic DetailsSection
 * grid doesn't already show (legal name/industry/company size/website/tags/
 * address/lifecycle are covered there). Self-contained: fetches its own
 * slice of crm_accounts rather than threading more props through page.tsx,
 * so it slots into the Details tab as a pure addition.
 *
 * 2026-08-10: also picked up Company type/Employees/Annual revenue/Source/
 * MC-DOT/Description — real fields the Company Details card's "A" redesign
 * (CompanyDetailsCard.tsx) deliberately doesn't show anymore (that card
 * narrowed to name/industry/contact info/freight profile/tags). Still edited
 * via the same top-bar Edit dialog (CompanyDialog) either way — this section
 * has its own separate CompanyProfileDialog for DBA/LinkedIn/Year founded/
 * Ownership only, unchanged.
 */
export async function CompanyProfileSection({ accountId }: { accountId: string }) {
  const supabase = await createCrmServerClient();
  const { data } = await supabase
    .from("crm_accounts")
    .select(
      "dba, linkedin_url, year_founded, ownership_type, ai_confirmed_fields, company_type, company_size, annual_freight_spend, source, dot_number, mc_number, context_notes",
    )
    .eq("id", accountId)
    .maybeSingle();

  const dba = (data?.dba as string | null) ?? null;
  const linkedinUrl = (data?.linkedin_url as string | null) ?? null;
  const yearFounded = (data?.year_founded as number | null) ?? null;
  const ownershipType = (data?.ownership_type as string | null) ?? null;
  const confirmed = (data?.ai_confirmed_fields as Record<string, unknown> | null) ?? {};
  const companyType = (data?.company_type as string | null) ?? null;
  const companySize = (data?.company_size as string | null) ?? null;
  const annualFreightSpend = (data?.annual_freight_spend as number | null) ?? null;
  const source = (data?.source as string | null) ?? null;
  const dotNumber = (data?.dot_number as string | null) ?? null;
  const mcNumber = (data?.mc_number as string | null) ?? null;
  const contextNotes = (data?.context_notes as string | null) ?? null;
  const mcDot = [dotNumber ? `DOT ${dotNumber}` : null, mcNumber ? `MC ${mcNumber}` : null].filter(Boolean).join(" · ") || null;

  const isEmpty =
    !dba &&
    !linkedinUrl &&
    !yearFounded &&
    !ownershipType &&
    !companyType &&
    !companySize &&
    annualFreightSpend == null &&
    !source &&
    !mcDot &&
    !contextNotes;
  const dialog = (
    <CompanyProfileDialog
      accountId={accountId}
      defaults={{ dba, linkedin_url: linkedinUrl, year_founded: yearFounded, ownership_type: ownershipType }}
    />
  );

  return (
    <Card>
      <CardHead title="Company profile" right={isEmpty ? undefined : dialog} />
      {isEmpty ? (
        <div className="flex items-center justify-between gap-3 px-5 py-5">
          <p className="text-[13px] text-fg-muted">No company profile on file yet — DBA, LinkedIn, ownership.</p>
          {dialog}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-x-8 gap-y-4 p-5 sm:grid-cols-2">
          <DetailFact label="DBA" value={dba} fromAi={!!confirmed.dba} />
          <DetailFact
            label="LinkedIn"
            value={
              linkedinUrl ? (
                <a
                  href={normalizeHref(linkedinUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  {linkedinUrl}
                </a>
              ) : null
            }
            fromAi={!!confirmed.linkedin_url}
          />
          <DetailFact label="Year founded" value={yearFounded} mono fromAi={!!confirmed.year_founded} />
          <DetailFact label="Ownership" value={ownershipType} fromAi={!!confirmed.ownership_type} />
          <DetailFact label="Company type" value={companyType} />
          <DetailFact label="Employees" value={companySize} />
          <DetailFact label="Annual revenue" value={annualFreightSpend != null ? formatMoney(annualFreightSpend) : null} />
          <DetailFact label="Source" value={source} />
          <DetailFact label="MC / DOT" value={mcDot} mono />
          <DetailFact label="Description" value={contextNotes ? <span className="whitespace-pre-wrap leading-relaxed">{contextNotes}</span> : null} />
        </div>
      )}
    </Card>
  );
}
