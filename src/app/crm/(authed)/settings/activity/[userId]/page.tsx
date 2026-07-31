import { notFound, redirect } from "next/navigation";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { PageShell, Card, CardHead, EmptyState } from "../../../_shell/ui";
import { BackButton } from "../../../_shell/BackButton";
import { firstName } from "../../../_shell/format";
import { IconContacts } from "../../../_shell/icons";
import { ActivityLog, type ActivityEvent } from "./ActivityLog";

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
  // Handed to ActivityLog as plain, already-serializable data — day-grouping
  // and time formatting both happen client-side there, always against US
  // Central time (see LocalTime.tsx), regardless of viewer or server zone.
  const activityEvents: ActivityEvent[] = events.map((e) => ({
    id: e.id,
    kind: e.kind,
    label: e.label,
    path: e.path,
    createdAt: e.created_at,
  }));

  const name = firstName(member.full_name, member.email) || "This member";

  return (
    <PageShell back={<BackButton fallbackHref="/crm/settings" />}>
      <div>
        <h1 className="text-[20px] font-bold leading-tight tracking-tight text-fg">
          {name}&rsquo;s activity
        </h1>
        <p className="mt-1 text-[13px] text-fg-muted">
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
          <ActivityLog events={activityEvents} />
        )}
      </Card>
    </PageShell>
  );
}
