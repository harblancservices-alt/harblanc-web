import { notFound, redirect } from "next/navigation";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { Card, CardHead, EmptyState } from "../../../_shell/ui";
import { BackButton } from "../../../_shell/BackButton";
import { formatDateTime, parseServerTimestamp, firstName } from "../../../_shell/format";
import { IconContacts } from "../../../_shell/icons";

export const dynamic = "force-dynamic";

type MemberRow = { id: string; full_name: string | null; email: string | null };
type EventRow = {
  id: string;
  kind: string;
  label: string | null;
  path: string | null;
  created_at: string;
};

/**
 * Owner-only per-member activity log — logins (crm/login/LoginForm.tsx) and
 * page views (_shell/ActivityTracker.tsx), both logged silently everywhere
 * in the CRM with no visible trace to the person being logged. Non-owners
 * are redirected server-side, same enforcement point as /crm/ai-review —
 * but the real gate is RLS: crm_user_events' SELECT policy only lets
 * crm_is_owner() through, so a non-owner's query here would come back empty
 * even if this redirect were somehow bypassed.
 */
export default async function MemberActivityPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const user = await requireCrmUser();
  if (user.role !== "owner") redirect("/crm");

  const supabase = await createCrmServerClient();

  const { data: memberData } = await supabase
    .from("crm_profiles")
    .select("id, full_name, email")
    .eq("id", userId)
    .maybeSingle();

  if (!memberData) notFound();
  const member = memberData as MemberRow;

  const { data } = await supabase
    .from("crm_user_events")
    .select("id, kind, label, path, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(500);

  const events = (data ?? []) as EventRow[];

  // Group by calendar day for a cleaner scan — the query is already
  // newest-first, so a single pass is enough (no re-sort needed).
  const groups: { day: string; items: EventRow[] }[] = [];
  for (const e of events) {
    const d = parseServerTimestamp(e.created_at);
    const dayKey = d
      ? d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      : "Unknown date";
    const last = groups[groups.length - 1];
    if (last && last.day === dayKey) last.items.push(e);
    else groups.push({ day: dayKey, items: [e] });
  }

  const name = firstName(member.full_name, member.email) || "This member";

  return (
    <div className="mx-auto max-w-3xl px-4 py-4 sm:px-6 sm:py-6">
      <div className="mb-4 rounded-2xl bg-graphite px-5 py-5 shadow-e2">
        <div className="-ml-3.5 mb-1.5 flex items-center gap-2">
          <BackButton fallbackHref="/crm/settings" />
        </div>
        <h1 className="text-[22px] font-bold leading-tight tracking-tight text-white sm:text-[26px]">
          {name}&rsquo;s activity
        </h1>
        <p className="mt-1 text-[13px] text-on-dark-dim">
          {member.full_name || "Unnamed"} · {member.email || "No email on file"}
        </p>
      </div>

      <Card>
        <CardHead
          title="Activity log"
          hint={
            events.length ? `${events.length} event${events.length === 1 ? "" : "s"}` : undefined
          }
        />
        {events.length === 0 ? (
          <EmptyState
            icon={<IconContacts />}
            title="No activity yet"
            body="Logins and page views will show up here once this person starts using the CRM."
          />
        ) : (
          <div className="divide-y divide-line-strong">
            {groups.map((g) => (
              <div key={g.day}>
                <p className="bg-inset px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
                  {g.day}
                </p>
                <ul className="divide-y divide-line-strong">
                  {g.items.map((e) => (
                    <li
                      key={e.id}
                      className="flex items-center justify-between gap-3 px-5 py-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {e.kind === "login" ? (
                            <span className="rounded-full bg-ok-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ok">
                              Login
                            </span>
                          ) : (
                            <span className="rounded-full bg-steel-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-steel">
                              {e.kind === "action" ? "Action" : "Page"}
                            </span>
                          )}
                          <span className="truncate text-[13.5px] font-medium text-fg">
                            {e.label || "—"}
                          </span>
                        </div>
                        {e.path && (
                          <p className="mt-0.5 truncate font-mono text-[11.5px] text-fg-subtle">
                            {e.path}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 text-[12px] text-fg-subtle">
                        {formatDateTime(e.created_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
