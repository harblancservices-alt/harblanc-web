import type { ReactNode } from "react";
import { normalizeHref } from "../../../_shell/contactFields";
import { formatMoney } from "../../../_shell/format";
import { IconAiAgent } from "../../../_shell/icons";
import { CompanyProfileDialog } from "../CompanyProfileDialog";
import { D_CARD, D_H3, D_MICRO } from "./ui";

export type ProfileFacts = {
  dba: string | null;
  linkedinUrl: string | null;
  yearFounded: number | null;
  ownershipType: string | null;
  companyType: string | null;
  companySize: string | null;
  annualFreightSpend: number | null;
  source: string | null;
  dotNumber: string | null;
  mcNumber: string | null;
  contextNotes: string | null;
  /** crm_accounts.ai_confirmed_fields — which values came from confirming an
   * AI research suggestion, for the little "AI" marker on that field. */
  confirmed: Record<string, unknown>;
};

type Cell = { k: string; v: ReactNode; ai?: boolean; wide?: boolean };

/**
 * DESKTOP-ONLY "Company profile" field grid (design handoff §Main column) —
 * a 4-column grid of uppercase micro-labels over values, showing ONLY the
 * fields that are actually filled. When nothing is filled the card collapses
 * to a single subtle prompt with the same Edit action, matching the handoff's
 * "only show filled or a subtle Add" rule.
 *
 * Same fields, same source, same editor as the mobile CompanyProfileSection:
 * DBA / LinkedIn / Year founded / Ownership go through CompanyProfileDialog
 * (which owns its own trigger button precisely because it's rendered from a
 * Server Component), and Company type / Employees / Annual revenue / Source /
 * MC-DOT / Description are edited through the top-bar Edit dialog. Nothing
 * here fetches or writes — page.tsx passes the already-fetched slice in.
 */
export function CompanyProfileGrid({ accountId, facts }: { accountId: string; facts: ProfileFacts }) {
  const mcDot =
    [facts.dotNumber ? `DOT ${facts.dotNumber}` : null, facts.mcNumber ? `MC ${facts.mcNumber}` : null]
      .filter(Boolean)
      .join(" · ") || null;

  const cells: Cell[] = [
    { k: "DBA", v: facts.dba, ai: !!facts.confirmed.dba },
    { k: "Year founded", v: facts.yearFounded != null ? String(facts.yearFounded) : null, ai: !!facts.confirmed.year_founded },
    { k: "Company type", v: facts.companyType },
    { k: "Annual revenue", v: facts.annualFreightSpend != null ? formatMoney(facts.annualFreightSpend) : null },
    {
      k: "LinkedIn",
      ai: !!facts.confirmed.linkedin_url,
      v: facts.linkedinUrl ? (
        <a
          href={normalizeHref(facts.linkedinUrl)}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-accent transition-colors hover:text-accent-hover hover:underline"
        >
          {facts.linkedinUrl}
        </a>
      ) : null,
    },
    { k: "Ownership", v: facts.ownershipType, ai: !!facts.confirmed.ownership_type },
    { k: "Employees", v: facts.companySize },
    { k: "Source", v: facts.source },
    { k: "MC / DOT", v: mcDot },
    {
      k: "Description",
      wide: true,
      v: facts.contextNotes ? <span className="whitespace-pre-wrap leading-relaxed">{facts.contextNotes}</span> : null,
    },
  ];

  const filled = cells.filter((c) => c.v !== null && c.v !== undefined && c.v !== "");
  const dialog = (
    <CompanyProfileDialog
      accountId={accountId}
      defaults={{
        dba: facts.dba,
        linkedin_url: facts.linkedinUrl,
        year_founded: facts.yearFounded,
        ownership_type: facts.ownershipType,
      }}
    />
  );

  return (
    <div className={`${D_CARD} p-4 px-[18px]`}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className={D_H3}>Company profile</h3>
        {dialog}
      </div>

      {filled.length === 0 ? (
        <p className="text-[12.5px] text-fg-muted">
          Nothing on file yet — add a DBA, LinkedIn, year founded, or ownership.
        </p>
      ) : (
        <div className="grid grid-cols-4 gap-x-[18px] gap-y-3.5">
          {filled.map((c) => (
            <div key={c.k} className={`min-w-0 ${c.wide ? "col-span-4" : ""}`}>
              <div className={`${D_MICRO} flex items-center gap-1.5`}>
                {c.k}
                {c.ai && (
                  <span
                    title="Confirmed from AI research"
                    className="inline-flex items-center gap-0.5 rounded-full bg-admin-soft px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-admin"
                  >
                    <IconAiAgent width={9} height={9} />
                    AI
                  </span>
                )}
              </div>
              <div className="mt-0.5 break-words text-[13px] font-medium text-fg">{c.v}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
