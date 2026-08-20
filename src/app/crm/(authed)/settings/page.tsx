import Link from "next/link";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { PageShell, Card, CardHead } from "../_shell/ui";
import { firstName } from "../_shell/format";
import { getBrokerProfile } from "../_shell/brokerProfile";

export const dynamic = "force-dynamic";

/**
 * Settings — the signed-in identity plus a read-only view of the org's
 * Company / Brokerage Info (the letterhead every generated document reads
 * from). Team management, the per-member activity log, and the org document
 * library used to live here too; all four (this one included, per
 * DESIGN_DECISIONS.md §2/§3) moved into the owner-only Admin Account section
 * (/crm/admin — see ../admin/**). Brokerage Info's *edit* capability now
 * lives at /crm/admin/organization; Settings keeps read access for every
 * member (not owner-gated) since reading the company's letterhead info is
 * still something a regular member needs, just no longer something they (or
 * even an owner, from here) can edit.
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
    <PageShell title="Settings" subtitle="Your personal account.">
      {/* Capped to crm-design's max-w-xl column (was full page width) —
          Settings' short, single-focus cards read as sparse stretched edge
          to edge across the wide container every other /crm list page uses. */}
      <div className="flex max-w-xl flex-col gap-4">
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
            hint="The letterhead every generated document reads from. Read-only here."
            right={
              isAdmin && (
                <Link
                  href="/crm/admin/organization"
                  prefetch={false}
                  className="shrink-0 text-[12.5px] font-semibold text-accent hover:underline"
                >
                  Edit in Admin → Organization
                </Link>
              )
            }
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
      </div>
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
