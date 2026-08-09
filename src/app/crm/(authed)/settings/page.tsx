import Link from "next/link";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { BTN_EDIT, PageShell, Card, CardHead, ZEBRA_ROWS } from "../_shell/ui";
import { firstName } from "../_shell/format";
import { LocalTime } from "../_shell/LocalTime";
import { MemberEditButton } from "./MemberEditButton";

export const dynamic = "force-dynamic";

type MemberRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  title: string | null;
  role: string;
  is_active: boolean;
};

function initials(name: string | null, email: string | null): string {
  const source = (name || email || "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  }
  return source.charAt(0).toUpperCase();
}

function roleLabel(role: string): string {
  return role === "owner" ? "Admin" : "Member";
}

/**
 * Settings — the signed-in identity plus the org's Team roster (crm_profiles,
 * RLS-scoped: crm_profiles_rw lets any signed-in member read every profile in
 * their org). Editing a member (name, title, active status) is gated to
 * role=owner at the app layer in ./actions — RLS itself only scopes rows to
 * the org, not by role, so this page is the enforcement point.
 */
export default async function SettingsPage() {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { data } = await supabase
    .from("crm_profiles")
    .select("id, full_name, email, title, role, is_active")
    .order("full_name", { ascending: true });

  const members = ((data ?? []) as MemberRow[]).slice().sort((a, b) => {
    if (a.role === "owner" && b.role !== "owner") return -1;
    if (b.role === "owner" && a.role !== "owner") return 1;
    return (a.full_name || a.email || "").localeCompare(b.full_name || b.email || "");
  });

  const isAdmin = user.role === "owner";
  const me = members.find((m) => m.id === user.id);

  // "Last seen" per member — owner-only, so this extra query never runs for
  // regular members (mirroring the pendingReviewCount pattern in layout.tsx).
  // crm_user_events has no per-member aggregate to query directly, so this
  // reads the org's most recent events newest-first and keeps the first
  // (= latest) occurrence per user_id — same "first-seen wins" reduction
  // ai-review/page.tsx uses for its most-recent-pinned-note lookup.
  const lastSeenByUser = new Map<string, string>();
  if (isAdmin) {
    const { data: recentEvents } = await supabase
      .from("crm_user_events")
      .select("user_id, created_at")
      .order("created_at", { ascending: false })
      .limit(1000);
    for (const e of (recentEvents ?? []) as { user_id: string; created_at: string }[]) {
      if (!lastSeenByUser.has(e.user_id)) lastSeenByUser.set(e.user_id, e.created_at);
    }
  }

  return (
    <PageShell>
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
          title="Team"
          hint={`${members.length} ${members.length === 1 ? "member" : "members"}`}
        />
        {members.length === 0 ? (
          <div className="px-5 py-8 text-center text-[13px] text-fg-muted">
            No team members found.
          </div>
        ) : (
          <ul className={`divide-y divide-line-strong ${ZEBRA_ROWS}`}>
            {members.map((m) => {
              const isSelf = m.id === user.id;
              return (
                <li key={m.id} className="flex items-center gap-3 px-5 py-3.5">
                  <Avatar name={m.full_name} email={m.email} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[14px] font-semibold text-fg">
                        {firstName(m.full_name, m.email) || "Unnamed"}
                      </span>
                      {isSelf && (
                        <span className="bg-steel-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-steel">
                          You
                        </span>
                      )}
                      {m.role === "owner" && (
                        <span className="bg-ok-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ok">
                          Admin
                        </span>
                      )}
                      {!m.is_active && (
                        <span className="bg-warn-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warn">
                          Inactive
                        </span>
                      )}
                    </div>
                    <p className="truncate text-[12.5px] text-fg-muted">
                      {m.title || "No title"} · {m.email || "—"}
                    </p>
                    {isAdmin && (
                      <p className="mt-0.5 truncate text-[11.5px] text-fg-subtle">
                        Last seen:{" "}
                        {lastSeenByUser.has(m.id) ? (
                          <LocalTime iso={lastSeenByUser.get(m.id)} />
                        ) : (
                          "Never"
                        )}
                      </p>
                    )}
                  </div>
                  {isAdmin && (
                    <div className="flex shrink-0 items-center gap-1">
                      <Link
                        href={`/crm/settings/activity/${m.id}`}
                        prefetch={false}
                        className={`rounded-md px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${BTN_EDIT}`}
                      >
                        Activity
                      </Link>
                      <MemberEditButton
                        member={{
                          id: m.id,
                          full_name: m.full_name,
                          title: m.title,
                          is_active: m.is_active,
                        }}
                        isSelf={isSelf}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <CardHead
          title="Workspace"
          hint="Pipelines, tags, and custom fields — coming next."
        />
        <div className="px-5 py-8 text-center text-[13px] text-fg-muted">
          Workspace configuration arrives in a later step.
        </div>
      </Card>
    </PageShell>
  );
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
      className="flex shrink-0 items-center justify-center bg-accent font-semibold text-white"
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
