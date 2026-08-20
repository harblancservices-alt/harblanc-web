import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { PageShell, Card, CardHead } from "../_shell/ui";
import { firstName } from "../_shell/format";
import { BrokerProfileEditButton } from "./BrokerProfileEditButton";
import { getBrokerProfile } from "../_shell/brokerProfile";

export const dynamic = "force-dynamic";

/**
 * Settings — the signed-in identity plus the org's Company / Brokerage Info
 * (the letterhead every generated document reads from). Team management, the
 * per-member activity log, and the org document library used to live here
 * too; all three moved into the owner-only Admin Account section
 * (/crm/admin — see ../admin/**) and were removed from this page so there's
 * no duplicate surface for any of them. Settings itself stays reachable by
 * every CRM member (not owner-gated) since "your account" + reading the
 * company's letterhead info are both things a regular member still needs.
 */
export default async function SettingsPage() {
  const user = await requireCrmUser();
  const isAdmin = user.role === "owner";
  const supabase = await createCrmServerClient();

  const [{ data: meRow }, brokerProfile] = await Promise.all([
    supabase.from("crm_profiles").select("full_name, title").eq("id", user.id).maybeSingle(),
    getBrokerProfile(),
  ]);
  const me = meRow as { full_name: string | null; title: string | null } | null;

  return (
    <PageShell title="Settings">
      <Card>
        <CardHead title="Your account" />
        <div className="flex items-center gap-3 px-5 py-4">
          <Avatar name={me?.full_name ?? user.fullName} email={user.email} size={48} />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-fg">
              {firstName(me?.full_name ?? user.fullName, user.email) || "—"}
            </p>
            <p className="truncate text-[13px] text-fg-muted">
              {me?.title || "No title set"} · {user.email}
            </p>
          </div>
        </div>
        <dl className="divide-y divide-line-strong border-t border-line-strong">
          <Row label="Role" value={roleLabel(user.role)} />
        </dl>
      </Card>

      <Card>
        <CardHead
          title="Company / Brokerage Info"
          hint="The letterhead every generated document reads from."
          right={isAdmin && <BrokerProfileEditButton profile={brokerProfile} />}
        />
        <dl className="divide-y divide-line-strong">
          <Row label="Company name" value={brokerProfile.name || "—"} />
          <Row label="MC #" value={brokerProfile.mc || "—"} />
          <Row label="DOT #" value={brokerProfile.dot || "—"} />
          <Row label="Address" value={brokerProfile.address || "—"} />
          <Row label="Phone" value={brokerProfile.phone || "—"} />
          <Row label="Email" value={brokerProfile.email || "—"} />
        </dl>
      </Card>
    </PageShell>
  );
}

function roleLabel(role: string): string {
  return role === "owner" ? "Admin" : "Member";
}

function initials(name: string | null, email: string | null): string {
  const source = (name || email || "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  }
  return source.charAt(0).toUpperCase();
}

function Avatar({
  name,
  email,
  size,
}: {
  name: string | null | undefined;
  email: string | null | undefined;
  size: number;
}) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-accent font-semibold text-white"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {initials(name ?? null, email ?? null)}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5">
      <dt className="text-[12px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
        {label}
      </dt>
      <dd className="text-[14px] text-fg">{value}</dd>
    </div>
  );
}
