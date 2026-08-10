import Link from "next/link";
import { Card, CardHead } from "./_shell/ui";
import { ClickableListItem } from "./_shell/ClickableRow";

export type ResearchGapCompany = {
  id: string;
  name: string;
  /** 0-100, see buildProfileCompleteness in page.tsx for the formula. */
  completenessPct: number;
};

function barTone(pct: number): { bar: string; text: string } {
  if (pct < 40) return { bar: "bg-bad", text: "text-bad" };
  if (pct < 65) return { bar: "bg-warn", text: "text-warn" };
  return { bar: "bg-ok", text: "text-ok" };
}

/**
 * NEEDS RESEARCH — companies with no logged AI-research note yet (page.tsx's
 * `researchGapAccounts`), thinnest profile first. Each row's progress bar is
 * a SEPARATE signal from the research-gap membership itself: completeness
 * scores how filled-in the Company/Commercial/Context fields are (see
 * buildProfileCompleteness), red under 40%, amber under 65%, green above —
 * so a rep can tell "needs a first pass" (red) from "just needs a
 * confirmation sweep" (green) without opening the profile.
 */
export function NeedsResearchList({ companies }: { companies: ResearchGapCompany[] }) {
  return (
    <Card id="needs-research" className="scroll-mt-20">
      <CardHead title="Needs Research" hint={companies.length ? `${companies.length} companies` : "All caught up"} />
      {companies.length === 0 ? (
        <p className="px-5 py-6 text-center text-[13px] text-fg-muted">Every account has a research pass on file.</p>
      ) : (
        <ul className="divide-y divide-line-strong">
          {companies.map((c) => {
            const tone = barTone(c.completenessPct);
            return (
              <ClickableListItem key={c.id} href={`/crm/accounts/${c.id}`} className="px-4 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={`/crm/accounts/${c.id}`}
                    prefetch={false}
                    className="truncate text-[13.5px] font-semibold text-fg hover:underline"
                  >
                    {c.name}
                  </Link>
                  <span className={`shrink-0 font-mono text-[12px] font-bold tabular-nums ${tone.text}`}>
                    {c.completenessPct}%
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-inset">
                  <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${c.completenessPct}%` }} />
                </div>
              </ClickableListItem>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
