import { createCrmServerClient } from "@/lib/crm/auth";
import { Card, CardHead, BTN_EDIT } from "../../_shell/ui";
import { DetailFact } from "./DetailFact";
import { normalizeHref } from "../../_shell/contactFields";
import { CompanyProfileDialog } from "./CompanyProfileDialog";

/**
 * Details tab — "Company profile" group. The fields the basic DetailsSection
 * grid doesn't already show (legal name/industry/company size/website/tags/
 * address/lifecycle are covered there). Self-contained: fetches its own
 * slice of crm_accounts rather than threading more props through page.tsx,
 * so it slots into the Details tab as a pure addition.
 */
export async function CompanyProfileSection({ accountId }: { accountId: string }) {
  const supabase = await createCrmServerClient();
  const { data } = await supabase
    .from("crm_accounts")
    .select("dba, linkedin_url, year_founded, ownership_type, ai_confirmed_fields")
    .eq("id", accountId)
    .maybeSingle();

  const dba = (data?.dba as string | null) ?? null;
  const linkedinUrl = (data?.linkedin_url as string | null) ?? null;
  const yearFounded = (data?.year_founded as number | null) ?? null;
  const ownershipType = (data?.ownership_type as string | null) ?? null;
  const confirmed = (data?.ai_confirmed_fields as Record<string, unknown> | null) ?? {};

  return (
    <Card>
      <CardHead
        title="Company profile"
        right={
          <CompanyProfileDialog
            accountId={accountId}
            defaults={{ dba, linkedin_url: linkedinUrl, year_founded: yearFounded, ownership_type: ownershipType }}
            trigger={(open) => (
              <button
                type="button"
                onClick={open}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${BTN_EDIT}`}
              >
                Edit
              </button>
            )}
          />
        }
      />
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
      </div>
    </Card>
  );
}
