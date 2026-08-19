"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore, useTeamMemberById } from "../../_lib/store";
import { Badge, Button, Card, EmptyState, INPUT, PAGE_WIDTH, PageHeader, TEXT, ZEBRA } from "../../_design/ui";
import { STAGE_LABEL, STAGE_ORDER, STAGE_TONE } from "../../_lib/lifecycle";
import { daysAgoLabel, firstName } from "../../_lib/format";
import { IconBuilding, IconPlus, IconSearch } from "../../_design/icons";
import { AddCompanyDrawer } from "../../_shared/AddCompanyDrawer";

const STAGE_TONE_MAP = { neutral: "neutral", accent: "accent", success: "success", danger: "danger" } as const;

export default function CompaniesPage() {
  const { companies, currentUser } = useStore();
  const [q, setQ] = useState("");
  const [stage, setStage] = useState<string>("");
  const [addOpen, setAddOpen] = useState(false);

  const restricted = currentUser.role === "agent" && !currentUser.canViewAllCompanies;

  const filtered = useMemo(() => {
    let rows = companies;
    if (restricted) rows = rows.filter((c) => c.assignedUserId === currentUser.id);
    if (stage) rows = rows.filter((c) => c.stage === stage);
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      rows = rows.filter((c) => c.name.toLowerCase().includes(needle) || c.city.toLowerCase().includes(needle) || c.industry.toLowerCase().includes(needle));
    }
    return [...rows].sort((a, b) => (b.lastContactAt ?? "").localeCompare(a.lastContactAt ?? ""));
  }, [companies, q, stage, restricted, currentUser.id]);

  return (
    <div className={PAGE_WIDTH}>
      <PageHeader
        title="Companies"
        subtitle={restricted ? "Showing only companies assigned to you." : `${companies.length} companies in your org.`}
        actions={
          <Button variant="primary" onClick={() => setAddOpen(true)}>
            <IconPlus width={15} height={15} /> Add company
          </Button>
        }
      />

      <Card className="mb-4 flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <label className="relative flex flex-1 items-center">
          <IconSearch width={15} height={15} className="pointer-events-none absolute left-3 text-[var(--cd-text-subtle)]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search companies…" className={`${INPUT} pl-8`} />
        </label>
        <select value={stage} onChange={(e) => setStage(e.target.value)} className={`${INPUT} sm:w-52`}>
          <option value="">All stages</option>
          {[...STAGE_ORDER, "lost" as const].map((s) => (
            <option key={s} value={s}>
              {STAGE_LABEL[s]}
            </option>
          ))}
        </select>
      </Card>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState icon={<IconBuilding />} title="No companies match" body="Try a different search or clear your filters." />
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden lg:block">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[var(--cd-border)] bg-[var(--cd-surface-2)] text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--cd-text-subtle)]">
                  <th className="px-4 py-2.5">Company</th>
                  <th className="px-4 py-2.5">Stage</th>
                  <th className="px-4 py-2.5">Location</th>
                  <th className="px-4 py-2.5">Assigned</th>
                  <th className="px-4 py-2.5">Last contact</th>
                </tr>
              </thead>
              <tbody className={ZEBRA}>
                {filtered.map((c) => (
                  <CompanyRow key={c.id} companyId={c.id} />
                ))}
              </tbody>
            </table>
          </Card>

          {/* Mobile cards */}
          <div className="flex flex-col gap-2.5 lg:hidden">
            {filtered.map((c) => (
              <CompanyCard key={c.id} companyId={c.id} />
            ))}
          </div>
        </>
      )}

      <AddCompanyDrawer open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}

function CompanyRow({ companyId }: { companyId: string }) {
  const { companies } = useStore();
  const c = companies.find((x) => x.id === companyId)!;
  const rep = useTeamMemberById(c.assignedUserId);
  return (
    <tr>
      <td className="px-4 py-3">
        <Link href={`/crm-design/companies/${c.id}`} className="font-semibold text-[var(--cd-text)] hover:text-[var(--cd-accent)]">
          {c.name}
        </Link>
        <p className={`${TEXT.micro} text-[var(--cd-text-subtle)]`}>{c.industry}</p>
      </td>
      <td className="px-4 py-3">
        <Badge tone={STAGE_TONE_MAP[STAGE_TONE[c.stage]]}>{STAGE_LABEL[c.stage]}</Badge>
      </td>
      <td className="px-4 py-3 text-[var(--cd-text-muted)]">{c.city}, {c.state}</td>
      <td className="px-4 py-3 text-[var(--cd-text-muted)]">{rep ? firstName(rep.name) : "—"}</td>
      <td className="px-4 py-3 text-[var(--cd-text-muted)]">{daysAgoLabel(c.lastContactAt)}</td>
    </tr>
  );
}

function CompanyCard({ companyId }: { companyId: string }) {
  const { companies } = useStore();
  const c = companies.find((x) => x.id === companyId)!;
  const rep = useTeamMemberById(c.assignedUserId);
  return (
    <Link href={`/crm-design/companies/${c.id}`}>
      <Card className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[14px] font-bold text-[var(--cd-text)]">{c.name}</p>
            <p className={`${TEXT.micro} text-[var(--cd-text-subtle)]`}>{c.industry} · {c.city}, {c.state}</p>
          </div>
          <Badge tone={STAGE_TONE_MAP[STAGE_TONE[c.stage]]}>{STAGE_LABEL[c.stage]}</Badge>
        </div>
        <div className={`mt-2.5 flex items-center justify-between border-t border-[var(--cd-border)] pt-2.5 ${TEXT.micro} text-[var(--cd-text-subtle)]`}>
          <span>{rep ? firstName(rep.name) : "Unassigned"}</span>
          <span>{daysAgoLabel(c.lastContactAt)}</span>
        </div>
      </Card>
    </Link>
  );
}
