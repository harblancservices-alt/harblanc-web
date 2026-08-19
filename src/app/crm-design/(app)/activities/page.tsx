"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore, useTeamMemberById } from "../../_lib/store";
import { Badge, Card, CardHead, EmptyState, INPUT, PAGE_WIDTH, PageHeader, TEXT, ZEBRA } from "../../_design/ui";
import { firstName, formatDateTime } from "../../_lib/format";
import { IconActivity, IconDocument, IconMail, IconPhone, IconSearch, IconTasks } from "../../_design/icons";
import type { ActivityKind } from "../../_lib/types";

const KIND_LABEL: Record<ActivityKind, string> = {
  call: "Call",
  note: "Note",
  email: "Email",
  stage_change: "Stage change",
  task: "Task",
  document: "Document",
};
const KIND_ICON: Record<ActivityKind, React.ReactNode> = {
  call: <IconPhone width={13} height={13} />,
  note: <IconActivity width={13} height={13} />,
  email: <IconMail width={13} height={13} />,
  stage_change: <IconActivity width={13} height={13} />,
  task: <IconTasks width={13} height={13} />,
  document: <IconDocument width={13} height={13} />,
};

/**
 * Org-wide sales-activity feed — calls, notes, emails, stage changes,
 * documents generated, across every company. Deliberately distinct from
 * Admin → Activity Log (which records admin actions: role changes,
 * suspensions, visibility toggles). Keeping these separate, with different
 * names and different purposes, is a direct fix for the audit's naming-
 * collision warning (CRM_MASTER_AUDIT.md §12/§14) — "Activity" meaning two
 * unrelated things in one product.
 */
export default function ActivitiesPage() {
  const { activities, companies } = useStore();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<ActivityKind | "">("");

  const filtered = useMemo(() => {
    let rows = activities;
    if (kind) rows = rows.filter((a) => a.kind === kind);
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      rows = rows.filter((a) => {
        const company = companies.find((c) => c.id === a.companyId);
        return a.title.toLowerCase().includes(needle) || (a.body ?? "").toLowerCase().includes(needle) || (company?.name ?? "").toLowerCase().includes(needle);
      });
    }
    return rows;
  }, [activities, q, kind, companies]);

  return (
    <div className={PAGE_WIDTH}>
      <PageHeader title="Activity Feed" subtitle="Every call, note, email, and document across every company — sales activity, not an admin log." />

      <Card className="mb-4 flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <label className="relative flex flex-1 items-center">
          <IconSearch width={15} height={15} className="pointer-events-none absolute left-3 text-[var(--cd-text-subtle)]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search activity…" className={`${INPUT} pl-8`} />
        </label>
        <select value={kind} onChange={(e) => setKind(e.target.value as ActivityKind | "")} className={`${INPUT} sm:w-48`}>
          <option value="">All types</option>
          {Object.entries(KIND_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </Card>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState icon={<IconActivity />} title="No activity matches" body="Try a different search or filter." />
        </Card>
      ) : (
        <Card>
          <CardHead title="Activity" hint={`${filtered.length} events`} />
          <ul className={`divide-y divide-[var(--cd-border)] ${ZEBRA}`}>
            {filtered.map((a) => (
              <ActivityRow key={a.id} kind={a.kind} title={a.title} body={a.body} authorId={a.authorId} companyId={a.companyId} occurredAt={a.occurredAt} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function ActivityRow({
  kind,
  title,
  body,
  authorId,
  companyId,
  occurredAt,
}: {
  kind: ActivityKind;
  title: string;
  body: string | null;
  authorId: string;
  companyId: string | null;
  occurredAt: string;
}) {
  const { companies } = useStore();
  const author = useTeamMemberById(authorId);
  const company = companies.find((c) => c.id === companyId);
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">
            <span className="mr-1 inline-flex">{KIND_ICON[kind]}</span>
            {KIND_LABEL[kind]}
          </Badge>
          <span className="truncate text-[13.5px] font-semibold text-[var(--cd-text)]">{title}</span>
        </div>
        {body && <p className={`mt-1 ${TEXT.micro} text-[var(--cd-text-muted)]`}>{body}</p>}
        <p className={`mt-1 ${TEXT.micro} text-[var(--cd-text-subtle)]`}>
          {firstName(author?.name ?? "Someone")} · {formatDateTime(occurredAt)}
        </p>
      </div>
      {company && (
        <Link href={`/crm-design/companies/${company.id}`} className={`shrink-0 rounded-[var(--cd-radius-sm)] border border-[var(--cd-accent)]/30 bg-[var(--cd-accent-soft)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--cd-accent)] transition-colors hover:bg-[var(--cd-accent)] hover:text-white`}>
          {company.name}
        </Link>
      )}
    </li>
  );
}
