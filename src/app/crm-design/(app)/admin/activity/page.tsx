"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "../../../_lib/store";
import { Badge, Card, CardHead, EmptyState, INPUT, TEXT, ZEBRA } from "../../../_design/ui";
import { formatDateTime } from "../../../_lib/format";
import { IconActivity, IconSearch } from "../../../_design/icons";
import type { AuditAction, AuditLogItem } from "../../../_lib/types";

const ACTION_LABEL: Record<AuditAction, string> = {
  role_changed: "Role changed",
  user_suspended: "User suspended",
  user_reactivated: "User reactivated",
  visibility_changed: "Visibility changed",
  user_invited: "User invited",
  company_reassigned: "Company reassigned",
  org_settings_changed: "Org settings changed",
};

const ACTION_TONE: Record<AuditAction, "danger" | "success" | "accent" | "neutral"> = {
  role_changed: "accent",
  user_suspended: "danger",
  user_reactivated: "success",
  visibility_changed: "accent",
  user_invited: "success",
  company_reassigned: "accent",
  org_settings_changed: "neutral",
};

/**
 * Admin → Activity Log — the real, dedicated audit trail the real CRM does
 * not have (CRM_MASTER_AUDIT.md §3: admin actions are explicitly never
 * logged there, by design, which stops being safe once a second admin
 * exists — which the product already allows). Every entry here is WHO did
 * WHAT to WHOM/WHAT, WHEN, with a row that deep-links straight to the
 * affected record — exactly the brief's "John changed Acme Logistics from
 * Active to Suspended" requirement. Kept as its own tab (not merged into
 * the sales Activity Feed) — see §12/§14's naming-collision reasoning.
 */
export default function AdminActivityLogPage() {
  const { auditLog, team } = useStore();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [actor, setActor] = useState("");
  const [action, setAction] = useState<AuditAction | "">("");
  const [range, setRange] = useState<"" | "7" | "30" | "90">("");

  const filtered = useMemo(() => {
    let rows = auditLog;
    if (actor) rows = rows.filter((r) => r.actorId === actor);
    if (action) rows = rows.filter((r) => r.action === action);
    if (range) {
      const cutoff = Date.now() - Number(range) * 86_400_000;
      rows = rows.filter((r) => new Date(r.occurredAt).getTime() >= cutoff);
    }
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      rows = rows.filter((r) => r.summary.toLowerCase().includes(needle) || (r.detail ?? "").toLowerCase().includes(needle));
    }
    return rows;
  }, [auditLog, q, actor, action, range]);

  function openTarget(row: AuditLogItem) {
    if (row.targetUserId) router.push(`/crm-design/admin/accounts/${row.targetUserId}`);
    else if (row.targetCompanyId) router.push(`/crm-design/companies/${row.targetCompanyId}`);
  }

  return (
    <div className="space-y-4">
      <Card className="flex flex-col gap-3 p-3">
        <label className="relative flex items-center">
          <IconSearch width={15} height={15} className="pointer-events-none absolute left-3 text-[var(--cd-text-subtle)]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the audit trail…" className={`${INPUT} pl-8`} />
        </label>
        <div className="flex flex-wrap gap-2">
          <select value={actor} onChange={(e) => setActor(e.target.value)} className={`${INPUT} w-auto`}>
            <option value="">Any admin</option>
            {team.filter((m) => m.role === "owner" || m.role === "admin").map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <select value={action} onChange={(e) => setAction(e.target.value as AuditAction | "")} className={`${INPUT} w-auto`}>
            <option value="">Any action</option>
            {Object.entries(ACTION_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          <select value={range} onChange={(e) => setRange(e.target.value as typeof range)} className={`${INPUT} w-auto`}>
            <option value="">Any time</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState icon={<IconActivity />} title="No matching entries" body="Try a different filter combination." />
        </Card>
      ) : (
        <Card>
          <CardHead title="Audit trail" hint={`${filtered.length} entries`} />
          <ul className={`divide-y divide-[var(--cd-border)] ${ZEBRA}`}>
            {filtered.map((row) => (
              <AuditRow key={row.id} row={row} onOpen={() => openTarget(row)} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function AuditRow({ row, onOpen }: { row: AuditLogItem; onOpen: () => void }) {
  const clickable = Boolean(row.targetUserId || row.targetCompanyId);
  return (
    <li
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onOpen : undefined}
      onKeyDown={clickable ? (e) => (e.key === "Enter" ? onOpen() : undefined) : undefined}
      className={`flex flex-wrap items-start justify-between gap-3 px-4 py-3.5 ${clickable ? "cursor-pointer transition-colors hover:bg-[var(--cd-admin-soft)]" : ""}`}
    >
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <Badge tone={ACTION_TONE[row.action]}>{ACTION_LABEL[row.action]}</Badge>
          <span className={`${TEXT.micro} text-[var(--cd-text-muted)]`}>{formatDateTime(row.occurredAt)}</span>
        </div>
        <p className="text-[13.5px] font-medium text-[var(--cd-text)]">{row.summary}</p>
        {row.detail && <p className={`mt-0.5 ${TEXT.micro} text-[var(--cd-text-muted)]`}>{row.detail}</p>}
      </div>
      {clickable && (
        <span className="shrink-0 text-[12.5px] font-semibold text-[var(--cd-admin)]">View record →</span>
      )}
    </li>
  );
}
