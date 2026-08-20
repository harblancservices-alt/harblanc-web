import Link from "next/link";
import { Card, CardHead, ZEBRA_ROWS, EmptyState } from "../../_shell/ui";
import { firstName, formatDate } from "../../_shell/format";
import { IconContacts } from "../../_shell/icons";
import { listTeamMembers } from "../accounts-data";

export const dynamic = "force-dynamic";

function initials(name: string | null, email: string | null): string {
  const source = (name || email || "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  return source.charAt(0).toUpperCase();
}

/**
 * Admin Account "Accounts" — the team roster this feature moves out of
 * Settings (../../settings/page.tsx's old "Team" card + MemberDialog, both
 * removed). Every row opens the member's own detail page
 * (./[userId]/page.tsx) for access-level + account-control changes; nothing
 * is editable inline here.
 */
export default async function AdminAccountsPage() {
  const members = await listTeamMembers();

  return (
    <Card>
      <CardHead title="Team" hint={`${members.length} ${members.length === 1 ? "account" : "accounts"}`} />
      {members.length === 0 ? (
        <EmptyState icon={<IconContacts />} title="No team accounts" body="Team members will show up here." />
      ) : (
        <ul className={`divide-y divide-line-strong ${ZEBRA_ROWS}`}>
          {members.map((m) => (
            <li key={m.id}>
              <Link
                href={`/crm/admin/accounts/${m.id}`}
                prefetch={false}
                className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-accent/5"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-accent text-[13px] font-semibold text-white">
                  {initials(m.fullName, m.email)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[14px] font-semibold text-fg">
                      {firstName(m.fullName, m.email) || "Unnamed"}
                    </span>
                    {m.isPrimaryOwner ? (
                      <span className="bg-admin-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-admin">
                        Primary owner
                      </span>
                    ) : m.role === "owner" ? (
                      <span className="bg-ok-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ok">
                        Admin
                      </span>
                    ) : (
                      <span className="bg-steel-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-steel">
                        Sales Agent
                      </span>
                    )}
                    {!m.isActive && (
                      <span className="bg-bad-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-bad">
                        Suspended
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[12.5px] text-fg-muted">
                    {m.email || "—"} · {m.companiesOwned} {m.companiesOwned === 1 ? "company" : "companies"} ·{" "}
                    {m.openTasks} open {m.openTasks === 1 ? "task" : "tasks"}
                  </p>
                </div>
                <span className="shrink-0 text-[12px] text-fg-subtle">
                  Since {formatDate(m.createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
