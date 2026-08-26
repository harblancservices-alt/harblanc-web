import Link from "next/link";
import { createCrmServerClient, type CrmUser } from "@/lib/crm/auth";
import { firstName } from "../_shell/format";
import { HeaderAddCompanyButton } from "../QuickActions";
import { getAgentDashboardData } from "./agent-data";
import { AgentDashboard } from "./AgentDashboard";
import { AgentViewPicker } from "./AgentViewPicker";

/**
 * The agent dashboard, wrapped for whichever route is rendering it.
 *
 * For an AGENT this is simply their /crm. Kept as its own server component
 * (rather than an inline branch inside page.tsx) so the owner dashboard's
 * ~15 org-wide queries are never even reached for them — the branch happens
 * before any of that work starts, not after it.
 *
 * For an OWNER it is reachable at /crm?view=agent (2026-08-25). Brent
 * approved this screen and then could not find it, because the role branch
 * sends him to the command centre instead. He gets the toggle rather than
 * the dashboard stacked underneath his own: the command centre is ~1500px of
 * Next Best Action queue, so anything below it is off the bottom of the
 * world — and more to the point Brent owns no companies and has no open
 * tasks, so his own agent view is two empty cards. Appending those would
 * have looked exactly like the bug he was reporting.
 *
 * `?as=<userId>` previews a specific person's view, owner-only and enforced
 * here. That is what makes the toggle useful to an admin whose own agent
 * view is empty — and it exposes nothing new: the same rows are already on
 * Admin -> Companies and Admin -> Tasks, which only an owner can open.
 */
export async function AgentHome({
  user,
  /** True when the viewer is an owner using the toggle rather than an agent
   * on their own home page — draws the view switcher and the preview banner. */
  isOwner = false,
  /** crm_profiles.id to preview, from `?as=`. Ignored for a non-owner. */
  viewAs = null,
}: {
  user: CrmUser;
  isOwner?: boolean;
  viewAs?: string | null;
}) {
  const supabase = await createCrmServerClient();

  // The roster powers the picker; it is also how `?as=` is validated. An id
  // that isn't an active member of the caller's own org is ignored outright
  // rather than half-honoured.
  const { data: profileRows } = isOwner
    ? await supabase
        .from("crm_profiles")
        .select("id, full_name, email")
        .eq("org_id", user.orgId)
        .eq("is_active", true)
        .order("full_name", { ascending: true })
    : { data: null };

  const people = (profileRows ?? []).map((p) => ({
    id: p.id as string,
    name: firstName(p.full_name as string | null, p.email as string | null) || "Unnamed",
  }));

  const target =
    isOwner && viewAs && people.some((p) => p.id === viewAs)
      ? people.find((p) => p.id === viewAs)!
      : null;

  const subject: CrmUser = target ? { ...user, id: target.id, fullName: target.name } : user;
  const previewing = target !== null && target.id !== user.id;

  const { tasks, companies, now } = await getAgentDashboardData(subject);

  return (
    <AgentDashboard
      name={target ? target.name : firstName(user.fullName, user.email) || "You"}
      tasks={tasks}
      companies={companies}
      now={now}
      // An owner previewing someone else must not be able to add a company
      // from inside that preview: createAccount stamps the CREATOR as owner,
      // so the button would silently file it under the wrong person.
      addCompanyButton={previewing ? null : <HeaderAddCompanyButton reps={[]} />}
      viewSwitch={
        isOwner ? (
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/crm"
              prefetch={false}
              className="rounded-md border border-accent bg-card px-2.5 py-1 text-[12px] font-semibold text-accent transition-colors hover:bg-accent-bg"
            >
              &larr; Command centre
            </Link>
            <AgentViewPicker people={people} selected={subject.id} />
          </div>
        ) : null
      }
      banner={
        previewing
          ? `Previewing ${target!.name}'s dashboard. Read-only — nothing here is yours.`
          : null
      }
    />
  );
}
