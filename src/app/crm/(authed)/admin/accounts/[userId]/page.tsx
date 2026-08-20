import { notFound } from "next/navigation";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { Card, CardHead } from "../../../_shell/ui";
import { BackButton } from "../../../_shell/BackButton";
import { LocalTime } from "../../../_shell/LocalTime";
import { formatDate } from "../../../_shell/format";
import { listTeamMembers } from "../../accounts-data";
import { MemberAccountForm } from "./MemberAccountForm";

export const dynamic = "force-dynamic";

function initials(name: string | null, email: string | null): string {
  const source = (name || email || "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  return source.charAt(0).toUpperCase();
}

/**
 * A team member's Admin Account detail page — left profile card (read-only)
 * + right ACCESS LEVEL/ACCOUNT CONTROLS form (MemberAccountForm), or a locked
 * notice in place of that form for the two accounts nothing here can ever
 * touch: the primary owner (server-enforced too — see ../../actions.ts) and
 * the viewer's own row (an admin can't promote/demote/deactivate themselves
 * through this page, same rule ../../settings's old MemberDialog enforced
 * for deactivation, extended here to every field).
 */
export default async function AdminMemberDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const viewer = await requireCrmUser();
  const allMembers = await listTeamMembers();
  const member = allMembers.find((m) => m.id === userId) ?? null;
  if (!member) notFound();

  // Reassignment-target roster for the Suspend flow — every OTHER active
  // member in the org (may include the primary owner or the viewer
  // themselves; only the row being suspended is excluded).
  const reassignTargets = allMembers.filter((m) => m.isActive && m.id !== member.id);

  const supabase = await createCrmServerClient();
  const { data: orgRow } = await supabase.from("crm_orgs").select("name").eq("id", viewer.orgId).maybeSingle();
  const teamName = (orgRow as { name: string } | null)?.name || "—";

  const isSelf = member.id === viewer.id;
  const locked = member.isPrimaryOwner || isSelf;

  return (
    <div>
      <div className="mb-4">
        <BackButton fallbackHref="/crm/admin/accounts" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="h-fit">
          <CardHead title="Profile" />
          <div className="flex flex-col items-center gap-2 px-5 py-6 text-center">
            <span className="flex h-16 w-16 items-center justify-center bg-accent text-[22px] font-semibold text-white">
              {initials(member.fullName, member.email)}
            </span>
            <p className="text-[16px] font-bold text-fg">{member.fullName || "Unnamed"}</p>
            <p className="text-[13px] text-fg-muted">{member.email || "—"}</p>
            <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5">
              {member.isPrimaryOwner ? (
                <span className="bg-admin-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-admin">
                  Primary owner
                </span>
              ) : member.role === "owner" ? (
                <span className="bg-ok-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ok">
                  Admin
                </span>
              ) : (
                <span className="bg-steel-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-steel">
                  Sales Agent
                </span>
              )}
              <span
                className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  member.isActive ? "bg-ok-bg text-ok" : "bg-bad-bg text-bad"
                }`}
              >
                {member.isActive ? "Active" : "Suspended"}
              </span>
            </div>
          </div>
          <dl className="divide-y divide-line-strong border-t border-line-strong">
            <Row label="Team" value={teamName} />
            <Row label="Created" value={formatDate(member.createdAt)} />
            <Row
              label="Last active"
              value={member.lastActiveAt ? <LocalTime iso={member.lastActiveAt} /> : "Never"}
            />
            <Row label="Companies owned" value={String(member.companiesOwned)} />
            <Row label="Open tasks" value={String(member.openTasks)} />
          </dl>
        </Card>

        <Card>
          <CardHead title="Access & controls" />
          <div className="p-5">
            {locked ? (
              <p className="rounded-[5px] border border-line-strong bg-inset px-3 py-3 text-[13px] text-fg-subtle">
                {member.isPrimaryOwner
                  ? "This is the primary owner's account. It can't be changed by anyone, including other admins."
                  : "You can't edit your own account from here — ask another admin, or the primary owner."}
              </p>
            ) : (
              <MemberAccountForm
                key={`${member.id}-${member.role}-${member.isActive}-${member.canViewAllCompanies}`}
                member={member}
                reassignTargets={reassignTargets}
              />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">{label}</dt>
      <dd className="text-[13px] font-medium text-fg">{value}</dd>
    </div>
  );
}
