"use client";

import Link from "next/link";
import { useStore, useTeamMemberById } from "../../_lib/store";
import { Badge, Card, EmptyState, PAGE_WIDTH, PageHeader, TEXT, ZEBRA } from "../../_design/ui";
import { daysAgoLabel, firstName } from "../../_lib/format";
import { IconStar } from "../../_design/icons";

/**
 * Active Clients — the roster of won, active-customer companies. The real
 * CRM's equivalent (/crm/active-customers) is a 4-tab hub (Active Customers
 * + Carriers + Shipments + BOL/RC library); this prototype intentionally
 * scopes down to the customer roster only, since Carriers/Shipments are
 * operational-dispatch surfaces outside this pass's screen list, and the
 * document workflow is already demonstrated on the Company profile's
 * Documents tab + Admin → Documents. See DESIGN_DECISIONS.md.
 */
export default function ActiveClientsPage() {
  const { companies } = useStore();
  const active = companies.filter((c) => c.stage === "active_customer");

  return (
    <div className={PAGE_WIDTH}>
      <PageHeader title="Active Clients" subtitle={`${active.length} companies at Active Customer stage.`} />
      {active.length === 0 ? (
        <Card>
          <EmptyState icon={<IconStar />} title="No active clients yet" body="Companies that reach Active Customer will show up here." />
        </Card>
      ) : (
        <Card>
          <ul className={`divide-y divide-[var(--cd-border)] ${ZEBRA}`}>
            {active.map((c) => (
              <ActiveRow key={c.id} companyId={c.id} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function ActiveRow({ companyId }: { companyId: string }) {
  const { companies } = useStore();
  const c = companies.find((x) => x.id === companyId)!;
  const rep = useTeamMemberById(c.assignedUserId);
  return (
    <li>
      <Link href={`/crm-design/companies/${c.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-[var(--cd-accent-soft)]">
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-semibold text-[var(--cd-text)]">{c.name}</p>
          <p className={`${TEXT.micro} text-[var(--cd-text-subtle)]`}>
            {c.industry} · {c.city}, {c.state}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone="success">{c.annualFreightSpend}</Badge>
          <span className={`${TEXT.micro} text-[var(--cd-text-subtle)]`}>{firstName(rep?.name ?? "Unassigned")}</span>
          <span className={`${TEXT.micro} text-[var(--cd-text-subtle)]`}>{daysAgoLabel(c.lastContactAt)}</span>
        </div>
      </Link>
    </li>
  );
}
