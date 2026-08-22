import { formatMoney } from "../../../_shell/format";
import { D_CAP, D_CARD, D_MICRO } from "./ui";

export type GlanceFacts = {
  annualFreightSpend: number | null;
  companySize: string | null;
  yearFounded: number | null;
  companyType: string | null;
  ownershipType: string | null;
  source: string | null;
};

/**
 * DESKTOP-ONLY left-rail "At a glance" card (design handoff §Left identity
 * rail) — a 2-column micro-label/value grid of the firmographics a rep wants
 * before dialing: revenue estimate, headcount, founded, entity type,
 * ownership, and where the record came from.
 *
 * Read-only and additive: every value is an existing crm_accounts column
 * already surfaced (and edited) elsewhere on the profile — annual revenue /
 * employees / company type / source through the top-bar Edit dialog
 * (CompanyDialog), year founded / ownership through CompanyProfileDialog.
 * Pairs with no value are omitted rather than shown as "—", per the handoff's
 * "only show filled" rule; the whole card disappears when nothing is filled.
 */
export function AtAGlanceCard({ facts }: { facts: GlanceFacts }) {
  const rows: { k: string; v: string }[] = [
    { k: "Revenue est.", v: facts.annualFreightSpend != null ? formatMoney(facts.annualFreightSpend) : "" },
    { k: "Employees", v: facts.companySize ?? "" },
    { k: "Founded", v: facts.yearFounded != null ? String(facts.yearFounded) : "" },
    { k: "Type", v: facts.companyType ?? "" },
    { k: "Ownership", v: facts.ownershipType ?? "" },
    { k: "Source", v: facts.source ?? "" },
  ].filter((r) => r.v.trim().length > 0);

  if (rows.length === 0) return null;

  return (
    <div className={`${D_CARD} p-4 px-[18px]`}>
      <div className={`${D_CAP} mb-2.5`}>At a glance</div>
      <div className="grid grid-cols-2 gap-3">
        {rows.map((r) => (
          <div key={r.k} className="min-w-0">
            <div className={D_MICRO}>{r.k}</div>
            <div className="mt-px break-words text-[13px] font-bold text-fg">{r.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
