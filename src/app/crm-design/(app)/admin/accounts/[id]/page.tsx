"use client";

import { useState } from "react";
import { notFound, useParams } from "next/navigation";
import { useStore } from "../../../../_lib/store";
import { Avatar, Badge, Button, Card, CardHead, Field, INPUT, SegmentedControl, TEXT } from "../../../../_design/ui";
import { formatDate, relativeTime } from "../../../../_lib/format";
import { Modal } from "../../../../_design/Modal";
import { BackLink } from "../../../../_shared/BackLink";

/**
 * The Admin member detail page — this is where CRM_MASTER_AUDIT.md §3/§6's
 * P0 finding gets fixed. In the real CRM, "Active account" is a plain
 * checkbox on the general Save form AND a separate Suspend-and-reassign
 * flow both write the same is_active column — an admin can silently
 * deactivate someone by unchecking a box and hitting Save, leaving their
 * companies assigned to a now-suspended user, bypassing the entire
 * reassignment guarantee.
 *
 * FIX: status is no longer a checkbox on the general form at all. It's a
 * separate, read-only badge with exactly ONE action button depending on
 * current state — "Suspend & reassign…" (always opens the reassignment
 * dialog; there is no other way to deactivate someone) or "Reactivate"
 * (no reassignment needed, since suspension already moved their book of
 * business to zero). There is now exactly one way to change status, and it
 * is always the safe one.
 */
