"use client";

import Link from "next/link";
import { useStore } from "../../../_lib/store";
import { Avatar, Badge, Card, CardHead, TEXT, ZEBRA } from "../../../_design/ui";
import { formatDate } from "../../../_lib/format";

export default function AdminAccountsPage() {
  const { team } = useStore();
  return (
    <Card>
      <CardHead title="Team" hint={`${team.length} accounts`} />
      <ul className={`divide-y divide-[var(--cd-border)] ${ZEBRA}`}>
        {team.map((m) => (
          <li key={m.id}>
            <Link href={`/crm-design/admin/accounts/${m.id}`} className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[var(--cd-admin-soft)]">
              <Avatar name={m.name} size={40} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-[14px] font-semibold text-[var(--cd-text)]">{m.name}</span>
                  {m.isPrimaryOwner ? (
                    <Badge tone="admin">Primary owner</Badge>
                  ) : m.role === "owner" || m.role === "admin" ? (
                    <Badge tone="success">Admin</Badge>
                  ) : (
                    <Badge tone="neutral">Sales Agent</Badge>
                  )}
                  {!m.isActive && <Badge tone="danger">Suspended</Badge>}
                </div>
                <p className={`truncate ${TEXT.micro} text-[var(--cd-text-muted)]`}>
                  {m.email} · {m.companiesOwned} {m.companiesOwned === 1 ? "company" : "companies"} · {m.openTasks} open tasks
                </p>
              </div>
              <span className={`shrink-0 ${TEXT.micro} text-[var(--cd-text-subtle)]`}>Since {formatDate(m.createdAt)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
