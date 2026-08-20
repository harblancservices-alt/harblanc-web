"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useStore } from "../../_lib/store";
import { Badge, Card, EmptyState, PAGE_WIDTH, PageHeader, TEXT } from "../../_design/ui";
import { IconFlame, IconMapPin } from "../../_design/icons";
import { relativeTime } from "../../_lib/format";
import type { Prospect } from "../../_lib/types";

type ProspectGroup = {
  companyId: string;
  sources: Set<"otr" | "bol">;
  observedFreight: string[];
  observedLanes: string[];
  lastReleasedAt: string;
  location: string | null;
  bolDocNumbers: string[];
};

/**
 * Prospects — the sales-facing view of everything an admin has explicitly
 * released, from either OTR (verbal dispatch research) or BOL Center
 * (uploaded documents). Visible to everyone, unlike OTR/BOL Center/Admin —
 * this IS the funnel's output, not the intake layer. Card layout on
 * purpose, not a table (Brent's explicit call): one card per company,
 * aggregating every release for it, not one card per release event.
 *
 * Nothing shows up here except via an explicit Release — see
 * store.releaseBolToSales / releaseOtrToProspects. Uploading or researching
 * something never reaches this page on its own.
 */
export default function ProspectsPage() {
  const { prospects, companies, companyLocations, bolRecords, otrEntries } = useStore();

  const groups = useMemo(() => {
    const byCompany = new Map<string, ProspectGroup>();
    for (const p of [...prospects].sort((a, b) => a.releasedAt.localeCompare(b.releasedAt))) {
      const existing = byCompany.get(p.companyId);
      const freight = sourceFreight(p, bolRecords, otrEntries);
      const lanes = sourceLanes(p, bolRecords, otrEntries);
      const docNumber = p.source === "bol" ? bolRecords.find((b) => b.id === p.sourceBolId)?.docNumber : null;
      if (existing) {
        existing.sources.add(p.source);
        for (const f of freight) if (!existing.observedFreight.includes(f)) existing.observedFreight.push(f);
        for (const l of lanes) if (!existing.observedLanes.includes(l)) existing.observedLanes.push(l);
        if (docNumber && !existing.bolDocNumbers.includes(docNumber)) existing.bolDocNumbers.push(docNumber);
        if (p.releasedAt > existing.lastReleasedAt) existing.lastReleasedAt = p.releasedAt;
      } else {
        const loc = companyLocations.find((l) => l.companyId === p.companyId);
        const company = companies.find((c) => c.id === p.companyId);
        byCompany.set(p.companyId, {
          companyId: p.companyId,
          sources: new Set([p.source]),
          observedFreight: freight,
          observedLanes: lanes,
          lastReleasedAt: p.releasedAt,
          location: loc ? `${loc.city}, ${loc.state}` : company ? `${company.city}, ${company.state}` : null,
          bolDocNumbers: docNumber ? [docNumber] : [],
        });
      }
    }
    return Array.from(byCompany.values()).sort((a, b) => b.lastReleasedAt.localeCompare(a.lastReleasedAt));
  }, [prospects, companies, companyLocations, bolRecords, otrEntries]);

  return (
    <div className={PAGE_WIDTH}>
      <PageHeader
        title="Prospects"
        subtitle={`${groups.length} companies released to Sales · from OTR research or BOL Center — nothing lands here without an explicit admin release`}
      />

      {groups.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconFlame />}
            title="No prospects yet"
            body="When an admin releases a company from OTR or BOL Center, it shows up here."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <ProspectCard key={g.companyId} group={g} />
          ))}
        </div>
      )}
    </div>
  );
}

function sourceFreight(p: Prospect, bolRecords: ReturnType<typeof useStore>["bolRecords"], otrEntries: ReturnType<typeof useStore>["otrEntries"]): string[] {
  if (p.source === "bol") return bolRecords.find((b) => b.id === p.sourceBolId)?.research.observedFreight ?? [];
  return otrEntries.find((o) => o.id === p.sourceOtrId)?.research.observedFreight ?? [];
}
function sourceLanes(p: Prospect, bolRecords: ReturnType<typeof useStore>["bolRecords"], otrEntries: ReturnType<typeof useStore>["otrEntries"]): string[] {
  if (p.source === "bol") return bolRecords.find((b) => b.id === p.sourceBolId)?.research.observedLanes ?? [];
  return otrEntries.find((o) => o.id === p.sourceOtrId)?.research.observedLanes ?? [];
}

function ProspectCard({ group }: { group: ProspectGroup }) {
  const { companies } = useStore();
  const company = companies.find((c) => c.id === group.companyId);
  if (!company) return null;

  const hasBol = group.sources.has("bol");
  const hasOtr = group.sources.has("otr");

  return (
    <Link href={`/crm-design/companies/${company.id}`}>
      <Card className="flex h-full flex-col p-4 transition-shadow hover:shadow-[var(--cd-shadow-lg)]">
        <div className="flex flex-1 flex-col gap-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[15px] font-bold text-[var(--cd-text)]">{company.name}</p>
              <p className={`${TEXT.micro} text-[var(--cd-text-muted)]`}>{company.industry}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {hasBol && <Badge tone="admin">From BOL</Badge>}
            {hasOtr && <Badge tone="accent">From research</Badge>}
          </div>

          {group.location && (
            <p className={`flex items-center gap-1.5 ${TEXT.micro} text-[var(--cd-text-muted)]`}>
              <IconMapPin width={13} height={13} className="shrink-0" /> {group.location}
            </p>
          )}

          {(group.observedFreight.length > 0 || group.observedLanes.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {group.observedFreight.slice(0, 2).map((f) => (
                <Badge key={f} tone="neutral">{f}</Badge>
              ))}
              {group.observedLanes.slice(0, 1).map((l) => (
                <Badge key={l} tone="neutral">{l}</Badge>
              ))}
            </div>
          )}
        </div>

        <div className={`mt-3 border-t border-[var(--cd-border)] pt-2.5 ${TEXT.micro} text-[var(--cd-text-muted)]`}>
          {group.bolDocNumbers.length > 0 && (
            <p className="truncate">Sourced from BOL #{group.bolDocNumbers.join(", #")}</p>
          )}
          <p>Released {relativeTime(group.lastReleasedAt)}</p>
        </div>
      </Card>
    </Link>
  );
}
