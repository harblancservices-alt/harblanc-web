import { requireCrmUser } from "@/lib/crm/auth";
import { PageShell, Card, CardHead } from "../_shell/ui";

export const dynamic = "force-dynamic";

/**
 * Settings — Phase-1 shows the signed-in identity (proof the isolated CRM
 * session resolves), with org/team/pipeline configuration to follow.
 */
export default async function SettingsPage() {
  const user = await requireCrmUser();

  return (
    <PageShell
      eyebrow="Configuration"
      title="Settings"
      subtitle="Your account and workspace."
    >
      <Card>
        <CardHead title="Your account" />
        <dl className="divide-y divide-line">
          <Row label="Name" value={user.fullName || "—"} />
          <Row label="Email" value={user.email} />
          <Row label="Role" value={user.role} capitalize />
        </dl>
      </Card>

      <Card>
        <CardHead
          title="Workspace"
          hint="Team members, pipelines, tags, and custom fields — coming next."
        />
        <div className="px-5 py-8 text-center text-[13px] text-fg-muted">
          Workspace configuration arrives in a later step.
        </div>
      </Card>
    </PageShell>
  );
}

function Row({
  label,
  value,
  capitalize,
}: {
  label: string;
  value: string;
  capitalize?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5">
      <dt className="text-[12px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
        {label}
      </dt>
      <dd className={`text-[14px] text-fg ${capitalize ? "capitalize" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
