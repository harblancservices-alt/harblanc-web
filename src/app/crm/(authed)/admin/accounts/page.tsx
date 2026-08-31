import Link from "next/link";
import { Card, CardHead, ZEBRA_ROWS, EmptyState, Badge } from "../../_shell/ui";
import { firstName, formatDate } from "../../_shell/format";
import { IconContacts } from "../../_shell/icons";
import { listTeamMembers, listOrphanLogins } from "../accounts-data";
import { AddUserButton, OrphanLogins } from "./MemberTools";
import { getBrokerProfile } from "../../_shell/brokerProfile";
import { BrokerProfileEditButton } from "../../settings/BrokerProfileEditButton";

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
  const [members, profile, orphans] = await Promise.all([
    listTeamMembers(),
    getBrokerProfile(),
    listOrphanLogins(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <OrgInfoCard profile={profile} />

      {/* THE REPAIR LIST SITS ABOVE THE ROSTER and renders nothing when
          empty — it is the failure that actually happens, so when there is
          one it should be the first thing on the page. */}
      <OrphanLogins logins={orphans} />

      <Card>
      <CardHead
        title="Team"
        hint={`${members.length} ${members.length === 1 ? "account" : "accounts"}`}
        right={<AddUserButton />}
      />
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
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-[13px] font-semibold text-white">
                  {initials(m.fullName, m.email)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[14px] font-semibold text-fg">
                      {firstName(m.fullName, m.email) || "Unnamed"}
                    </span>
                    {m.isPrimaryOwner ? (
                      <Badge tone="admin">Primary owner</Badge>
                    ) : m.role === "owner" ? (
                      <Badge tone="success">Admin</Badge>
                    ) : (
                      <Badge tone="neutral">Sales Agent</Badge>
                    )}
                    {!m.isActive && <Badge tone="danger">Suspended</Badge>}
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
    </div>
  );
}

/**
 * The org's brokerage/letterhead details, folded in from the retired
 * Organization tab (2026-08-25).
 *
 * COMPACT, not a section: the old page was a Card with six full-width rows
 * stacked vertically, which is a whole screen for six short values. Same six
 * fields, same edit control, same data — laid out as a wrapping definition
 * list so it reads as a header strip above the team roster rather than
 * competing with it. NOTHING was cut; every field the Organization page
 * showed is here.
 */
function OrgInfoCard({ profile }: { profile: Awaited<ReturnType<typeof getBrokerProfile>> }) {
  const fields: [string, string][] = [
    ["Company", profile.name || "—"],
    ["MC #", profile.mc || "—"],
    ["DOT #", profile.dot || "—"],
    ["Phone", profile.phone || "—"],
    ["Email", profile.email || "—"],
    ["Address", profile.address || "—"],
  ];

  return (
    <Card>
      <CardHead
        title="Company / Brokerage Info"
        hint="The letterhead every generated document reads from."
        right={<BrokerProfileEditButton profile={profile} />}
      />
      <dl className="flex flex-wrap gap-x-8 gap-y-2.5 px-5 py-3.5">
        {fields.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-fg-subtle">{label}</dt>
            <dd className="text-[13px] text-fg">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