export default function AdminMemberDetailPage() {
  const params = useParams<{ id: string }>();
  const { team, currentUser, updateTeamMember, suspendAndReassign, reactivateUser } = useStore();
  const member = team.find((m) => m.id === params.id);
  const [role, setRole] = useState<"agent" | "admin">(member?.role === "admin" ? "admin" : "agent");
  const [canViewAll, setCanViewAll] = useState(member?.canViewAllCompanies ?? false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [reassignTo, setReassignTo] = useState("");

  if (!member) return notFound();

  const isSelf = member.id === currentUser.id;
  const locked = member.isPrimaryOwner || isSelf;
  const reassignTargets = team.filter((m) => m.isActive && m.id !== member.id);

  function saveAccess() {
    updateTeamMember(
      member!.id,
      { role, canViewAllCompanies: canViewAll },
      `${currentUser.name} updated ${member!.name}'s access level and visibility`,
    );
  }

  function confirmSuspend() {
    if (!reassignTo) return;
    suspendAndReassign(member!.id, reassignTo);
    setSuspendOpen(false);
    setReassignTo("");
  }

  return (
    <div>
      <div className="mb-4">
        <BackLink href="/crm-design/admin/accounts" label="Accounts" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="h-fit">
          <CardHead title="Profile" />
          <div className="flex flex-col items-center gap-2 px-5 py-6 text-center">
            <Avatar name={member.name} size={64} />
            <p className="text-[16px] font-bold text-[var(--cd-text)]">{member.name}</p>
            <p className={`${TEXT.micro} text-[var(--cd-text-muted)]`}>{member.email}</p>
            <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5">
              {member.isPrimaryOwner ? (
                <Badge tone="admin">Primary owner</Badge>
              ) : member.role === "admin" || member.role === "owner" ? (
                <Badge tone="success">Admin</Badge>
              ) : (
                <Badge tone="neutral">Sales Agent</Badge>
              )}
              <Badge tone={member.isActive ? "success" : "danger"}>{member.isActive ? "Active" : "Suspended"}</Badge>
            </div>
          </div>
          <dl className="divide-y divide-[var(--cd-border)] border-t border-[var(--cd-border)]">
            <Row label="Created" value={formatDate(member.createdAt)} />
            <Row label="Last active" value={relativeTime(member.lastActiveAt)} />
            <Row label="Companies owned" value={String(member.companiesOwned)} />
            <Row label="Open tasks" value={String(member.openTasks)} />
          </dl>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHead title="Status" hint="The only way to change this is below — there is no other checkbox that touches it." />
            <div className="flex flex-wrap items-center justify-between gap-3 p-5">
              <div>
                <Badge tone={member.isActive ? "success" : "danger"}>{member.isActive ? "Active" : "Suspended"}</Badge>
                <p className={`mt-1.5 ${TEXT.micro} max-w-sm text-[var(--cd-text-muted)]`}>
                  {member.isActive
                    ? "Suspending always reassigns this member's companies first — there is no way to suspend without reassigning."
                    : "This member's companies were already reassigned when they were suspended. Reactivating restores sign-in access only."}
                </p>
              </div>
              {locked ? (
                <span className={`${TEXT.micro} text-[var(--cd-text-muted)]`}>
                  {member.isPrimaryOwner ? "The primary owner can't be changed." : "You can't change your own status here."}
                </span>
              ) : member.isActive ? (
                <Button variant="danger" onClick={() => setSuspendOpen(true)}>
                  Suspend &amp; reassign…
                </Button>
              ) : (
                <Button variant="primary" onClick={() => reactivateUser(member.id)}>
                  Reactivate
                </Button>
              )}
            </div>
          </Card>

          <Card>
            <CardHead title="Access & visibility" />
            <div className="flex flex-col gap-5 p-5">
              {locked ? (
                <p className={`rounded-[var(--cd-radius-sm)] border border-[var(--cd-border)] bg-[var(--cd-surface-2)] px-3.5 py-3 ${TEXT.body} text-[var(--cd-text-muted)]`}>
                  {member.isPrimaryOwner
                    ? "This is the primary owner's account. It can't be changed by anyone, including other admins."
                    : "You can't edit your own access level here — ask another admin, or the primary owner."}
                </p>
              ) : (
                <>
                  <div>
                    <p className={`mb-1.5 ${TEXT.label} text-[var(--cd-text-muted)]`}>Access level</p>
                    <SegmentedControl
                      mode="field"
                      options={[
                        { key: "agent", label: "Sales Agent", tone: "accent" },
                        { key: "admin", label: "Admin", tone: "admin" },
                      ]}
                      active={role}
                      onChange={setRole}
                    />
                    {role === "admin" && member.role !== "admin" && member.role !== "owner" && (
                      <p className={`mt-1.5 ${TEXT.micro} text-[var(--cd-text-muted)]`}>
                        Admin gives {member.name} control over every non-primary-owner account except their own — including
                        the ability to suspend other Sales Agents.
                      </p>
                    )}
                  </div>

                  <label className="flex items-center justify-between gap-3">
                    <span>
                      <span className="block text-[13.5px] font-semibold text-[var(--cd-text)]">Can view all companies</span>
                      <span className={`block ${TEXT.micro} text-[var(--cd-text-muted)]`}>
                        Off restricts this Sales Agent to only the companies assigned to them.
                      </span>
                    </span>
                    <input type="checkbox" checked={canViewAll} onChange={(e) => setCanViewAll(e.target.checked)} className="h-5 w-9 shrink-0 accent-[var(--cd-accent)]" />
                  </label>

                  <div>
                    <Button variant="primary" size="sm" onClick={saveAccess}>
                      Save changes
                    </Button>
                  </div>
                </>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={suspendOpen}
        onClose={() => setSuspendOpen(false)}
        title="Suspend user"
        subtitle={`Reassign ${member.name}'s companies, then suspend.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSuspendOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmSuspend} disabled={!reassignTo || reassignTargets.length === 0}>
              Reassign &amp; suspend
            </Button>
          </>
        }
      >
        {reassignTargets.length === 0 ? (
          <p className={`rounded-[var(--cd-radius-sm)] border border-[var(--cd-border)] bg-[var(--cd-surface-2)] px-3.5 py-3 ${TEXT.body} text-[var(--cd-text-muted)]`}>
            There&rsquo;s no other active user to reassign {member.name}&rsquo;s companies to.
          </p>
        ) : (
          <>
            <p className={`mb-3 ${TEXT.body} text-[var(--cd-text)]`}>
              Reassign <span className="font-semibold">{member.name}</span>&rsquo;s {member.companiesOwned} companies to:
            </p>
            <Field label="Reassign to">
              <select className={INPUT} value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
                <option value="">Choose a team member…</option>
                {reassignTargets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.isPrimaryOwner ? "(Primary owner)" : t.role === "admin" || t.role === "owner" ? "(Admin)" : ""}
                  </option>
                ))}
              </select>
            </Field>
            <p className={`mt-3 ${TEXT.micro} text-[var(--cd-text-muted)]`}>
              Every company assigned to {member.name} moves to the person you choose, then their account is suspended —
              they won&rsquo;t be able to sign in.
            </p>
          </>
        )}
      </Modal>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3">
      <dt className={`${TEXT.label} text-[var(--cd-text-muted)]`}>{label}</dt>
      <dd className="text-[13px] font-medium text-[var(--cd-text)]">{value}</dd>
    </div>
  );
}
